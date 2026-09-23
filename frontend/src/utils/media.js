import { API_ORIGIN } from '../services/api';

/**
 * Turns a stored file path into an address the browser can load.
 *
 * Rows hold paths relative to the API (`/uploads/...`) rather than absolute
 * URLs, so the same record works wherever the API is hosted. Anything already
 * absolute — an external URL, or a local preview the user has not uploaded yet
 * (`blob:` / `data:`) — is passed through untouched.
 */
export function mediaUrl(path) {
  if (!path) return '';
  if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('data:') || path.startsWith('blob:')) {
    return path;
  }

  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}
