const express = require('express');

const authController = require('./auth.controller');
const { authRateLimit, requireAuth } = require('./auth.middleware');

const router = express.Router();

router.post('/register', authRateLimit, authController.register);
router.post('/login', authRateLimit, authController.login);
router.post('/logout', authController.logout);
router.get('/me', requireAuth, authController.me);
// The signed-in user's own record: their display name and their password. Both
// act on the session's account, so no id is ever read from the request.
router.patch('/me', requireAuth, authController.updateProfile);
router.post('/change-password', requireAuth, authController.changePassword);

module.exports = router;
