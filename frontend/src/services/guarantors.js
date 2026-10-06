import { api } from './api';
export const listGuarantors = ({ page = 1, pageSize = 10, search = '' } = {}) => api.get(`/guarantors?${new URLSearchParams({ page, pageSize, search })}`);
export const getGuarantor = id => api.get(`/guarantors/${encodeURIComponent(id)}`);
export const getGuarantorProfile = (id, { page = 1, pageSize = 10 } = {}) => api.get(`/guarantors/${encodeURIComponent(id)}/profile?${new URLSearchParams({ page, pageSize })}`);
export const createGuarantor = data => api.post('/guarantors', data);
export const updateGuarantor = (id, data) => api.put(`/guarantors/${encodeURIComponent(id)}`, data);
export const deleteGuarantor = id => api.delete(`/guarantors/${encodeURIComponent(id)}`);
