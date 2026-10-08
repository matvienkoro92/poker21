"use strict";
const {create} = require('./table-subscriptions');
const redis = require('./redis');
const directory = require('../data/union-directory.json');
const names = new Map((directory.players || []).map(p=>[String(p.id),p.nick]));
async function send(method,body) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error('Bot token missing');
  const response = await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});
  const data = await response.json();
  if (!data.ok && method !== 'sendMessage') throw new Error('Telegram request failed');
  return data;
}
const service = create({redis,namespace:'report',send,getNames:async()=>names,getTables:async()=>{
  const response = await fetch('https://poker-app-ebon.vercel.app/api/pokerplus-tables',{signal:AbortSignal.timeout(8000)});
  const data = await response.json();
  if (!response.ok || !data.ok || !Array.isArray(data.tables)) throw new Error('Tables unavailable');
  return data.tables;
}});
module.exports = service;
