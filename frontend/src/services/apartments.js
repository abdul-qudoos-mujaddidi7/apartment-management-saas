import { api } from './api';

export const listApartments = ({ page = 1, pageSize = 10, search = '', floorId } = {}) => {
  const query = new URLSearchParams({ page, pageSize, search });
  if (floorId) query.set('floorId', floorId);
  return api.get(`/apartments?${query.toString()}`);
};

export const getApartment = (id) => api.get(`/apartments/${id}`);
export const createApartment = (data) => api.post('/apartments', data);
export const updateApartment = (id, data) => api.put(`/apartments/${id}`, data);
export const deleteApartment = (id) => api.delete(`/apartments/${id}`);
