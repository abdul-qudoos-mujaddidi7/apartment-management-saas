const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../auth/auth.middleware');
const leaseContractController = require('./lease-contract.controller');
const {
  clauseIdParamsSchema,
  clauseOrderSchema,
  contractPdfSchema,
  createClauseSchema,
  leaseParamsSchema,
  updateClauseSchema,
  updateContractSettingsSchema,
} = require('./lease-contract.validation');

const router = express.Router();

// Every route here is behind the same authentication as the rest of the API,
// and every service call is scoped to the authenticated user's organization.
router.use(requireAuth);

router.get('/settings', asyncHandler(leaseContractController.getSettings));
router.put(
  '/settings',
  validate({ body: updateContractSettingsSchema }),
  asyncHandler(leaseContractController.updateSettings),
);

router.get('/clauses', asyncHandler(leaseContractController.listClauses));
router.post(
  '/clauses',
  validate({ body: createClauseSchema }),
  asyncHandler(leaseContractController.createClause),
);

// Declared before `/clauses/:id`: "order" is a path of its own, not a clause id.
router.put(
  '/clauses/order',
  validate({ body: clauseOrderSchema }),
  asyncHandler(leaseContractController.reorderClauses),
);

router.put(
  '/clauses/:id',
  validate({ params: clauseIdParamsSchema, body: updateClauseSchema }),
  asyncHandler(leaseContractController.updateClause),
);

router.delete(
  '/clauses/:id',
  validate({ params: clauseIdParamsSchema }),
  asyncHandler(leaseContractController.deleteClause),
);

// The whole contract for one lease: tenant, apartment, building, floor, lease
// terms, the organization's wording, and the clauses with their placeholders
// already resolved.
router.get(
  '/leases/:leaseId',
  validate({ params: leaseParamsSchema }),
  asyncHandler(leaseContractController.getContract),
);

// The same contract as a PDF. A POST because the document's wording travels
// with it: the API keeps no translation table of its own, so the browser sends
// the labels it is already displaying.
router.post(
  '/leases/:leaseId/pdf',
  validate({ params: leaseParamsSchema, body: contractPdfSchema }),
  asyncHandler(leaseContractController.getContractPdf),
);

module.exports = router;
