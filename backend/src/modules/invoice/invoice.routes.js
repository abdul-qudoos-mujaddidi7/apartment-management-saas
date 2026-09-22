const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const invoiceController = require('./invoice.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', invoiceController.list);
router.get('/:id', invoiceController.get);
router.post('/', invoiceController.create);
router.patch('/:id', invoiceController.update);
router.post('/:id/cancel', invoiceController.cancel);
router.delete('/:id', invoiceController.remove);

module.exports = router;
