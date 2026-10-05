import mqtt from 'mqtt';
import { findDeviceByDeviceId, saveStore, getMqttSettings } from './store.js';

let client = null;
let connected = false;
let prefixSegments = 1;

/* Latest telemetry for device IDs not (yet) registered — held in memory only. */
export const pending = new Map();

function log(...a) {
  console.log('[mqtt]', ...a);
}

function buildUrl(s) {
  if (s.url) return s.url;
  if (s.port === 8883) return `mqtts://${s.host}:${s.port}`;
  return `wss://${s.host}:${s.port || 8884}/mqtt`;
}

function prefixSegCount(s) {
  return (s.prefix || 'esp32/relay').replace(/\/+$/, '').split('/').length;
}

export function mqttStatus() {
  const s = getMqttSettings();
  return { enabled: !!s.enabled, connected, host: s.host, port: s.port };
}

export function mqttConnect() {
  const s = getMqttSettings();
  if (!s.enabled || !s.host) {
    log('disabled or no host configured');
    return null;
  }

  prefixSegments = prefixSegCount(s);
  const url = buildUrl(s);
  log('connecting to', url);

  client = mqtt.connect(url, {
    username: s.username || undefined,
    password: s.password || undefined,
    clientId: `relay-backend-${Math.random().toString(16).slice(2, 8)}`,
    reconnectPeriod: 5000,
    connectTimeout: 15000,
  });

  client.on('connect', () => {
    connected = true;
    log('connected');
    const subs = ['telemetry', 'status', 'gps', 'inverter', 'shock', 'tamper', 'avail'].map(
      (t) => `${s.prefix.replace(/\/+$/, '')}/+/${t}`
    );
    client.subscribe(subs, { qos: 0 }, (err) => {
      if (err) log('subscribe error', err.message);
      else log('subscribed');
    });
  });

  client.on('reconnect', () => log('reconnecting…'));
  client.on('offline', () => (connected = false));
  client.on('error', (e) => log('error', e?.message));

  client.on('message', (topic, payload, packet) => {
    const parts = topic.split('/');
    if (parts.length < prefixSegments + 2) return;
    const deviceId = parts[prefixSegments];
    const subtopic = parts[prefixSegments + 1];
    let body;
    try {
      body = JSON.parse(payload.toString());
    } catch {
      body = payload.toString().trim();
    }
    ingest(deviceId, subtopic, body, !!(packet && packet.retain));
  });

  return client;
}

/* Drop the current connection and reconnect with the latest settings. */
export function mqttReconnect() {
  const old = client;
  connected = false;
  client = null;
  if (old) {
    try {
      old.end(true);
    } catch {
      /* ignore */
    }
  }
  return mqttConnect();
}

/* One-off connection test using explicit settings; resolves true/false. */
export function mqttTest(settings) {
  return new Promise((resolve) => {
    const s = getMqttSettings();
    const cfg = { ...s, ...settings };
    let settled = false;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        t.end(true);
      } catch {
        /* ignore */
      }
      resolve(ok);
    };

    const t = mqtt.connect(buildUrl(cfg), {
      username: cfg.username || undefined,
      password: cfg.password || undefined,
      clientId: `relay-backend-test-${Math.random().toString(16).slice(2, 6)}`,
      connectTimeout: 8000,
      reconnectPeriod: 0,
    });
    const timer = setTimeout(() => done(false), 9000);
    t.on('connect', () => done(true));
    t.on('error', () => done(false));
  });
}

function ingest(deviceId, subtopic, body, retained) {
  const device = findDeviceByDeviceId(deviceId);
  if (!device) {
    const entry = pending.get(deviceId) || {};
    entry[subtopic] = body;
    entry.lastSeen = new Date().toISOString();
    pending.set(deviceId, entry);
    return;
  }

  device.latest = device.latest || {};
  device.latest[subtopic] = body;

  /* A live (non-retained) message proves the device is up right now.
     Retained messages are delivered on subscribe and may be stale, so
     they must not flip the online flag by themselves. */
  if (subtopic === 'avail') {
    device.latest.online = body === 'online' || body === 'Online';
    device.latest.lastSeen = new Date().toISOString();
  } else if (!retained) {
    device.latest.online = true;
    device.latest.lastSeen = new Date().toISOString();
  }
  saveStore();
}

export function mqttConnected() {
  return connected;
}

export function mqttPublish(topic, payload, opts = {}) {
  if (!client || !connected) {
    log('not connected — dropping publish to', topic);
    return false;
  }
  client.publish(topic, payload, { qos: 0, retain: false, ...opts });
  return true;
}

/* Relay control. action: 'ON' | 'OFF' | 'TOGGLE'. */
export function relayCommand(deviceId, action) {
  return mqttPublish(`${prefixPath()}/${deviceId}/set`, action);
}

/* Send a remote command (SET/REBOOT/…). */
export function deviceCommand(deviceId, cmd) {
  return mqttPublish(`${prefixPath()}/${deviceId}/cmd`, cmd);
}

function prefixPath() {
  return getMqttSettings().prefix.replace(/\/+$/, '');
}
