const { drain } = require('../financial-outbox');
module.exports = async (req, res) => {
  const secret = process.env.CRON_SECRET || process.env.TELEGRAM_REPORT_WEBHOOK_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(403).json({ ok: false });
  try {
    return res.status(200).json({ ok: true, ...await drain() });
  }
  catch (error) { console.error('financial-outbox', error.message); return res.status(503).json({ ok: false }); }
};
