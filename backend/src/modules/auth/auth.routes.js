const express = require('express');

const authController = require('./auth.controller');
const { authRateLimit, requireAuth } = require('./auth.middleware');

const router = express.Router();

router.post('/register', authRateLimit, authController.register);
router.post('/login', authRateLimit, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);

module.exports = router;
