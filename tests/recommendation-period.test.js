const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const source = require('node:fs').readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');
function context(periods, redisPipeline = async commands => commands.map(() => ({ result: null }))) {
  const ctx = { redisPipeline, require: p => require('../lib/' + p.replace('../', '')), availableBoundReportPeriods: () => periods,
    insightRowsForBinding: p => p.directory.clubs[0].playerRows, displayIso: String, escapeTelegramHtml: String, formatRake: String,
    telegram: async (method, payload) => payload };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function recommendationActionButtons('), source.indexOf('async function sendClubExport(')), ctx);
  vm.runInContext(source.slice(source.indexOf('function playerContributionText('), source.indexOf('async function enqueueWeeklySummaries(')), ctx);
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
    ['weeklyhistory:attention:0', 'weeklyhistory:inactive:0', 'weeklyhistory:analysis:0']);
  assert.ok(ctx.recommendationActionButtons(result).every(row => row.length === 1));
  assert.equal(ctx.recommendationActionButtons(result)[1][0].text, '💤 Перестали играть');
  const summary = await ctx.weeklySummary('1', binding);
  assert.match(summary.text, /<b>Краткий вывод:<\/b>/);
  assert.match(summary.text, /<b>⚠️ Проработать<\/b>/);
  assert.match(summary.text, /Из 5 игроков/);
  assert.doesNotMatch(summary.text, /Что делать|Краткий итог/);
  const analysis = await ctx.sendPlayerHistory('1', binding, 'analysis', 0, 2);
  assert.deepEqual(Array.from(analysis.reply_markup.inline_keyboard.slice(0,3), r=>r[0].callback_data), ['weeklyhistory:key:0','weeklyhistory:growth:0','weeklyhistory:decline:0']);
  assert.equal(summary.reply_markup.inline_keyboard.length, 4);
  const submenu = await ctx.sendPlayerHistory('1', binding, 'inactive', 0, 2);
  assert.match(submenu.text, /Не играли в отчётную неделю: 3/);
  assert.ok(submenu.reply_markup.inline_keyboard.every(row => row.length === 1));
  assert.ok(submenu.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'weeklyhistory:first:0'));
  const list = await ctx.sendPlayerHistory('1', binding, 'single', 99, 2);
  assert.match(list.text, /first \(first\)/);
  assert.match(list.text, /long \(long\)/);
  assert.match(list.text, /страница 1\/1/);
  assert.ok(list.reply_markup.inline_keyboard.flat().some(b => b.callback_data === 'weeklyhistory:inactive:0'));
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

test('reviewed signals leave the summary but remain accessible with reversible status controls',async()=>{
  const periods=fixtures();
  periods.forEach((p,i)=>{p.directory.clubs[0].playerRows=i===1?[{id:'gone',nick:'Gone',active:true,rake:200}]:[]});
  const memory=new Map();const redis=async commands=>commands.map(([cmd,key,value])=>cmd==='GET'?{result:memory.get(key)||null}:(memory.set(key,value),{result:'OK'}));
  const ctx=context(periods,redis),binding={type:'club',clubId:'club',club:'Club'};
  const r=ctx.playerHistoryForBinding(binding),p=r.attention[0];
  const review=require('../lib/weekly-recommendations');
  let summary=await ctx.weeklySummary('chat',binding);
  assert.match(summary.text,/• ⭐ Gone \(gone\) — не играл в отчётную неделю/);
  await review.save(redis,'chat',binding,r,review.token(binding,r,p),'checked','admin');
  summary=await ctx.weeklySummary('chat',binding);
  assert.doesNotMatch(summary.text,/• ⭐ Gone \(gone\)/);
  assert.match(summary.text,/Проверено — 1/);
  const list=await ctx.sendPlayerHistory('chat',binding,'attention',0,1);
  assert.match(list.text,/Gone/);assert.match(list.text,/Проверено/);
  const card=await ctx.sendWeeklySignal('chat',binding,r,p,1);
  assert.match(card.text,/Что проверить/);
  assert.equal(card.reply_markup.inline_keyboard.filter(row=>row[0].callback_data.startsWith('weeklysignal:')).length,2);
  assert.ok(!card.reply_markup.inline_keyboard.flat().some(button=>button.callback_data.startsWith('weeklysignal:open:')));
});

test('signal callback rejects non-admin changes and stale buttons before writing',async()=>{
  const periods=fixtures();periods.forEach((p,i)=>{p.directory.clubs[0].playerRows=i===1?[{id:'p',nick:'P',active:true,rake:100}]:[]});
  const binding={type:'club',clubId:'club',club:'Club'};let writes=0,admin=false;
  const ctx=context(periods,async commands=>commands.map(([cmd])=>{if(cmd==='SET')writes++;return {result:cmd==='SET'?'OK':null}}));
  const r=ctx.playerHistoryForBinding(binding),review=require('../lib/weekly-recommendations');
  const token=review.token(binding,r,r.attention[0]);
  Object.assign(ctx,{getPulseBinding:async()=>binding,isTelegramChatAdmin:async()=>admin});
  const body=source.slice(source.indexOf('  const signalCallback ='),source.indexOf('  const exportCallback ='));
  vm.runInContext(`async function handleSignal(callbackQuery,res) { ${body} }`,ctx);
  const res={status(){return this},json(value){return value}};
  const callback=(action,t=token)=>({id:'cb',data:`weeklysignal:${action}:${t}`,from:{id:42},message:{message_id:1,chat:{id:'chat'}}});
  await ctx.handleSignal(callback('checked'),res);assert.equal(writes,0);
  admin=true;await ctx.handleSignal(callback('checked','0'.repeat(24)),res);assert.equal(writes,0);
  await ctx.handleSignal(callback('checked'),res);assert.equal(writes,1);
  await ctx.handleSignal(callback('view'),res);assert.equal(writes,1);
});

test('key submenu exposes shared groups with working list and back navigation',async()=>{
 const periods=fixtures();periods.forEach((p,i)=>{p.directory.clubs[0].playerRows=[{id:'a',nick:'A',active:true,rake:100},...(i===0?[{id:'b',nick:'B',active:true,rake:1000}]:[])];});
 const ctx=context(periods),binding={type:'club',clubId:'club',club:'Club'};
 const menu=await ctx.sendPlayerHistory('chat',binding,'key',0,1);
 assert.deepEqual(Array.from(menu.reply_markup.inline_keyboard.slice(0,4),r=>r[0].callback_data),['weeklyhistory:stablekey:0','weeklyhistory:newkey:0','weeklyhistory:support:0','weeklyhistory:keyall:0']);
 for(const kind of ['stablekey','newkey','support','keyall']){
  const list=await ctx.sendPlayerHistory('chat',binding,kind,0,1);
  assert.ok(list.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='weeklyhistory:key:0'));
  assert.match(list.text,/Всего:/);
 }
});

test('legacy core agrees with recommendation keys and calendar rake',()=>{
 const periods=fixtures();periods.forEach((p,i)=>{p.directory.clubs[0].playerRows=[{id:'p',nick:'P',active:true,rake:10},...(i===4?[{id:'old',nick:'Old',active:true,rake:100000}]:[])];});
 const ctx=context(periods),binding={type:'club',clubId:'club',club:'Club'};
 Object.assign(ctx,{CLUB_ANALYSIS_START_DATE:'2020-01-01',insightPeriods:()=>periods,insightActiveMap:p=>new Map(p.directory.clubs[0].playerRows.map(r=>[r.id,r]))});
 vm.runInContext(source.slice(source.indexOf('function clubHistoryAnalysis('),source.indexOf('function analysisOwner(')),ctx);
 const legacy=ctx.clubHistoryAnalysis(binding),weekly=ctx.playerHistoryForBinding(binding);
 assert.deepEqual(Array.from(legacy.core,p=>p.id),Array.from(weekly.key,p=>p.id));
 assert.equal(legacy.totalRake,weekly.fourWeekTotal);
 assert.equal(legacy.core[0].activeWeeks,4);
});
