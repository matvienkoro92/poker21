"use strict";

const crypto = require("crypto");
const reportIndex = require("../../data/prepared-reports.json");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.telegram_bot_token || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const DISPATCH_KEY_SHA256 = "d34dd876f1537ce450ed070182722f431020f4af535cd189fcdaf586cd84ae6d";
const APP_ORIGIN = "https://poker21-app.vercel.app";
const REPORT_FILES_ORIGIN = "https://raw.githubusercontent.com/matvienkoro92/poker21/main";

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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  if (!authorized(req)) return res.status(403).json({ ok: false, error: "Forbidden" });
  if (!BOT_TOKEN) return res.status(500).json({ ok: false, error: "Bot token is missing" });
  const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
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
