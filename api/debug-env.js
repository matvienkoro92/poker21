/**
 * Отладка: проверка, видны ли переменные окружения в Vercel.
 * GET /api/debug-env — покажет, заданы ли переменные (без значений).
 */
module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "GET only" });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
  return res.status(200).json({
    ok: true,
    telegramTokenSet: !!token,
    telegramTokenLength: token.length,
    tokenSource: process.env.TELEGRAM_BOT_TOKEN ? "TELEGRAM_BOT_TOKEN" : process.env.TELEGRAM_TOKEN ? "TELEGRAM_TOKEN" : process.env.BOT_TOKEN ? "BOT_TOKEN" : "—",
    redisSet: !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN),
    qstashSet: !!process.env.QSTASH_TOKEN,
    vercelUrl: process.env.VERCEL_URL || "—",
  });
};
