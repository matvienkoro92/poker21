"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function fixture() {
  const mod={exports:{}}, snapshots=[];
  vm.runInNewContext(fs.readFileSync(require.resolve('../lib/api-handlers/cron-table-subscriptions'),'utf8'),{
    module:mod,Buffer,console,process:{env:{CRON_SECRET:'secret'}},
    require:name=>name==='../report-table-subscriptions'?{poll:async tables=>{snapshots.push(tables);return {sent:1,complete:true};}}:require(name),
  });
  return {snapshots,request:async(method,body,auth='secret')=>{
    const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.body=data;}};
    await mod.exports({method,body,headers:{'x-cron-secret':auth}},res);return res;
  }};
}
test('report dispatch accepts authenticated snapshots, rejects invalid input and has no upstream fetch',async()=>{
  const f=fixture(),tables=[{deskId:'1',playerCount:2}];
  assert.equal((await f.request('GET')).code,405);
  assert.equal((await f.request('POST',{tables},'wrong')).code,403);
  assert.equal((await f.request('POST',{tables:[null]})).code,400);
  assert.equal((await f.request('POST',{})).code,400);
  const result=await f.request('POST',{tables});assert.equal(result.code,200);assert.equal(result.body.complete,true);
  assert.equal(f.snapshots.length,1);assert.deepEqual(f.snapshots[0],tables);
});
