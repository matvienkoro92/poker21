'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),{createRequire}=require('node:module');
const {processDeal}=require('../lib/club-deal-reversal');

test('old commission and later transfer and reset appear before reversal',async()=>{
  const item={id:'old',status:'confirmed',currency:'rub',amountCents:300000,confirmedAt:'2026-09-04T13:00:00Z',
    owner:{type:'club',id:'1',chatId:'a'},payer:{type:'club',id:'2',chatId:'b'},
    balanceOperation:{ownerDeltaCents:-303000,payerDeltaCents:297000}};
  const values=new Map();
  const p='poker21:telegram-report:';
  values.set(p+'payment-details:old',JSON.stringify(item));
  values.set(p+'payment-merge-history:a',[JSON.stringify({timestamp:'2026-09-04T14:00:00Z',rub:{action:'adjust',cents:303000},comment:'Перенос в основной баланс'})]);
  values.set(p+'chat-balance-history:a',[JSON.stringify({timestamp:'2026-09-04T15:00:00Z',rub:{action:'set',cents:0}})]);
  const run=async cmds=>cmds.map(([op,key])=>{
    if(op==='GET')return values.get(key)??null;
    if(op==='LRANGE')return values.get(key)||[];
    if(op==='LINDEX')return values.get(key)?.[0]??null;
    assert.fail('unexpected write');
  });
  const result=await processDeal('old','owner',undefined,run);
  assert.deepEqual(result.sides.map(s=>[s.ledger,s.fee,s.after]),[['Баланс реквизитов',3000,-297000],['Основной баланс',3000,303000]]);
  assert.equal(result.sides[1].resetValue,0);
  values.set(p+'chat-balance:a','500');
  await assert.rejects(processDeal('old','owner',result.revision,run),/изменились/);
});

test('today report separates matching amounts by time and links to their IDs',async()=>{
  const path=require.resolve('../lib/club-team'),load=createRequire(path),module={exports:{}},now=Date.UTC(2026,10,27,12);
  const regular={id:'xyz',confirmedAt:new Date(now).toISOString(),amountCents:300000,currency:'rub',status:'confirmed',payer:{name:'B'},owner:{name:'A'}};
  const {Date:NativeDate}=globalThis;
  class Clock extends NativeDate{static now(){return now}}
  vm.runInNewContext(fs.readFileSync(path,'utf8'),{module,Date:Clock,process:{env:{POKER21_WITHDRAWALS_SYNC_KEY:'test'}},AbortSignal,
    fetch:async()=>({ok:true,json:async()=>({credits:[{id:'abc',confirmedAt:now-60000,clubId:'321',amountCents:300000}]})}),
    require:id=>id==='./redis'?{pipeline:async cmds=>cmds.map(([op])=>({result:op==='LLEN'?1:op==='LRANGE'?['xyz']:[JSON.stringify(regular)]}))}:load(id)});
  assert.equal((await module.exports.todayDeals('1')).length,0);
  const [message]=await module.exports.todayDeals('388008256');
  assert.match(message.text,/14:59.*321/);assert.match(message.text,/15:00.*B → A/);
  assert.match(message.text,/Итого: 6\s000,00 ₽/);
  assert.deepEqual(Array.from(message.reply_markup.inline_keyboard,row=>new URL(row[0].url).searchParams.get('startapp')),['deal_w_owner-abc','deal_history-xyz']);
});
