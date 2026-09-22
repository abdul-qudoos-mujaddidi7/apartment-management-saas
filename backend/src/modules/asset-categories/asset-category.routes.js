const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./asset-category.controller');
const {
  assetCategoryParamsSchema,
  createAssetCategorySchema,
  listAssetCategoriesSchema,
  updateAssetCategorySchema,
} = require('./asset-category.validation');

const router = express.Router();

router.use(requireAuth);

router.get('/', validate({ query: listAssetCategoriesSchema }), asyncHandler(controller.list));

router.post('/', validate({ body: createAssetCategorySchema }), asyncHandler(controller.create));

router.get('/:id', validate({ params: assetCategoryParamsSchema }), asyncHandler(controller.get));

router.put(
  '/:id',
  validate({ params: assetCategoryParamsSchema, body: updateAssetCategorySchema }),
  asyncHandler(controller.update),
);

router.delete('/:id', validate({ params: assetCategoryParamsSchema }), asyncHandler(controller.remove));

module.exports = router;
