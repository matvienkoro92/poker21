/**
 * GET /api/pikhanina-stats — сколько призов по 200р ещё осталось (глобальный счётчик в Redis).
 * Ответ: { remaining: 0..10 }
 *
 * Учёт уже выданных призов: в Vercel задай PIKHANINA_CLAIMED_INITIAL = число уже выданных (0–10).
 * При первом запросе, если в Redis ключа ещё нет, он будет установлен в это значение — счётчик станет корректным.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "poker_app:pikhanina_claimed_count";
const MAX_PRIZES = 10;
const INITIAL_CLAIMED = process.env.PIKHANINA_CLAIMED_INITIAL;

async function redisGet(key) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const url = REDIS_URL.replace(/\/$/, "") + "/get/" + encodeURIComponent(key);
  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  return data && data.result !== undefined ? data.result : null;
}

async function redisSet(key, value) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  const url = REDIS_URL.replace(/\/$/, "") + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", key, String(value)]]),
  });
  if (!res.ok) return false;
  const data = await res.json().catch(() => null);
  return Array.isArray(data) && data[0] && data[0].result !== undefined;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  let raw = await redisGet(KEY);
  const initial = parseInt(INITIAL_CLAIMED, 10);
  const useInitial = !isNaN(initial) && initial >= 0;
  const current = parseInt(raw, 10) || 0;
  if (useInitial && initial > current) {
    await redisSet(KEY, Math.min(MAX_PRIZES, initial));
    raw = initial;
  } else if ((raw === null || raw === undefined) && useInitial) {
    await redisSet(KEY, Math.min(MAX_PRIZES, initial));
    raw = initial;
  }
  const claimed = parseInt(raw, 10) || 0;
  const remaining = Math.max(0, MAX_PRIZES - claimed);
  return res.status(200).json({ remaining });
};
