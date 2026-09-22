import { api } from './api';
export const listLeases=(filters={})=>api.get(`/leases?${new URLSearchParams({page:1,pageSize:10,search:'',...filters}).toString()}`);
export const getLease=(id)=>api.get(`/leases/${id}`); export const createLease=(data)=>api.post('/leases',data); export const updateLease=(id,data)=>api.put(`/leases/${id}`,data); export const deleteLease=(id)=>api.delete(`/leases/${id}`);
