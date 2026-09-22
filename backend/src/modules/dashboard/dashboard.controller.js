const service = require('./dashboard.service');

const organizationId = (req) => req.user.organizationId;

async function summary(req, res, next) {
  try {
    return res.json({ success: true, dashboard: await service.getDashboard(organizationId(req)) });
  } catch (error) {
    return next(error);
  }
}

module.exports = { summary };
