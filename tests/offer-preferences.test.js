const test=require('node:test'),assert=require('node:assert/strict');
const {personalize,handle}=require('../lib/offer-preferences');
test('personal settings apply to new offers including the exact ruble threshold',async()=>{
  const rows=[['1','0','1'],['0','1','0'],[null,null,null]],messages=[1,2,3].map(chat_id=>({chat_id}));
  const send=event=>personalize(event,messages,async()=>rows);
  const result=await send({amountCents:500000,currency:'rub'});
  assert.deepEqual(result.map(p=>[p.chat_id,p.disable_notification]),[[1,true],[3,false]]);
  assert.deepEqual(result[0].reply_markup.inline_keyboard.slice(1).map(r=>r[0].text.slice(0,1)),['✅','☐','✅']);
  const link=result[0].reply_markup.inline_keyboard[0][0];
  assert.equal(link.text,'Посмотреть заявки');
  assert.equal(new URL(link.url).searchParams.get('startapp'),'requisites');
  for(const event of [{amountCents:499999,currency:'rub'},{amountCents:600000,currency:'usd'}])assert.deepEqual((await send(event)).map(p=>p.chat_id),[3]);
  assert.equal((await send({text:'Новая заявка\n5 000 ₽\nБанк'})).length,2);
});
test('buttons set an explicit state for the same private user and edit the original message',async()=>{
  const cb={id:'q',data:'offerpref:off:1',from:{id:10},message:{chat:{type:'private',id:10},message_id:4}};
  const sent=[],telegram=async(method,body)=>{sent.push([method,body]);return {ok:true}};
  await handle(cb,async cmds=>{assert.deepEqual(cmds[0],['HSET','poker21:offer-preferences:10','off','1']);return [{result:1},{result:[null,'1',null]}]},telegram);
  assert.equal(sent[0][1].reply_markup.inline_keyboard[2][0].callback_data,'offerpref:off:0');
  cb.from.id=11;await handle(cb,()=>assert.fail(),telegram);
});

test('manual list reaches active key holders and respects their preferences', async () => {
  const {messages}=require('../lib/financial-outbox');
  const {personalize}=require('../lib/offer-preferences');
  const event={kind:'requisites-list',offers:[
    {amountCents:300000,currency:'rub',bank:'Озон Банк'},
    {amountCents:1000000,currency:'rub',bank:'Т-Банк'},
  ]};
  const audience=messages(event,{
    a:{owner:'111',staff:['222','333']},
    b:{owner:'222',staff:['444']},
    pending:{invites:['555']},
  });
  assert.deepEqual(audience.map(row=>row.chat_id),['111','222','333','444']);
  const results=await personalize(event,audience,async()=>[[0,0,0],[0,0,1],[0,1,0],[1,0,0]]);
  assert.deepEqual(results.map(row=>row.chat_id),['111','222','444']);
  assert.match(results[0].text,/Озон Банк/);
  assert.doesNotMatch(results[1].text,/Озон Банк/);
  assert.match(results[1].text,/Т-Банк/);
  assert.equal(results[2].disable_notification,true);
  assert.match(results[0].reply_markup.inline_keyboard[0][0].url,/startapp=requisites/);
});
