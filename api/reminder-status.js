/**
 * Диагностика: проверка доступности Redis для напоминаний.
 * GET /api/reminder-status — без секретов, можно открыть в браузере.
 * Ответ: { redis: "ok" } | { redis: "not_configured" } | { redis: "error", hint: "..." }
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ redis: "error", hint: "Use GET" });

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(200).json({
      redis: "not_configured",
      hint: "В Vercel задайте UPSTASH_REDIS_REST_URL и UPSTASH_REDIS_REST_TOKEN, затем Redeploy.",
    });
  }

  const baseUrl = REDIS_URL.replace(/\/$/, "");
  const url = baseUrl + "/pipeline";
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([["PING"]]),
    });
    const data = await r.json().catch(() => null);
    if (r.status === 401 || r.status === 403) {
      return res.status(200).json({
        redis: "error",
        hint: "Неверный токен Redis. В Upstash скопируйте именно стандартный токен (не Read Only).",
      });
    }
    if (!r.ok) {
      return res.status(200).json({
        redis: "error",
        hint: "Redis не ответил (HTTP " + r.status + "). Проверьте URL и что база не приостановлена в Upstash.",
      });
    }
    if (Array.isArray(data) && data[0] && data[0].result !== undefined) {
      return res.status(200).json({ redis: "ok" });
    }
    return res.status(200).json({
      redis: "error",
      hint: "Неожиданный ответ Redis. Проверьте формат URL в Upstash (должен быть HTTPS REST URL).",
    });
  } catch (e) {
    return res.status(200).json({
      redis: "error",
      hint: "Ошибка соединения с Redis. Проверьте UPSTASH_REDIS_REST_URL.",
    });
  }
};
