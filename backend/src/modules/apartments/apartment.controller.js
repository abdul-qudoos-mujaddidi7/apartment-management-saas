const { z } = require('zod');

const apartmentService = require('./apartment.service');
const {
  createApartmentSchema,
  listApartmentsSchema,
  updateApartmentSchema,
} = require('./apartment.validation');

function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_APARTMENT_DATA',
    message: 'Invalid apartment data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (['APARTMENT_NOT_FOUND', 'FLOOR_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error.code === 'APARTMENT_NUMBER_EXISTS') {
    return res.status(409).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  // A rent currency the workspace does not trade in is a bad field, not a crash.
  if (['INVALID_CURRENCY_CODE', 'CURRENCY_NOT_SUPPORTED'].includes(error.code)) {
    return res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
      errors: { rentCurrency: [error.message] },
    });
  }

  return next(error);
}

async function list(req, res, next) {
  try {
    const result = listApartmentsSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);

    const apartments = await apartmentService.listApartments(getOrganizationId(req), result.data);
    return res.status(200).json({ success: true, ...apartments });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function get(req, res, next) {
  try {
    const apartment = await apartmentService.getApartment(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, apartment });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createApartmentSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const apartment = await apartmentService.createApartment(getOrganizationId(req), result.data);
    return res.status(201).json({ success: true, apartment });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const result = updateApartmentSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const apartment = await apartmentService.updateApartment(getOrganizationId(req), req.params.id, result.data);
    return res.status(200).json({ success: true, apartment });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await apartmentService.softDeleteApartment(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, message: 'Apartment deleted successfully.' });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

module.exports = { create, get, list, remove, update };
