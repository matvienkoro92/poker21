/**
 * Webhook для получения сообщений от Telegram.
 * Бот отвечает на /start и другие команды.
 *
 * После деплоя установите webhook:
 * GET https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://ВАШ-ДОМЕН.vercel.app/api/telegram-webhook
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendMessage(chatId, text, replyMarkup) {
  if (!BOT_TOKEN) return false;
  const body = { chat_id: String(chatId), text, parse_mode: "HTML" };
  if (replyMarkup) body.reply_markup = replyMarkup;
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.ok;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  if (!BOT_TOKEN) {
    return res.status(500).json({ ok: false });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false });
  }

  const message = body.message || body.edited_message;
  if (!message) {
    return res.status(200).json({ ok: true });
  }

  const chatId = message.chat && message.chat.id;
  const text = (message.text || "").trim();
  if (!chatId) return res.status(200).json({ ok: true });

  if (text === "/start") {
    const firstName = message.from && message.from.first_name ? message.from.first_name : "";
    await sendMessage(chatId,
      "Привет" + (firstName ? ", " + firstName : "") + "! 👋\n\n" +
      "Я бот клуба «Два туза». Открой Mini App, чтобы играть и получать напоминания о турнирах.",
      {
        inline_keyboard: [[{ text: "Открыть приложение", web_app: { url: "https://" + (process.env.VERCEL_URL || "poker-app-ebon.vercel.app") } }]],
      }
    );
  } else if (text === "/help") {
    await sendMessage(chatId, "Команды:\n/start — приветствие и ссылка на приложение\n/help — эта справка");
  }

  return res.status(200).json({ ok: true });
};
