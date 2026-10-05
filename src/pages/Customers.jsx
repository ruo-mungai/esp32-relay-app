import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { EmptyState } from '../components.jsx';

const EMPTY = { name: '', email: '', phone: '', address: '' };

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const q = new URLSearchParams({ search, status }).toString();
      const r = await api.get(`/customers?${q}`);
      setCustomers(r.customers);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [search, status]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      if (editing) await api.put(`/customers/${editing}`, form);
      else await api.post('/customers', form);
      setForm(EMPTY);
      setEditing(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function edit(c) {
    setEditing(c.id);
    setForm({ name: c.name, email: c.email, phone: c.phone, address: c.address });
  }

  async function toggleOverride(c) {
    try {
      await api.put(`/customers/${c.id}`, { paymentOverride: !c.paymentOverride });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(c) {
    if (!confirm(`Delete ${c.name}?`)) return;
    try {
      await api.del(`/customers/${c.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Customers</h2>
        <p>Manage accounts and payment status</p>
      </div>
      <div className="row toolbar">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone or serial…" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="paid">Paid</option>
          <option value="overdue">Overdue</option>
          <option value="override">Override</option>
          <option value="none">No payment</option>
        </select>
      </div>

      {error && <p className="err">{error}</p>}

      <form className="card" onSubmit={submit}>
        <h3>{editing ? 'Edit customer' : 'Add customer'}</h3>
        <div className="row">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" required />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" />
        </div>
        <div className="row">
          <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" />
          <button className="btn pri" disabled={busy} type="submit">
            {editing ? 'Save' : 'Add'}
          </button>
          {editing && (
            <button className="btn ghost" type="button" onClick={() => { setEditing(null); setForm(EMPTY); }}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Contact</th>
              <th>Devices</th>
              <th>Payment</th>
              <th>Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="muted">{c.email}<br />{c.phone}</td>
                <td>{c.deviceCount}</td>
                <td>
                  <span className={`badge ${c.payment.status === 'overdue' ? 'alarm' : 'ok'}`}>
                    {c.payment.status}
                  </span>
                </td>
                <td className="muted">{c.paidUntil || '—'}</td>
                <td className="actions">
                  <button className="btn ghost sm" onClick={() => edit(c)}>Edit</button>
                  <button className="btn ghost sm" onClick={() => toggleOverride(c)}>
                    {c.paymentOverride ? 'Clear override' : 'Override'}
                  </button>
                  <button className="btn danger sm" onClick={() => remove(c)}>Delete</button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr><td colSpan={6}><EmptyState icon="users" title="No customers found" body="Try a different search, or add a customer above." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
