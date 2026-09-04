const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');

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
  const context = vm.createContext({
    isRedisConfigured: () => true,
    scanRedisKeys: async () => [key],
    redisPipeline: async (commands) => {
      assert.ok(commands.every(command => command[0] === 'GET'));
      return commands.map(([, key]) => ({ result: key.startsWith('poker21:')
        ? JSON.stringify({ type: 'club', club: 'Test Club', clubId: '123' })
        : key.startsWith('usd:') ? '-500' : '12500' }));
    },
    paymentBalanceKey: id => `rub:${id}`,
    paymentBalanceUsdKey: id => `usd:${id}`,
    isHiddenBalanceBinding: () => false,
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
});
