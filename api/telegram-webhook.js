/**
 * Webhook для ответа бота на команды.
 * Установите: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://poker-app-ebon.vercel.app/api/telegram-webhook
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN) return false;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: String(chatId),
      text: text,
      parse_mode: "HTML",
    }),
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN) return res.status(500).json({ ok: false });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false });
  }

  const message = body.message || body.edited_message;
  if (!message || !message.chat) return res.status(200).json({ ok: true });

  const chatId = message.chat.id;
  const text = (message.text || "").trim();

  if (text === "/start") {
    const name = (message.from && message.from.first_name) || "";
    await sendMessage(chatId, "Привет" + (name ? ", " + name : "") + "! 👋\n\nДобро пожаловать в клуб «Два туза». Используй меню бота, чтобы открыть приложение.");
  } else if (text === "/help") {
    await sendMessage(chatId, "/start — приветствие\n/help — справка");
  }

  return res.status(200).json({ ok: true });
};
