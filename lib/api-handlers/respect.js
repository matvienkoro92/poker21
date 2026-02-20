/**
 * Уважение в чате: счётчик и голоса (поднять/уменьшить один раз на пользователя).
 * GET ?userId=tg_xxx → score, myVote ("up"|"down"|null)
 * GET (без userId) → мой score для профиля
 * POST { targetUserId, action: "up"|"down" } → один раз поднять, один раз уменьшить
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";

const RESPECT_SCORE_KEY = "poker_app:respect_score";

function respectVotesKey(targetId) {
  return "poker_app:respect_votes:" + targetId;
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
    const action = (body.action || "").toLowerCase();
    if (!targetUserId || !targetUserId.startsWith("tg_")) return res.status(400).json({ ok: false, error: "Нужен targetUserId" });
    if (action !== "up" && action !== "down") return res.status(400).json({ ok: false, error: "action: up или down" });
    if (targetUserId === myId) return res.status(400).json({ ok: false, error: "Нельзя голосовать за себя" });
    if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ ok: false, error: "Сервер не настроен" });

    const votesKey = respectVotesKey(targetUserId);
    const currentResult = await redisPipeline([["HGET", votesKey, myId]]);
    const current = currentResult && currentResult[0] && currentResult[0].result ? String(currentResult[0].result).trim() : null;

    if (action === "up") {
      if (current === "up") return res.status(400).json({ ok: false, error: "already_raised" });
      const delta = current === "down" ? 2 : 1;
      const pipeResult = await redisPipeline([
        ["HINCRBY", RESPECT_SCORE_KEY, targetUserId, delta],
        ["HSET", votesKey, myId, "up"],
      ]);
      if (!pipeResult) return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
      return res.status(200).json({ ok: true });
    }
    if (action === "down") {
      if (current === "down") return res.status(400).json({ ok: false, error: "already_lowered" });
      const delta = current === "up" ? -2 : -1;
      const pipeResult = await redisPipeline([
        ["HINCRBY", RESPECT_SCORE_KEY, targetUserId, delta],
        ["HSET", votesKey, myId, "down"],
      ]);
      if (!pipeResult) return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
      return res.status(200).json({ ok: true });
    }
  }

  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });
  if (!REDIS_URL || !REDIS_TOKEN) return res.status(500).json({ ok: false, error: "Redis not configured" });

  const targetUserId = (req.query.userId || "").trim();

  if (targetUserId && targetUserId.startsWith("tg_")) {
    const results = await redisPipeline([
      ["HGET", RESPECT_SCORE_KEY, targetUserId],
      ["HGET", respectVotesKey(targetUserId), myId],
    ]);
    const scoreRaw = results && results[0] && results[0].result != null ? results[0].result : 0;
    const score = parseInt(scoreRaw, 10) || 0;
    const myVoteRaw = results && results[1] && results[1].result ? String(results[1].result).trim() : null;
    const myVote = myVoteRaw === "up" || myVoteRaw === "down" ? myVoteRaw : null;
    return res.status(200).json({ ok: true, score, myVote });
  }

  const results = await redisPipeline([["HGET", RESPECT_SCORE_KEY, myId]]);
  const scoreRaw = results && results[0] && results[0].result != null ? results[0].result : 0;
  const score = parseInt(scoreRaw, 10) || 0;
  return res.status(200).json({ ok: true, score });
};
