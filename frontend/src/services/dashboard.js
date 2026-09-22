import { api } from './api';

/**
 * Portfolio summary for the dashboard: property counts, occupancy, money for the
 * current month, a six-month trend and the lists that need attention.
 */
export const getDashboard = async () => {
  const response = await api.get('/dashboard');
  return response.dashboard;
};
