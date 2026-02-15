/**
 * Отправить сообщение пользователю через бота.
 * POST /api/send-to-user
 * Body: { secret, user_id, text } — user_id без префикса tg_
 */
const CRON_SECRET = process.env.CRON_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";

async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) return { ok: false, error: "Bot not configured" };
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
  return { ok: false, error: data.description || "Ошибка отправки" };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const secret = req.headers["x-cron-secret"] || req.query?.secret || body.secret;
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid secret" });
  }

  const userId = body.user_id || body.userId;
  const text = (body.text || body.message || "").trim();

  if (!userId || !text) {
    return res.status(400).json({ ok: false, error: "user_id and text required" });
  }

  const chatId = String(userId).replace(/^tg_/, "");
  if (!/^\d+$/.test(chatId)) {
    return res.status(400).json({ ok: false, error: "Invalid user_id" });
  }

  const result = await sendTelegramMessage(chatId, text);
  if (result.ok) {
    return res.status(200).json({ ok: true, sent: true });
  }
  return res.status(500).json({ ok: false, error: result.error });
};
