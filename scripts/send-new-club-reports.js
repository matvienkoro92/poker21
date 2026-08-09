#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const reports = require("../data/prepared-reports.json").reports || [];

const ROOT = path.resolve(__dirname, "..");
const STATE_PATH = path.join(ROOT, ".codex", "report-send-history.json");
const TIME_ZONE = "Asia/Novosibirsk";
const shouldSend = process.argv.includes("--send");

function localParts(date) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date).map((part) => [part.type, part.value]));
}

function localIso(date) {
  const p = localParts(date);
  return `${p.year}-${p.month}-${p.day}`;
}

function previousWeek(now = new Date()) {
  const today = Date.UTC(Number(localParts(now).year), Number(localParts(now).month) - 1, Number(localParts(now).day));
  const weekday = (new Date(today).getUTCDay() + 6) % 7;
  const monday = today - (weekday + 7) * 86400000;
  return {
    startDate: new Date(monday).toISOString().slice(0, 10),
    endDate: new Date(monday + 6 * 86400000).toISOString().slice(0, 10),
  };
}

function processedDate(report) {
  const relative = String(report.excelPath || "").replace(/^\//, "").replace(/^assets\//, "assets/");
  const absolute = path.join(ROOT, relative);
  try {
    const committed = execFileSync("git", ["log", "-1", "--format=%cI", "--", relative], { cwd: ROOT, encoding: "utf8" }).trim();
    if (committed) return localIso(new Date(committed));
  } catch (_) {}
  return fs.existsSync(absolute) ? localIso(fs.statSync(absolute).mtime) : "";
}

function state() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, "utf8")); } catch (_) { return { sent: {} }; }
}

async function telegramUpload(token, method, fields, fileField, filePath, mime) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, String(value)));
  form.append(fileField, new Blob([fs.readFileSync(filePath)], { type: mime }), path.basename(filePath));
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", body: form });
  const result = await response.json().catch(() => ({}));
  if (!result.ok) throw new Error(`${method}: ${result.description || response.status}`);
}

async function main() {
  const today = localIso(new Date());
  const week = previousWeek();
  const history = state();
  const selected = reports.filter((report) =>
    report.startDate === week.startDate &&
    report.endDate === week.endDate &&
    processedDate(report) === today &&
    !history.sent[`${report.chatId}:${report.startDate}:${report.endDate}`]
  );
  console.log(JSON.stringify({ today, week, mode: shouldSend ? "send" : "preview", reports: selected.map((r) => ({ club: r.club, chatId: r.chatId, period: `${r.startDate}/${r.endDate}` })) }, null, 2));
  if (!shouldSend || selected.length === 0) return;
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
  if (!token) throw new Error("Telegram bot token is missing");
  for (const report of selected) {
    const image = path.join(ROOT, String(report.imagePath).replace(/^\//, "assets/").replace(/^assets\/assets\//, "assets/"));
    const excel = path.join(ROOT, String(report.excelPath).replace(/^\//, "assets/").replace(/^assets\/assets\//, "assets/"));
    const caption = `Отчёт клуба «${report.club}»\nПериод: ${report.startDate}–${report.endDate}\n\nИтого к расчёту: ${Number(report.total).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
    await telegramUpload(token, "sendPhoto", { chat_id: report.chatId, caption }, "photo", image, "image/png");
    await telegramUpload(token, "sendDocument", { chat_id: report.chatId, caption: `Исходный Excel · ${report.startDate}–${report.endDate}` }, "document", excel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    history.sent[`${report.chatId}:${report.startDate}:${report.endDate}`] = new Date().toISOString();
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, `${JSON.stringify(history, null, 2)}\n`);
  }
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
