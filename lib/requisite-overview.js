const defaultTakingFeeBps = 100;
function parseTakingFee(value) {
  const match = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const bps = Number(match[1]) * 100 + Number((match[2] || '').padEnd(2, '0'));
  return bps <= 10000 ? bps : null;
}
function takingFeeCents(amount, bps = defaultTakingFeeBps) {
  return Math.round(amount * bps / 10000);
}

function availability(balance, limit, items, chatId) {
  const reserved = items.filter(i => String(i.owner?.chatId) === String(chatId) && i.currency !== 'usd' && ['open', 'claimed', 'awaiting_receipt', 'paid'].includes(i.status))
    .reduce((sum, i) => sum + Number(i.amountCents || 0), 0);
  const amount = Math.max(0, balance + limit - reserved);
  return { balance, limit, reserved, available: amount, perRequest: Math.min(3000000, amount) };
}

function reconcile(items, accounts) {
  const expected = new Map();
  const issues = [];
  const add = (id, value) => expected.set(String(id), (expected.get(String(id)) || 0) + value);
  for (const item of items) {
    if(item.status==='voided'&&item.currency!=='usd'){
      // A transferred posting is still part of the historical requisites balance.
      // Its reversal affected the main ledger.
      for(const [i,side] of ['payer','owner'].entries()){
        if(item.reversal?.sides?.[i]?.movedAt)add(item[side].chatId,item.balanceOperation[side+'DeltaCents']);
      }
    }
    if (item.status !== 'confirmed' || item.currency === 'usd') continue;
    const amount = Number(item.amountCents);
    const op = item.balanceOperation;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !item.owner?.chatId || !item.payer?.chatId) {
      issues.push(`Сделка ${item.id}: неполные или неверные данные`); continue;
    }
    const feeBps = parseTakingFee(op?.feePercent ?? 1);
    if (op && ((op.ownerFeeCents !== undefined && op.ownerFeeCents !== 0) || op.ownerDeltaCents !== -amount - (op.ownerFeeCents ?? op.feeCents) || op.payerDeltaCents !== amount - op.feeCents || feeBps === null || op.feeCents !== takingFeeCents(amount, feeBps))) issues.push(`Сделка ${item.id}: комиссия или изменения балансов не совпадают с суммой`);
    add(item.owner.chatId, op?.ownerDeltaCents ?? -amount);
    add(item.payer.chatId, op?.payerDeltaCents ?? amount);
  }
  for (const account of accounts) {
    const lastMain = account.mainHistory.find(e => Number.isFinite(e.cents));
    if (account.mainBalance != null && lastMain && lastMain.cents !== account.mainBalance) issues.push(`${account.name}: основной баланс не совпадает с последней записью истории`);
    const mainTransfers = account.mainHistory.filter(e => ['Перенос из баланса реквизитов','Перенос в баланс реквизитов'].includes(e.comment));
    for (const entry of mainTransfers) {
      if (!account.transfers.some(t => t.operationId === entry.operationId && Number(t.rub?.cents) === -Number(entry.rub?.cents))) issues.push(`Перенос ${entry.operationId}, ${account.name}: нет обратной записи в реквизитах`);
    }
    for (const transfer of account.transfers) {
      const delta = Number(transfer.rub?.cents || 0);
      add(account.id, delta);
      const matches = mainTransfers.filter(e => e.operationId === transfer.operationId);
      if (matches.length !== 1 || Number(matches[0]?.rub?.cents) !== -delta) issues.push(`Перенос ${transfer.operationId}, ${account.name}: не совпадают записи двух балансов`);
    }
    const wanted = expected.get(String(account.id)) || 0;
    if (wanted !== account.balance) issues.push(`${account.name}: баланс реквизитов ${(account.balance / 100).toFixed(2)} ₽, по истории ${(wanted / 100).toFixed(2)} ₽`);
    expected.delete(String(account.id));
  }
  for (const [id, value] of expected) if (value !== 0) issues.push(`Счёт ${id}: есть операции, но нет счёта в сверке`);
  return issues;
}
module.exports = { availability, reconcile, defaultTakingFeeBps, parseTakingFee, takingFeeCents };
