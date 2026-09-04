const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');

test('requisite non-text input ignores service events including pin notifications', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function isNonTextPlacementInput('), source.indexOf('function paymentDetailsFormText(')), context);
  const base = { chat: { id: -123 }, from: { id: 42 } };
  for (const event of [{ pinned_message: { text: 'Реквизиты', photo: [{}] } }, { new_chat_members: [{}] }, { left_chat_member: {} }, { new_chat_title: 'Test' }, {}]) {
    assert.equal(context.isNonTextPlacementInput({ ...base, ...event }), false);
  }
  assert.equal(context.isNonTextPlacementInput({ ...base, photo: [{}] }), true);
  assert.equal(context.isNonTextPlacementInput({ ...base, voice: {} }), true);
  assert.equal(context.isNonTextPlacementInput({ ...base, text: '5000' }), false);
});

test('dynamics subpages have back navigation to dynamics, not only main menu', async () => {
  const calls = [];
  const context = vm.createContext({
    insightPlayers: () => ({ periods: [], rows: [] }),
    escapeTelegramHtml: String, displayIso: String,
    telegram: async (_, body) => { calls.push(body); return { ok: true }; },
  });
  vm.runInContext(source.slice(source.indexOf('function pulseKeyboard('), source.indexOf('function pulseMainKeyboard(')), context);
  for (const mode of ['week', 'month']) {
    assert.ok(context.pulseKeyboard(mode).inline_keyboard.flat().some(b => b.callback_data === 'pulse:dynamics'));
  }
  assert.ok(!context.pulseKeyboard('').inline_keyboard.flat().some(b => b.callback_data === 'pulse:dynamics'));
  vm.runInContext(source.slice(source.indexOf('async function sendInsightPlayers('), source.indexOf('function insightPulseMetrics(')), context);
  for (const kind of ['new', 'sleeping', 'sleeping2', 'returned', 'stable']) {
    await context.sendInsightPlayers('chat', { type: 'club', club: 'Test' }, kind, 123, true);
    assert.equal(calls.at(-1).message_id, 123);
    assert.equal(calls.at(-1).reply_markup.inline_keyboard[0][0].callback_data, 'pulse:dynamics');
  }
});

test('legacy search saves its first result ID and reuses it on the next query', async () => {
  let state = '1';
  const context = vm.createContext({
    isRedisConfigured: () => true,
    telegram: async () => ({ ok: true, result: { message_id: 987 } }),
    redisPipeline: async ([args]) => {
      if (args[0] === 'SET') {
        assert.deepEqual(Array.from(args.slice(3)), ['XX', 'KEEPTTL']);
        state = args[2];
      }
      return [{ result: state }];
    },
  });
  vm.runInContext(source.slice(source.indexOf('function playerSearchPendingKey('), source.indexOf('function paymentDetailsPlacementKey(')), context);
  const message = { text: 'Nick', chat: { id: 'chat' }, from: { id: 'user' } };
  assert.equal(await context.acceptsPlayerSearchMessage(message), true);
  assert.equal(message.playerSearchMessageId, 0);
  await context.playerSearchSender(message)('sendMessage', {});
  const next = { ...message, text: 'Next' };
  assert.equal(await context.acceptsPlayerSearchMessage(next), true);
  assert.equal(next.playerSearchMessageId, 987);
});

test('club and union search edit the same message for found, missing and ambiguous results', async () => {
  for (const type of ['Club', 'Union']) {
    for (const count of [0, 1, 2]) {
      const calls = [];
      const players = Array.from({ length: count }, (_, i) => ({ id: String(i), playerId: String(i), nick: 'Nick' }));
      const context = vm.createContext({
        latestUnionData: {}, boundClubData: () => ({ playerRows: players }),
        lookupScore: () => 0, escapeTelegramHtml: String, displayIso: String, formatRake: String,
        telegram: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
      });
      const name = `sendBound${type}PlayerProfile`;
      const start = source.indexOf(`async function ${name}(`);
      const ends = [source.indexOf('\nfunction ', start + 1), source.indexOf('\nasync function ', start + 1)].filter(n => n > start);
      vm.runInContext(source.slice(start, Math.min(...ends)), context);
      await context[name]('chat', { leagueId: 'L', club: 'Club', league: 'Union' }, 'Nick', {
        leaguePlayerTops: { leagues: [{ leagueId: 'L', players }] },
      }, '\n\nПодсказка /завершить', 123);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'editMessageText');
      assert.equal(calls[0].body.message_id, 123);
      assert.match(calls[0].body.text, /Подсказка \/завершить$/);
    }
  }
});

test('player search accepts repeated messages from the requesting user until expiry or command', async () => {
  const pending = new Map([['poker21:telegram-report:player-search:pending:chat:one', '1']]);
  const context = vm.createContext({
    isRedisConfigured: () => true,
    redisPipeline: async ([[command, key]]) => {
      assert.ok(['GET', 'DEL'].includes(command));
      const result = pending.get(key);
      if (command === 'DEL') pending.delete(key);
      return [{ result }];
    },
  });
  vm.runInContext(source.slice(source.indexOf('function playerSearchPendingKey('), source.indexOf('function paymentDetailsPlacementKey(')), context);
  const message = { text: 'Кулер', chat: { id: 'chat' }, from: { id: 'one' } };
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, from: { id: 'two' } }), false);
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, chat: { id: 'other' } }), false);
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, reply_to_message: { text: 'Другая форма' } }), false);
  assert.equal(await context.acceptsPlayerSearchMessage(message), true);
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, text: 'Waaar' }), true);
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, text: '442135' }), true);
  pending.clear(); // Redis TTL expiry.
  assert.equal(await context.acceptsPlayerSearchMessage(message), false);
  pending.set('poker21:telegram-report:player-search:pending:chat:one', '1');
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, text: '/пульс' }), false);
  assert.equal(await context.acceptsPlayerSearchMessage(message), false);
  assert.equal(await context.acceptsPlayerSearchMessage({ ...message, reply_to_message: { text: '🔎 Поиск игрока' } }), true);
});

test('activity preserves player date buttons and counts unique active players across weeks', async () => {
  const calls = [];
  const periods = [{ startDate: 'a', endDate: 'b' }, { startDate: 'c', endDate: 'd' }];
  const context = vm.createContext({
    availableBoundReportPeriods: () => periods,
    insightRowsForBinding: () => [{ id: 'one', active: true, rake: 20, hands: 5 }],
    escapeTelegramHtml: String, displayIso: String, formatInteger: String, formatRake: String,
    telegram: async (_, body) => { calls.push(body); return { ok: true }; },
  });
  vm.runInContext(source.slice(source.indexOf('function pulsePlayersKeyboard('), source.indexOf('function pulseTotalsKeyboard(')), context);
  vm.runInContext(source.slice(source.indexOf('async function sendPulsePlayerTops('), source.indexOf('async function sendBoundClubPlayerProfile(')), context);
  await context.sendPulsePlayerTops('chat', { type: 'club', club: 'Test' }, 'activity', periods, 3n, 123);
  assert.equal(calls[0].message_id, 123);
  assert.match(calls[0].text, /Активных игроков: 1/);
  assert.match(calls[0].text, /Рейк: 40/);
  const buttons = calls[0].reply_markup.inline_keyboard.flat();
  assert.ok(buttons.some(button => button.callback_data === 'pulse:players:toggle:0:activity:3'));
  assert.ok(buttons.some(button => button.callback_data === 'pulse:player:select:activity:3' && button.style === 'success'));
});

test('ruble requisite maximum is 10000 inclusive for commands and plain messages', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function parsePaymentDetailsCommand('), source.indexOf('function isPaymentConfirmCommand(')), context);
  const details = '\n+7 999 999-99-99\nСбер\nАндрей';
  for (const amount of ['9999,99', '10000', '10 000 ₽']) assert.equal(context.parsePaymentDetailsCommand(`/реквизиты ${amount}${details}`).action, 'publish');
  for (const amount of ['10000,01', '10001', '50000']) {
    assert.equal(context.parsePaymentDetailsCommand(`/разместить ${amount}${details}`).reason, 'amount_limit');
    assert.equal(context.parsePaymentDetailsMessage(`${amount}${details}`).reason, 'amount_limit');
  }
  assert.equal(context.parsePaymentDetailsCommand(`/разместить 10001$${details}`).action, 'publish');
  assert.match(context.paymentDetailsFormText(true, 'amount_limit'), /Максимальная сумма одной заявки — 10 000 ₽/);
});

test('registry marks only our claimed payments as in progress', () => {
  const context = vm.createContext({ formatPaymentAmount: () => '5 000 ₽' });
  vm.runInContext(source.slice(source.indexOf('function paymentRegistryButton('), source.indexOf('function visiblePaymentDetails(')), context);
  const item = { id: 'x', owner: { chatId: 'owner' }, payer: { chatId: 'payer' }, status: 'claimed' };
  assert.equal(context.paymentRegistryButton(item, 0, 'payer').text, '🟡 1 · 5 000 ₽');
  assert.doesNotMatch(context.paymentRegistryButton(item, 0, 'owner').text, /Взят в работу/);
  assert.equal(context.paymentRegistryButton({ ...item, status: 'awaiting_receipt' }, 0, 'payer').text, '🟡 1 · 5 000 ₽');
  assert.equal(context.paymentRegistryButton({ ...item, status: 'paid' }, 0, 'payer').text, '🔵 1 · 5 000 ₽');
  assert.doesNotMatch(context.paymentRegistryButton({ ...item, status: 'open' }, 0, 'payer').text, /Взят в работу/);
});

test('activity button edits its original message and includes back navigation', async () => {
  const calls = [];
  const context = vm.createContext({
    insightPeriods: () => [{ startDate: '2026-08-24', endDate: '2026-08-30' }],
    insightRowsForBinding: () => [{ active: true, rake: 100, hands: 2 }],
    escapeTelegramHtml: String, displayIso: String, formatInteger: String, formatRake: String,
    telegram: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
  });
  vm.runInContext(source.slice(source.indexOf('async function sendBoundActivity('), source.indexOf('async function readPlayingTablesCached(')), context);
  await context.sendBoundActivity('chat', { type: 'club', club: 'GARAGE' }, null, 77);
  assert.equal(calls[0].method, 'editMessageText');
  assert.equal(calls[0].body.message_id, 77);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[0][0].callback_data, 'pulse:players');
  await context.sendBoundActivity('chat', { type: 'club', club: 'GARAGE' }, 78);
  assert.equal(calls[1].method, 'sendMessage');
});

test('payment confirmation ends with resulting balance for each party', () => {
  assert.ok(source.includes('Итоговый баланс по реквизитам: ${formatBalanceAmount(ownerAfter, symbol)}'));
  assert.ok(source.includes('Итоговый баланс по реквизитам: ${formatBalanceAmount(payerAfter, symbol)}'));
  assert.ok(!source.includes('Итого изменение: ${formatBalanceAmount(deltas.'));
});

test('pulse navigation keeps the original message ID without creating a workspace', async () => {
  let stored = null;
  const calls = [];
  const context = vm.createContext({
    isRedisConfigured: () => true,
    redisPipeline: async commands => commands.map(command => {
      if (command[0] === 'SET') stored = command[2];
      return { result: command[0] === 'GET' ? stored : 'OK' };
    }),
    telegram: async (method, body) => { calls.push({ method, body }); return { ok: true, result: { message_id: 200 } }; },
  });
  vm.runInContext(source.slice(source.indexOf('async function routePulseRootCallback('), source.indexOf('async function sendPulseMainMenu(')), context);
  const callback = { id: 'x', data: 'pulse:balance', message: { message_id: 100, chat: { id: 'chat' }, text: '❤️ Пульс клуба — Два Туза', reply_markup: { inline_keyboard: [[{ callback_data: 'pulse:balance' }]] } } };
  assert.equal((await context.routePulseRootCallback(callback)).message.message_id, 100);
  assert.equal((await context.routePulseRootCallback(callback)).message.message_id, 100);
  assert.ok(calls.every(call => call.body.message_id !== 100));
  assert.equal(callback.message.message_id, 100);
  const workspaceCallback = { ...callback, message: { ...callback.message, message_id: 200 } };
  assert.equal(await context.routePulseRootCallback(workspaceCallback), workspaceCallback);
  assert.equal(calls.length, 0);
});

test('placement reuses one bot message for prompt, error and confirmation', async () => {
  const calls = [];
  let stored = null;
  const context = vm.createContext({
    paymentPlacementMessageKey: () => 'key',
    redisPipeline: async commands => commands.map(command => {
      if (command[0] === 'SET') stored = command[2];
      return { result: command[0] === 'GET' ? stored : 'OK' };
    }),
    telegram: async (method, body) => { calls.push({ method, body }); return { ok: true, result: { message_id: 42 } }; },
  });
  vm.runInContext(source.slice(source.indexOf('async function sendPaymentPlacementMessage('), source.indexOf('async function sendOrEditPaymentMessage(')), context);
  await context.sendPaymentPlacementMessage('chat', 'user', 'prompt', [], 42);
  await context.sendPaymentPlacementMessage('chat', 'user', 'error');
  await context.sendPaymentPlacementMessage('chat', 'user', 'published');
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.method, 'editMessageText');
    assert.equal(call.body.message_id, 42);
  }
});

test('plain requisites message is accepted without reply metadata or a pending prompt', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function parsePaymentDetailsCommand('), source.indexOf('function paymentDetailsFormText(')), context);
  const parsed = context.parsePaymentDetailsMessage('6000\n+7 999 999-99-99\nСбер\nАндрей Андреич');
  assert.equal(parsed.action, 'publish');
  assert.equal(parsed.amountCents, 600000);
  assert.equal(context.parsePaymentDetailsMessage('обычное сообщение'), null);
  assert.equal(context.parsePaymentDetailsMessage('/баланс'), null);
  assert.equal(context.parsePaymentDetailsMessage('6000', true).action, 'invalid');
});

test('global requisite balances allow digits chat without granting other club chats access', () => {
  const context = vm.createContext({ isMainReportChat: id => String(id) === 'main' });
  vm.runInContext(source.slice(source.indexOf('function canViewRequisiteBalances('), source.indexOf('function isAntiregReportChat(')), context);
  assert.equal(context.canViewRequisiteBalances('-4271456764'), true);
  assert.equal(context.canViewRequisiteBalances(-4271456764), true);
  assert.equal(context.canViewRequisiteBalances('main'), true);
  assert.equal(context.canViewRequisiteBalances('-1234'), false);
});

test('requisites menu includes a back button to pulse even for an empty registry', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function paymentDetailsMenuButtons('), source.indexOf('function visiblePaymentDetails(')), context);
  const rows = context.paymentDetailsMenuButtons();
  assert.equal(rows.at(-2)[0].text, '🔕 Уведомления — выкл');
  for (const preference of ['under5000', 'from5000', 'all']) {
    assert.equal(context.paymentDetailsMenuButtons(preference).at(-2)[0].text, '🔔 Уведомления — вкл');
  }
  assert.equal(rows.at(-1)[0].text, '⬅️ Назад');
  assert.equal(rows.at(-1)[0].callback_data, 'pulse:menu');
});

test('refresh edits the tracked menu with freshly read balances', async () => {
  const calls = [];
  const context = vm.createContext({ module: { exports: {} }, console, require: () => ({
    isConfigured: () => true,
    pipeline: async commands => {
      assert.ok(commands.every(command => command[0] === 'GET'));
      return [
        { result: JSON.stringify({ messageId: 44, markup: { inline_keyboard: [[{ text: 'old', callback_data: 'pulse:balance' }], [{ text: 'Реквизиты', callback_data: 'paymenu:list', style: 'success' }]] } }) },
        { result: '150000' }, { result: null },
      ];
    },
  }) });
  vm.runInContext(fs.readFileSync(require.resolve('../lib/pulse-balance-menu'), 'utf8'), context);
  await context.module.exports.refreshMenu('chat', async (method, body) => { calls.push({ method, body }); return { ok: true }; });
  assert.equal(calls[0].method, 'editMessageReplyMarkup');
  assert.equal(calls[0].body.message_id, 44);
  assert.match(calls[0].body.reply_markup.inline_keyboard[0][0].text.replace(/\s/g, ''), /1500,00₽/);
  assert.equal(calls[0].body.reply_markup.inline_keyboard[1][0].style, 'success');
});

test('pulse menu shows the balance and a green requisites button at the bottom', () => {
  const { balanceButtonText, requisiteButtonText } = require('../lib/pulse-balance-menu');
  const context = vm.createContext({ balanceButtonText, requisiteButtonText });
  vm.runInContext(source.slice(source.indexOf('function pulseMainKeyboard('), source.indexOf('function pulseCalculationsKeyboard(')), context);
  const rows = context.pulseMainKeyboard({ type: 'club' }, { cents: -12345, usdCents: 500 }, 5).inline_keyboard;
  assert.equal(rows.at(-1)[0].text, '💳 Реквизиты — 5, баланс 0,00 ₽');
  assert.equal(context.pulseMainKeyboard({}, {}, 0).inline_keyboard.at(-1)[0].text, '💳 Реквизиты — 0, баланс 0,00 ₽');
  assert.match(requisiteButtonText(2, { paymentCents: -608000 }).replace(/\s/g, ''), /Реквизиты—2,баланс-6080,00₽/);
  assert.match(rows.at(-2)[0].text, /Клубный баланс/);
  assert.equal(rows.at(-1)[0].callback_data, 'paymenu:list');
  assert.equal(rows.at(-1)[0].style, 'success');
  assert.match(rows.at(-2)[0].text, /-123,45 ₽/);
  assert.match(rows.at(-2)[0].text, /5,00 \$/);
  assert.match(balanceButtonText({ cents: 0 }), /0,00 ₽/);
});

test('requisites count matches the visible registry', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function visiblePaymentDetails('), source.indexOf('async function sendPaymentDetailsRegistry(')), context);
  const items = [
    { status: 'open', owner: { chatId: 'other' } },
    { status: 'claimed', owner: { chatId: 'me' } },
    { status: 'paid', payer: { chatId: 'me' } },
    { status: 'claimed', owner: { chatId: 'other' } },
    { status: 'confirmed', owner: { chatId: 'me' } },
    { status: 'removed', owner: { chatId: 'me' } },
  ];
  assert.equal(context.visiblePaymentDetails(items, 'me').length, 3);
  assert.equal(context.visiblePaymentDetails(items, 'me', false).length, 4);
});

test('balance menu hides set balance but keeps history, add and subtract', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function balanceMenuKeyboard('), source.indexOf('async function sendChatBalance(')), context);
  const callbacks = context.balanceMenuKeyboard().inline_keyboard.flat().map(button => button.callback_data);
  assert.equal(callbacks.includes('balmenu:set'), false);
  for (const callback of ['balmenu:history', 'balmenu:add', 'balmenu:subtract', 'pulse:menu']) assert.ok(callbacks.includes(callback));
});

test('history lets the user choose a Moscow week and separates both ledgers', async () => {
  const calls = [];
  const context = vm.createContext({
    getChatBalance: async (_, limit) => { assert.equal(limit, 0); return { history: [{ timestamp: '2026-09-06T21:30:00Z', actor: 'main' }] }; },
    getPaymentBalanceHistory: async (_, limit) => { assert.equal(limit, Infinity); return [{ timestamp: '2026-09-06T20:30:00Z', actor: 'payment' }]; },
    formatBalanceOwner: () => 'клуба',
    formatBalanceHistoryEntry: entry => entry.actor,
    telegram: async (_, body) => { calls.push(body); return { ok: true }; },
  });
  vm.runInContext(source.slice(source.indexOf('function balanceHistoryWeek('), source.indexOf('function paymentDetailsStatusText(')), context);
  assert.equal(context.balanceHistoryWeek('2026-09-06T21:30:00Z'), '2026-09-07');
  assert.equal(context.balanceHistoryWeek('2026-09-06T20:30:00Z'), '2026-08-31');
  await context.sendChatBalanceHistory('chat', {}, 1);
  assert.equal(calls[0].reply_markup.inline_keyboard[0][0].callback_data, 'balmenu:week:2026-09-07:0');
  await context.sendChatBalanceHistory('chat', {}, 1, '2026-08-31');
  assert.match(calls[1].text, /<b>Текущий баланс<\/b>\nНет операций./);
  assert.match(calls[1].text, /<b>Реквизиты<\/b>\npayment/);
  assert.doesNotMatch(calls[1].text, /\nmain/);
});

test('balance timestamps use Moscow time with an explicit label', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function formatBalanceTimestamp('), source.indexOf('function formatBalanceAmount(')), context);
  assert.equal(context.formatBalanceTimestamp('2026-09-04T15:30:00.000Z'), '04.09.2026 18:30 МСК');
  assert.equal(context.formatBalanceTimestamp('2026-09-04T22:30:00.000Z'), '05.09.2026 01:30 МСК');
  assert.equal(context.formatBalanceTimestamp(null), '');
  assert.equal(context.formatBalanceTimestamp('invalid'), '');
});

test('balance history renders consecutive entries without blank lines or quote blocks', () => {
  const context = vm.createContext({
    formatBalanceHistoryEntry: entry => entry.text,
  });
  vm.runInContext(source.slice(source.indexOf('function formatBalanceHistoryBlocks('), source.indexOf('function formatUnrecordedBalanceOperation(')), context);
  assert.equal(context.formatBalanceHistoryBlocks([
    { text: '+100 ₽ — дата\nКомментарий: проверка' },
    { text: '−50 ₽ — дата' },
  ]), '+100 ₽ — дата\nКомментарий: проверка\n−50 ₽ — дата');
  assert.equal(context.formatBalanceHistoryBlocks([]), '');
});

test('payment history shows five confirmed operations for this chat with historical fees preserved', async () => {
  const items = Array.from({ length: 7 }, (_, i) => ({
    status: 'confirmed', confirmedAt: `2026-09-0${i + 1}`, amountCents: 10000,
    owner: { chatId: 'owner', name: 'Owner' }, payer: { chatId: 'payer', name: 'Payer' },
    ...(i === 6 ? { currency: 'usd', balanceOperation: { ownerDeltaCents: -10100, payerDeltaCents: 9900, feeCents: 100, feePercent: 1 } } : {}),
  }));
  items.push({ ...items[6], status: 'paid' }, { ...items[6], owner: { chatId: 'other' }, payer: { chatId: 'other2' } });
  const context = vm.createContext({
    isRedisConfigured: () => true,
    PAYMENT_DETAILS_INDEX_KEY: 'index',
    scanRedisKeys: async () => ['index', ...items.map((_, i) => String(i))],
    redisPipeline: async commands => commands.map(([method, key]) => {
      assert.equal(method, 'GET');
      return { result: JSON.stringify(items[Number(key)]) };
    }),
    formatRake: String,
  });
  vm.runInContext(source.slice(source.indexOf('async function getPaymentBalanceHistory('), source.indexOf('function formatUnrecordedBalanceOperation(')), context);
  const rows = await context.getPaymentBalanceHistory('owner', 5);
  assert.equal(rows.length, 5);
  assert.equal(rows[0].usd.cents, -10100);
  assert.equal(rows[1].rub.cents, -10000);
  assert.equal(rows[0].commission, 'Комиссия 1%: −1 $ (уже учтена в сумме операции)');
  assert.equal(rows[1].commission, '');
  context.formatBalanceAmount = cents => String(cents);
  context.formatBalanceTimestamp = value => value;
  context.escapeTelegramHtml = value => value;
  vm.runInContext(source.slice(source.indexOf('function formatBalanceHistoryEntry('), source.indexOf('function formatBalanceHistoryBlocks(')), context);
  assert.match(context.formatBalanceHistoryEntry(rows[0]), /\nКомиссия 1%: −1 \$/);
  assert.doesNotMatch(context.formatBalanceHistoryEntry(rows[1]), /Комиссия/);
  assert.equal((await context.getPaymentBalanceHistory('payer'))[0].usd.cents, 9900);
  const menu = source.slice(source.indexOf('async function sendChatBalance('), source.indexOf('async function sendChatBalanceHistory('));
  assert.match(menu, /getChatBalance\(chatId, 3\)/);
  assert.ok(menu.indexOf('formatBalanceHistoryBlocks(balance.history)') < menu.indexOf('<b>Баланс по реквизитам:</b>'));
  assert.ok(menu.indexOf('formatBalanceHistoryBlocks(paymentHistory)') > menu.indexOf('<b>Баланс по реквизитам:</b>'));
});

test('each party pays one percent, rounded to the nearest kopeck or cent', () => {
  const context = vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function paymentBalanceDeltas('), source.indexOf('function formatPaymentAmount(')), context);
  for (const [amount, fee, owner, payer] of [
    [1000000, 10000, -1010000, 990000],
    [10000, 100, -10100, 9900],
    [12345, 123, -12468, 12222],
    [150, 2, -152, 148],
    [1, 0, -1, 1],
  ]) {
    const delta = context.paymentBalanceDeltas(amount);
    assert.equal(delta.feeCents, fee);
    assert.equal(delta.ownerDeltaCents, owner);
    assert.equal(delta.payerDeltaCents, payer);
    assert.equal(delta.ownerDeltaCents + delta.payerDeltaCents, fee ? -2 * fee : 0);
  }
  assert.match(source, /\["INCRBY", ownerBalanceKey, String\(deltas.ownerDeltaCents\)\]/);
  assert.match(source, /\["INCRBY", payerBalanceKey, String\(deltas.payerDeltaCents\)\]/);
});

test('requisite balance command accepts mentions and rejects mutations', () => {
  const code = source.slice(source.indexOf('function isRequisiteBalancesCommand('), source.indexOf('function isRecordBalancesCommand('));
  const context = vm.createContext({});
  vm.runInContext(code, context);
  for (const value of ['/баланс реквизиты', '/баланс@Poker21Bot РЕКВИЗИТЫ', ' /баланс   реквизиты ']) {
    assert.equal(context.isRequisiteBalancesCommand(value), true);
  }
  for (const value of ['/баланс', '/баланс +100р', '/баланс реквизиты +100', '/реквизиты']) {
    assert.equal(context.isRequisiteBalancesCommand(value), false);
  }
  assert.ok(source.indexOf('if (isRequisiteBalancesCommand(message.text))') < source.indexOf('const mainBalanceOnlyCommand'));
});

test('requisite summary reads separate payment balances and never mutates Redis', async () => {
  const messages = [];
  const key = 'poker21:telegram-report:club-chat:-123';
  const bindings = {
    [key]: { type: 'club', club: 'Test Club', clubId: '123' },
    [`${key}1`]: { type: 'club', club: 'Два Туза', clubId: '758417' },
    [`${key}2`]: { type: 'club', club: 'Kampashka 21', clubId: '680649' },
    [`${key}3`]: { type: 'union', league: 'Off Cheats', leagueId: '184285' },
  };
  const context = vm.createContext({
    isRedisConfigured: () => true,
    scanRedisKeys: async () => Object.keys(bindings),
    redisPipeline: async (commands) => {
      assert.ok(commands.every(command => command[0] === 'GET'));
      return commands.map(([, key]) => ({ result: key.startsWith('poker21:')
        ? JSON.stringify(bindings[key])
        : key.startsWith('usd:') ? '-500' : '12500' }));
    },
    paymentBalanceKey: id => `rub:${id}`,
    paymentBalanceUsdKey: id => `usd:${id}`,
    isHiddenBalanceBinding: binding => binding.clubId !== '123',
    normalizeLookup: value => value.toLowerCase(),
    storedBalanceMarker: () => '',
    escapeTelegramHtml: value => value,
    formatStoredBalance: value => `${value.cents / 100} RUB; ${value.usdCents / 100} USD`,
    telegram: async (_, body) => { messages.push(body); return { ok: true }; },
  });
  const start = source.indexOf('async function sendAllPaymentBalances(');
  vm.runInContext(source.slice(start, source.indexOf('async function sendBoundClubCommands(', start)), context);
  assert.equal(await context.sendAllPaymentBalances('main', 1, true), true);
  assert.match(messages[0].text, /Балансы по реквизитам/);
  assert.match(messages[0].text, /Test Club — 125 RUB; -5 USD/);
  assert.match(messages[0].text, /Только подтверждённые оплаты/);
  assert.match(messages[0].text, /Два Туза — 125 RUB; -5 USD/);
  assert.match(messages[0].text, /Kampashka 21 — 125 RUB; -5 USD/);
  assert.doesNotMatch(messages[0].text, /Off Cheats/);
  messages.length = 0;
  assert.equal(await context.sendAllPaymentBalances('main', 2), true);
  assert.doesNotMatch(messages[0].text, /Два Туза|Kampashka 21|Off Cheats/);
});
