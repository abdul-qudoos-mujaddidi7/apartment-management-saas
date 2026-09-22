import { api } from './api';

export async function getBuildings({ page = 1, pageSize = 10, search = '' } = {}) {
  const query = new URLSearchParams({
    page,
    pageSize,
    search: search.trim()
  });

  return api.get(`/buildings?${query.toString()}`);
}

export async function getBuilding(id) {
  return api.get(`/buildings/${id}`);
}

export async function createBuilding(data) {
  return api.post('/buildings', data);
}

export async function updateBuilding(id, data) {
  return api.patch(`/buildings/${id}`, data);
}

export async function deleteBuilding(id) {
  return api.delete(`/buildings/${id}`);
}
