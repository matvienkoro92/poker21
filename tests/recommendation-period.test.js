const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('node:fs').readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');
function context(periods) {
  const ctx = { require: p => require('../lib/' + p.replace('../', '')), availableBoundReportPeriods: () => periods,
    insightRowsForBinding: p => p.directory.clubs[0].playerRows, displayIso: String, escapeTelegramHtml: String,
    telegram: async (method, payload) => payload };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function recommendationActionButtons('), source.indexOf('async function sendClubExport(')), ctx);
  vm.runInContext(source.slice(source.indexOf('async function weeklySummary('), source.indexOf('async function enqueueWeeklySummaries(')), ctx);
  return ctx;
}
const row = (id, nick = id) => ({ id, nick, active: true, rake: 0, hands: 1 });
function fixtures() {
  return ['2020-08-24', '2020-08-17', '2020-08-10', '2020-08-03', '2020-07-27'].map((startDate, i) => ({
    startDate, endDate: new Date(Date.parse(startDate) + 6 * 86400000).toISOString().slice(0, 10),
    directory: { clubs: [{ id: 'club', playerRows: [row('regular'), ...(i === 0 ? [row('new')] : []),
      ...(i === 1 ? [row('first')] : []), ...(i === 2 ? [row('middle')] : []), ...(i === 4 ? [row('long')] : [])] }] }
  }));
}
test('summary covers all history and buttons open full paginated groups', async () => {
  const ctx = context(fixtures());
  const binding = { type: 'club', clubId: 'club', club: 'Club' };
  const result = ctx.playerHistoryForBinding(binding);
  assert.equal(result.players.length, 5);
  assert.equal(result.single.length, 3);
  assert.deepEqual(Array.from(ctx.recommendationActionButtons(result).flat(), b => b.callback_data),
    ['weeklyhistory:first:0', 'weeklyhistory:middle:0', 'weeklyhistory:long:0', 'weeklyhistory:single:0']);
  assert.ok(ctx.recommendationActionButtons(result).every(row => row.length === 1));
  assert.equal(ctx.recommendationActionButtons(result)[0][0].text, 'Пропущена последняя неделя · 1');
  const summary = await ctx.weeklySummary('1', binding);
  assert.match(summary.text, /Из 5 игроков/);
  assert.doesNotMatch(summary.text, /Что делать|Рейк|вклад/);
  const list = await ctx.sendPlayerHistory('1', binding, 'single', 99, 2);
  assert.match(list.text, /first \(first\)/);
  assert.match(list.text, /long \(long\)/);
  assert.match(list.text, /страница 1\/1/);
});
test('missing player data does not mark everyone inactive; unfinished reports excluded', async () => {
  const periods = fixtures();
  periods[0].directory = {};
  periods.unshift({ startDate: '2099-01-01', endDate: '2099-01-07' });
  const ctx = context(periods);
  const summary = await ctx.weeklySummary('1', { type: 'club', clubId: 'club' });
  assert.match(summary.text, /нет данных игроков/);
  assert.doesNotMatch(summary.text, /Не играли/);
});
