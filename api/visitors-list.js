/**
 * Список всех посетителей приложения.
 * GET /api/visitors-list?secret=CRON_SECRET
 *
 * Ответ: { ok, visitors: [{ id, count }], total, unique }
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = REDIS_URL.replace(/\/$/, "");
  const url = base + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const secret = req.query.secret || (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing secret" });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Redis not configured" });
  }

  const results = await redisPipeline([
    ["SMEMBERS", "poker_app:visitors"],
    ["HGETALL", "poker_app:visits"],
  ]);

  if (!results || !Array.isArray(results) || results.length < 2) {
    return res.status(500).json({ ok: false, error: "Redis error" });
  }

  const ids = Array.isArray(results[0]?.result) ? results[0].result : [];
  const hash = results[1]?.result;

  let visitsHash = {};
  if (Array.isArray(hash)) {
    for (let i = 0; i < hash.length; i += 2) {
      visitsHash[hash[i]] = parseInt(hash[i + 1], 10) || 0;
    }
  } else if (hash && typeof hash === "object") {
    visitsHash = hash;
  }

  const visitors = ids.map((id) => ({ id, count: visitsHash[id] || 1 }));
  visitors.sort((a, b) => b.count - a.count);

  const total = visitors.reduce((s, v) => s + (v.count || 0), 0);

  return res.status(200).json({
    ok: true,
    visitors,
    total,
    unique: visitors.length,
  });
};
