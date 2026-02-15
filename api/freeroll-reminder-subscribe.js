/**
 * Подписка на напоминание «за час» или «за 5 мин» до турнира дня.
 * Для «5 сек»: QStash отправит напоминание через 5 сек (работает при закрытом приложении).
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, QSTASH_TOKEN.
 * Опционально: QSTASH_URL (для US: https://us1.qstash.upstash.io)
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const NOTIFY_CHAT_ID = process.env.TELEGRAM_NOTIFY_CHAT_ID || "";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const REMINDER_KEYS = { "1h": "poker_app:freeroll_reminder", "5min": "poker_app:freeroll_reminder_5min", "5sec": "poker_app:freeroll_reminder_5sec" };

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

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data) || !data[0]) return null;
  return data;
}

async function sendNotify(text) {
  if (!BOT_TOKEN || !NOTIFY_CHAT_ID) return;
  const url = "https://api.telegram.org/bot" + BOT_TOKEN + "/sendMessage";
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: NOTIFY_CHAT_ID.trim(), text: text, disable_web_page_preview: true }),
  });
}

/**
 * Выполняет команду Redis через Upstash Pipeline. Возвращает { result } или { error, status }.
 */
async function redisCommandWithStatus(command, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return { error: "not_configured", status: 0 };
  }
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[command, ...args]]),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    return { error: "request_failed", status: res.status };
  }
  if (!Array.isArray(data) || !data[0]) {
    return { error: "bad_response", status: 200 };
  }
  if (data[0].error) {
    return { error: "redis_error", status: res.status };
  }
  return { result: data[0].result };
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

  const whenRaw = body.remindWhen || body.remind_when || "1h";
  const when = whenRaw === "5sec" ? "5sec" : (whenRaw === "5min" || whenRaw === "10min") ? "5min" : "1h";
  const key = REMINDER_KEYS[when];
  const out = await redisCommandWithStatus("SADD", key, String(user.id));

  if (out.result !== undefined) {
    if (NOTIFY_CHAT_ID) {
      var whenLabel = when === "1h" ? "за час" : when === "5min" ? "за 5 мин" : "5 сек";
      var name = [user.first_name, user.last_name].filter(Boolean).join(" ") || "—";
      var uname = user.username ? "@" + user.username : "";
      var pipe = await redisPipeline([
        ["SCARD", REMINDER_KEYS["1h"]],
        ["SCARD", REMINDER_KEYS["5min"]],
        ["SMEMBERS", REMINDER_KEYS["1h"]],
        ["SMEMBERS", REMINDER_KEYS["5min"]],
      ]);
      var c1 = pipe && pipe[0] && pipe[0].result !== undefined ? pipe[0].result : 0;
      var c2 = pipe && pipe[1] && pipe[1].result !== undefined ? pipe[1].result : 0;
      var ids1 = Array.isArray(pipe[2] && pipe[2].result) ? pipe[2].result : [];
      var ids2 = Array.isArray(pipe[3] && pipe[3].result) ? pipe[3].result : [];
      var msg = "📩 Подписка на напоминание\n\nПодписался: " + name + (uname ? " " + uname : "") + " (id " + user.id + ")\nТип: " + whenLabel + "\n\nВсего «за час»: " + c1 + (ids1.length ? " [" + ids1.join(", ") + "]" : "") + "\nВсего «за 5 мин»: " + c2 + (ids2.length ? " [" + ids2.join(", ") + "]" : "");
      sendNotify(msg);
    }
    if (when === "5sec") {
      // Клиент сам подождёт 5 сек и вызовет send — без долгого запроса и таймаута Vercel
      return res.status(200).json({
        ok: true,
        subscribed: true,
        useClientDelay: true,
        hint: "Не закрывайте приложение 5 секунд",
      });
    }
    return res.status(200).json({ ok: true, subscribed: true });
  }

  let userMessage = "Сервис напоминаний временно недоступен. Попробуйте позже.";
  if (out.error === "not_configured") {
    userMessage = "Не настроены переменные Redis. В Vercel добавьте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN, затем Redeploy.";
  } else if (out.status === 401 || out.status === 403) {
    userMessage = "Неверный токен Redis. В Upstash скопируйте стандартный токен (не Read Only).";
  } else if (out.error === "bad_response" || out.error === "redis_error") {
    userMessage = "Ошибка Redis. Проверьте настройки в Upstash и что база не приостановлена.";
  }

  return res.status(503).json({ ok: false, error: userMessage });
};
