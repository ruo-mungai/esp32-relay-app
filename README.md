# ESP32 Relay Controller

Web dashboard for the ESP32 single-relay board in
[`../hivemq-relay-controller`](../hivemq-relay-controller). Relay commands travel
through an MQTT broker, so the dashboard and the device do **not** need to share
a network.

## Two transports

| Mode | Transport | Needs same network? |
| --- | --- | --- |
| **Cloud · MQTT** (default) | `wss://<host>:8884/mqtt` | No — works from anywhere |
| **Local · HTTP** | `http://<device-ip>/api/*` + `/ws` | Yes |

`Local · HTTP` is disabled automatically when the page is served over HTTPS
(GitHub Pages, Netlify, …), because browsers block a secure page from talking to
a plain-HTTP device.

## MQTT contract

Topic prefix defaults to `esp32/relay` and must match the device settings.

| Topic | Direction | Payload |
| --- | --- | --- |
| `<prefix>/set` | client → device | `ON`, `OFF`, `TOGGLE`, `test`, or `{"state":"ON","seconds":30}` |
| `<prefix>/state` | device → client, retained | `ON` / `OFF`, or `{"state","reason","rssi"}` |
| `<prefix>/avail` | device → client, retained | `online` / `offline` (LWT) |
| `<prefix>/status` | device → client, retained | full device snapshot (same JSON as `/api/status`) |

Commands are published with `retain: false` on purpose — a retained command
would be replayed to the device every time it reconnects.

Because `state` and `avail` are retained, the dashboard renders the last known
state immediately, and shows the device as offline if it has dropped off.

## Setup

1. In the HiveMQ Cloud console, confirm the **MQTT over WebSocket listener is
   enabled** for your cluster. Port `8883` is TCP only and will not work from a
   browser; the WebSocket listener is `8884`.
2. `npm install`
3. `npm run dev` and open the printed URL.
4. In the app, switch to **Cloud · MQTT**, then enter the cluster host, port,
   username, password, and topic prefix. Hit **Connect**.

Broker credentials are entered at runtime and kept in `localStorage`. They are
never written to the bundle or sent anywhere but the broker, so the deployed
site is safe to host publicly — but note that anyone with access to that browser
profile can read the saved password. Prefer a broker account scoped to just this
device's topics.

## Deploying

`gh-pages` is not used. `.github/workflows/deploy-pages.yml` builds and
publishes on every push to `main`.

1. **Settings → Pages → Source**: set to **GitHub Actions**.
2. Push to `main`.

`vite.config.js` sets `base: "./"`, so the same build works from a project
subpath (`/<repo>/`) and from a root user site without edits.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build into `dist/` |
| `npm run lint` | Oxlint |
