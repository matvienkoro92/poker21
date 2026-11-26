'use strict';

function cabinetUrl(){
  const configured=[process.env.TELEGRAM_MINI_APP_LINK,process.env.MINI_APP_URL].find(link=>/^https:\/\/t\.me\//i.test(link||''));
  const url=new URL(configured||'https://t.me/poker21app_bot/start');
  url.searchParams.set('startapp','cabinet');
  return url;
}

const keyPrompt='Подключите ключ клуба, чтобы видеть реквизиты. Запросить ключ можно у @Roman1787443.';

function escapeHtml(value){
  return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function dealUrl(item){
  const url=cabinetUrl();
  url.searchParams.set('startapp','deal_'+item.replace(/^withdrawal:/,'w_'));
  return url.href;
}

async function card(id,index,service){
  const {items,withdrawalError,keyRequired}=await service.widgetOffers(String(id));
  if(keyRequired)return {text:'🔐 <b>Доступ по ключу клуба</b>\n\n'+keyPrompt,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Подключить ключ',style:'primary',url:cabinetUrl().href}],[{text:'Обновить',callback_data:'rq:page:0'}]]}};
  const page=Math.min(index,Math.max(0,items.length-1)),item=items[page];
  const text=[],keyboard=[];
  if(item){
    const amount=item.amount.toLocaleString('ru-RU')+(item.currency==='usd'?' $':' ₽');
    const details=[];
    if(item.minimumCents)details.push('Минимум одной брони · '+(item.minimumCents/100).toLocaleString('ru-RU')+' ₽');
    if(item.bank)details.push('Банк · <b>'+escapeHtml(item.bank)+'</b>');
    if(item.number)details.push('Номер · '+escapeHtml(item.number));
    text.push('<b>Реквизиты</b>  ·  '+(page+1)+' из '+items.length, '\n💳  <b>'+escapeHtml(amount)+'</b>');
    if(details.length)text.push('<blockquote>'+details.join('\n')+'</blockquote>');
    keyboard.push([{text:'Взять реквизит',style:'primary',url:dealUrl(item.id)}]);
  }else text.push('Свободных реквизитов пока нет.');
  if(withdrawalError)text.push('Выводы из Депозитов временно недоступны.');
  const nav=[];
  if(page>0)nav.push({text:'‹ Назад',callback_data:'rq:page:'+(page-1)});
  nav.push({text:'Обновить',callback_data:'rq:page:'+page});
  if(page+1<items.length)nav.push({text:'Далее ›',callback_data:'rq:page:'+(page+1)});
  keyboard.push(nav);
  return {text:text.filter(Boolean).join('\n'),parse_mode:'HTML',reply_markup:{inline_keyboard:keyboard}};
}

async function send(chatId,telegram,service){
  let body;
  try{body=await card(chatId,0,service);}
  catch{body={text:'Не удалось загрузить реквизиты.',reply_markup:{inline_keyboard:[[{text:'Повторить',callback_data:'rq:page:0'}]]}};}
  return telegram('sendMessage',{chat_id:chatId,...body});
}

async function callback(q,telegram,service){
  const chat=q.message?.chat;
  if(chat?.type!=='private'||chat.id!==q.from?.id)return telegram('answerCallbackQuery',{callback_query_id:q.id});
  const page=/^rq:page:(\d{1,6})$/.exec(q.data),take=/^rq:take:([a-f0-9]{32})$/.exec(q.data);
  try{
    let body;
    if(page)body=await card(chat.id,Number(page[1]),service);
    else if(take){
      const item=await service.widgetTake(String(chat.id),take[1]);
      body={text:'Бронь оформлена. После перевода приложите чек в карточке сделки.',reply_markup:{inline_keyboard:[[{text:'Перейти к оплате',url:dealUrl(item)}]]}};
    }else throw Error('unknown');
    await telegram('editMessageText',{chat_id:chat.id,message_id:q.message.message_id,...body});
    return telegram('answerCallbackQuery',{callback_query_id:q.id});
  }catch(error){
    return telegram('answerCallbackQuery',{callback_query_id:q.id,text:error.status&&error.status<500?error.message:'Не удалось обновить данные. Проверьте сделку в кабинете.',show_alert:true});
  }
}

async function answer(query,telegram,service){
  const match=/^req:(\d{1,6})$/.exec(query.data||'');
  let data={error:'Запрос недоступен'};
  const take=/^take:([a-f0-9]{32})$/.exec(query.data||'');
  if((match||take)&&query.chat?.type==='private'&&query.from?.id===query.chat.id&&query.type?.type==='data'){
    try{
      if(take){
        const item=await service.widgetTake(String(query.from.id),take[1]);
        const url=cabinetUrl();
        url.searchParams.set('startapp','deal_'+item.replace(/^withdrawal:/,'w_'));
        return telegram('answerWidgetQuery',{widget_query_id:query.id,data:JSON.stringify({link:url.href})});
      }
      const {items,withdrawalError,keyRequired}=await service.widgetOffers(String(query.from.id));
      if(keyRequired)return telegram('answerWidgetQuery',{widget_query_id:query.id,data:JSON.stringify({page:0,total:0,keyRequired:true,warning:keyPrompt,link:cabinetUrl().href})});
      const page=Math.max(0,Math.min(Number(match[1]),items.length-1));
      const row=items[page];
      data={page,total:items.length};
      if(withdrawalError)data.warning='Выводы из Депозитов временно недоступны.';
      if(row){
        const url=cabinetUrl();
        url.searchParams.set('startapp','deal_'+String(row.id).replace(/^withdrawal:/,'w_'));
        Object.assign(data,{takeToken:row.takeToken,amount:row.amount.toLocaleString('ru-RU')+(row.currency==='usd'?' $':' ₽'),bank:String(row.bank||'').slice(0,48),number:String(row.number||'').slice(0,90),link:url.href});
      }
    }catch(error){data={error:error.status&&error.status<500?error.message:'Проверьте состояние заявки в кабинете.'};}
  }
  return telegram('answerWidgetQuery',{widget_query_id:query.id,data:JSON.stringify(data)});
}
module.exports={dealUrl,send,answer,callback};
