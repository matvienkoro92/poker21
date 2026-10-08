'use strict';
const {randomUUID} = require('node:crypto');
const {createClassifier} = require('./live-table-classification');
const classify = createClassifier();
const PREFIX = 'club:sub:';
const games = {NLH:'Холдем',PLO4:'PLO4',PLO5:'PLO5',PLO6:'PLO6',Durak:'Дурак',TwentyOne:'21',OFC:'OFC',Ceka:'Сека'};
const escape = value => String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function parseLimit(text) {
  const match = String(text).trim().match(/^(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)(?:\s*[р₽])?$/i);
  if (!match) return null;
  const small = Number(match[1].replace(',','.')), big = Number(match[2].replace(',','.'));
  return small > 0 && big >= small ? {small,big} : null;
}
function gameOf(table) {
  if (classify(table).category === 'tournaments') return null;
  const type = String(table.playType || '').trim();
  if (/^NLH(?: |$)/i.test(type) || type === '6+') return 'NLH';
  if (/^PLO[456]$/i.test(type)) return type.toUpperCase();
  return ({durak:'Durak',tweneyone:'TwentyOne',twentyone:'TwentyOne','21':'TwentyOne',ofc:'OFC',ceka:'Ceka'})[type.toLowerCase()] || null;
}
const tableKey = t => [t.leagueId,t.unionId,t.groupId,t.deskId].map(String).join(':');
function matches(sub, tables) {
  return tables.filter(t => String(t.leagueId) === '184691' && Number(t.playerCount) > 0 && t.deskId != null).filter(t => {
    if (sub.kind === 'player') return Object.values(t.pos || {}).some(id => String(id).trim() === sub.playerId);
    if (gameOf(t) !== sub.game) return false;
    if (sub.mode === 'any') return true;
    const limit = parseLimit(t.blindAnnotation);
    return limit && (sub.mode === 'from' ? limit.big >= sub.limit.big : limit.small === sub.limit.small && limit.big === sub.limit.big);
  });
}
function describe(sub) {
  return sub.kind === 'player' ? `${sub.nick || 'Игрок'} (${sub.playerId})` : `${games[sub.game]} · ${sub.mode === 'any' ? 'любой лимит' : (sub.mode === 'from' ? 'от ' : '') + sub.limit.small + '/' + sub.limit.big + 'р'}`;
}
function create({redis, send, getTables, getNames, namespace}) {
  const key = 'poker21:table-subscriptions:' + namespace + ':';
  let username;
  async function run(commands) {
    const rows = await redis.pipeline(commands, {context:'table-subscriptions',throwOnError:true});
    if (!rows || rows.some(row => row.error)) throw new Error('Subscription storage unavailable');
    return rows;
  }
  const read = async k => (await run([['GET',key+k]]))[0]?.result;
  const decode = raw => raw ? JSON.parse(raw) : null;
  const list = async user => decode(await read('user:'+user)) || [];
  const write = async (user, subs) => run([['SET',key+'user:'+user,JSON.stringify(subs)], [subs.length ? 'SADD' : 'SREM',key+'users',String(user)]]);
  async function exclusive(id, work) {
    const token = randomUUID(), lock = key+'lock:'+id;
    if ((await run([['SET',lock,token,'NX','EX','55']]))[0]?.result !== 'OK') return false;
    try { return await work(); }
    finally { await run([['EVAL',"if redis.call('GET',KEYS[1]) == ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",'1',lock,token]]); }
  }
  async function getUsername() {
    if (!username) username = (await send('getMe', {})).result?.username;
    if (!username) throw new Error('Bot username unavailable');
    return username;
  }
  const button = (text,action) => ({text,callback_data:PREFIX+action});
  async function save(user, sub) {
    const subs = await list(user);
    const identity = s => JSON.stringify([s.kind,s.playerId,s.game,s.mode,s.limit]);
    if (subs.some(s => identity(s) === identity(sub))) {
      await run([['DEL',key+'pending:'+user]]);
      return 'Такая подписка уже есть.';
    }
    if (subs.length >= 20) return 'Можно сохранить до 20 подписок. Удалите одну в «Моих подписках».';
    const tables = await getTables();
    sub.id = randomUUID().slice(0,8);
    sub.seen = matches(sub,tables).map(tableKey);
    sub.createdAt = new Date().toISOString();
    await write(user, [...subs,sub]);
    await run([['DEL',key+'pending:'+user]]);
    return '✅ Подписка включена: ' + describe(sub) + '. Уведомления придут при новых событиях.';
  }
  async function handle(update) {
    const cb = update.callback_query, message = cb?.message || update.message;
    const action = String(cb?.data || '').startsWith(PREFIX) ? cb.data.slice(PREFIX.length) : null;
    const text = String(update.message?.text || '').trim();
    const command = /^\/(?:подписки|subscriptions)(?:@\w+)?$/i.test(text) || /^\/start(?:@\w+)?\s+tablesub$/i.test(text);
    if (!message || (!action && !command && (message.chat.type !== 'private' || !text || text.startsWith('/')))) return false;
    if (!action && !command && !redis.isConfigured()) return false;
    const user = String((cb?.from || update.message?.from)?.id || '');
    if (!/^\d+$/.test(user)) return false;
    if (message.chat.type !== 'private') {
      if (!action) return false;
      await send('answerCallbackQuery', {callback_query_id:cb.id});
      await send('sendMessage', {chat_id:message.chat.id, text:'Подписки и уведомления доступны в личке бота.', reply_markup:{inline_keyboard:[[{text:'🔔 Открыть подписки',url:'https://t.me/'+await getUsername()+'?start=tablesub'}]]}});
      return true;
    }
    if (String(message.chat.id) !== user) return false;
    if (!redis.isConfigured()) {
      if (!action && !command) return false;
      if (cb) await send('answerCallbackQuery',{callback_query_id:cb.id});
      await send('sendMessage',{chat_id:user,text:'Подписки временно недоступны. Попробуйте позже.'});
      return true;
    }
    const pending = !action && !command ? decode(await read('pending:'+user)) : null;
    if (!action && !command && !pending) return false;
    if (cb) await send('answerCallbackQuery',{callback_query_id:cb.id});
    await exclusive('user:'+user,async()=>{
      let content = '🔔 Подписки · Анти-Рег\n\nВыберите событие. Проверяем столы примерно раз в 5 минут. Уже активные столы при включении подписки не вызывают уведомление.';
      let rows = [[button('♠️ Игра и лимит','games')],[button('👤 Игрок сел за стол','player')],[button('Мои подписки','list')]];
      const back = [button('⬅️ Подписки','menu')];
      const setPending = value => run([['SET',key+'pending:'+user,JSON.stringify(value),'EX','600']]);
      if (command || action === 'menu') await run([['DEL',key+'pending:'+user]]);
      else if (action === 'games') {
        content = 'Выберите игру:';
        rows = Object.entries(games).map(([id,label])=>[button(label,'game:'+id)]).concat([back]);
      } else if (action?.startsWith('game:') && games[action.slice(5)]) {
        const game = action.slice(5);
        content = 'Лимит для '+games[game]+':';
        rows = [[button('Любой лимит','add:'+game+':any')],[button('Точный лимит','limit:'+game+':exact')],[button('От указанного лимита','limit:'+game+':from')],back];
      } else if (/^limit:(\w+):(exact|from)$/.test(action || '')) {
        const [,game,mode] = action.split(':');
        if (!games[game]) return;
        await setPending({kind:'game',game,mode});
        content = 'Напишите лимит, например 5/10 или 25/50. Для «от» сравниваем размер большого блайнда.';
        rows = [back];
      } else if (/^add:(\w+):any$/.test(action || '')) {
        const game = action.split(':')[1];
        if (!games[game]) return;
        content = await save(user,{kind:'game',game,mode:'any'});
        rows = [back];
      } else if (action === 'player') {
        await setPending({kind:'player'});
        content = 'Напишите ID или ник игрока. Ники ищем в последних отчётах; подписка привязывается к ID.';
        rows = [back];
      } else if (/^player:\d+$/.test(action || '')) {
        const id = action.slice(7), names = await getNames();
        content = await save(user,{kind:'player',playerId:id,nick:names.get(id)||'Игрок'});
        rows = [back];
      } else if (action === 'list' || /^delete:[a-f0-9]{8}$/.test(action || '')) {
        if (action.startsWith('delete:')) await write(user,(await list(user)).filter(s=>s.id!==action.slice(7)));
        const subs = await list(user);
        content = subs.length ? 'Мои подписки:\n'+subs.map((s,i)=>(i+1)+'. '+describe(s)).join('\n') : 'Подписок пока нет.';
        rows = subs.map((s,i)=>[button('❌ Удалить '+(i+1),'delete:'+s.id)]).concat([back]);
      } else if (pending?.kind === 'game') {
        const limit = parseLimit(text);
        content = limit ? await save(user,{...pending,limit}) : 'Не распознал лимит. Напишите два числа через /, например 5/10.';
        rows = [back];
      } else if (pending?.kind === 'player') {
        const names = await getNames();
        const found = /^\d+$/.test(text) && !/^0+$/.test(text) ? [[text,names.get(text)||'Игрок']] : [...names].filter(([,nick])=>nick.toLocaleLowerCase('ru').includes(text.toLocaleLowerCase('ru'))).slice(0,8);
        content = found.length ? 'Выберите игрока для подписки:' : 'Игрок не найден. Попробуйте другой ник или введите ID.';
        rows = found.map(([id,nick])=>[button((nick+' · '+id).slice(0,60),'player:'+id)]).concat([back]);
      } else return;
      const result = await send(cb ? 'editMessageText' : 'sendMessage',{chat_id:user,...(cb ? {message_id:message.message_id} : {}),text:content,reply_markup:{inline_keyboard:rows}});
      if (!result.ok) throw new Error('Subscription menu delivery failed');
    });
    return true;
  }
  async function poll(sharedTables) {
    return exclusive('poll',async()=>{
      const deadline = Date.now() + 40000;
      const cursor = String(await read('cursor') || '0');
      const queued = decode(await read('queue')) || [];
      const scan = queued.length ? [cursor,queued] : (await run([['SSCAN',key+'users',cursor,'COUNT','100']]))[0]?.result;
      if (!scan || !Array.isArray(scan[1])) throw new Error('Subscription index unavailable');
      if (!scan[1].length) { await run([['SET',key+'cursor',String(scan[0])]]); return {sent:0,complete:String(scan[0]) === '0'}; }
      const tables = sharedTables || await getTables();
      let sent = 0, processed = 0;
      for (const user of scan[1]) {
        if (Date.now() > deadline || sent >= 30) break;
        let userComplete = true;
        const acquired = await exclusive('user:'+user,async()=>{
          const subs = await list(user);
          let changed = false;
          for (const sub of subs) {
            const current = matches(sub,tables), seen = new Set(sub.seen || []);
            const currentKeys = new Set(current.map(tableKey));
            const acknowledged = new Set([...seen].filter(id=>currentKeys.has(id)));
            const departed = [...seen].filter(id=>!currentKeys.has(id));
            if (departed.length) await run(departed.map(id=>['DEL',key+'delivery:'+user+':'+sub.id+':'+id]));
            let complete = true;
            for (const table of current.filter(t=>!seen.has(tableKey(t)))) {
              if (Date.now() > deadline || sent >= 30) { complete = false; break; }
              const delivery = key+'delivery:'+user+':'+sub.id+':'+tableKey(table);
              if ((await run([['SET',delivery,'pending','NX','EX','86400']]))[0]?.result !== 'OK') { acknowledged.add(tableKey(table)); continue; }
              try {
                const title = sub.kind === 'player' ? '👤 '+(sub.nick||'Игрок')+' ('+sub.playerId+') сел за стол' : '♠️ Появился активный стол';
                const response = await send('sendMessage',{chat_id:user,text:'<b>'+escape(title)+'</b>\n<b>'+escape(table.deskName)+(table.blindAnnotation ? ' '+escape(table.blindAnnotation)+'р' : '')+'</b>\n'+escape(table.playType)+' · Игроков: '+escape(table.playerCount),parse_mode:'HTML',reply_markup:{inline_keyboard:[[button('Мои подписки','list')]]}});
                if (!response.ok) {
                  if (response.error_code === 403) { await write(user,[]); return; }
                  throw new Error('Telegram delivery failed');
                }
                sent++;
                acknowledged.add(tableKey(table));
              } catch (error) { await run([['DEL',delivery]]); throw error; }
            }
            if (seen.size !== acknowledged.size || [...seen].some(id=>!acknowledged.has(id))) {
              sub.seen = [...acknowledged];
              changed = true;
            }
            if (!complete) { userComplete = false; break; }
          }
          // Polling never changes membership: only save a changed seating snapshot.
          if (changed) await run([['SET',key+'user:'+user,JSON.stringify(subs)]]);
        });
        if (acquired === false || !userComplete) break;
        processed++;
      }
      await run([['SET',key+'cursor',String(scan[0])],['SET',key+'queue',JSON.stringify(scan[1].slice(processed))]]);
      return {sent,complete:processed === scan[1].length && String(scan[0]) === '0'};
    });
  }
  return {handle,poll};
}
module.exports = {create,parseLimit,matches,describe,PREFIX};
