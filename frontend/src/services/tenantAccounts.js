import { api } from './api';

export const listTenantAccounts = (filters = {}) => api.get(`/tenant-accounts?${new URLSearchParams({ page: filters.page || 1, pageSize: filters.pageSize || 10, search: filters.search || '', ...(filters.buildingId ? { buildingId: filters.buildingId } : {}), ...(filters.apartmentId ? { apartmentId: filters.apartmentId } : {}) }).toString()}`);
export const getTenantAccount = (tenantId) => api.get(`/tenant-accounts/${tenantId}`);
export const getTenantLedger = (tenantId, filters = {}) => api.get(`/tenant-accounts/${tenantId}/ledger?${new URLSearchParams({ page: filters.page || 1, pageSize: filters.pageSize || 20 }).toString()}`);
