const { execFile, execFileSync } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const AppError = require('../../errors/AppError');

/**
 * HTML in, PDF out — using the browser that is already on the machine.
 *
 * A contract is not a data file. It is a ruled form with Persian type,
 * right-to-left text, boxes, rules and page breaks, and the only thing on this
 * machine that can lay that out correctly is a real layout engine. So the
 * document is written as a self-contained HTML file and handed to headless
 * Chrome (or Edge — the same engine), which prints it to PDF.
 *
 * Deliberately a system browser rather than a bundled one: no dependency is
 * added to the project, no 300 MB download, and the PDF comes out of the same
 * engine that would print the page from the browser menu — so "Download PDF"
 * and "Print" agree, including on fonts and page breaks.
 *
 * If no browser can be found the endpoint says so, plainly, rather than
 * returning a broken file. `CONTRACT_CHROME_PATH` points at one explicitly.
 */

const TIMEOUT_MS = Number(process.env.CONTRACT_PDF_TIMEOUT_MS || 30000);

const CHROME_FLAGS = [
  '--disable-gpu',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-sync',
  '--no-pdf-header-footer',
  '--virtual-time-budget=10000',
];

function windowsCandidates() {
  const programFiles = process.env['PROGRAMFILES'] || 'C:\\Program Files';
  const programFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA || '';

  return [
    process.env.CONTRACT_CHROME_PATH,
    path.join(programFiles, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFilesX86, 'Google/Chrome/Application/chrome.exe'),
    localAppData && path.join(localAppData, 'Google/Chrome/Application/chrome.exe'),
    path.join(programFiles, 'Microsoft/Edge/Application/msedge.exe'),
    path.join(programFilesX86, 'Microsoft/Edge/Application/msedge.exe'),
  ].filter(Boolean);
}

function macCandidates() {
  return [
    process.env.CONTRACT_CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ].filter(Boolean);
}

/** Chromium under a name on the PATH — Linux, and Homebrew on macOS. */
function onPath() {
  if (process.env.CONTRACT_CHROME_PATH) return process.env.CONTRACT_CHROME_PATH;

  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      const found = execFileSync('which', [name], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString()
        .trim();
      if (found) return found;
    } catch {
      // Not this one.
    }
  }

  return null;
}

function candidates() {
  if (process.platform === 'win32') return windowsCandidates();
  if (process.platform === 'darwin') return macCandidates();
  return [onPath()].filter(Boolean);
}

async function findBrowser() {
  for (const candidate of candidates()) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isFile()) return candidate;
    } catch {
      // Try the next one.
    }
  }

  throw new AppError(
    'No web browser is available to render the contract PDF. Install Chrome or Edge, or set CONTRACT_CHROME_PATH.',
    503,
    'CONTRACT_PDF_UNAVAILABLE',
  );
}

/** One attempt at printing, with the headless mode given. */
function printOnce(browser, { htmlPath, pdfPath, profileDirectory }, headlessMode) {
  return new Promise((resolve, reject) => {
    execFile(
      browser,
      [
        headlessMode,
        ...CHROME_FLAGS,
        `--user-data-dir=${profileDirectory}`,
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error) => {
        // Chrome reports success before the file is necessarily flushed, so the
        // caller checks for the file rather than trusting the exit code; a
        // non-zero exit with a PDF on disk is not a failure worth reporting.
        if (error) reject(error);
        else resolve();
      },
    );
  });
}

async function fileSize(file) {
  try {
    return (await fs.stat(file)).size;
  } catch {
    return 0;
  }
}

/**
 * Render one self-contained HTML document to a PDF buffer.
 *
 * Everything happens in a throwaway directory: the document, the browser
 * profile and the output, all removed afterwards. A contract is confidential,
 * so nothing is left behind on disk once it has been sent.
 */
async function renderPdf(html) {
  const browser = await findBrowser();
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lease-contract-'));
  const htmlPath = path.join(directory, 'contract.html');
  const pdfPath = path.join(directory, 'contract.pdf');
  const profileDirectory = path.join(directory, 'profile');

  try {
    await fs.writeFile(htmlPath, html, 'utf8');

    // `--headless=new` is the modern print path; an older build that does not
    // know the flag falls back to the classic headless mode.
    for (const mode of ['--headless=new', '--headless', '--headless=old']) {
      try {
        await printOnce(browser, { htmlPath, pdfPath, profileDirectory }, mode);
      } catch (error) {
        if (error.code === 'ENOENT') break;
        if (error.killed) {
          throw new AppError(
            'Rendering the contract timed out.',
            504,
            'CONTRACT_PDF_TIMEOUT',
          );
        }
      }

      if (await fileSize(pdfPath)) return fs.readFile(pdfPath);
    }

    throw new AppError(
      'The contract could not be rendered to PDF.',
      502,
      'CONTRACT_PDF_FAILED',
    );
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

module.exports = { renderPdf };
