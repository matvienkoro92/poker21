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
