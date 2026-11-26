'use strict';
const {randomUUID}=require('crypto');
const prefix='poker21:financial-outbox:';
const topic='club-offer-delivery';

async function distribute(id,payloads,call,publish){
  const key=prefix+id;
  const [snapshot]=await call([['SET',key+':targets',JSON.stringify(payloads.map(p=>String(p.chat_id))),'NX','GET']]);
  const targets=snapshot?JSON.parse(snapshot):payloads.map(p=>String(p.chat_id));
  if(targets.length){
    const receipts=await call(targets.map(chat=>['GET',key+':recipient:'+chat]));
    await Promise.all(targets.filter((_,i)=>!receipts[i]).map(chat=>publish(topic,{id,chat},{idempotencyKey:id+':'+chat})));
  }
  const receipts=targets.length?await call(targets.map(chat=>['GET',key+':recipient:'+chat])):[];
  const commands=[['ZREM',prefix+'due',id],['SET',key+':dispatched',Date.now()]];
  if(receipts.every(Boolean))commands.push(['SET',key+':delivered',Date.now()]);
  await call(commands);
}

async function deliver({id,chat},call,send){
  const {messages}=require('./financial-outbox');
  const key=prefix+id,receipt=key+':recipient:'+chat,lock=receipt+':lock',lease=randomUUID();
  const [raw,access,snapshot,old,skipped]=await call([['GET',key],['GET','poker21:club-cabinet:access:v1'],['GET',key+':targets'],['GET',receipt],['GET',receipt+':skipped']]);
  if(!raw||!snapshot||!JSON.parse(snapshot).includes(chat)||old||skipped)return;
  if((await call([['SET',lock,lease,'NX','EX',45]]))[0]!=='OK')throw Error('Delivery in progress');
  try{
    if((await call([['GET',receipt]]))[0])return;
    const event=JSON.parse(raw);
    const candidates=messages(event,JSON.parse(access||'{}').clubs).filter(p=>String(p.chat_id)===chat);
    const [body]=await require('./offer-preferences').personalize(event,candidates,call);
    if(!body||(event.expiresAt&&event.expiresAt<=Date.now())){
      await call([['SET',receipt+':skipped',Date.now()]]);
    }else{
      const result=await send(body);
      if(!result.ok){
        await call([['SET',receipt+':error',JSON.stringify({at:Date.now(),code:result.error_code,message:result.description})]]);
        throw Object.assign(Error('Telegram delivery failed'),{retryAfter:result.parameters?.retry_after});
      }
      const commands=[['SET',receipt,String(result.result.message_id)],['SET',receipt+':sent-at',Date.now()]];
      if(event.kind==='published-offer'){
        commands.push(['SADD',key+':audience',chat]);
        const job='offer-status:'+id.slice('published-offer:'.length);
        commands.push(['EVAL',"if redis.call('EXISTS',KEYS[1])==1 then redis.call('INCR',KEYS[1]); redis.call('ZADD',KEYS[2],0,ARGV[1]) end return 1",2,prefix+job,prefix+'due',job]);
      }
      await call(commands);
    }
    const targets=JSON.parse(snapshot);
    const states=await call(targets.flatMap(c=>[['GET',key+':recipient:'+c],['GET',key+':recipient:'+c+':skipped']]));
    if(targets.every((_,i)=>states[2*i]||states[2*i+1]))await call([['SET',key+':delivered',Date.now()]]);
  }finally{
    await call([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",1,lock,lease]]);
  }
}
module.exports={distribute,deliver};
