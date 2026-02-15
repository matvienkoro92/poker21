/**
 * Счётчик визитов: уникальные и повторные.
 * Нужны переменные окружения Vercel:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * (бесплатный Redis на https://upstash.com)
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

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

function jsonVisits(res, unique, returning, total, ok) {
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({ unique: unique || 0, returning: returning || 0, total: total || 0, ok: !!ok });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
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

  const visitorId = req.query.visitor_id || req.query.visitorId;
  if (!visitorId || typeof visitorId !== 'string' || visitorId.length > 128) {
    return res.status(400).json({ error: 'visitor_id required' });
  }

  const safeId = visitorId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);

  const commands = [
    ['SADD', 'poker_app:visitors', safeId],
    ['HINCRBY', 'poker_app:visits', safeId, '1'],
    ['SCARD', 'poker_app:visitors'],
    ['HGETALL', 'poker_app:visits'],
  ];

  let results;
  try {
    results = await redisPipeline(commands, url, token);
  } catch (e) {
    return jsonVisits(res, 0, 0, 0, false);
  }

  if (!results || !Array.isArray(results) || results.length !== 4) {
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

  return jsonVisits(res, unique, returning, total, true);
};
