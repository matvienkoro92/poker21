const { test } = require('node:test');
const assert = require('node:assert/strict');
const sort = require('../lib/export-sort');

test('player export sorts rake descending and keeps source unchanged', () => {
  const source = [
    ['Club','2026-08-24','','1','Low',10],
    ['Club','2026-08-17','','2','Top old',500],
    ['Club','2026-08-24','','3','Top new',500],
  ];
  assert.deepEqual(sort.players(source).map(row => row[4]), ['Top new','Top old','Low']);
  assert.equal(source[0][4], 'Low');
});

test('history export sorts newest first and unknown dates last', () => {
  const rows = [
    ['Club','Main','2026-08-17T10:00:00Z'],
    ['Club','Main','Неизвестна'],
    ['Club','Details','2026-08-24T10:00:00Z'],
  ];
  assert.deepEqual(sort.history(rows).map(row => row[2]), ['2026-08-24T10:00:00Z','2026-08-17T10:00:00Z','Неизвестна']);
});
