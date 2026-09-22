const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const buildingController = require('./building.controller');
const {
  buildingIdParamsSchema,
  buildingListQuerySchema,
  createBuildingSchema,
  updateBuildingSchema,
} = require('./building.validation');

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: buildingListQuerySchema }),
  asyncHandler(buildingController.list),
);

router.get(
  '/:id',
  validate({ params: buildingIdParamsSchema }),
  asyncHandler(buildingController.get),
);

router.post(
  '/',
  validate({ body: createBuildingSchema }),
  asyncHandler(buildingController.create),
);

router.patch(
  '/:id',
  validate({ params: buildingIdParamsSchema, body: updateBuildingSchema }),
  asyncHandler(buildingController.update),
);

router.delete(
  '/:id',
  validate({ params: buildingIdParamsSchema }),
  asyncHandler(buildingController.remove),
);

module.exports = router;
