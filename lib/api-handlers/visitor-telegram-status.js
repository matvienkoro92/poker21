/**
 * Статус Telegram для посетителя: подписка на канал клуба.
 * GET /api/visitor-telegram-status?initData=...&userId=tg_123
 * Только для админа. Ответ: { ok, channelSubscribed, botCanSendMessage }.
 * botCanSendMessage не проверяем заранее (только при отправке).
 */
const crypto = require("crypto");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const CLUB_CHANNEL = process.env.RAFFLE_CHANNEL || "@poker21_news";

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

async function getChannelMemberStatus(telegramUserId, botToken) {
  if (!botToken || !telegramUserId) return null;
  try {
    const chatId = encodeURIComponent(CLUB_CHANNEL);
    const userId = String(telegramUserId).replace(/^tg_/, "");
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${userId}`
    );
    const data = await res.json();
    const status = data.result && data.result.status ? String(data.result.status) : "";
    return ["member", "administrator", "creator"].includes(status);
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const initData = req.query.initData || req.query.init_data || "";
  const userId = (req.query.userId || req.query.user_id || "").trim();

  const user = validateUser(initData);
  if (!user || !isAdmin("tg_" + user.id)) {
    return res.status(403).json({ ok: false, error: "Not admin" });
  }

  if (!userId || !userId.startsWith("tg_")) {
    return res.status(400).json({ ok: false, error: "userId (tg_...) required" });
  }

  const channelSubscribed = await getChannelMemberStatus(userId, BOT_TOKEN);
  return res.status(200).json({
    ok: true,
    channelSubscribed: channelSubscribed === true,
    channelSubscribedUnknown: channelSubscribed === null,
  });
};
