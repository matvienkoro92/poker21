const test = require('node:test');
const assert = require('node:assert/strict');
const { fingerprint } = require('../lib/reconciliation-review');
test('review identity survives unrelated changes but changes with relevant evidence', () => {
  const a = { id: '1', name: 'Club A', balance: 0, transfers: [], mainHistory: [] };
  const issue = 'Club A: mismatch';
  const original = fingerprint(issue, [], [a]);
  assert.equal(fingerprint(issue, [], [a, { id: '2', name: 'Club B', balance: 100 }]), original);
  assert.notEqual(fingerprint(issue, [], [{ ...a, balance: 100 }]), original);
  assert.notEqual(fingerprint(issue, [{ id: 'deal', owner: { chatId: '1' }, status: 'confirmed' }], [a]), original);
  assert.notEqual(fingerprint('Club A: different mismatch', [], [a]), original);
});
