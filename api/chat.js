/**
 * Чат клуба: GET — список сообщений, POST — отправить сообщение.
 * Redis: poker_app:chat_messages (LIST, до 100 сообщений).
 * Нужны: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TELEGRAM_BOT_TOKEN.
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const CHAT_KEY = "poker_app:chat_messages";
const MAX_MESSAGES = 100;

function validateUser(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + v)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id ? { id: user.id, firstName: user.first_name || "", username: user.username || "" } : null;
  } catch (e) {
    return null;
  }
}

async function redisCommand(cmd, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = String(REDIS_URL).replace(/\/$/, "");
  const url = base + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[cmd, CHAT_KEY, ...args].filter((x) => x !== undefined)]),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && data[0] ? data[0].result : null;
}

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = String(REDIS_URL).replace(/\/$/, "");
  const res = await fetch(base + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Redis not configured" });
  }

  if (req.method === "GET") {
    const raw = await redisCommand("LRANGE", "0", String(MAX_MESSAGES - 1));
    const list = Array.isArray(raw) ? raw : [];
    const messages = list
      .map((s) => {
        try {
          return typeof s === "string" ? JSON.parse(s) : null;
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
    return res.status(200).json({ ok: true, messages });
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    const initData = body.initData || body.init_data;
    const text = (body.text || body.message || "").trim();
    const user = validateUser(initData);

    if (!user) return res.status(401).json({ ok: false, error: "Откройте приложение в Telegram" });
    if (!text || text.length > 500) return res.status(400).json({ ok: false, error: "Сообщение от 1 до 500 символов" });

    const msg = {
      id: Date.now() + "_" + Math.random().toString(36).slice(2, 9),
      userId: user.id,
      userName: user.firstName || ("@" + user.username) || "Игрок",
      username: user.username || null,
      text: text,
      time: new Date().toISOString(),
    };

    const results = await redisPipeline([
      ["LPUSH", CHAT_KEY, JSON.stringify(msg)],
      ["LTRIM", CHAT_KEY, "0", String(MAX_MESSAGES - 1)],
    ]);

    if (!results || results.some((r) => r && r.error)) {
      return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
    }
    return res.status(200).json({ ok: true, message: msg });
  }
};
