/**
 * Счётчик зрителей трансляции в приложении.
 * GET — возвращает количество активных зрителей (heartbeat за последние 2 мин).
 * POST { initData } — регистрирует просмотр (heartbeat).
 * Redis: poker_app:stream_viewers (sorted set, score = timestamp, member = userId).
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const STREAM_VIEWERS_KEY = "poker_app:stream_viewers";
const ACTIVE_MS = 2 * 60 * 1000; // 2 минуты

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
    return user.id ? { id: user.id } : null;
  } catch (e) {
    return null;
  }
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
  res.setHeader("Cache-Control", "public, max-age=30");

  if (req.method === "OPTIONS") return res.status(200).end();

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(200).json({ ok: true, viewers: 0 });
  }

  const now = Date.now();
  const minScore = now - ACTIVE_MS;

  if (req.method === "GET") {
    try {
      const results = await redisPipeline([
        ["ZREMRANGEBYSCORE", STREAM_VIEWERS_KEY, "-inf", String(minScore - 1)],
        ["ZCOUNT", STREAM_VIEWERS_KEY, String(minScore), "+inf"],
      ]);
      if (!results || !Array.isArray(results) || results.length < 2) {
        return res.status(200).json({ ok: true, viewers: 0 });
      }
      const count = parseInt(results[1]?.result, 10) || 0;
      return res.status(200).json({ ok: true, viewers: count });
    } catch (e) {
      return res.status(200).json({ ok: true, viewers: 0 });
    }
  }

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    const initData = body.initData || body.init_data;
    const user = validateUser(initData);
    if (!user) return res.status(401).json({ ok: false, error: "Откройте в Telegram" });

    const userId = "tg_" + user.id;
    try {
      const results = await redisPipeline([
        ["ZADD", STREAM_VIEWERS_KEY, String(now), userId],
        ["ZREMRANGEBYSCORE", STREAM_VIEWERS_KEY, "-inf", String(minScore - 1)],
        ["ZCOUNT", STREAM_VIEWERS_KEY, String(minScore), "+inf"],
      ]);
      const count = results && results[2] ? parseInt(results[2].result, 10) || 0 : 0;
      return res.status(200).json({ ok: true, viewers: count });
    } catch (e) {
      return res.status(200).json({ ok: true, viewers: 0 });
    }
  }

  return res.status(405).json({ ok: false, error: "Method not allowed" });
};
