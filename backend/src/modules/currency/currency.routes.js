const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const currencyController = require('./currency.controller');

const router = express.Router();

/*
 * The catalogue is public, and it is the only thing here that is.
 *
 * It is reference data — currency codes with the name and symbol to fill in,
 * read from the currency API or from the bundled list when that is unreachable.
 * It holds nothing about any organization, and signup needs it *before* there is
 * a session: the reporting currency is chosen while the workspace is being
 * created. Everything below it requires a session.
 */
router.get('/catalogue', currencyController.catalogue);

router.use(requireAuth);

// Static paths come before `/:id` so `base`, `rate` and `convert` are never
// mistaken for a currency id.
router.get('/rate', currencyController.rate);
router.get('/convert', currencyController.convertAmount);
router.post('/base', currencyController.setBase);

router.get('/', currencyController.list);
router.post('/', currencyController.create);
router.patch('/:id', currencyController.update);
router.post('/:id/rates', currencyController.addRate);
router.delete('/:id', currencyController.remove);

module.exports = router;
