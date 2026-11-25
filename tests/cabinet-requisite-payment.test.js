const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
test('cabinet settles a claim with a receipt, retry or cancellation using the authenticated group',async()=>{
  const binding=id=>({type:'club',clubId:id,club:id});
  let item={id:'test',status:'claimed',owner:{id:'a',chatId:'a'},payer:{id:'b',chatId:'b'},amountCents:100000};
  let notice,file,settlements=0;const reminders=[];
  const ctx={
    paymentDetailsKey:id=>id,originalPayment:{get:()=>JSON.stringify(item)},formatPaymentAmount:()=>'1000 ₽',
    notifyPaymentAdmin:async party=>{reminders.push(party.id);return true;},
    telegram:async(method,data)=>{reminders.push(data.chat_id);return {ok:true};},
    module:{exports:{}},scanRedisKeys:async()=>['a','b','c'].map(id=>'poker21:telegram-report:club-chat:'+id),
    isMainReportChat:()=>false,getPaymentDetails:async()=>structuredClone(item),
    require:()=>require('../lib/cabinet-receipt'),cabinetReceiptKey:id=>id,
    drainFinancialOutbox:async()=>{},
    savePaymentDetails:async(next,_,receipt,event)=>{if(event)notice=event;item=next;if(receipt)file=receipt;},
    confirmRegisteredPayment:async next=>{settlements++;item={...next,status:'confirmed'};},
    redisPipeline:async(cmds,opts)=>opts.context==='cabinet.receipt.exists'?[{result:file?1:0}]:opts.context==='cabinet.payment-reminder'?[{result:1}]:opts.context==='cabinet.receipt.read'?[{result:file}]:cmds.map(c=>({result:JSON.stringify(binding(c[1].slice(-1)))}))
  };
  vm.runInNewContext(source.slice(source.indexOf('module.exports.cabinetRequisites=')),ctx);
  const call=(club,action,extra={})=>ctx.module.exports.cabinetRequisites(club,'tester',{action,item:'test',chatId:club,...extra});
  const receipt='data:application/pdf;base64,'+Buffer.from('%PDF-1.4 mock').toString('base64');
  await assert.rejects(call('c','paid',{receipt}));
  await assert.rejects(call('b','paid',{receipt:'invalid'}));
  await call('b','paid',{receipt});assert.equal(item.status,'paid');
  await assert.rejects(call('c','receipt'));assert.equal((await call('a','receipt')).receipt,receipt);
  await assert.rejects(call('c','remind'));await assert.rejects(call('a','remind'));await call('b','remind');assert.deepEqual(reminders,['a']);
  await assert.rejects(call('b','confirm'));await call('a','reject');assert.equal(item.status,'claimed');
  const payloads=require('../lib/financial-outbox').messages(notice,{b:{owner:'222'}});
  assert.deepEqual(payloads.map(p=>p.chat_id),['222']);assert.match(payloads[0].text,/платёж на 1000 ₽ не поступил/);
  await assert.rejects(call('a','reject'));
  await assert.rejects(call('a','recheck'));await assert.rejects(call('c','recheck'));
  await call('b','recheck');assert.equal(item.status,'paid');assert.equal((await call('a','receipt')).receipt,receipt);
  assert.equal(notice.kind,'payment-recheck');assert.equal(notice.clubId,'a');await assert.rejects(call('b','recheck'));
  await call('a','confirm');await assert.rejects(call('a','confirm'));
  await assert.rejects(call('b','remind'));assert.equal(settlements,1);
  item={...item,status:'claimed'};await call('b','cancel');assert.equal(item.status,'open');assert.equal(item.payer,undefined);
});
