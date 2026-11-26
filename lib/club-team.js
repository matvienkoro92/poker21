'use strict';
const credit=require('./club-credit');
const crypto = require('node:crypto');
const {pipeline} = require('./redis');
const {authRequired,parseBody} = require('./api-auth');
const directory=require('../data/union-directory.json');
const latestLeagues=require('../data/union-league-player-tops.json');
const periods=require('../data/union-periods.json').periods;
const rakeArchive=require('../data/union-club-rake-rub.json');
const names=new Map();
const detailed=new Set();
const summaries=new Map();

function addDirectory(rows){
  for(const row of rows){
    const id=String(row.id);
    if(!names.has(id))names.set(id,row.name);
    detailed.add(id);
  }
}
function addSummary(row,start,end,rakeRub){
  const id=String(row.clubId);
  if(!names.has(id))names.set(id,row.club);
  const previous=summaries.get(id);
  if(!previous||previous.period[1]<end)
    summaries.set(id,{summaryOnly:true,name:row.club,rakeRub,activePlayers:row.activePlayers,period:[start,end]});
}
function addLeagues(report){
  for(const league of report?.leagues||[])
    for(const row of league.clubs||[])addSummary(row,report.startDate,report.endDate,row.rakeRub);
}
addDirectory(directory.clubs);
addLeagues(latestLeagues);
for(const period of [...periods].sort((a,b)=>b.endDate.localeCompare(a.endDate))){
  addDirectory(period.directory?.clubs||[]);
  addLeagues(period.leaguePlayerTops);
}
for(const [week,leagues] of Object.entries(rakeArchive).sort(([a],[b])=>b.localeCompare(a))){
  const [start,end]=week.split('_');
  for(const rows of Object.values(leagues))
    for(const row of rows)addSummary(row,start,end,row.rake);
}
const clubs=new Map([...names].sort(([,a],[,b])=>a.localeCompare(b,'ru')));
function cabinetClubName(id){return clubs.get(String(id));}
const issuers = new Set([process.env.CLUB_KEY_ISSUER_ID || '388008256', '5053253480']);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const stateKey = 'poker21:club-cabinet:access:v1';
function fail(message,status=403){throw Object.assign(Error(message),{status});}
function authenticate(req) {
  const initData=String(req.headers['x-telegram-init-data']||'');
  const token=process.env.TELEGRAM_BOT_TOKEN||process.env.telegram_bot_token||process.env.TELEGRAM_TOKEN||process.env.BOT_TOKEN;
  const auth=authRequired({query:{}},{initData},token);
  const age=Date.now()/1000-Number(new URLSearchParams(initData).get('auth_date'));
  if(!auth.ok || !auth.identity.rawInitData || !Number.isFinite(age) || age< -60 || age>86400) fail('Откройте кабинет заново в Telegram.',401);
  return {id:String(auth.identity.id), username:login(auth.identity.telegramUsername), displayName:[auth.identity.firstName,auth.identity.lastName].filter(Boolean).join(" "),
    signedAt:Number(new URLSearchParams(auth.identity.rawInitData).get('auth_date'))};
}
function login(value) {
  const name=String(value||'').trim().replace(/^@/, '').toLowerCase();
  return /^[a-z][a-z0-9_]{0,31}$/.test(name)?'@'+name:'';
}
function memberLabel(club,user){
  return login(club.names?.[user])||'Логин не указан';
}
function syncMemberLogin(state,id,username){
  let changed=false;
  for(const club of Object.values(state.clubs)){
    if(!role(club,id)||(club.names?.[id]||'')===username)continue;
    club.names ||= {};
    if(username)club.names[id]=username;else delete club.names[id];
    changed=true;
  }
  return changed;
}
function role(club,id){return club?.owner===id?'owner':club?.staff.includes(id)?'staff':'';}
const reportOwners=new Set(['388008256','5053253480']);
function describe(state,id) {
  const roster=c=>[c.owner,...c.staff].filter(Boolean).map(user=>({
    id:user,label:memberLabel(c,user),role:c.owner===user?'owner':'staff'
  }));
  const memberships=Object.entries(state.clubs).filter(([,c])=>role(c,id)).map(([clubId,c])=>({
    clubId,name:clubs.get(clubId)||clubId,role:role(c,id),members:roster(c)
  }));
  return {memberships,canInspectClubs:reportOwners.has(id),...(issuers.has(id)?{directory:Array.from(clubs,([clubId,name])=>({
    clubId,name,creditCents:state.clubs[clubId]?.creditCents??null,members:state.clubs[clubId]?roster(state.clubs[clubId]):[]
  }))}:{})};
}
function change(state,id,body,identity={}) {
  for(const [key,i] of Object.entries(state.invites)) if(i.until<=Date.now()) delete state.invites[key];
  if(body.action==='activate'){
    const digest=hash(String(body.key||'').trim()), i=state.invites[digest];
    if(!i || (i.target!==id && !(identity.username && i.target===identity.username)))fail('Ключ недействителен для вашего аккаунта Telegram.');
    if(i.target.startsWith('@') && !(identity.signedAt>=i.issuedAt))fail('Откройте кабинет заново в Telegram, чтобы подтвердить текущий логин.');
    if(!issuers.has(i.by))fail('Запросите новый ключ у организатора.');
    const c=state.clubs[i.clubId];
    if(i.role==='owner'){
      c.owner=id;c.staff=c.staff.filter(s=>s!==id);
      for(const [k,v] of Object.entries(state.invites))if(v.clubId===i.clubId && v.role==='owner')delete state.invites[k];
    }else{
      if(c.owner===id)fail('Вы уже владелец клуба.');
      if(!c.staff.includes(id))c.staff.push(id);
    }
    c.names ||= {};
    if(identity.username)c.names[id]=identity.username;
    delete state.invites[digest];return {};
  }
  const clubId=String(body.clubId||''),rawTarget=String(body.target||'').trim(),action=body.action;
  const target=/^[1-9]\d{0,15}$/.test(rawTarget)?rawTarget:login(rawTarget);
  if(!clubs.has(clubId)||!target)fail('Проверьте клуб и логин Telegram.',400);
  const c=state.clubs[clubId];
  if(!issuers.has(id)||!['owner','staff','revoke'].includes(action))fail('Доступом управляет организатор.');
  const creditCents=credit.parse(body.credit);
  if(action!=='revoke'&&creditCents===null)fail('Укажите кредитный лимит в рублях. Для работы без кредита введите 0.',400);
  if(action==='staff' && c?.staff.includes(target))fail('Менеджер уже подключён.',409);
  for(const [k,v] of Object.entries(state.invites))if(v.clubId===clubId && (action==='owner'?v.role==='owner':v.role==='staff'&&v.target===target))delete state.invites[k];
  if(action==='revoke'){if(c){c.staff=c.staff.filter(s=>s!==target);if(c.owner===target)c.owner=null;if(c.names)delete c.names[target];}return {};}
  state.clubs[clubId] ||= {owner:null,staff:[]};
  state.clubs[clubId].creditCents=creditCents;
  const key=crypto.randomBytes(18).toString('base64url');
  state.invites[hash(key)]={clubId,target,role:action,by:id,issuedAt:Math.floor(Date.now()/1000),until:Date.now()+86400000};
  return {key};
}
async function run(commands){
  const rows=await pipeline(commands,{throwOnError:true,context:'club-cabinet'});
  if(!rows || rows.length!==commands.length || rows.some(r=>r.error))throw Error('Storage unavailable');
  return rows.map(r=>r.result);
}
async function withdrawalRequest(action,clubId,userId,item,receipt,notice,account){
  const key=process.env.POKER21_WITHDRAWALS_SYNC_KEY;
  if(!key)fail('Связь с реестром выводов не настроена.',503);
  const response=await fetch('https://poker-app-ebon.vercel.app/api/poker21-withdrawals',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({action,clubId,userId,item,receipt,notice,account})
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>({}));
    fail(detail.error||'Реестр выводов временно недоступен.',[400,403,409].includes(response.status)?response.status:503);
  }
  return response.json();
}
async function queueClaimNotice(notice){
  const outbox=require('./financial-outbox');
  const kind=notice.kind==='withdrawal-paid'?'withdrawal-paid':'withdrawal-claim';
  const id=kind+':'+notice.id;
  const event={kind,reservationId:notice.id,hasReceipt:notice.hasReceipt===true,club:clubs.get(notice.clubId)||notice.clubId,clubId:notice.clubId,amountCents:notice.amountCents};
  await run([['EVAL',`
    if not redis.call('GET',KEYS[1]) then
      redis.call('ZADD',KEYS[2],0,ARGV[1])
      redis.call('SET',KEYS[1],ARGV[2])
    end
    return 1
  `,2,outbox.PREFIX+id,outbox.DUE,id,JSON.stringify(event)]]);
  await withdrawalRequest('ack-claim-notice',undefined,undefined,undefined,undefined,notice);
}
async function confirmWithdrawal(userId,reservationId){
  if(!reportOwners.has(userId)){
    const [raw]=await run([['GET',stateKey]]);
    if(!JSON.parse(raw||'{}').clubs?.['758417']?.staff?.includes(userId))fail('Доступ к подтверждению закрыт.');
  }
  return withdrawalRequest('telegram-confirm','758417',userId,reservationId);
}
async function withdrawalReceipt(id){
  const result=await withdrawalRequest('notice-receipt',undefined,undefined,id);
  return result.receipt;
}
async function queueDailyDeals(credit,history){
  const {PREFIX,DUE}=require('./financial-outbox');
  const start=Math.floor((credit.confirmedAt+10800000)/86400000)*86400000-10800000;
  const rows=history.filter(c=>c.confirmedAt>=start&&c.confirmedAt<=credit.confirmedAt)
    .sort((a,b)=>a.confirmedAt-b.confirmedAt)
    .map(c=>({payer:clubs.get(c.clubId)||c.clubId,amount:c.amountCents}));
  if(!rows.length)throw Error('Не найдены подтверждённые сделки за день');
  const id='withdrawal-daily:'+credit.id;
  const event={kind:'withdrawal-daily',confirmedAt:credit.confirmedAt,rows};
  await run([['EVAL',`
    if redis.call('EXISTS',KEYS[1])==0 then
      redis.call('ZADD',KEYS[2],ARGV[3],ARGV[1])
      redis.call('SET',KEYS[1],ARGV[2])
    end
    return 1
  `,2,PREFIX+id,DUE,id,JSON.stringify(event),credit.confirmedAt]]);
}
async function settleWithdrawalCredits(clubId){
  if(!process.env.POKER21_WITHDRAWALS_SYNC_KEY)return;
  const {credits}=await withdrawalRequest('pending-credits',clubId);
  const service=require('./api-handlers/telegram-report-webhook');
  let history;
  for(const credit of credits){
    try{
      await service.creditDepositWithdrawal(credit,run);
      history ||= (await withdrawalRequest('confirmed-withdrawals')).credits;
      await queueDailyDeals(credit,history);
      await withdrawalRequest('ack-credit',undefined,undefined,credit.id);
    }catch(error){console.error('withdrawal-credit',credit.id,error.message);}
  }
  if(credits.length)await require('./financial-outbox').drain({budgetMs:8000});
}
async function recoverClaimNotices(){
  if(!process.env.POKER21_WITHDRAWALS_SYNC_KEY)return;
  await settleWithdrawalCredits();
  const {notices}=await withdrawalRequest('pending-claim-notices');
  for(const notice of notices)await queueClaimNotice(notice);
}
async function withdrawalOperation(action,clubId,id,item,receipt,chatId){
          const account=action==='take'?await require('./api-handlers/telegram-report-webhook').withdrawalAccount(clubId,chatId,run):undefined;
          const result=await withdrawalRequest(action,clubId,id,item,receipt,undefined,account);
          if(result.notice){
            try{
              await queueClaimNotice(result.notice);
              await require('./financial-outbox').drain({budgetMs:8000});
            }catch(error){console.error('withdrawal-claim-notice',error.message);}
          }
  return result;
}
async function widgetAccount(id){
  const [raw]=await run([['GET',stateKey]]);
  const memberships=Object.entries(JSON.parse(raw||'{}').clubs||{}).filter(([,c])=>role(c,id));
  if(!memberships.length)return null;
  if(memberships.length>1)return {needsSelection:true};
  const clubId=memberships[0][0];
  const registry=await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,{action:'list'});
  if(!registry.chatId)return {needsSelection:true};
  return {clubId,chatId:registry.chatId,items:registry.items};
}
function widgetTakeToken(account,item){
  return hash(JSON.stringify([account.clubId,account.chatId,item.id,item.amount,item.number,item.bank])).slice(0,32);
}
async function widgetOffers(id){
  const account=await widgetAccount(id);
  if(!account)return {items:[],keyRequired:true};
  const offers=await openRequisites();
  if(!account.needsSelection){
    const native=new Set(account.items.filter(row=>!row.mine&&!row.taker).map(row=>row.id));
    for(const item of offers.items){
      const ownWithdrawal=item.id.startsWith('withdrawal:')&&account.clubId==='758417';
      if(!ownWithdrawal&&(item.id.startsWith('withdrawal:')||native.has(item.id)))item.takeToken=widgetTakeToken(account,item);
    }
  }
  return offers;
}
async function widgetTake(id,token){
  const account=await widgetAccount(id);
  if(!account)fail('Подключите ключ клуба, чтобы видеть реквизиты.',403);
  if(account.needsSelection)fail('Выберите клуб в кабинете.');
  const {items}=await openRequisites();
  const item=items.find(row=>widgetTakeToken(account,row)===token);
  if(!item)fail('Заявка изменилась. Обновите список.',409);
  if(item.id.startsWith('withdrawal:')){
    const result=await withdrawalOperation('take',account.clubId,id,item.id.slice(11),undefined,account.chatId);
    return 'withdrawal:'+result.notice.id;
  }
  await require('./api-handlers/telegram-report-webhook').cabinetRequisites(account.clubId,id,{action:'take',chatId:account.chatId,item:item.id});
  return item.id;
}
function guestOffers({items,withdrawalError}){
  return {items:items.map(({id,bank,amount,currency})=>({id,bank,amount,currency})),withdrawalError};
}
async function openRequisites(){
      const items=await require('./api-handlers/telegram-report-webhook').openRequisites();
      let withdrawalError=false;
      try{
        const withdrawals=await withdrawalRequest('list','758417','0');
        for(const row of withdrawals.items)if(!row.taker)items.push({id:row.id,number:row.number,bank:row.bank,amount:row.amount,currency:'rub'});
      }catch{withdrawalError=true;}
  return {items,withdrawalError};
}
async function collectPublishedOffers(){
  const {items,withdrawalError}=await openRequisites();
  const [raw]=await run([['GET',stateKey]]);
  const recipients=require('./financial-outbox').keyHolders(JSON.parse(raw||'{}').clubs);
  const {PREFIX,DUE}=require('./financial-outbox');
  for(const source of ['cabinet','withdrawal']){
    if(source==='withdrawal' && withdrawalError)continue;
    const offers=items.filter(row=>row.id.startsWith('withdrawal:')===(source==='withdrawal'));
    const events=offers.map(row=>({
      id:row.id,kind:'published-offer',recipients,
      text:['Новая заявка · '+(source==='withdrawal'?'Два Туза':row.publisher||'Poker21'),
        Number(row.amount).toLocaleString('ru-RU')+' '+(row.currency==='usd'?'$':'₽'),row.bank,
        'Посмотреть реквизиты: /реквизиты'].filter(Boolean).join('\n')
    }));
    await run([['EVAL',`
      local initialized=redis.call('EXISTS',KEYS[1])==1
      for _,event in ipairs(cjson.decode(ARGV[1])) do
        local id='published-offer:'..event.id
        if redis.call('SADD',KEYS[1],event.id)==1 and initialized and #event.recipients>0 then
          redis.call('SET',ARGV[2]..id,cjson.encode(event))
          redis.call('ZADD',KEYS[2],0,id)
        end
      end
      redis.call('SADD',KEYS[1],'__initialized')
      return 1
    `,2,'poker21:published-offers:seen:'+source,DUE,JSON.stringify(events),PREFIX]]);
  }
}
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  try{
    if(req.method!=='POST')return res.status(405).end();
    const body=parseBody(req);
    if(body.action==='open-requisites')return res.json(guestOffers(await openRequisites()));
    const identity=authenticate(req),id=identity.id;
    if(['manual-deal-list','manual-deal-post'].includes(body.action)){
      if(!reportOwners.has(id))fail('Раздел доступен главному администратору.');
      const posting=body.action==='manual-deal-post';
      if(posting&&!/^[a-f0-9-]{36}$/i.test(body.reservationId||''))fail('Выберите подтверждённую бронь.',400);
      const {credits}=await withdrawalRequest('confirmed-withdrawals',undefined,undefined,undefined);
      const service=require('./api-handlers/telegram-report-webhook');
      if(!posting)return res.json({credits:credits.map(c=>({...c,name:clubs.get(c.clubId)||c.clubId}))});
      const credit=credits.find(c=>c.id===body.reservationId);
      if(!credit)fail('Подтверждённая бронь не найдена.',409);
      const result=await service.postManualWithdrawal(credit,id,identity.username,run);
      if(result.status!=='legacy'){
        await queueDailyDeals(credit,credits);
        await require('./financial-outbox').drain({budgetMs:8000});
      }
      return res.json(result);
    }
    for(let retry=0;retry<5;retry++){
      const [raw]=await run([['GET',stateKey]]);
      const state=raw?JSON.parse(raw):{clubs:{},invites:{}};
      if(body.action==='status'){
        if(syncMemberLogin(state,id,identity.username)){
          const [saved]=await run([['EVAL',"if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2]);return 1",1,stateKey,raw||'',JSON.stringify(state)]]);
          if(!Number(saved))continue;
        }
        return res.json(describe(state,id));
      }
      if(['issued-clubs','issued-balances','issued-weeks'].includes(body.action)){
        if(!reportOwners.has(id))fail('Раздел доступен владельцу.');
        const ids=Object.keys(state.clubs);
        if(body.action==='issued-clubs'){
          let totals;
          try{totals=await require('./api-handlers/telegram-report-webhook').clubBalanceTotals(ids,run);}
          catch{totals=null;}
          return res.json({balanceError:!totals,clubs:ids.map(clubId=>{
          const c=state.clubs[clubId];
          const members=[c.owner,...c.staff].filter(Boolean).map(user=>memberLabel(c,user));
          const invites=Object.values(state.invites).filter(i=>i.clubId===clubId&&i.until>Date.now()).map(i=>i.target);
          return {clubId,balance:totals?.get(clubId)??null,name:clubs.get(clubId)||clubId,members,invites,creditCents:c.creditCents??null};
        }).sort((a,b)=>a.name.localeCompare(b.name,'ru'))});
        }
        if(body.action==='issued-balances'){
          if(!ids.includes(body.clubId))fail('Клуб не найден.',404);
          return res.json(await require('./api-handlers/telegram-report-webhook').clubBalances(body.clubId,true));
        }
        const date=body.date||new Date(Date.now()+10800000).toISOString().slice(0,10);
        if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))fail('Выберите дату.',400);
        const prefix='poker21:telegram-report:payment-details:',keys=new Set();
        let cursor='0';
        do{
          const [page]=await run([['SCAN',cursor,'MATCH',prefix+'*','COUNT','500']]);
          cursor=String(page[0]);for(const key of page[1])if(key!==prefix+'index')keys.add(key);
        }while(cursor!=='0');
        const all=[...keys],items=[];
        for(let n=0;n<all.length;n+=100){
          const [values]=await run([['MGET',...all.slice(n,n+100)]]);
          for(const value of values)if(value)items.push(JSON.parse(value));
        }
        return res.json({weeks:require('./club-requisite-weeks').weeklyReport(items,date)});
      }
      if(['dashboard','balances'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id) || (body.action==='dashboard' && role(state.clubs[clubId],id)!=='owner'))fail('Сводка доступна администратору своего клуба.');
        const service=require('./api-handlers/telegram-report-webhook');
        if(body.action==='balances')return res.json(await service.clubBalances(clubId,role(state.clubs[clubId],id)==='owner'));
        if(!detailed.has(clubId))return res.json(summaries.get(clubId));
        return res.json(await service.clubDashboard(clubId,false,body.week));
      }
      if(['dialog','message','list','place','take','paid','cancel','remove','confirm','reject','receipt','remind','recheck'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id))fail('Активируйте ключ этого клуба.');
        if(['dialog','message'].includes(body.action)){
          const author=identity.username?'@'+identity.username.replace(/^@/,''):identity.displayName||'Администратор';
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,{...body,author}));
        }
        if(['take','paid','cancel','remove'].includes(body.action) && String(body.item).startsWith('withdrawal:')){
          await withdrawalOperation(body.action,clubId,id,body.item.slice('withdrawal:'.length),body.receipt,body.chatId);
          return res.json({ok:true});
        }
        if(['paid','cancel','confirm','reject','receipt','remind','recheck'].includes(body.action))
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,{...body,actorUsername:identity.username}));
        const legacyItem=['remove','take'].includes(body.action) && String(body.item).startsWith('legacy:');
        if(body.action==='place'||(['remove','take'].includes(body.action)&&!legacyItem))
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body,null,reportOwners.has(id)));
        const ledgerKey='poker21:club-cabinet:requisites:'+clubId;
        const [stored]=await run([['GET',ledgerKey]]);
        const items=stored?JSON.parse(stored):[];
        if(body.action==='list'){
          const registry=await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body);
          const legacy=items.filter(x=>!x.removedByAdmin&&(!x.taker||x.taker===id||x.by===id)).map(x=>({id:'legacy:'+x.id,amount:x.amount,mine:x.by===id,taker:!!x.taker,...(x.by===id||x.taker===id?{details:x.details}:{})}));
          registry.items.push(...legacy);
          try{
            const withdrawals=await withdrawalRequest('list',clubId,id);
            registry.items.push(...withdrawals.items);
          }catch{
            registry.withdrawalError=true;
          }
          return res.json({...registry,canDeleteRequisites:reportOwners.has(id),serverNow:Date.now()});
        }
        {
          const item=items.find(x=>!x.removedByAdmin&&'legacy:'+x.id===body.item);
          if(body.action==='remove'){
            if(!item||(!reportOwners.has(id)&&(item.by!==id||item.taker)))fail('Можно снять только свою свободную заявку.',409);
            if(reportOwners.has(id))item.removedByAdmin=id;
            else items.splice(items.indexOf(item),1);
          }else{
          if(!item||item.by===id||(item.taker && item.taker!==id))fail('Заявка недоступна.',409);
          item.taker=id;
          }
        }
        const [ok]=await run([['EVAL',"if redis.call('GET',KEYS[1])~=ARGV[1] or (redis.call('GET',KEYS[2]) or '')~=ARGV[2] then return 0 end redis.call('SET',KEYS[2],ARGV[3]);return 1",2,stateKey,ledgerKey,raw,stored||'',JSON.stringify(items)]]);
        if(Number(ok))return res.json({ok:true});
      }else{
        let result={};
        if(body.action==='edit-credit'){
          if(!reportOwners.has(id)||!state.clubs[body.clubId])fail('Нет доступа к клубу.');
          const cents=credit.parse(body.credit);
          if(cents===null)fail('Введите неотрицательную сумму с точностью до копейки.',400);
          if((state.clubs[body.clubId].creditCents??null)!==body.previous)fail('Лимит изменился. Откройте список заново.',409);
          state.clubs[body.clubId].creditCents=cents;
          result={creditCents:cents};
        }else result=change(state,id,body,identity);
        const changesCredit=['edit-credit','staff','owner'].includes(body.action);
        const writes=changesCredit?[credit.key(body.clubId),String(state.clubs[body.clubId].creditCents)]:[];

        const [ok]=await run([['EVAL',"if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end redis.call('MSET',KEYS[1],ARGV[2],unpack(ARGV,3));return 1",1,stateKey,raw||'',JSON.stringify(state),...writes]]);
        if(Number(ok))return res.json({...describe(state,id),...result});
      }
    }
    fail('Данные изменились. Повторите действие.',409);
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Кабинет временно недоступен.'});}
}
async function hasClubPaymentAccess(clubId,userId){
  if(!clubId||!userId)return false;
  const [raw]=await run([['GET',stateKey]]);
  return !!role(raw?JSON.parse(raw).clubs[String(clubId)]:null,String(userId));
}
module.exports={collectPublishedOffers,settleWithdrawalCredits,cabinetClubName,widgetOffers,widgetTake,openRequisites,handler,change,describe,hasClubPaymentAccess,recoverClaimNotices,confirmWithdrawal,withdrawalReceipt};
