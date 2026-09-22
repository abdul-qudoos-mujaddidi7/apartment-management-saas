import { api } from './api';

export const listPayments = (filters = {}) => {
  const query = new URLSearchParams({
    page: filters.page || 1,
    pageSize: filters.pageSize || 10,
    search: filters.search || '',
  });

  ['tenantId', 'leaseId', 'status', 'dateFrom', 'dateTo'].forEach((key) => {
    if (filters[key]) query.set(key, filters[key]);
  });

  return api.get(`/payments?${query.toString()}`);
};

export const getPayment = (id) => api.get(`/payments/${id}`);
export const getOutstandingItems = (tenantId, leaseId = '') => api.get(
  `/payments/outstanding?${new URLSearchParams({ tenantId, ...(leaseId ? { leaseId } : {}) }).toString()}`,
);
export const createPayment = (data) => api.post('/payments', data);
export const voidPayment = (id, voidReason) => api.post(`/payments/${id}/void`, { voidReason });
