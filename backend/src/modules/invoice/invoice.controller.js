const { z } = require('zod');

const invoiceService = require('./invoice.service');
const {
  createInvoiceSchema,
  listInvoicesSchema,
  updateInvoiceSchema,
} = require('./invoice.validation');

function getOrganizationId(req) {
  return req.user.organizationId;
}

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_INVOICE_DATA',
    message: 'Invalid invoice data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (['INVOICE_NOT_FOUND', 'LEASE_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({ success: false, code: error.code, message: error.message });
  }

  if (['INVOICE_CANCELLED', 'INVOICE_HAS_PAYMENTS', 'INVOICE_HAS_METER_READINGS', 'METER_READING_NOT_AVAILABLE', 'METER_READING_PRICE_REQUIRED'].includes(error.code)) {
    return res.status(409).json({ success: false, code: error.code, message: error.message });
  }

  if (['INVALID_INVOICE_DATES', 'METER_READING_TYPE_MISMATCH'].includes(error.code)) {
    return res.status(400).json({ success: false, code: error.code, message: error.message });
  }

  return next(error);
}

async function list(req, res, next) {
  try {
    const result = listInvoicesSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);

    const invoices = await invoiceService.listInvoices(getOrganizationId(req), result.data);
    return res.status(200).json({ success: true, ...invoices });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function get(req, res, next) {
  try {
    const invoice = await invoiceService.getInvoice(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createInvoiceSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const invoice = await invoiceService.createInvoice(getOrganizationId(req), result.data);
    return res.status(201).json({ success: true, invoice });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const result = updateInvoiceSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const invoice = await invoiceService.updateInvoice(getOrganizationId(req), req.params.id, result.data);
    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function cancel(req, res, next) {
  try {
    const invoice = await invoiceService.cancelInvoice(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, invoice });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await invoiceService.softDeleteInvoice(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, message: 'Invoice deleted successfully.' });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

module.exports = { cancel, create, get, list, remove, update };
