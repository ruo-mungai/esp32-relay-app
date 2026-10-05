import { useEffect, useState } from 'react';
import { api } from '../api.js';

const ROLES = ['admin', 'manager', 'supervisor', 'customer'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ email: '', password: '', name: '', role: 'customer', customerId: '' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const [u, c] = await Promise.all([api.get('/users'), api.get('/customers')]);
      setUsers(u.users);
      setCustomers(c.customers);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e) {
    e.preventDefault();
    try {
      await api.post('/users', {
        ...form,
        customerId: form.role === 'customer' && form.customerId ? Number(form.customerId) : null,
      });
      setForm({ email: '', password: '', name: '', role: 'customer', customerId: '' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeRole(u, role) {
    try {
      await api.put(`/users/${u.id}`, { role, ...(role === 'customer' ? { customerId: u.customerId } : {}) });
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function remove(u) {
    if (!confirm(`Delete ${u.email}?`)) return;
    try {
      await api.del(`/users/${u.id}`);
      load();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Users</h2>
        <p>Manage team accounts and roles</p>
      </div>
      {error && <p className="err">{error}</p>}

      <form className="card" onSubmit={add}>
        <h3>Add user</h3>
        <div className="row">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" required />
          <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" required />
        </div>
        <div className="row">
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {form.role === 'customer' && (
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
              <option value="">— customer —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button className="btn pri" type="submit">Add user</button>
        </div>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td className="mono">{u.email}</td>
                <td>
                  <span className={`role role-${u.role}`}>{u.role}</span>
                </td>
                <td className="actions">
                  <select value={u.role} onChange={(e) => changeRole(u, e.target.value)}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button className="btn danger sm" onClick={() => remove(u)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
