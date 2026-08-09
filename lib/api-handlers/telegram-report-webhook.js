const reportIndex = require("../../data/prepared-reports.json");

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.telegram_bot_token ||
  process.env.TELEGRAM_TOKEN ||
  process.env.BOT_TOKEN ||
  "";
const WEBHOOK_SECRET = process.env.TELEGRAM_REPORT_WEBHOOK_SECRET || "";
const APP_ORIGIN = "https://poker21-app.vercel.app";
const REPORT_FILES_ORIGIN = "https://raw.githubusercontent.com/matvienkoro92/poker21/main";
// Меняется вручную в коде и применяется ко всем отчётам.
const DEFAULT_SERVICE_PERCENT = 8;

function formatPercent(value) {
  return Number(value).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function reportWithServicePercent(report, servicePercent) {
  const metrics = { ...(report.metrics || {}) };
  const oldService = Number(metrics.service || 0);
  const newService = Math.round((-Number(metrics.commission || 0) * servicePercent / 100) * 100) / 100;
  metrics.service = newService;
  return {
    ...report,
    metrics,
    total: Math.round((Number(report.total || 0) - oldService + newService) * 100) / 100,
  };
}

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

function isoDateFromUtc(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}

function localTodayUtc() {
  const now = process.env.REPORT_NOW_ISO ? new Date(process.env.REPORT_NOW_ISO) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Novosibirsk",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Date.UTC(Number(byType.year), Number(byType.month) - 1, Number(byType.day));
}

function calendarWeekPeriod(weeksBack) {
  const today = localTodayUtc();
  const dayFromMonday = (new Date(today).getUTCDay() + 6) % 7;
  const start = today - (dayFromMonday + weeksBack * 7) * 86400000;
  return { startDate: isoDateFromUtc(start), endDate: isoDateFromUtc(start + 6 * 86400000) };
}

function parseTotalCommand(text) {
  const normalized = String(text || "").trim().toLowerCase().replace(/ё/g, "е");
  const prefix = /^\/(?:итого|total)(?:@[a-z0-9_]+)?\s+/iu;
  if (!prefix.test(normalized)) return null;
  const argument = normalized.replace(prefix, "").trim();
  if (argument === "за все время") return { type: "all" };
  if (argument === "за месяц") return { type: "previousMonth" };
  const season = argument.match(/^за\s+(лето|осень|зиму|весну)$/u);
  if (season) return { type: "season", season: season[1] };
  const weeks = argument.match(/^за\s+(\d+)\s+(?:неделю|недели|недель)$/u);
  if (weeks) {
    const count = Number(weeks[1]);
    if (count >= 1 && count <= 52) return { type: "weeks", count };
  }
  return null;
}

function previousMonthPeriod() {
  const today = new Date(localTodayUtc());
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  const end = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 0);
  return { startDate: isoDateFromUtc(start), endDate: isoDateFromUtc(end), title: "прошлый календарный месяц" };
}

function latestSeasonPeriod(seasonName) {
  const configs = {
    весну: { month: 2, endMonth: 4, label: "весна" },
    лето: { month: 5, endMonth: 7, label: "лето" },
    осень: { month: 8, endMonth: 10, label: "осень" },
    зиму: { month: 11, endMonth: 1, label: "зима", crossesYear: true },
  };
  const config = configs[seasonName];
  const today = new Date(localTodayUtc());
  let year = today.getUTCFullYear();
  let start = Date.UTC(year, config.month, 1);
  if (start > today.getTime()) {
    year -= 1;
    start = Date.UTC(year, config.month, 1);
  }
  const endYear = config.crossesYear ? year + 1 : year;
  const end = Date.UTC(endYear, config.endMonth + 1, 0);
  return { startDate: isoDateFromUtc(start), endDate: isoDateFromUtc(end), title: `${config.label} ${year}${config.crossesYear ? `–${year + 1}` : ""}` };
}

function previousWeeksPeriod(count) {
  const oldest = calendarWeekPeriod(count);
  const newest = calendarWeekPeriod(1);
  const title = count === 1
    ? "1 предыдущую календарную неделю"
    : `${count} предыдущих календарных ${[2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100) ? "недели" : "недель"}`;
  return { startDate: oldest.startDate, endDate: newest.endDate, title };
}

function displayIso(isoDate, withYear = true) {
  const { year, month, day } = dateParts(isoDate);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}${withYear ? `.${year}` : ""}`;
}

function formatRub(value) {
  return `${Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

const TOTAL_METRICS = [
  ["winnings", "Выигрыш игроков"],
  ["commission", "Комиссия (рейк)"],
  ["commissionMtt", "Комиссия MTT"],
  ["insurance", "Страховка"],
  ["balanceApp", "Итого к расчёту"],
  ["fraud", "Штрафы мошенников"],
  ["overly", "Overly"],
  ["salary", "ЗП"],
  ["balanceFinal", "Баланс итог"],
  ["promo", "Акция"],
  ["refund", "Возврат"],
  ["service", "Обслуживание 8%"],
  ["jackpot", "Джекпот"],
  ["rbMtt", "РБ МТТ"],
  ["overlay", "Оверлей"],
];

function expectedWeekRanges(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const daysUntilSunday = (7 - new Date(start).getUTCDay()) % 7;
  const firstSunday = start + daysUntilSunday * 86400000;
  const weeks = [];
  for (let sunday = firstSunday; sunday <= end; sunday += 7 * 86400000) {
    weeks.push({
      startDate: isoDateFromUtc(sunday - 6 * 86400000),
      endDate: isoDateFromUtc(sunday),
    });
  }
  return weeks;
}

async function sendTotal(chatId, messageId, command, servicePercent) {
  let period;
  if (command.type === "all") {
    const chatReports = (reportIndex.reports || []).filter((report) => String(report.chatId) === String(chatId));
    if (!chatReports.length) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Для этого чата пока нет подготовленных отчётов.", reply_to_message_id: messageId });
      return Boolean(sent.ok);
    }
    period = {
      startDate: chatReports.map((report) => report.startDate).sort()[0],
      endDate: chatReports.map((report) => report.endDate).sort().at(-1),
      title: "всё время",
    };
  } else if (command.type === "previousMonth") period = previousMonthPeriod();
  else if (command.type === "season") period = latestSeasonPeriod(command.season);
  else period = previousWeeksPeriod(command.count);

  const lastCompletedSunday = calendarWeekPeriod(1).endDate;
  const effectiveEndDate = period.endDate > lastCompletedSunday ? lastCompletedSunday : period.endDate;

  const reports = (reportIndex.reports || [])
    .filter((report) => String(report.chatId) === String(chatId))
    .filter((report) => report.endDate >= period.startDate && report.endDate <= effectiveEndDate)
    .map((report) => reportWithServicePercent(report, servicePercent))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const total = reports.reduce((sum, report) => sum + Number(report.total || 0), 0);
  const metricTotals = Object.fromEntries(TOTAL_METRICS.map(([key]) => [
    key,
    reports.reduce((sum, report) => sum + Number(report.metrics?.[key] || 0), 0),
  ]));
  const lines = [
    `Итого за ${period.title}`,
    `Период: ${displayIso(period.startDate)}–${displayIso(effectiveEndDate)}`,
    `Учтено отчётов: ${reports.length}`,
    "",
    ...TOTAL_METRICS.map(([key, label]) => `${key === "service" ? `Обслуживание ${formatPercent(servicePercent)}%` : label}: ${formatRub(metricTotals[key])}`),
    "",
    `Итого к расчёту: ${formatRub(total)}`,
  ];
  if (reports.length || command.type !== "all") {
    const present = new Set(reports.map((report) => `${report.startDate}/${report.endDate}`));
    const missing = expectedWeekRanges(period.startDate, effectiveEndDate).filter((week) => !present.has(`${week.startDate}/${week.endDate}`));
    if (missing.length) lines.push(`Нет отчётов: ${missing.map((week) => `${displayIso(week.startDate, false)}–${displayIso(week.endDate, false)}`).join(", ")}`);
  }
  lines.push("Месяцы и сезоны: неделя относится к периоду по дате воскресенья.");
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

function parseReportPeriod(text) {
  const normalized = String(text || "").trim();
  const relative = normalized.match(
    /^\/(?:отчет|отчёт|report)(?:@[A-Za-z0-9_]+)?\s+(позапрошлая|прошлая)(?:\s+неделя)?$/iu
  );
  if (relative) return calendarWeekPeriod(relative[1].toLowerCase() === "прошлая" ? 1 : 2);
  return parseShortPeriod(normalized);
}

function dateParts(isoDate) {
  const [year, month, day] = String(isoDate).split("-").map(Number);
  return { year, month, day };
}

function findReport(chatId, period) {
  return (reportIndex.reports || [])
    .filter((report) => String(report.chatId) === String(chatId))
    .filter((report) => {
      if (period.startDate && period.endDate) {
        return report.startDate === period.startDate && report.endDate === period.endDate;
      }
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

async function telegramDocument(body, fileUrl, filename) {
  try {
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) return { ok: false, description: `Excel download failed: ${fileResponse.status}` };
    const form = new FormData();
    form.append("chat_id", String(body.chat_id));
    form.append("document", new Blob([await fileResponse.arrayBuffer()], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }), filename);
    if (body.caption) form.append("caption", body.caption);
    if (body.reply_to_message_id) form.append("reply_to_message_id", String(body.reply_to_message_id));
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: "POST",
      body: form,
    });
    return response.json().catch(() => ({}));
  } catch (error) {
    return { ok: false, description: error && error.message ? error.message : "Excel upload failed" };
  }
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

  const chatId = String(message.chat.id);

  const totalCommand = parseTotalCommand(message.text);
  if (totalCommand) {
    const servicePercent = DEFAULT_SERVICE_PERCENT;
    const sent = await sendTotal(chatId, message.message_id, totalCommand, servicePercent);
    return res.status(200).json({ ok: true, total: true, sent });
  }

  const period = parseReportPeriod(message.text);
  if (!period) return res.status(200).json({ ok: true });

  const storedReport = findReport(chatId, period);
  const servicePercent = DEFAULT_SERVICE_PERCENT;
  const report = storedReport ? reportWithServicePercent(storedReport, servicePercent) : null;
  if (!report) {
    await telegram("sendMessage", {
      chat_id: chatId,
      text: "Отчёт за этот период не найден. Используйте /отчет 27.07-02.08, /отчет прошлая неделя или /отчет позапрошлая.",
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
    caption: `Отчёт клуба «${report.club}»\nПериод: ${periodText}\n\nИтого к расчёту: ${formatRub(report.total)}`,
    reply_to_message_id: message.message_id,
  });
  if (!sent.ok) {
    console.error("telegram-report-webhook: sendPhoto failed", sent.description || "unknown error");
  }
  const excelUrl = report.excelPath ? encodeURI(`${REPORT_FILES_ORIGIN}${report.excelPath}`) : "";
  const excelFilename = report.excelPath ? decodeURIComponent(report.excelPath.split("/").at(-1)) : "report.xlsx";
  const documentSent = report.excelPath
    ? await telegramDocument({
        chat_id: chatId,
        caption: `Excel-отчёт клуба «${report.club}»\nПериод: ${periodText}`,
        reply_to_message_id: message.message_id,
      }, excelUrl, excelFilename)
    : { ok: false, description: "Excel path is missing" };
  if (!documentSent.ok) {
    console.error("telegram-report-webhook: sendDocument failed", documentSent.description || "unknown error");
  }
  return res.status(200).json({
    ok: true,
    found: true,
    sent: Boolean(sent.ok && documentSent.ok),
    photoSent: Boolean(sent.ok),
    documentSent: Boolean(documentSent.ok),
  });
};
