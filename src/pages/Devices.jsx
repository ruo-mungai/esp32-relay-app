import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { EmptyState } from '../components.jsx';

export default function Devices() {
  const { user } = useAuth();
  const canManage = user.role === 'admin' || user.role === 'manager';
  const [devices, setDevices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [discovered, setDiscovered] = useState([]);
  const [discoverPick, setDiscoverPick] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  async function loadDiscovered() {
    try {
      const r = await api.get('/devices/discover');
      setDiscovered(r.devices);
    } catch (e) {
      setError(e.message);
    }
  }

  async function load() {
    try {
      const q = new URLSearchParams({ search }).toString();
      const r = await api.get(`/devices?${q}`);
      setDevices(r.devices);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (canManage) api.get('/customers').then((r) => setCustomers(r.customers)).catch(() => {});
  }, [canManage]);

  useEffect(() => {
    if (canManage) loadDiscovered();
  }, [canManage]);

  const [form, setForm] = useState({ deviceId: '', serial: '', name: '', customerId: '' });

  function pickDiscovered(deviceId) {
    setDiscoverPick(deviceId);
    if (!deviceId) return;
    const d = discovered.find((x) => x.deviceId === deviceId);
    if (!d) return;
    setForm((f) => ({ ...f, deviceId: d.deviceId, serial: d.serial, name: d.name }));
  }

  async function add(e) {
    e.preventDefault();
    try {
      await api.post('/devices', {
        ...form,
        customerId: form.customerId ? Number(form.customerId) : null,
      });
      setForm({ deviceId: '', serial: '', name: '', customerId: '' });
      setDiscoverPick('');
      load();
      loadDiscovered();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(d) {
    if (!confirm(`Delete ${d.name}?`)) return;
    try {
      await api.del(`/devices/${d.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Devices</h2>
        <p>Fleet overview and device registration</p>
      </div>
      <div className="row toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, serial or device ID…" />
      </div>

      {error && <p className="err">{error}</p>}

      {canManage && (
        <form className="card" onSubmit={add}>
          <h3>Register device</h3>
          <div className="row">
            <select value={discoverPick} onChange={(e) => pickDiscovered(e.target.value)}>
              <option value="">— pick a discovered device (auto-fills) —</option>
              {discovered.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.name} · {d.deviceId}
                </option>
              ))}
            </select>
            <button type="button" className="btn ghost" onClick={loadDiscovered}>Refresh</button>
          </div>
          <div className="row">
            <input value={form.deviceId} onChange={(e) => setForm({ ...form, deviceId: e.target.value })} placeholder="Device ID (IMEI)" required />
            <input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} placeholder="Serial number (unique)" required />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
          </div>
          <div className="row">
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
              <option value="">— assign customer —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button className="btn pri" type="submit">Add device</button>
          </div>
        </form>
      )}

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Device ID</th>
              <th>Serial</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {devices.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td className="mono">{d.deviceId}</td>
                <td className="mono">{d.serial}</td>
                <td>
                  <span className={`badge ${d.latest?.online ? 'ok' : ''}`}>
                    {d.latest?.online ? 'online' : 'offline'}
                  </span>
                </td>
                <td className="actions">
                  <Link className="btn ghost sm" to={`/devices/${d.id}`}>Open</Link>
                  {canManage && <button className="btn danger sm" onClick={() => remove(d)}>Delete</button>}
                </td>
              </tr>
            ))}
            {devices.length === 0 && (
              <tr><td colSpan={5}><EmptyState icon="device" title="No devices found" body={canManage ? 'Register a device above to get started.' : 'No devices match your search.'} /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
