const test = require('node:test');
const assert = require('node:assert/strict');
const { drain, PREFIX, DUE } = require('../lib/financial-outbox');

function fixture() {
  const values = new Map([[PREFIX + 'test', JSON.stringify({ kind: 'merge', id: 'one', transfers: [
    { chatId: 'a', amount: -100, before: 300, after: 200 },
    { chatId: 'b', amount: 90, before: 0, after: 90 },
  ] })]]);
  const due = new Map([['test', 0]]);
  const redis = async commands => commands.map(([cmd, key, ...args]) => {
    let result;
    if (cmd === 'ZRANGEBYSCORE') result = [...due].filter(([, time]) => time <= Number(args[1])).map(([id]) => id);
    else if (cmd === 'GET') result = values.get(key) || null;
    else if (cmd === 'SET') {
      result = args.includes('NX') && values.has(key) ? null : 'OK';
      if (result) values.set(key, args[0]);
    } else if (cmd === 'INCR') { result = Number(values.get(key) || 0) + 1; values.set(key, result); }
    else if (cmd === 'ZADD') { due.set(args[1], Number(args[0])); result = 1; }
    else if (cmd === 'ZREM') { due.delete(args[0]); result = 1; }
    else if (cmd === 'EVAL') { if (values.get(args[1]) === args[2]) values.delete(args[1]); result = 1; }
    else throw new Error(cmd);
    return { result };
  });
  return { redis, values, due };
}

test('retry sends only undelivered recipient and preserves event after failure', async () => {
  const f = fixture();
  const sent = [];
  let clock = 100;
  await drain({ redis: f.redis, now: () => clock, send: async body => {
    sent.push(body.chat_id);
    return body.chat_id === 'a' ? { ok: true, result: { message_id: 1 } } : { ok: false, error_code: 429, parameters: { retry_after: 120 } };
  } });
  assert.deepEqual(sent, ['a', 'b']);
  assert.ok(f.due.get('test') >= 120100);
  clock = 200000;
  await drain({ redis: f.redis, now: () => clock, send: async body => { sent.push(body.chat_id); return { ok: true, result: { message_id: 2 } }; } });
  assert.deepEqual(sent, ['a', 'b', 'b']);
  assert.equal(f.due.size, 0);
  await drain({ redis: f.redis, now: () => clock, send: async () => assert.fail('duplicate') });
  assert.ok(f.values.has(PREFIX + 'test'));
});

test('concurrent workers share lease and cannot send the same event twice', async () => {
  const f = fixture();
  const sent = [];
  const options = { redis: f.redis, now: () => 100, send: async body => { sent.push(body.chat_id); return { ok: true, result: { message_id: sent.length } }; } };
  await Promise.all([drain(options), drain(options)]);
  assert.deepEqual(sent, ['a', 'b']);
});

test('network failure remains queued, never becomes delivered', async () => {
  const f = fixture();
  await drain({ redis: f.redis, now: () => 100, send: async () => { throw new Error('timeout'); } });
  assert.equal(f.values.has(PREFIX + 'test:delivered'), false);
  assert.equal(f.due.size, 1);
});

 test('queued activity summary is cancelled while financial events still deliver', async () => {
  const f = fixture();
  const id = 'weekly:group:2026-08-24';
  f.values.set(PREFIX + id, JSON.stringify({ kind: 'summary', payload: { chat_id: 'group', text: 'activity' } }));
  f.due.set(id, 0);
  const sent = [];
  await drain({ redis: f.redis, now: () => 100, send: async body => {
    sent.push(body.chat_id); return { ok: true, result: { message_id: sent.length } };
  } });
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(f.due.size, 0);
  assert.equal(f.values.get(PREFIX + id + ':cancelled'), '100');
  assert.equal(f.values.has(PREFIX + id + ':delivered'), false);
  assert.ok(f.values.has(PREFIX + id));
});

test('club message goes to the peer admin and its Telegram reply maps to the reservation', async () => {
  const f = fixture();
  const route = {item:'deal-a', clubId:'club-b', chatId:'-200', peer:'-100', session:'booking-a'};
  f.values.set(PREFIX+'test',JSON.stringify({kind:'club-dialog',route,item:route.item,
    message:{club:'Альфа',author:'@ivan',text:'Уточните сумму'}}));
  f.values.set('poker21:club-cabinet:access:v1',JSON.stringify({clubs:{'club-b':{owner:'123'}}}));
  const sent=[];
  await drain({redis:f.redis,now:()=>100,send:async body=>{
    sent.push(body);return {ok:true,result:{message_id:42}};
  }});
  assert.deepEqual(sent.map(x=>x.chat_id),['123']);
  assert.match(sent[0].text,/Альфа · @ivan/);
  assert.equal(sent[0].reply_markup.force_reply,true);
  assert.deepEqual(JSON.parse(f.values.get('poker21:dialog-reply:123:42')),route);
});

test('confirmed withdrawal updates the original paid notification for each recipient',async()=>{
  for(const hasReceipt of [true,false]){
    const f=fixture(),sent=[];
    const paid={kind:'withdrawal-paid',reservationId:'r',club:'ALL FRIENDS PLUS',amountCents:3500000,hasReceipt};
    const daily={kind:'withdrawal-daily',confirmedAt:Date.now(),rows:[{payer:paid.club,amount:paid.amountCents}]};
    const send=async body=>{sent.push(body);return {ok:true,result:{message_id:sent.length}}};
    for(const event of [paid,daily]){
      const id=event.kind+':r';
      f.values.set(PREFIX+id,JSON.stringify(event));
      await drain({redis:f.redis,send,eventId:id});
    }
    const edits=sent.filter(x=>x.message_id);
    assert.equal(edits.length,2);
    for(const edit of edits){
      assert.equal(sent[edit.message_id-1].chat_id,edit.chat_id);
      assert.match(edit[hasReceipt?'caption':'text'],/ALL FRIENDS PLUS.*35[\s\u00a0]000[\s\S]*Сделка завершена/);
      assert.deepEqual(edit.reply_markup.inline_keyboard,[]);
    }
  }
});
