const test = require('node:test');
const assert = require('node:assert/strict');
const { availability, reconcile } = require('../lib/requisite-overview');

test('available principal includes fee rounding, reservations and request maximum', () => {
  const items = [{ owner: { chatId: 'a' }, amountCents: 100000, status: 'paid', currency: 'rub' }];
  const result = availability(0, 202000, items, 'a');
  assert.equal(result.reserved, 101000);
  assert.equal(result.available, 100000);
  assert.equal(availability(0, 0, [], 'a').available, 0);
  for (let cents = 0; cents < 500; cents++) {
    const { available } = availability(cents, 0, [], 'a');
    assert.ok(available + Math.round(available / 100) <= cents);
    assert.ok(available + 1 + Math.round((available + 1) / 100) > cents);
  }
  assert.equal(availability(3000000, 0, [], 'a').perRequest, 1000000);
});

test('reconciliation follows signed transfers and identifies wrong commissions or missing history', () => {
  const item = { id: 'deal', status: 'confirmed', currency: 'rub', amountCents: 10000, owner: { chatId: 'a' }, payer: { chatId: 'b' }, balanceOperation: { ownerDeltaCents: -10100, payerDeltaCents: 9900, feeCents: 100 } };
  const accounts = [{ id: 'a', name: 'A', balance: 0, transfers: [{ operationId: 'move', rub: { cents: 10100 } }], mainHistory: [{ operationId: 'move', comment: 'Перенос из баланса реквизитов', rub: { cents: -10100 } }] }, { id: 'b', name: 'B', balance: 9900, transfers: [], mainHistory: [] }];
  assert.deepEqual(reconcile([item], accounts), []);
  assert.ok(reconcile([{ ...item, balanceOperation: { ...item.balanceOperation, feeCents: 99 } }], accounts).some(s => s.includes('комиссия')));
  assert.ok(reconcile([item], [{ ...accounts[0], mainHistory: [] }, accounts[1]]).some(s => s.includes('Перенос')));
  assert.ok(reconcile([item], [{ ...accounts[0], balance: 100 }, accounts[1]]).some(s => s.includes('по истории')));
});
