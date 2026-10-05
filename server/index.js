import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { authRequired, roleAtLeast, ROLE_RANK, hashPassword, verifyPassword, signToken } from './auth.js';
import {
  data, loadStore, saveStore, nextId,
  findCustomer, findDeviceByDeviceId, findDevice, paymentState, devicesForCustomer,
  getMqttSettings, saveMqttSettings, mqttSettingsJson,
} from './store.js';
import { mqttConnect, mqttReconnect, mqttTest, mqttStatus, mqttConnected, relayCommand, deviceCommand, pending } from './mqtt.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

loadStore();

/* ── auto-seed an admin if the store is empty ─────────────────────── */
if (data().users.length === 0) {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  data().users.push({
    id: nextId(),
    email: adminEmail,
    password: hashPassword(adminPass),
    name: 'Administrator',
    role: 'admin',
    customerId: null,
    createdAt: new Date().toISOString(),
  });
  saveStore();
  console.log(`[seed] created admin user (${adminEmail} / ${adminPass})`);
}

/* ── serializers ──────────────────────────────────────────────────── */
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, customerId: u.customerId });

const customerJson = (c) => ({
  id: c.id,
  name: c.name,
  email: c.email,
  phone: c.phone || '',
  address: c.address || '',
  paidUntil: c.paidUntil || null,
  paymentOverride: !!c.paymentOverride,
  payment: paymentState(c),
  deviceCount: devicesForCustomer(c.id).length,
  createdAt: c.createdAt,
});

const deviceJson = (d, { withLive = false } = {}) => ({
  id: d.id,
  deviceId: d.deviceId,
  serial: d.serial,
  name: d.name,
  customerId: d.customerId,
  active: d.active !== false,
  relayOverride: !!d.relayOverride,
  config: d.config || {},
  latest: withLive ? d.latest || null : undefined,
  createdAt: d.createdAt,
});

/* ── auth routes ──────────────────────────────────────────────────── */
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = data().users.find((u) => u.email === (email || '').toLowerCase());
  if (!user || !verifyPassword(password || '', user.password))
    return res.status(401).json({ ok: false, error: 'Invalid email or password' });
  res.json({ ok: true, token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = data().users.find((u) => u.id === req.user.id);
  if (!user) return res.status(401).json({ ok: false, error: 'User not found' });
  res.json({ ok: true, user: publicUser(user) });
});

/* ── users (admin only) ───────────────────────────────────────────── */
app.get('/api/users', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  res.json({ ok: true, users: data().users.map(publicUser) });
});

app.post('/api/users', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  const { email, password, name, role, customerId } = req.body || {};
  if (!email || !password || !role) return res.status(400).json({ ok: false, error: 'email, password and role are required' });
  if (data().users.some((u) => u.email === email.toLowerCase()))
    return res.status(409).json({ ok: false, error: 'Email already exists' });
  const user = {
    id: nextId(),
    email: email.toLowerCase(),
    password: hashPassword(password),
    name: name || email,
    role,
    customerId: role === 'customer' ? customerId || null : null,
    createdAt: new Date().toISOString(),
  };
  data().users.push(user);
  saveStore();
  res.json({ ok: true, user: publicUser(user) });
});

app.put('/api/users/:id', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  const user = data().users.find((u) => u.id === Number(req.params.id));
  if (!user) return res.status(404).json({ ok: false, error: 'User not found' });
  const { name, role, customerId, password } = req.body || {};
  if (name !== undefined) user.name = name;
  if (role !== undefined) user.role = role;
  if (role === 'customer') user.customerId = customerId || user.customerId;
  if (password) user.password = hashPassword(password);
  saveStore();
  res.json({ ok: true, user: publicUser(user) });
});

app.delete('/api/users/:id', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ ok: false, error: 'Cannot delete yourself' });
  data().users = data().users.filter((u) => u.id !== Number(req.params.id));
  saveStore();
  res.json({ ok: true });
});

/* ── customers (admin, manager) ───────────────────────────────────── */
app.get('/api/customers', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  let list = data().customers;
  const q = (req.query.search || '').toLowerCase();
  const status = req.query.status;
  if (q) {
    list = list.filter((c) =>
      [c.name, c.email, c.phone, c.address].some((v) => (v || '').toLowerCase().includes(q)) ||
      devicesForCustomer(c.id).some((d) => (d.serial || d.deviceId || d.name || '').toLowerCase().includes(q))
    );
  }
  if (status && status !== 'all') {
    list = list.filter((c) => paymentState(c).status === status);
  }
  list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ ok: true, customers: list.map(customerJson) });
});

app.post('/api/customers', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const { name, email, phone, address, paidUntil, paymentOverride } = req.body || {};
  if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });
  const customer = {
    id: nextId(),
    name,
    email: email || '',
    phone: phone || '',
    address: address || '',
    paidUntil: paidUntil || null,
    paymentOverride: !!paymentOverride,
    createdAt: new Date().toISOString(),
  };
  data().customers.push(customer);
  saveStore();
  res.json({ ok: true, customer: customerJson(customer) });
});

app.get('/api/customers/:id', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const c = findCustomer(Number(req.params.id));
  if (!c) return res.status(404).json({ ok: false, error: 'Customer not found' });
  res.json({
    ok: true,
    customer: customerJson(c),
    devices: devicesForCustomer(c.id).map((d) => deviceJson(d, { withLive: true })),
  });
});

app.put('/api/customers/:id', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const c = findCustomer(Number(req.params.id));
  if (!c) return res.status(404).json({ ok: false, error: 'Customer not found' });
  const { name, email, phone, address, paidUntil, paymentOverride } = req.body || {};
  if (name !== undefined) c.name = name;
  if (email !== undefined) c.email = email;
  if (phone !== undefined) c.phone = phone;
  if (address !== undefined) c.address = address;
  if (paidUntil !== undefined) c.paidUntil = paidUntil || null;
  if (paymentOverride !== undefined) c.paymentOverride = !!paymentOverride;
  saveStore();
  res.json({ ok: true, customer: customerJson(c) });
});

app.delete('/api/customers/:id', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  data().customers = data().customers.filter((c) => c.id !== Number(req.params.id));
  data().devices.forEach((d) => { if (d.customerId === Number(req.params.id)) d.customerId = null; });
  saveStore();
  res.json({ ok: true });
});

/* ── devices ──────────────────────────────────────────────────────── */
app.get('/api/devices', authRequired, roleAtLeast(ROLE_RANK.supervisor), (req, res) => {
  let list = data().devices;
  const q = (req.query.search || '').toLowerCase();
  if (req.query.customerId) list = list.filter((d) => d.customerId === Number(req.query.customerId));
  if (q) list = list.filter((d) => [d.name, d.serial, d.deviceId].some((v) => (v || '').toLowerCase().includes(q)));
  res.json({ ok: true, devices: list.map((d) => deviceJson(d, { withLive: true })) });
});

app.post('/api/devices', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const { deviceId, serial, name, customerId } = req.body || {};
  if (!deviceId || !serial) return res.status(400).json({ ok: false, error: 'deviceId and serial are required' });
  if (findDeviceByDeviceId(deviceId)) return res.status(409).json({ ok: false, error: 'Device ID already registered' });
  if (data().devices.some((d) => d.serial === serial)) return res.status(409).json({ ok: false, error: 'Serial number already registered' });
  const device = {
    id: nextId(),
    deviceId,
    serial,
    name: name || serial,
    customerId: customerId || null,
    active: true,
    relayOverride: false,
    config: {},
    latest: null,
    createdAt: new Date().toISOString(),
  };
  data().devices.push(device);
  saveStore();
  res.json({ ok: true, device: deviceJson(device) });
});

/* Devices seen on the MQTT broker that are not registered yet. */
app.get('/api/devices/discover', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const devices = [];
  for (const [deviceId, entry] of pending.entries()) {
    if (findDeviceByDeviceId(deviceId)) continue;
    const status = entry.status || {};
    devices.push({
      deviceId,
      name: status.devName || deviceId,
      serial: deviceId,
      version: status.version || '',
      lastSeen: entry.lastSeen || null,
    });
  }
  devices.sort((a, b) => (b.lastSeen || '').localeCompare(a.lastSeen || ''));
  res.json({ ok: true, devices });
});

app.get('/api/devices/:id', authRequired, roleAtLeast(ROLE_RANK.supervisor), (req, res) => {
  const d = findDevice(Number(req.params.id));
  if (!d) return res.status(404).json({ ok: false, error: 'Device not found' });
  res.json({ ok: true, device: deviceJson(d, { withLive: true }), customer: d.customerId ? customerJson(findCustomer(d.customerId)) : null });
});

app.put('/api/devices/:id', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const d = findDevice(Number(req.params.id));
  if (!d) return res.status(404).json({ ok: false, error: 'Device not found' });
  const { name, customerId, active, serial, relayOverride } = req.body || {};
  if (name !== undefined) d.name = name;
  if (customerId !== undefined) d.customerId = customerId || null;
  if (active !== undefined) d.active = !!active;
  if (serial !== undefined && !data().devices.some((x) => x.id !== d.id && x.serial === serial)) d.serial = serial;
  if (relayOverride !== undefined) d.relayOverride = !!relayOverride;
  saveStore();
  res.json({ ok: true, device: deviceJson(d, { withLive: true }) });
});

app.delete('/api/devices/:id', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  data().devices = data().devices.filter((d) => d.id !== Number(req.params.id));
  saveStore();
  res.json({ ok: true });
});

/* Supervisor: store device configuration. */
app.put('/api/devices/:id/config', authRequired, roleAtLeast(ROLE_RANK.supervisor), (req, res) => {
  const d = findDevice(Number(req.params.id));
  if (!d) return res.status(404).json({ ok: false, error: 'Device not found' });
  d.config = { ...(d.config || {}), ...(req.body.config || {}) };
  saveStore();
  res.json({ ok: true, device: deviceJson(d) });
});

/* Push a stored config (or arbitrary commands) to the device over MQTT. */
app.post('/api/devices/:id/push', authRequired, roleAtLeast(ROLE_RANK.supervisor), (req, res) => {
  const d = findDevice(Number(req.params.id));
  if (!d) return res.status(404).json({ ok: false, error: 'Device not found' });
  const cfg = req.body.config || d.config || {};
  if (!mqttConnected()) return res.status(503).json({ ok: false, error: 'MQTT bridge offline' });
  const sent = [];
  for (const [k, v] of Object.entries(cfg)) {
    if (deviceCommand(d.deviceId, `SET ${k} ${v}`)) sent.push(k);
  }
  res.json({ ok: true, sent, mqtt: true });
});

app.post('/api/devices/:id/relay', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const d = findDevice(Number(req.params.id));
  if (!d) return res.status(404).json({ ok: false, error: 'Device not found' });
  const action = String(req.body.action || 'toggle').toUpperCase();
  if (!['ON', 'OFF', 'TOGGLE'].includes(action)) return res.status(400).json({ ok: false, error: 'Invalid action' });
  const ok = relayCommand(d.deviceId, action);
  res.json({ ok, mqtt: mqttConnected(), deviceId: d.deviceId });
});

/* ── customer self-service (no online status, inverter + payment only) ── */
app.get('/api/me/dashboard', authRequired, (req, res) => {
  if (req.user.role !== 'customer' || !req.user.customerId)
    return res.status(403).json({ ok: false, error: 'Customer account required' });
  const c = findCustomer(req.user.customerId);
  if (!c) return res.status(404).json({ ok: false, error: 'Customer not found' });
  const devices = devicesForCustomer(c.id).map((d) => ({
    name: d.name,
    serial: d.serial,
    inverter: d.latest?.inverter || null,
  }));
  res.json({
    ok: true,
    customer: { name: c.name, payment: paymentState(c) },
    devices,
  });
});

/* ── payments (admin, manager) ────────────────────────────────────── */
app.get('/api/payments', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  let list = data().payments;
  if (req.query.customerId) list = list.filter((p) => p.customerId === Number(req.query.customerId));
  list = [...list].sort((a, b) => (b.paidAt || '').localeCompare(a.paidAt || ''));
  res.json({ ok: true, payments: list });
});

app.post('/api/payments', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const { customerId, amount, method, months, paidUntil } = req.body || {};
  const c = findCustomer(Number(customerId));
  if (!c) return res.status(400).json({ ok: false, error: 'Customer is required' });
  const base = c.paidUntil && new Date(c.paidUntil).getTime() > Date.now()
    ? new Date(c.paidUntil)
    : new Date();
  const monthsN = Math.max(0, Number(months) || 1);
  const next = new Date(base.getTime() + monthsN * 30 * 86400000);
  c.paidUntil = (paidUntil || next.toISOString().slice(0, 10));
  const payment = {
    id: nextId(),
    customerId: c.id,
    customerName: c.name,
    amount: Number(amount) || 0,
    method: method || 'cash',
    months: monthsN,
    paidUntil: c.paidUntil,
    paidAt: new Date().toISOString(),
  };
  data().payments.push(payment);
  saveStore();
  res.json({ ok: true, payment, customer: customerJson(c) });
});

app.get('/api/payments/overdue', authRequired, roleAtLeast(ROLE_RANK.manager), (req, res) => {
  const overdue = data().customers
    .filter((c) => paymentState(c).status === 'overdue')
    .map(customerJson);
  res.json({ ok: true, overdue });
});

/* ── role-aware dashboard summary ─────────────────────────────────── */
app.get('/api/dashboard', authRequired, (req, res) => {
  const db = data();
  const summary = {
    customers: db.customers.length,
    devices: db.devices.length,
    online: db.devices.filter((d) => d.latest?.online).length,
    overdue: db.customers.filter((c) => paymentState(c).status === 'overdue').length,
    mqtt: mqttConnected(),
  };
  res.json({ ok: true, user: publicUser(req.user.id ? db.users.find((u) => u.id === req.user.id) : null), summary });
});

app.get('/api/health', (req, res) => res.json({ ok: true, mqtt: mqttConnected(), time: new Date().toISOString() }));

/* ── MQTT settings (admin only) ─────────────────────────────────────
   Centralises the broker the backend bridges to. Secrets are masked on
   read; a blank password on save keeps the stored value.
   ═══════════════════════════════════════════════════════════════════ */
app.get('/api/settings/mqtt', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  res.json({ ok: true, settings: mqttSettingsJson(), status: mqttStatus() });
});

app.put('/api/settings/mqtt', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (typeof b.host === 'string') patch.host = b.host.trim();
  if (b.port !== undefined) patch.port = Number(b.port);
  if (b.devicePort !== undefined) patch.devicePort = Number(b.devicePort);
  if (typeof b.username === 'string') patch.username = b.username.trim();
  if (typeof b.password === 'string' && b.password.length) patch.password = b.password;
  if (typeof b.prefix === 'string') patch.prefix = b.prefix.trim().replace(/\/+$/, '');
  if (typeof b.url === 'string') patch.url = b.url.trim();
  if (b.enabled !== undefined) patch.enabled = !!b.enabled;

  if (patch.host === '' && b.host === '') {
    return res.status(400).json({ ok: false, error: 'Broker host is required' });
  }
  if (patch.port && (patch.port < 1 || patch.port > 65535)) {
    return res.status(400).json({ ok: false, error: 'Invalid WebSocket port' });
  }
  if (patch.devicePort && (patch.devicePort < 1 || patch.devicePort > 65535)) {
    return res.status(400).json({ ok: false, error: 'Invalid device port' });
  }

  saveMqttSettings(patch);
  mqttReconnect();
  res.json({ ok: true, settings: mqttSettingsJson(), status: mqttStatus() });
});

app.post('/api/settings/mqtt/test', authRequired, roleAtLeast(ROLE_RANK.admin), async (req, res) => {
  const b = req.body || {};
  const settings = {};
  if (typeof b.host === 'string' && b.host.trim()) settings.host = b.host.trim();
  if (b.port) settings.port = Number(b.port);
  if (typeof b.username === 'string') settings.username = b.username.trim();
  if (typeof b.password === 'string' && b.password.length) settings.password = b.password;
  if (typeof b.url === 'string' && b.url.trim()) settings.url = b.url.trim();
  const ok = await mqttTest(settings);
  res.json({ ok, connected: ok });
});

app.post('/api/settings/mqtt/reconnect', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  mqttReconnect();
  res.json({ ok: true, status: mqttStatus() });
});

/* Push the configured broker settings to every device (SET host/port/…). */
app.post('/api/settings/mqtt/push', authRequired, roleAtLeast(ROLE_RANK.admin), (req, res) => {
  const s = getMqttSettings();
  if (!mqttConnected()) return res.status(503).json({ ok: false, error: 'MQTT bridge offline — save first, then push once connected' });
  const cmds = [
    `SET host ${s.host}`,
    `SET port ${s.devicePort}`,
    `SET muser ${s.username || ''}`,
    ...(s.password ? [`SET mpass ${s.password}`] : []),
    `SET prefix ${s.prefix}`,
  ];
  let sent = 0;
  for (const d of data().devices) {
    for (const c of cmds) if (deviceCommand(d.deviceId, c)) sent++;
  }
  res.json({ ok: true, sent, devices: data().devices.length, commands: cmds });
});

/* ── payment enforcement ────────────────────────────────────────────
   A customer whose account is overdue (and not admin-overridden) has
   every device's relay forced OFF over MQTT. A paid customer's relay is
   forced ON, unless the device's shock/tamper alarm is active and its
   configured action is "switch the relay off" (ACT_OFF). Runs periodically.
   ═══════════════════════════════════════════════════════════════════ */
const CUTOFF_INTERVAL_MS = 5 * 60 * 1000;
const ACT_OFF = 2;

function alarmWantsOff(d) {
  const s = (d.latest && (d.latest.telemetry || d.latest.status)?.sensors) || {};
  if (s.shock && s.shockAction === ACT_OFF) return true;
  if (s.tamper && s.tamperAction === ACT_OFF) return true;
  return false;
}

function enforcePayments() {
  const db = data();
  let changed = false;
  for (const c of db.customers) {
    const state = paymentState(c);
    const shouldCut = state.status === 'overdue';
    const paid = state.status === 'paid';
    for (const d of devicesForCustomer(c.id)) {
      if (!d.active) continue;

      if (shouldCut && !c.paymentOverride && !d.relayOverride) {
        if (!d._cutoffSentAt || Date.now() - new Date(d._cutoffSentAt).getTime() > CUTOFF_INTERVAL_MS) {
          d._cutoffSentAt = new Date().toISOString();
          relayCommand(d.deviceId, 'OFF');
          console.log(`[payments] cutting relay for device ${d.deviceId} (customer "${c.name}" overdue)`);
          changed = true;
        }
        continue;
      }

      if (d._cutoffSentAt) { d._cutoffSentAt = null; changed = true; }

      if (paid && !d.relayOverride && !alarmWantsOff(d)) {
        if (!d._turnOnSentAt || Date.now() - new Date(d._turnOnSentAt).getTime() > CUTOFF_INTERVAL_MS) {
          d._turnOnSentAt = new Date().toISOString();
          relayCommand(d.deviceId, 'ON');
          console.log(`[payments] turning relay on for device ${d.deviceId} (customer "${c.name}" paid)`);
          changed = true;
        }
      }
    }
  }
  if (changed) saveStore();
}

/* Devices that stop publishing are marked offline after a quiet window. */
const ONLINE_TIMEOUT_MS = 3 * 60 * 1000;

function refreshOnlineStatus() {
  let changed = false;
  const now = Date.now();
  for (const d of data().devices) {
    if (!d.latest || !d.latest.online) continue;
    const seen = d.latest.lastSeen ? new Date(d.latest.lastSeen).getTime() : 0;
    if (!seen || now - seen > ONLINE_TIMEOUT_MS) {
      d.latest.online = false;
      changed = true;
    }
  }
  if (changed) saveStore();
}

/* ── start ────────────────────────────────────────────────────────── */
mqttConnect();
setInterval(enforcePayments, 30 * 1000);
setTimeout(enforcePayments, 5000);
setInterval(refreshOnlineStatus, 60 * 1000);

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
  console.log(`Roles: admin(${ROLE_RANK.admin}) manager(${ROLE_RANK.manager}) supervisor(${ROLE_RANK.supervisor}) customer(${ROLE_RANK.customer})`);
});
