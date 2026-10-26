"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { reportRebateLines } = require("../lib/report-rebate");
const money = value => value.toFixed(2);
test("rebate shows the signed settlement adjustment", () => {
  assert.deepEqual(reportRebateLines({ rebate: 10000 }, money), ["Рибейт 10% (выигрыш + рейк): +10000.00"]);
  assert.deepEqual(reportRebateLines({ rebate: -10000 }, money), ["Рибейт 10% (выигрыш + рейк): -10000.00"]);
  assert.deepEqual(reportRebateLines({ rebate: 0 }, money), ["Рибейт 10% (выигрыш + рейк): 0.00"]);
});
test("legacy reports have no new rebate row", () => assert.deepEqual(reportRebateLines({}, money), []));
test("invalid rebate does not become a misleading zero", () => assert.throws(() => reportRebateLines({ rebate: "bad" }, money)));
