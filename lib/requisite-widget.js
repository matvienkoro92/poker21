'use strict';

function cabinetUrl(){
  const configured=[process.env.TELEGRAM_MINI_APP_LINK,process.env.MINI_APP_URL].find(link=>/^https:\/\/t\.me\//i.test(link||''));
  const url=new URL(configured||'https://t.me/poker21app_bot/start');
  url.searchParams.set('startapp','cabinet');
  return url;
}

const keyPrompt='Подключите ключ клуба, чтобы видеть реквизиты. Запросить ключ можно у @Roman1787443.';

const html=`<style>
body{margin:0;padding:16px;background:var(--tg-theme-bg-color,#fff);color:var(--tg-theme-text-color,#182334);font:15px system-ui}
header,footer,.controls{display:flex;align-items:center;justify-content:space-between;gap:8px}
header span{background:#e3f5ed;color:#12684c;border-radius:16px;padding:5px 10px;font-weight:bold}
small,#status{color:var(--tg-theme-hint-color,#667586)}
article{margin:14px 0;padding:18px;background:#173c54;color:white;border-radius:16px}
strong{display:block;font-size:34px}#bank{margin:4px 0 14px}#number{background:#28536a;color:white;font-size:16px}
button{border:0;padding:9px 12px;border-radius:10px;background:var(--tg-theme-secondary-bg-color,#eef2f5);color:var(--tg-theme-text-color,#182334)}
#pick{width:100%;font-weight:bold;background:var(--tg-theme-button-color,#1785bd);color:var(--tg-theme-button-text-color,#fff);margin-bottom:8px}
#status{font-size:13px;margin:6px 0}
</style><header><span>Реквизиты</span><small id="count"></small></header>
<article><strong id="amount">Загрузка…</strong><p id="bank"></p><button hidden id="number"></button></article>
<button hidden id="pick">Открыть заявку</button>
<footer><button id="refresh">Обновить</button><div class="controls"><button hidden id="prev">‹ Назад</button><button hidden id="next">Далее ›</button></div></footer><p id="status"></p><script>
const el=id=>document.getElementById(id);
let page=0,link='',token='',pending=false;
function load(index){
  if(pending)return;
  pending=true;link='';el('pick').hidden=true;el('status').textContent='Загрузка…';
  TelegramWidget.request('req:'+index).then(answer=>{
    const row=JSON.parse(answer.result);if(row.error)throw Error(row.error);
    page=row.page;link=row.link||'';token=row.takeToken||'';el('pick').textContent=row.keyRequired?'Подключить ключ':token?'Взять реквизит':'Оформить в кабинете';
    el('count').textContent=row.total?(page+1)+' / '+row.total:'';
    el('amount').textContent=row.keyRequired?'Нужен ключ клуба':row.amount||'';el('bank').textContent=row.bank||'';el('number').textContent=row.number||'';el('number').hidden=!row.number;
    el('prev').hidden=page===0;el('next').hidden=page+1>=row.total;
    el('pick').hidden=!link;el('status').textContent=row.warning||(!row.total?'Свободных заявок пока нет.':'');
  }).catch(()=>{el('amount').textContent='Нет данных';el('bank').textContent='';el('number').hidden=true;el('status').textContent='Не удалось обновить реквизиты.';}).finally(()=>{pending=false;});
}
el('prev').onclick=()=>load(Math.max(0,page-1));el('next').onclick=()=>load(page+1);
el('pick').onclick=()=>{
  if(pending)return;
  if(!token){if(link)TelegramWidget.openTelegramLink(link);return;}
  pending=true;
  TelegramWidget.request('take:'+token).then(answer=>{
    const result=JSON.parse(answer.result);
    if(!result.link){el('status').textContent=result.error;return;}
    link=result.link;token='';el('pick').textContent='Перейти к оплате';
    el('status').textContent='Бронь оформлена. После перевода приложите чек в карточке сделки.';
  }).catch(()=>{el('status').textContent='Проверьте бронь в кабинете перед оплатой.';}).finally(()=>{pending=false;});
};
el('number').onclick=()=>{if(!pending&&el('number').textContent)TelegramWidget.copyText(el('number').textContent);};
el('refresh').onclick=()=>load(page);
TelegramWidget.ready();load(0);
</script>`;

function dealUrl(item){
  const url=cabinetUrl();
  url.searchParams.set('startapp','deal_'+item.replace(/^withdrawal:/,'w_'));
  return url.href;
}

async function card(id,index,service){
  const {items,withdrawalError,keyRequired}=await service.widgetOffers(String(id));
  if(keyRequired)return {text:keyPrompt,reply_markup:{inline_keyboard:[[{text:'Подключить ключ',url:cabinetUrl().href}],[{text:'Обновить',callback_data:'rq:page:0'}]]}};
  const page=Math.min(index,Math.max(0,items.length-1)),item=items[page];
  const text=[],keyboard=[];
  if(item){
    text.push('Реквизит '+(page+1)+' из '+items.length,item.amount.toLocaleString('ru-RU')+(item.currency==='usd'?' $':' ₽'),item.bank,item.number);
    keyboard.push([item.takeToken?{text:'Взять реквизит',callback_data:'rq:take:'+item.takeToken}:{text:'Открыть заявку в кабинете',url:dealUrl(item.id)}]);
  }else text.push('Свободных реквизитов пока нет.');
  if(withdrawalError)text.push('Выводы из Депозитов временно недоступны.');
  const nav=[];
  if(page>0)nav.push({text:'‹ Назад',callback_data:'rq:page:'+(page-1)});
  nav.push({text:'Обновить',callback_data:'rq:page:'+page});
  if(page+1<items.length)nav.push({text:'Далее ›',callback_data:'rq:page:'+(page+1)});
  keyboard.push(nav);
  return {text:text.filter(Boolean).join('\n'),reply_markup:{inline_keyboard:keyboard}};
}

async function send(chatId,telegram,service){
  const result=await telegram('sendWidget',{chat_id:chatId,html,allow_queries:true,caption:'Выберите реквизит. Для брони нужен ключ клуба.'});
  if(result.ok)return result;
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
module.exports={send,answer,callback};
