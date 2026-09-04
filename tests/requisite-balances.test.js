const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');

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
