const buildingService = require('./building.service');

// organizationId is derived exclusively from the authenticated user.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

async function list(req, res) {
  const buildings = await buildingService.listBuildings(
    getOrganizationId(req),
    req.validated.query,
  );

  return res.status(200).json({ success: true, ...buildings });
}

async function get(req, res) {
  const building = await buildingService.getBuilding(
    getOrganizationId(req),
    req.validated.params.id,
  );

  return res.status(200).json({ success: true, building });
}

async function create(req, res) {
  const building = await buildingService.createBuilding(
    getOrganizationId(req),
    req.validated.body,
  );

  return res.status(201).json({ success: true, building });
}

async function update(req, res) {
  const building = await buildingService.updateBuilding(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, building });
}

async function remove(req, res) {
  await buildingService.softDeleteBuilding(
    getOrganizationId(req),
    req.validated.params.id,
  );

  return res.status(200).json({ success: true, message: 'Building deleted successfully.' });
}

module.exports = { create, get, list, remove, update };
