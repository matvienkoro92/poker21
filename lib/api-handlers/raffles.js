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
const RAFFLE_IPS_PREFIX = "poker_app:raffle_ips:";
const RAFFLE_DEVICES_PREFIX = "poker_app:raffle_devices:";
const P21_IDS_KEY = "poker_app:visitor_p21_ids";
const RAFFLE_CHANNEL = process.env.RAFFLE_CHANNEL || "@dva_tuza_club";
const CRON_SECRET = process.env.CRON_SECRET;
const GENERAL_CHAT_KEY = "poker_app:chat_messages";
const MAX_CHAT_MESSAGES = 100;
const MINI_APP_URL = process.env.MINI_APP_URL || process.env.APP_URL || "";
// Картинка для сообщения клуба о новом розыгрыше.
// Можно переопределить через переменную окружения RAFFLE_CLUB_IMAGE_URL,
// например: https://your-site.com/assets/raffle-golden-ticket.png
// По умолчанию используем относительный путь, как и в index.html.
const RAFFLE_CLUB_IMAGE_URL = process.env.RAFFLE_CLUB_IMAGE_URL || "./assets/raffle-golden-ticket.png";

function getClientIp(req) {
  const forwarded = req.headers && (req.headers["x-forwarded-for"] || req.headers["x-real-ip"]);
  if (forwarded) {
    const first = String(forwarded).split(",")[0].trim();
    if (first) return first;
  }
  if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  return null;
}

function isAdmin(userId) {
  const id = String(userId).replace(/^tg_/, "");
  return id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id);
}

async function isChannelSubscriber(telegramUserId, botToken) {
  if (!botToken || !telegramUserId) return false;
  try {
    const chatId = encodeURIComponent(RAFFLE_CHANNEL);
    const userId = String(telegramUserId).replace(/^tg_/, "");
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/getChatMember?chat_id=${chatId}&user_id=${userId}`
    );
    const data = await res.json();
    const status = data.result && data.result.status ? String(data.result.status) : "";
    return ["member", "administrator", "creator"].includes(status);
  } catch (e) {
    return false;
  }
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
  if (raffle.status !== "active") return raffle;
  if (!raffle.participants || raffle.participants.length === 0) {
    raffle.winners = [];
    raffle.status = "drawn";
    raffle.drawnAt = new Date().toISOString();
    return raffle;
  }
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Cron-Secret");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let body = {};
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {}

  const cronAuth = req.headers["x-cron-secret"] || req.query.secret || (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
  const isCronCreate = req.method === "POST" && (body.action || req.query.action) === "create" && CRON_SECRET && cronAuth === CRON_SECRET;

  const initData = req.query.initData || req.query.init_data || body.initData || body.init_data;
  const user = validateUser(initData);
  if (!isCronCreate && !user) return res.status(401).json({ ok: false, error: "Откройте приложение в Telegram" });

  const myId = user ? "tg_" + user.id : "cron";
  const admin = isCronCreate || isAdmin(myId);

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Сервер не настроен" });
  }

  // POST: создать розыгрыш (админ) или участвовать (join)
  if (req.method === "POST") {
    const action = body.action || req.query.action || "join";

    if (action === "create") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
      const totalWinners = Math.max(1, Math.min(100, parseInt(body.totalWinners || body.total_winners || "1", 10) || 1));
      const titleRaw = (body.title || body.name || "").trim().slice(0, 200);
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
        title: titleRaw || (groups[0] && groups[0].prize) || "",
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

      const raffleLink = MINI_APP_URL
        ? (MINI_APP_URL.includes("?") ? MINI_APP_URL + "&" : MINI_APP_URL + "?") + "startapp=raffles"
        : "";
      const raffleTitle = (raffle.title || (raffle.groups && raffle.groups[0] && raffle.groups[0].prize) || "Розыгрыш").trim();
      const chatText = raffleLink
        ? "🎲 Новый розыгрыш!\n\n" + (raffleTitle ? raffleTitle + "\n\n" : "") + "Участвуй: " + raffleLink
        : "🎲 Новый розыгрыш!\n\n" + (raffleTitle || "Участвуй в разделе «Розыгрыши» в приложении.");
      const clubMsg = {
        id: "msg_raffle_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9),
        from: "club",
        fromName: "Клуб «Два туза»",
        text: chatText,
        time: new Date().toISOString(),
        image: RAFFLE_CLUB_IMAGE_URL || undefined,
      };
      await redisPipeline([
        ["LPUSH", GENERAL_CHAT_KEY, JSON.stringify(clubMsg)],
        ["LTRIM", GENERAL_CHAT_KEY, "0", String(MAX_CHAT_MESSAGES - 1)],
      ]);

      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "complete") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
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
        return res.status(400).json({ ok: false, error: "Розыгрыш уже завершён или отменён" });
      }
      raffle = runDraw(raffle);
      const setRes = await redisPipeline([["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]]);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "cancel") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
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
        return res.status(400).json({ ok: false, error: "Можно отменить только активный розыгрыш" });
      }
      raffle.status = "cancelled";
      raffle.cancelledAt = new Date().toISOString();
      const setRes = await redisPipeline([["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]]);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "setWinnerStatus") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
      const raffleId = (body.raffleId || body.raffle_id || "").trim();
      const winnerUserId = (body.winnerUserId || body.winner_user_id || "").trim();
      const status = body.status;
      if (!raffleId) return res.status(400).json({ ok: false, error: "Укажите raffleId" });
      if (!winnerUserId) return res.status(400).json({ ok: false, error: "Укажите winnerUserId" });
      const validStatus = status === "ok" || status === "fail" ? status : null;

      const getRes = await redisPipeline([["GET", RAFFLE_PREFIX + raffleId]]);
      const raw = getRes && getRes[0] && getRes[0].result;
      if (!raw) return res.status(404).json({ ok: false, error: "Розыгрыш не найден" });
      let raffle;
      try {
        raffle = JSON.parse(raw);
      } catch (e) {
        return res.status(500).json({ ok: false, error: "Ошибка данных" });
      }
      if (raffle.status !== "drawn" || !raffle.winners || !raffle.winners.length) {
        return res.status(400).json({ ok: false, error: "Розыгрыш не завершён или нет победителей" });
      }
      const winner = raffle.winners.find((w) => w.userId === winnerUserId);
      if (!winner) return res.status(404).json({ ok: false, error: "Победитель не найден" });
      winner.winnerStatus = validStatus;
      const setRes = await redisPipeline([["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]]);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "delete") {
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
      const raffleId = (body.raffleId || body.raffle_id || "").trim();
      if (!raffleId) return res.status(400).json({ ok: false, error: "Укажите raffleId" });

      const keys = [
        [ "LREM", RAFFLE_IDS_KEY, "0", raffleId ],
        [ "DEL", RAFFLE_PREFIX + raffleId ],
        [ "DEL", RAFFLE_IPS_PREFIX + raffleId ],
        [ "DEL", RAFFLE_DEVICES_PREFIX + raffleId ],
      ];
      const delRes = await redisPipeline(keys);
      if (!delRes) {
        return res.status(500).json({ ok: false, error: "Ошибка удаления" });
      }
      return res.status(200).json({ ok: true, deleted: true });
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

      const telegramUserId = user.id;
      const subscribed = await isChannelSubscriber(telegramUserId, BOT_TOKEN);
      if (!subscribed) {
        return res.status(400).json({
          ok: false,
          error: "Участвовать могут только подписчики канала Клуб Два Туза. Подпишитесь: t.me/dva_tuza_club",
          code: "CHANNEL_REQUIRED",
        });
      }

      const p21Res = await redisPipeline([["HGET", P21_IDS_KEY, myId]]);
      const p21Id = p21Res && p21Res[0] && p21Res[0].result ? String(p21Res[0].result).trim() : null;
      if (!p21Id || p21Id.length !== 6) {
        return res.status(400).json({
          ok: false,
          error: "Заполните свой ID в профиле. На него будет начисляться выигрыш!",
          code: "P21_REQUIRED",
        });
      }

      const clientIp = getClientIp(req);
      const deviceId = (body.deviceId || body.device_id || "").trim().slice(0, 128) || null;
      const ipsKey = RAFFLE_IPS_PREFIX + raffleId;
      const devicesKey = RAFFLE_DEVICES_PREFIX + raffleId;
      const checkCmds = [];
      if (clientIp) checkCmds.push(["SISMEMBER", ipsKey, clientIp]);
      if (deviceId) checkCmds.push(["SISMEMBER", devicesKey, deviceId]);
      if (checkCmds.length > 0) {
        const checkRes = await redisPipeline(checkCmds);
        if (checkRes) {
          let idx = 0;
          if (clientIp && checkRes[idx] && checkRes[idx].result === 1) {
            return res.status(400).json({
              ok: false,
              error: "С этого IP-адреса уже участвует другой аккаунт в данном розыгрыше.",
              code: "SAME_IP",
            });
          }
          idx += clientIp ? 1 : 0;
          if (deviceId && checkRes[idx] && checkRes[idx].result === 1) {
            return res.status(400).json({
              ok: false,
              error: "С этого устройства уже участвует другой аккаунт в данном розыгрыше.",
              code: "SAME_DEVICE",
            });
          }
        }
      }

      const name = user.firstName || (user.username ? "@" + user.username : "Участник");
      raffle.participants.push({
        userId: myId,
        name,
        p21Id,
        ip: clientIp || undefined,
        deviceId: deviceId || undefined,
      });
      const writeCmds = [["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]];
      if (clientIp) writeCmds.push(["SADD", ipsKey, clientIp]);
      if (deviceId) writeCmds.push(["SADD", devicesKey, deviceId]);
      const setRes = await redisPipeline(writeCmds);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    if (action === "leave") {
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
      const leaving = (raffle.participants || []).find((p) => p.userId === myId);
      const before = raffle.participants.length;
      raffle.participants = (raffle.participants || []).filter((p) => p.userId !== myId);
      if (raffle.participants.length === before) {
        return res.status(200).json({ ok: true, raffle, alreadyLeft: true });
      }
      const writeCmds = [["SET", RAFFLE_PREFIX + raffleId, JSON.stringify(raffle)]];
      const ipsKey = RAFFLE_IPS_PREFIX + raffleId;
      const devicesKey = RAFFLE_DEVICES_PREFIX + raffleId;
      if (leaving && leaving.ip) writeCmds.push(["SREM", ipsKey, leaving.ip]);
      if (leaving && leaving.deviceId) writeCmds.push(["SREM", devicesKey, leaving.deviceId]);
      const setRes = await redisPipeline(writeCmds);
      if (!setRes || setRes[0].error) {
        return res.status(500).json({ ok: false, error: "Ошибка записи" });
      }
      return res.status(200).json({ ok: true, raffle });
    }

    return res.status(400).json({ ok: false, error: "action: create, join или leave" });
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
  const idsRaw = (listRes && listRes[0] && listRes[0].result) || [];
  const ids = [...new Set(idsRaw)];
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
  let active = raffles.filter((r) => r.status === "active");

  // На localhost подставляем демо, если нет активных — чтобы всегда был виден пример
  const host = (req.headers.host || req.headers.origin || "").toString();
  const isLocalhost = /localhost|127\.0\.0\.1/i.test(host);
  if (isLocalhost && active.length === 0) {
    const demo = getDemoRaffle();
    raffles.unshift(demo);
    active = [demo];
  }

  return res.status(200).json({ ok: true, raffles, activeRaffle: active[0] || null, isAdmin: admin });
}

function getDemoRaffle() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() + 7);
  return {
    id: "raffle_demo_local",
    createdBy: 0,
    title: "Билеты на турнир дня",
    totalWinners: 3,
    groups: [
      { prize: "Билет на турнир дня 18:00 МСК (бай-ин 500 р)", count: 2 },
      { prize: "Билет на турнир дня 18:00 МСК (бай-ин 500 р) — 2-е место", count: 1 },
    ],
    endDate: endDate.toISOString(),
    participants: [
      { userId: "demo_1", name: "Иван", p21Id: "12345" },
      { userId: "demo_2", name: "Мария", p21Id: "67890" },
      { userId: "demo_3", name: "Алексей", p21Id: "11111" },
    ],
    winners: [],
    status: "active",
    createdAt: new Date().toISOString(),
  };
}
