import { api } from './api';

export function listSecurityDeposits(filters = {}) {
  const values = {
    page: 1,
    pageSize: 10,
    search: '',
    ...filters,
  };

  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  }

  return api.get(`/security-deposits?${params.toString()}`);
}

export function getSecurityDeposit(leaseId) {
  return api.get(`/security-deposits/${leaseId}`);
}

export function createSecurityDepositTransaction(leaseId, data) {
  return api.post(`/security-deposits/${leaseId}/transactions`, data);
}

export function voidSecurityDepositTransaction(transactionId, voidReason) {
  return api.post(`/security-deposits/transactions/${transactionId}/void`, {
    voidReason,
  });
}
