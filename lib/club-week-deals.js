'use strict';
const {dealUrl}=require('./requisite-widget');
const day=86400000,msk=10800000;
const date=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',day:'2-digit',month:'2-digit',year:'numeric'});
const weekday=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',weekday:'long'});
const clock=new Intl.DateTimeFormat('ru-RU',{timeZone:'Europe/Moscow',hour:'2-digit',minute:'2-digit'});
const money=(cents,currency)=>(cents/100).toLocaleString('ru-RU',{minimumFractionDigits:2})+(currency==='usd'?' $':' ₽');
function messages(items,credits,clubs,now,previous){
  const midnight=Math.floor((now+msk)/day)*day;
  const start=midnight-((new Date(midnight).getUTCDay()+6)%7)*day-msk-(previous?7*day:0);
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
  const parts=[],totals=new Map();
  let lines=[title],buttons=[],count=0;
  function flush(){
    parts.push({text:lines.join('\n'),...(buttons.length?{reply_markup:{inline_keyboard:buttons}}:{})});
    lines=[title];buttons=[];
  }
  for(const [i,rows] of days.entries()){
    const at=start+i*day,label=weekday.format(at)+' · '+date.format(at);
    const heading=label[0].toUpperCase()+label.slice(1);
    if(!rows.length){lines.push('',heading,at>now?'Ещё не наступил':'Сделок нет');continue;}
    let first=true;
    for(const row of rows.sort((a,b)=>a.at-b.at||a.id.localeCompare(b.id))){
      const n=count+1,time=clock.format(row.at);
      const line=n+'. '+time+' · '+row.payer+' → '+row.owner+' · '+money(row.amount,row.currency);
      if(buttons.length>=12||lines.join('\n').length+line.length>3650){flush();first=true;}
      if(first){lines.push('',heading);first=false;}
      lines.push(line);count=n;
      buttons.push([{text:'Открыть сделку №'+n+' · '+time,url:dealUrl(row.id)}]);
      totals.set(row.currency,(totals.get(row.currency)||0)+row.amount);
    }
  }
  lines.push('','Сделок за неделю: '+count);
  if(count)lines.push('Итого: '+[...totals].map(([currency,cents])=>money(cents,currency)).join(' + '));
  flush();return parts;
}
module.exports={messages};
