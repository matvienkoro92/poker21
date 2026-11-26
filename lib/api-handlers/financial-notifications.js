const { drain } = require('../financial-outbox');
module.exports = async (req, res) => {
  if(req.method==='POST' && ['withdrawal-credit','published-offer'].includes(req.query?.action)){
    const syncKey=process.env.POKER21_WITHDRAWALS_SYNC_KEY;
    if(!syncKey||req.headers.authorization!=='Bearer '+syncKey)return res.status(403).end();
    try{
      if(req.query.action==='published-offer')await require('../published-offer').receiveWithdrawal(require('../api-auth').parseBody(req));
      else await require('../club-team').settleWithdrawalCredits();
      return res.status(200).json({ok:true});
    }catch(error){return res.status(error.status||503).end();}
  }
  const secret = process.env.CRON_SECRET || process.env.TELEGRAM_REPORT_WEBHOOK_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(403).json({ ok: false });
  try {
    await require('../published-offer-status').recoverRequestedEdits();
    await require('../club-team').recoverClaimNotices().catch(error=>console.error('withdrawal-claim-recovery',error.message));
    return res.status(200).json({ ok: true, ...await drain() });
  }
  catch (error) { console.error('financial-outbox', error.message); return res.status(503).json({ ok: false }); }
};
