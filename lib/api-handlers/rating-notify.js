/**
 * Одно сообщение подписчикам рейтинга после обновления (например после пуша).
 * Вызывать из deploy-hook или вручную с CRON_SECRET.
 * GET/POST с заголовком X-Cron-Secret или query secret=CRON_SECRET.
 * Body: ratingId — уникальный id обновления (рассылка по этому id только один раз); message — свой текст.
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, CRON_SECRET, MINI_APP_URL.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET;
const RATING_SUBSCRIBERS_KEY = "poker_app:rating_subscribers";
const RATING_NOTIFIED_IDS_KEY = "poker_app:rating_notified_ids";
const MINI_APP_URL = process.env.MINI_APP_URL || process.env.APP_URL || "";
const GENERAL_CHAT_KEY = "poker_app:chat_messages";
const MAX_CHAT_MESSAGES = 100;

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
    return { ok: false, hint: "user_blocked" };
  }
  return { ok: false, hint: desc || "Ошибка Telegram" };
}

const DEFAULT_MESSAGE = "🏆 Рейтинг турнирщиков обновлён!\n\nАктуальная таблица и топы недели — в приложении клуба.";

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

  const auth =
    (req.headers && req.headers["x-cron-secret"]) ||
    (req.query && req.query.secret) ||
    ((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing CRON_SECRET" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });
  }

  let messageText = DEFAULT_MESSAGE;
  let ratingId = null;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (body.message && typeof body.message === "string") messageText = body.message;
    if (body.ratingId != null) ratingId = String(body.ratingId);
  } catch (e) {}

  if (MINI_APP_URL && !messageText.includes("http")) {
    messageText = messageText + "\n\nОткрыть рейтинг: " + MINI_APP_URL;
  }

  if (ratingId && REDIS_URL && REDIS_TOKEN) {
    const checkResults = await redisPipeline([["SISMEMBER", RATING_NOTIFIED_IDS_KEY, ratingId]]);
    if (checkResults && checkResults[0] && checkResults[0].result === 1) {
      return res.status(200).json({ ok: true, alreadySent: true, sent: 0, total: 0 });
    }
  }

  const results = await redisPipeline([["SMEMBERS", RATING_SUBSCRIBERS_KEY]]);
  if (!results || !results[0] || results[0].result === undefined) {
    return res.status(500).json({ ok: false, error: "Redis unavailable" });
  }

  const chatIds = Array.isArray(results[0].result) ? results[0].result : [];
  let sent = 0;
  for (const chatId of chatIds) {
    const r = await sendTelegramMessage(chatId, messageText);
    if (r && r.ok) sent++;
  }

  if (ratingId && REDIS_URL && REDIS_TOKEN) {
    await redisPipeline([["SADD", RATING_NOTIFIED_IDS_KEY, ratingId]]);
  }

  // Сообщения в общий чат с отдельными ссылками на Лигу 1 и Лигу 2 рейтинга весны
  if (MINI_APP_URL && REDIS_URL && REDIS_TOKEN) {
    const base = MINI_APP_URL.replace(/\/$/, "");
    const linkLeague1 = base + "?startapp=spring_rating_league_1";
    const linkLeague2 = base + "?startapp=spring_rating_league_2";
    const nowIso = new Date().toISOString();
    const msgLeague1 = {
      id: "msg_rating_spring_l1_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      from: "rating_spring",
      fromName: "Рейтинг турнирщиков весны",
      text: "🏆 Обновилась итоговая таблица Лиги 1 рейтинга турнирщиков весны.\n\nСмотреть Лигу 1: " + linkLeague1,
      time: nowIso,
    };
    const msgLeague2 = {
      id: "msg_rating_spring_l2_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
      from: "rating_spring",
      fromName: "Рейтинг турнирщиков весны",
      text: "🏆 Обновилась итоговая таблица Лиги 2 рейтинга турнирщиков весны.\n\nСмотреть Лигу 2: " + linkLeague2,
      time: nowIso,
    };
    try {
      await redisPipeline([
        ["LPUSH", GENERAL_CHAT_KEY, JSON.stringify(msgLeague2)],
        ["LPUSH", GENERAL_CHAT_KEY, JSON.stringify(msgLeague1)],
        ["LTRIM", GENERAL_CHAT_KEY, "0", String(MAX_CHAT_MESSAGES - 1)],
      ]);
    } catch (e) {
      // молча игнорируем ошибку записи в чат, чтобы не ломать основную рассылку
    }
  }

  return res.status(200).json({
    ok: true,
    sent,
    total: chatIds.length,
    alreadySent: false,
  });
};
