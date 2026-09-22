import { api } from './api';

export async function globalSearch(query) {
  const trimmed = query.trim();
  if (!trimmed) return { results: [] };

  const q = new URLSearchParams({ q: trimmed });
  return api.get(`/search?${q.toString()}`);
}
