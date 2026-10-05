import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { EmptyState } from '../components.jsx';

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [overdue, setOverdue] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [form, setForm] = useState({ customerId: '', amount: '', months: '1', method: 'mpesa' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const [p, o, c] = await Promise.all([
        api.get('/payments'),
        api.get('/payments/overdue'),
        api.get('/customers'),
      ]);
      setPayments(p.payments);
      setOverdue(o.overdue);
      setCustomers(c.customers);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function record(e) {
    e.preventDefault();
    try {
      await api.post('/payments', {
        customerId: Number(form.customerId),
        amount: Number(form.amount),
        months: Number(form.months),
        method: form.method,
      });
      setForm({ customerId: '', amount: '', months: '1', method: 'mpesa' });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Payments</h2>
        <p>Record payments and track overdue accounts</p>
      </div>
      {error && <p className="err">{error}</p>}

      {overdue.length > 0 && (
        <section className="card">
          <h3>Overdue accounts</h3>
          <div className="badges">
            {overdue.map((c) => (
              <span key={c.id} className="badge alarm">{c.name}</span>
            ))}
          </div>
          <small>These customers&apos; relays are being forced OFF until payment.</small>
        </section>
      )}

      <form className="card" onSubmit={record}>
        <h3>Record payment</h3>
        <div className="row">
          <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
            <option value="">— customer —</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Amount" inputMode="decimal" required />
          <input value={form.months} onChange={(e) => setForm({ ...form, months: e.target.value })} placeholder="Months" inputMode="numeric" />
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="mpesa">M-Pesa</option>
            <option value="cash">Cash</option>
            <option value="bank">Bank</option>
            <option value="card">Card</option>
          </select>
          <button className="btn pri" type="submit">Record</button>
        </div>
      </form>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Amount</th>
              <th>Method</th>
              <th>Months</th>
              <th>Paid until</th>
              <th>Paid at</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id}>
                <td>{p.customerName}</td>
                <td className="mono">{p.amount}</td>
                <td className="muted">{p.method}</td>
                <td>{p.months}</td>
                <td className="mono">{p.paidUntil}</td>
                <td className="muted">{p.paidAt ? new Date(p.paidAt).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr><td colSpan={6}><EmptyState icon="payment" title="No payments yet" body="Record a payment to extend a customer's paid-until date." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
