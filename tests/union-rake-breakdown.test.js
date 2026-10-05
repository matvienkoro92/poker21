'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { aggregate, pages } = require('../lib/union-rake-breakdown');
const periods = require('../data/union-periods.json').periods;
test('all non Anti-Reg unions list clubs; newest week union totals stay unchanged', () => {
  const latest = periods.slice().sort((a,b)=>b.endDate.localeCompare(a.endDate))[0];
  const rows = aggregate([latest]);
  assert.equal(Math.round(rows.reduce((s,x)=>s+x.rake,0)*100),449846416);
  assert.equal(rows.find(x=>x.id==='184691').clubs.size,0);
  assert.ok(rows.filter(x=>x.id!=='184691').every(x=>x.clubs.size>0));
  for(const row of rows.filter(x=>x.id!=='184691'))assert.ok(Math.abs(row.rake-[...row.clubs.values()].reduce((s,c)=>s+c.rake,0))<.02,row.name);
  const text = pages([latest],'Рейк').join('\n');
  assert.match(text,/BLACKOUT/); assert.doesNotMatch(text,/Beer and Bear/);
});
test('same club is combined across weeks, with each week exchange rate and escaped names', () => {
  const make = (rate,rake) => ({jackpot:{leagues:[{leagueId:'u',league:'Union',feeTotal:rake,exchangeRate:rate}]},leaguePlayerTops:{leagues:[{leagueId:'u',clubs:[{clubId:'1',club:'<Club>',rake,rakeRub:rake*rate}]}]}});
  const selected=[make(100,2),make(10,3)]; const [row]=aggregate(selected);
  assert.equal(row.rake,230); assert.equal(row.clubs.size,1); assert.equal(row.clubs.get('1').rake,230);
  assert.match(pages(selected,'Header')[0],/&lt;Club&gt; — 230,00/);
});
test('long club breakdown is paginated without dropping clubs or repeating union total in aggregate', () => {
  const clubs=Array.from({length:240},(_,i)=>({clubId:String(i),club:'Club '+i,rake:1}));
  const selected=[{jackpot:{leagues:[{leagueId:'u',league:'Union',feeTotal:240}]},leaguePlayerTops:{leagues:[{leagueId:'u',clubs}]}}];
  const result=pages(selected,'Header'); assert.ok(result.length>1);
  assert.ok(result.every(x=>x.length<4096&&x.includes('Итого рейк: 240,00')));
  for(let i=0;i<240;i++)assert.equal(result.join('\n').split('• Club '+i+' —').length-1,1);
});

test('Telegram union-rake screen renders precise club amounts with unchanged week callbacks', async () => {
 const fs=require('node:fs'),vm=require('node:vm');
 const source=fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
 const code=source.slice(source.indexOf('function unionRakePeriods()'),source.indexOf('function pulseUnionClubsKeyboard('));
 let sent;const context={unionPeriods:{periods},require:()=>require('../lib/union-rake-breakdown'),displayIso:value=>value,telegram:async(method,body)=>{sent=body;return{ok:true}}};
 vm.createContext(context);vm.runInContext(code,context);assert.equal(await context.sendPulseUnionRake(1,2,1n),true);
 assert.match(sent.text,/BLACKOUT/);assert.match(sent.text,/PPC 21 — 69 519,44/);assert.doesNotMatch(sent.text,/Beer and Bear/);
 assert.ok(sent.reply_markup.inline_keyboard.some(row=>row[0].callback_data==='pulse:unionrake:toggle:0:1'));
});
