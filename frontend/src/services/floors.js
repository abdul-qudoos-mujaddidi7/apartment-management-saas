import { api } from './api';

export const listFloors = ({ page = 1, pageSize = 10, search = '', buildingId } = {}) => {
  const query = new URLSearchParams({ page, pageSize, search });
  if (buildingId) query.set('buildingId', buildingId);
  return api.get(`/floors?${query.toString()}`);
};

export const getFloor = (id) => api.get(`/floors/${id}`);
export const createFloor = (data) => api.post('/floors', data);
export const updateFloor = (id, data) => api.put(`/floors/${id}`, data);
export const deleteFloor = (id) => api.delete(`/floors/${id}`);
