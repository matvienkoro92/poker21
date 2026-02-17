/**
 * Пользователи: dtId (мой ID) и поиск по ID.
 * GET ?initData= → dtId
 * GET ?initData=&id=ID123456 → userId, userName для личного чата
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const DT_IDS_KEY = "poker_app:visitor_dt_ids";
const P21_IDS_KEY = "poker_app:visitor_p21_ids";
const ID_TO_USER_KEY = "poker_app:id_to_user";
const USERNAMES_KEY = "poker_app:visitor_usernames";

function generateUserId() {
  return "ID" + String(Math.floor(100000 + Math.random() * 900000));
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
    return user.id ? { id: user.id } : null;
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
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();

  const initData = req.query.initData || req.query.init_data;
  const user = validateUser(initData);
  if (!user) return res.status(401).json({ ok: false, error: "Откройте в Telegram" });

  // POST: сохранить P21 ID (6 цифр)
  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    const postInitData = body.initData || body.init_data;
    const postUser = validateUser(postInitData);
    if (!postUser) return res.status(401).json({ ok: false, error: "Откройте в Telegram" });
    let p21Id = (body && body.p21Id != null ? String(body.p21Id) : "").trim().replace(/\D/g, "").slice(0, 6);
    if (p21Id.length !== 0 && p21Id.length !== 6) return res.status(400).json({ ok: false, error: "Введите 6 цифр или оставьте поле пустым" });
    if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ ok: false, error: "Redis not configured" });
    const safeId = "tg_" + postUser.id;
    if (p21Id.length === 6) await redisPipeline([["HSET", P21_IDS_KEY, safeId, p21Id]]);
    else await redisPipeline([["HDEL", P21_IDS_KEY, safeId]]);
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });

  const searchId = (req.query.id || req.query.userId || req.query.dtId || "").trim().toUpperCase();

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Redis not configured" });
  }

  // Поиск по ID
  if (searchId && /^ID\d{6}$/.test(searchId)) {
    const results = await redisPipeline([
      ["HGET", ID_TO_USER_KEY, searchId],
      ["HGETALL", USERNAMES_KEY],
    ]);
    const userId = results && results[0] && results[0].result ? String(results[0].result).trim() : null;
    if (!userId) return res.status(404).json({ ok: false, error: "Пользователь с таким ID не найден" });

    const myId = "tg_" + user.id;
    if (userId === myId) return res.status(400).json({ ok: false, error: "Нельзя написать себе" });

    let userName = userId;
    const usernamesRaw = results[1]?.result;
    if (Array.isArray(usernamesRaw)) {
      for (let i = 0; i < usernamesRaw.length; i += 2) {
        if (usernamesRaw[i] === userId && usernamesRaw[i + 1]) {
          userName = "@" + String(usernamesRaw[i + 1]).trim();
          break;
        }
      }
    }

    return res.status(200).json({ ok: true, userId, userName });
  }

  // Мой dtId и p21Id
  const safeId = "tg_" + user.id;
  const results = await redisPipeline([
    ["HGET", DT_IDS_KEY, safeId],
    ["HGET", P21_IDS_KEY, safeId],
  ]);
  let dtId = results && results[0] && results[0].result ? String(results[0].result).trim() : null;
  let p21Id = results && results[1] && results[1].result ? String(results[1].result).trim() : null;
  if (p21Id === "") p21Id = null;
  const needsNewId = !dtId || /^DT#\d+$/.test(dtId);
  if (needsNewId) {
    for (let i = 0; i < 10; i++) {
      dtId = generateUserId();
      const exists = await redisPipeline([["HGET", ID_TO_USER_KEY, dtId]]);
      const taken = exists && exists[0] && exists[0].result;
      if (!taken) {
        await redisPipeline([
          ["HSET", DT_IDS_KEY, safeId, dtId],
          ["HSET", ID_TO_USER_KEY, dtId, safeId],
        ]);
        break;
      }
    }
  }

  const payload = { ok: true, dtId };
  if (p21Id) payload.p21Id = p21Id;
  return res.status(200).json(payload);
};
