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
async function list(clubId,author){
  const now=Date.now();
  const [,rows]=await run([['ZREMRANGEBYSCORE',activeIndex,'-inf',now],['ZRANGEBYSCORE',activeIndex,'('+now,'+inf']]);
  return rows.map(raw=>{
    const request=JSON.parse(raw);
    const {text,expiresAt}=request;
    return {text,expiresAt,...(request.clubId===clubId&&request.author===author?{deleteToken:request.token}:{})};
  });
}
async function remove(token,clubId,author){
  if(typeof token!=='string'||!/^[a-f0-9]{32}$/.test(token))
    throw Object.assign(Error('Запрос недоступен.'),{status:404});
  const id='request:'+token;
  const [result]=await run([['EVAL',`
    local raw=redis.call('GET',KEYS[1])
    if not raw then return 0 end
    local request=cjson.decode(raw)
    if request.author~=ARGV[1] or request.clubId~=ARGV[2] then return 0 end
    if not request.cancelledAt then
      request.cancelledAt=tonumber(ARGV[4])
      redis.call('ZREM',KEYS[2],raw)
      redis.call('ZREM',KEYS[3],ARGV[3])
      redis.call('SET',KEYS[1],cjson.encode(request))
    end
    return 1
  `,3,PREFIX+id,activeIndex,DUE,author,clubId,id,Date.now()]]);
  if(!Number(result))throw Object.assign(Error('Запрос недоступен.'),{status:404});
  return {ok:true};
}
async function queue(event,requestToken){
  const extraKey=event.expiresAt?activeIndex:requestToken?PREFIX+'request:'+requestToken:null;
  const [result]=await run([['EVAL',`
    if ARGV[3] then
      local raw=redis.call('GET',KEYS[3])
      if not raw then return 3 end
      local request=cjson.decode(raw)
      if request.cancelledAt or (request.expiresAt and request.expiresAt<=tonumber(ARGV[3])) then return 3 end
    end
    local prior=redis.call('GET',KEYS[1])
    if prior then
      local old=cjson.decode(prior)
      local draft=cjson.decode(ARGV[1])
      if old.cancelledAt then return 2 end
      if not draft.expiresAt then return prior==ARGV[1] and 1 or 0 end
      return old.text==draft.text and old.durationMinutes==draft.durationMinutes and 1 or 0
    end
    local draft=cjson.decode(ARGV[1])
    if draft.expiresAt then
      redis.call('ZADD',KEYS[3],draft.expiresAt,ARGV[1])
      redis.call('PEXPIRE',KEYS[3],21600000)
    end
    redis.call('SET',KEYS[1],ARGV[1])
    redis.call('ZADD',KEYS[2],0,ARGV[2])
    return 1`,extraKey?3:2,PREFIX+event.id,DUE,...(extraKey?[extraKey]:[]),JSON.stringify(event),event.id,...(requestToken?[Date.now()]:[])]]);
  if(!Number(result))throw Object.assign(Error('Запрос уже отправлен с другими данными.'),{status:409});
  if(Number(result)===3)return false;
  if(Number(result)===1)await dispatch(event.id);
  return true;
}
async function create(body,clubId,clubName,author){
  const type=body.requestType??'card';
  const titles=new Map([['card','Нужны реквизиты'],['crypto-rub','Обмен крипты на рубли'],['rub-crypto','Обмен рублей на крипту'],['other','Запрос клуба']]);
  if(!titles.has(type))throw Object.assign(Error('Выберите тип запроса.'),{status:400});
  const card=type==='card';
  const amount=String(body.amount||'').trim().replace(',','.');
  const bank=String(body.bank||'').trim();
  if((card&&(!/^\d{1,9}(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||bank.length>100||/[\r\n]/.test(bank)))||!/^[a-f0-9-]{36}$/.test(body.requestId||''))
    throw Object.assign(Error('Проверьте сумму и название банка.'),{status:400});
  const comment=body.comment??'';
  if(typeof comment!=='string'||comment.length>500)throw Object.assign(Error('Комментарий должен быть текстом до 500 символов.'),{status:400});
  if(!card&&!comment.trim())throw Object.assign(Error('Опишите запрос.'),{status:400});
  const minutes=Number(body.durationMinutes);
  if(!Number.isInteger(minutes)||minutes<1||minutes>360)throw Object.assign(Error('Выберите срок от 1 до 360 минут.'),{status:400});
  const expiresAt=Date.now()+minutes*60000;
  const token=createHash('sha256').update([clubId,author,body.requestId].join(':')).digest('hex').slice(0,32);
  const amountCents=Math.round(Number(amount)*100);
  const clubLabel=String(clubName||clubId).trim().replace(/^(?:клуб\s+)?/iu,'Клуб ');
  const lines=[titles.get(type)+' · '+clubLabel];
  if(card)lines.push((amountCents/100).toLocaleString('ru-RU')+' ₽',bank||'Любой банк');
  if(comment.trim())lines.push((card?'Комментарий: ':'')+comment.trim());
  await queue({id:'request:'+token,kind:'requisite-request',token,clubId,author,requestType:type,
    ...(card?{amountCents,currency:'rub'}:{}),text:lines.join('\n'),durationMinutes:minutes,expiresAt});
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
  const eligible=request && !request.cancelledAt && (!request.expiresAt||request.expiresAt>Date.now()) && user!==request.author && require('./financial-outbox').keyHolders(clubs).includes(user)
    && require('./financial-outbox').keyHolders({club:clubs[request.clubId]||{}}).includes(request.author);
  if(match)await telegram('answerCallbackQuery',{callback_query_id:cb.id,...(!eligible?{text:'Запрос недоступен.'}:{})});
  if(!eligible){if(!match)await telegram('sendMessage',{chat_id:user,text:'Запрос недоступен.'});return true;}
  if(match){
    const sent=await telegram('sendMessage',{chat_id:user,text:request.text+'\n\nОтветьте на это сообщение своим предложением для автора запроса.',reply_markup:{force_reply:true,input_field_placeholder:'Ваше предложение'}});
    if(!sent?.result?.message_id)throw Error('Could not open request reply');
    await run([['SET',promptKey(sent.result.message_id),token]]);
  }else{
    const details=String(m.text||'').trim();
    if(!details||details.length>2400){await telegram('sendMessage',{chat_id:user,text:'Ответьте текстом до 2400 символов.'});return true;}
    const queued=await queue({kind:'requisite-proposal',id:'proposal:'+user+':'+m.message_id,clubId:request.clubId,author:request.author,
      text:request.text+'\n\nПредложение клуба:\n'+details},token);
    await telegram('sendMessage',{chat_id:user,text:queued?'Предложение передано для отправки автору запроса.':'Запрос недоступен.'});
  }
  return true;
}
module.exports={create,handle,list,remove};
