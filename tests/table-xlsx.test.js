const { test } = require('node:test');
const assert = require('node:assert/strict');
const { workbook } = require('../lib/table-xlsx');
test('XLSX contains typed numbers, escaped literal strings, filters and freeze pane',()=>{
  const bytes=workbook(['ID','Сумма','Ник'],[['001',-123.45,'=SUM(A1)&<x>']]);
  assert.equal(bytes.readUInt32LE(0),0x04034b50);
  const text=bytes.toString();
  assert.match(text,/<v>-123.45<\/v>/);
  assert.match(text,/001<\/t>/);
  assert.match(text,/=SUM\(A1\)&amp;&lt;x&gt;/);
  assert.doesNotMatch(text,/<f>/);
  assert.match(text,/autoFilter ref="A1:C2"/);
  assert.match(text,/state="frozen"/);
});
