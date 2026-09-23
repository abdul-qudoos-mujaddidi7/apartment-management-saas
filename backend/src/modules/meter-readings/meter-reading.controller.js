const { z } = require('zod');

const service = require('./meter-reading.service');
const { createMeterReadingSchema, listMeterReadingsSchema, updateMeterReadingSchema } = require('./meter-reading.validation');

function organizationId(req) {
  return req.user?.organizationId || req.user?.organizations?.[0]?.id;
}

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_METER_READING_DATA',
    message: 'Invalid meter reading data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleError(error, res, next) {
  if (['METER_NOT_FOUND', 'METER_READING_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({ success: false, code: error.code, message: error.message });
  }
  if (['METER_READING_DATE_EXISTS', 'METER_READING_MONTH_EXISTS', 'CURRENT_READING_TOO_LOW', 'METER_READING_ALREADY_BILLED'].includes(error.code)) {
    return res.status(409).json({ success: false, code: error.code, message: error.message });
  }
  return next(error);
}

async function list(req, res, next) {
  try {
    const result = listMeterReadingsSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, ...(await service.listMeterReadings(organizationId(req), result.data)) });
  } catch (error) { return handleError(error, res, next); }
}

async function get(req, res, next) {
  try { return res.status(200).json({ success: true, meterReading: await service.getMeterReading(organizationId(req), req.params.id) }); }
  catch (error) { return handleError(error, res, next); }
}

async function create(req, res, next) {
  try {
    const result = createMeterReadingSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(201).json({ success: true, meterReading: await service.createMeterReading(organizationId(req), result.data) });
  } catch (error) { return handleError(error, res, next); }
}

async function update(req, res, next) {
  try {
    const result = updateMeterReadingSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);
    return res.status(200).json({ success: true, meterReading: await service.updateMeterReading(organizationId(req), req.params.id, result.data) });
  } catch (error) { return handleError(error, res, next); }
}

async function remove(req, res, next) {
  try {
    await service.softDeleteMeterReading(organizationId(req), req.params.id);
    return res.status(200).json({ success: true, message: 'Meter reading deleted successfully.' });
  } catch (error) { return handleError(error, res, next); }
}

module.exports = { create, get, list, remove, update };
