const express = require('express');

const { requireAuth } = require('../auth/auth.middleware');
const controller = require('./meter-reading.controller');

const router = express.Router();

const { requirePermission } = require('../../middleware/permission');
router.use(requireAuth);
router.use((req, res, next) => requirePermission('UTILITY_' + (req.method === 'GET' ? 'VIEW' : 'MANAGE'))(req, res, next));
router.get('/report', async (req, res, next) => {
  try {
    const { meterReport, reportSchema } = require('./meter-report.service');
    const organizationId = req.user?.organizationId || req.user?.organizations?.[0]?.id;
    if (!organizationId) throw new (require('../../errors/AppError'))('Organization required.', 403, 'ORGANIZATION_REQUIRED');
    const result = reportSchema.safeParse(req.query);
    if (!result.success) return res.status(400).json({ success: false, code: 'INVALID_METER_REPORT_FILTERS', message: result.error.issues[0].message });
    const report = await meterReport(organizationId, result.data);
    res.json({ success: true, ...report });
  } catch (error) { next(error); }
});
router.get('/', controller.list);
router.get('/:id', controller.get);
router.post('/', controller.create);
router.patch('/:id', controller.update);
router.delete('/:id', controller.remove);

module.exports = router;
