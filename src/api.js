const TOKEN_KEY = 'esp32.token';
const REMEMBER_KEY = 'esp32.remember';

export const getRemember = () => localStorage.getItem(REMEMBER_KEY) !== '0';

export const getToken = () => {
  return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
};

export const setToken = (t, remember = getRemember()) => {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  if (t) (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, t);
  localStorage.setItem(REMEMBER_KEY, remember ? '1' : '0');
};

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`/api${path}`, { ...opts, headers });
  } catch {
    throw new Error('Cannot reach the server. Is the backend running on :4000?');
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { ok: false, error: text.slice(0, 200) || `HTTP ${res.status}` };
  }
  if (res.status === 401) setToken(null);
  if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body: JSON.stringify(body || {}) }),
  put: (p, body) => request(p, { method: 'PUT', body: JSON.stringify(body || {}) }),
  del: (p) => request(p, { method: 'DELETE' }),
};

export async function login(email, password, remember = true) {
  const r = await api.post('/auth/login', { email, password });
  setToken(r.token, remember);
  return r.user;
}
