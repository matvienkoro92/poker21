const { pipeline } = require('./redis');
const { randomUUID } = require('crypto');
const PREFIX = 'poker21:financial-outbox:';
const DUE = `${PREFIX}due`;
const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = value => `${(Number(value) / 100).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;

function messages(event) {
  if (event.kind === 'summary') return [];
  if (event.kind === 'merge') return event.transfers.map(t => ({
    chat_id: String(t.chatId), parse_mode: 'HTML',
    text: `✅ <b>Баланс реквизитов перенесён в основной</b>\nПеренос: ${esc(event.id)}\nСумма: <b>${money(t.amount)}</b>\n\nКлубный баланс: ${money(t.before)} → <b>${money(t.after)}</b>\nБаланс реквизитов: ${money(t.amount)} → <b>0,00 ₽</b>\n\nИстория сохранена. Дополнительная комиссия не списывалась.`,
  }));
  const { item, ownerAfter, payerAfter } = event;
  const fee = item.balanceOperation.feeCents;
  const summary = `✅ <b>Сделка по реквизитам завершена</b>\nСделка: ${esc(item.id)}\nПлательщик: <b>${esc(item.payer.name)}</b>\nВладелец реквизитов: <b>${esc(item.owner.name)}</b>\nСумма: <b>${money(item.amountCents)}</b>\nКомиссия с каждой стороны: ${money(fee)}\nВсего комиссии: <b>${money(fee * 2)}</b>\n\n<b>Итоговые балансы реквизитов:</b>\n${esc(item.payer.name)}: ${money(payerAfter)}\n${esc(item.owner.name)}: ${money(ownerAfter)}`;
  return [...new Set(['-1004472155269', String(item.owner.chatId), String(item.payer.chatId)])].map(chat_id => ({ chat_id, text: summary, parse_mode: 'HTML',
    ...(chat_id === String(item.owner.chatId) && event.ownerMessageId ? { message_id: event.ownerMessageId, reply_markup: { inline_keyboard: [] } } : {}),
  }));
}

async function sendTelegram(body) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
  const method = body.message_id ? 'editMessageText' : 'sendMessage';
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (!result.ok && body.message_id && /message is not modified/i.test(result.description || '')) return { ok: true, result: { message_id: body.message_id } };
  if (!result.ok && body.message_id && /message to edit not found|message can't be edited/i.test(result.description || '')) {
    const { message_id, ...fallback } = body;
    return sendTelegram(fallback);
  }
  return result;
}

async function drain({ redis = pipeline, send = sendTelegram, now = Date.now, budgetMs = 18000 } = {}) {
  const started = now();
  const call = async commands => {
    const rows = await redis(commands, { context: 'financial-outbox', timeoutMs: 3000 });
    if (!Array.isArray(rows) || rows.some(r => r.error)) throw new Error('Outbox storage unavailable');
    return rows.map(r => r.result);
  };
  const [ids] = await call([['ZRANGEBYSCORE', DUE, '-inf', String(now()), 'LIMIT', '0', '10']]);
  let delivered = 0;
  for (const id of ids || []) {
    if (now() - started >= budgetMs) break;
    const key = PREFIX + id;
    const lock = key + ':lock';
    const lease = randomUUID();
    const [acquired] = await call([['SET', lock, lease, 'NX', 'PX', '120000']]);
    if (acquired !== 'OK') continue;
    try {
      const [raw] = await call([['GET', key]]);
      if (!raw) throw new Error('Missing outbox event');
      const event = JSON.parse(raw);
      // Cancel legacy queued broadcasts without sending or deleting their audit history.
      if (event.kind === 'summary') {
        await call([['ZREM', DUE, id], ['SET', key + ':cancelled', String(now())]]);
        continue;
      }
      const payloads = messages(event);
      for (let index = 0; index < payloads.length; index++) {
        if (now() - started >= budgetMs) break;
        const receipt = `${key}:sent:${index}`;
        const [sent] = await call([['GET', receipt]]);
        if (sent) continue;
        let result;
        try { result = await send(payloads[index]); } catch (_) { result = { ok: false, description: 'Telegram response unavailable' }; }
        if (!result.ok) {
          const [attempts] = await call([['INCR', key + ':attempts']]);
          const delay = Math.max(Number(result.parameters?.retry_after || 0) * 1000, Math.min(3600000, 30000 * 2 ** Math.min(Number(attempts), 7)));
          await call([['ZADD', DUE, String(now() + delay), id], ['SET', key + ':error', JSON.stringify({ at: now(), code: result.error_code || 0, message: result.description || 'delivery failed' })]]);
          break;
        }
        await call([['SET', receipt, String(result.result?.message_id || 'sent')]]);
        delivered++;
      }
      const receipts = await call(payloads.map((_, i) => ['GET', `${key}:sent:${i}`]));
      if (receipts.every(Boolean)) await call([['ZREM', DUE, id], ['SET', key + ':delivered', String(now())]]);
    } finally {
      await call([['EVAL', "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", '1', lock, lease]]);
    }
  }
  return { delivered };
}
module.exports = { drain, messages, PREFIX, DUE };
