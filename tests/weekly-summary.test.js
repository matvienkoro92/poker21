const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../lib/api-handlers/telegram-report-webhook.js'), 'utf8');
const data = require('../data/union-periods.json').periods.find(p => p.startDate === '2026-08-31');
function harness() {
  const calls = [];
  const ctx = vm.createContext({
    latestUnionData: data, APP_ORIGIN: 'https://example.test',
    getDiamondSales: async () => 0,
    reportPeriodLine: () => '31.08.2026–06.09.2026', displayIso: s => s,
    formatRake: n => Number(n).toFixed(2), formatRake4: n => Number(n).toFixed(4),
    formatInteger: n => String(Math.round(n)), formatPercent: n => String(n), escapeTelegramHtml: s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
    telegram: async (method, body) => { calls.push({ method, body }); return { ok: true }; },
    telegramPhotoUpload: async (chatId, item) => { calls.push({ method: 'uploadPhoto', body: { chat_id: chatId, photo: item.media, caption: item.caption } }); return { ok: true }; },
  });
  for (const constant of ['CHINESE_RAKE_RULES', 'KICKBACK_GROUPS']) {
    const start = source.indexOf(`const ${constant} = [`);
    vm.runInContext(source.slice(start, source.indexOf('\n];', start) + 3), ctx);
  }
  for (const name of ['adjustedJackpotLeagues', 'calculateChineseRake', 'sendOverview', 'sendJackpot', 'sendCalculations', 'sendChineseRake', 'sendShareDistribution', 'sendKickbacks', 'romanKickbackTotal', 'getClubReportGroups', 'getUnionReportGroups', 'formatClubTotals', 'formatUnionTotals', 'sendOverlays']) {
    const match = new RegExp(`(?:async )?function ${name}\\(`).exec(source);
    const end = source.indexOf('\n}', match.index) + 2;
    vm.runInContext(source.slice(match.index, end), ctx);
  }
  return { ctx, calls };
}
test('overview exposes the unresolved difference and includes Jackpot 21', async () => {
  const { ctx, calls } = harness();
  await ctx.sendOverview(1, data);
  const text = calls[0].body.text;
  for (const value of ['186245.42', '124163.62', '490562.60', '-953624.77', '383899.70', '20276.67', '-318827.50', '-67294.26']) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /Корректировка|ИТОГО: 0\.00/);
});
test('jackpot and raw reconciliation agree on all three jackpot categories', async () => {
  const { ctx, calls } = harness();
  await ctx.sendJackpot(1, 1, data);
  await ctx.sendCalculations(1, 1, data);
  assert.ok(calls[0].body.text.includes('490562.60'));
  assert.ok(calls[0].body.text.includes('67285.86'));
  assert.ok(calls[1].body.text.includes('717265.50'));
  assert.ok(calls[1].body.text.includes('193416.90'));
  assert.ok(calls[1].body.text.includes('-67294.29'));
});
test('kickback breakdown includes every nonzero club once and agrees with overview', async () => {
  const { ctx, calls } = harness();
  await ctx.sendKickbacks(1, data);
  const text = calls[0].body.text;
  assert.ok(text.includes('20276.67'));
  for (const report of data.clubReports.reports) {
    const m = report.metrics;
    if (Math.abs(m.commission * (m.servicePercent - 8) / 100) < .005) continue;
    assert.equal(text.split(`${report.club} ${m.servicePercent}%`).length - 1, 1, report.club);
  }
  const roman = ctx.getClubReportGroups(data).groups.find(g => g.recipient === 'Роман');
  const expected = roman.reports.reduce((s,r) => s + r.metrics.commission * (r.metrics.servicePercent - 8) / 100, 0);
  assert.ok(Math.abs(ctx.romanKickbackTotal(data) - expected) < .00001);
});
test('club and union totals preserve kopecks and all reports', () => {
  const { ctx } = harness();
  for (const [groupFn, formatFn, payload] of [['getClubReportGroups', 'formatClubTotals', data.clubReports], ['getUnionReportGroups', 'formatUnionTotals', data.leagueReports]]) {
    const groups = ctx[groupFn](data).groups;
    const groupedTotal = groups.flatMap(g => g.reports).reduce((s,r) => s+r.metrics.total,0);
    assert.ok(Math.abs(groupedTotal - payload.reports.reduce((s,r) => s+r.metrics.total,0)) < .00001);
    const text = ctx[formatFn](groups, data);
    for (const g of groups) for (const r of g.reports) assert.ok(text.includes(Number(r.metrics.total).toFixed(2)));
  }
});
test('share command images exist and overlay output fits a Telegram message', async () => {
  const { ctx, calls } = harness();
  await ctx.sendChineseRake(1,data); await ctx.sendShareDistribution(1,data); await ctx.sendOverlays(1,1,data);
  assert.equal(calls.filter(c => c.method === 'uploadPhoto').length, 2);
  assert.equal(calls.filter(c => c.method === 'sendPhoto').length, 0);
  for (const {body} of calls.filter(c => c.method === 'uploadPhoto')) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', new URL(body.photo).pathname)));
    assert.ok(body.caption.length <= 1024);
  }
  assert.ok(calls[2].body.text.length < 4096);
  assert.ok(calls[2].body.text.includes('318827.50'));
});

 test('photo upload sends image bytes as multipart instead of a remote photo URL', async () => {
  const context = vm.createContext({
    FormData, Blob, BOT_TOKEN: 'test-token', console,
    fetch: async (url, options) => {
      if (url === 'https://example.test/report.png') return { ok: true, blob: async () => new Blob(['image-bytes'], { type: 'image/png' }) };
      assert.equal(url, 'https://api.telegram.org/bottest-token/sendPhoto');
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('chat_id'), '1');
      assert.equal(options.body.get('caption'), 'Report');
      assert.equal(options.body.get('parse_mode'), 'HTML');
      assert.equal(await options.body.get('photo').text(), 'image-bytes');
      return { json: async () => ({ ok: true }) };
    },
  });
  for (const name of ['downloadTelegramMedia', 'telegramPhotoUpload']) {
    const start = source.indexOf(`async function ${name}(`);
    vm.runInContext(source.slice(start, source.indexOf('\n}', start) + 2), context);
  }
  assert.equal((await context.telegramPhotoUpload(1, { media: 'https://example.test/report.png', caption: 'Report', parse_mode: 'HTML' })).ok, true);
});
