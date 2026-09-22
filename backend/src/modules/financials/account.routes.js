const express = require('express');
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./account.controller');
const router = express.Router();
router.use(requireAuth);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.get('/:id/ledger', controller.ledger);
module.exports = router;
