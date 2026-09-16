const test = require('node:test');
const assert = require('node:assert/strict');
const { run, navigation } = require('../lib/bot-interaction');
const request = data => ({ body: { update_id: 1, callback_query: { id: 'cb', data, message: { chat: { id: 5 }, message_id: 9 } } } });
function response() { return { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }

test('navigation edits current message and retains action buttons and parent', async () => {
  await run(request('pulse:insight:new'), response(), async (_, res) => {
    const next = navigation('sendMessage', { chat_id: 5, text: 'Players', reply_to_message_id: 3, reply_markup: { inline_keyboard: [[{ text: 'action', callback_data: 'action' }]] } });
    assert.equal(next.method, 'editMessageText');
    assert.equal(next.body.message_id, 9);
    assert.equal(next.body.reply_to_message_id, undefined);
    assert.deepEqual(next.body.reply_markup.inline_keyboard.flat().map(b => b.callback_data), ['action', 'pulse:dynamics', 'pulse:menu']);
    assert.equal(navigation('sendMessage', { chat_id: 6, text: 'notification' }).method, 'sendMessage');
    res.json({ ok: true });
  }, async () => assert.fail('unexpected error'));
});

test('financial callbacks do not reroute notifications', async () => {
  await run(request('payreq:confirm:one'), response(), async (_, res) => {
    assert.equal(navigation('sendMessage', { chat_id: 5, text: 'Done' }).method, 'sendMessage');
    res.json({ ok: true });
  }, async () => {});
});

test('analysis and dynamics return to combined analytics menu', async () => {
  for (const data of ['pulse:analysis', 'pulse:dynamics']) {
    await run(request(data), response(), async (_, res) => {
      const next = navigation('editMessageText', { chat_id: 5, message_id: 9, text: 'Analytics', reply_markup: { inline_keyboard: [] } });
      assert.ok(next.body.reply_markup.inline_keyboard.flat().some(button => button.callback_data === 'pulse:analytics'));
      res.json({ ok: true });
    }, async () => assert.fail('unexpected error'));
  }
});

test('exceptions stay out of chat, retain error id in logs response and acknowledge callback', async () => {
  const sent = [];
  const res = response();
  await run(request('pulse:balance'), res, async () => { throw new Error('simulated failure'); }, async (method, body) => { sent.push({ method, body }); return { ok: true }; });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].method, "answerCallbackQuery");
  assert.deepEqual(sent[0].body, { callback_query_id: 'cb' });
  assert.equal(res.code, 200);
  assert.ok(res.body.errorId);
  assert.equal(res.body.ok, false);
});

test('failed send is surfaced instead of silent success', async () => {
  const res = response();
  let notifications = 0;
  await run({ body: { message: { chat: { id: 5 } } } }, res, async (_, result) => result.json({ ok: true, sent: false }), async () => { notifications += 1; return { ok: true }; });
  assert.ok(res.body.errorId);
  assert.equal(res.code, 200);
  assert.equal(res.body.ok, false);
  assert.equal(notifications, 0);
});
