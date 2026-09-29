const LS_TARGET = "esp32.target";
const LS_AUTH = "esp32.auth";

/* Set VITE_DEVICE in .env to point the app at your device without retyping it. */
export const DEFAULT_TARGET = (import.meta.env.VITE_DEVICE || "192.168.4.1").replace(
  /^https?:\/\//,
  ""
).replace(/\/+$/, "");

export function loadTarget() {
  return localStorage.getItem(LS_TARGET) || DEFAULT_TARGET;
}

export function saveTarget(v) {
  localStorage.setItem(LS_TARGET, v.trim());
}

export function loadAuth() {
  try {
    return JSON.parse(localStorage.getItem(LS_AUTH) || "null") || null;
  } catch {
    return null;
  }
}

export function saveAuth(a) {
  if (a && a.password) localStorage.setItem(LS_AUTH, JSON.stringify(a));
  else localStorage.removeItem(LS_AUTH);
}

function authHeader() {
  const a = loadAuth();
  if (!a?.password) return {};
  return { Authorization: "Basic " + btoa(`${a.username || "admin"}:${a.password}`) };
}

/** Always hand the browser an absolute URL. A bare "192.168.4.1" would be
 *  treated as a path relative to the dev server, not as a host. */
export function normalizeTarget(v) {
  const s = String(v || "").trim().replace(/\/+$/, "");
  if (!s) return "";
  return /^https?:\/\//i.test(s) ? s : `http://${s}`;
}

export function apiUrl(target, path) {
  return `${normalizeTarget(target)}${path}`;
}

/**
 * The firmware posts JSON bodies and answers with {ok:true,...}.
 * Throws an Error carrying a human readable message on any failure.
 */
export async function call(target, path, body) {
  const opts = { headers: { "Content-Type": "application/json", ...authHeader() } };
  if (body !== undefined) {
    opts.method = "POST";
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(apiUrl(target, path), opts);
  } catch {
    throw new Error("Cannot reach the device. Check the IP address and that you are on the same network.");
  }

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(text.slice(0, 200) || `HTTP ${res.status}`);
  }

  if (res.status === 401) throw new Error("Authentication required.");
  if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

export const getStatus = (t) => call(t, "/api/status");
export const getLogs = (t, since) => call(t, `/api/logs?since=${since || 0}`);
export const setRelay = (t, action, seconds) =>
  call(t, "/api/relay", { action, ...(seconds ? { seconds } : {}) });
export const pulseRelay = (t) => call(t, "/api/relay-test", {});
export const reboot = (t) => call(t, "/api/reboot", {});

/** Live updates over the device's mini WebSocket; caller falls back to polling. */
export function connectSocket(target, onStatus, onLog, onState) {
  const base = normalizeTarget(target)
    .replace(/^http:/i, "ws:")
    .replace(/^https:/i, "wss:");
  let ws;
  try {
    ws = new WebSocket(`${base}/ws`);
  } catch {
    onState?.("error");
    return null;
  }

  ws.onopen = () => onState?.("open");
  ws.onclose = () => onState?.("closed");
  ws.onerror = () => onState?.("error");
  ws.onmessage = (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return;
    }
    if (msg.type === "status") onStatus?.(msg.data);
    else if (msg.type === "log") onLog?.(msg.text);
  };
  return ws;
}
