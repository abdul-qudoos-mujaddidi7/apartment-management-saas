const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const currencyController = require('./currency.controller');

const router = express.Router();

router.use(requireAuth);

// Static paths come before `/:id` so `catalogue`, `base`, `rate` and `convert`
// are never mistaken for a currency id.
router.get('/catalogue', currencyController.catalogue);
router.get('/rate', currencyController.rate);
router.get('/convert', currencyController.convertAmount);
router.post('/base', currencyController.setBase);

router.get('/', currencyController.list);
router.post('/', currencyController.create);
router.patch('/:id', currencyController.update);
router.post('/:id/rates', currencyController.addRate);
router.delete('/:id', currencyController.remove);

module.exports = router;
