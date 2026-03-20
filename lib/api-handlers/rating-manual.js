/**
 * Ручное уведомление об обновлении рейтинга (через админскую кнопку в мини‑апке).
 * Только для админов (по TELEGRAM_ADMIN_ID). Без CRON_SECRET.
 *
 * POST /api/rating-manual
 *   body: { initData: string, action?: "spring_rating_notify" }
 *
 * Берёт MINI_APP_URL и кладёт два сообщения в общий чат:
 *   - про Лигу 1 весеннего рейтинга
 *   - про Лигу 2 весеннего рейтинга
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.TELEGRAM_TOKEN ||
  process.env.BOT_TOKEN ||
  "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const GENERAL_CHAT_KEY = "poker_app:chat_messages";
const MAX_CHAT_MESSAGES = 100;
const MINI_APP_URL = process.env.MINI_APP_URL || process.env.APP_URL || "";

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = String(REDIS_URL).replace(/\/$/, "");
  const res = await fetch(base + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return await res.json();
}

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
    const calculatedHash = crypto
      .createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id
      ? {
          id: user.id,
          firstName: user.first_name || "",
          username: user.username || "",
        }
      : null;
  } catch (e) {
    return null;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!REDIS_URL || !REDIS_TOKEN || !MINI_APP_URL) {
    return res
      .status(500)
      .json({ ok: false, error: "Server not configured for rating-manual" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
  } catch (e) {
    body = {};
  }

  const initData =
    req.query.initData || req.query.init_data || body.initData || body.init_data || "";
  const user = validateUser(initData);
  if (!user) {
    return res
      .status(401)
      .json({ ok: false, error: "Откройте приложение в Telegram (нет initData)" });
  }

  const myId = "tg_" + user.id;
  if (!isAdmin(myId)) {
    return res.status(403).json({ ok: false, error: "Только для админов" });
  }

  const nowIso = new Date().toISOString();

  const baseAppUrl = String(MINI_APP_URL && MINI_APP_URL.indexOf("t.me/") !== -1 ? MINI_APP_URL : "https://t.me/poker21app_bot/start")
    .replace(/\/$/, "")
    .replace(/[)\s]+$/, "");
  const ratingLink = baseAppUrl + "?startapp=spring_rating";
  const msg = {
    id: "msg_rating_spring_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8),
    from: "rating_spring",
    fromName: "Рейтинг турнирщиков весны",
    text:
      "🏆 Обновилась итоговая таблица рейтинга турнирщиков.\n\nОткрыть рейтинг: " +
      ratingLink,
    time: nowIso,
  };

  try {
    await redisPipeline([
      ["LPUSH", GENERAL_CHAT_KEY, JSON.stringify(msg)],
      ["LTRIM", GENERAL_CHAT_KEY, "0", String(MAX_CHAT_MESSAGES - 1)],
    ]);
  } catch (e) {
    return res
      .status(500)
      .json({ ok: false, error: "Не удалось сохранить сообщение в чат" });
  }

  return res.status(200).json({
    ok: true,
    sentToChat: true,
  });
};

