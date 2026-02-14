/**
 * Подписка на напоминание «за час до турнира дня».
 * Сохраняет Telegram user id в Redis (тот же Upstash, что и api/visit.js).
 *
 * Переменные окружения: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const REMINDER_KEYS = { "1h": "poker_app:freeroll_reminder", "10min": "poker_app:freeroll_reminder_10min", "10sec": "poker_app:freeroll_reminder_10sec" };

function validateTelegramWebAppData(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(botToken)
    .digest();
  const calculatedHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");
  if (calculatedHash !== hash) return null;
  const userStr = params.get("user");
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

async function redisCommand(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[command, ...args]]),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return Array.isArray(data) && data[0] && data[0].result !== undefined ? data[0].result : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const initData = body.initData || body.init_data;
  if (!initData) {
    return res.status(400).json({ ok: false, error: "initData required" });
  }

  const user = validateTelegramWebAppData(initData, BOT_TOKEN);
  if (!user || !user.id) {
    return res.status(401).json({ ok: false, error: "Invalid initData" });
  }

  const whenRaw = body.remindWhen || body.remind_when || "1h";
  const when = whenRaw === "10sec" ? "10sec" : whenRaw === "10min" ? "10min" : "1h";
  const key = REMINDER_KEYS[when];
  const added = await redisCommand("SADD", key, String(user.id));
  if (added === null) {
    return res.status(503).json({ ok: false, error: "Сервис напоминаний временно недоступен. Попробуйте позже." });
  }

  return res.status(200).json({ ok: true, subscribed: true });
};
