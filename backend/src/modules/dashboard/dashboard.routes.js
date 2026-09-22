const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const dashboardController = require('./dashboard.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', dashboardController.summary);

module.exports = router;
