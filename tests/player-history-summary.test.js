const { test } = require('node:test');
const assert = require('node:assert/strict');
const { analyze } = require('../lib/player-history-summary');
test('historical cohorts distinguish recent players, drops, growth and absent leaders', () => {
  const periods = ['2026-08-24','2026-08-17','2026-08-10','2026-08-03'].map((startDate,i) => ({ startDate, rows: [
    { id:'risk',nick:'R',rake:i?100:30,active:true },
    { id:'growth',nick:'G',rake:i?100:200,active:true },
    ...(i===3?[{id:'once',nick:'O',rake:10,active:true}]:[]),
    ...(i===0?[{id:'new',nick:'N',rake:10,active:true}]:[]),
    ...(i?[{id:'top',nick:'T',rake:1000,active:true}]:[])
  ] }));
  const a=analyze(periods);
  assert.deepEqual(a.single.map(p=>p.id),['once']);
  assert.deepEqual(a.risk.map(p=>p.id),['risk']);
  assert.deepEqual(a.growth.map(p=>p.id),['growth']);
  assert.deepEqual(a.stopped.map(p=>p.id),['top']);
  assert.equal(a.recentSingle,1);
  assert.equal(new Set(a.contact.map(p=>p.id)).size,a.contact.length);
  periods[1].startDate='2026-08-16';
  assert.equal(analyze(periods).risk.length,0);
});
test('empty and short history do not invent risk',()=>{
  assert.equal(analyze([]).players.length,0);
  assert.equal(analyze([{startDate:'2026-08-24',rows:[]}]).risk.length,0);
});
test('scheduled weekly summary does not reference callback-only state',()=>{
  const source=require('node:fs').readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
  const scheduled=source.slice(source.indexOf('async function enqueueWeeklySummaries()'),source.indexOf('module.exports.enqueueWeeklySummaries'));
  // Bound to the function body, not subsequent callback handlers.
  const body=scheduled.slice(0,scheduled.indexOf('\n}\n')+3);
  assert.doesNotMatch(body,/weeklyPlayer|callbackQuery|res\.status/);
  assert.match(body,/availableBoundReportPeriods\(binding\)\[0\]/);
});
