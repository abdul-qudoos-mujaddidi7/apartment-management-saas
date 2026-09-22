import { api } from './api';

export const listMeters = (filters = {}) => {
  const {
    page = 1,
    pageSize = 10,
    search = '',
    buildingId,
    floorId,
    apartmentId,
    utilityType,
    status
  } = filters;

  const query = new URLSearchParams({ page, pageSize, search });

  if (buildingId) query.set('buildingId', buildingId);
  if (floorId) query.set('floorId', floorId);
  if (apartmentId) query.set('apartmentId', apartmentId);
  if (utilityType) query.set('utilityType', utilityType);
  if (status) query.set('status', status);

  return api.get(`/meters?${query.toString()}`);
};

export const getMeter = (id) => api.get(`/meters/${id}`);
export const createMeter = (data) => api.post('/meters', data);
export const updateMeter = (id, data) => api.patch(`/meters/${id}`, data);
export const deleteMeter = (id) => api.delete(`/meters/${id}`);
