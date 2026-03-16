/**
 * Отчёты админов за смену (общие для всех админов).
 * GET /api/admin-report-shifts?initData=... — список отчётов (только админ).
 * POST /api/admin-report-shifts — сохранить отчёт (body: initData + поля отчёта, только админ).
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const REDIS_KEY = "poker_app:admin_report_shifts";
const MAX_REPORTS = 500;

function isAdmin(userId) {
  const id = String(userId).replace(/^tg_/, "");
  return id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id);
}

function validateUser(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + v)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id
      ? { id: user.id, firstName: user.first_name || "", username: user.username || "" }
      : null;
  } catch (e) {
    return null;
  }
}

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = String(REDIS_URL).replace(/\/$/, "");
  const res = await fetch(base + "/pipeline", {
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

  const initData =
    req.query.initData ||
    (req.body && (req.body.initData || req.body.init_data)) ||
    "";
  const user = initData ? validateUser(initData) : null;
  const userId = user ? "tg_" + user.id : null;
  const isAdminUser = user && isAdmin(userId);

  if (!isAdminUser) {
    return res.status(403).json({ ok: false, error: "Только для админов" });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Сервер не настроен" });
  }

  if (req.method === "GET") {
    const results = await redisPipeline([["LRANGE", REDIS_KEY, "0", String(MAX_REPORTS - 1)]]);
    const rawList = results && results[0] && results[0].result;
    const list = Array.isArray(rawList) ? rawList : [];
    const reports = [];
    for (const str of list) {
      try {
        reports.push(JSON.parse(str));
      } catch (e) {}
    }
    return res.status(200).json({ ok: true, reports });
  }

  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch (e) {
        return res.status(400).json({ ok: false, error: "Invalid JSON" });
      }
    }
    if (!body || typeof body !== "object") {
      return res.status(400).json({ ok: false, error: "Body required" });
    }

    const authorName =
      (user.firstName && user.firstName.trim()) ||
      (user.username ? "@" + user.username : "Админ");
    const report = {
      id: Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8),
      createdAt: new Date().toISOString(),
      authorId: userId,
      authorName: authorName.trim() || "Админ",
      date: body.date || "",
      weekday: body.weekday || "",
      comment: body.comment || "",
      total: body.total != null ? body.total : 0,
      deposit: body.deposit,
      cashout: body.cashout,
      prodamus: body.prodamus,
      robokassa: body.robokassa,
      romaCrypto: body.romaCrypto,
      botCryptoDep: body.botCryptoDep,
      botExchipDep: body.botExchipDep,
      botExchipCashout: body.botExchipCashout,
      bonuses: body.bonuses,
      transfers: body.transfers,
      ret: body.ret,
      sergeyMarina: body.sergeyMarina,
      extraName: body.extraName,
      extraAmount: body.extraAmount,
      extraFields: Array.isArray(body.extraFields) ? body.extraFields : [],
    };

    const json = JSON.stringify(report);
    await redisPipeline([["LPUSH", REDIS_KEY, json], ["LTRIM", REDIS_KEY, "0", String(MAX_REPORTS - 1)]]);
    return res.status(200).json({ ok: true, report });
  }

  return res.status(405).json({ ok: false, error: "GET or POST only" });
};
