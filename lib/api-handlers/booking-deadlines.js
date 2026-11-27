'use strict';
module.exports=async function(req,res){
  if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).end();
  await Promise.all([require('./telegram-report-webhook').refreshDueBookings(),require('../club-team').recoverBookingNotices()]);
  return res.json({ok:true});
};
