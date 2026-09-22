const { z } = require('zod');

const floorService = require('./floor.service');
const { createFloorSchema, listFloorsSchema, updateFloorSchema } = require('./floor.validation');

function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

function validationError(res, result) {
  return res.status(400).json({
    success: false,
    code: 'INVALID_FLOOR_DATA',
    message: 'Invalid floor data.',
    errors: z.flattenError(result.error).fieldErrors,
  });
}

function handleServiceError(error, res, next) {
  if (['FLOOR_NOT_FOUND', 'BUILDING_NOT_FOUND'].includes(error.code)) {
    return res.status(404).json({
      success: false,
      code: error.code,
      message: error.message,
    });
  }

  if (error.code === 'FLOOR_NUMBER_EXISTS') {
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
    const result = listFloorsSchema.safeParse(req.query);
    if (!result.success) return validationError(res, result);

    const floors = await floorService.listFloors(getOrganizationId(req), result.data);
    return res.status(200).json({ success: true, ...floors });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function get(req, res, next) {
  try {
    const floor = await floorService.getFloor(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, floor });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function create(req, res, next) {
  try {
    const result = createFloorSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const floor = await floorService.createFloor(getOrganizationId(req), result.data);
    return res.status(201).json({ success: true, floor });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function update(req, res, next) {
  try {
    const result = updateFloorSchema.safeParse(req.body);
    if (!result.success) return validationError(res, result);

    const floor = await floorService.updateFloor(getOrganizationId(req), req.params.id, result.data);
    return res.status(200).json({ success: true, floor });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

async function remove(req, res, next) {
  try {
    await floorService.softDeleteFloor(getOrganizationId(req), req.params.id);
    return res.status(200).json({ success: true, message: 'Floor deleted successfully.' });
  } catch (error) {
    return handleServiceError(error, res, next);
  }
}

module.exports = { create, get, list, remove, update };
