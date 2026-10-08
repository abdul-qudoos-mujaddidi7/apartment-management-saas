import { api } from './api';

export const login = (credentials) => api.post('/auth/login', credentials);
export const register = (credentials) => api.post('/auth/register', credentials);
export const logout = () => api.post('/auth/logout');
export const getCurrentUser = () => api.get('/auth/me');
// The signed-in user's own record. Both act on the session's account, so no id
// is sent: the API reads it from the session cookie.
export const updateProfile = (profile) => api.patch('/auth/me', profile);
export const changePassword = (passwords) => api.post('/auth/change-password', passwords);
