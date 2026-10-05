# Inverter Cloud — ESP32 device management

A full-stack web app for managing a fleet of ESP32 inverter controllers.

- **Frontend** — React (Vite) SPA with role-based pages.
- **Backend** — Node.js + Express REST API, JSON-file store, JWT auth.
- **MQTT bridge** — subscribes to device telemetry and publishes relay/config
  commands back to the fleet.

Devices publish to MQTT with the same topic scheme as the
[`../hivemq-relay-controller`](../hivemq-relay-controller) firmware
(`<prefix>/<deviceId>/telemetry`, `/status`, `/gps`, `/inverter`, …). Each
device is addressed by its unique **device ID** (the ESP32's IMEI/MAC) — the same
id you register in the backend when onboarding a device.

## Users & roles

| Role | Can do |
| --- | --- |
| **admin** | Everything — users, customers, devices, payments, config |
| **manager** | Manage devices, customers and payments |
| **supervisor** | View devices and configure them (edit + push config) |
| **customer** | Only their own **inverter data** + next **payment due**. No online status or other telemetry. |

## Payment enforcement

Every customer has a `paidUntil` date. When an account is overdue, the backend
publishes `OFF` to each of that customer's devices (`<prefix>/<id>/set`) every
5 minutes. The **admin** (or manager) can set a per-customer `paymentOverride` to
keep a device running regardless, or record a payment to clear the cutoff.

## Run it

```bash
npm install
cp .env.example .env            # set MQTT_HOST/USERNAME/PASSWORD + JWT_SECRET

npm run server                  # backend on :4000
npm run dev                     # frontend (Vite) on :5173, proxies /api → :4000
npm run seed                    # optional demo data (admin, manager, customers…)
```

Demo users (after `npm run seed`):

| Email | Password | Role |
| --- | --- | --- |
| admin@example.com | admin123 | admin |
| manager@example.com | manager123 | manager |
| supervisor@example.com | super123 | supervisor |
| alice@example.com | alice123 | customer (paid) |
| bob@example.com | bob123 | customer (overdue) |

Without seeding, an admin is auto-created from `ADMIN_EMAIL`/`ADMIN_PASSWORD`.

## REST API

| Method | Path | Roles | Description |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | public | `{email,password}` → `{token,user}` |
| GET | `/api/auth/me` | any | current user |
| GET/POST/PUT/DELETE | `/api/users` | admin | user management |
| GET/POST/PUT/DELETE | `/api/customers` | admin, manager | customer CRUD (+ `paymentOverride`) |
| GET/POST/PUT/DELETE | `/api/devices` | admin, manager | device CRUD (unique `deviceId`/`serial`) |
| GET | `/api/devices/:id` | admin, manager, supervisor | device detail + live telemetry |
| PUT | `/api/devices/:id/config` | admin, manager, supervisor | store device config |
| POST | `/api/devices/:id/push` | admin, manager, supervisor | push config to device over MQTT (`SET key value`) |
| POST | `/api/devices/:id/relay` | admin, manager | `{action:"ON"\|"OFF"\|"TOGGLE"}` |
| GET/POST | `/api/payments` | admin, manager | record payments, list history |
| GET | `/api/payments/overdue` | admin, manager | overdue accounts |
| GET | `/api/me/dashboard` | customer | own inverter data + payment due |
| GET | `/api/dashboard` | any staff | role-aware summary |
| GET | `/api/health` | public | liveness + MQTT status |

Customer accounts are blocked at the API layer from everything except
`/api/me/dashboard`, which returns only inverter readings and payment state.

## Data model

- `users` — email/password (bcrypt), `role`, optional `customerId`.
- `customers` — contact info, `paidUntil`, `paymentOverride`.
- `devices` — unique `deviceId` (IMEI) + `serial`, `customerId`, `config`,
  latest MQTT `telemetry`.
- `payments` — payment history (amount, method, months, dates).

Persistence is a JSON document store (`server/data.json`) behind `store.js` — swap
the module for SQLite/Postgres without touching routes when you outgrow it.

## How device data gets in

The backend's MQTT bridge subscribes to `<prefix>/+/telemetry`, `/status`, `/gps`,
`/inverter`, `/shock`, `/tamper` and `/avail`, matches the device by `deviceId`, and
stores the latest payload under `device.latest`. Set `MQTT_HOST`, `MQTT_PORT=8884`,
`MQTT_USERNAME`, `MQTT_PASSWORD` and `MQTT_PREFIX=esp32/relay` in `.env`.
