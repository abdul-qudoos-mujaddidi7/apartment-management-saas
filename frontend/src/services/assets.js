import { api } from './api';

// --- Asset categories (dسته‌بندی اموال) -------------------------------------

export const listAssetCategories = ({ page = 1, pageSize = 50, search = '' } = {}) => {
  const query = new URLSearchParams({ page, pageSize, search: search.trim() });
  return api.get(`/asset-categories?${query.toString()}`);
};

export const createAssetCategory = (data) => api.post('/asset-categories', data);
export const updateAssetCategory = (id, data) => api.put(`/asset-categories/${id}`, data);
export const deleteAssetCategory = (id) => api.delete(`/asset-categories/${id}`);

// --- Master assets (فهرست اموال) -------------------------------------------

export const listAssets = ({ page = 1, pageSize = 50, search = '', categoryId } = {}) => {
  const query = new URLSearchParams({ page, pageSize, search: search.trim() });
  if (categoryId) query.set('categoryId', categoryId);
  return api.get(`/assets?${query.toString()}`);
};

export const createAsset = (data) => api.post('/assets', data);
export const updateAsset = (id, data) => api.put(`/assets/${id}`, data);
export const deleteAsset = (id) => api.delete(`/assets/${id}`);

// --- Assets registered to one apartment -------------------------------------

export const listApartmentAssets = (apartmentId) => api.get(`/apartments/${apartmentId}/assets`);

/**
 * Atomic save of the apartment's whole asset list. Rows carrying an id are
 * updated, rows without one are created, and rows missing from the payload are
 * soft deleted. `complete` stamps assetSetupCompletedAt and `advance` also
 * returns the next apartment that still needs its assets registered.
 */
export const saveApartmentAssets = (apartmentId, payload) =>
  api.post(`/apartments/${apartmentId}/assets`, payload);

export const updateApartmentAsset = (apartmentId, id, data) =>
  api.put(`/apartments/${apartmentId}/assets/${id}`, data);

export const deleteApartmentAsset = (apartmentId, id) =>
  api.delete(`/apartments/${apartmentId}/assets/${id}`);

/** "Complete with no assets" — or re-open a completed apartment. */
export const completeApartmentAssets = (apartmentId, completed = true) =>
  api.post(`/apartments/${apartmentId}/assets/complete`, { completed });

/** Read-only lookahead for "Skip for now": never completes the apartment. */
export const getNextApartment = (apartmentId) =>
  api.get(`/apartments/${apartmentId}/assets/next`);

// --- Records across the whole organization ----------------------------------

export const listApartmentAssetRecords = (filters = {}) => {
  const {
    page = 1,
    pageSize = 20,
    search = '',
    buildingId,
    floorId,
    apartmentId,
    categoryId,
    assetId,
    condition,
    setup,
  } = filters;

  const query = new URLSearchParams({ page, pageSize, search: search.trim() });
  if (buildingId) query.set('buildingId', buildingId);
  if (floorId) query.set('floorId', floorId);
  if (apartmentId) query.set('apartmentId', apartmentId);
  if (categoryId) query.set('categoryId', categoryId);
  if (assetId) query.set('assetId', assetId);
  if (condition) query.set('condition', condition);
  if (setup && setup !== 'all') query.set('setup', setup);

  return api.get(`/apartment-assets?${query.toString()}`);
};

export const updateApartmentAssetRecord = (id, data) => api.put(`/apartment-assets/${id}`, data);
export const deleteApartmentAssetRecord = (id) => api.delete(`/apartment-assets/${id}`);
