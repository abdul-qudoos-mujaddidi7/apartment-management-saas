import documentStyles from '../styles/document-print.css?inline';
// Print an isolated DOM copy: application chrome and contract print rules never
// enter this document. Text is cloned, rather than interpolated into HTML.
export async function preparePrintDocument(source, { title, language }) {
  const frame = document.createElement('iframe');
  frame.title = title;
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0';
  document.body.appendChild(frame);
  try {
    const doc = frame.contentDocument;
    doc.title = title;
    doc.documentElement.lang = language;
    doc.documentElement.dir = language === 'en' ? 'ltr' : 'rtl';
    const style = doc.createElement('style');
    style.textContent = documentStyles;
    doc.head.appendChild(style);
    const fonts = doc.createElement('link');
    fonts.rel = 'stylesheet'; fonts.href = new URL('/fonts/vazirmatn/print.css', location.origin).href;
    const loaded = new Promise((resolve, reject) => { fonts.onload = resolve; fonts.onerror = () => reject(new Error('Print fonts could not load')); });
    doc.head.appendChild(fonts);
    doc.body.appendChild(source.cloneNode(true));
    await loaded;
    await doc.fonts.ready;
    await new Promise(resolve => frame.contentWindow.requestAnimationFrame(() => frame.contentWindow.requestAnimationFrame(resolve)));
    return frame;
  } catch (error) { frame.remove(); throw error; }
}

export async function printDocument(source, options) {
  const frame = await preparePrintDocument(source, options);
  const cleanup = () => frame.remove();
  frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
  // Browsers without afterprint still release the temporary document.
  setTimeout(cleanup, 300000);
  try { frame.contentWindow.focus(); frame.contentWindow.print(); }
  catch (error) { cleanup(); throw error; }
}
