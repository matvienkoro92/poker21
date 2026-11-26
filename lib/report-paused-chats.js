"use strict";

// Союз Аквариум — владелец временно приостановил рассылку.
const pausedReportChats = new Set(["-1004358331425"]);

module.exports = (chatId) => pausedReportChats.has(String(chatId));
