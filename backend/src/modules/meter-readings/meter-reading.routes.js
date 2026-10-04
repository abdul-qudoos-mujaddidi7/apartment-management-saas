const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./meter-reading.controller');

const router = express.Router();

const { requirePermission } = require('../../middleware/permission');
router.use(requireAuth);
router.use((req, res, next) => requirePermission('UTILITY_' + (req.method === 'GET' ? 'VIEW' : 'MANAGE'))(req, res, next));
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
