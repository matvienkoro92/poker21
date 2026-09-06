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

function registryHarness() {
  const store=new Map(),sent=[];
  const pipeline=async commands=>commands.map(([cmd,...args])=>{
    if(cmd==='GET')return {result:store.get(args[0])||null};
    if(cmd==='SET'){store.set(args[0],args[1]);return {result:'OK'};}
    if(cmd==='EVAL'){
      const [script,,key,expected,value]=args;
      const stored=store.get(key);
      if(script.includes('cjson.decode')){if(stored&&String(JSON.parse(stored).messageId)===expected)store.delete(key);}
      else if(stored===expected){if(value)store.set(key,value);else store.delete(key);}
      return {result:1};
    }
    throw Error(`Unexpected ${cmd}`);
  });
  const ctx={module:{exports:{}},console,require:name=>name==='node:async_hooks'?require(name):{isConfigured:()=>true,pipeline}};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../lib/pulse-balance-menu'),'utf8'),ctx);
  const telegram=async(method,body)=>{sent.push({method,body});return {ok:true};};
  return {api:ctx.module.exports,store,sent,telegram};
}
const registryPayload=text=>({chat_id:'a',text,parse_mode:'HTML',reply_markup:{inline_keyboard:[[
  {text:'Разместить',callback_data:'paymenu:place'},{text:'Убрать',callback_data:'paymenu:remove'}
]]}});

test('open registry edits the same message only when actual contents change',async()=>{
  const {api,sent,telegram}=registryHarness();
  await api.trackMenu('sendMessage',registryPayload('Нет заявок'),{ok:true,result:{message_id:7}});
  await api.refreshMenu('a',telegram,[],async()=>registryPayload('Нет заявок'));
  assert.equal(sent.length,0);
  await api.refreshMenu('a',telegram,[],async()=>registryPayload('Новая заявка; доступно 900'));
  assert.equal(sent.length,1);assert.equal(sent[0].method,'editMessageText');assert.equal(sent[0].body.message_id,7);
  await api.refreshMenu('a',telegram,[],async()=>registryPayload('Новая заявка; доступно 900'));
  assert.equal(sent.length,1);
  await api.refreshMenu('a',telegram,[],async()=>registryPayload('Нет заявок; доступно 1000'));
  assert.equal(sent.length,2);
});

test('navigation during rendering and deleted messages do not get overwritten',async()=>{
  const {api,sent,telegram,store}=registryHarness();
  await api.trackMenu('editMessageText',{...registryPayload('Нет заявок'),message_id:7},{ok:true});
  await api.refreshMenu('a',telegram,[],async()=>{
    await api.trackMenu('editMessageText',{chat_id:'a',message_id:7,text:'Ввод суммы',reply_markup:{inline_keyboard:[]}},{ok:true});
    return registryPayload('Новая заявка');
  });
  assert.equal(sent.length,0);
  await api.trackMenu('editMessageText',{...registryPayload('Нет заявок'),message_id:8},{ok:true});
  await api.refreshMenu('a',async()=>({ok:false,description:'Bad Request: message to edit not found'}),[],async()=>registryPayload('Новая заявка'));
  assert.equal(store.size,0);
});

test('opening unchanged registry still registers it for future events',async()=>{
  const {api,sent,telegram}=registryHarness();
  await api.trackMenu('editMessageText',{...registryPayload('Нет заявок'),message_id:9},{ok:false,description:'Bad Request: message is not modified'});
  await api.refreshMenu('a',telegram,[],async()=>registryPayload('Баланс изменился'));
  assert.equal(sent.length,1);assert.equal(sent[0].body.message_id,9);
});
