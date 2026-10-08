const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const invoiceController = require('./invoice.controller');

const router = express.Router();

const { requirePermission } = require('../../middleware/permission');
router.use(requireAuth);
router.use((req, res, next) => requirePermission('INVOICE_' + (req.method === 'GET' ? 'VIEW' : 'MANAGE'))(req, res, next));
router.get('/', invoiceController.list);
router.get('/notifications', invoiceController.notifications);
// Raise every rent-cycle invoice that has come due for this organization.
// POST because it writes; the router already demands INVOICE_MANAGE for it.
router.post('/generate-due', invoiceController.generateDue);
router.get('/:id', invoiceController.get);
router.post('/', invoiceController.create);
router.patch('/:id', invoiceController.update);
router.post('/:id/cancel', invoiceController.cancel);
router.delete('/:id', invoiceController.remove);

module.exports = router;
