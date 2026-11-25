'use strict';
const credit=require('./club-credit');
const crypto = require('node:crypto');
const {pipeline} = require('./redis');
const {authRequired,parseBody} = require('./api-auth');
const clubs = new Map(require('../data/union-directory.json').clubs.map(c=>[String(c.id),c.name]));
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
  return {id:String(auth.identity.id), username:login(auth.identity.telegramUsername),
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
async function withdrawalRequest(action,clubId,userId,item,receipt){
  const key=process.env.POKER21_WITHDRAWALS_SYNC_KEY;
  if(!key)fail('Связь с реестром выводов не настроена.',503);
  const response=await fetch('https://poker-app-ebon.vercel.app/api/poker21-withdrawals',{
    method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({action,clubId,userId,item,receipt})
  });
  if(!response.ok){
    const detail=await response.json().catch(()=>({}));
    fail(detail.error||'Реестр выводов временно недоступен.',[400,403,409].includes(response.status)?response.status:503);
  }
  return response.json();
}
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  try{
    if(req.method!=='POST')return res.status(405).end();
    const identity=authenticate(req),id=identity.id,body=parseBody(req);
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
        return res.json({weeks:require('./club-requisite-weeks').weeklyReport(items,date,new Set(ids))});
      }
      if(['dashboard','balances'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id) || (body.action==='dashboard' && role(state.clubs[clubId],id)!=='owner'))fail('Сводка доступна администратору своего клуба.');
        const service=require('./api-handlers/telegram-report-webhook');
        if(body.action==='balances')return res.json(await service.clubBalances(clubId,role(state.clubs[clubId],id)==='owner'));
        return res.json(await service.clubDashboard(clubId,false));
      }
      if(['list','place','take','paid','cancel','remove','confirm','reject','receipt'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id))fail('Активируйте ключ этого клуба.');
        if(['take','paid','cancel','remove'].includes(body.action) && String(body.item).startsWith('withdrawal:'))
          return res.json(await withdrawalRequest(body.action,clubId,id,body.item.slice('withdrawal:'.length),body.receipt));
        if(['paid','cancel','confirm','reject','receipt'].includes(body.action))
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body));
        const legacyItem=['remove','take'].includes(body.action) && String(body.item).startsWith('legacy:');
        if(body.action==='place'||(['remove','take'].includes(body.action)&&!legacyItem))
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body));
        const ledgerKey='poker21:club-cabinet:requisites:'+clubId;
        const [stored]=await run([['GET',ledgerKey]]);
        const items=stored?JSON.parse(stored):[];
        if(body.action==='list'){
          const registry=await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body);
          const legacy=items.filter(x=>!x.taker||x.taker===id||x.by===id).map(x=>({id:'legacy:'+x.id,amount:x.amount,mine:x.by===id,taker:!!x.taker,...(x.by===id||x.taker===id?{details:x.details}:{})}));
          registry.items.push(...legacy);
          try{
            const withdrawals=await withdrawalRequest('list',clubId,id);
            registry.items.push(...withdrawals.items);
          }catch{
            registry.withdrawalError=true;
          }
          return res.json(registry);
        }
        {
          const item=items.find(x=>'legacy:'+x.id===body.item);
          if(body.action==='remove'){
            if(!item||item.by!==id||item.taker)fail('Можно снять только свою свободную заявку.',409);
            items.splice(items.indexOf(item),1);
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
module.exports={handler,change,describe,hasClubPaymentAccess};
