const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
test('cabinet settles a claim with a receipt, retry or cancellation using the authenticated group',async()=>{
  const binding=id=>({type:'club',clubId:id,club:id});
  let item={id:'test',status:'claimed',owner:{chatId:'a'},payer:{chatId:'b'},amountCents:100000};
  let file,settlements=0;
  const ctx={
    module:{exports:{}},scanRedisKeys:async()=>['a','b','c'].map(id=>'poker21:telegram-report:club-chat:'+id),
    isMainReportChat:()=>false,getPaymentDetails:async()=>structuredClone(item),
    require:()=>require('../lib/cabinet-receipt'),cabinetReceiptKey:id=>id,
    savePaymentDetails:async(next,_,receipt)=>{item=next;if(receipt)file=receipt;},
    confirmRegisteredPayment:async next=>{settlements++;item={...next,status:'confirmed'};},
    redisPipeline:async(cmds,opts)=>opts.context==='cabinet.receipt.read'?[{result:file}]:cmds.map(c=>({result:JSON.stringify(binding(c[1].slice(-1)))}))
  };
  vm.runInNewContext(source.slice(source.indexOf('module.exports.cabinetRequisites=')),ctx);
  const call=(club,action,extra={})=>ctx.module.exports.cabinetRequisites(club,'tester',{action,item:'test',chatId:club,...extra});
  const receipt='data:application/pdf;base64,'+Buffer.from('%PDF-1.4 mock').toString('base64');
  await assert.rejects(call('c','paid',{receipt}));
  await assert.rejects(call('b','paid',{receipt:'invalid'}));
  await call('b','paid',{receipt});assert.equal(item.status,'paid');
  await assert.rejects(call('c','receipt'));assert.equal((await call('a','receipt')).receipt,receipt);
  await assert.rejects(call('b','confirm'));await call('a','reject');assert.equal(item.status,'claimed');
  await call('b','paid',{receipt});await call('a','confirm');await assert.rejects(call('a','confirm'));
  assert.equal(settlements,1);
  item={...item,status:'claimed'};await call('b','cancel');assert.equal(item.status,'open');assert.equal(item.payer,undefined);
});
