const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('node:fs').readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
function context(periods) {
  const ctx={require: p=>require('../lib/'+p.replace('../','')),availableBoundReportPeriods:()=>periods,insightRowsForBinding:p=>p?.rows||[],consecutiveWeeklyPeriods:()=>true,formatRake:String};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function recommendationPeriodButtons('),source.indexOf('async function sendPlayerHistory(')),ctx);
  return ctx;
}
test('selector labels selected period and callbacks remain distinct',()=>{
  const ctx=context([]);
  assert.equal(ctx.recommendationPeriodButtons('week')[0].text,'✅ Последняя неделя');
  assert.equal(ctx.recommendationPeriodButtons('all')[1].text,'✅ Всё время');
  assert.equal(ctx.recommendationPeriodButtons('all')[1].callback_data,'weeklyhistory:overview:0:all');
});
test('week compares two reports, all-time receives every report',()=>{
  const periods=['2026-08-24','2026-08-17','2026-08-10','2026-08-03'].map((startDate,i)=>({startDate,rows:[{id:'1',nick:'A',rake:i?100:30,active:true}]}));
  const ctx=context(periods);
  const week=ctx.playerHistoryForBinding({},'week');
  assert.equal(week.risk[0].previous,100);
  assert.equal(week.risk[0].current,30);
  assert.equal(week.risk[0].baselineWeeks,1);
  const all=ctx.playerHistoryForBinding({},'all');
  assert.equal(all.players[0].activeWeeks,4);
  assert.equal(all.players[0].total,330);
  assert.equal(ctx.playerHistoryForBinding({},'week').single.length,0);
});
