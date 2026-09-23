import { api } from './api';

export const listTenants = ({ page = 1, pageSize = 10, search = '' } = {}) => {
  const query = new URLSearchParams({ page, pageSize, search });
  return api.get(`/tenants?${query.toString()}`);
};

export const getTenant = (id) => api.get(`/tenants/${id}`);

// One tenant's whole file: identity, tenancy, money, deposits and meters.
export const getTenantProfile = (id) => api.get(`/tenants/${id}/profile`);
export const createTenant = (data) => api.post('/tenants', data);
export const updateTenant = (id, data) => api.put(`/tenants/${id}`, data);
export const deleteTenant = (id) => api.delete(`/tenants/${id}`);
