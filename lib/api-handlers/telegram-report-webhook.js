const reportIndex = require("../../data/prepared-reports.json");

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.telegram_bot_token ||
  process.env.TELEGRAM_TOKEN ||
  process.env.BOT_TOKEN ||
  "";
const WEBHOOK_SECRET = process.env.TELEGRAM_REPORT_WEBHOOK_SECRET || "";
const APP_ORIGIN = "https://poker21-app.vercel.app";

function parseShortPeriod(text) {
  const match = String(text || "").trim().match(
    /^\/(?:отчет|отчёт|report)(?:@[A-Za-z0-9_]+)?\s+(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})$/iu
  );
  if (!match) return null;
  return {
    startDay: Number(match[1]),
    startMonth: Number(match[2]),
    endDay: Number(match[3]),
    endMonth: Number(match[4]),
  };
}

function dateParts(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return { year, month, day };
}

function findReport(chatId, period) {
  return (reportIndex.reports || [])
    .filter((report) => String(report.chatId) === String(chatId))
    .filter((report) => {
      const start = dateParts(report.startDate);
      const end = dateParts(report.endDate);
      return (
        start.day === period.startDay &&
        start.month === period.startMonth &&
        end.day === period.endDay &&
        end.month === period.endMonth
      );
    })
    .sort((a, b) => String(b.endDate).localeCompare(String(a.endDate)))[0];
}

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({}));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return res.status(500).json({ ok: false, error: "Bot webhook is not configured" });
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }

  const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const message = update.message || update.edited_message;
  if (!message || !message.chat || !message.text) return res.status(200).json({ ok: true });

  const period = parseShortPeriod(message.text);
  if (!period) return res.status(200).json({ ok: true });

  const chatId = String(message.chat.id);
  const report = findReport(chatId, period);
  if (!report) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Отчёт за этот период не найден. Проверьте даты в формате /отчет 27.07-02.08.",
      reply_to_message_id: message.message_id,
    });
    return res.status(200).json({ ok: true, found: false });
  }

  const start = dateParts(report.startDate);
  const end = dateParts(report.endDate);
  const periodText = `${String(start.day).padStart(2, "0")}.${String(start.month).padStart(2, "0")}.${start.year}–${String(end.day).padStart(2, "0")}.${String(end.month).padStart(2, "0")}.${end.year}`;
  const sent = await telegram("sendPhoto", {
    chat_id: chatId,
    photo: `${APP_ORIGIN}${report.imagePath}`,
    caption: `Отчёт клуба «${report.club}»\nПериод: ${periodText}`,
    reply_to_message_id: message.message_id,
  });
  if (!sent.ok) {
    console.error("telegram-report-webhook: sendPhoto failed", sent.description || "unknown error");
    return res.status(200).json({ ok: true, found: true, sent: false });
  }
  return res.status(200).json({ ok: true, found: true, sent: true });
};
