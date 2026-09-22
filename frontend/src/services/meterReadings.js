import { api } from './api';

export const listMeterReadings = (filters = {}) => {
  const query = new URLSearchParams({
    page: filters.page || 1,
    pageSize: filters.pageSize || 10,
    search: filters.search || '',
  });

  ['buildingId', 'floorId', 'apartmentId', 'meterId', 'utilityType', 'dateFrom', 'dateTo']
    .forEach((key) => {
      if (filters[key]) query.set(key, filters[key]);
    });

  if (filters.unbilled) query.set('unbilled', 'true');

  return api.get(`/meter-readings?${query.toString()}`);
};

export const getMeterReading = (id) => api.get(`/meter-readings/${id}`);
export const createMeterReading = (data) => api.post('/meter-readings', data);
export const updateMeterReading = (id, data) => api.patch(`/meter-readings/${id}`, data);
export const deleteMeterReading = (id) => api.delete(`/meter-readings/${id}`);
