const tenantService = require('./tenant.service');

// organizationId is derived exclusively from the authenticated user.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

async function list(req, res) {
  const tenants = await tenantService.listTenants(
    getOrganizationId(req),
    req.validated.query,
  );

  return res.status(200).json({ success: true, ...tenants });
}

async function get(req, res) {
  const tenant = await tenantService.getTenant(
    getOrganizationId(req),
    req.validated.params.id,
  );

  return res.status(200).json({ success: true, tenant });
}

async function profile(req, res) {
  const profile = await tenantService.getTenantProfile(
    getOrganizationId(req),
    req.validated.params.id,
  );

  return res.status(200).json({ success: true, ...profile });
}

async function create(req, res) {
  const tenant = await tenantService.createTenant(
    getOrganizationId(req),
    req.validated.body,
  );

  return res.status(201).json({ success: true, tenant });
}

async function update(req, res) {
  const tenant = await tenantService.updateTenant(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, tenant });
}

async function remove(req, res) {
  await tenantService.softDeleteTenant(
    getOrganizationId(req),
    req.validated.params.id,
  );

  return res.status(200).json({ success: true, message: 'Tenant deleted successfully.' });
}

module.exports = { create, get, list, profile, remove, update };
