/**
 * Розыгрыши: создание (админ), участие (по P21 ID), жеребьёвка по времени.
 * Redis: poker_app:raffle_ids (list), poker_app:raffle:{id} (JSON).
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
const RAFFLE_IDS_KEY = "poker_app:raffle_ids";
const RAFFLE_PREFIX = "poker_app:raffle:";
const P21_IDS_KEY = "poker_app:visitor_p21_ids";

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
      ? {
          id: user.id,
          firstName: user.first_name || "",
          username: user.username || "",
        }
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
  return await res.json();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function runDraw(raffle) {
  if (raffle.status !== "active" || raffle.participants.length === 0) return raffle;
  const total = Math.min(raffle.totalWinners, raffle.participants.length);
  const shuffled = shuffle(raffle.participants);
  const winners = [];
  let idx = 0;
  for (let g = 0; g < raffle.groups.length && idx < total; g++) {
    const group = raffle.groups[g];
    const count = Math.min(group.count, total - idx);
    for (let i = 0; i < count && idx < shuffled.length; i++, idx++) {
      winners.push({
        ...shuffled[idx],
        groupIndex: g,
        prize: group.prize || "",
      });
    }
  }
  while (idx < total && idx < shuffled.length) {
    winners.push({
      ...shuffled[idx],
      groupIndex: -1,
      prize: "",
    });
    idx++;
  }
  raffle.winners = winners;
  raffle.status = "drawn";
  raffle.drawnAt = new Date().toISOString();
  return raffle;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {}

  const initData = req.query.initData || req.query.init_data || body.initData || body.init_data;
  const user = validateUser(initData);
  if (!user) return res.status(401).json({ ok: false, error: "Откройте приложение в Telegram" });

  const myId = "tg_" + user.id;
  const admin = isAdmin(myId);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Сервер не настроен" });
  }

  // POST: создать розыгрыш (админ) или участвовать (join)
  if (req.method === "POST") {
    const action = body.action || req.query.action || "join";

    if (action === "create") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
      const totalWinners = Math.max(1, Math.min(100, parseInt(body.totalWinners || body.total_winners || "1", 10) || 1));
      const groupsRaw = body.groups;
      let groups = [];
      if (Array.isArray(groupsRaw) && groupsRaw.length > 0) {
        groups = groupsRaw.slice(0, 20).map((g) => ({
          count: Math.max(0, Math.min(100, parseInt(g.count, 10) || 0)),
          prize: String(g.prize || "").trim().slice(0, 200),
        }));
      }
      if (groups.length === 0) groups = [{ count: totalWinners, prize: "Приз" }];
      const endDateStr = (body.endDate || body.end_date || "").trim();
      const endDate = endDateStr ? new Date(endDateStr) : null;
      if (!endDate || isNaN(endDate.getTime())) {
        return res.status(400).json({ ok: false, error: "Укажите дату завершения (endDate)" });
      }

      const raffleId = "raffle_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
      const raffle = {
        id: raffleId,
        createdBy: myId,
        totalWinners,
        groups,
        endDate: endDate.toISOString(),
        participants: [],
        winners: [],
        status: "active",
        createdAt: new Date().toISOString(),
      };

      const results = await redisPipeline([
        ["RPUSH", RAFFLE_IDS_KEY, raffleId],
        ["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)],
      ]);
      if (!results || results.some((r) => r && r.error)) {
        return res.status(500).json({ ok: false, error: "Ошибка создания" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "join") {
      const raffleId = (body.raffleId || body.raffle_id || "").trim();
      if (!raffleId) return res.status(400).json({ ok: false, error: "Укажите raffleId" });

      const getRes = await redisPipeline([["GET", RAFFLE_PREFIX + raffleId]]);
      const raw = getRes && getRes[0] && getRes[0].result;
      if (!raw) return res.status(404).json({ ok: false, error: "Розыгрыш не найден" });
      let raffle;
      try {
        raffle = JSON.parse(raw);
      } catch (e) {
        return res.status(500).json({ ok: false, error: "Ошибка данных" });
      }
      if (raffle.status !== "active") {
        return res.status(400).json({ ok: false, error: "Розыгрыш завершён" });
      }
      if (new Date(raffle.endDate) <= new Date()) {
        return res.status(400).json({ ok: false, error: "Приём заявок завершён" });
      }
      if (raffle.participants.some((p) => p.userId === myId)) {
        return res.status(200).json({ ok: true, raffle, alreadyJoined: true });
      }

      const p21Res = await redisPipeline([["HGET", P21_IDS_KEY, myId]]);
      const p21Id = p21Res && p21Res[0] && p21Res[0].result ? String(p21Res[0].result).trim() : null;
      if (!p21Id || p21Id.length !== 6) {
        return res.status(400).json({
          ok: false,
          error: "Заполните P21_ID в профиле",
          code: "P21_REQUIRED",
        });
      }

      const name = user.firstName || (user.username ? "@" + user.username : "Участник");
      raffle.participants.push({ userId: myId, name, p21Id });
      const setRes = await redisPipeline([["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]]);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    return res.status(400).json({ ok: false, error: "action: create или join" });
  }

  // GET: список активных или один розыгрыш
  const raffleId = req.query.id || req.query.raffleId || req.query.raffle_id;
  if (raffleId) {
    const getRes = await redisPipeline([["GET", RAFFLE_PREFIX + raffleId]]);
    const raw = getRes && getRes[0] && getRes[0].result;
    if (!raw) return res.status(404).json({ ok: false, error: "Розыгрыш не найден" });
    let raffle;
    try {
      raffle = JSON.parse(raw);
    } catch (e) {
      return res.status(500).json({ ok: false, error: "Ошибка данных" });
    }
    const now = new Date();
    const endDate = new Date(raffle.endDate);
    if (raffle.status === "active" && endDate <= now) {
      raffle = runDraw(raffle);
      await redisPipeline([["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]]);
    }
    return res.status(200).json({ ok: true, raffle, isAdmin: admin });
  }

  const listRes = await redisPipeline([["LRANGE", RAFFLE_IDS_KEY, "0", "-1"]]);
  const ids = (listRes && listRes[0] && listRes[0].result) || [];
  const raffles = [];
  for (const id of ids) {
    const r = await redisPipeline([["GET", RAFFLE_PREFIX + id]]);
    const str = r && r[0] && r[0].result;
    if (str) {
      try {
        const raffle = JSON.parse(str);
        const endDate = new Date(raffle.endDate);
        if (raffle.status === "active" && endDate <= new Date()) {
          const updated = runDraw(raffle);
          await redisPipeline([["SET", RAFFLE_PREFIX + id, JSON.stringify(updated)]]);
          raffles.push(updated);
        } else {
          raffles.push(raffle);
        }
      } catch (e) {}
    }
  }
  raffles.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const active = raffles.filter((r) => r.status === "active");
  return res.status(200).json({ ok: true, raffles, activeRaffle: active[0] || null, isAdmin: admin });
}
