'use strict';
const {createHash}=require('node:crypto');
const prefix='poker21:telegram-report:';
function fail(message,status=409){throw Object.assign(Error(message),{status});}
function eligible(item){
  return item?.status==='confirmed'&&typeof item.id==='string'&&!item.id.startsWith('deposit-')&&!item.reservationId&&
    ['owner','payer'].every(side=>item[side]?.type==='club'&&item[side].chatId&&Number.isSafeInteger(item.balanceOperation?.[side+'DeltaCents']))&&
    String(item.owner.chatId)!==String(item.payer.chatId)&&['rub','usd'].includes(item.currency);
}
async function history(key,run){
  const rows=[];
  for(let offset=0;;offset+=100){
    const [page]=await run([['LRANGE',key,offset,offset+99]]);
    rows.push(...page.map(JSON.parse));
    if(page.length<100)return rows;
  }
}
async function processDeal(id,actor,token,run){
  if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))fail('Некорректный номер сделки.',400);
  const key=prefix+'payment-details:'+id;
  const [raw]=await run([['GET',key]]);
  if(!raw)fail('Сделка не найдена.',404);
  const item=JSON.parse(raw);
  if(item.status==='voided')return {voided:true};
  if(!eligible(item)){
    if(token!==undefined||item.status!=='confirmed')fail('Для этой операции отмена межклубной сделки недоступна.');
    return {id,at:item.confirmedAt,amount:item.amountCents,currency:item.currency==='usd'?'USD':'RUB',
      sides:[item.payer,item.owner].map(p=>({name:p?.name||p?.id||'Клуб'}))};
  }
  const currency=item.currency.toUpperCase(),unit=item.currency;
  const sides=[],guards=[],writes=[];
  for(const side of ['payer','owner']){
    const party=item[side],chat=String(party.chatId);
    const merges=prefix+'payment-merge-history:'+chat,mainHistory=prefix+'chat-balance-history:'+chat;
    const [mergeHead,mainHead]=await run([['LINDEX',merges,0],['LINDEX',mainHistory,0]]);
    guards.push([merges,mergeHead],[mainHistory,mainHead]);
    const since=Date.parse(item.confirmedAt);
    const transfers=(await history(merges,run)).filter(r=>r.comment==='Перенос в основной баланс'&&r[unit]&&Date.parse(r.timestamp)>=since);
    const moved=transfers.length>0;
    const resets=(await history(mainHistory,run)).filter(r=>(r[unit]?.action==='set'||(unit==='rub'&&r.action==='set'))&&Date.parse(r.timestamp)>=since);
    const balance=prefix+(moved?'chat-balance':'payment-balance')+(unit==='usd'?'-usd':'')+':'+chat;
    const [value]=await run([['GET',balance]]);
    const before=Number(value??0),delta=-item.balanceOperation[side+'DeltaCents'],after=before+delta;
    if(!Number.isSafeInteger(before)||!Number.isSafeInteger(after))fail('Некорректное значение баланса.');
    sides.push({name:party.name||String(party.id),ledger:moved?'Основной баланс':'Баланс реквизитов',before,delta,after,
      fee:Math.abs(Math.abs(item.balanceOperation[side+'DeltaCents'])-item.amountCents),
      movedAt:transfers[0]?.timestamp,resetAt:resets[0]?.timestamp,resetValue:resets[0]?.[unit]?.cents??resets[0]?.cents});
    writes.push({balance,value,delta,after,chat,name:party.name,main:moved,history:mainHistory});
  }
  const revision=createHash('sha256').update(JSON.stringify([raw,guards,writes])).digest('hex');
  if(token===undefined)return {id,at:item.confirmedAt,amount:item.amountCents,currency,sides,revision};
  if(token!==revision)fail('Баланс или история изменились. Откройте предпросмотр ещё раз.');
  const now=new Date().toISOString(),pending=prefix+'balance-operations:unrecorded';
  const changes=writes.map(w=>({...w,entry:JSON.stringify({operationId:'void:'+id,type:'club',chatId:w.chat,name:w.name,
    [unit]:{action:'adjust',cents:w.delta},...(unit==='rub'?{cents:w.after}:{usdCents:w.after}),timestamp:now,actor:'Telegram ID '+actor,comment:'Отмена сделки '+id})}));
  const updated={...item,status:'voided',reversal:{at:now,actor,sides}};
  const [ok]=await run([['EVAL',`
    if redis.call('GET',KEYS[1])~=ARGV[1] then return 0 end
    local checks=cjson.decode(ARGV[3])
    for _,v in ipairs(checks) do
      local head=redis.call('LINDEX',v[1],0)
      if (head or cjson.null)~=v[2] then return 0 end
    end
    local changes=cjson.decode(ARGV[4])
    local kind=redis.call('TYPE',KEYS[2]).ok
    if kind~='list' and kind~='none' then return 0 end
    for _,w in ipairs(changes) do
      if (redis.call('GET',w.balance) or cjson.null)~=w.value then return 0 end
    end
    for _,w in ipairs(changes) do
      redis.call('SET',w.balance,string.format('%.0f',w.after))
      if w.main then
        redis.call('LPUSH',w.history,w.entry)
        redis.call('LPUSH',KEYS[2],w.entry)
      end
    end
    redis.call('SET',KEYS[1],ARGV[2]);return 1`,2,key,pending,raw,JSON.stringify(updated),JSON.stringify(guards),JSON.stringify(changes)]]);
  if(!Number(ok))fail('Данные изменились. Откройте предпросмотр ещё раз.');
  return {voided:true};
}
module.exports={eligible,processDeal};
