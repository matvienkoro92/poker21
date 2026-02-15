/**
 * GET /api/pikhanina-stats — сколько призов ещё осталось (глобальный счётчик в Redis).
 * Ответ: { remaining: 0..N }. N задаётся в Vercel: PIKHANINA_MAX_PRIZES (по умолчанию 5).
 * При каждом выигрыше в bonus-won делается INCR по ключу — счётчик уменьшается.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "poker_app:pikhanina_claimed_count";
const MAX_PRIZES = Math.max(0, parseInt(process.env.PIKHANINA_MAX_PRIZES, 10) || 5);

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/get/" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: "Bearer " + REDIS_TOKEN },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(function () { return null; });
  return data && data.result !== undefined ? data.result : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const raw = await redisGet(KEY);
  const claimed = Math.max(0, parseInt(raw, 10) || 0);
  const remaining = Math.max(0, MAX_PRIZES - claimed);
  return res.status(200).json({ remaining: remaining });
};
