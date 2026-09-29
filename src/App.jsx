import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_TARGET,
  connectSocket,
  getLogs,
  getStatus,
  loadAuth,
  loadTarget,
  pulseRelay,
  reboot,
  saveAuth,
  saveTarget,
  setRelay,
} from "./api";
import { connectBroker, loadBroker, saveBroker, sendCommand } from "./broker";
import "./App.css";

const POLL_MS = 4000;
const LOG_LIMIT = 60;

function fmtUptime(sec) {
  if (!sec && sec !== 0) return "—";
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

function fmtCountdown(sec) {
  if (!sec) return null;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function Pill({ ok, children }) {
  return <span className={`pill ${ok ? "ok" : "bad"}`}>{children}</span>;
}

/* GitHub Pages serves over HTTPS. A secure page may not talk to a plain-HTTP
   device (mixed content is blocked), so local mode is unavailable there. */
const isSecureRemote =
  location.protocol === "https:" &&
  !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

export default function App() {
  const [mode, setMode] = useState("cloud");

  const [target, setTarget] = useState(loadTarget());
  const [draftTarget, setDraftTarget] = useState(loadTarget());
  const [auth, setAuth] = useState(loadAuth() || { username: "admin", password: "" });

  const [broker, setBroker] = useState(loadBroker());
  const [draftBroker, setDraftBroker] = useState(loadBroker());

  const [status, setStatus] = useState(null);
  const [deviceOnline, setDeviceOnline] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [link, setLink] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  const wsRef = useRef(null);
  const mqttRef = useRef(null);
  const lastLog = useRef(0);

  const flash = useCallback((kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 3200);
  }, []);

  /* ══════════════════════════════════════════════════════════════════
     Cloud mode — talk to the broker, so the app works from anywhere.
     The device publishes retained state/avail/status, so the last known
     values arrive immediately even before the device is reachable.
     ══════════════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (mode !== "cloud") return;
    if (!broker.host || !broker.username) {
      setError("Enter your broker host and username to connect.");
      return;
    }

    let client;
    try {
      client = connectBroker(broker, {
        onRelay: (s) =>
          setStatus((prev) => (prev ? { ...prev, relay: s.on, reason: s.reason } : prev)),
        onAvail: (up) => setDeviceOnline(up),
        /* The status snapshot carries everything except the freshest relay
           transition, so keep relay+reason from the state topic as a pair. */
        onStatus: (s) =>
          setStatus((p) => (p && p.relay !== undefined ? { ...s, relay: p.relay, reason: p.reason } : s)),
        onConnection: (state, msg) => {
          setLink(state);
          if (state === "connected") setError("");
          if (state === "error") setError(msg || "Broker connection failed.");
        },
      });
      mqttRef.current = client;
    } catch (e) {
      setError(e.message);
    }

    return () => {
      client?.end(true);
      mqttRef.current = null;
      setLink("idle");
    };
  }, [mode, broker]);

  /* ══════════════════════════════════════════════════════════════════
     Local mode — direct HTTP/WS to the device on the same LAN.
     ══════════════════════════════════════════════════════════════════ */
  const pull = useCallback(async (t) => {
    try {
      const s = await getStatus(t);
      setStatus(s);
      setError("");
      return s;
    } catch (e) {
      setError(e.message);
      setStatus(null);
      return null;
    }
  }, []);

  useEffect(() => {
    if (mode !== "local") return;
    let alive = true;
    const boot = async () => {
      await pull(target);
      if (!alive) return;
      try {
        const l = await getLogs(target);
        if (!alive) return;
        lastLog.current = l.last || 0;
        setLogs(l.lines.slice(-LOG_LIMIT));
      } catch {
        /* logs are optional */
      }
    };
    boot();

    const timer = setInterval(() => {
      pull(target);
      if (lastLog.current) {
        getLogs(target, lastLog.current)
          .then((l) => {
            lastLog.current = l.last || lastLog.current;
            if (l.lines?.length) setLogs((prev) => [...prev, ...l.lines].slice(-LOG_LIMIT));
          })
          .catch(() => {});
      }
    }, POLL_MS);

    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [mode, target, pull]);

  useEffect(() => {
    if (mode !== "local") return;
    const ws = connectSocket(
      target,
      (s) => {
        setStatus(s);
        setError("");
      },
      (text) => setLogs((prev) => [...prev, text].slice(-LOG_LIMIT)),
      (s) => setLink(s)
    );
    wsRef.current = ws;
    return () => {
      ws?.close();
      wsRef.current = null;
    };
  }, [mode, target]);

  /* ── commands ── */
  async function localCommand(fn, okMsg) {
    setBusy(true);
    try {
      const r = await fn();
      if (r && typeof r.relay === "boolean") {
        setStatus((s) => (s ? { ...s, relay: r.relay, reason: r.reason, autoOffIn: r.autoOffIn } : s));
      }
      if (okMsg) flash("ok", okMsg);
      return r;
    } catch (e) {
      flash("err", e.message);
    } finally {
      setBusy(false);
    }
  }

  function cloudCommand(action, seconds, okMsg) {
    if (!mqttRef.current) {
      flash("err", "Not connected to the broker.");
      return;
    }
    sendCommand(mqttRef.current, broker, action, seconds);
    if (okMsg) flash("ok", okMsg);
  }

  const isCloud = mode === "cloud";
  const online = isCloud ? deviceOnline : !!status;
  const ready = online && !busy;
  const on = status?.relay;
  const countdown = fmtCountdown(status?.autoOffIn);

  function toggleRelay() {
    if (isCloud) cloudCommand("toggle", 0, on ? "Relay off" : "Relay on");
    else localCommand(() => setRelay(target, "toggle"), on ? "Relay off" : "Relay on");
  }

  function startTimer(s) {
    if (isCloud) cloudCommand("on", s, `On for ${s >= 60 ? `${s / 60} min` : `${s} s`}`);
    else localCommand(() => setRelay(target, "on", s), `On for ${s >= 60 ? `${s / 60} min` : `${s} s`}`);
  }

  function runTest() {
    if (isCloud) cloudCommand("test", 0, "Relay pulsed");
    else localCommand(() => pulseRelay(target), "Relay pulsed");
  }

  function applyTarget() {
    const v = draftTarget.trim().replace(/\/+$/, "");
    if (!v) return;
    saveTarget(v);
    saveAuth(auth.password ? auth : null);
    setTarget(v);
    setLogs([]);
    lastLog.current = 0;
  }

  function applyBroker() {
    saveBroker(draftBroker);
    setBroker(draftBroker);
  }

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <path d="M13 2 4.5 13H11l-1 9 8.5-11H12l1-9Z" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <h1>{status?.devName || "ESP32 Relay"}</h1>
            <p className="sub">
              {status?.version || "connecting…"}
              {status?.ip ? ` · ${status.ip}` : ""}
            </p>
          </div>
          <div className="spacer" />
          <Pill ok={online}>
            {online ? (status?.mqtt ? "MQTT live" : "online") : isCloud ? "Device offline" : "Offline"}
          </Pill>
        </div>
      </header>

      {/* ── transport switch ── */}
      <section className="card">
        <div className="seg">
          <button
            className={isCloud ? "on" : ""}
            onClick={() => setMode("cloud")}
            type="button"
          >
            Cloud · MQTT
          </button>
          <button
            className={!isCloud ? "on" : ""}
            onClick={() => setMode("local")}
            type="button"
            disabled={isSecureRemote}
            title={
              isSecureRemote
                ? "This page is served over HTTPS, so the browser blocks direct HTTP/WebSocket access to a local device. Use Cloud · MQTT."
                : "Direct connection to the device on the same network"
            }
          >
            Local · HTTP
          </button>
        </div>
        <small>
          {isSecureRemote
            ? "Hosted over HTTPS, so direct device access is blocked by the browser. Control travels through the MQTT broker."
            : isCloud
              ? "Control from anywhere via the broker — the browser and the device never need to share a network."
              : "Direct connection to the device. Requires being on the same Wi-Fi network."}
        </small>
      </section>

      {/* ── power control ── */}
      <section className="card power">
        <button
          className={`power-btn ${on ? "on" : ""}`}
          disabled={!ready}
          onClick={toggleRelay}
          aria-pressed={!!on}
        >
          <span className="ring" />
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M12 3v9" strokeLinecap="round" />
            <path d="M7.5 6.2a8 8 0 1 0 9 0" strokeLinecap="round" />
          </svg>
          <span className="power-label">{on ? "ON" : "OFF"}</span>
        </button>

        <p className="power-meta">
          GPIO {status?.gpio ?? "—"} ·{" "}
          {countdown ? <span className="warn">auto-off in {countdown}</span> : on ? "no timer" : "idle"}
          {status?.reason && status.reason !== "boot" ? ` · via ${status.reason}` : ""}
        </p>

        <div className="timers">
          {[30, 60, 300, 900].map((s) => (
            <button key={s} className="btn" disabled={!ready} onClick={() => startTimer(s)}>
              {s >= 60 ? `${s / 60} min` : `${s} s`}
            </button>
          ))}
          <button
            className="btn ghost"
            disabled={!ready || !!on}
            title={on ? "Turn the relay off first" : "Blink the relay for 1 s"}
            onClick={runTest}
          >
            Test
          </button>
        </div>
      </section>

      {/* ── status grid ── */}
      <section className="grid">
        <div className="card stat">
          <h3>Wi-Fi</h3>
          <p className="big">{status?.wifi ? status.ssid : status?.ap ? "setup AP" : "—"}</p>
          <div className="meter">
            <i style={{ width: `${status?.quality ?? 0}%` }} />
          </div>
          <small>{status?.wifi ? `${status.rssi} dBm · ${status.quality}%` : "not associated"}</small>
        </div>

        <div className="card stat">
          <h3>MQTT</h3>
          <p className="big">{status?.mqtt ? "Connected" : "Offline"}</p>
          <small className="mono">{status?.host || "—"}</small>
          <small className="mono">
            {status?.port || "—"} · rx {status?.rx ?? 0} / tx {status?.tx ?? 0}
          </small>
        </div>

        <div className="card stat">
          <h3>Uptime</h3>
          <p className="big">{fmtUptime(status?.uptime)}</p>
          <small>free heap {(status?.heap ? (status.heap / 1024).toFixed(0) : 0)} kB</small>
          <small className="mono">{status?.chip || "—"}</small>
        </div>
      </section>

      {/* ── topics ── */}
      {/* {status && (
        // <section className="card">
        //   <h3>MQTT topics</h3>
        //   <dl className="topics">
        //     <dt>set</dt>
        //     <dd className="mono">{status.setTopic}</dd>
        //     <dt>state</dt>
        //     <dd className="mono">{status.stateTopic}</dd>
        //     <dt>avail</dt>
        //     <dd className="mono">{status.availTopic}</dd>
        //     <dt>status</dt>
        //     <dd className="mono">{`${broker.prefix}/status`}</dd>
        //   </dl>
        //   <small>
        //     Publish <code>ON</code>, <code>OFF</code>, <code>TOGGLE</code>, <code>test</code> or a
        //     timer JSON payload.
        //   </small>
        // </section>
      )} */}

      {/* ── log (local mode only; the broker has no log stream) ── */}
      {isCloud ? (
        <section className="card">
          <h3>Device log</h3>
          <p className="empty">
            Logs stream over the local HTTP API. Switch to <b>Local · HTTP</b> to view them.
          </p>
        </section>
      ) : (
        <section className="card">
          <div className="card-h">
            <h3>Device log</h3>
            <span className={`tag ${link}`}>{link}</span>
          </div>
          {logs.length ? (
            <pre className="log">{logs.join("\n")}</pre>
          ) : (
            <p className="empty">No events yet.</p>
          )}
        </section>
      )}

      {/* ── connection settings ── */}
      {isCloud ? (
        <section className="card">
          <h3>Broker</h3>
          <div className="row">
            <input
              value={draftBroker.host}
              onChange={(e) => setDraftBroker({ ...draftBroker, host: e.target.value })}
              placeholder="your-cluster.s1.eu.hivemq.cloud"
              aria-label="Broker host"
              spellCheck="false"
            />
            <input
              value={draftBroker.port}
              onChange={(e) => setDraftBroker({ ...draftBroker, port: Number(e.target.value) || 8884 })}
              placeholder="8884"
              aria-label="WebSocket port"
              inputMode="numeric"
            />
          </div>
          <div className="row">
            <input
              value={draftBroker.username}
              onChange={(e) => setDraftBroker({ ...draftBroker, username: e.target.value })}
              placeholder="username"
              aria-label="Broker username"
              autoComplete="username"
            />
            <input
              type="password"
              value={draftBroker.password}
              onChange={(e) => setDraftBroker({ ...draftBroker, password: e.target.value })}
              placeholder="password"
              aria-label="Broker password"
              autoComplete="current-password"
            />
          </div>
          <div className="row">
            <input
              value={draftBroker.prefix}
              onChange={(e) => setDraftBroker({ ...draftBroker, prefix: e.target.value })}
              placeholder="esp32/relay"
              aria-label="Topic prefix"
              spellCheck="false"
            />
            <button className="btn pri" onClick={applyBroker}>
              Connect
            </button>
          </div>
          {error && <p className="err">{error}</p>}
          <small>Port 8884 is HiveMQ Cloud&apos;s secure WebSocket listener. Credentials are stored only in this browser, never in the bundle or on the server.</small>
          {isSecureRemote && (
            <p className="warn-line">
              This site is public. Anyone using this browser profile can read the saved broker
              password, and those credentials can switch the relay. Use a broker account scoped to
              just this device&apos;s topics, or keep the app on a private network.
            </p>
          )}
        </section>
      ) : (
        <section className="card">
          <h3>Connection</h3>
          <div className="row">
            <input
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value)}
              placeholder={DEFAULT_TARGET}
              aria-label="Device address"
              spellCheck="false"
            />
            <input
              value={auth.username}
              onChange={(e) => setAuth({ ...auth, username: e.target.value })}
              placeholder="admin"
              aria-label="Username"
              autoComplete="username"
            />
            <input
              type="password"
              value={auth.password}
              onChange={(e) => setAuth({ ...auth, password: e.target.value })}
              placeholder="password (optional)"
              aria-label="Password"
              autoComplete="current-password"
            />
            <button className="btn pri" onClick={applyTarget}>
              Connect
            </button>
          </div>
          {error && <p className="err">{error}</p>}
          <button
            className="btn danger"
            disabled={!online || busy}
            onClick={() => {
              if (confirm("Reboot the device?")) localCommand(() => reboot(target), "Rebooting");
            }}
          >
            Reboot device
          </button>
        </section>
      )}

      {toast && <div className={`toast ${toast.kind}`}>{toast.text}</div>}
    </div>
  );
}
