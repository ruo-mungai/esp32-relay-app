import { useEffect, useState } from 'react';
import { useAuth } from '../auth.jsx';
import { api } from '../api.js';
import { EmptyState } from '../components.jsx';

const ICONS = {
  customers: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  devices: (
    <path d="M12 3l7 4v5c0 4.4-3 8-7 9-4-1-7-4.6-7-9V7l7-4Z" />
  ),
  overdue: (
    <>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  mqtt: (
    <path d="M17.5 19a4.5 4.5 0 0 0 .5-9 6 6 0 0 0-11.6 1.6A3.5 3.5 0 0 0 6.5 19Z" />
  ),
};

function Stat({ label, value, hint, icon, tone }) {
  return (
    <div className="card stat">
      <div className="stat-head">
        <span className="stat-icon" data-tone={tone}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {ICONS[icon]}
          </svg>
        </span>
        <h3>{label}</h3>
      </div>
      <p className="big">{value}</p>
      {hint && <small>{hint}</small>}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [mine, setMine] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user.role === 'customer') {
      api.get('/me/dashboard').then(setMine).catch((e) => setError(e.message));
    } else {
      api.get('/dashboard').then((r) => setSummary(r.summary)).catch((e) => setError(e.message));
    }
  }, [user.role]);

  if (error) return <p className="err">{error}</p>;

  if (user.role === 'customer') {
    if (!mine) return <p className="empty">Loading…</p>;
    const pay = mine.customer.payment;
    return (
      <div>
        <div className="page-head">
          <h2>Welcome, {mine.customer.name}</h2>
          <p>Your inverter and payment status</p>
        </div>
        <section className="grid" style={{ marginTop: 20 }}>
          <div className="card stat">
            <h3>Next payment due</h3>
            <p className="big">{pay.paidUntil || 'Overdue'}</p>
            <small className={pay.status === 'overdue' ? 'warn' : ''}>
              {pay.status === 'overdue' ? 'Account overdue — contact us to reconnect' : 'Account in good standing'}
            </small>
          </div>
        </section>

        <section className="card" style={{ marginTop: 16 }}>
          <h3>Inverter</h3>
          {mine.devices.length === 0 ? (
            <EmptyState icon="device" title="No devices linked" body="Your installer will add your inverter to your account." />
          ) : (
            <div className="readings">
              {mine.devices.map((d) => (
                <div className="reading" key={d.serial}>
                  <label>{d.name}</label>
                  <b>
                    {d.inverter?.ok
                      ? `${Number(d.inverter.acVolt).toFixed(0)} V · ${Number(d.inverter.power).toFixed(0)} W`
                      : 'No data yet'}
                  </b>
                  <small>
                    {d.inverter?.ok
                      ? `Battery ${Number(d.inverter.soc).toFixed(0)}% · Load ${Number(d.inverter.load).toFixed(0)}%`
                      : 'Readings appear once the inverter reports'}
                  </small>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  if (!summary) return <p className="empty">Loading…</p>;
  return (
    <div>
      <div className="page-head">
        <h2>Dashboard</h2>
        <p>Fleet overview</p>
      </div>
      <section className="grid" style={{ marginTop: 20 }}>
        <Stat label="Customers" value={summary.customers} icon="customers" tone="blue" />
        <Stat label="Devices" value={summary.devices} hint={`${summary.online} online`} icon="devices" tone="cyan" />
        <Stat label="Overdue accounts" value={summary.overdue} icon="overdue" tone={summary.overdue ? 'red' : 'green'} />
        <Stat label="MQTT bridge" value={summary.mqtt ? 'Connected' : 'Offline'} icon="mqtt" tone={summary.mqtt ? 'green' : 'red'} />
      </section>
    </div>
  );
}
