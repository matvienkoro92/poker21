/**
 * Отправить сообщение пользователю через бота.
 * POST /api/send-to-user
 * Body: { secret, user_id, text } или для админа: { initData, user_id, text }
 */
const crypto = require("crypto");
const CRON_SECRET = process.env.CRON_SECRET;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAdmin(userId) {
  const id = String(userId).replace(/^tg_/, "");
  return id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id);
}

function validateUser(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + v)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id ? { id: user.id } : null;
  } catch (e) {
    return null;
  }
}

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
  const initData = body.initData || body.init_data || "";
  const cronOk = !!(CRON_SECRET && secret === CRON_SECRET);
  const adminUser = initData ? validateUser(initData) : null;
  const adminId = adminUser ? "tg_" + adminUser.id : null;
  const adminOk = !cronOk && adminUser && isAdmin(adminId);

  if (!cronOk && !adminOk) {
    return res.status(403).json({ ok: false, error: "Invalid secret or not admin" });
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
