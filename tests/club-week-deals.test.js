const test=require('node:test'),assert=require('node:assert/strict');
const {messages}=require('../lib/club-week-deals');
const now=Date.parse('2026-11-29T21:00:00Z');
function deal(id,at){return {id,status:'confirmed',payer:{name:'A'},owner:{name:'B'},confirmedAt:at,currency:'usd',amountCents:10000};}
test('Sunday ends at Moscow midnight, split pages keep the day and credits count once',()=>{
  const first='2026-11-22T21:00:00Z',last='2026-11-29T20:59:59Z';
  const items=Array.from({length:14},(_,i)=>deal(String(i),first));
  items.push(deal('new',new Date(now).toISOString()),deal('old','2026-11-22T20:59:59Z'),{...deal('void',first),status:'voided'},deal('deposit-abc',last));
  const credits=[{id:'abc',clubId:'42',confirmedAt:Date.parse(last),amountCents:300000}];
  const parts=messages(items,credits,new Map(),now,true),text=parts.map(x=>x.text).join('\n');
  assert.equal(parts.length,2);assert.match(parts[1].text,/Понедельник · 23.11.2026/);
  assert.match(text,/Воскресенье · 29.11.2026\n15\. 23:59/);
  assert.match(text,/Сделок за неделю: 15/);assert.match(text,/1\s400,00 \$ \+ 3\s000,00 ₽/);
  assert.equal(parts.flatMap(p=>p.reply_markup.inline_keyboard).length,15);
  const [current]=messages(items,credits,new Map(),now,false);
  assert.match(current.text,/30.11.2026 — 06.12.2026/);assert.match(current.text,/1\. 00:00/);assert.match(current.text,/Сделок за неделю: 1/);
});
test('empty week has seven day headings without deal buttons',()=>{
  const [part]=messages([],[],new Map(),now,true);
  assert.equal(part.text.split('Сделок нет').length-1,7);assert.equal(part.reply_markup,undefined);
});
