const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const source=require('node:fs').readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
function context(periods) {
  const ctx={require: p=>require('../lib/'+p.replace('../','')),availableBoundReportPeriods:()=>periods,insightRowsForBinding:p=>p?.rows||[],consecutiveWeeklyPeriods:()=>true,formatRake:String};
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('function recommendationActionButtons('),source.indexOf('async function sendPlayerHistory(')),ctx);
  return ctx;
}
test('recommendations have one stable action keyboard without a period selector',()=>{
  const ctx=context([]);
  const buttons=ctx.recommendationActionButtons().flat();
  assert.deepEqual(Array.from(buttons, b=>b.callback_data), ['weeklyhistory:contact:0','weeklyhistory:risk:0','weeklyhistory:growth:0','weeklyhistory:stopped:0']);
  assert.ok(!buttons.some(b=>/время|недел/i.test(b.text)));
});
test('recommendations compare only the two latest reports',()=>{
  const periods=['2026-08-24','2026-08-17','2026-08-10','2026-08-03'].map((startDate,i)=>({startDate,rows:[{id:'1',nick:'A',rake:i?100:30,active:true}]}));
  const ctx=context(periods);
  const week=ctx.playerHistoryForBinding({});
  assert.equal(week.risk[0].previous,100);
  assert.equal(week.risk[0].current,30);
  assert.equal(week.risk[0].baselineWeeks,1);
  assert.equal(ctx.playerHistoryForBinding({}).single.length,0);
});
