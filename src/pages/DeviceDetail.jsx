import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';

export default function DeviceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const canManage = user.role === 'admin' || user.role === 'manager';
  const canConfigure = user.role !== 'customer';
  const [device, setDevice] = useState(null);
  const [customer, setCustomer] = useState(null);
  const [error, setError] = useState('');
  const [cfg, setCfg] = useState({});
  const [cfgText, setCfgText] = useState('');
  const [toast, setToast] = useState('');

  async function load() {
    try {
      const r = await api.get(`/devices/${id}`);
      setDevice(r.device);
      setCustomer(r.customer);
      setCfg(r.device.config || {});
      setCfgText(JSON.stringify(r.device.config || {}, null, 2));
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [id]);

  async function relay(action) {
    try {
      const r = await api.post(`/devices/${id}/relay`, { action });
      setToast(`Relay ${action} → ${r.ok ? 'sent' : 'bridge offline'}`);
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveConfig() {
    try {
      let parsed;
      try {
        parsed = JSON.parse(cfgText);
      } catch {
        setError('Config must be valid JSON');
        return;
      }
      await api.put(`/devices/${id}/config`, { config: parsed });
      setCfg(parsed);
      setToast('Config saved');
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setError(e.message);
    }
  }

  async function pushConfig() {
    try {
      const r = await api.post(`/devices/${id}/push`, { config: cfg });
      setToast(`Pushed ${r.sent?.length || 0} keys to device`);
      setTimeout(() => setToast(''), 3000);
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <p className="err">{error}</p>;
  if (!device) return <p className="empty">Loading…</p>;

  const l = device.latest || {};
  const gps = l.gps;
  const sensors = l.sensors;
  const inverter = l.inverter;
  const cell = l.cell;
  const status = l.status;

  return (
    <div>
      <div className="card-h">
        <div>
          <h2>{device.name}</h2>
          <p className="sub mono">
            {device.deviceId} · {device.serial}
            {customer ? ` · ${customer.name}` : ''}
          </p>
        </div>
        <span className={`badge ${l.online ? 'ok' : 'alarm'}`}>{l.online ? 'online' : 'offline'}</span>
      </div>

      {toast && <div className="toast ok">{toast}</div>}

      {canManage && (
        <section className="card">
          <h3>Relay</h3>
          <div className="row">
            <button className="btn" onClick={() => relay('ON')}>ON</button>
            <button className="btn danger" onClick={() => relay('OFF')}>OFF</button>
            <button className="btn ghost" onClick={() => relay('TOGGLE')}>Toggle</button>
            {customer && customer.payment.status === 'overdue' && !customer.paymentOverride && (
              <span className="badge alarm">payment overdue — relay cut</span>
            )}
          </div>
        </section>
      )}

      <section className="grid" style={{ marginTop: 16 }}>
        <div className="card stat">
          <h3>Location</h3>
          <p className="big">
            {gps?.valid ? `${gps.lat.toFixed(5)}, ${gps.lon.toFixed(5)}` : 'no fix'}
          </p>
          <small>{gps?.valid ? `${gps.sats} sats · ${Number(gps.speed).toFixed(1)} km/h${gps.dummy ? ' (sim)' : ''}` : '—'}</small>
          {gps?.valid && (
            <a className="maplink" href={`https://www.google.com/maps?q=${gps.lat},${gps.lon}`} target="_blank" rel="noreferrer">
              open map ↗
            </a>
          )}
        </div>

        <div className="card stat">
          <h3>Shock / Tamper</h3>
          <p className="big">
            <span className={`badge ${sensors?.shock ? 'alarm' : 'ok'}`}>shock {sensors?.shock ? 'ALARM' : 'ok'}</span>{' '}
            <span className={`badge ${sensors?.tamper ? 'alarm' : 'ok'}`}>tamper {sensors?.tamper ? 'OPEN' : 'closed'}</span>
          </p>
          <small>{sensors?.shockCount ?? 0} shock · {sensors?.tamperCount ?? 0} tamper events</small>
        </div>

        <div className="card stat">
          <h3>Inverter · RS485</h3>
          <p className="big">
            {inverter?.ok ? `${Number(inverter.acVolt).toFixed(0)} V` : 'no data'}
          </p>
          <small>
            {inverter?.ok
              ? `${Number(inverter.power).toFixed(0)} W · battery ${Number(inverter.soc).toFixed(0)}%`
              : inverter?.dummy ? 'simulated' : '—'}
          </small>
        </div>

        <div className="card stat">
          <h3>Connectivity</h3>
          <p className="big">{status?.transport === 'cell' ? 'Cellular' : 'Wi-Fi'}</p>
          <small>
            {cell?.online ? `${cell.operator || 'online'} · ${cell.signal}/31` : status?.ssid || '—'}
          </small>
        </div>
      </section>

      {inverter && (
        <section className="card" style={{ marginTop: 16 }}>
          <h3>Inverter readings</h3>
          <div className="readings">
            <div className="reading"><label>AC output</label><b>{Number(inverter.acVolt).toFixed(0)} V</b><small>{Number(inverter.acAmp).toFixed(1)} A</small></div>
            <div className="reading"><label>Load</label><b>{Number(inverter.power).toFixed(0)} W</b><small>{Number(inverter.load).toFixed(0)} %</small></div>
            <div className="reading"><label>Battery</label><b>{Number(inverter.dcVolt).toFixed(1)} V</b><small>SOC {Number(inverter.soc).toFixed(0)} %</small></div>
            <div className="reading"><label>Temperature</label><b>{Number(inverter.temp).toFixed(1)} °C</b><small>{inverter.dummy ? 'simulated' : 'live'}</small></div>
          </div>
        </section>
      )}

      {canConfigure && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h3>Device configuration</h3>
            <div className="row" style={{ margin: 0 }}>
              <button className="btn ghost sm" onClick={saveConfig}>Save</button>
              <button className="btn pri sm" onClick={pushConfig}>Push to device</button>
            </div>
          </div>
          <textarea className="cfg-text" rows={12} value={cfgText} onChange={(e) => setCfgText(e.target.value)} spellCheck="false" />
          <small>JSON keys map to the firmware's SET commands (apn, netmode, host, port, gpio, shockact, …). Push sends each as <code>SET key value</code> over MQTT.</small>
        </section>
      )}

      <details className="card" style={{ marginTop: 16 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Raw telemetry</summary>
        <pre className="log">{JSON.stringify(l, null, 2)}</pre>
      </details>
    </div>
  );
}
