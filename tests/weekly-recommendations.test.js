const {test}=require('node:test');
const assert=require('node:assert/strict');
const review=require('../lib/weekly-recommendations');
const {analyze}=require('../lib/weekly-activity');
const binding={type:'club',clubId:'test-review'};
const history=()=>[{startDate:'2026-08-24',endDate:'2026-08-30',rows:[]},{startDate:'2026-08-17',rows:[{id:'p',nick:'P',active:true,rake:100}]}];
function storage(){const map=new Map();return async cmds=>cmds.map(([cmd,key,value])=>cmd==='GET'?{result:map.get(key)||null}:(map.set(key,value),{result:'OK'}));}
test('review persists, is reversible, and is isolated by chat, binding and report',async()=>{
 const db=storage(),r=analyze(history()),p=r.attention[0],token=review.token(binding,r,p);
 assert.ok(Buffer.byteLength(`weeklysignal:checked:${token}`)<=64);
 await review.save(db,'chat',binding,r,token,'checked','admin');
 assert.equal((await review.read(db,'chat',binding,r)).p.status,'checked');
 assert.equal((await review.read(db,'other',binding,r)).p.status,'open');
 const other={type:'union',leagueId:binding.clubId};
 assert.equal(await review.save(db,'chat',other,r,token,'watch','admin'),null);
 await review.save(db,'chat',binding,r,token,'watch','admin');
 assert.equal((await review.read(db,'chat',binding,r)).p.status,'watch');
 await review.save(db,'chat',binding,r,token,'open','admin');
 assert.equal((await review.read(db,'chat',binding,r)).p.status,'open');
 const newer=history();newer[0].startDate='2026-08-31';
 assert.equal(await review.save(db,'chat',binding,analyze(newer),token,'checked','admin'),null);
 const corrected=history();corrected[1].rows[0].rake=200;
 assert.notEqual(review.token(binding,analyze(corrected),analyze(corrected).attention[0]),token);
});
test('storage failure cannot be acknowledged as a saved status',async()=>{
 const r=analyze(history());await assert.rejects(review.save(async()=>[],'chat',binding,r,review.token(binding,r,r.attention[0]),'checked','admin'),/сохранить/);
});
test('cache reuses analysis and invalidates when report references, scope or TTL change',()=>{
 let builds=0;const periods=history(),build=()=>({count:++builds});const b={type:'club',clubId:'cache-test'};
 assert.equal(review.cached(b,periods,build,0).count,1);
 assert.equal(review.cached(b,[...periods],build,1).count,1);
 assert.equal(review.cached(b,[{...periods[0]},periods[1]],build,2).count,2);
 assert.equal(review.cached({...b,clubId:'other'},periods,build,3).count,3);
 assert.equal(review.cached(b,periods,build,400000).count,4);
});
