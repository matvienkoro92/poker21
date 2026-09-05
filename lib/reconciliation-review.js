const { createHash } = require('crypto');
function fingerprint(issue, items, accounts) {
  const relevant = accounts.filter(a => issue.includes(a.name) || issue.includes(a.id));
  const ids = new Set(relevant.map(a => String(a.id)));
  const evidence = items.filter(i => issue.includes(String(i.id)) || ids.has(String(i.owner?.chatId)) || ids.has(String(i.payer?.chatId)))
    .map(i => ({ id: i.id, status: i.status, amount: i.amountCents, operation: i.balanceOperation, confirmedAt: i.confirmedAt }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const balances = relevant.map(a => ({ id: a.id, balance: a.balance, mainBalance: a.mainBalance, transfers: a.transfers, mainHistory: a.mainHistory })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return createHash('sha256').update(JSON.stringify({ issue, evidence, balances })).digest('hex');
}
module.exports = { fingerprint };
