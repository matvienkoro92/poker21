'use strict';
const crypto = require('node:crypto');
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({ok:false});
  const expected = process.env.CRON_SECRET || process.env.TELEGRAM_REPORT_WEBHOOK_SECRET || '';
  const supplied = String(req.headers?.['x-cron-secret'] || String(req.headers?.authorization || '').replace(/^Bearer\s+/i,''));
  if (!expected || Buffer.byteLength(expected)!==Buffer.byteLength(supplied) || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))) return res.status(403).json({ok:false});
  let body;
  try { body = typeof req.body === 'string' || Buffer.isBuffer(req.body) ? JSON.parse(String(req.body)) : req.body; }
  catch (_) { return res.status(400).json({ok:false}); }
  if (!Array.isArray(body?.tables) || body.tables.length > 2000 || body.tables.some(t=>!t || typeof t !== 'object' || t.deskId == null || !Number.isFinite(Number(t.playerCount)))) return res.status(400).json({ok:false});
  try { const result = await require('../report-table-subscriptions').poll(body.tables); return res.status(200).json({ok:true,...(result || {busy:true,complete:false})}); }
  catch(error) { console.error('table-subscriptions',error.message); return res.status(503).json({ok:false}); }
};
