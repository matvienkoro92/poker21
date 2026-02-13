/**
 * Счётчик визитов: уникальные и повторные.
 * Нужны переменные окружения Vercel:
 *   UPSTASH_REDIS_REST_URL, UPSTASH_REDIS_REST_TOKEN
 * (бесплатный Redis на https://upstash.com)
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) {
    return null;
  }
  const url = REDIS_URL.replace(/\/$/, '') + '/pipeline';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return res.json();
}

function countReturning(hgetallResult) {
  if (!hgetallResult) return 0;
  if (Array.isArray(hgetallResult)) {
    let n = 0;
    for (let i = 1; i < hgetallResult.length; i += 2) {
      if (parseInt(hgetallResult[i], 10) > 1) n++;
    }
    return n;
  }
  if (typeof hgetallResult === 'object') {
    return Object.values(hgetallResult).filter((v) => parseInt(v, 10) > 1).length;
  }
  return 0;
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

  const results = await redisPipeline(commands);

  if (!results || results.length !== 4) {
    return res.status(200).json({
      unique: 0,
      returning: 0,
      ok: false,
    });
  }

  const unique = parseInt(results[2].result, 10) || 0;
  const returning = countReturning(results[3].result);

  return res.status(200).json({
    unique,
    returning,
    ok: true,
  });
};
