const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {requisiteCount}=require('../lib/pulse-balance-menu');
test('count changes on publish, claim, cancellation and confirmation by viewer',()=>{
  const row={status:'open',owner:{chatId:'owner'},payer:{chatId:'payer'}};
  assert.equal(requisiteCount([row],'other'),1);
  row.status='claimed';
  assert.equal(requisiteCount([row],'other'),0);
  assert.equal(requisiteCount([row],'owner'),1);
  assert.equal(requisiteCount([row],'payer'),1);
  row.claimedAt=new Date(Date.now()-16*60000).toISOString();
  assert.equal(requisiteCount([row],'other'),1);
  row.status='paid';
  assert.equal(requisiteCount([row],'other'),0);
  for (const status of ['confirmed','cancelled']) { row.status=status; assert.equal(requisiteCount([row],'owner'),0); }
});
test('multiple changes in one request refresh all tracked menus once',async()=>{
  let scans=0; const sent=[];
  const ctx={module:{exports:{}},console,require:name=>name==='node:async_hooks'?require(name):{
    isConfigured:()=>true,pipeline:async commands=>{
      const c=commands[0];
      if(c[0]==='LRANGE')return [{result:['1']}];
      if(c[0]==='SCAN'){scans++;return [{result:['0',['poker21:telegram-report:pulse-menu:a','poker21:telegram-report:pulse-menu:b']]}];}
      if(c[0]==='EVAL')return [{result:1}];
      if(c[1]==='poker21:telegram-report:payment-details:1')return [{result:JSON.stringify({status:'open'})}];
      return [{result:JSON.stringify({messageId:9,markup:{inline_keyboard:[[{text:'Реквизиты — 9',callback_data:'paymenu:list',style:'success'}]]}})},{result:'0'},{result:null},{result:'0'},{result:null}];
    }
  }};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../lib/pulse-balance-menu'),'utf8'),ctx);
  const api=ctx.module.exports;
  await api.withRequisiteUpdates(async()=>{api.markRequisitesChanged();api.markRequisitesChanged();},async(method,body)=>{sent.push({method,body});return {ok:true};});
  assert.equal(scans,1);assert.equal(sent.length,2);
  for(const s of sent){assert.equal(s.method,'editMessageReplyMarkup');assert.equal(s.body.message_id,9);assert.match(s.body.reply_markup.inline_keyboard[0][0].text,/— 1,/);}
});
