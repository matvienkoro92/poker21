/**
 * Чат: общий для всех + личные сообщения.
 * Админ (TELEGRAM_ADMIN_ID): удаляет сообщения в общем чате, пишет в личку любому.
 * Redis: poker_app:chat_messages (общий), poker_app:chat:{id1}_{id2} (личные).
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,5053253480,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const GENERAL_KEY = "poker_app:chat_messages";
const BLOCKED_KEY = "poker_app:chat_blocked";
const CHAT_ONLINE_KEY = "poker_app:chat_online";
const ONLINE_TTL_MS = 5 * 60 * 1000; // 5 минут
const DT_IDS_KEY = "poker_app:visitor_dt_ids";
const P21_IDS_KEY = "poker_app:visitor_p21_ids";
const AVATAR_PREFIX = "poker_app:avatar:";
const MAX_MESSAGES = 100;

function convKey(id1, id2) {
  const a = String(id1).replace(/^tg_/, "");
  const b = String(id2).replace(/^tg_/, "");
  return "poker_app:chat:" + (a < b ? a + "_" + b : b + "_" + a);
}

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
    return user.id ? { id: user.id, firstName: user.first_name || "", username: user.username || "" } : null;
  } catch (e) {
    return null;
  }
}

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = String(REDIS_URL).replace(/\/$/, "");
  try {
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
  } catch (e) {
    return null;
  }
}

async function getDtIds(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const cmds = userIds.map((id) => ["HGET", DT_IDS_KEY, id]);
  const res = await redisPipeline(cmds);
  const out = {};
  if (res && Array.isArray(res)) {
    userIds.forEach((id, i) => {
      const v = res[i] && res[i].result ? String(res[i].result).trim() : null;
      if (v) out[id] = v;
    });
  }
  return out;
}

async function getAvatars(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const cmds = userIds.map((id) => ["GET", AVATAR_PREFIX + id.replace(/[^a-zA-Z0-9_-]/g, "_")]);
  const res = await redisPipeline(cmds);
  const out = {};
  if (res && Array.isArray(res)) {
    userIds.forEach((id, i) => {
      const v = res[i] && res[i].result;
      if (v && typeof v === "string" && v.startsWith("data:")) out[id] = v;
    });
  }
  return out;
}

async function getP21Ids(userIds) {
  if (!userIds || userIds.length === 0) return {};
  const cmds = userIds.map((id) => ["HGET", P21_IDS_KEY, id]);
  const res = await redisPipeline(cmds);
  const out = {};
  if (res && Array.isArray(res)) {
    userIds.forEach((id, i) => {
      const v = res[i] && res[i].result ? String(res[i].result).trim() : null;
      if (v) out[id] = v;
    });
  }
  return out;
}

async function sendTelegram(toChatId, text) {
  if (!BOT_TOKEN || !toChatId) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: String(toChatId), text, disable_web_page_preview: true }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, PATCH, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET" && req.method !== "POST" && req.method !== "DELETE" && req.method !== "PATCH") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Redis not configured" });
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    body = {};
  }

  const initData = req.query.initData || body.initData || body.init_data;
  const user = validateUser(initData);
  if (!user) return res.status(401).json({ ok: false, error: "Откройте приложение в Telegram" });

  const myId = "tg_" + user.id;
  const admin = isAdmin(myId);

  // DELETE: админ удаляет сообщение из общего чата или из личного
  if (req.method === "DELETE") {
    const messageId = body.messageId || body.message_id || req.query.messageId;
    const withId = body.with || body.conversationWith || req.query.with;
    if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
    if (!messageId) return res.status(400).json({ ok: false, error: "messageId обязателен" });

    const redisKey = withId ? convKey(myId, withId.startsWith("tg_") ? withId : "tg_" + withId) : GENERAL_KEY;
    const results = await redisPipeline([["LRANGE", redisKey, "0", "-1"]]);
    const raw = results && results[0] && results[0].result !== undefined ? results[0].result : [];
    const list = Array.isArray(raw) ? raw : [];
    const toRemove = list.find((s) => {
      try {
        const m = JSON.parse(s);
        return m.id === messageId;
      } catch (e) {
        return false;
      }
    });
    if (!toRemove) return res.status(404).json({ ok: false, error: "Сообщение не найдено" });

    const results2 = await redisPipeline([["LREM", redisKey, "0", toRemove]]);
    if (!results2 || results2[0]?.error) return res.status(500).json({ ok: false, error: "Ошибка удаления" });
    return res.status(200).json({ ok: true, deleted: true });
  }

  // PATCH: блокировка админом или редактирование своего сообщения
  if (req.method === "PATCH") {
    const action = body.action || req.query.action;

    if (action === "edit") {
      const messageId = body.messageId || body.message_id || req.query.messageId;
      const newText = (body.text || body.message || "").trim();
      const withId = body.with || body.conversationWith || req.query.with;
      if (!messageId) return res.status(400).json({ ok: false, error: "messageId обязателен" });
      if (!newText || newText.length > 500) return res.status(400).json({ ok: false, error: "Текст от 1 до 500 символов" });
      const redisKey = withId ? convKey(myId, withId.startsWith("tg_") ? withId : "tg_" + withId) : GENERAL_KEY;
      const results = await redisPipeline([["LRANGE", redisKey, "0", "-1"]]);
      const raw = results && results[0] && results[0].result !== undefined ? results[0].result : [];
      const list = Array.isArray(raw) ? raw : [];
      let idx = -1;
      let msgObj = null;
      for (let i = 0; i < list.length; i++) {
        try {
          const m = JSON.parse(list[i]);
          if (m.id === messageId) {
            if (m.from !== myId) return res.status(403).json({ ok: false, error: "Можно редактировать только свои сообщения" });
            idx = i;
            msgObj = m;
            break;
          }
        } catch (e) {}
      }
      if (idx < 0 || !msgObj) return res.status(404).json({ ok: false, error: "Сообщение не найдено" });
      msgObj.text = newText;
      msgObj.edited = true;
      msgObj.editedAt = new Date().toISOString();
      const newStr = JSON.stringify(msgObj);
      const resSet = await redisPipeline([["LSET", redisKey, String(idx), newStr]]);
      if (!resSet || resSet[0]?.error) return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
      return res.status(200).json({ ok: true, message: msgObj });
    }

    if (action === "block" || action === "unblock") {
      const targetId = (body.userId || body.targetId || req.query.userId || "").toString().trim();
      if (!admin) return res.status(403).json({ ok: false, error: "Только для админа" });
      if (!targetId || !targetId.startsWith("tg_")) return res.status(400).json({ ok: false, error: "userId обязателен (tg_xxx)" });
      const cmd = action === "block" ? ["SADD", BLOCKED_KEY, targetId] : ["SREM", BLOCKED_KEY, targetId];
      const resBlock = await redisPipeline([cmd]);
      if (!resBlock || resBlock[0]?.error) return res.status(500).json({ ok: false, error: "Ошибка операции" });
      return res.status(200).json({ ok: true, blocked: action === "block" });
    }

    if (action === "reaction") {
      const messageId = body.messageId || body.message_id || req.query.messageId;
      const emoji = (body.emoji || req.query.emoji || "").toString().trim();
      const withId = body.with || body.conversationWith || req.query.with;
      const allowedEmojis = ["👍", "❤️", "😂", "😮", "😢", "🙏"];
      if (!messageId) return res.status(400).json({ ok: false, error: "messageId обязателен" });
      if (!allowedEmojis.includes(emoji)) return res.status(400).json({ ok: false, error: "Недопустимая реакция" });
      const redisKey = withId ? convKey(myId, withId.startsWith("tg_") ? withId : "tg_" + withId) : GENERAL_KEY;
      const results = await redisPipeline([["LRANGE", redisKey, "0", "-1"]]);
      const raw = results && results[0] && results[0].result !== undefined ? results[0].result : [];
      const list = Array.isArray(raw) ? raw : [];
      let idx = -1;
      let msgObj = null;
      for (let i = 0; i < list.length; i++) {
        try {
          const m = JSON.parse(list[i]);
          if (m.id === messageId) {
            idx = i;
            msgObj = m;
            break;
          }
        } catch (e) {}
      }
      if (idx < 0 || !msgObj) return res.status(404).json({ ok: false, error: "Сообщение не найдено" });
      if (!msgObj.reactions || typeof msgObj.reactions !== "object") msgObj.reactions = {};
      if (!Array.isArray(msgObj.reactions[emoji])) msgObj.reactions[emoji] = [];
      const arr = msgObj.reactions[emoji];
      const myIdx = arr.indexOf(myId);
      if (myIdx >= 0) {
        arr.splice(myIdx, 1);
        if (arr.length === 0) delete msgObj.reactions[emoji];
      } else {
        arr.push(myId);
      }
      const newStr = JSON.stringify(msgObj);
      const resSet = await redisPipeline([["LSET", redisKey, String(idx), newStr]]);
      if (!resSet || resSet[0]?.error) return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
      return res.status(200).json({ ok: true, message: msgObj });
    }

    return res.status(400).json({ ok: false, error: "action: edit, block, unblock или reaction" });
  }

  // GET
  if (req.method === "GET") {
    const withId = req.query.with || req.query.other;
    const mode = req.query.mode || body.mode;

    if (withId) {
      const otherId = withId.startsWith("tg_") ? withId : "tg_" + withId;
      const key = convKey(myId, otherId);
      const now = Date.now();
      const minScore = now - ONLINE_TTL_MS;
      const pipeline = [
        ["LRANGE", key, "0", String(MAX_MESSAGES - 1)],
        ["ZADD", CHAT_ONLINE_KEY, String(now), myId],
        ["ZREMRANGEBYSCORE", CHAT_ONLINE_KEY, "-inf", String(minScore)],
        ["ZSCORE", CHAT_ONLINE_KEY, myId],
        ["ZSCORE", CHAT_ONLINE_KEY, otherId],
      ];
      const results = await redisPipeline(pipeline);
      const raw = results && results[0] && results[0].result !== undefined ? results[0].result : [];
      const messages = (Array.isArray(raw) ? raw : [])
        .map((s) => {
          try {
            return typeof s === "string" ? JSON.parse(s) : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
        .reverse();
      const seen = new Set();
      const deduped = messages.filter((m) => {
        const k = m.id || (m.from + "|" + (m.time || "") + "|" + (m.text || ""));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const fromIds = [...new Set(deduped.map((m) => m.from).filter(Boolean))];
      const participantsCount = fromIds.length;
      const myScore = results && results[3] && results[3].result != null ? parseFloat(results[3].result) : 0;
      const otherScore = results && results[4] && results[4].result != null ? parseFloat(results[4].result) : 0;
      let onlineCount = 0;
      if (fromIds.includes(myId) && myScore >= minScore) onlineCount++;
      if (fromIds.includes(otherId) && otherScore >= minScore) onlineCount++;
      const [dtIdsMap, avatarsMap, p21IdsMap] = await Promise.all([getDtIds(fromIds), getAvatars(fromIds), getP21Ids(fromIds)]);
      deduped.forEach((m) => {
        if (m.from) {
          if (dtIdsMap[m.from]) m.fromDtId = dtIdsMap[m.from];
          if (avatarsMap[m.from]) m.fromAvatar = avatarsMap[m.from];
          if (p21IdsMap[m.from]) m.fromP21Id = p21IdsMap[m.from];
          m.fromAdmin = isAdmin(m.from);
        }
      });
      return res.status(200).json({ ok: true, messages: deduped, isAdmin: admin, participantsCount, onlineCount });
    }

    if (mode === "general") {
      const now = Date.now();
      const minScore = now - ONLINE_TTL_MS;
      const [msgResults, blockedResults, onlineResults] = await Promise.all([
        redisPipeline([["LRANGE", GENERAL_KEY, "0", String(MAX_MESSAGES - 1)]]),
        redisPipeline([["SMEMBERS", BLOCKED_KEY]]),
        redisPipeline([
          ["ZADD", CHAT_ONLINE_KEY, String(now), myId],
          ["ZREMRANGEBYSCORE", CHAT_ONLINE_KEY, "-inf", String(minScore)],
          ["ZCOUNT", CHAT_ONLINE_KEY, String(minScore), "+inf"],
        ]),
      ]);
      let listResp = msgResults;
      if (msgResults && typeof msgResults === "object" && !Array.isArray(msgResults) && Array.isArray(msgResults.result)) {
        listResp = msgResults.result;
      }
      let raw = [];
      if (listResp && Array.isArray(listResp)) {
        const first = listResp[0];
        if (first && first.error) {
          return res.status(500).json({ ok: false, error: "Ошибка загрузки сообщений" });
        }
        raw = Array.isArray(first?.result) ? first.result : (typeof first?.result === "string" ? [first.result] : []);
      }
      const blockedSet = new Set(Array.isArray(blockedResults?.[0]?.result) ? blockedResults[0].result : []);
      const onlineCount = (onlineResults && onlineResults[2] && typeof onlineResults[2].result === "number") ? onlineResults[2].result : 0;
      const messages = (Array.isArray(raw) ? raw : [])
        .map((s) => {
          try {
            return typeof s === "string" ? JSON.parse(s) : null;
          } catch (e) {
            return null;
          }
        })
        .filter(Boolean)
        .filter((m) => !m.from || !blockedSet.has(m.from))
        .reverse();
      const seen = new Set();
      const deduped = messages.filter((m) => {
        const key = m.id || (m.from + "|" + (m.time || "") + "|" + (m.text || ""));
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const participantsSet = new Set(deduped.map((m) => m.from).filter(Boolean));
      const participantsCount = participantsSet.size;
      const fromIds = [...participantsSet];
      const [dtIds, avatars, p21Ids] = await Promise.all([getDtIds(fromIds), getAvatars(fromIds), getP21Ids(fromIds)]);
      deduped.forEach((m) => {
        if (m.from) {
          if (dtIds[m.from]) m.fromDtId = dtIds[m.from];
          if (avatars[m.from]) m.fromAvatar = avatars[m.from];
          if (p21Ids[m.from]) m.fromP21Id = p21Ids[m.from];
          m.fromAdmin = isAdmin(m.from);
        }
      });
      return res.status(200).json({ ok: true, messages: deduped, isAdmin: admin, participantsCount, onlineCount });
    }

    const now = Date.now();
    const minScore = now - ONLINE_TTL_MS;
    const results = await redisPipeline([
      ["SMEMBERS", "poker_app:visitors"],
      ["HGETALL", "poker_app:visitor_usernames"],
      ["SMEMBERS", "poker_app:chat_partners:" + myId],
      ["ZADD", CHAT_ONLINE_KEY, String(now), myId],
      ["ZREMRANGEBYSCORE", CHAT_ONLINE_KEY, "-inf", String(minScore)],
    ]);
    if (!results || !Array.isArray(results) || results.length < 1) {
      return res.status(200).json({ ok: true, contacts: [], isAdmin: admin, participantsCount: 0, onlineCount: 0 });
    }
    const visitors = Array.isArray(results[0]?.result) ? results[0].result : [];
    const usernamesRaw = results[1]?.result;
    const partners = Array.isArray(results[2]?.result) ? results[2].result : [];

    const partnerIds = partners.filter((id) => id.startsWith("tg_") && id !== myId);
    let onlineCount = 0;
    if (partnerIds.length > 0) {
      const scoreCmds = partnerIds.flatMap((id) => [["ZSCORE", CHAT_ONLINE_KEY, id]]);
      const scoreResults = await redisPipeline(scoreCmds);
      if (scoreResults && Array.isArray(scoreResults)) {
        partnerIds.forEach((_, i) => {
          const s = scoreResults[i]?.result;
          if (s != null && parseFloat(s) >= minScore) onlineCount++;
        });
      }
    }
    const participantsCount = partnerIds.length;

    let usernames = {};
    if (Array.isArray(usernamesRaw)) {
      for (let i = 0; i < usernamesRaw.length; i += 2) {
        if (usernamesRaw[i] && usernamesRaw[i + 1]) usernames[usernamesRaw[i]] = String(usernamesRaw[i + 1]).trim();
      }
    } else if (usernamesRaw && typeof usernamesRaw === "object") {
      usernames = usernamesRaw;
    }

    const [dtIds, avatars] = await Promise.all([getDtIds(partnerIds), getAvatars(partnerIds)]);
    const contacts = partnerIds.map((id) => ({
      id,
      name: usernames[id] ? "@" + usernames[id] : id,
      dtId: dtIds[id] || null,
      avatar: avatars[id] || null,
    }));
    return res.status(200).json({ ok: true, contacts, isAdmin: admin, participantsCount, onlineCount });
  }

  // POST
  const withId = body.with || body.to || body.userId;
  const text = (body.text || body.message || "").trim();
  let image = body.image;
  if (image && typeof image === "string") {
    const m = image.match(/^data:image\/(jpeg|jpg|png|gif|webp);base64,(.+)$/);
    image = m && m[2] && m[2].length < 250000 ? image : null;
  }
  let voice = body.voice;
  if (voice && typeof voice === "string") {
    const v = voice.match(/^data:audio\/(ogg|webm|mpeg);base64,(.+)$/);
    voice = v && v[2] && v[2].length < 800000 ? voice : null; // ~600KB base64 ≈ 1 мин
  }
  const replyTo = body.replyTo && typeof body.replyTo === "object" ? {
    id: body.replyTo.id || null,
    text: String(body.replyTo.text || "").slice(0, 500),
    from: body.replyTo.from || null,
    fromName: String(body.replyTo.fromName || "Игрок").slice(0, 100),
  } : null;

  if ((!text || text.length > 500) && !image && !voice) {
    return res.status(400).json({ ok: false, error: "Текст от 1 до 500 символов, картинка или голосовое" });
  }
  if (text && text.length > 500) {
    return res.status(400).json({ ok: false, error: "Текст до 500 символов" });
  }

  if (withId) {
    const otherId = withId.startsWith("tg_") ? withId : "tg_" + withId;
    if (otherId === myId) return res.status(400).json({ ok: false, error: "Нельзя отправить себе" });

    const key = convKey(myId, otherId);
    const dtIdsForMsg = await getDtIds([myId]);
    const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
    const msg = {
      id: msgId,
      from: myId,
      fromName: user.firstName || (user.username ? "@" + user.username : "Игрок"),
      fromDtId: dtIdsForMsg[myId] || null,
      text: text || "",
      time: new Date().toISOString(),
      ...(image ? { image } : {}),
      ...(voice ? { voice } : {}),
      ...(replyTo && replyTo.text ? { replyTo } : {}),
    };

    const now = Date.now();
    const results = await redisPipeline([
      ["LPUSH", key, JSON.stringify(msg)],
      ["LTRIM", key, "0", String(MAX_MESSAGES - 1)],
      ["SADD", "poker_app:chat_partners:" + myId, otherId],
      ["SADD", "poker_app:chat_partners:" + otherId, myId],
      ["ZADD", CHAT_ONLINE_KEY, String(now), myId],
    ]);

    if (!results || !Array.isArray(results) || results.some((r) => r && r.error)) {
      return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
    }

    const otherTgId = otherId.replace(/^tg_/, "");
    if (otherTgId.match(/^\d+$/) && BOT_TOKEN) {
      await sendTelegram(otherTgId, "💬 " + msg.fromName + ": " + text);
    }

    return res.status(200).json({ ok: true, message: msg });
  }

  const blockedCheck = await redisPipeline([["SISMEMBER", BLOCKED_KEY, myId]]);
  const amBlocked = blockedCheck && blockedCheck[0] && blockedCheck[0].result === 1;
  if (amBlocked) return res.status(403).json({ ok: false, error: "Вы заблокированы в чате" });

  const dtIds = await getDtIds([myId]);
  const msgId = "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2, 9);
  const msg = {
    id: msgId,
    from: myId,
    fromName: user.firstName || (user.username ? "@" + user.username : "Игрок"),
    fromDtId: dtIds[myId] || null,
    text: text || "",
    time: new Date().toISOString(),
    ...(image ? { image } : {}),
    ...(voice ? { voice } : {}),
    ...(replyTo && replyTo.text ? { replyTo } : {}),
  };

  const now = Date.now();
  const results = await redisPipeline([
    ["LPUSH", GENERAL_KEY, JSON.stringify(msg)],
    ["LTRIM", GENERAL_KEY, "0", String(MAX_MESSAGES - 1)],
    ["ZADD", CHAT_ONLINE_KEY, String(now), myId],
  ]);

  if (!results || !Array.isArray(results) || results.some((r) => r && r.error)) {
    return res.status(500).json({ ok: false, error: "Ошибка сохранения" });
  }
  return res.status(200).json({ ok: true, message: msg });
};
