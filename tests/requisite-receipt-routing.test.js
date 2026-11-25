const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../lib/api-handlers/telegram-report-webhook'), 'utf8');
const select = vm.runInNewContext(source.slice(source.indexOf('function selectReceiptRequest('), source.indexOf('async function takeRegisteredPayment(')) + '\nselectReceiptRequest');
const first = {status:'awaiting_receipt', payer:{chatId:'123'}, receiptPromptMessageId:'10'};
const second = {...first, receiptPromptMessageId:'11'};

test('multiple pending receipts require a unique reply in the payer chat', () => {
  const items = [first, second, {...first, payer:{chatId:'456'}}, {...second, status:'paid'}];
  assert.equal(select(items,'123'), null);
  assert.equal(select(items,'123',99), null);
  assert.equal(select(items,'123',10), first);
  assert.equal(select(items,'123',11), second);
  assert.equal(select([first,{...first}],'123',10), null);
});

test('one pending receipt accepts a standalone upload but ignores replies to unrelated messages', () => {
  assert.equal(select([first],'123'), first);
  assert.equal(select([first],'123',99), null);
  assert.equal(select([first],'456'), null);
});
