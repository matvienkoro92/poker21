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
