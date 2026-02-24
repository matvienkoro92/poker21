/**
 * Рассылка пуша «новая новость в газете» всем подписчикам и/или пост в общий чат со ссылкой.
 * Вызывать вручную или по крону после публикации новости.
 * GET/POST с заголовком X-Cron-Secret или query secret=CRON_SECRET.
 * Body: message — текст пуша подписчикам; headline — заголовок новости; postToChat — true, чтобы отправить в чат клуба со ссылкой.
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, CRON_SECRET, MINI_APP_URL (ссылка на приложение для поста в чат).
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET;
const GAZETTE_SUBSCRIBERS_KEY = "poker_app:gazette_subscribers";
const GENERAL_CHAT_KEY = "poker_app:chat_messages";
const MAX_CHAT_MESSAGES = 100;
const MINI_APP_URL = process.env.MINI_APP_URL || process.env.APP_URL || "";

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

const DEFAULT_MESSAGE = "📰 Вестник Два туза\n\nВ газете новая новость! Откройте приложение и зайдите в раздел «Газета».";

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

  const auth = req.headers["x-cron-secret"] || (req.query && req.query.secret) || (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing CRON_SECRET" });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });
  }

  let messageText = DEFAULT_MESSAGE;
  let headline = "";
  let postToChat = false;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    if (body.message && typeof body.message === "string") messageText = body.message;
    if (body.headline && typeof body.headline === "string") headline = body.headline.trim();
    if (body.title && typeof body.title === "string" && !headline) headline = body.title.trim();
    if (body.postToChat === true || body.post_to_chat === true) postToChat = true;
  } catch (e) {}

  const results = await redisPipeline([["SMEMBERS", GAZETTE_SUBSCRIBERS_KEY]]);
  if (!results || !results[0] || results[0].result === undefined) {
    return res.status(500).json({ ok: false, error: "Redis unavailable" });
  }

  const chatIds = Array.isArray(results[0].result) ? results[0].result : [];
  let sent = 0;
  for (const chatId of chatIds) {
    const r = await sendTelegramMessage(chatId, messageText);
    if (r && r.ok) sent++;
  }

  let chatPosted = false;
  if (postToChat && REDIS_URL && REDIS_TOKEN) {
    const linkText = MINI_APP_URL ? MINI_APP_URL : "Откройте приложение и раздел «Газета» в меню.";
    const chatMessageText = headline
      ? "📰 Новая новость в газете «Вестник Два туза»:\n\n" + headline + "\n\n" + linkText
      : "📰 В газете «Вестник Два туза» новая новость!\n\n" + linkText;
    const systemMsg = {
      id: "msg_gazette_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
      from: "system_gazette",
      fromName: "📰 Вестник Два туза",
      text: chatMessageText,
      time: new Date().toISOString(),
    };
    const chatResults = await redisPipeline([
      ["LPUSH", GENERAL_CHAT_KEY, JSON.stringify(systemMsg)],
      ["LTRIM", GENERAL_CHAT_KEY, "0", String(MAX_CHAT_MESSAGES - 1)],
    ]);
    if (chatResults && !chatResults.some((r) => r && r.error)) chatPosted = true;
  }

  return res.status(200).json({
    ok: true,
    sent,
    total: chatIds.length,
    chatPosted: postToChat ? chatPosted : undefined,
  });
};
