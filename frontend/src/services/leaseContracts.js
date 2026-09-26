import { api } from './api';

/**
 * The lease contract and the organization-wide wording behind it.
 *
 * The organization is never sent: every endpoint scopes to the authenticated
 * session's own organization on the server.
 */

/** The organization's contract settings, its clauses and the placeholder help. */
export const getContractSettings = () => api.get('/lease-contracts/settings');

/** Save the letterhead, lessor, titles, numbering and signature labels. */
export const updateContractSettings = (data) => api.put('/lease-contracts/settings', data);

export const listContractClauses = () => api.get('/lease-contracts/clauses');

export const createContractClause = (data) => api.post('/lease-contracts/clauses', data);

export const updateContractClause = (id, data) => api.put(`/lease-contracts/clauses/${id}`, data);

export const deleteContractClause = (id) => api.delete(`/lease-contracts/clauses/${id}`);

/** The whole display order in one request — `order` is the list of clause ids. */
export const reorderContractClauses = (order) =>
  api.put('/lease-contracts/clauses/order', { order });

/** One lease's complete contract, with every placeholder already resolved. */
export const getLeaseContract = (leaseId) => api.get(`/lease-contracts/leases/${leaseId}`);

/**
 * The contract as a PDF file, rendered by the API.
 *
 * `labels` is the wording the current language puts around the data — the field
 * names, the section titles, the signature captions. The API keeps no
 * translation table of its own, so the browser sends the words it is already
 * displaying and the server escapes every one of them on the way into the
 * document. Returns `{ blob, filename }`.
 */
export const renderContractPdf = (leaseId, { language, labels, disposition = 'inline' }) =>
  api.blobPost(`/lease-contracts/leases/${leaseId}/pdf`, { language, labels, disposition });
