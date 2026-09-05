const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../lib/weekly-activity');
const row = (id, nick = id) => ({ id, nick, active: true, hands: 1, rake: 0 });
const periods = () => ['2026-08-24','2026-08-17','2026-08-10','2026-08-03','2026-07-27'].map((startDate, i) => ({ startDate, endDate: startDate,
  rows: [ ...(i === 0 ? [row('return', 'new nick'), row('new')] : []), ...(i === 1 ? [row('first')] : []),
    ...(i === 2 ? [row('middle'), row('return', 'old nick')] : []), ...(i === 4 ? [row('long'), row('long')] : []),
    { id: 'never', active: false } ] }));
test('disjoint absence groups cover all inactive players, single overlaps intentionally', () => {
  const a = analyze(periods());
  assert.equal(a.players.length, 5);
  assert.equal(a.active.length, 2);
  assert.equal(a.new.length, 1);
  assert.equal(a.returned[0].nick, 'new nick');
  assert.equal(a.first[0].id, 'first');
  assert.equal(a.middle[0].id, 'middle');
  assert.equal(a.long[0].absentWeeks, 4);
  assert.equal(a.single.length, 3);
  assert.equal(a.first.length + a.middle.length + a.long.length + a.unknown.length, a.inactive.length);
});
test('gaps affect only players whose absence spans the gap', () => {
  const p = periods(); p.splice(3, 1);
  const a = analyze(p);
  assert.equal(a.first.length, 1);
  assert.equal(a.middle.length, 1);
  assert.equal(a.long.length, 0);
  assert.equal(a.unknown[0].id, 'long');
  p[1].rows = null;
  assert.equal(analyze(p).returned.length, 0);
});
test('empty history and first report do not invent inactive players', () => {
  assert.equal(analyze([]).players.length, 0);
  assert.equal(analyze(periods().slice(0, 1)).inactive.length, 0);
});
