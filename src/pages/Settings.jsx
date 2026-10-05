import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [form, setForm] = useState({
    enabled: true,
    host: '',
    port: 8884,
    devicePort: 8883,
    username: '',
    password: '',
    prefix: 'esp32/relay',
    url: '',
  });
  const [hasPassword, setHasPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  async function load() {
    try {
      const r = await api.get('/settings/mqtt');
      const s = r.settings;
      setForm({
        enabled: s.enabled,
        host: s.host,
        port: s.port,
        devicePort: s.devicePort,
        username: s.username,
        password: '',
        prefix: s.prefix,
        url: s.url || '',
      });
      setHasPassword(s.hasPassword);
      setStatus(r.status);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await api.put('/settings/mqtt', form);
      setHasPassword(r.settings.hasPassword);
      setStatus(r.status);
      setNote('Saved and reconnected.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await api.post('/settings/mqtt/test', form);
      setNote(r.connected ? 'Connection successful.' : 'Connection failed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function push() {
    setBusy(true);
    setError('');
    setNote('');
    try {
      const r = await api.post('/settings/mqtt/push');
      setNote(`Pushed ${r.sent} commands to ${r.devices} devices.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>MQTT settings</h2>
        <p>Configure the broker the backend bridges to — devices only need their device ID.</p>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="card-h">
          <h3>Broker connection</h3>
          <span className={`badge ${status?.connected ? 'ok' : 'alarm'}`}>
            {status?.connected ? 'connected' : 'offline'}
          </span>
        </div>

        <label className="toggle" style={{ marginBottom: 14 }}>
          <input type="checkbox" checked={form.enabled} onChange={(e) => set('enabled', e.target.checked)} />
          <span className="tk" />
          <span className="tl">
            <strong>Enable MQTT bridge</strong>
            <small>Subscribe to device telemetry and publish commands</small>
          </span>
        </label>

        <form onSubmit={save}>
          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Broker host</label>
              <input value={form.host} onChange={(e) => set('host', e.target.value)} placeholder="your-cluster.s1.eu.hivemq.cloud" required />
            </div>
            <div className="field">
              <label>WebSocket port</label>
              <input value={form.port} onChange={(e) => set('port', Number(e.target.value) || 8884)} type="number" />
            </div>
            <div className="field">
              <label>Device port</label>
              <input value={form.devicePort} onChange={(e) => set('devicePort', Number(e.target.value) || 8883)} type="number" />
            </div>
          </div>

          <div className="row">
            <div className="field">
              <label>Username</label>
              <input value={form.username} onChange={(e) => set('username', e.target.value)} autoComplete="off" />
            </div>
            <div className="field">
              <label>Password</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder={hasPassword ? '•••• saved — leave blank to keep' : 'password'}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="row">
            <div className="field" style={{ flex: 2 }}>
              <label>Topic prefix</label>
              <input value={form.prefix} onChange={(e) => set('prefix', e.target.value)} placeholder="esp32/relay" />
            </div>
            <div className="field" style={{ flex: 2 }}>
              <label>WebSocket URL override (optional)</label>
              <input value={form.url} onChange={(e) => set('url', e.target.value)} placeholder="wss://host:8884/mqtt" />
            </div>
          </div>

          <small style={{ color: 'var(--muted)' }}>
            The WebSocket port (default 8884) is what this backend uses; the device port (default 8883) is what
            your ESP32s connect to. Both can live on the same HiveMQ cluster.
          </small>

          {error && <p className="err" style={{ marginTop: 12 }}>{error}</p>}
          {note && <p className="ok-note" style={{ marginTop: 12 }}>{note}</p>}

          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn pri" disabled={busy} type="submit">Save &amp; reconnect</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={test}>Test connection</button>
            <button className="btn ghost" type="button" disabled={busy || !status?.connected} onClick={push}>
              Push to devices
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
