const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const floorController = require('./floor.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', floorController.list);
router.get('/:id', floorController.get);
router.post('/', floorController.create);
router.put('/:id', floorController.update);
router.delete('/:id', floorController.remove);

module.exports = router;
