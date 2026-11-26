'use strict';
const prefix='poker21:financial-outbox:';
const paymentPrefix='poker21:telegram-report:payment-details:';

// Run inside the same Redis transaction as the payment state change.
function enqueueLua(itemExpression){
  return `
    local changed=${itemExpression}
    local root=changed.publicationId or changed.id
    if redis.call('EXISTS','${prefix}published-offer:'..root)==1 then
      local job='offer-status:'..root
      redis.call('INCR','${prefix}'..job)
      redis.call('SADD','${prefix}'..job..':parts',changed.id)
      redis.call('ZADD','${prefix}due',0,job)
    end`;
}

function statusText(event,parts){
  const amounts=new Map();
  for(const p of parts){
    const payer=p.payer?.name||'клуб';
    const label=({open:'Свободна',claimed:'Взял клуб «'+payer+'»',awaiting_receipt:'Взял клуб «'+payer+'» · ожидается чек',paid:'Клуб «'+payer+'» отметил оплату',confirmed:'Завершена',cancelled:p.removedByAdmin?'Снята администратором':'Снята клубом'})[p.status];
    if(label)amounts.set(label,(amounts.get(label)||0)+p.amountCents);
  }
  const lines=[...amounts].map(([label,amount])=>label+(parts.length>1?' · '+(amount/100).toLocaleString('ru-RU')+(event.currency==='usd'?' $':' ₽'):''));
  const base=event.text.replace(/\nПосмотреть реквизиты: \/реквизиты$/,'');
  return [base,...lines,...(amounts.has('Свободна')?['Посмотреть реквизиты: /реквизиты']:[])].join('\n');
}

async function deliver(id,version,call,send,keyHolders){
  const root=id.slice('offer-status:'.length),job=prefix+id,original=prefix+'published-offer:'+root;
  const [raw,parts,access,known]=await call([['GET',original],['SMEMBERS',job+':parts'],['GET','poker21:club-cabinet:access:v1'],['SMEMBERS',original+':audience']]);
  const records=await call([...new Set([root,...parts])].map(part=>['GET',paymentPrefix+part]));
  const text=statusText(JSON.parse(raw),records.filter(Boolean).map(JSON.parse));
  const chats=[...new Set([...known,...keyHolders(JSON.parse(access||'{}').clubs||{})])];
  for(const chat of chats){
    const [message,done,prefs]=await call([['GET',original+':recipient:'+chat],['GET',job+':edited:'+chat],['HMGET','poker21:offer-preferences:'+chat,'silent','off','minimum']]);
    if(!Number(message)||String(done)===String(version))continue;
    const result=await send({chat_id:chat,message_id:Number(message),text,reply_markup:require('./offer-preferences').keyboard(prefs),editOnly:true});
    if(!result.ok && ![403].includes(result.error_code) && !/message to edit not found|message can't be edited/i.test(result.description||''))throw Error('Offer status edit failed');
    await call([['SET',job+':edited:'+chat,String(version)]]);
  }
  await call([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('ZREM',KEYS[2],ARGV[2]) end return 0",2,job,prefix+'due',String(version),id]]);
}
async function recoverRequestedEdits(){
  const {pipeline}=require('./redis');
  const result=await pipeline([['EVAL',`
    local ids=redis.call('SRANDMEMBER',KEYS[1],10)
    for _,root in ipairs(ids) do
      local job='offer-status:'..root
      if redis.call('EXISTS',ARGV[1]..'published-offer:'..root)==1 and redis.call('EXISTS',ARGV[2]..root)==1 then
        redis.call('INCR',ARGV[1]..job)
        redis.call('ZADD',KEYS[2],0,job)
      end
      redis.call('SREM',KEYS[1],root)
    end
    return #ids`,2,prefix+'requested-offer-edits',prefix+'due',prefix,paymentPrefix]],{throwOnError:true,context:'published-offer-status.recovery'});
  return Number(result?.[0]?.result||0);
}
module.exports={enqueueLua,deliver,statusText,recoverRequestedEdits};
