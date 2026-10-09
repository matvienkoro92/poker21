"use strict";
const fs=require('node:fs');
const commands=[
 ['start','Начать — список команд'],['pulse','Главное меню'],['tables','Столы сейчас'],
 ['online','Игроки онлайн'],['games','Рейк по видам игр'],['unions','Отчёты союзов'],
 ['clubs','Отчёты клубов'],['calculations','Расчёты'],['jackpot','Джекпот'],
 ['overlays','Оверлеи турниров'],['chinese','Китайские союзы'],['share','Распределение доли'],
 ['diamonds','Продажа алмазов'],['schedule','Расписание турниров'],
 ['banners','Банеры турниров'],['reports','Отчёты клуба или союза'],
 ['activity','Активность клуба'],['club_players','Игроки клуба'],
 ['club_race','Гонка клубов'],['club_analysis','Разбор клуба'],
 ['commands','Все команды и справка'],
].map(([command,description])=>({command,description}));
async function main(){
 const env=process.argv.find(x=>x.startsWith('--env='))?.slice(6);
 if(env) for(const line of fs.readFileSync(env,'utf8').split('\n')){
  const i=line.indexOf('=');if(i<1||line.startsWith('#'))continue;
  let v=line.slice(i+1);try{v=JSON.parse(v)}catch{v=v.replace(/^['"]|['"]$/g,'')}
  process.env[line.slice(0,i)]=v;
 }
 if(!process.argv.includes('--apply')){console.log(JSON.stringify(commands,null,2));return;}
 const token=String(process.env.TELEGRAM_BOT_TOKEN||process.env.telegram_bot_token||process.env.TELEGRAM_TOKEN||process.env.BOT_TOKEN||'').trim();
 if(!/^\d+:[A-Za-z0-9_-]+$/.test(token))throw Error('Valid Telegram bot token required');
 async function call(method,body={}){
  const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  const data=await r.json();if(!data.ok)throw Error('Telegram menu update failed');return data.result;
 }
 const me=await call('getMe');
 if(me.username==='Poker_dvatuza_bot')throw Error('Expected Poker21 report bot');
 const menu=await call('getChatMenuButton');
 for(const language_code of ['','ru','en']) await call('setMyCommands',{commands,language_code});
 if(menu.type==='web_app')await call('setChatMenuButton',{menu_button:{...menu,text:'Присоединиться'}});
 else await call('setChatMenuButton',{menu_button:{type:'commands'}});
 const saved=await call('getMyCommands');if(JSON.stringify(saved)!==JSON.stringify(commands))throw Error('Verification failed');
 console.log('Bot menu updated and commands verified');
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
