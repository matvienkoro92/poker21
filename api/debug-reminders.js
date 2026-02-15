/**
 * GET /api/debug-reminders — сколько подписчиков на «за час» и «за 10 мин».
 * Помогает понять, почему напоминания не пришли.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisCommand(cmd, ...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([[cmd, ...args]]),
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!Array.isArray(data) || !data[0] || data[0].error) return null;
  return data[0].result;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const count1h = await redisCommand("SCARD", "poker_app:freeroll_reminder");
  const count10min = await redisCommand("SCARD", "poker_app:freeroll_reminder_10min");
  return res.status(200).json({
    ok: true,
    subscribers1h: count1h != null ? count1h : "—",
    subscribers10min: count10min != null ? count10min : "—",
    cronSecretSet: !!process.env.CRON_SECRET,
    hint: "Турнир воскресенье 22:03 мск. Cron: 21:03 и 21:53. На Hobby используйте cron-job.org.",
  });
};
