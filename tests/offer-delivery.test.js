const test=require('node:test');
const assert=require('node:assert/strict');
const {distribute,deliver}=require('../lib/offer-delivery');
test('one unavailable personal chat retries independently and delivered messages are skipped',async()=>{
  const id='published-offer:test',key='poker21:financial-outbox:'+id;
  const db=new Map([[key,JSON.stringify({kind:'published-offer',text:'test'})],['poker21:club-cabinet:access:v1',JSON.stringify({clubs:{c:{owner:'10',staff:['20']}}})]]);
  const call=async commands=>commands.map(([op,k,v,...args])=>{
    if(op==='GET')return db.get(k);
    if(op==='SET'){const old=db.get(k);if(!args.includes('NX')||!old)db.set(k,v);return args.includes('GET')?old:'OK';}
    if(op==='HMGET')return [null,null,null];
    if(op==='EVAL'&&k.includes('DEL'))db.delete(args[0]);
    return 1;
  });
  const jobs=[];
  await distribute(id,[{chat_id:'10'},{chat_id:'20'}],call,async(_,job)=>jobs.push(job));
  const attempts=[];
  const send=async p=>{attempts.push(p.chat_id);return attempts.length===1?{ok:false,error_code:429,parameters:{retry_after:15}}:{ok:true,result:{message_id:42}};};
  await assert.rejects(deliver(jobs[0],call,send),e=>e.retryAfter===15);
  await deliver(jobs[1],call,send);
  await deliver(jobs[0],call,send);
  await deliver(jobs[1],call,send);
  assert.deepEqual(attempts,['10','20','10']);
  assert.ok(db.get(key+':delivered'));
});
