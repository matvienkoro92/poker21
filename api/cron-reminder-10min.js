/**
 * Эндпоинт для Vercel Cron — напоминание «за 10 мин».
 * Вызывается cron'ом (без query). Проксирует на freeroll-reminder-send с when=10min.
 */
const CRON_SECRET = process.env.CRON_SECRET;
const VERCEL_URL = process.env.VERCEL_URL || "poker-app-ebon.vercel.app";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();

  const auth = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid CRON_SECRET" });
  }

  const base = VERCEL_URL.startsWith("http") ? VERCEL_URL : "https://" + VERCEL_URL;
  const url = base + "/api/freeroll-reminder-send?when=10min&secret=" + encodeURIComponent(CRON_SECRET);

  try {
    const r = await fetch(url, { method: "GET" });
    const data = await r.json().catch(() => ({}));
    res.status(r.status).json(data);
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
