import { api } from './api';

/**
 * Image uploads.
 *
 * The client picks a file, the API stores it and answers with the path it
 * wrote (`/uploads/tenants/...`). That path is what a form saves; the picture
 * itself is only ever fetched from the API's own origin.
 */
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');

/** Uploads one image and returns the stored file: { url, kind, size, mimeType }. */
export async function uploadImage(file, kind) {
  const body = new FormData();
  body.append('file', file);

  const response = await api.upload(`/uploads?kind=${encodeURIComponent(kind)}`, body);
  return response.upload;
}

/**
 * Removes a file that was uploaded but never attached to anything — a picture
 * picked by mistake and dropped again before the form was saved.
 */
export function deleteUpload(url) {
  if (!url) return Promise.resolve(null);
  return api.delete('/uploads', { url });
}
