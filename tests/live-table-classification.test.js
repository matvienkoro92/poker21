const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClassifier}=require('../lib/live-table-classification');
const report=require('../data/live-table-report-types.json');
const overlays=require('../data/union-overlay-summary.json').tournaments;
const classify=createClassifier({report,overlays,schedule:[{text:'Понедельник\n18:00 МСК · Мэджик\nБай-ин: 500 ₽ · Гарантия: 170 000 ₽'}]});
const table=(deskName,playType='NLH',leagueId='184691')=>({deskName,playType,leagueId});
test('report and schedule names take precedence over NLH/PLO variants',()=>{
 for(const name of ['ОК🎰','ОК','DV Rebuy','Sat💸Big Boss💸','Satellite 1 ticke10к','Турнир Понедельника','Турнир  Понедельника стол 2','Tournament PLO6','Потяни 21','Мэджик']) {
   assert.equal(classify(table(name)).category,'tournaments',name);
 }
 assert.equal(classify(table('Tournament PLO6','PLO6')).category,'tournaments');
});
test('SNG is other, never MTT or cash, including report aliases',()=>{
 for(const name of ['Heads Up','A game for Three','500 SNG','СНГ 1000','MTT SNG']) assert.equal(classify(table(name)).category,'other',name);
 assert.equal(classify(table('unnamed','SNG-NLH')).category,'other');
 assert.equal(classify(table('unnamed','MTT-PLO6')).category,'tournaments');
});
test('only holdem/omaha cash variants enter cash; fees and large blinds do not imply MTT',()=>{
 for(const type of ['NLH','NLH 3-1','6+','PLO4','PLO5','PLO6']) assert.equal(classify({...table('Вход 2500₽ Double',type),entryFees:0,blindAnnotation:'1000/2000'}).category,'cash');
 for(const type of ['Durak','TweneyOne','21','OFC','Thirteen','Ceka','Unknown','']) assert.equal(classify(table('Обычный стол',type)).category,'other',type);
});
test('short report aliases are exact and scoped, not substring matches',()=>{
 assert.equal(classify(table('ОК🎰','NLH','999')).category,'cash');
 assert.equal(classify(table('МОК cash','NLH')).category,'cash');
 assert.equal(classify(table('Мой стол','NLH')).category,'cash');
});
