const {createHash}=require('crypto');
const {pipeline}=require('../redis');
const targets=[{"key":"poker21:financial-outbox:weekly:-1003961882479:2026-08-24","chat":"-1003961882479","message":"52"},{"key":"poker21:financial-outbox:weekly:-4271456764:2026-08-24","chat":"-4271456764","message":"1963"},{"key":"poker21:financial-outbox:weekly:-5151188717:2026-08-24","chat":"-5151188717","message":"1964"},{"key":"poker21:financial-outbox:weekly:-5165935205:2026-08-24","chat":"-5165935205","message":"1965"},{"key":"poker21:financial-outbox:weekly:-5358380766:2026-08-24","chat":"-5358380766","message":"1966"},{"key":"poker21:financial-outbox:weekly:-5377965622:2026-08-24","chat":"-5377965622","message":"1967"},{"key":"poker21:financial-outbox:weekly:-5396461447:2026-08-24","chat":"-5396461447","message":"1968"},{"key":"poker21:financial-outbox:weekly:-5514886071:2026-08-24","chat":"-5514886071","message":"1969"},{"key":"poker21:financial-outbox:weekly:-5544949322:2026-08-24","chat":"-5544949322","message":"1970"},{"key":"poker21:financial-outbox:weekly:-5581469040:2026-08-24","chat":"-5581469040","message":"1971"},{"key":"poker21:financial-outbox:weekly:-5583178793:2026-08-24","chat":"-5583178793","message":"1972"},{"key":"poker21:financial-outbox:weekly:-5592095586:2026-08-24","chat":"-5592095586","message":"1973"}];
module.exports=async(req,res)=>{
 if(req.method!=='POST'||Date.now()>1788658266281||createHash('sha256').update(String(req.headers.authorization||'')).digest('hex')!=='d214ffb57b601e899d3f5262fbf8ddf1cd0b3b0dcaad3b414766a1ab8f4ac8dc')return res.status(403).json({ok:false});
 const token=process.env.TELEGRAM_BOT_TOKEN||process.env.telegram_bot_token||process.env.TELEGRAM_TOKEN||process.env.BOT_TOKEN;
 const results=[];
 for(const t of targets){
  const rows=await pipeline([['GET',t.key],['GET',t.key+':sent:0']],{context:'activity-cleanup'});
  const event=JSON.parse(rows?.[0]?.result||'null');
  if(event?.kind!=='summary'||String(event.payload.chat_id)!==t.chat||String(rows?.[1]?.result)!==t.message){results.push({chat:t.chat,ok:false,error:'identity mismatch'});continue;}
  await pipeline([['ZREM','poker21:financial-outbox:due',t.key.replace('poker21:financial-outbox:','')],['SET',t.key+':cancelled',String(Date.now())]],{context:'activity-cleanup'});
  const r=await fetch('https://api.telegram.org/bot'+token+'/deleteMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:t.chat,message_id:Number(t.message)}),signal:AbortSignal.timeout(5000)});
  const j=await r.json();
  if(j.ok)await pipeline([['SET',t.key+':deleted',String(Date.now())]],{context:'activity-cleanup'});
  results.push({chat:t.chat,message:t.message,ok:j.ok,error:j.description});
 }
 return res.json({results});
};
