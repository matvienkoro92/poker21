'use strict';

function cabinetUrl(section='cabinet'){
  const configured=[process.env.TELEGRAM_MINI_APP_LINK,process.env.MINI_APP_URL].find(link=>/^https:\/\/t\.me\//i.test(link||''));
  const url=new URL(configured||'https://t.me/poker21app_bot/start');
  url.searchParams.set('startapp',section);
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

async function publicList(page,service){
  const {items,withdrawalError}=await service.openRequisites();
  const size=6,last=Math.max(0,Math.ceil(items.length/size)-1);
  page=Math.min(page,last);
  const lines=['Доступные реквизиты · '+items.length],keyboard=[];
  items.slice(page*size,(page+1)*size).forEach((item,index)=>{
    const label=(page*size+index+1)+'. '+item.amount.toLocaleString('ru-RU')+(item.currency==='usd'?' $':' ₽');
    lines.push(label+' · '+String(item.bank||'Банк не указан').slice(0,120));
    if(item.bookingPaused)lines.push('⏸ На паузе до 06:00 МСК');
    if(item.minimumCents)lines.push('Минимум брони: '+(item.minimumCents/100).toLocaleString('ru-RU')+' ₽');
    keyboard.push([{text:'Открыть №'+(page*size+index+1),url:dealUrl(item.id)}]);
  });
  if(!items.length&&!withdrawalError)lines.push('Свободных заявок пока нет.');
  if(withdrawalError)lines.push('Заявки из Депозитов временно недоступны.');
  const nav=[];
  if(page>0)nav.push({text:'‹ Назад',callback_data:'publicreq:'+ (page-1)});
  nav.push({text:'Обновить',callback_data:'publicreq:'+page});
  if(page<last)nav.push({text:'Далее ›',callback_data:'publicreq:'+(page+1)});
  keyboard.push(nav);
  return {text:lines.join('\n'),reply_markup:{inline_keyboard:keyboard}};
}

async function summary(id,service,redis){
  const {items,withdrawalError,keyRequired}=await service.widgetOffers(String(id));
  if(keyRequired)return {text:'🔐 <b>Доступ по ключу клуба</b>\n\n'+keyPrompt,parse_mode:'HTML',reply_markup:{inline_keyboard:[[{text:'Подключить ключ',style:'primary',url:cabinetUrl().href}],[{text:'Обновить',callback_data:'rq:page:0'}]]}};
  const preferences=require('./offer-preferences');
  const [row]=await redis([preferences.read(id)],{context:'requisites-command.preferences'});
  const values=Array.isArray(row?.result)?row.result:[];
  const offers=items.filter(item=>!item.bookingPaused).map(item=>({
    amountCents:Math.round(item.amount*100),currency:item.currency==='usd'?'usd':'rub',minimumCents:item.minimumCents,
    bank:String(item.bank||'Банк не указан').replace(/\s+/gu,' ').trim().slice(0,60),
  }));
  const visible=String(values[2])==='1'?offers.filter(preferences.qualifies):offers;
  return {text:preferences.formatRequisitesList(visible,withdrawalError),
    disable_notification:String(values[0])==='1',reply_markup:preferences.keyboard(values)};
}

async function send(chatId,telegram,service,redis){
  let body;
  try{body=await summary(chatId,service,redis);}
  catch{body={text:'Не удалось загрузить реквизиты.',reply_markup:{inline_keyboard:[[{text:'Повторить',callback_data:'rq:page:0'}]]}};}
  return telegram('sendMessage',{chat_id:chatId,...body});
}

async function callback(q,telegram,service,redis){
  const chat=q.message?.chat;
  if(chat?.type!=='private'||chat.id!==q.from?.id)return telegram('answerCallbackQuery',{callback_query_id:q.id});
  const page=/^rq:page:(\d{1,6})$/.exec(q.data),take=/^rq:take:([a-f0-9]{32})$/.exec(q.data);
  try{
    let body;
    if(page)body=await summary(chat.id,service,redis);
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
        if(row.bookingPaused)data.warning='На паузе до 06:00 МСК';
        Object.assign(data,{takeToken:row.takeToken,amount:row.amount.toLocaleString('ru-RU')+(row.currency==='usd'?' $':' ₽'),bank:String(row.bank||'').slice(0,48),number:String(row.number||'').slice(0,90),link:url.href});
      }
    }catch(error){data={error:error.status&&error.status<500?error.message:'Проверьте состояние заявки в кабинете.'};}
  }
  return telegram('answerWidgetQuery',{widget_query_id:query.id,data:JSON.stringify(data)});
}
module.exports={cabinetUrl,publicList,dealUrl,send,answer,callback};
