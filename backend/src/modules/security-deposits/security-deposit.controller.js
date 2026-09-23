const { z } = require('zod');
const service = require('./security-deposit.service');
const {
  createTransactionSchema,
  voidTransactionSchema,
  listSecurityDepositsSchema,
} = require('./security-deposit.validation');

function getOrganizationId(req) {
  return (
    req.organizationId ||
    req.user?.organizationId ||
    req.user?.organization?.id ||
    req.user?.organizations?.[0]?.id
  );
}

function invalid(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_SECURITY_DEPOSIT_DATA',
    message: 'Invalid security deposit data.',
    errors: result.error.flatten().fieldErrors,
  });
}

function handle(error, res, next) {
  if (['LEASE_NOT_FOUND', 'TRANSACTION_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  // A bad field rather than a conflict: the form can put it on the input.
  if (['DEPOSIT_ACCOUNT_NOT_FOUND', 'DEPOSIT_ACCOUNT_NOT_ASSET', 'DEDUCTION_REASON_REQUIRED'].includes(error.code)) {
    const field = error.code === 'DEDUCTION_REASON_REQUIRED' ? 'reason' : 'accountId';
    return res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
      errors: { [field]: [error.message] },
    });
  }

  if (
    [
      'DEPOSIT_OVERPAYMENT',
      'REFUND_EXCEEDS_BALANCE',
      'DEDUCTION_EXCEEDS_BALANCE',
      'DEPOSIT_ALREADY_USED',
      'TRANSACTION_ALREADY_VOIDED',
      'EXCHANGE_RATE_MISSING',
      // Rent arrears settled from a deposit cannot exceed what the tenant owes.
      'TENANT_BALANCE_NEGATIVE',
    ].includes(error.code)
  ) {
    return res.status(409).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  return next(error);
}

async function list(req, res, next) {
  try {
    const result = listSecurityDepositsSchema.safeParse(req.query);
    if (!result.success) return invalid(res, result);

    const data = await service.list(getOrganizationId(req), result.data);
    return res.json({ success: true, ...data });
  } catch (error) {
    return handle(error, res, next);
  }
}

async function details(req, res, next) {
  try {
    const data = await service.details(getOrganizationId(req), req.params.leaseId);
    return res.json({ success: true, ...data });
  } catch (error) {
    return handle(error, res, next);
  }
}

async function transactions(req, res, next) {
  try {
    const data = await service.details(getOrganizationId(req), req.params.leaseId);
    return res.json({ success: true, transactions: data.transactions });
  } catch (error) {
    return handle(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createTransactionSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const transaction = await service.create(
      getOrganizationId(req),
      req.params.leaseId,
      result.data,
    );

    return res.status(201).json({ success: true, transaction });
  } catch (error) {
    return handle(error, res, next);
  }
}

async function voidTx(req, res, next) {
  try {
    const result = voidTransactionSchema.safeParse(req.body);
    if (!result.success) return invalid(res, result);

    const transaction = await service.voidTransaction(
      getOrganizationId(req),
      req.params.transactionId,
      result.data.voidReason,
    );

    return res.json({ success: true, transaction });
  } catch (error) {
    return handle(error, res, next);
  }
}

module.exports = {
  list,
  details,
  transactions,
  create,
  voidTx,
};
