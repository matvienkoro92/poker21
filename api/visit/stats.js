/**
 * Только чтение счётчиков (без регистрации визита).
 * Используется при переходе на главную, чтобы не дублировать визиты.
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = REDIS_URL.replace(/\/$/, '');
  const url = base.indexOf('/pipeline') !== -1 ? base : base + '/pipeline';
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
  return getVisitValues(hgetallResult).filter((v) => v > 1).length;
}

function totalVisits(hgetallResult) {
  return getVisitValues(hgetallResult).reduce((sum, v) => sum + v, 0);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const commands = [
    ['SCARD', 'poker_app:visitors'],
    ['HGETALL', 'poker_app:visits'],
  ];

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(200).json({ unique: 0, returning: 0, total: 0, ok: false, error: 'redis_not_configured' });
  }

  const results = await redisPipeline(commands);
  if (!results || !Array.isArray(results) || results.length !== 2) {
    return res.status(200).json({ unique: 0, returning: 0, total: 0, ok: false });
  }

  const hasError = results.some(function (r) { return r && r.error; });
  if (hasError) {
    return res.status(200).json({ unique: 0, returning: 0, total: 0, ok: false });
  }

  const r0 = results[0] && results[0].result !== undefined ? results[0].result : 0;
  const r1 = results[1] && results[1].result !== undefined ? results[1].result : [];
  const unique = parseInt(r0, 10) || 0;
  const returning = countReturning(r1);
  const total = totalVisits(r1);

  return res.status(200).json({ unique, returning, total, ok: true });
};
