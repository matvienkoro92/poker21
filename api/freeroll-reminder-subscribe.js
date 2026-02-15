/**
 * Подписка на напоминание «за час» или «за 10 мин» до турнира дня.
 * Для «5 сек»: QStash отправит напоминание через 5 сек (работает при закрытом приложении).
 * Переменные: TELEGRAM_BOT_TOKEN, UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, QSTASH_TOKEN.
 * Опционально: QSTASH_URL (для US: https://us1.qstash.upstash.io)
 */
const crypto = require("crypto");

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const REMINDER_KEYS = { "1h": "poker_app:freeroll_reminder", "10min": "poker_app:freeroll_reminder_10min", "5sec": "poker_app:freeroll_reminder_5sec" };

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
  const when = whenRaw === "5sec" ? "5sec" : whenRaw === "10min" ? "10min" : "1h";
  const key = REMINDER_KEYS[when];
  const out = await redisCommandWithStatus("SADD", key, String(user.id));

  if (out.result !== undefined) {
    if (when === "5sec") {
      if (!QSTASH_TOKEN) {
        return res.status(503).json({ ok: false, error: "Добавьте QSTASH_TOKEN в Vercel для напоминаний при закрытом приложении." });
      }
      const apiBase = process.env.VERCEL_URL
        ? "https://" + process.env.VERCEL_URL
        : (process.env.VERCEL_BRANCH_URL || "https://poker-app-ebon.vercel.app");
      const sendUrl = apiBase + "/api/freeroll-reminder-send?when=5sec";
      const qHost = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");
      try {
        const qRes = await fetch(qHost + "/v2/publish/" + encodeURIComponent(sendUrl), {
          method: "POST",
          headers: {
            Authorization: "Bearer " + QSTASH_TOKEN,
            "Content-Type": "application/json",
            "Upstash-Delay": "5s",
          },
          body: JSON.stringify({ initData: initData }),
        });
        if (qRes.ok) {
          return res.status(200).json({ ok: true, subscribed: true });
        }
      } catch (e) {}
      return res.status(503).json({ ok: false, error: "Не удалось запланировать напоминание. Попробуйте позже." });
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
