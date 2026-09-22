const { z } = require('zod');

const service = require('./journal.service');
const {
  createJournalSchema,
  listJournalsSchema,
  updateJournalSchema,
  voidJournalSchema,
} = require('./journal.validation');

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_JOURNAL_DATA',
    message: 'Invalid journal data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (error.code === 'JOURNAL_NOT_FOUND') {
    return res.status(404).json({ success: false, code: error.code, message: error.message });
  }
  if (['JOURNAL_NOT_MANUAL', 'JOURNAL_VOIDED', 'JOURNAL_ALREADY_VOIDED'].includes(error.code)) {
    return res.status(409).json({ success: false, code: error.code, message: error.message });
  }
  if (['INVALID_JOURNAL', 'INVALID_JOURNAL_LINE', 'UNBALANCED_JOURNAL'].includes(error.code)) {
    return res.status(400).json({ success: false, code: error.code, message: error.message });
  }
  return next(error);
}

const organizationId = (req) => req.user.organizationId;

async function list(req, res, next) {
  try {
    const result = listJournalsSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, ...(await service.listJournals(organizationId(req), result.data)) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function get(req, res, next) {
  try {
    return res.status(200).json({ success: true, journal: await service.getJournalEntry(organizationId(req), req.params.id) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function create(req, res, next) {
  try {
    const result = createJournalSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(201).json({ success: true, journal: await service.createManualJournal(organizationId(req), result.data) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function update(req, res, next) {
  try {
    const result = updateJournalSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, journal: await service.updateManualJournal(organizationId(req), req.params.id, result.data) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function voidEntry(req, res, next) {
  try {
    const result = voidJournalSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, journal: await service.voidManualJournal(organizationId(req), req.params.id, result.data.voidReason) });
  } catch (error) { return handleServiceError(error, res, next); }
}

module.exports = { create, get, list, update, voidEntry };
