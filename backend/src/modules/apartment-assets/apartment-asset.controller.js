const AppError = require('../../errors/AppError');

const service = require('./apartment-asset.service');

// organizationId is derived exclusively from the authenticated user.
function getOrganizationId(req) {
  return req.user?.organizations?.[0]?.id;
}

// --- Module-wide records (across the whole organization) -------------------

async function listRecords(req, res) {
  const records = await service.listRecords(getOrganizationId(req), req.validated.query);
  return res.status(200).json({ success: true, ...records });
}

async function getRecord(req, res) {
  const apartmentAsset = await service.getApartmentAsset(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, apartmentAsset });
}

async function updateRecord(req, res) {
  const apartmentAsset = await service.updateApartmentAsset(
    getOrganizationId(req),
    req.validated.params.id,
    req.validated.body,
  );

  return res.status(200).json({ success: true, apartmentAsset });
}

async function removeRecord(req, res) {
  await service.softDeleteApartmentAsset(getOrganizationId(req), req.validated.params.id);
  return res.status(200).json({ success: true, message: 'Apartment asset deleted successfully.' });
}

// --- Records scoped to one apartment ---------------------------------------

async function listForApartment(req, res) {
  const result = await service.listApartmentAssets(
    getOrganizationId(req),
    req.validated.params.apartmentId,
  );

  return res.status(200).json({ success: true, ...result });
}

async function saveForApartment(req, res) {
  const organizationId = getOrganizationId(req);
  const { apartmentId } = req.validated.params;

  const result = await service.saveApartmentAssets(organizationId, apartmentId, req.validated.body);

  const message =
    req.validated.body.advance && !result.nextApartment
      ? 'All apartments are completed.'
      : 'Apartment assets saved successfully.';

  return res.status(200).json({
    success: true,
    message,
    apartment: result.apartment,
    items: result.items,
    nextApartment: result.nextApartment,
  });
}

// "Complete with no assets" (or re-open a completed apartment).
async function completeForApartment(req, res) {
  const result = await service.setApartmentSetupCompleted(
    getOrganizationId(req),
    req.validated.params.apartmentId,
    req.validated.body.completed,
  );

  return res.status(200).json({
    success: true,
    message: req.validated.body.completed
      ? 'Apartment asset registration marked as completed.'
      : 'Apartment asset registration re-opened.',
    apartment: result.apartment,
    nextApartment: result.nextApartment,
  });
}

// Navigation only: reports the next pending apartment without touching data, so
// "Skip for now" never marks the current apartment as completed.
async function nextApartment(req, res) {
  const next = await service.findNextApartment(
    getOrganizationId(req),
    req.validated.params.apartmentId,
  );

  return res.status(200).json({
    success: true,
    nextApartment: next,
    message: next ? 'Next apartment found.' : 'All apartments are completed.',
  });
}

async function updateForApartment(req, res) {
  const organizationId = getOrganizationId(req);
  const { apartmentId, id } = req.validated.params;

  const existing = await service.getApartmentAsset(organizationId, id);

  if (existing.apartmentId !== apartmentId) {
    throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
  }

  const apartmentAsset = await service.updateApartmentAsset(organizationId, id, req.validated.body);
  return res.status(200).json({ success: true, apartmentAsset });
}

async function removeForApartment(req, res) {
  const organizationId = getOrganizationId(req);
  const { apartmentId, id } = req.validated.params;

  const existing = await service.getApartmentAsset(organizationId, id);

  if (existing.apartmentId !== apartmentId) {
    throw new AppError('Apartment asset not found.', 404, 'APARTMENT_ASSET_NOT_FOUND');
  }

  await service.softDeleteApartmentAsset(organizationId, id);
  return res.status(200).json({ success: true, message: 'Apartment asset deleted successfully.' });
}

module.exports = {
  completeForApartment,
  getRecord,
  listForApartment,
  listRecords,
  nextApartment,
  removeForApartment,
  removeRecord,
  saveForApartment,
  updateForApartment,
  updateRecord,
};
