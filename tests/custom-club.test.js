const test=require('node:test'),assert=require('node:assert/strict');
const {change,describe}=require('../lib/club-team');
test('issuer creates a club by name, selects a duplicate and activates a manager key',()=>{
  const issuer='388008256',state={clubs:{},invites:{}},create={action:'create-club',name:'  Новый   клуб '};
  assert.throws(()=>change(state,'111',create));
  assert.throws(()=>change(state,issuer,{...create,name:'  '}));
  const {selectedClubId:clubId}=change(state,issuer,create);
  assert.equal(change(state,issuer,{...create,name:'новый клуб'}).selectedClubId,clubId);
  assert.equal(describe(state,issuer).directory.find(r=>r.clubId===clubId).name,'Новый клуб');
  const {key}=change(state,issuer,{action:'staff',clubId,target:'111',credit:'0'});
  change(state,'111',{action:'activate',key});
  assert.equal(describe(state,'111').memberships[0].name,'Новый клуб');
});
