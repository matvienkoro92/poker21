'use strict';

const options = [
  ['silent', 'Без звука'],
  ['off', 'Отключить оповещения'],
  ['minimum', 'Показывать только от 5 000 ₽'],
];
const key = id => 'poker21:offer-preferences:' + id;
const read = id => ['HMGET', key(id), ...options.map(([field]) => field)];
const enabled = value => String(value) === '1';

function keyboard(values, token, proposalLabel="Предложить реквизиты") {
  const rows=options.map(([field,label], i) => {
    const on = enabled(values[i]);
    return [{text:(on ? '✅ ' : '☐ ') + label, callback_data:'offerpref:'+field+':'+(on?'0':'1')}];
  });
  if(token) rows.unshift([{text:proposalLabel,callback_data:"propose:"+token}]);
  else rows.unshift([{text:'Посмотреть заявки',url:require('./requisite-widget').cabinetUrl('requisites').href}]);
  return {inline_keyboard:rows};
}

function qualifies(event) {
  if (event.amountCents != null) return event.currency === 'rub' && event.amountCents >= 500000;
  // Offers already queued before structured amounts were introduced.
  const match = /^([\d\s]+(?:,\d+)?) ₽$/.exec((event.text || '').split('\n')[1] || '');
  return !!match && Number(match[1].replace(/\s/g,'').replace(',','.')) >= 5000;
}

async function personalize(event, payloads, call) {
  if (!payloads.length) return [];
  const rows = await call(payloads.map(p => read(p.chat_id)));
  return payloads.flatMap((p,i) => {
    const values = rows[i];
    if (!Array.isArray(values) || values.length !== options.length) throw Error('Offer preferences unavailable');
    if (enabled(values[1]) || (enabled(values[2]) && !qualifies(event))) return [];
    return [{...p, disable_notification:enabled(values[0]), reply_markup:keyboard(values,event.kind==="requisite-request"?event.token:null,event.requestType && event.requestType!=="card"?"Ответить на запрос":undefined)}];
  });
}

async function handle(callback, redis, telegram) {
  const match = /^offerpref:(silent|off|minimum):([01])$/.exec(callback?.data || '');
  if (!match) return false;
  const chat = callback.message?.chat;
  if (chat?.type !== 'private' || String(chat.id) !== String(callback.from?.id)) {
    await telegram('answerCallbackQuery',{callback_query_id:callback.id,text:'Настройки доступны в личном чате.'});
    return true;
  }
  const rows = await redis([['HSET',key(chat.id),match[1],match[2]],read(chat.id)],{throwOnError:true,context:'offer-preferences'});
  if (rows?.some(row=>row.error) || !Array.isArray(rows?.[1]?.result)) throw Error('Could not save offer preferences');
  const proposal=callback.message.reply_markup?.inline_keyboard?.flat().find(b=>/^propose:[a-f0-9]{32}$/.test(b.callback_data||''));
  const edit = await telegram('editMessageReplyMarkup',{chat_id:chat.id,message_id:callback.message.message_id,reply_markup:keyboard(rows[1].result,proposal?.callback_data.slice(8),proposal?.text)});
  if (!edit?.ok && !/message is not modified/i.test(edit?.description || '')) throw Error('Could not update offer buttons');
  await telegram('answerCallbackQuery',{callback_query_id:callback.id,text:'Настройки сохранены'});
  return true;
}
module.exports={personalize,handle,keyboard};
