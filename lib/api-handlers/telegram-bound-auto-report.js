"use strict";

const { isConfigured: isRedisConfigured, pipeline: redisPipeline } = require("../redis");
const leagueReports = require("../../data/union-league-reports.json");
const clubReports = require("../../data/union-club-reports.json");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const CRON_SECRET = process.env.CRON_SECRET || "";
const APP_ORIGIN = "https://poker21-app.vercel.app";
const BINDING_PREFIX = "poker21:telegram-report:club-chat:";
const AUTO_REPORT_BLOCKED_CLUB_IDS = new Set(["964699", "577707", "190714"]); // Kings KO, Joker Poker, Collaboration Club
const UNRECORDED_BALANCE_OPERATIONS_KEY = "poker21:telegram-report:balance-operations:unrecorded";

function authorized(req) {
  const auth = String(req.headers?.authorization || "").replace(/^Bearer\s+/i, "").trim();
  const header = String(req.headers?.["x-cron-secret"] || "").trim();
  return Boolean(CRON_SECRET && (auth === CRON_SECRET || header === CRON_SECRET));
}

function format(value) {
  return Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0/g, " ");
}

function balanceAmount(cents, showPlus = false) {
  const value = Number(cents || 0);
  const marker = value > 0 ? "🟢" : value < 0 ? "🔴" : "⚪";
  return `${marker} ${showPlus && value > 0 ? "+" : ""}${format(value / 100)} ₽`;
}

function display(iso) {
  const [year, month, day] = String(iso || "").split("-");
  return year && month && day ? `${day}.${month}.${year}` : "—";
}

function esc(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({}));
}

async function scanBindingKeys() {
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const result = await redisPipeline(
      [["SCAN", cursor, "MATCH", `${BINDING_PREFIX}*`, "COUNT", "100"]],
      { context: "telegram-bound-auto-report.scan", timeoutMs: 4000 },
    );
    const raw = result?.[0]?.result;
    if (!Array.isArray(raw) || raw.length < 2) return [];
    cursor = String(raw[0] ?? "0");
    if (Array.isArray(raw[1])) keys.push(...raw[1].map(String));
    if (cursor === "0") break;
  }
  return keys;
}

function reportFor(binding) {
  if (binding.type === "union") {
    const report = (leagueReports.reports || []).find((row) => String(row.leagueId) === String(binding.leagueId));
    if (!report && String(binding.leagueId) === "184691") {
      const rows = (clubReports.reports || []).filter((row) => String(row.leagueId) === "184691");
      if (!rows.length) return null;
      const total = (field) => rows.reduce((sum, row) => sum + Number(row.metrics?.[field] || 0), 0);
      return {
        method: "sendMessage",
        startDate: clubReports.startDate,
        endDate: clubReports.endDate,
        total: total("total"),
        caption: [
          "<b>Anti-Reg — новый отчёт</b>",
          `<b>Период: ${display(clubReports.startDate)}–${display(clubReports.endDate)}</b>`,
          "",
          `Выигрыш: ${format(total("winnings"))}`,
          `Комиссия кэш + MTT: ${format(total("commission"))}`,
          `Баланс: ${format(total("balance"))}`,
          `Обслуживание: ${format(total("service"))}`,
          `ЗП: ${format(total("salary"))}`,
          `<b>Итого к расчёту: ${format(total("total"))}</b>`,
        ].join("\n"),
      };
    }
    if (!report) return null;
    const m = report.metrics || {};
    return {
      method: "sendPhoto",
      startDate: report.startDate,
      endDate: report.endDate,
      total: Number(m.total || 0),
      imagePath: report.imagePath,
      caption: [
        `<b>${esc(report.league)} — новый отчёт</b>`,
        `<b>Период: ${display(report.startDate)}–${display(report.endDate)}</b>`,
        "",
        `Выигрыш: ${format(m.winnings)}`,
        `Комиссия кэш + MTT: ${format(m.commission)}`,
        `Баланс: ${format(m.balance)}`,
        `Обслуживание: ${format(m.service)}`,
        ...(Number(m.jackpotRefund || 0) > 0 ? [`Возврат джекпота: +${format(m.jackpotRefund)}`] : []),
        `<b>Итого к расчёту: ${format(m.total)}</b>`,
      ].join("\n"),
    };
  }
  const report = (clubReports.reports || []).find((row) => String(row.clubId) === String(binding.clubId));
  if (!report) return null;
  const m = report.metrics || {};
  return {
    method: "sendPhoto",
    startDate: report.startDate,
    endDate: report.endDate,
    total: Number(m.total || 0),
    imagePath: report.imagePath,
    caption: [
      `<b>${esc(report.club)} — новый отчёт</b>`,
      `<b>Период: ${display(report.startDate)}–${display(report.endDate)}</b>`,
      "",
      `Выигрыш: ${format(m.winnings)}`,
      `Комиссия кэш + MTT: ${format(m.commission)}`,
      `Баланс: ${format(m.balance)}`,
      `Обслуживание: ${format(m.service)}`,
      ...(Number(m.salary || 0) !== 0 ? [`ЗП: ${format(m.salary)} ₽`] : []),
      `<b>Итого к расчёту: ${format(m.total)}</b>`,
    ].join("\n"),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") return res.status(405).json({ ok: false });
  if (!authorized(req)) return res.status(403).json({ ok: false, error: "Forbidden" });
  if (!BOT_TOKEN || !isRedisConfigured()) return res.status(500).json({ ok: false, error: "Bot or Redis is not configured" });
  const keys = await scanBindingKeys();
  const valuesResult = keys.length ? await redisPipeline(keys.map((key) => ["GET", key]), { context: "telegram-bound-auto-report.bindings", timeoutMs: 4000 }) : [];
  const results = [];
  const dryRun = ["1", "true", "yes"].includes(String(req.query?.dryRun || req.body?.dryRun || "").toLowerCase());
  for (let index = 0; index < keys.length; index += 1) {
    let binding;
    try { binding = JSON.parse(String(valuesResult?.[index]?.result || "")); } catch (_) { continue; }
    if (binding?.balanceOnly) continue;
    if (!binding?.autoReport) continue;
    if (binding.type === "club" && AUTO_REPORT_BLOCKED_CLUB_IDS.has(String(binding.clubId))) continue;
    const chatId = String(keys[index]).slice(BINDING_PREFIX.length);
    const report = reportFor(binding);
    if (!report) { results.push({ chatId, ok: false, error: "Report not found" }); continue; }
    if (dryRun) {
      results.push({
        chatId,
        ok: true,
        dryRun: true,
        type: binding.type,
        entityId: binding.type === "union" ? String(binding.leagueId) : String(binding.clubId),
        entity: binding.type === "union" ? binding.league : binding.club,
        startDate: report.startDate,
        endDate: report.endDate,
        method: report.method,
        imagePath: report.imagePath || null,
      });
      continue;
    }
    const lockKey = `poker21:telegram-report:auto-sent:${chatId}:${report.startDate}:${report.endDate}`;
    const claimed = await redisPipeline([["SET", lockKey, "1", "NX"]], { context: "telegram-bound-auto-report.claim", timeoutMs: 3000 });
    if (claimed?.[0]?.result !== "OK") { results.push({ chatId, ok: true, skipped: true }); continue; }
    const replyMarkup = { inline_keyboard: [binding.type === "union"
      ? [{ text: "Открыть отчёт", callback_data: "bound:report" }, { text: "Короткое итого", callback_data: "bound:total" }]
      : [{ text: "Открыть отчёт", callback_data: "bound:report" }]] };
    const sent = report.method === "sendMessage"
      ? await telegram("sendMessage", { chat_id: chatId, text: report.caption, parse_mode: "HTML", reply_markup: replyMarkup })
      : await telegram("sendPhoto", { chat_id: chatId, photo: `${APP_ORIGIN}${report.imagePath}?v=auto-bound-1`, caption: report.caption, parse_mode: "HTML", reply_markup: replyMarkup });
    if (!sent.ok) {
      await redisPipeline([["DEL", lockKey]], { context: "telegram-bound-auto-report.release", timeoutMs: 3000 });
      results.push({ chatId, ok: false, error: sent.description || "Telegram error" });
      continue;
    }
    const balanceDeltaCents = Math.round(Number(report.total || 0) * 100);
    const balanceResult = await redisPipeline([
      ["INCRBY", `poker21:telegram-report:chat-balance:${chatId}`, String(balanceDeltaCents)],
    ], { context: "telegram-bound-auto-report.balance", timeoutMs: 3000 });
    const balanceRaw = balanceResult?.[0]?.result;
    const balanceCents = balanceRaw == null ? NaN : Number(balanceRaw);
    let balanceShown = false;
    if (Number.isFinite(balanceCents)) {
      const previousBalanceCents = balanceCents - balanceDeltaCents;
      const timestamp = new Date().toISOString();
      const actor = `Автоотчёт ${binding.type === "union" ? binding.league : binding.club}`;
      const balanceEntry = { rub: { action: "adjust", cents: balanceDeltaCents }, usd: null, cents: balanceCents, usdCents: null, actor, timestamp };
      const entry = JSON.stringify(balanceEntry);
      const operation = JSON.stringify({
        ...balanceEntry,
        chatId,
        type: binding.type === "union" ? "union" : "club",
        name: binding.type === "union" ? binding.league : binding.club,
      });
      await redisPipeline([
        ["LPUSH", `poker21:telegram-report:chat-balance-history:${chatId}`, entry],
        ["LTRIM", `poker21:telegram-report:chat-balance-history:${chatId}`, "0", "19"],
        ["LPUSH", UNRECORDED_BALANCE_OPERATIONS_KEY, operation],
      ], { context: "telegram-bound-auto-report.balance-history", timeoutMs: 3000 });
      const balanceSent = await telegram("sendMessage", {
        chat_id: chatId,
        text: [
          `<b>Предыдущий баланс: ${balanceAmount(previousBalanceCents)}</b>`,
          "",
          `${balanceAmount(balanceDeltaCents, true)} — автоотчёт учтён в балансе`,
          "",
          `<b>${balanceAmount(balanceCents)} — текущий баланс</b>`,
        ].join("\n"),
        parse_mode: "HTML",
      });
      balanceShown = Boolean(balanceSent.ok);
    }
    results.push({ chatId, ok: true, balanceUpdated: Number.isFinite(balanceCents), balanceShown, error: "" });
  }
  return res.status(200).json({ ok: results.every((row) => row.ok), dryRun, checked: keys.length, results });
};
