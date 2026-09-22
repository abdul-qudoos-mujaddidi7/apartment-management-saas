const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./apartment-asset.controller');
const {
  apartmentAssetRecordParamsSchema,
  listApartmentAssetsSchema,
  updateApartmentAssetSchema,
} = require('./apartment-asset.validation');

const router = express.Router();

router.use(requireAuth);

// Every apartment asset record in the authenticated organization, filterable by
// building / floor / apartment / category / asset / condition.
router.get('/', validate({ query: listApartmentAssetsSchema }), asyncHandler(controller.listRecords));

router.get(
  '/:id',
  validate({ params: apartmentAssetRecordParamsSchema }),
  asyncHandler(controller.getRecord),
);

router.put(
  '/:id',
  validate({ params: apartmentAssetRecordParamsSchema, body: updateApartmentAssetSchema }),
  asyncHandler(controller.updateRecord),
);

router.delete(
  '/:id',
  validate({ params: apartmentAssetRecordParamsSchema }),
  asyncHandler(controller.removeRecord),
);

module.exports = router;
