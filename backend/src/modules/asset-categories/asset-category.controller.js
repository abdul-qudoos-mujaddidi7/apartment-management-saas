const service = require('./asset-category.service');

// organizationId is derived exclusively from the authenticated user.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

async function list(req, res) {
  const categories = await service.listAssetCategories(getOrganizationId(req), req.validated.query);
  return res.status(200).json({ success: true, ...categories });
}

async function get(req, res) {
  const assetCategory = await service.getAssetCategory(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, assetCategory });
}

async function create(req, res) {
  const assetCategory = await service.createAssetCategory(getOrganizationId(req), req.validated.body);
  return res.status(201).json({ success: true, assetCategory });
}

async function update(req, res) {
  const assetCategory = await service.updateAssetCategory(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, assetCategory });
}

async function remove(req, res) {
  await service.softDeleteAssetCategory(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, message: 'Asset category deleted successfully.' });
}

module.exports = { create, get, list, remove, update };
