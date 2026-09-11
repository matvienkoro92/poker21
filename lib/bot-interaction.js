const { AsyncLocalStorage } = require('async_hooks');
const { randomUUID } = require('crypto');
const context = new AsyncLocalStorage();

function parentOf(data) {
  if (/^pulse:(insight:|week$|month$)/.test(data)) return 'pulse:dynamics';
  if (data === 'pulse:dynamics' || data === 'pulse:analysis') return 'pulse:analytics';
  if (/^pulse:(player:|players:|search:)/.test(data)) return 'pulse:players';
  if (/^pulse:(unionclubs:|globalclub:)/.test(data)) return 'pulse:unionclubs';
  if (/^(paymenu:|payreq:)/.test(data)) return 'paymenu:list';
  if (/^pulse:analysis:/.test(data)) return 'pulse:analysis';
  return 'pulse:menu';
}

function navigation(method, body) {
  const state = context.getStore();
  const cb = state?.update?.callback_query;
  if (!cb?.message || String(body.chat_id) !== String(cb.message.chat.id)) return { method, body };
  const data = String(cb.data || '');
  const browsing = /^(pulse:|clubinsight:|paymenu:|payreq:(view|list):)/.test(data);
  if (body.reply_markup?.force_reply) return { method, body };
  if (!browsing || !['sendMessage', 'editMessageText', 'editMessageCaption'].includes(method)) return { method, body };
  const next = { ...body };
  if (method === 'sendMessage') {
    method = 'editMessageText';
    next.message_id = cb.message.message_id;
    delete next.reply_to_message_id;
  }
  const rows = next.reply_markup?.inline_keyboard?.map(row => row.map(button => ({ ...button }))) || [];
  const callbacks = rows.flat().map(b => b.callback_data);
  const parent = parentOf(data);
  if (parent !== data && !callbacks.includes(parent) && parent !== 'pulse:menu') rows.push([{ text: '⬅️ Назад', callback_data: parent }]);
  if (data !== 'pulse:menu' && !callbacks.includes('pulse:menu')) rows.push([{ text: '↩️ Главное меню', callback_data: 'pulse:menu', style: 'danger' }]);
  next.reply_markup = { inline_keyboard: rows };
  return { method, body: next };
}

async function run(req, res, handler, notify) {
  let update;
  try { update = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; } catch (_) { return res.status(400).json({ ok: false }); }
  const state = { update, id: randomUUID().slice(0, 8) };
  return context.run(state, async () => {
    let status = 200;
    let response;
    const proxy = Object.create(res);
    proxy.status = value => { status = value; return proxy; };
    proxy.json = value => { response = value; return proxy; };
    try {
      await handler(req, proxy);
      if (response?.sent === false || status >= 500) throw new Error('Handler did not complete response');
    } catch (error) {
      console.error('bot-command-error', { id: state.id, updateId: update.update_id, message: error.message, stack: error.stack });
      const cb = update.callback_query;
      const chatId = cb?.message?.chat?.id || update.message?.chat?.id;
      const financial = /^(pay|bal|transfer)/.test(String(cb?.data || '')) || cb?.data === 'pulse:balance';
      const hint = financial ? 'Проверьте баланс и историю перед повтором.' : 'Вернитесь назад и выберите раздел и даты заново.';
      const text = `❗ Не удалось завершить запрос.\n${hint}\nКод ошибки: ${state.id}.`;
      let sent = false;
      if (chatId != null) {
        const media = Boolean(cb?.message?.photo?.length || cb?.message?.document || cb?.message?.video);
        const method = cb?.message ? (media ? 'editMessageCaption' : 'editMessageText') : 'sendMessage';
        const body = { chat_id: chatId, ...(cb?.message ? { message_id: cb.message.message_id } : {}),
          ...(media ? { caption: text } : { text }),
          reply_markup: { inline_keyboard: [[{ text: '⬅️ Назад', callback_data: parentOf(String(cb?.data || '')) }]] } };
        const result = await context.run(undefined, () => notify(method, body)).catch(() => null);
        sent = Boolean(result?.ok || /message is not modified/i.test(result?.description || ''));
      }
      if (cb?.id) await notify('answerCallbackQuery', { callback_query_id: cb.id, text: 'Не удалось выполнить запрос. Вернитесь назад.', show_alert: false }).catch(() => {});
      return res.status(sent ? 200 : 503).json({ ok: sent, errorId: state.id });
    }
    return res.status(status).json(response || { ok: true });
  });
}
module.exports = { run, navigation, parentOf };
