const { z } = require('zod');

const service = require('./payment.service');
const { createPaymentSchema, listPaymentsSchema, outstandingInvoicesSchema, voidPaymentSchema } = require('./payment.validation');

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_PAYMENT_DATA',
    message: 'Invalid payment data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (['PAYMENT_NOT_FOUND', 'TENANT_NOT_FOUND', 'LEASE_NOT_FOUND', 'INVOICE_NOT_FOUND', 'RECEIVE_ACCOUNT_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({ success: false, code: error.code, message: error.message });
  }
  if (['PAYMENT_ALREADY_VOIDED', 'ALLOCATION_EXCEEDS_BALANCE', 'ALLOCATION_EXCEEDS_PAYMENT', 'DUPLICATE_ALLOCATION'].includes(error.code)) {
    return res.status(409).json({ success: false, code: error.code, message: error.message });
  }
  if (['INVALID_ALLOCATION', 'INVALID_JOURNAL', 'INVALID_JOURNAL_LINE', 'UNBALANCED_JOURNAL'].includes(error.code)) {
    return res.status(400).json({ success: false, code: error.code, message: error.message });
  }
  return next(error);
}

const organizationId = (req) => req.user.organizationId;

async function list(req, res, next) {
  try {
    const result = listPaymentsSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, ...(await service.listPayments(organizationId(req), result.data)) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function outstanding(req, res, next) {
  try {
    const result = outstandingInvoicesSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);
    const invoices = await service.outstanding(organizationId(req), result.data.tenantId, result.data.leaseId);
    return res.status(200).json({ success: true, items: invoices });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function get(req, res, next) {
  try { return res.status(200).json({ success: true, payment: await service.getPayment(organizationId(req), req.params.id) }); }
  catch (error) { return handleServiceError(error, res, next); }
}

async function create(req, res, next) {
  try {
    const result = createPaymentSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(201).json({ success: true, payment: await service.createPayment(organizationId(req), result.data) });
  } catch (error) { return handleServiceError(error, res, next); }
}

async function voidPayment(req, res, next) {
  try {
    const result = voidPaymentSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, payment: await service.voidPayment(organizationId(req), req.params.id, result.data.voidReason) });
  } catch (error) { return handleServiceError(error, res, next); }
}

module.exports = { create, get, list, outstanding, voidPayment };
