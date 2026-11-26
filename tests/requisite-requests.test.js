const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {messages,PREFIX}=require('../lib/financial-outbox');
const {personalize}=require('../lib/offer-preferences');

test('request reaches eligible users with preferences and a private reply reaches the requester',async()=>{
  const clubs={a:{owner:'10',staff:[]},b:{owner:'20',staff:[]}};
  const store=new Map([['poker21:club-cabinet:access:v1',JSON.stringify({clubs})]]);
  const dispatched=[],sent=[],module={exports:{}};
  const redis={pipeline:async cmds=>cmds.map(([op,key,...args])=>{
    if(op==='EVAL'){store.set(args[1],args[3]);return {result:1};}
    if(op==='SET')store.set(key,args[0]);
    return {result:store.get(key)};
  })};
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/requisite-requests'),'utf8'),{module,
    require:id=>id==='./redis'?redis:id==='./published-offer'?{dispatch:async id=>dispatched.push(id)}:id==='./financial-outbox'?require('../lib/financial-outbox'):require(id)});
  const service=module.exports, telegram=async(method,body)=>{sent.push([method,body]);return {ok:true,result:{message_id:77}}};
  await service.create({amount:'5000',bank:'Банк',comment:'Можно двумя переводами',requestId:'a'.repeat(36)},'a','Клуб А','10');
  const request=JSON.parse(store.get(PREFIX+dispatched[0]));
  const [notification]=await personalize(request,messages(request,clubs),async()=>[['1','0','1']]);
  assert.equal(notification.chat_id,'20');assert.equal(notification.disable_notification,true);
  assert.match(notification.text,/Комментарий: Можно двумя переводами/);
  await assert.rejects(service.create({amount:'5000',requestId:'a'.repeat(36),comment:'а'.repeat(501)},'a','Клуб А','10'),/500/);
  const action=notification.reply_markup.inline_keyboard[0][0];
  assert.equal(action.text,'Предложить реквизиты');
  const chat={id:20,type:'private'},from={id:20};
  await service.handle({callback_query:{id:'q',data:action.callback_data,message:{chat},from}},telegram);
  assert.equal(sent.at(-1)[1].reply_markup.force_reply,true);
  await service.handle({message:{message_id:78,reply_to_message:{message_id:77},text:'Тестовые реквизиты',chat,from}},telegram);
  const proposal=JSON.parse(store.get(PREFIX+dispatched[1]));
  assert.deepEqual(messages(proposal,clubs).map(p=>p.chat_id),['10']);
  assert.match(proposal.text,/Тестовые реквизиты/);
});
