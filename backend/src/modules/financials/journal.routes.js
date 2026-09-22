const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./journal.controller');

const router = express.Router();
router.use(requireAuth);
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.post('/:id/void', controller.voidEntry);

module.exports = router;
