#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const reports = require("../data/prepared-reports.json").reports || [];

const ROOT = path.resolve(__dirname, "..");
const STATE_PATH = path.join(ROOT, ".codex", "report-send-history.json");
const TIME_ZONE = "Asia/Novosibirsk";
const shouldSend = process.argv.includes("--send");
const allowResend = process.argv.includes("--resend");
const REPORT_BLOCKED_CLUB_IDS = new Set(["964699", "577707", "190714"]); // Kings KO, Joker Poker, Collaboration Club

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

async function main() {
  const today = localIso(new Date());
  const week = previousWeek();
  const history = state();
  const selected = reports.filter((report) =>
    !REPORT_BLOCKED_CLUB_IDS.has(String(report.clubId)) &&
    report.startDate === week.startDate &&
    report.endDate === week.endDate &&
    processedDate(report) === today &&
    (allowResend || !history.sent[`${report.chatId}:${report.startDate}:${report.endDate}`])
  );
  console.log(JSON.stringify({ today, week, mode: shouldSend ? "send" : "preview", resend: allowResend, reports: selected.map((r) => ({ club: r.club, chatId: r.chatId, period: `${r.startDate}/${r.endDate}` })) }, null, 2));
  if (!shouldSend || selected.length === 0) return;
  const secretPath = process.env.REPORT_DISPATCH_SECRET_FILE || path.join(os.homedir(), ".codex", "report-dispatch-secret");
  const secret = fs.readFileSync(secretPath, "utf8").trim();
  const response = await fetch("https://poker21-app.vercel.app/api/telegram-report-dispatch", {
    method: "POST",
    headers: { "content-type": "application/json", "x-report-dispatch-key": secret },
    body: JSON.stringify({ periods: selected.map((report) => ({ chatId: report.chatId, startDate: report.startDate, endDate: report.endDate })) }),
  });
  const result = await response.json().catch(() => ({}));
  console.log(JSON.stringify(result, null, 2));
  if (!response.ok) throw new Error(result.error || `Dispatch failed: ${response.status}`);
  for (const sent of result.results || []) {
    if (!sent.ok) continue;
    history.sent[`${sent.chatId}:${sent.startDate}:${sent.endDate}`] = new Date().toISOString();
  }
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, `${JSON.stringify(history, null, 2)}\n`);
  if (!result.ok) throw new Error("One or more reports failed to send");
}

main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
