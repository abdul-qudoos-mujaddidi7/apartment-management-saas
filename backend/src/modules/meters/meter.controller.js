const { z } = require('zod');

const meterService = require('./meter.service');
const {
  createMeterSchema,
  listMetersSchema,
  updateMeterSchema,
} = require('./meter.validation');

// Never read the organization from the request body or query: it is always the
// organization the authenticated user belongs to.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_METER_DATA',
    message: 'Invalid meter data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (['METER_NOT_FOUND', 'APARTMENT_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error.code === 'METER_NUMBER_EXISTS') {
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
    const result = listMetersSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);

    const meters = await meterService.listMeters(getOrganizationId(req), result.data);
    return res.status(200).json({ success: true, ...meters });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function get(req, res, next) {
  try {
    const meter = await meterService.getMeter(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, meter });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createMeterSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const meter = await meterService.createMeter(getOrganizationId(req), result.data);
    return res.status(201).json({ success: true, meter });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const result = updateMeterSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const meter = await meterService.updateMeter(getOrganizationId(req), req.params.id, result.data);
    return res.status(200).json({ success: true, meter });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await meterService.softDeleteMeter(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, message: 'Meter deleted successfully.' });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

module.exports = { create, get, list, remove, update };
