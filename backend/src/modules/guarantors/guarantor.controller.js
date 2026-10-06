const service = require('./guarantor.service');
const { hasPermission } = require('../../middleware/permission');
const org = req => req.user.organizationId || req.user.organizations?.[0]?.id;
async function list(req, res) { res.json({ success: true, ...await service.listGuarantors(org(req), req.validated.query) }); }
async function get(req, res) { res.json({ success: true, guarantor: await service.getGuarantor(org(req), req.validated.params.id) }); }
async function profile(req, res) {
  const canViewLeases = await hasPermission(req.user, 'LEASE_VIEW');
  res.json({ success: true, ...await service.getGuarantorProfile(org(req), req.validated.params.id, req.validated.query, canViewLeases) });
}
async function create(req, res) { res.status(201).json({ success: true, guarantor: await service.createGuarantor(org(req), req.validated.body) }); }
async function update(req, res) { res.json({ success: true, guarantor: await service.updateGuarantor(org(req), req.validated.params.id, req.validated.body) }); }
async function remove(req, res) { await service.softDeleteGuarantor(org(req), req.validated.params.id); res.json({ success: true }); }
module.exports = { list, get, profile, create, update, remove };
