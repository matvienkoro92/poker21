'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {create,parseLimit,matches} = require('../lib/table-subscriptions');
const base = {deskId:'1',deskName:'Классика',leagueId:'184691',unionId:'7158',groupId:'680649',playType:'PLO6',blindAnnotation:'5/10',playerCount:2,pos:{pos1:123,pos2:456}};
function fixture() {
  const db = new Map(), sets = new Map(), calls = [], commandsLog = [];
  let tables = [], fail = false, deliveryFail = false;
  const redis = {isConfigured:()=>true,pipeline:async commands=>commands.map(([cmd,key,...args])=>{
    commandsLog.push([cmd,key,...args]);
    let result = null;
    if (cmd === 'GET') result = db.get(key)||null;
    else if (cmd === 'SET') { if (!(args.includes('NX') && db.has(key))) {db.set(key,args[0]); result='OK';} }
    else if (cmd === 'DEL') result = Number(db.delete(key));
    else if (cmd === 'SADD') {const s=sets.get(key)||new Set();s.add(args[0]);sets.set(key,s);result=1;}
    else if (cmd === 'SREM') result = Number(sets.get(key)?.delete(args[0]));
    else if (cmd === 'SSCAN') result = ['0',[...(sets.get(key)||[])]];
    else if (cmd === 'EVAL') {const [,lock,token]=args;result=db.get(lock)===token ? Number(db.delete(lock)) : 0;}
    else throw new Error(cmd);
    return {result};
  })};
  const service = create({redis,namespace:'test',getTables:async()=>{if(fail)throw Error('upstream');return structuredClone(tables);},getNames:async()=>new Map([['123','Ник <&>']]),send:async(method,body)=>{calls.push({method,body});if(deliveryFail && method==='sendMessage')return {ok:false,error_code:500};return {ok:true,result:{username:'TestBot'}};}});
  const callback = (action,user=42,type='private') => service.handle({callback_query:{id:'cb',data:'club:sub:'+action,from:{id:user},message:{message_id:1,chat:{id:type==='private'?user:-1,type}}}});
  const message = (text,user=42) => service.handle({message:{text,from:{id:user},chat:{id:user,type:'private'}}});
  return {service,callback,message,calls,db,commandsLog,setTables:v=>tables=v,setFailure:v=>fail=v,setDeliveryFailure:v=>deliveryFail=v};
}
test('game and limits distinguish exact, minimum, malformed values and private scopes',()=>{
  assert.deepEqual(parseLimit('5/10р'),{small:5,big:10});
  assert.deepEqual(parseLimit('0,5 / 1'),{small:0.5,big:1});
  assert.equal(parseLimit('-5/10'),null);assert.equal(parseLimit('10/5'),null);
  const exact={kind:'game',game:'PLO6',mode:'exact',limit:{small:5,big:10}};
  const rows=[base,{...base,deskId:'2',blindAnnotation:'25/50'},{...base,leagueId:'111'},{...base,playType:'MTT PLO6'},{...base,playerCount:0}];
  assert.equal(matches(exact,rows).length,1);
  assert.equal(matches({...exact,mode:'from'},rows).length,2);
  assert.equal(matches({kind:'player',playerId:'123'},rows).length,3);
});
test('subscribe baseline, game activation, no duplicates, departures and reactivation',async()=>{
  const f=fixture();f.setTables([base]);
  await f.callback('add:PLO6:any');f.calls.length=0;
  await f.service.poll();assert.equal(f.calls.length,0);
  f.setTables([base,{...base,deskId:'2'}]);await f.service.poll();
  assert.equal(f.calls.filter(c=>c.method==='sendMessage').length,1);
  await f.service.poll();assert.equal(f.calls.filter(c=>c.method==='sendMessage').length,1);
  f.setTables([base]);await f.service.poll();f.setTables([base,{...base,deskId:'2'}]);await f.service.poll();
  assert.equal(f.calls.filter(c=>c.method==='sendMessage').length,2);
});
test('player search uses exact ID, tracks new seating, escapes names, deletion isolates owners',async()=>{
  const f=fixture();await f.callback('player');await f.message('Ник');
  assert.ok(f.calls.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data.endsWith('123'));
  await f.callback('player:123');f.calls.length=0;
  f.setTables([base]);await f.service.poll();
  assert.match(f.calls[0].body.text,/Ник &lt;&amp;&gt;/);
  f.setTables([{...base,pos:{pos2:456}}]);await f.service.poll();f.setTables([base]);await f.service.poll();
  assert.equal(f.calls.length,2);
  const saved=JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42'));
  await f.callback('delete:'+saved[0].id,43);
  assert.equal(JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42')).length,1);
  await f.callback('delete:'+saved[0].id);assert.equal(JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42')).length,0);
});
test('upstream failures preserve previous seating and group entry only links to private bot',async()=>{
  const f=fixture();await f.callback('menu',42,'supergroup');
  assert.equal(f.db.size,0);assert.match(f.calls.at(-1).body.reply_markup.inline_keyboard[0][0].url,/TestBot\?start=tablesub/);
  f.setTables([base]);await f.callback('add:PLO6:any');const before=f.db.get('poker21:table-subscriptions:test:user:42');
  f.setFailure(true);await assert.rejects(f.service.poll(),/upstream/);assert.equal(f.db.get('poker21:table-subscriptions:test:user:42'),before);
});
test('private limit input is saved and existing identical subscriptions do not multiply',async()=>{
  const f=fixture();await f.callback('limit:NLH:from');await f.message('25/50');
  await f.callback('limit:NLH:from');await f.message('25/50');
  const subs=JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42'));
  assert.equal(subs.length,1);assert.deepEqual(subs[0].limit,{small:25,big:50});
  assert.equal(await f.message('/unrelated'),false);
});

test('large notification batches resume without starving later subscribers or repeating sends',async()=>{
  const f=fixture();await f.callback('add:PLO6:any',42);await f.callback('add:PLO6:any',43);
  f.calls.length=0;
  f.setTables(Array.from({length:35},(_,i)=>({...base,deskId:String(i)})));
  for(let i=0;i<3;i++)await f.service.poll();
  const sent=f.calls.filter(c=>c.method==='sendMessage');
  assert.equal(sent.filter(c=>c.body.chat_id==='42').length,35);
  assert.equal(sent.filter(c=>c.body.chat_id==='43').length,35);
});


test('failed Telegram delivery keeps the event retryable',async()=>{
  const f=fixture();await f.callback('add:PLO6:any');f.calls.length=0;
  f.setTables([base]);f.setDeliveryFailure(true);
  await assert.rejects(f.service.poll(),/Telegram delivery failed/);
  assert.deepEqual(JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42'))[0].seen,[]);
  f.setDeliveryFailure(false);await f.service.poll();
  assert.equal(JSON.parse(f.db.get('poker21:table-subscriptions:test:user:42'))[0].seen.length,1);
  const count=f.calls.length;await f.service.poll();assert.equal(f.calls.length,count);
});

test('notification endpoint rejects an incorrect cron secret',async t=>{
  const old=process.env.CRON_SECRET;process.env.CRON_SECRET='expected';
  t.after(()=>{if(old===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=old;});
  const handler=require('../lib/api-handlers/cron-table-subscriptions');
  const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
  await handler({method:'POST',headers:{authorization:'Bearer wrong'}},res);
  assert.equal(res.code,403);
});


test('unchanged seating and reordered API rows cause no subscription writes; new seating writes once',async()=>{
  const f=fixture();const second={...base,deskId:'2'};
  f.setTables([base,second]);await f.callback('add:PLO6:any');f.commandsLog.length=0;
  f.setTables([second,base]);await f.service.poll();await f.service.poll();
  const userWrites=()=>f.commandsLog.filter(([cmd,key])=>cmd==='SET'&&key==='poker21:table-subscriptions:test:user:42');
  assert.equal(userWrites().length,0);
  assert.equal(f.commandsLog.filter(([cmd])=>cmd==='SADD'||cmd==='SREM').length,0);
  f.setTables([base,second,{...base,deskId:'3'}]);await f.service.poll();
  assert.equal(userWrites().length,1);
  f.setTables([base,second]);await f.service.poll();assert.equal(userWrites().length,2);
  await f.service.poll();assert.equal(userWrites().length,2);
});

test('shared snapshot avoids fetching tables and confirms whether the user batch is complete',async()=>{
  const f=fixture();await f.callback('add:PLO6:any');f.setFailure(true);
  const result=await f.service.poll([base]);assert.equal(result.complete,true);assert.equal(result.sent,1);
  const marker=f.commandsLog.find(([cmd,key])=>cmd==='SET'&&key.includes(':delivery:'));
  assert.equal(marker.at(-1),'86400');
});
