/**
 * Тестовый endpoint для проверки отправки сообщений ботом.
 * GET /api/test-bot-message?chat_id=ВАШ_TELEGRAM_ID&secret=ВАШ_TEST_SECRET
 *
 * В Vercel добавьте TEST_SECRET (любой пароль для защиты).
 * Ваш chat_id можно узнать через @userinfobot в Telegram.
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TEST_SECRET = process.env.TEST_SECRET;

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) return { ok: false, error: "TELEGRAM_BOT_TOKEN не задан" };
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
  return { ok: false, error: (data && data.description) || "Ошибка Telegram" };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const chatId = req.query.chat_id;
  const secret = req.query.secret;

  if (!chatId) {
    return res.status(400).json({
      ok: false,
      error: "Укажите chat_id (ваш Telegram ID). Узнать: @userinfobot",
      usage: "/api/test-bot-message?chat_id=123456789&secret=ВАШ_SECRET",
    });
  }

  if (TEST_SECRET && secret !== TEST_SECRET) {
    return res.status(403).json({ ok: false, error: "Неверный secret. Добавьте TEST_SECRET в Vercel." });
  }

  const result = await sendTelegramMessage(chatId, "✅ Тестовое сообщение от бота. Если вы это видите — отправка работает!");

  if (result.ok) {
    return res.status(200).json({ ok: true, message: "Сообщение отправлено. Проверьте Telegram." });
  }
  return res.status(200).json({ ok: false, error: result.error });
};
