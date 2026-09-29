import mqtt from "mqtt";

const LS_BROKER = "esp32.broker";

export const DEFAULT_BROKER = {
  host: "",
  port: 8884, // HiveMQ Cloud secure WebSocket listener
  username: "",
  password: "",
  prefix: "esp32/relay",
  useJson: false,
};

/* Credentials live in localStorage only. Nothing is baked into the bundle,
   so the same build is safe to host publicly. */
export function loadBroker() {
  try {
    return { ...DEFAULT_BROKER, ...(JSON.parse(localStorage.getItem(LS_BROKER) || "{}") || {}) };
  } catch {
    return { ...DEFAULT_BROKER };
  }
}

export function saveBroker(cfg) {
  localStorage.setItem(LS_BROKER, JSON.stringify(cfg));
}

export function brokerUrl(b) {
  return `wss://${b.host}:${b.port}/mqtt`;
}

export const topics = (b) => ({
  set: `${b.prefix}/set`,
  state: `${b.prefix}/state`,
  avail: `${b.prefix}/avail`,
  status: `${b.prefix}/status`,
});

/** Parse either the plain "ON"/"OFF" form or the richer JSON form. */
function parseState(text) {
  const t = (text || "").trim();
  if (!t) return null;
  if (t[0] === "{") {
    try {
      const o = JSON.parse(t);
      if (typeof o.state === "string") {
        return { on: o.state.toUpperCase() === "ON", reason: o.reason, rssi: o.rssi };
      }
    } catch {
      /* fall through to the plain form */
    }
  }
  const up = t.toUpperCase();
  if (up === "ON" || up === "1" || up === "TRUE") return { on: true };
  if (up === "OFF" || up === "0" || up === "FALSE") return { on: false };
  return null;
}

/**
 * Connect to the broker and bridge it to plain callbacks.
 * Returns the mqtt.js client (call .end() to disconnect).
 */
export function connectBroker(b, { onRelay, onAvail, onStatus, onConnection }) {
  const t = topics(b);
  const client = mqtt.connect(brokerUrl(b), {
    username: b.username || undefined,
    password: b.password || undefined,
    clientId: `web-${Math.random().toString(16).slice(2, 10)}`,
    protocolVersion: 4,
    clean: true,
    reconnectPeriod: 3000,
    connectTimeout: 12000,
  });

  client.on("connect", () => {
    onConnection?.("connected");
    // QoS 0 is deliberate: the device must never receive a stale command on
    // reconnect, so nothing is retained on the /set topic.
    client.subscribe([t.state, t.avail, t.status], { qos: 0 });
  });

  client.on("reconnect", () => onConnection?.("reconnecting"));
  client.on("offline", () => onConnection?.("offline"));
  client.on("error", (e) => onConnection?.("error", e?.message));

  client.on("message", (topic, payload) => {
    const text = payload.toString();
    if (topic === t.state) {
      const s = parseState(text);
      if (s) onRelay?.(s);
    } else if (topic === t.avail) {
      onAvail?.(text.trim().toLowerCase() === "online");
    } else if (topic === t.status) {
      try {
        onStatus?.(JSON.parse(text));
      } catch {
        /* ignore malformed snapshot */
      }
    }
  });

  return client;
}

/** Publish a relay command. Never retained — see note above. */
export function sendCommand(client, b, action, seconds) {
  const body = b.useJson
    ? JSON.stringify(seconds ? { state: action.toUpperCase(), seconds } : { state: action.toUpperCase() })
    : action.toUpperCase();
  client.publish(topics(b).set, body, { qos: 0, retain: false });
}
