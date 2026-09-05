const test = require('node:test');
const assert = require('node:assert/strict');
const { compareWeeks } = require('../lib/weekly-conclusions');
test('contributions reconcile to total change including absent and new players', () => {
  const result = compareWeeks([{ id: '1', nick: 'A', rake: 200, active: true }, { id: '3', nick: 'C', rake: 20, active: true }], [{ id: '1', nick: 'A', rake: 100, active: true }, { id: '2', nick: 'B', rake: 80, active: true }]);
  assert.equal(result.delta, 40);
  assert.equal(result.grossGain - result.grossLoss, result.delta);
  assert.equal(result.up[0].id, '1');
  assert.equal(result.down[0].id, '2');
  assert.equal(result.down[0].inactive, true);
});
test('duplicate player rows aggregate, zero weeks do not fabricate growth', () => {
  const result = compareWeeks([{ id: '1', rake: 10, active: true }, { id: '1', rake: 20, active: true }], []);
  assert.equal(result.active, 1);
  assert.equal(result.up[0].delta, 30);
  assert.equal(compareWeeks([], []).delta, 0);
});
