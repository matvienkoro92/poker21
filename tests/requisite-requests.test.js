const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {messages,PREFIX}=require('../lib/financial-outbox');
const {personalize}=require('../lib/offer-preferences');

test('request reaches eligible users with preferences and a private reply reaches the requester',async()=>{
  const clubs={a:{owner:'10',staff:[]},b:{owner:'20',staff:[]}};
  const store=new Map([['poker21:club-cabinet:access:v1',JSON.stringify({clubs})]]);
  const dispatched=[],sent=[],active=new Set(),module={exports:{}};
  const redis={pipeline:async cmds=>cmds.map(([op,key,...args])=>{
    if(op==='EVAL'){
      const [count,...params]=args,keys=params.slice(0,count),values=params.slice(count);
      if(key.includes("redis.call('ZREM',KEYS[2],raw)")){
        const raw=store.get(keys[0]),request=JSON.parse(raw||'null');
        if(!request||request.author!==values[0]||request.clubId!==values[1])return {result:0};
        if(!request.cancelledAt){
          active.delete(raw);
          store.set(keys[0],JSON.stringify({...request,cancelledAt:values[3]}));
        }
        return {result:1};
      }
      const prior=JSON.parse(store.get(keys[0])||'null');
      if(prior?.cancelledAt)return {result:2};
      store.set(keys[0],values[0]);
      if(JSON.parse(values[0]).expiresAt)active.add(values[0]);
      return {result:1};
    }
    if(op==='ZRANGEBYSCORE')return {result:[...active]};
    if(op==='SET')store.set(key,args[0]);
    return {result:store.get(key)};
  })};
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/requisite-requests'),'utf8'),{module,
    require:id=>id==='./redis'?redis:id==='./published-offer'?{dispatch:async id=>dispatched.push(id)}:id==='./financial-outbox'?require('../lib/financial-outbox'):require(id)});
  const service=module.exports, telegram=async(method,body)=>{sent.push([method,body]);return {ok:true,result:{message_id:77}}};
  await service.create({durationMinutes:'360',amount:'5000',bank:'Банк',comment:'Можно двумя переводами',requestId:'a'.repeat(36)},'a','Клуб А','10');
  for(const durationMinutes of [undefined,0,361,0.5])await assert.rejects(service.create({amount:'1',requestId:'a'.repeat(36),durationMinutes},'a','Клуб А','10'),/360/);
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
  store.set(PREFIX+dispatched[0],JSON.stringify({...request,expiresAt:Date.now()-1}));
  await service.handle({message:{message_id:79,reply_to_message:{message_id:77},text:'Поздний ответ',chat,from}},telegram);
  assert.equal(sent.at(-1)[1].text,'Запрос недоступен.');
  assert.equal(dispatched.length,2);
  store.set(PREFIX+dispatched[0],JSON.stringify(request));
  assert.equal((await service.list('a','10'))[0].deleteToken,request.token);
  assert.equal((await service.list('a','11'))[0].deleteToken,undefined);
  await assert.rejects(service.remove(request.token,'a','11'),{status:404});
  await assert.rejects(service.remove(request.token,'b','10'),{status:404});
  assert.equal((await service.remove(request.token,'a','10')).ok,true);
  assert.equal((await service.remove(request.token,'a','10')).ok,true);
  assert.equal((await service.list('a','10')).length,0);
  await service.handle({message:{message_id:80,reply_to_message:{message_id:77},text:'Ответ после удаления',chat,from}},telegram);
  assert.equal(sent.at(-1)[1].text,'Запрос недоступен.');
  await service.create({durationMinutes:'360',amount:'5000',bank:'Банк',comment:'Можно двумя переводами',requestId:'a'.repeat(36)},'a','Клуб А','10');
  assert.equal(dispatched.length,2);
});
