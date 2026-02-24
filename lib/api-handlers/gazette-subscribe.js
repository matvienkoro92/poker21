/**
 * Подписка на пуши о новых новостях газеты «Вестник Два туза».
 * POST body: { initData[, unsubscribe: true] }.
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const GAZETTE_SUBSCRIBERS_KEY = "poker_app:gazette_subscribers";

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
  if (!REDIS_URL || !REDIS_TOKEN) return { error: "not_configured" };
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[command, ...args]]),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data) || !data[0]) return { error: "request_failed" };
  if (data[0].error) return { error: "redis_error" };
  return { result: data[0].result };
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

  const userId = String(user.id);
  const unsubscribe = !!(body.unsubscribe || body.unsub);

  if (unsubscribe) {
    const out = await redisCommand("SREM", GAZETTE_SUBSCRIBERS_KEY, userId);
    if (out.error) {
      return res.status(503).json({ ok: false, error: "Сервис временно недоступен" });
    }
    return res.status(200).json({ ok: true, subscribed: false });
  }

  const out = await redisCommand("SADD", GAZETTE_SUBSCRIBERS_KEY, userId);
  if (out.error) {
    return res.status(503).json({ ok: false, error: "Сервис временно недоступен. Попробуйте позже." });
  }
  return res.status(200).json({ ok: true, subscribed: true });
};
