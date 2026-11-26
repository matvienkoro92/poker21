'use strict';
const {createHash}=require('node:crypto');
const {PREFIX,DUE}=require('./financial-outbox');
const {dispatch}=require('./published-offer');
const {pipeline}=require('./redis');
async function run(commands){
  const rows=await pipeline(commands,{throwOnError:true,context:'requisite-requests'});
  if(!rows || rows.length!==commands.length || rows.some(r=>r.error))throw Error('Request storage unavailable');
  return rows.map(r=>r.result);
}
const activeIndex='poker21:active-requisite-requests';
async function list(){
  const now=Date.now();
  const [,rows]=await run([['ZREMRANGEBYSCORE',activeIndex,'-inf',now],['ZRANGEBYSCORE',activeIndex,'('+now,'+inf']]);
  return rows.map(raw=>{const {text,expiresAt}=JSON.parse(raw);return {text,expiresAt};});
}
async function queue(event){
  const [result]=await run([['EVAL',`
    local prior=redis.call('GET',KEYS[1])
    if prior then
      local old=cjson.decode(prior)
      local draft=cjson.decode(ARGV[1])
      if not KEYS[3] then return prior==ARGV[1] and 1 or 0 end
      return old.text==draft.text and old.durationMinutes==draft.durationMinutes and 1 or 0
    end
    if KEYS[3] then
      local draft=cjson.decode(ARGV[1])
      redis.call('ZADD',KEYS[3],draft.expiresAt,ARGV[1])
      redis.call('PEXPIRE',KEYS[3],21600000)
    end
    redis.call('SET',KEYS[1],ARGV[1])
    redis.call('ZADD',KEYS[2],0,ARGV[2])
    return 1`,event.expiresAt?3:2,PREFIX+event.id,DUE,...(event.expiresAt?[activeIndex]:[]),JSON.stringify(event),event.id]]);
  if(!Number(result))throw Object.assign(Error('Запрос уже отправлен с другими данными.'),{status:409});
  await dispatch(event.id);
}
async function create(body,clubId,clubName,author){
  const amount=String(body.amount||'').trim().replace(',','.');
  const bank=String(body.bank||'').trim();
  if(!/^\d{1,9}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||bank.length>100||/[\r\n]/.test(bank)||!/^[a-f0-9-]{36}$/.test(body.requestId||''))
    throw Object.assign(Error('Проверьте сумму и название банка.'),{status:400});
  const comment=body.comment??'';
  if(typeof comment!=='string'||comment.length>500)throw Object.assign(Error('Комментарий должен быть текстом до 500 символов.'),{status:400});
  const minutes=Number(body.durationMinutes);
  if(!Number.isInteger(minutes)||minutes<1||minutes>360)throw Object.assign(Error('Выберите срок от 1 до 360 минут.'),{status:400});
  const expiresAt=Date.now()+minutes*60000;
  const token=createHash('sha256').update([clubId,author,body.requestId].join(':')).digest('hex').slice(0,32);
  const amountCents=Math.round(Number(amount)*100);
  const text=['Нужны реквизиты · '+clubName,(amountCents/100).toLocaleString('ru-RU')+' ₽',bank||'Любой банк',...(comment.trim()?['Комментарий: '+comment.trim()]:[])].join('\n');
  await queue({id:'request:'+token,kind:'requisite-request',token,clubId,author,amountCents,currency:'rub',text,durationMinutes:minutes,expiresAt});
  return {ok:true};
}
async function handle(update,telegram){
  const cb=update.callback_query,m=update.message,match=/^propose:([a-f0-9]{32})$/.exec(cb?.data||'');
  const privateReply=m?.chat?.type==='private' && m.reply_to_message?.message_id;
  if(!match&&!privateReply)return false;
  const chat=match?cb.message?.chat:m.chat,user=String((match?cb.from:m.from)?.id);
  if(chat?.type!=='private'||String(chat.id)!==user){
    if(match)await telegram('answerCallbackQuery',{callback_query_id:cb.id,text:'Откройте личный чат с ботом.'});
    return !!match;
  }
  const promptKey=id=>'poker21:request-prompt:'+user+':'+id;
  const token=match?match[1]:(await run([['GET',promptKey(m.reply_to_message.message_id)]]))[0];
  if(!token)return false;
  const [raw,access]=await run([['GET',PREFIX+'request:'+token],['GET','poker21:club-cabinet:access:v1']]);
  const request=raw&&JSON.parse(raw),clubs=JSON.parse(access||'{}').clubs||{};
  const eligible=request && (!request.expiresAt||request.expiresAt>Date.now()) && user!==request.author && require('./financial-outbox').keyHolders(clubs).includes(user)
    && require('./financial-outbox').keyHolders({club:clubs[request.clubId]||{}}).includes(request.author);
  if(match)await telegram('answerCallbackQuery',{callback_query_id:cb.id,...(!eligible?{text:'Запрос недоступен.'}:{})});
  if(!eligible){if(!match)await telegram('sendMessage',{chat_id:user,text:'Запрос недоступен.'});return true;}
  if(match){
    const sent=await telegram('sendMessage',{chat_id:user,text:request.text+'\n\nОтветьте на это сообщение реквизитами для автора запроса.',reply_markup:{force_reply:true,input_field_placeholder:'Введите реквизиты'}});
    if(!sent?.result?.message_id)throw Error('Could not open request reply');
    await run([['SET',promptKey(sent.result.message_id),token]]);
  }else{
    const details=String(m.text||'').trim();
    if(!details||details.length>2400){await telegram('sendMessage',{chat_id:user,text:'Ответьте текстом до 2400 символов.'});return true;}
    await queue({kind:'requisite-proposal',id:'proposal:'+user+':'+m.message_id,clubId:request.clubId,author:request.author,
      text:request.text+'\n\nПредложены реквизиты:\n'+details});
    await telegram('sendMessage',{chat_id:user,text:'Предложение передано для отправки автору запроса.'});
  }
  return true;
}
module.exports={create,handle,list};
