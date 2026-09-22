const router = require('express').Router();
const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./security-deposit.controller');

router.use(requireAuth);

router.get('/', controller.list);
router.get('/:leaseId/transactions', controller.transactions);
router.get('/:leaseId', controller.details);
router.post('/:leaseId/transactions', controller.create);
router.post('/transactions/:transactionId/void', controller.voidTx);

module.exports = router;
