'use strict';
const {pipeline}=require('./redis');
const {messages,sendTelegram,PREFIX}=require('./financial-outbox');

module.exports=async function refreshDealMessage(token){
  const pending=PREFIX+'requested-owner-deal-edit';
  const read=async commands=>(await pipeline(commands,{throwOnError:true,context:'refresh-deal-message'})).map(row=>row.result);
  const [request]=await read([['GET',pending]]);
  if(!request)return false;
  if(!token||require('node:crypto').createHash('sha256').update(token).digest('hex')!==JSON.parse(request).tokenHash)return false;
  const {id,side,chatId,messageId,summary}=JSON.parse(request);
  if(id==='published-offer:7adc23e62c27d031f17bf5fe9e2ecf75'){
    const key=PREFIX+id;
    const [receipt,access,raw,prefs]=await read([['GET',key+':recipient:'+chatId],['GET','poker21:club-cabinet:access:v1'],['GET',key],['HMGET','poker21:offer-preferences:'+chatId,'silent','off','minimum']]);
    if(!Number.isSafeInteger(messageId)||messageId<1||Number(receipt)!==messageId||String(JSON.parse(access).clubs['758417'].owner)!==chatId)return false;
    const ids=['7adc23e62c27d031f17bf5fe9e2ecf75','8a5e12757fd603bc9b22f680afc2e07f','f997973def2a84eff36663168d7f1118'];
    const parts=(await read(ids.map(i=>['GET','poker21:telegram-report:payment-details:'+i]))).map(raw=>JSON.parse(raw));
    if(parts.some((p,i)=>p.status!=='confirmed'||p.owner.name!=='Nuts_and_Bluff'||p.payer.name!==['Два Туза','Два Туза','Пентакле'][i]||p.amountCents!==[1500000,1000000,1000000][i]))return false;
    const formatter=require('./published-offer-status');
    const text=formatter.statusText(JSON.parse(raw),parts)+'\n\nОплатили:\nДва Туза · 25 000 ₽\nПентакле · 10 000 ₽';
    const result=await sendTelegram({chat_id:chatId,message_id:messageId,text,entities:formatter.confirmedEntities(text),reply_markup:require('./offer-preferences').keyboard(prefs),editOnly:true});
    return result.ok&&result.result?.message_id===messageId;
  }
  if(summary){
    if(!/^withdrawal-daily:[a-zA-Z0-9_-]+$/.test(id)||!['388008256','5053253480'].includes(chatId)||!Number.isSafeInteger(messageId)||messageId<1)return false;
    const key=PREFIX+id;
    const [raw,receipt,access]=await read([['GET',key],['GET',key+':recipient:'+chatId+':part:0'],['GET','poker21:club-cabinet:access:v1']]);
    const clubs=JSON.parse(access).clubs,event=JSON.parse(raw);
    if(event?.kind!=='withdrawal-daily'||String(clubs['758417'].owner)!==chatId||Number(receipt)!==messageId)return false;
    const result=await sendTelegram({chat_id:chatId,message_id:messageId,text:summary,editOnly:true});
    if(!result.ok||result.result?.message_id!==messageId)throw Error('Summary edit failed');
    return true;
  }
  if(!/^[a-z0-9-]+$/i.test(id)||!['owner','payer'].includes(side)||!['388008256','5053253480'].includes(chatId)||!Number.isSafeInteger(messageId))throw Error('Invalid edit request');
  const key=PREFIX+'deal:'+id,index=side==='payer'?1:0;
  const [raw,receipt,access]=await read([['GET',key],['GET',key+':admin:'+index],['GET','poker21:club-cabinet:access:v1']]);
  const event=JSON.parse(raw);
  if(event?.kind!=='deal'||event.item.id!==id||Number(receipt)!==messageId)throw Error('Original message mismatch');
  const body=messages(event,JSON.parse(access).clubs)[index];
  if(body.chat_id!==chatId)throw Error('Original recipient mismatch');
  const result=await sendTelegram({...body,message_id:messageId,editOnly:true});
  if(!result.ok||result.result?.message_id!==messageId)throw Error('Original message edit failed');
  await read([['EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]); redis.call('SET',KEYS[2],ARGV[2]); end return 1",2,pending,key+':edited:'+chatId,request,String(messageId)]]);
  return true;
};
