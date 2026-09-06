const { isConfigured, pipeline } = require('./redis');
const updates = new (require('node:async_hooks').AsyncLocalStorage)();
function markRequisitesChanged() { const state = updates.getStore(); if (state) state.changed = true; }
async function withRequisiteUpdates(work, telegram, renderRegistry) {
  return updates.run({ changed: false }, async () => {
    try { return await work(); }
    finally { if (updates.getStore().changed) await refreshRequisiteMenus(telegram, renderRegistry); }
  });
}
const key = chatId => `poker21:telegram-report:pulse-menu:${chatId}`;

function balanceButtonText(balance) {
  const parts = [];
  for (const [value, symbol] of [[balance?.cents, '₽'], [balance?.usdCents, '$']]) {
    if (value != null && (Number(value) !== 0 || symbol === '₽')) {
      parts.push(`${(Number(value) / 100).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${symbol}`);
    }
  }
  return `💰 Клубный баланс: ${parts.join(' · ') || 'не задан'}`;
}

function requisiteButtonText(count, balance) {
  const amount = balanceButtonText({ cents: balance?.paymentCents ?? 0 }).replace('💰 Клубный баланс: ', '');
  return `💳 Реквизиты${count == null ? '' : ` — ${count}`}, баланс ${amount}`;
}

async function trackMenu(method, body, result) {
  if (!isConfigured() || !(result?.ok || /message is not modified/i.test(result?.description || '')) || !['sendMessage', 'editMessageText', 'editMessageCaption', 'editMessageMedia', 'deleteMessage'].includes(method)) return;
  const messageId = result.result?.message_id || body.message_id;
  if (!messageId) return;
  try {
    const markup = body.reply_markup;
    if (markup?.inline_keyboard?.flat().some(button => button.callback_data === 'pulse:balance')) {
      await pipeline([['SET', key(body.chat_id), JSON.stringify({ messageId, markup })]], { context: 'pulse-menu.track', timeoutMs: 2000 });
    } else if (markup?.inline_keyboard?.flat().some(button => button.callback_data === 'paymenu:place')
      && markup.inline_keyboard.flat().some(button => button.callback_data === 'paymenu:remove')) {
      await pipeline([['SET', key(body.chat_id), JSON.stringify({ messageId, kind: 'registry', text: body.text ?? body.caption, markup })]], { context: 'pulse-menu.registry.track', timeoutMs: 2000 });
    } else if (method !== 'sendMessage') {
      await pipeline([['EVAL', "local v=redis.call('GET',KEYS[1]); if v and tostring(cjson.decode(v).messageId)==ARGV[1] then redis.call('DEL',KEYS[1]) end; return 1", '1', key(body.chat_id), String(messageId)]], { context: 'pulse-menu.clear', timeoutMs: 2000 });
    }
  } catch (error) { console.warn('pulse-menu.track', error.message); }
}

async function currentRequisites() {
  const index = await pipeline([['LRANGE', 'poker21:telegram-report:payment-details:index', '0', '99']], { context: 'pulse-menu.requisites', timeoutMs: 2000 });
  if (!Array.isArray(index?.[0]?.result)) throw new Error('Cannot read requisites index');
  const ids = [...new Set(index?.[0]?.result || [])];
  if (!ids.length) return [];
  const rows = await pipeline(ids.map(id => ['GET', `poker21:telegram-report:payment-details:${id}`]), { context: 'pulse-menu.requisites.read', timeoutMs: 2000 });
  if (!Array.isArray(rows) || rows.some(row => row.error)) throw new Error('Cannot read requisites');
  return rows.map(row => { try { return JSON.parse(row.result); } catch (_) { return null; } }).filter(Boolean);
}

function requisiteCount(items, chatId) {
  return items.filter(item => {
    if (!['open', 'claimed', 'awaiting_receipt', 'paid'].includes(item.status)) return false;
    const expired = ['claimed', 'awaiting_receipt'].includes(item.status) && item.claimedAt && Date.now() - Date.parse(item.claimedAt) >= 15 * 60000;
    return item.status === 'open' || expired || String(item.owner?.chatId) === String(chatId) || String(item.payer?.chatId) === String(chatId);
  }).length;
}

async function refreshMenu(chatId, telegram, items, renderRegistry) {
  if (!isConfigured()) return;
  try {
    const values = await pipeline([
      ['GET', key(chatId)], ['GET', `poker21:telegram-report:chat-balance:${chatId}`], ['GET', `poker21:telegram-report:chat-balance-usd:${chatId}`],
      ['GET', `poker21:telegram-report:payment-balance:${chatId}`], ['GET', `poker21:telegram-report:payment-balance-usd:${chatId}`],
    ], { context: 'pulse-menu.refresh', timeoutMs: 2000 });
    if (!values?.[0]?.result) return;
    const menu = JSON.parse(values[0].result);
    if (menu.kind === 'registry') {
      if (!renderRegistry) return;
      const payload = await renderRegistry(chatId);
      if (!payload || payload.text === menu.text && JSON.stringify(payload.reply_markup) === JSON.stringify(menu.markup)) return;
      // Do not overwrite a screen the user navigated away from while rendering.
      const latest = await pipeline([['GET', key(chatId)]], { context: 'pulse-menu.registry.check', timeoutMs: 2000 });
      if (latest?.[0]?.result !== values[0].result) return;
      const sent = await telegram('editMessageText', { ...payload, chat_id: chatId, message_id: menu.messageId });
      if (sent?.ok || /message is not modified/i.test(sent?.description || '')) {
        await pipeline([['EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) end; return 1", '1', key(chatId), values[0].result,
          JSON.stringify({ ...menu, text: payload.text, markup: payload.reply_markup })]], { context: 'pulse-menu.registry.updated', timeoutMs: 2000 });
      } else if (/message to edit not found|message can't be edited|bot was blocked|chat not found/i.test(sent?.description || '')) {
        await pipeline([['EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('DEL',KEYS[1]) end; return 1", '1', key(chatId), values[0].result]], { context: 'pulse-menu.registry.expired', timeoutMs: 2000 });
      }
      return;
    }
    const originalMarkup = JSON.stringify(menu.markup);
    const text = balanceButtonText({ cents: values[1]?.result, usdCents: values[2]?.result });
    for (const button of menu.markup.inline_keyboard.flat()) if (button.callback_data === 'pulse:balance') button.text = text;
    for (const button of menu.markup.inline_keyboard.flat()) if (button.callback_data === 'paymenu:list') {
      const count = requisiteCount(items || await currentRequisites(), chatId);
      button.text = requisiteButtonText(count, { paymentCents: values[3]?.result, paymentUsdCents: values[4]?.result });
    }
    if (JSON.stringify(menu.markup) === originalMarkup) return;
    const sent = await telegram('editMessageReplyMarkup', { chat_id: chatId, message_id: menu.messageId, reply_markup: menu.markup });
    if (sent?.ok) await pipeline([['EVAL', "local v=redis.call('GET',KEYS[1]); if v and tostring(cjson.decode(v).messageId)==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]) end; return 1", '1', key(chatId), String(menu.messageId), JSON.stringify(menu)]], { context: 'pulse-menu.updated', timeoutMs: 2000 });
  } catch (error) { console.warn('pulse-menu.refresh', error.message); }
}

async function refreshRequisiteMenus(telegram, renderRegistry) {
  if (!isConfigured()) return;
  try {
    const items = await currentRequisites();
    const keys = new Set(); let cursor = '0';
    do {
      const rows = await pipeline([['SCAN', cursor, 'MATCH', 'poker21:telegram-report:pulse-menu:*', 'COUNT', '100']], { context: 'pulse-menu.scan', timeoutMs: 2000 });
      const page = rows?.[0]?.result;
      if (!Array.isArray(page)) return;
      cursor = String(page[0]); for (const k of page[1]) keys.add(k);
    } while (cursor !== '0');
    const chats = [...keys].map(k => k.slice('poker21:telegram-report:pulse-menu:'.length));
    for (let i=0;i<chats.length;i+=4) await Promise.all(chats.slice(i,i+4).map(chat => refreshMenu(chat, telegram, items, renderRegistry)));
  } catch (error) { console.warn('pulse-menu.requisites.refresh', error.message); }
}

module.exports = { balanceButtonText, requisiteButtonText, trackMenu, refreshMenu, refreshRequisiteMenus, requisiteCount, markRequisitesChanged, withRequisiteUpdates };
