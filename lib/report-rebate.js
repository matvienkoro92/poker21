"use strict";

function reportRebateLines(metrics, formatMoney) {
  if (metrics?.rebate == null) return [];
  const value = Number(metrics.rebate);
  if (!Number.isFinite(value)) throw new Error("Invalid report rebate");
  return [`Рибейт 10% (выигрыш + рейк): ${value > 0 ? "+" : ""}${formatMoney(value)}`];
}

module.exports = { reportRebateLines };
