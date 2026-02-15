/**
 * Тест «Напомнить сейчас» — отправка сразу без задержки.
 * POST с initData (как у «10 сек»), сразу вызывает отправку.
 * Используется для проверки всей цепочки: initData → Telegram.
 */
const crypto = require("crypto");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

const MESSAGE = "⏰ Тест напоминания: турнир дня стартует!\n\nPoker21\nНокаут за 500р, старт в 18:00 мск\nГарантия 100 000р";

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
  if (!BOT_TOKEN) return { ok: false, hint: "TELEGRAM_BOT_TOKEN не задан" };
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
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: "Set TELEGRAM_BOT_TOKEN" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const initData = body.initData || body.init_data;
  if (!initData) return res.status(400).json({ ok: false, error: "initData required" });

  const user = validateTelegramWebAppData(initData, BOT_TOKEN);
  if (!user || !user.id) return res.status(401).json({ ok: false, error: "Invalid initData" });

  const result = await sendTelegramMessage(String(user.id), MESSAGE);
  const sent = result && result.ok ? 1 : 0;
  const resp = { ok: true, sent, tested: true };
  if (sent === 0 && result && result.hint) resp.error = result.hint;
  return res.status(200).json(resp);
};
