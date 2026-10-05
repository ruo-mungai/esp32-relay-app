import 'dotenv/config';
import { loadStore, saveStore, nextId, data } from './store.js';
import { hashPassword } from './auth.js';

loadStore();
const db = data();

const mk = (obj) => ({ id: nextId(), ...obj });

function reset() {
  db.users = [];
  db.customers = [];
  db.devices = [];
  db.payments = [];
  db.meta.seq = 0;
}

reset();

/* Users */
const admin = mk({ email: 'admin@example.com', password: hashPassword('admin123'), name: 'System Admin', role: 'admin', customerId: null, createdAt: new Date().toISOString() });
const manager = mk({ email: 'manager@example.com', password: hashPassword('manager123'), name: 'Area Manager', role: 'manager', customerId: null, createdAt: new Date().toISOString() });
const supervisor = mk({ email: 'supervisor@example.com', password: hashPassword('super123'), name: 'Field Supervisor', role: 'supervisor', customerId: null, createdAt: new Date().toISOString() });
db.users.push(admin, manager, supervisor);

/* Customers */
const mkCustomer = (name, paidUntil) => mk({
  name, email: `${name.toLowerCase().replace(/[^a-z]/g, '')}@example.com`, phone: '+254700000000',
  address: 'Nairobi, KE', paidUntil, paymentOverride: false, createdAt: new Date().toISOString(),
});
const alice = mkCustomer('Alice Wanjiku', new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10));
const bob = mkCustomer('Bob Otieno', new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10));
const carol = mkCustomer('Carol Muthoni', null);
db.customers.push(alice, bob, carol);

/* Customer user accounts */
db.users.push(mk({ email: 'alice@example.com', password: hashPassword('alice123'), name: 'Alice Wanjiku', role: 'customer', customerId: alice.id, createdAt: new Date().toISOString() }));
db.users.push(mk({ email: 'bob@example.com', password: hashPassword('bob123'), name: 'Bob Otieno', role: 'customer', customerId: bob.id, createdAt: new Date().toISOString() }));

/* Devices */
const mkDevice = (deviceId, serial, name, customerId) => mk({
  deviceId, serial, name, customerId, active: true, relayOverride: false, config: {}, latest: null, createdAt: new Date().toISOString(),
});
db.devices.push(
  mkDevice('861234567890123', 'SN-0001', 'Inverter Alpha', alice.id),
  mkDevice('861234567890456', 'SN-0002', 'Inverter Beta', bob.id),
  mkDevice('861234567890789', 'SN-0003', 'Inverter Gamma', carol.id)
);

/* Payments */
db.payments.push(mk({ customerId: alice.id, customerName: alice.name, amount: 3500, method: 'mpesa', months: 1, paidUntil: alice.paidUntil, paidAt: new Date().toISOString() }));

saveStore();
console.log('Seeded demo data:');
console.log('  admin@example.com / admin123      (admin)');
console.log('  manager@example.com / manager123  (manager)');
console.log('  supervisor@example.com / super123 (supervisor)');
console.log('  alice@example.com / alice123      (customer, paid)');
console.log('  bob@example.com / bob123          (customer, overdue)');
console.log('  carol (customer, no payment yet)');
