const express = require('express');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./tenant-account.controller');
const router = express.Router();
router.use(requireAuth);
router.get('/', controller.list);
router.get('/:tenantId', controller.get);
router.get('/:tenantId/ledger', controller.ledger);
module.exports = router;
