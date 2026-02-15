/**
 * Создаёт расписание в QStash для отправки напоминания «за 10 мин» каждый понедельник в 4:14 по Бали.
 * Без cron-job.org — всё через Upstash.
 *
 * Вызов: GET /api/setup-qstash-reminder?key=ВАШ_CRON_SECRET
 *
 * Переменные: QSTASH_TOKEN, CRON_SECRET, VERCEL_URL (или полный URL приложения).
 */
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;
const VERCEL_URL = process.env.VERCEL_URL || "poker-app-ebon.vercel.app";
const QSTASH_BASE = process.env.QSTASH_URL || "https://qstash.upstash.io";
const SCHEDULE_ID = "poker_freeroll_10min";

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "GET or POST only" });
  }

  const key = req.query && req.query.key;
  if (!CRON_SECRET || key !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing key" });
  }
  if (!QSTASH_TOKEN) {
    return res.status(500).json({ ok: false, error: "QSTASH_TOKEN not set" });
  }

  const baseUrl = VERCEL_URL.startsWith("http") ? VERCEL_URL : "https://" + VERCEL_URL.replace(/\/$/, "");
  const dest = baseUrl + "/api/freeroll-reminder-send?when=10min&secret=" + encodeURIComponent(CRON_SECRET);
  const destEncoded = encodeURIComponent(dest);

  const cron = "CRON_TZ=Asia/Makassar 14 4 * * 1";

  try {
    const r = await fetch(QSTASH_BASE + "/v2/schedules/" + destEncoded, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + QSTASH_TOKEN,
        "Content-Type": "application/json",
        "Upstash-Cron": cron,
        "Upstash-Schedule-Id": SCHEDULE_ID,
      },
      body: JSON.stringify({}),
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch (_) { data = { message: text }; }

    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: data.message || data.error || text });
    }
    return res.status(200).json({ ok: true, message: "QStash schedule created. Reminder will run every Monday 4:14 Bali." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e.message || e) });
  }
};
