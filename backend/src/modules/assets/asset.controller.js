const service = require('./asset.service');

// organizationId is derived exclusively from the authenticated user.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

async function list(req, res) {
  const assets = await service.listAssets(getOrganizationId(req), req.validated.query);
  return res.status(200).json({ success: true, ...assets });
}

async function get(req, res) {
  const asset = await service.getAsset(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, asset });
}

async function create(req, res) {
  const asset = await service.createAsset(getOrganizationId(req), req.validated.body);
  return res.status(201).json({ success: true, asset });
}

async function update(req, res) {
  const asset = await service.updateAsset(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, asset });
}

async function remove(req, res) {
  await service.softDeleteAsset(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, message: 'Asset deleted successfully.' });
}

module.exports = { create, get, list, remove, update };
