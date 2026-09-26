const AppError = require('../../errors/AppError');
const { buildDocument } = require('./lease-contract.document');
const { renderPdf } = require('./lease-contract.pdf');
const leaseContractService = require('./lease-contract.service');

/**
 * organizationId is derived exclusively from the authenticated session. Nothing
 * in a contract request body is ever trusted for it.
 */
function getOrganizationId(req) {
  const organizationId = req.user?.organizations?.[0]?.id;
  if (!organizationId) throw new AppError('Invalid organization.', 401, 'INVALID_ORGANIZATION');
  return organizationId;
}

async function getSettings(req, res) {
  const payload = await leaseContractService.getSettings(getOrganizationId(req));
  return res.status(200).json({ success: true, ...payload });
}

async function updateSettings(req, res) {
  const settings = await leaseContractService.updateSettings(
    getOrganizationId(req),
    req.validated.body,
  );

  return res.status(200).json({ success: true, settings });
}

async function listClauses(req, res) {
  const clauses = await leaseContractService.listClauses(getOrganizationId(req));
  return res.status(200).json({ success: true, clauses });
}

async function createClause(req, res) {
  const payload = await leaseContractService.createClause(getOrganizationId(req), req.validated.body);
  return res.status(201).json({ success: true, ...payload });
}

async function updateClause(req, res) {
  const payload = await leaseContractService.updateClause(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, ...payload });
}

async function deleteClause(req, res) {
  await leaseContractService.deleteClause(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, message: 'Clause deleted successfully.' });
}

async function reorderClauses(req, res) {
  const clauses = await leaseContractService.reorderClauses(
    getOrganizationId(req),
    req.validated.body.order,
  );

  return res.status(200).json({ success: true, clauses });
}

/**
 * One lease's contract. The lease is looked up under the authenticated
 * organization and while every record it depends on is still live, so another
 * organization's lease — or one whose tenant has been deleted — answers 404.
 */
async function getContract(req, res) {
  const contract = await leaseContractService.getContract(
    getOrganizationId(req),
    req.validated.params.leaseId,
  );

  return res.status(200).json({ success: true, contract });
}

/**
 * The same contract as a PDF file.
 *
 * The reading, the authorization and the placeholder resolution are the ones
 * above — this only chooses how the answer is drawn. The document is rendered by
 * a headless browser from a self-contained HTML file, so what is downloaded is
 * what the preview showed: same data, same stylesheet, same page breaks.
 */
async function getContractPdf(req, res) {
  const organizationId = getOrganizationId(req);
  const { leaseId } = req.validated.params;
  const { language, disposition, labels } = req.validated.body;

  const contract = await leaseContractService.getContract(organizationId, leaseId);
  const html = buildDocument({
    contract,
    language: language || contract.language,
    labels,
  });

  const pdf = await renderPdf(html);

  // The file is drawn from one lease and is nobody else's, but it is fetched
  // from the frontend's own origin and previewed in a tab, so — exactly like an
  // uploaded document — it is allowed to be read cross-origin.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Length', pdf.length);
  res.setHeader(
    'Content-Disposition',
    `${disposition}; filename="contract-${safeFilename(contract.lease.contractNumberLabel)}.pdf"`,
  );
  // A contract is not a cacheable asset: it is generated from records that can
  // change a minute later.
  res.setHeader('Cache-Control', 'no-store');

  return res.status(200).send(pdf);
}

/** A contract number is not a filename until it is stripped of path characters. */
function safeFilename(value) {
  return String(value || 'contract')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'contract';
}

module.exports = {
  createClause,
  deleteClause,
  getContract,
  getContractPdf,
  getSettings,
  listClauses,
  reorderClauses,
  updateClause,
  updateSettings,
};
