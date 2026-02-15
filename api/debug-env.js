/**
 * Отладка: проверка переменных и подписчиков напоминаний.
 * GET /api/debug-env — переменные окружения.
 * GET /api/debug-env?reminders=1 — + кол-во подписчиков «за час» и «за 10 мин».
 */
async function redisScard(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const u = url.replace(/\/$/, "") + "/pipeline";
  const r = await fetch(u, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify([["SCARD", key]]),
  });
  if (!r.ok) return null;
  const d = await r.json().catch(function () { return null; });
  if (!Array.isArray(d) || !d[0] || d[0].error) return null;
  return d[0].result;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
  const allKeys = Object.keys(process.env || {});
  const botRelatedKeys = allKeys.filter(function (k) {
    var lower = k.toLowerCase();
    return lower.indexOf("telegram") !== -1 || lower.indexOf("bot") !== -1;
  });
  const out = {
    ok: true,
    telegramTokenSet: !!token,
    telegramTokenLength: token.length,
    tokenSource: process.env.TELEGRAM_BOT_TOKEN ? "TELEGRAM_BOT_TOKEN" : process.env.TELEGRAM_TOKEN ? "TELEGRAM_TOKEN" : process.env.BOT_TOKEN ? "BOT_TOKEN" : "—",
    botRelatedEnvKeys: botRelatedKeys,
    redisSet: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    qstashSet: !!process.env.QSTASH_TOKEN,
    cronSecretSet: !!process.env.CRON_SECRET,
    vercelUrl: process.env.VERCEL_URL || "—",
  };
  if (req.query && req.query.reminders === "1") {
    out.subscribers1h = await redisScard("poker_app:freeroll_reminder");
    out.subscribers10min = await redisScard("poker_app:freeroll_reminder_10min");
  }
  return res.status(200).json(out);
};
