import { api } from './api';

export const listAccounts = () => api.get('/accounts');
export const getAccount = (id) => api.get(`/accounts/${id}`);
export const getAccountLedger = (id, filters = {}) => {
  const query = new URLSearchParams({ page: filters.page || 1, pageSize: filters.pageSize || 20 });
  if (filters.from) query.set('from', filters.from);
  if (filters.to) query.set('to', filters.to);
  return api.get(`/accounts/${id}/ledger?${query.toString()}`);
};
export const getAccountSummary = (id) => api.get(`/accounts/${id}/summary`);
