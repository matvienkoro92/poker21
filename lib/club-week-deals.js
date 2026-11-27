'use strict';
const {dealUrl}=require('./requisite-widget');
const day=86400000,msk=10800000;
const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'});
const weekday=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',weekday:'long'});
const clock=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
const money=(cents,currency)=>(cents/100).toLocaleString('ru-RU',{minimumFractionDigits:2})+(currency==='usd'?' $':' ₽');
const byTime=(a,b)=>a.at-b.at||a.id.localeCompare(b.id);
const dealLine=(row,index)=>(index+1)+'. '+clock.format(row.at)+' · '+row.payer+' → '+row.owner+' · '+money(row.amount,row.currency);
const formatTotals=totals=>[...totals].map(([currency,cents])=>money(cents,currency)).join(' + ');
function addTotal(totals,row){
  totals.set(row.currency,(totals.get(row.currency)||0)+row.amount);
}
function weekStart(now,previous){
  const midnight=Math.floor((now+msk)/day)*day;
  return midnight-((new Date(midnight).getUTCDay()+6)%7)*day-msk-(previous?7*day:0);
}
function messages(items,credits,clubs,now,previous,selection){
  const start=selection?.start ?? weekStart(now,previous);
  if(!Number.isSafeInteger(start)||start<0||start>weekStart(now,false)||weekStart(start,false)!==start)return [];
  const days=Array.from({length:7},()=>[]);
  function add(at,row){
    const index=Math.floor((at-start)/day);
    if(days[index]&&at<=now)days[index].push({...row,at});
  }
  const mirrors=new Set();
  for(const c of credits){
    const at=Number(c.confirmedAt);
    const stamp=new Date(at+msk).toISOString().slice(0,10).replace(/-/g,'');
    mirrors.add('deposit-'+c.id);
    mirrors.add('deposit-'+stamp+'-758417-'+c.clubId+'-'+String(c.amountCents/100));
    add(at,{id:'withdrawal:owner-'+c.id,payer:clubs.get(String(c.clubId))||String(c.clubId),owner:'Два туза',amount:c.amountCents,currency:'rub'});
  }
  for(const x of items){
    if(x.status==='confirmed'&&!mirrors.has(x.id))add(Date.parse(x.confirmedAt),{id:'history-'+x.id,payer:x.payer.name,owner:x.owner.name,amount:x.amountCents,currency:x.currency||'rub'});
  }
  const title='Сделки · '+date.format(start)+' — '+date.format(start+6*day)+' · МСК';
  const callback=(view)=>'weekdeals:'+start+':'+view;
  if(selection?.day == null){
    const totals=new Map();
    const summaries=[];
    const details=[];
    const buttons=days.map((rows,i)=>{
      const at=start+i*day,name=weekday.format(at);
      const heading=date.format(at)+' · '+name;
      const dailyTotals=new Map();
      for(const row of rows){
        addTotal(totals,row);
        addTotal(dailyTotals,row);
      }
      const summary=heading+' · '+(at>now?'ещё не наступил':rows.length?rows.length+' · '+formatTotals(dailyTotals):'сделок нет');
      summaries.push(summary);
      details.push([summary,...rows.sort(byTime).map(dealLine)].join('\n'));
      return [{text:'Сделки '+name,callback_data:callback(i+':0')}];
    });
    const count=days.reduce((sum,rows)=>sum+rows.length,0);
    const footer='Сделок за неделю: '+count+(count?'\nИтого: '+formatTotals(totals):'');
    const expanded=[title,...details,footer].join('\n\n');
    const compact=[title,summaries.join('\n'),footer,'Полный список сделок доступен по кнопкам дней.'].join('\n\n');
    return [{text:expanded.length<=4096?expanded:compact,reply_markup:{inline_keyboard:buttons}}];
  }
  const i=selection.day,at=start+i*day;
  const rows=days[i].sort(byTime);
  const label=weekday.format(at);
  const heading='Сделки · '+label+' · '+date.format(at)+' · МСК';
  const pages=[{lines:[heading,''],buttons:[]}];
  for(const [index,row] of rows.entries()){
    const n=index+1,time=clock.format(row.at);
    const line=dealLine(row,index);
    let current=pages[pages.length-1];
    if(current.buttons.length>=12||current.lines.join('\n').length+line.length>3650){
      current={lines:[heading,''],buttons:[]};
      pages.push(current);
    }
    current.lines.push(line);
    current.buttons.push([{text:'Открыть сделку №'+n+' · '+time,url:dealUrl(row.id)}]);
  }
  const page=Math.min(selection.page,pages.length-1);
  const {lines,buttons}=pages[page];
  if(!rows.length)lines.push(at>now?'День ещё не наступил':'Сделок нет');
  if(pages.length>1){
    const navigation=[];
    if(page>0)navigation.push({text:'‹ Назад',callback_data:callback(i+':'+(page-1))});
    if(page+1<pages.length)navigation.push({text:'Дальше ›',callback_data:callback(i+':'+(page+1))});
    buttons.push(navigation);
    lines.push('','Страница '+(page+1)+' из '+pages.length);
  }
  buttons.push([{text:'‹ К неделе',callback_data:callback('week')}]);
  return [{text:lines.join('\n'),reply_markup:{inline_keyboard:buttons}}];
}
module.exports={messages};
