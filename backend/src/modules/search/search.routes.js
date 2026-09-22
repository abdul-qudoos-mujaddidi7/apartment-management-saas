const express = require('express');

const asyncHandler = require('../../middleware/asyncHandler');
const { requireAuth } = require('../auth/auth.middleware');
const searchController = require('./search.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(searchController.search));

module.exports = router;
