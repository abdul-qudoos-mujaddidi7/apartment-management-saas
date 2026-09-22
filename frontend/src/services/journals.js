import { api } from './api';

export const listJournals = (filters = {}) => {
  const query = new URLSearchParams({
    page: filters.page || 1,
    pageSize: filters.pageSize || 10,
    search: filters.search || '',
  });

  ['status', 'referenceType', 'accountId', 'dateFrom', 'dateTo'].forEach((key) => {
    if (filters[key]) query.set(key, filters[key]);
  });

  return api.get(`/journals?${query.toString()}`);
};

export const getJournal = (id) => api.get(`/journals/${id}`);
export const createJournal = (data) => api.post('/journals', data);
export const updateJournal = (id, data) => api.put(`/journals/${id}`, data);
export const voidJournal = (id, voidReason) => api.post(`/journals/${id}/void`, { voidReason });
