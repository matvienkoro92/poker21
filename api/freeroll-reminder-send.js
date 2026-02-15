/**
 * Рассылка напоминания «турнир дня» подписчикам.
 * when=5sec: вызывается QStash через 5 сек, body: { initData }. Без CRON_SECRET.
 * when=1h/10min: по крону, требуется CRON_SECRET.
 *
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN.
 * Опционально: CRON_SECRET — для when=1h/10min.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET;
const REMINDER_KEYS = { "1h": "poker_app:freeroll_reminder", "10min": "poker_app:freeroll_reminder_10min", "5sec": "poker_app:freeroll_reminder_5sec" };
const crypto = require("crypto");

const TOURNAMENT_DETAILS = [
  "Poker21",
  "Нокаут за 500р, старт в понедельник в 4:29 (Бали)",
  "Гарантия 100 000р",
].join("\n");

const MESSAGES = {
  "1h": "⏰ Турнир дня начнётся через час!\n\n" + TOURNAMENT_DETAILS,
  "10min": "⏰ Турнир дня начнётся через 10 минут!\n\n" + TOURNAMENT_DETAILS,
  "5sec": "⏰ Напоминание: турнир дня стартует!\n\n" + TOURNAMENT_DETAILS,
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
  const data = await res.json().catch(() => ({}));
  if (res.ok) return { ok: true };
  const desc = (data && data.description) || "";
  if (desc.indexOf("can't initiate") !== -1 || desc.indexOf("blocked") !== -1) {
    return { ok: false, hint: "Напишите боту /start в личку, затем попробуйте снова." };
  }
  return { ok: false, hint: desc || "Ошибка Telegram" };
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

  var when = (req.query && req.query.when) === "5sec" ? "5sec" : (req.query && req.query.when) === "10min" ? "10min" : (req.query && req.query.when) === "1h" ? "1h" : null;
  if (!when) {
    var m = new Date().getUTCMinutes();
    when = m >= 49 && m <= 59 ? "10min" : "1h";
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });
  }

  if (when === "5sec" || when === "10min" || when === "1h") {
    var bodyInit;
    try {
      bodyInit = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    var initDataVal = bodyInit.initData || bodyInit.init_data;
    if (initDataVal) {
      var userInit = validateTelegramWebAppData(initDataVal, BOT_TOKEN);
      if (!userInit || !userInit.id) {
        return res.status(401).json({ ok: false, error: "Invalid initData" });
      }
      var sendRes = await sendTelegramMessage(String(userInit.id), MESSAGES[when]);
      var sentCount = sendRes && sendRes.ok ? 1 : 0;
      var r = { ok: true, when: when, sent: sentCount, total: 1 };
      if (sentCount === 0 && sendRes && sendRes.hint) r.error = sendRes.hint;
      return res.status(200).json(r);
    }
    if (when === "5sec") {
      return res.status(400).json({ ok: false, error: "initData required for when=5sec" });
    }
  }

  if (when !== "5sec" && CRON_SECRET) {
    var auth = req.headers["x-cron-secret"] || req.query.secret || (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    if (auth !== CRON_SECRET) {
      return res.status(403).json({ ok: false, error: "Invalid or missing CRON_SECRET" });
    }
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
    const r = await sendTelegramMessage(chatId, messageText);
    if (r && r.ok) sent++;
  }

  return res.status(200).json({ ok: true, when, sent, total: chatIds.length });
};
