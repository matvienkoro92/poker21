/**
 * Тест рассылки газеты: отправить сообщение «новая новость» только текущему пользователю.
 * POST body: { initData }. Без секрета — только тому, кто вызвал (по initData).
 * Переменные: TELEGRAM_BOT_TOKEN.
 */
const crypto = require("crypto");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";

const DEFAULT_MESSAGE = "📰 Вестник Два туза\n\nВ газете новая новость! Откройте приложение и зайдите в раздел «Газета».";

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

  const messageText = (body.message && typeof body.message === "string") ? body.message : DEFAULT_MESSAGE;
  const r = await sendTelegramMessage(user.id, messageText);

  if (r && r.ok) {
    return res.status(200).json({ ok: true, sent: true });
  }
  const hint = (r && r.hint) || "Не удалось отправить";
  if (hint === "user_blocked") {
    return res.status(200).json({ ok: false, error: "Напишите боту в Telegram команду /start — тогда можно будет получать сообщения." });
  }
  return res.status(500).json({ ok: false, error: hint });
};
