/**
 * Рассылка напоминания «турнир дня через час» всем подписчикам.
 * Вызывать по крону в 17:00 МСК (или вручную с секретом).
 *
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 * Опционально: CRON_SECRET — если задан, запрос должен содержать заголовок X-Cron-Secret: <CRON_SECRET>
 *   или query ?secret=<CRON_SECRET>.
 *
 * Пример крона: два вызова в день:
 *   За час:  14:00 UTC (17:00 МСК) — GET/POST .../api/freeroll-reminder-send?when=1h
 *   За 10 мин: 17:50 МСК = 14:50 UTC — GET/POST .../api/freeroll-reminder-send?when=10min
 *   Header: X-Cron-Secret: <CRON_SECRET>
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const crypto = require("crypto");
const REMINDER_KEYS = { "1h": "poker_app:freeroll_reminder", "10min": "poker_app:freeroll_reminder_10min", "10sec": "poker_app:freeroll_reminder_10sec" };

const TOURNAMENT_DETAILS = [
  "Poker21",
  "Нокаут за 500р, старт в 18:00 мск",
  "Гарантия 100 000р",
].join("\n");

const MESSAGES = {
  "1h": "⏰ Турнир дня начнётся через час!\n\n" + TOURNAMENT_DETAILS,
  "10min": "⏰ Турнир дня начнётся через 10 минут!\n\n" + TOURNAMENT_DETAILS,
  "10sec": "⏰ Напоминание: турнир дня стартует!\n\n" + TOURNAMENT_DETAILS,
};

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

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
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

async function sendTelegramMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: text,
      disable_web_page_preview: true,
    }),
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const when = (req.query && req.query.when) === "10sec" ? "10sec" : (req.query && req.query.when) === "10min" ? "10min" : "1h";

  if (when !== "10sec" && CRON_SECRET && (req.headers["x-cron-secret"] || req.query.secret) !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing CRON_SECRET" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });
  }

  if (when === "10sec") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    const initData = body.initData || body.init_data;
    if (!initData) {
      return res.status(400).json({ ok: false, error: "initData required for when=10sec" });
    }
    const user = validateTelegramWebAppData(initData, BOT_TOKEN);
    if (!user || !user.id) {
      return res.status(401).json({ ok: false, error: "Invalid initData" });
    }
    const reminderKey = REMINDER_KEYS["10sec"];
    const results = await redisPipeline([
      ["SISMEMBER", reminderKey, String(user.id)],
      ["SREM", reminderKey, String(user.id)],
    ]);
    if (!results || !results[0] || results[0].result !== 1) {
      return res.status(200).json({ ok: true, when: "10sec", sent: 0, message: "Not subscribed or already sent" });
    }
    const sent = (await sendTelegramMessage(String(user.id), MESSAGES["10sec"])) ? 1 : 0;
    return res.status(200).json({ ok: true, when: "10sec", sent, total: 1 });
  }

  const reminderKey = REMINDER_KEYS[when];
  const messageText = MESSAGES[when];

  const results = await redisPipeline([["SMEMBERS", reminderKey]]);
  if (!results || !results[0] || results[0].result === undefined) {
    return res.status(500).json({ ok: false, error: "Redis unavailable" });
  }

  const chatIds = Array.isArray(results[0].result) ? results[0].result : [];
  let sent = 0;
  for (const chatId of chatIds) {
    if (await sendTelegramMessage(chatId, messageText)) sent++;
  }

  return res.status(200).json({ ok: true, when, sent, total: chatIds.length });
};
