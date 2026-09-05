function cost(amount) { return amount + Math.round(amount / 100); }
function availability(balance, limit, items, chatId) {
  const reserved = items.filter(i => String(i.owner?.chatId) === String(chatId) && i.currency !== 'usd' && ['open', 'claimed', 'awaiting_receipt', 'paid'].includes(i.status))
    .reduce((sum, i) => sum + cost(Number(i.amountCents || 0)), 0);
  const room = Math.max(0, balance + limit - reserved);
  let amount = Math.floor(room / 1.01);
  while (cost(amount + 1) <= room) amount++;
  while (amount > 0 && cost(amount) > room) amount--;
  return { balance, limit, reserved, available: amount, perRequest: Math.min(1000000, amount) };
}

function reconcile(items, accounts) {
  const expected = new Map();
  const issues = [];
  const add = (id, value) => expected.set(String(id), (expected.get(String(id)) || 0) + value);
  for (const item of items) {
    if (item.status !== 'confirmed' || item.currency === 'usd') continue;
    const amount = Number(item.amountCents);
    const op = item.balanceOperation;
    if (!Number.isSafeInteger(amount) || amount <= 0 || !item.owner?.chatId || !item.payer?.chatId) {
      issues.push(`Сделка ${item.id}: неполные или неверные данные`); continue;
    }
    if (op && (op.ownerDeltaCents !== -amount - op.feeCents || op.payerDeltaCents !== amount - op.feeCents || op.feeCents !== Math.round(amount / 100))) issues.push(`Сделка ${item.id}: комиссия или изменения балансов не совпадают с суммой`);
    add(item.owner.chatId, op?.ownerDeltaCents ?? -amount);
    add(item.payer.chatId, op?.payerDeltaCents ?? amount);
  }
  for (const account of accounts) {
    const lastMain = account.mainHistory.find(e => Number.isFinite(e.cents));
    if (account.mainBalance != null && lastMain && lastMain.cents !== account.mainBalance) issues.push(`${account.name}: основной баланс не совпадает с последней записью истории`);
    for (const entry of account.mainHistory.filter(e => e.comment === 'Перенос из баланса реквизитов')) {
      if (!account.transfers.some(t => t.operationId === entry.operationId && Number(t.rub?.cents) === -Number(entry.rub?.cents))) issues.push(`Перенос ${entry.operationId}, ${account.name}: нет обратной записи в реквизитах`);
    }
    for (const transfer of account.transfers) {
      const delta = Number(transfer.rub?.cents || 0);
      add(account.id, delta);
      const matches = account.mainHistory.filter(e => e.operationId === transfer.operationId && e.comment === 'Перенос из баланса реквизитов');
      if (matches.length !== 1 || Number(matches[0]?.rub?.cents) !== -delta) issues.push(`Перенос ${transfer.operationId}, ${account.name}: не совпадают записи двух балансов`);
    }
    const wanted = expected.get(String(account.id)) || 0;
    if (wanted !== account.balance) issues.push(`${account.name}: баланс реквизитов ${(account.balance / 100).toFixed(2)} ₽, по истории ${(wanted / 100).toFixed(2)} ₽`);
    expected.delete(String(account.id));
  }
  for (const [id, value] of expected) if (value !== 0) issues.push(`Счёт ${id}: есть операции, но нет счёта в сверке`);
  return issues;
}
module.exports = { availability, reconcile };
