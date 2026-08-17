"use strict";

const crypto = require("crypto");
const reportIndex = require("../../data/prepared-reports.json");
const leagueReports = require("../../data/prepared-union-reports.json");
const { isConfigured: isRedisConfigured, pipeline: redisPipeline } = require("../redis");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const DISPATCH_KEY_SHA256 = "d34dd876f1537ce450ed070182722f431020f4af535cd189fcdaf586cd84ae6d";
const APP_ORIGIN = "https://poker21-app.vercel.app";
const REPORT_FILES_ORIGIN = "https://raw.githubusercontent.com/matvienkoro92/poker21/main";
const BINDING_PREFIX = "poker21:telegram-report:club-chat:";
const UNRECORDED_BALANCE_OPERATIONS_KEY = "poker21:telegram-report:balance-operations:unrecorded";

function authorized(req) {
  const key = String(req.headers["x-report-dispatch-key"] || "");
  const actual = crypto.createHash("sha256").update(key).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(DISPATCH_KEY_SHA256));
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  return response.json().catch(() => ({}));
}

async function sendDocument(report, caption) {
  const source = encodeURI(`${REPORT_FILES_ORIGIN}${report.excelPath}`);
  const downloaded = await fetch(source);
  if (!downloaded.ok) return { ok: false, description: `Excel download failed: ${downloaded.status}` };
  const form = new FormData();
  form.append("chat_id", String(report.chatId));
  form.append("caption", caption);
  form.append("document", new Blob([await downloaded.arrayBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }), decodeURIComponent(report.excelPath.split("/").at(-1)));
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, { method: "POST", body: form });
  return response.json().catch(() => ({}));
}

function displayDate(iso) {
  const [year, month, day] = String(iso).split("-");
  return `${day}.${month}.${year}`;
}

async function scanBindingKeys() {
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const result = await redisPipeline([["SCAN", cursor, "MATCH", `${BINDING_PREFIX}*`, "COUNT", "100"]], {
      context: "telegram-report-dispatch.union-bindings.scan",
      timeoutMs: 4000,
    });
    const raw = result?.[0]?.result;
    if (!Array.isArray(raw) || raw.length < 2) return [];
    cursor = String(raw[0] ?? "0");
    if (Array.isArray(raw[1])) keys.push(...raw[1].map(String));
    if (cursor === "0") break;
  }
  return keys;
}

async function dispatchUnionReports(mode) {
  if (!isRedisConfigured()) return { ok: false, results: [], error: "Redis is not configured" };
  const keys = await scanBindingKeys();
  const values = keys.length
    ? await redisPipeline(keys.map((key) => ["GET", key]), { context: "telegram-report-dispatch.union-bindings.get", timeoutMs: 4000 })
    : [];
  const results = [];
  for (let index = 0; index < keys.length; index += 1) {
    let binding;
    try { binding = JSON.parse(String(values?.[index]?.result || "")); } catch (_) { continue; }
    if (binding?.type !== "union" || !binding.leagueId) continue;
    const chatId = String(keys[index]).slice(BINDING_PREFIX.length);
    const report = (leagueReports.reports || []).find((item) => String(item.leagueId) === String(binding.leagueId));
    if (!report) {
      results.push({ union: binding.league, leagueId: String(binding.leagueId), chatId, ok: false, error: "Report not found" });
      continue;
    }
    const base = {
      union: binding.league || report.league,
      leagueId: String(binding.leagueId),
      chatId,
      startDate: report.startDate,
      endDate: report.endDate,
      total: Number(report.metrics?.total || 0),
      imagePath: report.imagePath,
    };
    if (mode === "preview") {
      results.push({ ...base, ok: true, preview: true });
      continue;
    }
    const lockKey = `poker21:telegram-report:union-dispatch:${chatId}:${report.startDate}:${report.endDate}`;
    const claimed = await redisPipeline([["SET", lockKey, "1", "NX"]], { context: "telegram-report-dispatch.union-claim", timeoutMs: 3000 });
    if (claimed?.[0]?.result !== "OK") {
      results.push({ ...base, ok: true, skipped: true });
      continue;
    }
    const total = Number(report.metrics?.total || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const sent = await telegram("sendPhoto", {
      chat_id: chatId,
      photo: `${APP_ORIGIN}${report.imagePath}`,
      caption: `Отчёт союза «${binding.league || report.league}»\nПериод: ${displayDate(report.startDate)}–${displayDate(report.endDate)}\n\nИтого к расчёту: ${total} ₽`,
    });
    if (!sent.ok) await redisPipeline([["DEL", lockKey]], { context: "telegram-report-dispatch.union-release", timeoutMs: 3000 });
    results.push({ ...base, ok: Boolean(sent.ok), photoSent: Boolean(sent.ok), error: sent.ok ? "" : (sent.description || "Telegram error") });
  }
  return { ok: results.every((item) => item.ok), results };
}

function formatBalance(cents, showPlus = false) {
  const value = Number(cents || 0);
  const marker = value > 0 ? "🟢" : value < 0 ? "🔴" : "⚪";
  const amount = (value / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${marker} ${showPlus && value > 0 ? "+" : ""}${amount} ₽`;
}

async function balanceTargets() {
  const clubTargets = (reportIndex.reports || [])
    .filter((report) => report.startDate === leagueReports.startDate && report.endDate === leagueReports.endDate)
    .map((report) => ({ type: "club", name: report.club, chatId: String(report.chatId), report }));
  const keys = await scanBindingKeys();
  const values = keys.length
    ? await redisPipeline(keys.map((key) => ["GET", key]), { context: "telegram-report-dispatch.balance-bindings.get", timeoutMs: 4000 })
    : [];
  const unionTargets = [];
  for (let index = 0; index < keys.length; index += 1) {
    let binding;
    try { binding = JSON.parse(String(values?.[index]?.result || "")); } catch (_) { continue; }
    if (binding?.type !== "union" || !binding.leagueId) continue;
    const report = (leagueReports.reports || []).find((item) => String(item.leagueId) === String(binding.leagueId));
    if (!report) continue;
    unionTargets.push({ type: "union", name: binding.league || report.league, chatId: String(keys[index]).slice(BINDING_PREFIX.length), report });
  }
  return [...clubTargets, ...unionTargets];
}

async function updateReportBalances(mode) {
  if (!isRedisConfigured()) return { ok: false, results: [], error: "Redis is not configured" };
  const targets = await balanceTargets();
  const current = targets.length
    ? await redisPipeline(targets.map((target) => ["GET", `poker21:telegram-report:chat-balance:${target.chatId}`]), { context: "telegram-report-dispatch.balance-current", timeoutMs: 4000 })
    : [];
  const results = [];
  for (let index = 0; index < targets.length; index += 1) {
    const target = targets[index];
    const previousCents = Number(current?.[index]?.result || 0);
    const deltaCents = Math.round(Number(target.report.total ?? target.report.metrics?.total ?? 0) * 100);
    const base = {
      type: target.type,
      entity: target.name,
      chatId: target.chatId,
      startDate: target.report.startDate,
      endDate: target.report.endDate,
      previousCents,
      deltaCents,
      currentCents: previousCents + deltaCents,
    };
    if (mode === "preview") {
      results.push({ ...base, ok: true, preview: true });
      continue;
    }
    const lockKey = `poker21:telegram-report:prepared-balance-applied:${target.type}:${target.chatId}:${target.report.startDate}:${target.report.endDate}`;
    const claimed = await redisPipeline([["SET", lockKey, "1", "NX"]], { context: "telegram-report-dispatch.balance-claim", timeoutMs: 3000 });
    if (claimed?.[0]?.result !== "OK") {
      results.push({ ...base, ok: true, skipped: true, balanceUpdated: false });
      continue;
    }
    const updated = await redisPipeline([["INCRBY", `poker21:telegram-report:chat-balance:${target.chatId}`, String(deltaCents)]], { context: "telegram-report-dispatch.balance", timeoutMs: 3000 });
    const currentCents = Number(updated?.[0]?.result);
    if (!Number.isFinite(currentCents)) {
      await redisPipeline([["DEL", lockKey]], { context: "telegram-report-dispatch.balance-release", timeoutMs: 3000 });
      results.push({ ...base, ok: false, error: "Balance update failed" });
      continue;
    }
    const timestamp = new Date().toISOString();
    const actor = `Отчёт ${target.name} ${displayDate(target.report.startDate)}–${displayDate(target.report.endDate)}`;
    const balanceEntry = { rub: { action: "adjust", cents: deltaCents }, usd: null, cents: currentCents, usdCents: null, actor, timestamp };
    const operation = { ...balanceEntry, chatId: target.chatId, type: target.type, name: target.name };
    await redisPipeline([
      ["LPUSH", `poker21:telegram-report:chat-balance-history:${target.chatId}`, JSON.stringify(balanceEntry)],
      ["LTRIM", `poker21:telegram-report:chat-balance-history:${target.chatId}`, "0", "19"],
      ["LPUSH", UNRECORDED_BALANCE_OPERATIONS_KEY, JSON.stringify(operation)],
    ], { context: "telegram-report-dispatch.balance-history", timeoutMs: 3000 });
    const shown = await telegram("sendMessage", {
      chat_id: target.chatId,
      text: [
        `<b>Предыдущий баланс: ${formatBalance(previousCents)}</b>`,
        "",
        `${formatBalance(deltaCents, true)} — отчёт за ${displayDate(target.report.startDate)}–${displayDate(target.report.endDate)} учтён в балансе`,
        "",
        `<b>${formatBalance(currentCents)} — текущий баланс</b>`,
      ].join("\n"),
      parse_mode: "HTML",
    });
    results.push({ ...base, currentCents, ok: Boolean(shown.ok), balanceUpdated: true, balanceShown: Boolean(shown.ok), error: shown.ok ? "" : (shown.description || "Telegram error") });
  }
  return { ok: results.every((item) => item.ok), results };
}

async function correctPpcUnion() {
  if (!isRedisConfigured()) return { ok: false, error: "Redis is not configured" };
  const targets = await balanceTargets();
  const target = targets.find((item) => item.type === "union" && String(item.report.leagueId) === "259822");
  if (!target) return { ok: false, error: "PPCUNION binding was not found" };
  const correctedTotalCents = Math.round(Number(target.report.metrics?.total || 0) * 100);
  if (correctedTotalCents !== 1835860) return { ok: false, error: `Unexpected PPCUNION total: ${correctedTotalCents}` };
  const lockKey = `poker21:telegram-report:balance-correction:ppcunion:${target.chatId}:${target.report.startDate}:${target.report.endDate}:v1`;
  const claimed = await redisPipeline([["SET", lockKey, "1", "NX"]], { context: "telegram-report-dispatch.ppc-correction-claim", timeoutMs: 3000 });
  if (claimed?.[0]?.result !== "OK") return { ok: true, skipped: true, chatId: target.chatId };

  const previous = await redisPipeline([["GET", `poker21:telegram-report:chat-balance:${target.chatId}`]], { context: "telegram-report-dispatch.ppc-balance-current", timeoutMs: 3000 });
  const previousCents = Number(previous?.[0]?.result || 0);
  const updated = await redisPipeline([["INCRBY", `poker21:telegram-report:chat-balance:${target.chatId}`, String(correctedTotalCents)]], { context: "telegram-report-dispatch.ppc-balance", timeoutMs: 3000 });
  const currentCents = Number(updated?.[0]?.result);
  if (!Number.isFinite(currentCents)) {
    await redisPipeline([["DEL", lockKey]], { context: "telegram-report-dispatch.ppc-correction-release", timeoutMs: 3000 });
    return { ok: false, error: "Balance update failed" };
  }

  const timestamp = new Date().toISOString();
  const actor = `Исправленный отчёт PPCUNION ${displayDate(target.report.startDate)}–${displayDate(target.report.endDate)}`;
  const balanceEntry = { rub: { action: "adjust", cents: correctedTotalCents }, usd: null, cents: currentCents, usdCents: null, actor, timestamp };
  const operation = { ...balanceEntry, chatId: target.chatId, type: "union", name: "PPCUNION" };
  await redisPipeline([
    ["LPUSH", `poker21:telegram-report:chat-balance-history:${target.chatId}`, JSON.stringify(balanceEntry)],
    ["LTRIM", `poker21:telegram-report:chat-balance-history:${target.chatId}`, "0", "19"],
    ["LPUSH", UNRECORDED_BALANCE_OPERATIONS_KEY, JSON.stringify(operation)],
  ], { context: "telegram-report-dispatch.ppc-balance-history", timeoutMs: 3000 });

  const total = (correctedTotalCents / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const photo = await telegram("sendPhoto", {
    chat_id: target.chatId,
    photo: `${APP_ORIGIN}${target.report.imagePath}?v=ppc-converted-total-v1`,
    caption: `Исправленный отчёт союза «PPCUNION»\nПериод: ${displayDate(target.report.startDate)}–${displayDate(target.report.endDate)}\n\nИтого к расчёту: ${total} ₽`,
  });
  const shown = await telegram("sendMessage", {
    chat_id: target.chatId,
    text: [
      `<b>Предыдущий баланс: ${formatBalance(previousCents)}</b>`,
      "",
      `${formatBalance(correctedTotalCents, true)} — исправленный отчёт за ${displayDate(target.report.startDate)}–${displayDate(target.report.endDate)} учтён в балансе`,
      "",
      `<b>${formatBalance(currentCents)} — текущий баланс</b>`,
    ].join("\n"),
    parse_mode: "HTML",
  });
  return {
    ok: Boolean(photo.ok && shown.ok), chatId: target.chatId, previousCents, deltaCents: correctedTotalCents, currentCents,
    photoSent: Boolean(photo.ok), balanceUpdated: true, balanceShown: Boolean(shown.ok),
    error: photo.ok && shown.ok ? "" : (photo.description || shown.description || "Telegram error"),
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!authorized(req)) return res.status(403).json({ ok: false, error: "Forbidden" });
  if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: "Bot token is missing" });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  if (["preview", "send"].includes(body.unionMode)) {
    const unionResult = await dispatchUnionReports(body.unionMode);
    return res.status(200).json(unionResult);
  }
  if (["preview", "apply"].includes(body.balanceMode)) {
    const balanceResult = await updateReportBalances(body.balanceMode);
    return res.status(200).json(balanceResult);
  }
  if (body.correctionMode === "ppcunion") {
    return res.status(200).json(await correctPpcUnion());
  }
  const requested = Array.isArray(body.periods) ? body.periods : [];
  const results = [];
  for (const period of requested) {
    const report = (reportIndex.reports || []).find((item) =>
      item.startDate === period.startDate && item.endDate === period.endDate && String(item.chatId) === String(period.chatId)
    );
    if (!report || !report.imagePath || !report.excelPath) {
      results.push({ ...period, ok: false, error: "Report not found" });
      continue;
    }
    const periodText = `${displayDate(report.startDate)}–${displayDate(report.endDate)}`;
    const total = Number(report.total || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const photo = await telegram("sendPhoto", {
      chat_id: report.chatId,
      photo: `${APP_ORIGIN}${report.imagePath}`,
      caption: `Отчёт клуба «${report.club}»\nПериод: ${periodText}\n\nИтого к расчёту: ${total} ₽`,
    });
    const document = photo.ok
      ? await sendDocument(report, `Исходный Excel · ${periodText}`)
      : { ok: false, description: "Skipped after photo failure" };
    results.push({ club: report.club, chatId: report.chatId, startDate: report.startDate, endDate: report.endDate,
      ok: Boolean(photo.ok && document.ok), photoSent: Boolean(photo.ok), documentSent: Boolean(document.ok),
      error: photo.ok && document.ok ? "" : (document.description || photo.description || "Telegram error") });
  }
  return res.status(200).json({ ok: results.every((item) => item.ok), results });
};
