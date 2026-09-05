const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');

test('club analysis menu keeps distinct cohorts without overlapping inactive lists', () => {
  const context = vm.createContext({ analysisCallback: (_, value) => value });
  vm.runInContext(source.slice(source.indexOf('function clubAnalysisKeyboard('), source.indexOf('async function sendClubAnalysisMenu(')), context);
  const buttons = context.clubAnalysisKeyboard({ type: 'club' }).inline_keyboard.flat();
  const callbacks = buttons.map(button => button.callback_data);
  assert.ok(callbacks.includes('pulse:analysis:core'));
  assert.ok(callbacks.includes('pulse:analysis:list:recent:0'));
  assert.ok(callbacks.includes('pulse:analysis:list:dormant:0'));
  assert.ok(callbacks.includes('pulse:analysis:list:returned:0'));
  assert.ok(callbacks.includes('pulse:analysis:cohorts'));
  assert.ok(!callbacks.includes('pulse:analysis:overview'));
  assert.ok(!callbacks.includes('pulse:analysis:list:inactive:0'));
  assert.ok(!callbacks.includes('pulse:analysis:list:oneweek:0'));
});

test('recommendations contain action filters but no duplicate section links', () => {
  const body = source.slice(source.indexOf('async function weeklySummary('), source.indexOf('async function enqueueWeeklySummaries('));
  const buttons = source.slice(source.indexOf('function recommendationActionButtons('), source.indexOf('function playerHistoryForBinding('));
  for (const kind of ['first', 'middle', 'long', 'single']) assert.ok(buttons.includes(`button("${kind}"`));
  assert.match(body, /recommendationActionButtons/);
  assert.doesNotMatch(body, /Всё время|Последняя неделя.*callback_data/);
  assert.doesNotMatch(body, /pulse:weeklyplayer|callback_data: "pulse:players"|callback_data: "pulse:dynamics"/);
});
