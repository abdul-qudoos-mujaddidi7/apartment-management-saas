import { api } from './api';

export const listInvoices = (filters = {}) => {
  const query = new URLSearchParams({
    page: filters.page || 1,
    pageSize: filters.pageSize || 10,
    search: filters.search || '',
  });

  [
    'buildingId',
    'floorId',
    'apartmentId',
    'tenantId',
    'leaseId',
    'status',
    'dateFrom',
    'dateTo',
  ].forEach((key) => {
    if (filters[key]) query.set(key, filters[key]);
  });

  return api.get(`/invoices?${query.toString()}`);
};

export const getInvoice = (id) => api.get(`/invoices/${id}`);
export const createInvoice = (data) => api.post('/invoices', data);
export const updateInvoice = (id, data) => api.patch(`/invoices/${id}`, data);
export const deleteInvoice = (id) => api.delete(`/invoices/${id}`);
export const cancelInvoice = (id) => api.post(`/invoices/${id}/cancel`, {});
