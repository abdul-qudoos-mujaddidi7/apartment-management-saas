import { api } from './api';

export const listFinancialAccounts = () => api.get('/financial-accounts');
