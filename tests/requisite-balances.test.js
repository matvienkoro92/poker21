const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');

test('each balance history operation is rendered in its own block', () => {
  const context = vm.createContext({
    formatBalanceHistoryEntry: entry => entry.text,
  });
  vm.runInContext(source.slice(source.indexOf('function formatBalanceHistoryBlocks('), source.indexOf('function formatUnrecordedBalanceOperation(')), context);
  assert.equal(context.formatBalanceHistoryBlocks([
    { text: '+100 ₽ — дата\nКомментарий: проверка' },
    { text: '−50 ₽ — дата' },
  ]), '<blockquote>+100 ₽ — дата\nКомментарий: проверка</blockquote>\n\n<blockquote>−50 ₽ — дата</blockquote>');
  assert.equal(context.formatBalanceHistoryBlocks([]), '');
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
