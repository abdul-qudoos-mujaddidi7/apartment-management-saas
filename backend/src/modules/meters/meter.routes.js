const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const meterController = require('./meter.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', meterController.list);
router.get('/:id', meterController.get);
router.post('/', meterController.create);
router.patch('/:id', meterController.update);
router.delete('/:id', meterController.remove);

module.exports = router;
