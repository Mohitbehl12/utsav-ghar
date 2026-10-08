/**
 * Single API client. In production it talks to the Express server with cookies
 * + CSRF header. In the demo build (`vite build --mode demo`) the same calls are
 * answered by an in-browser mock backend so the storefront can be previewed
 * without a server.
 */
let mock = null;
async function getMock() {
  if (!mock) mock = (await import('../demo/mockServer.js')).default;
  return mock;
}

function csrfToken() {
  const m = document.cookie.match(/(?:^|; )sa_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : '';
}

export class ApiError extends Error {
  constructor(status, data) {
    super(data?.error || 'Request failed');
    this.status = status;
    this.data = data || {};
    this.fields = data?.fields || {};
  }
}

let csrfPrimed = false;
async function primeCsrf() {
  if (csrfPrimed || csrfToken()) return;
  await fetch('/api/health', { credentials: 'include' });
  csrfPrimed = true;
}

export async function request(method, path, body, { headers = {} } = {}) {
  if (__DEMO__) {
    const m = await getMock();
    const { status, data } = await m.handle(method, path, body, headers);
    if (status >= 400) throw new ApiError(status, data);
    return data;
  }
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (method !== 'GET') await primeCsrf();
  const res = await fetch(`/api${path}`, {
    method,
    credentials: 'include',
    headers: {
      ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      ...(method !== 'GET' ? { 'X-CSRF-Token': csrfToken() } : {}),
      ...headers,
    },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

/** Binary download (PDF, image) as a Blob — server file, or bytes made by the preview's mock backend. */
export async function fetchFile(path) {
  if (__DEMO__) {
    const m = await getMock();
    const { status, data } = await m.handle('GET', path, null, {});
    if (status >= 400) throw new ApiError(status, data);
    return new Blob([data.__file.bytes], { type: data.__file.type });
  }
  const res = await fetch(`/api${path}`, { credentials: 'include' });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  return res.blob();
}
/** Save a Blob as a file (falls back to opening it when downloads are blocked). */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export const api = {
  get: (p, o) => request('GET', p, null, o),
  post: (p, b, o) => request('POST', p, b, o),
  put: (p, b, o) => request('PUT', p, b, o),
  patch: (p, b, o) => request('PATCH', p, b, o),
  del: (p, o) => request('DELETE', p, o?.body ?? null, o),
};

// Guest order tokens let a customer reopen their own order on this device.
const TOKENS_KEY = 'sa_order_tokens';
export function saveOrderToken(orderNumber, token) {
  try {
    const all = JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}');
    all[orderNumber] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch { /* storage unavailable */ }
}
export function orderToken(orderNumber) {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) || '{}')[orderNumber] || '';
  } catch {
    return '';
  }
}

/** Resolve an image URL (demo stores uploads as data: URLs). */
export const assetUrl = (u) => u || '';
