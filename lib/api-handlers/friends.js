/**
 * Друзья: добавить в друзья, список друзей.
 * GET ?initData= → список { userId, userName }[]
 * POST { initData, targetUserId } → добавить в друзья
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";

const FRIENDS_KEY_PREFIX = "poker_app:friends:";
const USERNAMES_KEY = "poker_app:visitor_usernames";

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

  const initData = req.query.initData || req.query.init_data || (req.body && req.body.initData) || (req.body && req.body.init_data);
  const user = validateUser(initData);
  if (!user) return res.status(401).json({ ok: false, error: "Откройте в Telegram" });

  const myId = "tg_" + user.id;

  if (req.method === "POST") {
    let body;
    try {
      body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Invalid JSON" });
    }
    const targetUserId = (body.targetUserId || "").trim();
    if (!targetUserId || !targetUserId.startsWith("tg_")) return res.status(400).json({ ok: false, error: "Нужен targetUserId" });
    if (targetUserId === myId) return res.status(400).json({ ok: false, error: "Нельзя добавить себя" });
    if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ ok: false, error: "Сервер не настроен" });
    const key = FRIENDS_KEY_PREFIX + myId;
    const result = await redisPipeline([["SADD", key, targetUserId]]);
    if (!result) return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ ok: false, error: "Redis not configured" });

  const key = FRIENDS_KEY_PREFIX + myId;
  const membersRes = await redisPipeline([["SMEMBERS", key]]);
  const memberList = membersRes && membersRes[0] && Array.isArray(membersRes[0].result) ? membersRes[0].result : [];
  if (memberList.length === 0) return res.status(200).json({ ok: true, friends: [] });
  const cmds = memberList.map((id) => ["HGET", USERNAMES_KEY, id]);
  const namesRes = await redisPipeline(cmds);
  const friends = memberList.map((userId, i) => {
    const un = namesRes && namesRes[i] && namesRes[i].result ? String(namesRes[i].result).trim() : "";
    const userName = un ? "@" + un : userId;
    return { userId, userName };
  });
  return res.status(200).json({ ok: true, friends });
};
