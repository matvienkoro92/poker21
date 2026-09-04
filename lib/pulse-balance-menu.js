const { isConfigured, pipeline } = require('./redis');
const key = chatId => `poker21:telegram-report:pulse-menu:${chatId}`;

function balanceButtonText(balance) {
  const parts = [];
  for (const [value, symbol] of [[balance?.cents, '₽'], [balance?.usdCents, '$']]) {
    if (value != null && (Number(value) !== 0 || symbol === '₽')) {
      parts.push(`${(Number(value) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${symbol}`);
    }
  }
  return `💰 Баланс: ${parts.join(' · ') || 'не задан'}`;
}

async function trackMenu(method, body, result) {
  if (!isConfigured() || !result?.ok || !['sendMessage', 'editMessageText', 'editMessageCaption', 'editMessageMedia', 'deleteMessage'].includes(method)) return;
  const messageId = result.result?.message_id || body.message_id;
  if (!messageId) return;
  try {
    const markup = body.reply_markup;
    if (markup?.inline_keyboard?.flat().some(button => button.callback_data === 'pulse:balance')) {
      await pipeline([['SET', key(body.chat_id), JSON.stringify({ messageId, markup })]], { context: 'pulse-menu.track', timeoutMs: 2000 });
    } else if (method !== 'sendMessage') {
      await pipeline([['EVAL', "local v=redis.call('GET',KEYS[1]); if v and tostring(cjson.decode(v).messageId)==ARGV[1] then redis.call('DEL',KEYS[1]) end; return 1", '1', key(body.chat_id), String(messageId)]], { context: 'pulse-menu.clear', timeoutMs: 2000 });
    }
  } catch (error) { console.warn('pulse-menu.track', error.message); }
}

async function refreshMenu(chatId, telegram) {
  if (!isConfigured()) return;
  try {
    const values = await pipeline([
      ['GET', key(chatId)], ['GET', `poker21:telegram-report:chat-balance:${chatId}`], ['GET', `poker21:telegram-report:chat-balance-usd:${chatId}`],
    ], { context: 'pulse-menu.refresh', timeoutMs: 2000 });
    if (!values?.[0]?.result) return;
    const menu = JSON.parse(values[0].result);
    const text = balanceButtonText({ cents: values[1]?.result, usdCents: values[2]?.result });
    for (const button of menu.markup.inline_keyboard.flat()) if (button.callback_data === 'pulse:balance') button.text = text;
    await telegram('editMessageReplyMarkup', { chat_id: chatId, message_id: menu.messageId, reply_markup: menu.markup });
  } catch (error) { console.warn('pulse-menu.refresh', error.message); }
}

module.exports = { balanceButtonText, trackMenu, refreshMenu };
