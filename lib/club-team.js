'use strict';
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
function role(club,id){return club?.owner===id?'owner':club?.staff.includes(id)?'staff':'';}
function describe(state,id) {
  const roster=c=>[c.owner,...c.staff].filter(Boolean).map(user=>({
    id:user,label:c.names?.[user]||user,role:c.owner===user?'owner':'staff'
  }));
  const memberships=Object.entries(state.clubs).filter(([,c])=>role(c,id)).map(([clubId,c])=>({
    clubId,name:clubs.get(clubId)||clubId,role:role(c,id),members:roster(c)
  }));
  return {memberships,...(issuers.has(id)?{directory:Array.from(clubs,([clubId,name])=>({
    clubId,name,members:state.clubs[clubId]?roster(state.clubs[clubId]):[]
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
  if(action==='staff' && c?.staff.includes(target))fail('Менеджер уже подключён.',409);
  for(const [k,v] of Object.entries(state.invites))if(v.clubId===clubId && (action==='owner'?v.role==='owner':v.role==='staff'&&v.target===target))delete state.invites[k];
  if(action==='revoke'){if(c){c.staff=c.staff.filter(s=>s!==target);if(c.owner===target)c.owner=null;if(c.names)delete c.names[target];}return {};}
  state.clubs[clubId] ||= {owner:null,staff:[]};
  const key=crypto.randomBytes(18).toString('base64url');
  state.invites[hash(key)]={clubId,target,role:action,by:id,issuedAt:Math.floor(Date.now()/1000),until:Date.now()+86400000};
  return {key};
}
async function run(commands){
  const rows=await pipeline(commands,{throwOnError:true,context:'club-cabinet'});
  if(!rows || rows.length!==commands.length || rows.some(r=>r.error))throw Error('Storage unavailable');
  return rows.map(r=>r.result);
}
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store');
  try{
    if(req.method!=='POST')return res.status(405).end();
    const identity=authenticate(req),id=identity.id,body=parseBody(req);
    for(let retry=0;retry<5;retry++){
      const [raw]=await run([['GET',stateKey]]);
      const state=raw?JSON.parse(raw):{clubs:{},invites:{}};
      if(body.action==='status')return res.json(describe(state,id));
      if(['dashboard','balances'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id) || (body.action==='dashboard' && role(state.clubs[clubId],id)!=='owner'))fail('Сводка доступна администратору своего клуба.');
        const d=await require('./api-handlers/telegram-report-webhook').clubDashboard(clubId);
        return res.json(body.action==='dashboard'?d:{accounts:d.accounts.map(({rub,usd,paymentRub,paymentUsd})=>({rub,usd,paymentRub,paymentUsd})),balanceError:d.balanceError});
      }
      if(['list','place','take'].includes(body.action)){
        const clubId=String(body.clubId||'');
        if(!clubs.has(clubId)||!role(state.clubs[clubId],id))fail('Активируйте ключ этого клуба.');
        const legacyTake=body.action==='take' && String(body.item).startsWith('legacy:');
        if(body.action==='place'||(body.action==='take'&&!legacyTake))
          return res.json(await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body));
        const ledgerKey='poker21:club-cabinet:requisites:'+clubId;
        const [stored]=await run([['GET',ledgerKey]]);
        const items=stored?JSON.parse(stored):[];
        if(body.action==='list'){
          const registry=await require('./api-handlers/telegram-report-webhook').cabinetRequisites(clubId,id,body);
          const legacy=items.filter(x=>!x.taker||x.taker===id||x.by===id).map(x=>({id:'legacy:'+x.id,amount:x.amount,mine:x.by===id,taker:!!x.taker,...(x.by===id||x.taker===id?{details:x.details}:{})}));
          registry.items.push(...legacy);
          return res.json(registry);
        }
        {
          const item=items.find(x=>'legacy:'+x.id===body.item);
          if(!item||item.by===id||(item.taker && item.taker!==id))fail('Заявка недоступна.',409);
          item.taker=id;
        }
        const [ok]=await run([['EVAL',"if redis.call('GET',KEYS[1])~=ARGV[1] or (redis.call('GET',KEYS[2]) or '')~=ARGV[2] then return 0 end redis.call('SET',KEYS[2],ARGV[3]);return 1",2,stateKey,ledgerKey,raw,stored||'',JSON.stringify(items)]]);
        if(Number(ok))return res.json({ok:true});
      }else{
        const result=change(state,id,body,identity);
        const [ok]=await run([['EVAL',"if (redis.call('GET',KEYS[1]) or '')~=ARGV[1] then return 0 end redis.call('SET',KEYS[1],ARGV[2]);return 1",1,stateKey,raw||'',JSON.stringify(state)]]);
        if(Number(ok))return res.json({...describe(state,id),...result});
      }
    }
    fail('Данные изменились. Повторите действие.',409);
  }catch(e){return res.status(e.status||503).json({error:e.status?e.message:'Кабинет временно недоступен.'});}
}
module.exports={handler,change,describe};
