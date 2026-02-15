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

  const format = (req.query.format || "").toLowerCase();
  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const rows = visitors.map((v, i) => {
      let idCell;
      if (v.id.startsWith("tg_")) {
        const userId = v.id.replace(/^tg_/, "");
        idCell = `<a href="tg://user?id=${escapeAttr(userId)}" target="_blank" rel="noopener">${escapeHtml(v.id)}</a>`;
      } else {
        idCell = `<code>${escapeHtml(v.id)}</code>`;
      }
      return `<tr><td>${i + 1}</td><td>${idCell}</td><td>${v.count}</td><td>${v.id.startsWith("tg_") ? "Telegram" : "Web"}</td></tr>`;
    }).join("");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Посетители</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 24px; background: #1a1a2e; color: #eee; }
    h1 { font-size: 1.5rem; }
    .stats { margin-bottom: 16px; color: #aaa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #16213e; }
    tr:hover { background: #16213e; }
    code { font-size: 0.9em; background: #0f0f1a; padding: 2px 6px; border-radius: 4px; }
    a { color: #4fc3f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .empty { color: #666; padding: 24px; }
  </style>
</head>
<body>
  <h1>Посетители приложения</h1>
  <p class="stats">Всего визитов: <strong>${total}</strong> • Уникальных: <strong>${visitors.length}</strong></p>
  <table>
    <thead><tr><th>#</th><th>ID</th><th>Визитов</th><th>Тип</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="4" class="empty">Нет данных</td></tr>'}</tbody>
  </table>
</body>
</html>`);
  }

  return res.status(200).json({
    ok: true,
    visitors,
    total,
    unique: visitors.length,
  });
};

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
