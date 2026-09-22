const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./apartment-asset.controller');
const {
  apartmentAssetParamsSchema,
  apartmentParamsSchema,
  completeApartmentAssetsSchema,
  saveApartmentAssetsSchema,
  updateApartmentAssetSchema,
} = require('./apartment-asset.validation');

// mergeParams exposes the :apartmentId segment of the mount path to the routes
// below, so the apartment id is always read from the URL — never from the body.
const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get(
  '/',
  validate({ params: apartmentParamsSchema }),
  asyncHandler(controller.listForApartment),
);

// Atomic bulk save: rows with an id are updated, new rows are created, and rows
// missing from the payload are soft deleted.
router.post(
  '/',
  validate({ params: apartmentParamsSchema, body: saveApartmentAssetsSchema }),
  asyncHandler(controller.saveForApartment),
);

// "Complete with no assets" / re-open the apartment's asset registration.
router.post(
  '/complete',
  validate({ params: apartmentParamsSchema, body: completeApartmentAssetsSchema }),
  asyncHandler(controller.completeForApartment),
);

// Read-only lookahead used by "Skip for now".
router.get(
  '/next',
  validate({ params: apartmentParamsSchema }),
  asyncHandler(controller.nextApartment),
);

router.put(
  '/:id',
  validate({ params: apartmentAssetParamsSchema, body: updateApartmentAssetSchema }),
  asyncHandler(controller.updateForApartment),
);

router.delete(
  '/:id',
  validate({ params: apartmentAssetParamsSchema }),
  asyncHandler(controller.removeForApartment),
);

module.exports = router;
