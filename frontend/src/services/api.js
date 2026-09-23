const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Where the API itself lives, without the /api suffix. Uploaded files are served
// from there (`/uploads/...`), so stored paths become full addresses here rather
// than being saved as absolute URLs.
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, '');

async function request(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong. Please try again.');
    error.status = response.status;
    error.data = data;
    if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('apartmentpro:session-expired'));
    }
    throw error;
  }

  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) }),
  put: (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (path, body) => request(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),
  // A FormData body must keep the browser's own Content-Type: it carries the
  // multipart boundary. Passing `headers: {}` drops the JSON default, and the
  // spread inside request() lets it win.
  upload: (path, formData) => request(path, { method: 'POST', body: formData, headers: {} }),
};
