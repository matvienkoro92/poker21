const {test}=require('node:test');
const assert=require('node:assert/strict');
const {analyze}=require('../lib/player-movements');
const player=(id='1',nick='P')=>({playerId:id,nick,rake:10});
const club=(clubId,ids)=>({clubId,club:clubId,playerRows:ids.map(id=>player(id))});
const league=(leagueId,clubs,players=[])=>({leagueId,league:leagueId,clubs,players});
const period=(day,leagues)=>({startDate:`2020-08-${day}`,endDate:`2020-08-${String(Number(day)+6).padStart(2,'0')}`,leaguePlayerTops:{leagues}});
const binding={type:'club',clubId:'a'};
test('distinguishes new appearance, earlier presence and simultaneous observation by ID',()=>{
 const ps=[period('24',[league('L',[club('a',['1','3']),club('b',['1','2','3'])])]),period('17',[league('L',[club('a',['1','2'])])]),period('10',[league('L',[club('b',['2'])])])];
 const r=analyze(ps,binding);
 const byId=Object.fromEntries(r.players.map(p=>[p.id,p]));
 assert.equal(byId['1'].chronology,'later');assert.equal(byId['1'].sourceActive,true);
 assert.equal(byId['2'].chronology,'earlier');assert.equal(byId['2'].sourceActive,false);
 assert.equal(byId['2'].firstSeen,'2020-08-10');assert.equal(byId['2'].origins[0].clubId,'b');
 assert.equal(byId['3'].chronology,'same');assert.equal(byId['3'].origins.length,2);
 assert.equal(byId['1'].destinations[0].firstDate,'2020-08-24');
});
test('union view excludes internal movements and keeps unknown-club external evidence',()=>{
 const ps=[period('24',[league('L',[club('a',['1']),club('b',['1'])],[player()]),league('X',[],[player()])])];
 const r=analyze(ps,{type:'union',leagueId:'L'});
 assert.equal(r.players.length,1);assert.equal(r.players[0].destinations.length,1);
 assert.equal(r.players[0].destinations[0].leagueId,'X');assert.equal(r.players[0].destinations[0].clubId,undefined);
 assert.equal(r.players[0].sourceActive,true);
});
test('deduplicates directory and league detail, and does not use nickname or membership as activity',()=>{
 const p=period('24',[league('L',[club('a',['1']),club('b',['2'])],[player('1'),player('2')])]);
 p.directory={clubs:[{id:'a',name:'a',playerRows:[{id:'1',nick:'P',rake:10}]}]};
 assert.equal(analyze([p],binding).players.length,0);
 p.leaguePlayerTops.leagues.push(league('X',[],[{...player('1'),rake:0,clubs:['Elsewhere']}]));
 assert.equal(analyze([p],binding).players.length,0);
});
test('missing source data is unknown and unfinished reports are excluded',()=>{
 const ps=[period('24',[league('X',[],[player()])]),period('17',[league('L',[club('a',['1'])])]),{startDate:'2099-01-01',endDate:'2099-01-07',leaguePlayerTops:{leagues:[league('L',[club('a',['1'])])]}}];
 const r=analyze(ps,binding);assert.equal(r.players[0].sourceActive,null);assert.equal(r.latest.startDate,'2020-08-24');
 assert.equal(r.players[0].lastSource,'2020-08-17');
});
test('past external appearances remain visible as historical, not current moves',()=>{
 const r=analyze([period('24',[league('L',[club('a',['1'])])]),period('17',[league('X',[],[player()])])],binding);
 assert.equal(r.players[0].currentOutside,false);assert.equal(r.currentCount,0);
 assert.equal(r.players[0].history.length,2);
});

test('detailed screens paginate all destinations and only expose the bound cohort',async()=>{
 const fs=require('fs'),vm=require('vm');
 const source=fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'),'utf8');
 const ps=[period('24',[league('L',[club('a',['1'])]),...Array.from({length:8},(_,i)=>league('X'+i,[club('b'+i,['1','2'])]))])];
 const ctx=vm.createContext({require:p=>require('../lib/'+p.replace('../','')),unionPeriods:{periods:ps},displayIso:String,escapeTelegramHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;'),telegram:async(method,payload)=>payload});
 vm.runInContext(source.slice(source.indexOf('function movementPlaceText('),source.indexOf('function playerHistoryForBinding(')),ctx);
 const b={...binding,club:'A'};
 const list=await ctx.sendPlayerMovements('chat',b,0,9);
 assert.ok(list.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='playermove:1:0'));
 assert.ok(!list.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='playermove:2:0'));
 const detail=await ctx.sendPlayerMovementDetails('chat',b,'1',0,9);
 assert.equal(detail.message_id,9);
 assert.ok(detail.reply_markup.inline_keyboard.flat().some(b=>b.callback_data==='playermove:1:1'));
 const next=await ctx.sendPlayerMovementDetails('chat',b,'1',1,9);
 assert.match(next.text,/b7/);
 const unauthorized=await ctx.sendPlayerMovementDetails('chat',b,'2',0,9);
 assert.doesNotMatch(unauthorized.text,/\(2\)/);
});
