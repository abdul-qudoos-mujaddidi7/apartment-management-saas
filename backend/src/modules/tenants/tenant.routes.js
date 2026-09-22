const express = require('express');
const { z } = require('zod');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const tenantController = require('./tenant.controller');
const {
  createTenantSchema,
  listTenantsSchema,
  updateTenantSchema,
} = require('./tenant.validation');

const tenantIdParamsSchema = z.object({
  id: z.string().trim().min(1),
});

const router = express.Router();

router.use(requireAuth);

router.get(
  '/',
  validate({ query: listTenantsSchema }),
  asyncHandler(tenantController.list),
);

router.get(
  '/:id',
  validate({ params: tenantIdParamsSchema }),
  asyncHandler(tenantController.get),
);

router.post(
  '/',
  validate({ body: createTenantSchema }),
  asyncHandler(tenantController.create),
);

router.put(
  '/:id',
  validate({ params: tenantIdParamsSchema, body: updateTenantSchema }),
  asyncHandler(tenantController.update),
);

router.delete(
  '/:id',
  validate({ params: tenantIdParamsSchema }),
  asyncHandler(tenantController.remove),
);

module.exports = router;
