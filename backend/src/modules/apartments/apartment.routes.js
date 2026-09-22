const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const apartmentController = require('./apartment.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', apartmentController.list);
router.get('/:id', apartmentController.get);
router.post('/', apartmentController.create);
router.put('/:id', apartmentController.update);
router.delete('/:id', apartmentController.remove);

module.exports = router;
