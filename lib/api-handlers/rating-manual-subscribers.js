/**
 * Ручная рассылка подписчикам рейтинга (из админской кнопки в мини‑апке).
 *
 * POST /api/rating-manual-subscribers
 *   body: { initData: string }
 *
 * Только для админов (TELEGRAM_ADMIN_ID). Без CRON_SECRET.
 * Рассылает личное сообщение всем chat_id из poker_app:rating_subscribers.
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.TELEGRAM_TOKEN ||
  process.env.BOT_TOKEN ||
  "";
const RATING_SUBSCRIBERS_KEY = "poker_app:rating_subscribers";
const MINI_APP_URL = process.env.MINI_APP_URL || process.env.APP_URL || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

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
  return await res.json();
}

function isAdmin(userId) {
  const id = String(userId).replace(/^tg_/, "");
  return id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id);
}

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
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id
      ? {
          id: user.id,
          firstName: user.first_name || "",
          username: user.username || "",
        }
      : null;
  } catch (e) {
    return null;
  }
}

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) return { ok: false, error: "No BOT_TOKEN" };
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
    return { ok: false, hint: "user_blocked" };
  }
  return { ok: false, hint: desc || "Ошибка Telegram" };
}

const DEFAULT_MESSAGE =
  "🏆 Рейтинг турнирщиков обновлён!\n\nАктуальная таблица и топы недели — в приложении клуба.";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!REDIS_URL || !REDIS_TOKEN || !MINI_APP_URL) {
    return res
      .status(500)
      .json({ ok: false, error: "Server not configured for rating-manual-subscribers" });
  }

  let body = {};
  if (req.method === "POST") {
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    } catch (e) {
      body = {};
    }
  }

  const initData =
    req.query.initData || req.query.init_data || body.initData || body.init_data || "";
  const user = validateUser(initData);
  if (!user) {
    return res
      .status(401)
      .json({ ok: false, error: "Откройте приложение в Telegram (нет initData)" });
  }

  const myId = "tg_" + user.id;
  if (!isAdmin(myId)) {
    return res.status(403).json({ ok: false, error: "Только для админов" });
  }

  const results = await redisPipeline([["SMEMBERS", RATING_SUBSCRIBERS_KEY]]);
  if (!results || !results[0] || results[0].result === undefined) {
    return res.status(500).json({ ok: false, error: "Redis unavailable" });
  }

  const chatIds = Array.isArray(results[0].result) ? results[0].result : [];
  // GET: только вернуть статистику, без рассылки
  if (req.method === "GET") {
    return res.status(200).json({
      ok: true,
      sent: 0,
      total: chatIds.length,
      statsOnly: true,
    });
  }

  let messageText = DEFAULT_MESSAGE;
  if (!messageText.includes("http")) {
    const baseAppUrl = String(
      MINI_APP_URL && MINI_APP_URL.indexOf("t.me/") !== -1 ? MINI_APP_URL : "https://t.me/poker21app_bot/start"
    )
      .replace(/\/$/, "")
      .replace(/[)\s]+$/, "");
    const ratingLink = baseAppUrl + "?startapp=spring_rating";
    messageText = messageText + "\n\nОткрыть рейтинг: " + ratingLink;
  }

  let sent = 0;
  for (const chatId of chatIds) {
    const r = await sendTelegramMessage(chatId, messageText);
    if (r && r.ok) sent++;
  }

  return res.status(200).json({
    ok: true,
    sent,
    total: chatIds.length,
  });
};

