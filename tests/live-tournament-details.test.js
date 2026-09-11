const test = require('node:test');
const assert = require('node:assert/strict');
const {tournamentState, tournamentDetails} = require('../lib/live-tournament-details');
const table = blindAnnotation => ({deskName:'DV Rebuy',leagueId:'184691',playType:'NLH',blindAnnotation});
const time = clock => Date.parse(`2026-09-08T${clock}+03:00`);

test('confirmed Moscow start and registration close include two five-minute breaks', () => {
  const state=tournamentState(table('50/100'), time('12:00:00'));
  assert.equal(new Date(state.start).toISOString(),'2026-09-08T09:00:00.000Z');
  assert.equal(new Date(state.closes).toISOString(),'2026-09-08T11:20:00.000Z');
  assert.equal(state.currentLevel.level,1);
  assert.equal(state.conflict,false);
  assert.match(tournamentDetails(table('50/100'),time('12:00:00')).join('\n'),/🟢 Регистрация ещё идёт/);
  assert.match(tournamentDetails(table('50/100'),time('12:00:00')).join('\n'),/02:20:00/);
});
test('registration lasts until the end of LV13, not its start', () => {
  const last=tournamentState(table('3000/6000'),time('14:19:59'));
  assert.equal(last.registrationOpenBySchedule,true);
  assert.equal(last.currentLevel.level,13);
  assert.equal(last.conflict,false);
  assert.match(tournamentDetails(table('3000/6000'),time('14:19:59')).join('\n'),/00:00:01/);
  const closed=tournamentState(table('4000/8000'),time('14:20:00'));
  assert.equal(closed.registrationOpenBySchedule,false);
  assert.equal(closed.estimatedLevel,14);
  assert.equal(closed.conflict,false);
});
test('break pauses level progression and countdown includes remaining pause', () => {
  for(const clock of ['12:55:00','12:59:59']) {
    const s=tournamentState(table('400/800'),time(clock));
    assert.equal(s.onBreak,true);
    assert.equal(s.currentLevel.level,6);
    assert.equal(s.estimatedLevel,6);
    assert.doesNotMatch(tournamentDetails(table('400/800'),time(clock)).join('\n'),/до возобновления|По расписанию перерыв/);
  }
  assert.equal(tournamentState(table('400/800'),time('13:00:00')).onBreak,false);
  assert.equal(tournamentState(table('500/1000'),time('13:05:00')).estimatedLevel,7);
});
test('API mismatch prevents a false countdown or claimed registration status', () => {
  for(const blinds of ['600/1200','6000/12000','123/456']) {
    const text=tournamentDetails(table(blinds),time('12:10:00')).join('\n');
    assert.match(text,/расходятся/);
    assert.doesNotMatch(text,/🟢 Регистрация|🔴 Регистрация/);
  }
});
test('post-registration levels are estimates; no invented ante, structure or actual finish status', () => {
  const text=tournamentDetails(table('20000/40000'),time('15:35:00')).join('\n');
  assert.match(text,/≈ LV21/);
  assert.doesNotMatch(text,/8 мин пока не учтён|до возобновления|По расписанию перерыв/);
  assert.match(text,/🔴 Регистрация уже закрыта/);
  assert.doesNotMatch(text,/Анте:|Следующий:|турнир завершён|из 13/);
});
test('daily rollover does not attach yesterday event to a future start; other tournaments untouched', () => {
  const text=tournamentDetails(table('50/100'),time('11:59:00')).join('\n');
  assert.match(text,/До старта по расписанию: ≈ 00:01:00/);
  assert.doesNotMatch(text,/🟢 Регистрация|🔴 Регистрация/);
  assert.deepEqual(tournamentDetails({...table('50/100'),deskName:'Other Rebuy'},time('12:00:00')),[]);
  assert.deepEqual(tournamentDetails({...table('50/100'),leagueId:'999'},time('12:00:00')),[]);
});

test('started card puts registration first and replaces estimated-level prose with remaining players', () => {
  const lines = tournamentDetails({...table('50000/100000'), remainingPlayers: 2}, time('16:05:00'));
  assert.match(lines[0], /🔴 Регистрация уже закрыта/);
  assert.match(lines.join('\n'), /Игроков осталось 2\.\nИдет уровень ≈ LV23\./);
  assert.doesNotMatch(lines.join('\n'), /Старт:|Бай-ин:|Расчётный уровень/);
});
