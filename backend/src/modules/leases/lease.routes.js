const router = require('express').Router();
const { requireAuth } = require('../auth/auth.middleware');
const { requirePermission } = require('../../middleware/permission');
const controller = require('./lease.controller');
const { expiringLeases } = require('./lease-reminders');

router.use(requireAuth);
router.use((req, res, next) => requirePermission(`LEASE_${['GET', 'HEAD'].includes(req.method) ? 'VIEW' : 'MANAGE'}`)(req, res, next));
router.get('/expiring-soon', async (req, res, next) => {
  try { res.json({ success: true, items: await expiringLeases(req.user.organizationId) }); }
  catch (error) { next(error); }
});
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.delete('/:id', controller.remove);
module.exports = router;
