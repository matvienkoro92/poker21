/**
 * Уведомление тебе в Telegram, когда кто-то выбил промокод в «Найди Пиханину».
 * При каждом выигрыше увеличивает счётчик выданных призов в Redis (осталось = PIKHANINA_MAX_PRIZES - claimed).
 *
 * В Vercel: TELEGRAM_BOT_TOKEN, TELEGRAM_NOTIFY_CHAT_ID, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const PIKHANINA_CLAIMED_KEY = "poker_app:pikhanina_claimed_count";

async function redisIncr(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["INCR", key]]),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) && data[0] && data[0].result !== undefined ? data[0].result : null;
}

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

async function sendTelegramMessage(botToken, chatId, text) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: text,
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    console.error("[bonus-won] Telegram sendMessage failed:", res.status, err);
  }
  return res.ok;
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

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const notifyChatId = process.env.TELEGRAM_NOTIFY_CHAT_ID || "5053253480";
  if (!botToken) {
    return res.status(500).json({ ok: false, error: "Server config: set TELEGRAM_BOT_TOKEN" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const initData = body.initData || body.init_data;
  const promoCode = body.promoCode || body.promo_code;
  if (!initData || !promoCode || typeof promoCode !== "string") {
    return res.status(400).json({ ok: false, error: "initData and promoCode required" });
  }

  const user = validateTelegramWebAppData(initData, botToken);
  if (!user) {
    return res.status(401).json({ ok: false, error: "Invalid initData" });
  }

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  const username = user.username ? "@" + user.username : "—";
  const text = [
    "🎟 Кто-то выбил приз 200р в «Найди Пиханину»",
    "",
    "Кто: " + name,
    "Username: " + username,
    "ID: " + user.id,
    "Промокод: " + promoCode,
  ].join("\n");

  await redisIncr(PIKHANINA_CLAIMED_KEY);

  const sent = await sendTelegramMessage(botToken, notifyChatId.trim(), text);
  if (!sent) {
    return res.status(500).json({ ok: false, error: "Failed to send Telegram message" });
  }

  return res.status(200).json({ ok: true });
};
