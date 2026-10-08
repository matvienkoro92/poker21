'use strict';
const crypto = require('node:crypto');
module.exports = async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ok:false});
  const expected = process.env.CRON_SECRET || process.env.TELEGRAM_REPORT_WEBHOOK_SECRET || '';
  const supplied = String(req.headers?.['x-cron-secret'] || String(req.headers?.authorization || '').replace(/^Bearer\s+/i,''));
  if (!expected || Buffer.byteLength(expected)!==Buffer.byteLength(supplied) || !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(supplied))) return res.status(403).json({ok:false});
  try { const result = await require('../report-table-subscriptions').poll(); return res.status(200).json({ok:true,...(result || {busy:true})}); }
  catch(error) { console.error('table-subscriptions',error.message); return res.status(503).json({ok:false}); }
};
