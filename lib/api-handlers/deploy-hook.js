/**
 * Вызов после деплоя: загружает задеплоенный сайт, достаёт версию газеты и заголовок
 * первой новости, вызывает /api/gazette-notify и /api/rating-notify. Подписчики газеты
 * и рейтинга получают по одному сообщению после пуша (по одному разу на версию).
 *
 * GET/POST с secret=CRON_SECRET или заголовок X-Cron-Secret.
 * Переменные: CRON_SECRET, VERCEL_URL или APP_URL (базовый URL приложения).
 */
const CRON_SECRET = process.env.CRON_SECRET;

function getBaseUrl() {
  const vercel = process.env.VERCEL_URL;
  if (vercel) return "https://" + vercel.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const app = process.env.APP_URL || process.env.MINI_APP_URL;
  if (app) return app.replace(/\/$/, "");
  return null;
}

function parseGazetteVersion(jsContent) {
  const m = (jsContent || "").match(/GAZETTE_VERSION\s*=\s*["']([^"']+)["']/);
  return m ? m[1].trim() : null;
}

function parseFirstNewsFromHtml(html) {
  const str = html || "";
  const articleMatch = str.match(/data-gazette-article="(\d+)"[\s\S]*?gazette-modal__headline[^>]*>([^<]+)</);
  if (!articleMatch) return { articleIndex: 0, headline: "" };
  const articleIndex = parseInt(articleMatch[1], 10);
  const headline = articleMatch[2].replace(/\s+/g, " ").trim();
  return { articleIndex: Number.isNaN(articleIndex) ? 0 : articleIndex, headline };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const auth =
    (req.headers && req.headers["x-cron-secret"]) ||
    (req.query && req.query.secret) ||
    ((req.headers && req.headers.authorization) || "").replace(/^Bearer\s+/i, "");
  if (!CRON_SECRET || auth !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing CRON_SECRET" });
  }

  const base = getBaseUrl();
  if (!base) {
    return res.status(500).json({ ok: false, error: "VERCEL_URL or APP_URL not set" });
  }

  let appJs = "";
  let indexHtml = "";
  try {
    const [jsRes, htmlRes] = await Promise.all([
      fetch(base + "/app.js", { headers: { "Cache-Control": "no-cache" } }),
      fetch(base + "/index.html", { headers: { "Cache-Control": "no-cache" } }),
    ]);
    if (jsRes.ok) appJs = await jsRes.text();
    if (htmlRes.ok) indexHtml = await htmlRes.text();
  } catch (e) {
    return res.status(502).json({ ok: false, error: "Failed to fetch site: " + (e.message || "unknown") });
  }

  const version = parseGazetteVersion(appJs);
  const { articleIndex, headline } = parseFirstNewsFromHtml(indexHtml);
  const newsId = version || "deploy-" + Date.now();

  const notifyUrl = base + "/api/gazette-notify";
  const body = JSON.stringify({
    newsId,
    headline: headline || "Новая новость в газете",
    articleIndex,
    postToChat: true,
  });

  let notifyResult;
  try {
    const notifyRes = await fetch(notifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": CRON_SECRET,
      },
      body,
    });
    notifyResult = await notifyRes.json().catch(() => ({ ok: false, error: "Invalid response" }));
  } catch (e) {
    return res.status(502).json({
      ok: false,
      error: "Failed to call gazette-notify: " + (e.message || "unknown"),
    });
  }

  const ratingId = version || "deploy-" + Date.now();
  const ratingNotifyUrl = base + "/api/rating-notify";
  let ratingNotifyResult = { ok: false, skipped: true };
  try {
    const ratingRes = await fetch(ratingNotifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Cron-Secret": CRON_SECRET,
      },
      body: JSON.stringify({ ratingId }),
    });
    ratingNotifyResult = await ratingRes.json().catch(() => ({ ok: false, error: "Invalid response" }));
  } catch (e) {
    ratingNotifyResult = { ok: false, error: (e.message || "unknown") };
  }

  return res.status(200).json({
    ok: true,
    deployHook: true,
    newsId,
    headline: headline || null,
    articleIndex,
    notify: notifyResult,
    ratingNotify: ratingNotifyResult,
  });
};
