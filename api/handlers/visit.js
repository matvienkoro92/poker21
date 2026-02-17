/**
 * Счётчик визитов: уникальные и повторные.
 * При POST с initData сохраняет username для tg_ посетителей.
 * Нужны: UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN, TELEGRAM_BOT_TOKEN.
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";

function getUsernameFromInitData(initData) {
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
    return (user.username || "").trim() || null;
  } catch (e) {
    return null;
  }
}

async function redisPipeline(commands, baseUrl, baseToken) {
  const u = baseUrl || REDIS_URL;
  const t = baseToken || REDIS_TOKEN;
  if (!u || !t) return null;
  const base = String(u).replace(/\/$/, '');
  const pipelineUrl = base.indexOf('/pipeline') !== -1 ? base : base + '/pipeline';
  const res = await fetch(pipelineUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return res.json();
}

function getVisitValues(hgetallResult) {
  if (!hgetallResult) return [];
  if (Array.isArray(hgetallResult)) {
    const vals = [];
    for (let i = 1; i < hgetallResult.length; i += 2) {
      vals.push(parseInt(hgetallResult[i], 10) || 0);
    }
    return vals;
  }
  if (typeof hgetallResult === 'object') {
    return Object.values(hgetallResult).map((v) => parseInt(v, 10) || 0);
  }
  return [];
}

function countReturning(hgetallResult) {
  const vals = getVisitValues(hgetallResult);
  return vals.filter((v) => v > 1).length;
}

function totalVisits(hgetallResult) {
  return getVisitValues(hgetallResult).reduce((sum, v) => sum + v, 0);
}

const DT_IDS_KEY = 'poker_app:visitor_dt_ids';
const ID_TO_USER_KEY = 'poker_app:id_to_user';

function generateUserId() {
  return 'ID' + String(Math.floor(100000 + Math.random() * 900000));
}

function jsonVisits(res, unique, returning, total, ok, dtId) {
  res.setHeader('Content-Type', 'application/json');
  const body = { unique: unique || 0, returning: returning || 0, total: total || 0, ok: !!ok };
  if (dtId) body.dtId = dtId;
  return res.status(200).json(body);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    return res.status(200).json({
      unique: 0, returning: 0, total: 0, ok: false, error: 'redis_not_configured',
      debug: { hasUrl: !!url, hasToken: !!token },
    });
  }

  // Только статистика (без регистрации визита)
  if (req.method === 'GET' && req.query.stats === '1') {
    const results = await redisPipeline([
      ['SCARD', 'poker_app:visitors'],
      ['HGETALL', 'poker_app:visits'],
    ], url, token);
    if (!results || !Array.isArray(results) || results.length !== 2) {
      return res.status(200).json({ unique: 0, returning: 0, total: 0, ok: false });
    }
    if (results.some(function (r) { return r && r.error; })) {
      return res.status(200).json({ unique: 0, returning: 0, total: 0, ok: false });
    }
    const unique = parseInt(results[0]?.result, 10) || 0;
    const r1 = results[1]?.result || [];
    const returning = countReturning(r1);
    const total = totalVisits(r1);
    return res.status(200).json({ unique, returning, total, ok: true });
  }

  let visitorId = req.query.visitor_id || req.query.visitorId;
  let initData = null;
  if (req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
      visitorId = visitorId || body.visitor_id || body.visitorId;
      initData = body.initData || body.init_data;
    } catch (e) {}
  }

  if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 128) {
    return res.status(400).json({ error: 'visitor_id required' });
  }

  const safeId = visitorId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);

  const commands = [
    ['SADD', 'poker_app:visitors', safeId],
    ['HINCRBY', 'poker_app:visits', safeId, '1'],
    ['SCARD', 'poker_app:visitors'],
    ['HGETALL', 'poker_app:visits'],
    ['HGET', DT_IDS_KEY, safeId],
  ];
  const username = initData && safeId.startsWith('tg_') ? getUsernameFromInitData(initData) : null;
  if (username) commands.push(['HSET', 'poker_app:visitor_usernames', safeId, username]);

  let results;
  try {
    results = await redisPipeline(commands, url, token);
  } catch (e) {
    return jsonVisits(res, 0, 0, 0, false);
  }

  if (!results || !Array.isArray(results) || results.length < 5) {
    return jsonVisits(res, 0, 0, 0, false);
  }

  if (results.some(function (r) { return r && r.error; })) {
    return jsonVisits(res, 0, 0, 0, false);
  }

  const r2 = results[2] && results[2].result !== undefined ? results[2].result : 0;
  const r3 = results[3] && results[3].result !== undefined ? results[3].result : [];
  const unique = parseInt(r2, 10) || 0;
  const returning = countReturning(r3);
  const total = totalVisits(r3);

  let dtId = results[4] && results[4].result ? String(results[4].result).trim() : null;
  const needsNewId = !dtId || /^DT#\d+$/.test(dtId);
  if (needsNewId && safeId.startsWith('tg_')) {
    for (let i = 0; i < 10; i++) {
      dtId = generateUserId();
      const exists = await redisPipeline([['HGET', ID_TO_USER_KEY, dtId]], url, token);
      const taken = exists && exists[0] && exists[0].result;
      if (!taken) {
        await redisPipeline([
          ['HSET', DT_IDS_KEY, safeId, dtId],
          ['HSET', ID_TO_USER_KEY, dtId, safeId],
        ], url, token);
        break;
      }
    }
  }

  return jsonVisits(res, unique, returning, total, true, dtId);
};
