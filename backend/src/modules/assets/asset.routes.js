const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./asset.controller');
const {
  assetParamsSchema,
  createAssetSchema,
  listAssetsSchema,
  updateAssetSchema,
} = require('./asset.validation');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listAssetsSchema }), asyncHandler(controller.list));

router.post('/', validate({ body: createAssetSchema }), asyncHandler(controller.create));

router.get('/:id', validate({ params: assetParamsSchema }), asyncHandler(controller.get));

router.put(
  '/:id',
  validate({ params: assetParamsSchema, body: updateAssetSchema }),
  asyncHandler(controller.update),
);

router.delete('/:id', validate({ params: assetParamsSchema }), asyncHandler(controller.remove));

module.exports = router;
