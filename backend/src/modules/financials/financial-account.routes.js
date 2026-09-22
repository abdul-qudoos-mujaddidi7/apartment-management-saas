const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./financial-account.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', controller.list);

module.exports = router;
