/**
 * GET /api/telegram-test — отправить тестовое сообщение в Telegram на 5053253480.
 * Нужен TELEGRAM_BOT_TOKEN в Vercel. После проверки эндпоинт можно удалить.
 */
const CHAT_ID = "5053253480";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Use GET" });
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return res.status(500).json({ ok: false, error: "TELEGRAM_BOT_TOKEN not set" });
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const resTelegram = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: "🧪 Тест: уведомления из мини-приложения «Найди Пиханину» работают.",
      disable_web_page_preview: true,
    }),
  });

  if (!resTelegram.ok) {
    const err = await resTelegram.text().catch(() => "");
    return res.status(502).json({ ok: false, error: "Telegram error", details: err });
  }

  return res.status(200).json({ ok: true, message: "Test message sent to " + CHAT_ID });
};
