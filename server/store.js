import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data.json');

function nowIso() {
  return new Date().toISOString();
}

/* ── Persistence (JSON document store — swap for SQLite/Postgres later) ── */
const DEFAULT_MQTT = {
  host: process.env.MQTT_HOST || '',
  port: Number(process.env.MQTT_PORT || 8884),
  devicePort: Number(process.env.MQTT_DEVICE_PORT || 8883),
  username: process.env.MQTT_USERNAME || '',
  password: process.env.MQTT_PASSWORD || '',
  prefix: process.env.MQTT_PREFIX || 'esp32/relay',
  url: process.env.MQTT_URL || '',
  enabled: !(process.env.MQTT_ENABLED === '0' || process.env.MQTT_ENABLED === 'false'),
};

let db = {
  users: [],
  customers: [],
  devices: [],
  payments: [],
  settings: { mqtt: { ...DEFAULT_MQTT } },
  meta: { seq: 0, createdAt: nowIso() },
};

export function loadStore() {
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      db = { ...db, ...parsed };
    } catch (e) {
      console.error('[db] failed to read store, starting fresh:', e.message);
    }
  }
  // Merge settings so new keys get defaults without wiping existing values.
  db.settings = db.settings || {};
  db.settings.mqtt = { ...DEFAULT_MQTT, ...(db.settings.mqtt || {}) };
  return db;
}

export function saveStore() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

export const data = () => db;

export function getMqttSettings() {
  return db.settings.mqtt;
}

export function saveMqttSettings(patch) {
  db.settings.mqtt = { ...db.settings.mqtt, ...patch };
  saveStore();
  return db.settings.mqtt;
}

/* Mask the password so it never leaves the API in plain text. */
export function mqttSettingsJson() {
  const s = db.settings.mqtt;
  return {
    host: s.host,
    port: s.port,
    devicePort: s.devicePort,
    username: s.username,
    hasPassword: !!s.password,
    prefix: s.prefix,
    url: s.url || '',
    enabled: !!s.enabled,
  };
}

export function nextId() {
  db.meta.seq = (db.meta.seq || 0) + 1;
  return db.meta.seq;
}

/* ── Domain helpers ───────────────────────────────────────────────── */
export function findCustomer(id) {
  return db.customers.find((c) => c.id === id);
}

export function findDeviceByDeviceId(deviceId) {
  return db.devices.find((d) => d.deviceId === deviceId);
}

export function findDevice(id) {
  return db.devices.find((d) => d.id === id);
}

/* Normalise a customer's payment standing. */
export function paymentState(customer) {
  if (!customer) return { status: 'none' };
  if (customer.paymentOverride) return { status: 'override', paidUntil: customer.paidUntil };
  const due = customer.paidUntil ? new Date(customer.paidUntil).getTime() : 0;
  const overdue = !due || due < Date.now();
  return { status: overdue ? 'overdue' : 'paid', paidUntil: customer.paidUntil };
}

export function devicesForCustomer(customerId) {
  return db.devices.filter((d) => d.customerId === customerId);
}
