const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./payment.controller');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.list);
router.get('/outstanding', controller.outstanding);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.post('/:id/void', controller.voidPayment);

module.exports = router;
