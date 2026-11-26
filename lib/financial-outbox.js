const { pipeline } = require('./redis');
const { randomUUID } = require('crypto');
const PREFIX = 'poker21:financial-outbox:';
const DUE = `${PREFIX}due`;
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = value => `${(Number(value) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

function keyHolders(clubs={}){
  return [...new Set(Object.values(clubs).flatMap(club=>[club.owner,...(club.staff||[])])
    .map(String).filter(id=>/^[1-9]\d*$/.test(id)))];
}
function messages(event, clubs = {}) {
  if(event.kind==='sender-receipt')return [{chat_id:event.sender,text:'Чек на '+event.amount+' отправлен. Ожидается подтверждение клуба «'+event.owner+'».',
    ...(event.fromMessage?{from_chat_id:event.fromChat,message_id:Number(event.fromMessage),copyReceipt:true}:event.cabinetReceipt?{cabinetReceipt:event.cabinetReceipt}:{receiptId:event.reservationId})}];
  if(event.kind==='requisite-proposal'){
    const members=keyHolders({club:clubs[event.clubId]||{}});
    return members.includes(event.author)?[{chat_id:event.author,text:event.text}]:[];
  }
  if(event.kind==='published-offer'||event.kind==='requisite-request'){
    const authorized=new Set(keyHolders(clubs));
    const text=event.kind==='requisite-request'&&event.expiresAt?event.text+'\nАктуален до '+new Date(event.expiresAt).toLocaleTimeString('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'})+' МСК':event.text;
    return (event.recipients || [...authorized]).filter(id=>authorized.has(id) && id!==event.author).map(chat_id=>({chat_id,text}));
  }
  if(['withdrawal-claim','withdrawal-paid','withdrawal-daily'].includes(event.kind)){
    const staff=clubs['758417']?.staff||[];
    const recipients=new Set(['388008256','5053253480',...staff.map(String)]);
    if(event.kind==='withdrawal-daily'){
      const day=new Date(event.confirmedAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'});
      const heading='Сделки за '+day+' · МСК';
      const parts=[heading];
      const lines=event.rows.map(r=>r.payer+' → Два туза · '+money(r.amount));
      lines.push('Итого: '+money(event.rows.reduce((sum,r)=>sum+r.amount,0)));
      for(const line of lines){
        if(parts[parts.length-1].length+line.length+1>4000)parts.push(heading);
        parts[parts.length-1]+='\n'+line;
      }
      return [...recipients].filter(id=>/^[1-9]\d*$/.test(id)).flatMap(chat_id=>parts.map(text=>({chat_id,text})));
    }
    if(event.kind==='withdrawal-paid'){
      const text='Клуб «'+event.club+'» отметил оплату '+money(event.amountCents)+'. '+(event.hasReceipt?'Чек приложен.':'Клуб не приложил чек.')+' Подтвердите после проверки поступления.';
      return [...recipients].filter(id=>/^[1-9]\d*$/.test(id)).map(chat_id=>({chat_id,text,
        ...(event.hasReceipt?{receiptId:event.reservationId}:{}),
        reply_markup:{inline_keyboard:[[{text:'Подтвердить оплату',callback_data:'depconfirm:'+event.reservationId}]]}}));
    }
    return [...recipients].filter(id=>/^[1-9]\d*$/.test(id)).map(id=>({chat_id:id,
      text:'Клуб «'+event.club+'» (ID '+event.clubId+') взял в Poker21 реквизит из наших Депозитов на '+money(event.amountCents)+'.'}));
  }
  if (event.kind === 'club-dialog' && event.route) {
    const admin=String(clubs[event.route.clubId]?.owner || '');
    return [{chat_id:/^[1-9]\d*$/.test(admin)?admin:null,
      text:'Заявка '+event.item+' · '+event.message.club+' · '+event.message.author+'\n\n'+event.message.text,
      reply_markup:{force_reply:true,input_field_placeholder:'Ответить клубу по этой заявке'}}];
  }
  if (event.kind === 'club-dialog') return [];
  const target=String(clubs[event.clubId]?.owner||'');
  const admin=/^[1-9]\d*$/.test(target)?target:null;
  if (event.kind === 'summary') return [];
  if (event.kind === 'payment-recheck') return [{chat_id:admin,text:`Клуб «${event.payer}» просит повторно проверить поступление ${event.amount}. Прежний чек доступен в карточке заявки.`}];
  if (event.kind === 'payment-rejected') return [{
    chat_id: admin,
    text: `Клуб «${event.owner}» сообщает, что платёж на ${event.amount} не поступил. Проверьте перевод. В карточке заявки можно запросить повторную проверку, приложить новый чек или отменить бронь.`,
  }];
  if (event.kind === 'merge') return event.transfers.map(t => ({
    chat_id: String(t.chatId), parse_mode: 'HTML',
    text: `✅ <b>Баланс реквизитов перенесён в основной</b>\nПеренос: ${esc(event.id)}\nСумма: <b>${money(t.amount)}</b>\n\nКлубный баланс: ${money(t.before)} → <b>${money(t.after)}</b>\nБаланс реквизитов: ${money(t.amount)} → <b>0,00 ₽</b>\n\nИстория сохранена. Дополнительная комиссия не списывалась.`,
  }));
  const {item} = event;
  return ['owner','payer'].map(side => {
    const party = item[side];
    const admin = String(clubs[party.id]?.owner || '');
    const balance = side === 'owner' ? event.ownerAfter : event.payerAfter;
    const fee = side === 'owner' ? (item.balanceOperation.ownerFeeCents ?? item.balanceOperation.feeCents) : item.balanceOperation.feeCents;
    return {chat_id: party.type !== 'union' && /^[1-9]\d*$/.test(admin) ? admin : null,
      text: `✅ Сделка по реквизитам завершена\nКлуб: ${party.name}\nЗаявка: ${item.id}\nСумма: ${money(item.amountCents)}\nКомиссия: ${money(fee)}\nБаланс реквизитов: ${money(balance)}`};
  });
}

function confirmedMessage(text){
  return text.replace(/ Подтвердите после проверки поступления\.$/u,'')+'\n\n✅ Сделка завершена. Оплата подтверждена.';
}

async function syncConfirmedMessage(id,chatId,call,send){
  const paidKey=PREFIX+'withdrawal-paid:'+id;
  const receipt=paidKey+':recipient:'+chatId;
  const [confirmed,paid,messageId,done]=await call([['GET',PREFIX+'withdrawal-daily:'+id],['GET',paidKey],['GET',receipt],['GET',receipt+':confirmed']]);
  if(!confirmed||!paid||!Number(messageId)||done)return;
  const event=JSON.parse(paid);
  const original=messages(event,{})[0].text;
  const body={chat_id:chatId,message_id:Number(messageId),reply_markup:{inline_keyboard:[]}};
  body[event.hasReceipt?'caption':'text']=confirmedMessage(original);
  const result=await send(body);
  if(!result.ok)throw Error('Не удалось обновить статус сообщения об оплате');
  await call([['SET',receipt+':confirmed','1']]);
}

async function syncSenderReceipt(receiptId,call,send){
  const key=PREFIX+receiptId;
  const [raw,message,done]=await call([['GET',key],['GET',key+':sent:0'],['GET',key+':confirmed']]);
  if(!raw||!Number(message)||done)return;
  const event=JSON.parse(raw);
  const [confirmed]=await call([['GET',PREFIX+event.confirmation]]);
  if(!confirmed)return;
  if(event.confirmation.startsWith('deal:')){
    const {item}=JSON.parse(confirmed);
    if(receiptId!=='sender-receipt:'+item.id+':'+item.paidAt)return;
  }
  const result=await send({chat_id:event.sender,message_id:Number(message),editOnly:true,caption:'✅ Оплата подтверждена клубом «'+event.owner+'» · '+event.amount});
  if(!result.ok){
    if(result.error_code===403||/message to edit not found|message can't be edited/i.test(result.description||''))return;
    throw Error('Не удалось обновить чек отправителя');
  }
  await call([['SET',key+':confirmed','1']]);
}

async function sendTelegram({editOnly=false,...body}) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
  if(body.copyReceipt){
    const response=await fetch('https://api.telegram.org/bot'+token+'/copyMessage',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chat_id:body.chat_id,from_chat_id:body.from_chat_id,message_id:body.message_id,caption:body.text}),signal:AbortSignal.timeout(8000)});
    return response.json();
  }
  if(body.receiptId||body.cabinetReceipt){
    const receipt=body.cabinetReceipt?(await pipeline([['GET','poker21:cabinet-receipt:'+body.cabinetReceipt]],{throwOnError:true}))[0].result:await require('./club-team').withdrawalReceipt(body.receiptId);
    const match=/^data:(image\/jpeg|image\/png|application\/pdf);base64,(.+)$/.exec(receipt);
    if(!match)throw Error('Не удалось прочитать чек');
    const ext={'image/jpeg':'jpg','image/png':'png','application/pdf':'pdf'}[match[1]];
    const form=new FormData();
    form.set('chat_id',body.chat_id);
    form.set('caption',body.text);
    if(body.reply_markup)form.set('reply_markup',JSON.stringify(body.reply_markup));
    form.set('document',new Blob([Buffer.from(match[2],'base64')],{type:match[1]}),'Чек.'+ext);
    const response=await fetch('https://api.telegram.org/bot'+token+'/sendDocument',{method:'POST',body:form,signal:AbortSignal.timeout(12000)});
    return response.json();
  }
  const method = body.caption ? 'editMessageCaption' : body.message_id ? 'editMessageText' : 'sendMessage';
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!result.ok && body.message_id && /message is not modified/i.test(result.description || '')) return { ok: true, result: { message_id: body.message_id } };
  if (!editOnly && !result.ok && body.message_id && /message to edit not found|message can't be edited/i.test(result.description || '')) {
    const { message_id, ...fallback } = body;
    if(body.caption){fallback.text=body.caption;delete fallback.caption;}
    return sendTelegram(fallback);
  }
  return result;
}

async function drain({ redis = pipeline, send = sendTelegram, now = Date.now, eventId, budgetMs = 18000 } = {}) {
  const started = now();
  const call = async commands => {
    const rows = await redis(commands, { context: 'financial-outbox', timeoutMs: 3000 });
    if (!Array.isArray(rows) || rows.some(r => r.error)) throw new Error('Outbox storage unavailable');
    return rows.map(r => r.result);
  };
  const [ids] = eventId ? [[eventId]] : await call([['ZRANGEBYSCORE', DUE, '-inf', String(now()), 'LIMIT', '0', '10']]);
  let delivered = 0;
  for (const id of ids || []) {
    if (now() - started >= budgetMs) break;
    const key = PREFIX + id;
    const lock = key + ':lock';
    const lease = randomUUID();
    const [acquired] = await call([['SET', lock, lease, 'NX', 'PX', '120000']]);
    if (acquired !== 'OK') continue;
    try {
      if (eventId && (await call([['GET', key + ':delivered']]))[0]) continue;
      const [raw] = await call([['GET', key]]);
      if(!raw&&id.startsWith('offer-status:'))continue;
      if (!raw) throw new Error('Missing outbox event');
      if(id.startsWith('offer-status:')){
        try{await require('./published-offer-status').deliver(id,raw,call,send,keyHolders);}
        catch(error){
          await call([['ZADD',DUE,String(now()+30000),id]]);
          console.error('published-offer-status',error.message);
        }
        continue;
      }
      const event = JSON.parse(raw);
      if(event.kind==='deal'&&event.item.paidAt)await syncSenderReceipt('sender-receipt:'+event.item.id+':'+event.item.paidAt,call,send);
      if(event.kind==='withdrawal-daily')await syncSenderReceipt('sender-withdrawal:'+id.slice('withdrawal-daily:'.length),call,send);
      // Cancel legacy queued broadcasts without sending or deleting their audit history.
      if ((event.kind==='requisite-request' && event.expiresAt<=now()) || event.kind === 'summary' || (event.kind==='club-dialog'&&!event.route)) {
        await call([['ZREM', DUE, id], ['SET', key + ':cancelled', String(now())]]);
        continue;
      }
      const paymentStatus=['payment-recheck','payment-rejected'].includes(event.kind);
      if(paymentStatus&&!event.clubId&&event.chatId){
        const [binding]=await call([['GET','poker21:telegram-report:club-chat:'+event.chatId]]);
        event.clubId=JSON.parse(binding||'{}')?.clubId;
      }
      const withdrawalNotice=['withdrawal-claim','withdrawal-paid','withdrawal-daily'].includes(event.kind);
      const offerNotice = event.kind === "published-offer" || event.kind === "requisite-request";
      const privateDeal = event.kind==='requisite-proposal' || offerNotice || withdrawalNotice || event.kind === 'deal' || !!event.route || paymentStatus;
      const [access] = privateDeal ? await call([['GET','poker21:club-cabinet:access:v1']]) : [];
      let payloads = messages(event, access ? JSON.parse(access).clubs : {});
      if(offerNotice){
        payloads=await require('./offer-preferences').personalize(event,payloads,call);
        await require('./offer-delivery').distribute(id,payloads,call,require('@vercel/queue').send);
        continue;
      }
      const receiptKey = i => event.kind==='withdrawal-daily' ? key+':recipient:'+payloads[i].chat_id+':part:'+payloads.slice(0,i).filter(p=>p.chat_id===payloads[i].chat_id).length : withdrawalNotice ? key+':recipient:'+payloads[i].chat_id : privateDeal ? key + ':admin:' + i : key + ':sent:' + i;
      for (let index = 0; index < payloads.length; index++) {
        if (now() - started >= budgetMs || (event.kind==='requisite-request' && event.expiresAt<=now())) break;
        const receipt = receiptKey(index);
        const [sent] = await call([['GET', receipt]]);
        const sync=()=>syncConfirmedMessage(id.slice(id.indexOf(':')+1),payloads[index].chat_id,call,send);
        if(event.kind==='withdrawal-daily'||(event.kind==='withdrawal-paid'&&sent))await sync();
        if(event.kind==='sender-receipt'&&sent)await syncSenderReceipt(id,call,send);
        if (sent) continue;
        let result;
        try { result = payloads[index].chat_id ? await send(payloads[index]) : {ok:false,description:'Администратор клуба не подключён'}; } catch (_) { result = { ok: false, description: 'Telegram response unavailable' }; }
        if (!result.ok) {
          const [attempts] = await call([['INCR', key + ':attempts']]);
          const delay = Math.max(Number(result.parameters?.retry_after || 0) * 1000, Math.min(3600000, 30000 * 2 ** Math.min(Number(attempts), 7)));
          await call([['ZADD', DUE, String(now() + delay), id], ['SET', key + ':error', JSON.stringify({ at: now(), code: result.error_code || 0, message: result.description || 'delivery failed' })]]);
          if (privateDeal) continue;
          break;
        }
        const messageId=result.result?.message_id;
        const saved=[['SET', receipt, String(messageId || 'sent')]];
        if(event.route && messageId)saved.unshift(['SET','poker21:dialog-reply:'+payloads[index].chat_id+':'+messageId,JSON.stringify(event.route)]);
        await call(saved);
        if(event.kind==='sender-receipt')await syncSenderReceipt(id,call,send);
        if(event.kind==='withdrawal-paid')await sync();
        delivered++;
      }
      const receipts = !payloads.length ? [] : await call(payloads.map((_, i) => ['GET', receiptKey(i)]));
      if (receipts.every(Boolean)) await call([['ZREM', DUE, id], ['SET', key + ':delivered', String(now())]]);
    } finally {
      await call([['EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", '1', lock, lease]]);
    }
  }
  return { delivered };
}
module.exports = { sendTelegram, confirmedMessage, drain, messages, keyHolders, PREFIX, DUE };
