/**
 * Уведомление тебе в Telegram, когда кто-то выбил промокод в «Найди Пиханину».
 *
 * В Vercel Environment Variables задай:
 *   TELEGRAM_BOT_TOKEN — токен бота (как в auth-telegram).
 *   TELEGRAM_NOTIFY_CHAT_ID — твой Telegram chat id (куда слать сообщения).
 *
 * Как узнать свой chat id: напиши боту /start, затем открой в браузере:
 *   https://api.telegram.org/bot<ТВОЙ_ТОКЕН>/getUpdates
 * В ответе найди "chat":{"id": 123456789} — это и есть TELEGRAM_NOTIFY_CHAT_ID.
 */
const crypto = require("crypto");

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
  const notifyChatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (!botToken || !notifyChatId) {
    return res.status(500).json({ ok: false, error: "Server config: set TELEGRAM_BOT_TOKEN and TELEGRAM_NOTIFY_CHAT_ID" });
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

  const sent = await sendTelegramMessage(botToken, notifyChatId.trim(), text);
  if (!sent) {
    return res.status(500).json({ ok: false, error: "Failed to send Telegram message" });
  }

  return res.status(200).json({ ok: true });
};
