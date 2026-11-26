'use strict';
const {PREFIX,DUE,drain}=require('./financial-outbox');
const {pipeline}=require('./redis');

function notice(id, amountCents, bank, currency, publisher) {
  return {id:'published-offer:'+id, kind:'published-offer', text:[
    'Новая заявка · '+publisher,
    (amountCents/100).toLocaleString('ru-RU')+' '+(currency==='usd'?'$':'₽'),
    bank, 'Посмотреть реквизиты: /реквизиты'
  ].filter(Boolean).join('\n')};
}
// Shared by the atomic cabinet publication and the authenticated withdrawal event.
const enqueueLua = `
  if redis.call('SET',KEYS[5],ARGV[9],'NX') then
    redis.call('ZADD',KEYS[6],0,ARGV[10])
  end
`;
async function receiveWithdrawal(body) {
  const {id,amountCents,bank}=body;
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id||'') || !Number.isSafeInteger(amountCents) || amountCents<=0 || typeof bank!=='string' || bank.length>300)
    throw Object.assign(Error('Invalid offer'),{status:400});
  const event=notice('withdrawal:'+id,amountCents,bank,'rub','Два Туза');
  const result=await pipeline([['EVAL', "if redis.call('SET',KEYS[1],ARGV[1],'NX') then redis.call('ZADD',KEYS[2],0,ARGV[2]) end return 1",2,PREFIX+event.id,DUE,JSON.stringify(event),event.id]],{throwOnError:true});
  if(Number(result?.[0]?.result)!==1)throw Error('Offer queue unavailable');
  await dispatch(event.id);
}
async function dispatch(id) {
  try { await drain({eventId:id}); }
  catch(error){console.error('Published offer queued',id,error.message);}
}
module.exports={notice,enqueueLua,receiveWithdrawal,dispatch};
