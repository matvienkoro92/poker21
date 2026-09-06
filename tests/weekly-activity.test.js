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

test('exact absence durations keep two, three, four and longer audiences separate', () => {
  const p = Array.from({length: 7}, (_, i) => ({
    startDate: new Date(Date.UTC(2026, 7, 24) - i * 7 * 86400000).toISOString().slice(0, 10),
    rows: i ? [row(String(i))] : []
  }));
  const a = analyze(p);
  assert.deepEqual(a.middle.map(p => p.id), ['2']);
  assert.deepEqual(a.third.map(p => p.id), ['3']);
  assert.deepEqual(a.long.map(p => p.id), ['4']);
  assert.deepEqual(a.older.map(p => p.id), ['5', '6']);
  const groups = [...a.first, ...a.middle, ...a.third, ...a.long, ...a.older, ...a.unknown];
  assert.equal(new Set(groups.map(p => p.id)).size, a.inactive.length);
  assert.equal(groups.length, a.inactive.length);
});
test('contribution analysis uses IDs, aggregates rows, separates newcomers and flags key drops', () => {
  const current = [ {id:'key',nick:'New nick',active:true,rake:20}, {id:'key',active:true,rake:20},
    {id:'up',active:true,rake:100}, {id:'new',active:true,rake:50} ];
  const previous = [{id:'key',nick:'Old nick',active:true,rake:1000}, {id:'up',active:true,rake:10}];
  const periods = [{startDate:'2026-08-24',rows:current},{startDate:'2026-08-17',rows:previous}];
  const a = analyze(periods);
  assert.equal(a.key[0].id,'key');
  assert.equal(a.key[0].currentRake,40);
  assert.equal(a.key[0].nick,'New nick');
  assert.deepEqual(a.growth.map(p=>p.id),['up']);
  assert.deepEqual(a.decline.map(p=>p.id),['key']);
  assert.deepEqual(a.attention.map(p=>p.id),['key']);
  periods[0].rows = current.filter(p=>p.id!=='key');
  const absent = analyze(periods);
  assert.equal(absent.decline.length,0);
  assert.equal(absent.attention[0].id,'key');
  periods[1].startDate='2026-08-10';
  const gap=analyze(periods);
  assert.equal(gap.comparable,false);
  assert.equal(gap.growth.length,0);
  assert.equal(gap.decline.length,0);
});
test('material loss below 50 percent ranks above smaller drops and tiny changes are excluded', () => {
  const periods = [0,1].map(i=>({startDate:i?'2026-08-17':'2026-08-24',rows:[
    {id:'large',active:true,rake:i?10000:5300},
    {id:'small',active:true,rake:i?1000:200},
    {id:'tiny',active:true,rake:i?1:2},
    {id:'stable',active:true,rake:20000}
  ]}));
  const a=analyze(periods);
  assert.equal(a.attention[0].id,'large');
  assert.ok(a.decline.some(p=>p.id==='large'));
  assert.ok(!a.growth.some(p=>p.id==='tiny'));
});

test('key players are recalculated from the latest four reports until they cover 70 percent of rake', () => {
  const periods = Array.from({ length: 5 }, (_, index) => ({
    startDate: new Date(Date.UTC(2026, 7, 24) - index * 7 * 86400000).toISOString().slice(0, 10),
    rows: index < 4
      ? [{ id: 'a', active: true, rake: 40 }, { id: 'b', active: true, rake: 30 }, { id: 'c', active: true, rake: 20 }, { id: 'd', active: true, rake: 10 }]
      : [{ id: 'old', active: true, rake: 10000 }],
  }));
  const result = analyze(periods);
  assert.deepEqual(result.key.map(player => player.id), ['a', 'b']);
  assert.equal(result.keyWindowWeeks, 4);
  assert.equal(result.fourWeekTotal, 400);
  assert.equal(result.keyRakeShare, 70);
  assert.equal(result.players.find(player => player.id === 'old').totalRake, 0);
});

const makeHistory = values => values.map((rows,i) => ({
  startDate: new Date(Date.UTC(2026,7,24)-i*7*86400000).toISOString().slice(0,10), rows
}));
const rakeRow = (id,rake) => ({id,nick:id,rake,active:rake>0});
test('significant absence is actionable even outside the key group', () => {
  const r=analyze(makeHistory([[rakeRow('a',1000)],[rakeRow('a',1000),rakeRow('b',200)]]));
  assert.equal(r.players.find(p=>p.id==='b').key,false);
  assert.deepEqual(r.attention.map(p=>p.id),['b']);
  assert.equal(r.breakdown.absent,-200);
  assert.equal(Object.values(r.breakdown).reduce((s,n)=>s+n,0),r.currentTotal-r.previousTotal);
});
test('calendar window excludes old reports and missing data is not a zero baseline', () => {
  const history=makeHistory(Array.from({length:7},(_,i)=>[rakeRow('a',i===6?10000:100)]));
  history.splice(1,1);history[1].rows=null;
  const r=analyze(history);
  assert.equal(r.coverageWeeks,2);
  assert.equal(r.fourWeekTotal,200);
  assert.equal(r.players[0].baselineWeeks,2);
  assert.equal(r.players[0].baselineRake,100);
  assert.equal(r.players[0].baselineReady,false);
});
test('historically key player survives a change of current key composition',()=>{
  const r=analyze(makeHistory([[rakeRow('new',10000)],[rakeRow('old',100)],[rakeRow('old',100)],[rakeRow('old',100)],[rakeRow('old',100)]]));
  assert.equal(r.key[0].id,'new');
  assert.equal(r.attention[0].id,'old');
  assert.equal(r.attention[0].previousKey,true);
});
test('normalization after a spike is not a risk, gradual decline is',()=>{
  const spike=analyze(makeHistory([100,1000,100,100,100].map(n=>[rakeRow('p',n)])));
  assert.equal(spike.decline.length,1);assert.equal(spike.attention.length,0);
  const gradual=analyze(makeHistory([60,70,80,90,100].map(n=>[rakeRow('p',n)])));
  assert.equal(gradual.attention[0].baselineRake,85);
  assert.equal(gradual.attention[0].attentionReason,'Рейк ниже обычного уровня');
});
test('breakdown accounts for newcomers, returns, continuing and absent players',()=>{
  const r=analyze(makeHistory([
    [rakeRow('a',80),rakeRow('new',50),rakeRow('back',30)],
    [rakeRow('a',100),rakeRow('gone',40)], [rakeRow('back',20)]
  ]));
  assert.deepEqual(r.breakdown,{new:50,returned:30,continuing:-20,absent:-40});
});

test('key subgroups use the same calendar window and stop support at 90 percent',()=>{
  const history=makeHistory(Array.from({length:6},(_,i)=>[
    rakeRow('stable',40),rakeRow('regular',20),rakeRow('tail',10),
    ...(i===0?[rakeRow('new',400)]:[]),...(i===5?[rakeRow('ancient',100000)]:[])
  ]));
  const r=analyze(history);
  assert.deepEqual(r.keyall.map(p=>p.id),r.key.map(p=>p.id));
  assert.deepEqual(r.newkey.map(p=>p.id),['new']);
  assert.deepEqual(r.stablekey.map(p=>p.id),['stable']);
  assert.deepEqual(r.support.map(p=>p.id),['regular']);
  assert.ok(!r.key.some(p=>p.id==='ancient'));
  const gap=analyze([history[0],history[3],history[5]]);
  assert.equal(gap.support.length,0);
});
