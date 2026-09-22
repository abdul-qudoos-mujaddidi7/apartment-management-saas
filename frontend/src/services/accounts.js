import { api } from './api';

export const listAccounts = () => api.get('/accounts');
export const getAccount = (id) => api.get(`/accounts/${id}`);
export const getAccountLedger = (id, filters = {}) => api.get(`/accounts/${id}/ledger?${new URLSearchParams({ page: filters.page || 1, pageSize: filters.pageSize || 20 }).toString()}`);
