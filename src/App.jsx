import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Customers from './pages/Customers.jsx';
import Devices from './pages/Devices.jsx';
import DeviceDetail from './pages/DeviceDetail.jsx';
import Payments from './pages/Payments.jsx';
import Users from './pages/Users.jsx';
import Settings from './pages/Settings.jsx';
import './App.css';

const NAV = {
  admin: [
    ['Dashboard', '/'],
    ['Customers', '/customers'],
    ['Devices', '/devices'],
    ['Payments', '/payments'],
    ['Users', '/users'],
    ['MQTT Settings', '/settings'],
  ],
  manager: [
    ['Dashboard', '/'],
    ['Customers', '/customers'],
    ['Devices', '/devices'],
    ['Payments', '/payments'],
  ],
  supervisor: [
    ['Dashboard', '/'],
    ['Devices', '/devices'],
  ],
  customer: [],
};

export default function App() {
  const { user, loading, logout } = useAuth();

  if (loading) return <div className="boot">Loading…</div>;
  if (!user) return <Login />;

  const nav = NAV[user.role] || [];
  const isCustomer = user.role === 'customer';

  return (
    <div className="shell">
      <aside className="sidenav">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>Inverter Cloud</h1>
            <p className="sub">{user.name}</p>
          </div>
        </div>
        <nav>
          {nav.map(([label, to]) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="nav-foot">
          <span className={`role role-${user.role}`}>{user.role}</span>
          <button className="btn ghost sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="content">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          {!isCustomer && <Route path="/customers" element={<Customers />} />}
          {!isCustomer && <Route path="/devices" element={<Devices />} />}
          {!isCustomer && <Route path="/devices/:id" element={<DeviceDetail />} />}
          {(user.role === 'admin' || user.role === 'manager') && <Route path="/payments" element={<Payments />} />}
          {user.role === 'admin' && <Route path="/users" element={<Users />} />}
          {user.role === 'admin' && <Route path="/settings" element={<Settings />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
