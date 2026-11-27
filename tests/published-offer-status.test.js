const test=require('node:test'),assert=require('node:assert/strict');
const {deliver,statusText}=require('../lib/published-offer-status');
const event={currency:'rub',text:'Новая заявка · GARAGE\n40 000 ₽\nОзонбанк\nПосмотреть реквизиты: /реквизиты'};
test('lifecycle labels reflect the payer, cancellation actor, completion and split remainder',()=>{
  const format=(status,extra={})=>statusText(event,[{status,amountCents:4000000,...extra}]);
  assert.match(format('claimed',{payer:{name:'Клуб А'}}),/Взял клуб «Клуб А»/);
  assert.match(format('confirmed'),/Завершена$/);
  assert.match(format('cancelled'),/Озонбанк\n\n🚫 Снята клубом$/);
  assert.match(format('cancelled',{removedByAdmin:'42'}),/Снята администратором$/);
  assert.match(statusText(event,[{status:'open',amountCents:1000000},{status:'confirmed',amountCents:3000000}]),/Свободна · 10\s000 ₽\n✅ Завершена · 30\s000 ₽/);
});
test('edits only the delivered message and preserves recipient buttons',async()=>{
  const sent=[];
  const call=async cmds=>cmds.map(([op,key])=>{
    if(op==='SMEMBERS')return key.endsWith(':audience')?['10']:[];
    if(op==='HMGET')return ['1','0','0'];
    if(op!=='GET')return 1;
    if(key.endsWith(':recipient:10'))return '123';
    if(key.includes('payment-details:'))return JSON.stringify({status:'cancelled',amountCents:4000000});
    if(key.includes('published-offer:')&&!key.includes('recipient'))return JSON.stringify(event);
    return null;
  });
  await deliver('offer-status:example','1',call,async body=>{sent.push(body);return {ok:true}},()=>['20']);
  assert.equal(sent.length,1);assert.equal(sent[0].message_id,123);assert.equal(sent[0].editOnly,true);
  assert.match(sent[0].text,/Снята клубом/);assert.match(sent[0].reply_markup.inline_keyboard[0][0].text,/✅/);
});

test('partial booking names the payer and the free balance in one line',()=>{
  const parts=[{status:'open',amountCents:2000000},{status:'claimed',amountCents:1500000,payer:{name:'Два Туза'}}];
  const line='Два Туза взяли 15 000 ₽, свободно 20 000 ₽';
  assert.ok(statusText(event,parts).replace(/\u00a0/g,' ').includes(line));
  parts[1].status='paid';
  assert.match(statusText(event,parts),/отметил оплату/);
});

test('confirmed caption names the receiving club and bolds only the status',()=>{
  const text=statusText(event,[{status:'confirmed',amountCents:4000000,owner:{name:'Nuts_and_Bluff'}}]);
  assert.match(text,/✅ Завершена · подтвердил клуб «Nuts_and_Bluff»/);
  const [entity]=require('../lib/published-offer-status').confirmedEntities(text);
  assert.equal(text.slice(entity.offset,entity.offset+entity.length),'Завершена');
});

test('completed split shows the confirmed total for each paying club',()=>{
  const parts=[['Два Туза',1500000],['Два Туза',1000000],['Пентакле',1000000]].map(([name,amountCents])=>({status:'confirmed',payer:{name},owner:{name:'Nuts_and_Bluff'},amountCents}));
  assert.match(statusText(event,parts).replace(/\u00a0/g,' '),/Оплатили:\nДва Туза · 25 000 ₽\nПентакле · 10 000 ₽$/);
});
