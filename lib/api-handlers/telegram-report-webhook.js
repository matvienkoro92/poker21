const sharp = require("sharp");
const https = require("https");
const { isConfigured: isRedisConfigured, pipeline: redisPipeline } = require("../redis");
const reportIndex = require("../../data/prepared-reports.json");
const unionMemberRakeSummary = require("../../data/union-member-rake-summary.json");
const unionOverlaySummary = require("../../data/union-overlay-summary.json");
const unionGameRakeSummary = require("../../data/union-game-rake-summary.json");
const unionJackpotSummary = require("../../data/union-jackpot-summary.json");
const unionPlayerTops = require("../../data/union-player-tops.json");
const unionLeaguePlayerTops = require("../../data/union-league-player-tops.json");
const unionDirectory = require("../../data/union-directory.json");
const unionActivitySummary = require("../../data/union-activity-summary.json");
// Интерактивные команды показывают последний подготовленный период. Файлы
// автоотчётов переключаются отдельно, чтобы деплой статистики не дублировал
// уже выполненную рассылку и изменение балансов.
const unionLeagueReports = require("../../data/prepared-union-reports.json");
const unionClubReports = require("../../data/prepared-union-club-reports.json");
const unionPeriods = require("../../data/union-periods.json");

const latestUnionData = {
  directory: unionDirectory,
  memberRake: unionMemberRakeSummary,
  games: unionGameRakeSummary,
  overlays: unionOverlaySummary,
  jackpot: unionJackpotSummary,
  playerTops: unionPlayerTops,
  leaguePlayerTops: unionLeaguePlayerTops,
  activity: unionActivitySummary,
  leagueReports: unionLeagueReports,
  clubReports: unionClubReports,
};

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.telegram_bot_token ||
  process.env.TELEGRAM_TOKEN ||
  process.env.BOT_TOKEN ||
  "";
const WEBHOOK_SECRET = process.env.TELEGRAM_REPORT_WEBHOOK_SECRET || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const APP_ORIGIN = "https://poker21-app.vercel.app";
const POKER21_TABLES_ENDPOINT = "https://poker-app-ebon.vercel.app/api/pokerplus-tables";
const REPORT_FILES_ORIGIN = "https://raw.githubusercontent.com/matvienkoro92/poker21/main";
const SCHEDULE_POSTER_VERSION = "2026-08-29-250k";
// Меняется вручную в коде и применяется ко всем отчётам.
const DEFAULT_SERVICE_PERCENT = 8;
const MAIN_REPORT_CHAT_IDS = new Set(["-1004391487736", "-1004472155269"]);
const ANTIREG_REPORT_CHAT_ID = "-1004391487736";
const PUBLIC_SCHEDULE_CHAT_TITLE = "poker21plus общий чат";
const processedClubBroadcasts = new Map();
const clubChatBindings = new Map();
const chatBalances = new Map();
const chatStopGenerations = new Map();
const activeChatCommands = new Set();
const PLAYING_TABLES_CACHE_MS = 15 * 1000;
let playingTablesCache = { expiresAt: 0, tables: null };

function allowEphemeralClubBindings() {
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

function isMainReportChat(chatId) {
  return MAIN_REPORT_CHAT_IDS.has(String(chatId));
}

function isAntiregReportChat(chatId) {
  return String(chatId) === ANTIREG_REPORT_CHAT_ID;
}

function isPublicScheduleChat(chat) {
  return String(chat?.title || "").trim().toLocaleLowerCase("ru-RU") === PUBLIC_SCHEDULE_CHAT_TITLE;
}

function clubBindingKey(chatId) {
  return `poker21:telegram-report:club-chat:${chatId}`;
}

function chatBalanceKey(chatId) {
  return `poker21:telegram-report:chat-balance:${chatId}`;
}

function chatBalanceUsdKey(chatId) {
  return `poker21:telegram-report:chat-balance-usd:${chatId}`;
}

function chatBalanceHistoryKey(chatId) {
  return `poker21:telegram-report:chat-balance-history:${chatId}`;
}

function paymentBalanceKey(chatId) {
  return `poker21:telegram-report:payment-balance:${chatId}`;
}

function paymentBalanceUsdKey(chatId) {
  return `poker21:telegram-report:payment-balance-usd:${chatId}`;
}

function chatStopKey(chatId) {
  return `poker21:telegram-report:stop-generation:${chatId}`;
}

function chatActiveCommandKey(chatId) {
  return `poker21:telegram-report:active-command:${chatId}`;
}

const PAYMENT_DETAILS_INDEX_KEY = "poker21:telegram-report:payment-details:index";
const UNRECORDED_BALANCE_OPERATIONS_KEY = "poker21:telegram-report:balance-operations:unrecorded";
const PAYMENT_CLAIM_TTL_SECONDS = 15 * 60;
const PAYMENT_CLAIM_TTL_MS = PAYMENT_CLAIM_TTL_SECONDS * 1000;

function paymentDetailsKey(id) {
  return `poker21:telegram-report:payment-details:${id}`;
}

function paymentDetailsClaimKey(id) {
  return `poker21:telegram-report:payment-details-claim:${id}`;
}

function paymentDetailsConfirmedKey(id) {
  return `poker21:telegram-report:payment-details-confirmed:${id}`;
}

function paymentDetailsPlacementKey(chatId) {
  return `poker21:telegram-report:payment-details-placement:${chatId}`;
}

function paymentDetailsNotificationsKey(chatId) {
  return `poker21:telegram-report:payment-details-notifications:${chatId}`;
}

function romanTotalPendingKey(chatId, userId) {
  return `poker21:telegram-report:roman-total:pending:${chatId}:${userId}`;
}

function romanTotalSentKey(recipient, data = latestUnionData) {
  const startDate = data.clubReports?.startDate || data.leagueReports?.startDate || "current";
  const endDate = data.clubReports?.endDate || data.leagueReports?.endDate || "current";
  return `poker21:telegram-report:roman-total:sent:${startDate}:${endDate}:${recipient}`;
}

function diamondSalesKey(data = latestUnionData) {
  const startDate = data.clubReports?.startDate || data.leagueReports?.startDate || "current";
  const endDate = data.clubReports?.endDate || data.leagueReports?.endDate || "current";
  return `poker21:telegram-report:diamond-sales:${startDate}:${endDate}`;
}

function diamondSalesPendingKey(chatId, userId) {
  return `poker21:telegram-report:diamond-sales:pending:${chatId}:${userId}`;
}

function tournamentScheduleKey(chatId) {
  return `poker21:telegram-report:tournament-schedule:${chatId}`;
}

function tournamentSchedulePendingKey(chatId, userId) {
  return `poker21:telegram-report:tournament-schedule:pending:${chatId}:${userId}`;
}

function imageGenerationLockKey(chatId) {
  return `poker21:telegram-report:image-generation:${chatId}`;
}

function isStopCommand(text) {
  return /^\/(?:стоп|stop)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isCancelCommand(text) {
  return /^\/(?:отмена|cancel)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isScheduleCommand(text) {
  return scheduleViewMode(text) !== null;
}

function scheduleViewMode(text) {
  const match = String(text || "").trim().match(/^\/(?:расписание|schedule)(?:@[A-Za-z0-9_]+)?(?:\s+(общее|сегодня|all|today))?\s*$/iu);
  if (!match) return null;
  if (/^(?:сегодня|today)$/iu.test(match[1] || "")) return "today";
  if (/^(?:общее|all)$/iu.test(match[1] || "")) return "all";
  return "menu";
}

function isEditScheduleCommand(text) {
  return /^\/(?:поменять(?:\s+|_)расписание|edit_schedule)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isScheduleDoneCommand(text) {
  return /^\/(?:готово|done)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

async function getTournamentSchedule(chatId) {
  if (!isRedisConfigured()) return [];
  const result = await redisPipeline([["GET", tournamentScheduleKey(chatId)]], { context: "telegram-report.schedule.get", timeoutMs: 2000 });
  try {
    const rows = JSON.parse(String(result?.[0]?.result || "[]"));
    return Array.isArray(rows) ? rows.filter((row) => row && row.id && row.text) : [];
  } catch (_) {
    return [];
  }
}

async function saveTournamentSchedule(chatId, rows) {
  await redisPipeline(
    [["SET", tournamentScheduleKey(chatId), JSON.stringify(rows)]],
    { context: "telegram-report.schedule.save", timeoutMs: 2000 },
  );
}

function scheduleMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "➕ Добавить турнир", callback_data: "schedule:add" }],
      [{ text: "✏️ Изменить", callback_data: "schedule:edit" }],
      [{ text: "🗑 Удалить", callback_data: "schedule:delete" }],
    ],
  };
}

const SCHEDULE_CATEGORY_LABELS = {
  month: "🏆 Турниры месяца",
  day: "🌆 Вечерние в 18 МСК",
  daily: "🔁 Ежедневные",
};

function scheduleCategoryKeyboard(action, rows) {
  return {
    inline_keyboard: Object.entries(SCHEDULE_CATEGORY_LABELS)
      .filter(([category]) => rows.some((row) => row.category === category))
      .map(([category, label]) => [{
        text: label,
        callback_data: `schedule:${action}:group:${category}`,
      }]),
  };
}

function scheduleCategory(text) {
  const value = String(text || "").toLocaleLowerCase("ru-RU");
  if (/турнир(?:ы|ов)?\s+месяца|турнир\s+месяц|monthly/iu.test(value)) return "month";
  if (/ежеднев|каждый\s+день|daily/iu.test(value)) return "daily";
  if (/турнир(?:ы|ов)?\s+дня|day\s+tournament/iu.test(value)) return "day";
  return "day";
}

function expandScheduleRows(rows) {
  const result = [];
  const dayPattern = /^(?:понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|пн|вт|ср|чт|пт|сб|вс)[!,:.\s]*$/iu;
  const monthPeriodPattern = /^(?:начало|середина|конец)\s+месяца[!,:.\s]*$/iu;
  const tournamentStartPattern = /^(?:[01]?\d|2[0-3])[.:]\d{2}(?:\s|$)/u;
  for (const row of rows) {
    const lines = String(row.text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    let category = row.category || scheduleCategory(row.text);
    let buffer = [];
    let groupHeading = "";
    const flush = () => {
      if (!buffer.length) return;
      result.push({ ...row, id: `${row.id}:${result.length}`, text: buffer.join("\n"), category });
      buffer = [];
    };
    for (const line of lines) {
      if (/^расписание[!,:.\s]*$/iu.test(line)) continue;
      if (/^(?:расписание\s+)?турниры?\s+месяца[!,:.\s]*$/iu.test(line)) {
        flush();
        category = "month";
        groupHeading = "";
        continue;
      }
      if (/^(?:расписание\s+)?турниры?\s+дня[!,:.\s]*$/iu.test(line)) {
        flush();
        category = "day";
        groupHeading = "";
        continue;
      }
      if (/^(?:расписание\s+)?(?:ежедневные\s+(?:турниры|игры)|ежедневно)[!,:.\s]*$/iu.test(line)) {
        flush();
        category = "daily";
        groupHeading = "";
        continue;
      }
      if ((category === "day" && dayPattern.test(line)) || (category === "month" && monthPeriodPattern.test(line))) {
        flush();
        groupHeading = line;
        continue;
      }
      if ((category === "day" || category === "month") && tournamentStartPattern.test(line)) {
        flush();
        buffer = groupHeading ? [groupHeading, line] : [line];
        continue;
      }
      if (category === "daily" && buffer.length) flush();
      buffer.push(line);
    }
    flush();
  }
  return result;
}

function normalizedScheduleRows(rows) {
  const expanded = expandScheduleRows(rows);
  const changed = expanded.length !== rows.length || expanded.some((row, index) => (
    row.text !== rows[index]?.text || row.category !== rows[index]?.category
  ));
  if (!changed) return { rows, changed: false };
  const stamp = Date.now().toString(36);
  return {
    changed: true,
    rows: expanded.map((row, index) => ({
      id: `${stamp}${index.toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      text: row.text,
      category: row.category,
      createdAt: row.createdAt || new Date().toISOString(),
    })),
  };
}

function moscowDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "long",
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function scheduleIsToday(row, dateParts) {
  const text = String(row.text || "").toLocaleLowerCase("ru-RU");
  const category = row.category || scheduleCategory(text);
  if (category === "daily" || /сегодня/iu.test(text)) return true;
  const day = String(Number(dateParts.day));
  const dayPadded = String(dateParts.day);
  const month = String(Number(dateParts.month));
  const monthPadded = String(dateParts.month);
  const year = String(dateParts.year);
  const numericDate = new RegExp(`(?:^|\\D)0?${day}[./-]0?${month}(?:[./-]${year})?(?:\\D|$)`, "u");
  const isoDate = new RegExp(`${year}-${monthPadded}-${dayPadded}`, "u");
  if (numericDate.test(text) || isoDate.test(text)) return true;
  const weekday = String(dateParts.weekday || "").replace(/ё/g, "е");
  const weekdayAliases = {
    понедельник: ["понедельник", "пн"],
    вторник: ["вторник", "вт"],
    среда: ["среда", "ср"],
    четверг: ["четверг", "чт"],
    пятница: ["пятница", "пт"],
    суббота: ["суббота", "сб"],
    воскресенье: ["воскресенье", "вс"],
  };
  const normalized = text.replace(/ё/g, "е");
  return (weekdayAliases[weekday] || [weekday]).some((alias) => new RegExp(`(?:^|\\s|[,.;—-])${alias}(?:$|\\s|[,.;—-])`, "iu").test(normalized));
}

function scheduleEntryText(row, index, main = false) {
  const text = escapeTelegramHtml(String(row.text || "").trim());
  return main
    ? `<blockquote><b>⭐ ${index + 1}. ${text}</b></blockquote>`
    : `<b>${index + 1}.</b> ${text}`;
}

function isScheduleSatellite(row) {
  return /(?:^|\s)сат(?:еллит[а-яё]*)?(?=\s|$)/iu.test(String(row?.text || ""));
}

function isFeaturedDailyTournament(row) {
  const text = String(row?.text || "").toLocaleLowerCase("ru-RU");
  return /ребайник[^\n]*800\s*[₽р]/iu.test(text)
    || /меджик[^\n]*300\s*[₽р]/iu.test(text)
    || /нокаут[^\n]*1000\s*[₽р]/iu.test(text);
}

function groupedDailyScheduleLines(rows) {
  const satellites = rows.filter(isScheduleSatellite);
  const otherTournaments = rows.filter((row) => !isScheduleSatellite(row));
  const lines = [];
  if (satellites.length) {
    lines.push("🎟 <b>САТЕЛЛИТЫ</b>", "", ...satellites.map((row, index) => scheduleEntryText(row, index)));
  }
  if (otherTournaments.length) {
    if (lines.length) lines.push("");
    lines.push("🎲 <b>ОСТАЛЬНЫЕ ТУРНИРЫ</b>", "", ...otherTournaments.map((row, index) => (
      isFeaturedDailyTournament(row)
        ? `<b>⭐ ${index + 1}. ${escapeTelegramHtml(String(row.text || "").trim())}</b>`
        : scheduleEntryText(row, index)
    )));
  }
  return lines;
}

function groupedDayScheduleLines(rows) {
  const weekdayOrder = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
  const groups = new Map();
  const undated = [];
  for (const row of rows) {
    const parts = String(row.text || "").split(/\r?\n/).map((part) => part.trim()).filter(Boolean);
    const weekday = weekdayOrder.find((day) => day === String(parts[0] || "").toLocaleLowerCase("ru-RU"));
    if (!weekday) {
      undated.push(String(row.text || "").trim());
      continue;
    }
    if (!groups.has(weekday)) groups.set(weekday, []);
    groups.get(weekday).push(parts.slice(1).join("\n"));
  }
  const lines = [];
  for (const weekday of weekdayOrder) {
    const tournaments = (groups.get(weekday) || []).filter(Boolean);
    if (!tournaments.length) continue;
    const title = weekday.charAt(0).toLocaleUpperCase("ru-RU") + weekday.slice(1);
    lines.push(`<b>${escapeTelegramHtml(title)}</b>`);
    lines.push(...tournaments.map((text) => `• ${escapeTelegramHtml(text)}`));
  }
  if (undated.length) {
    if (lines.length) lines.push("");
    lines.push(...undated.map((text) => `• ${escapeTelegramHtml(text)}`));
  }
  return lines;
}

function scheduleViewKeyboard(viewMode) {
  return {
    inline_keyboard: [[viewMode === "today"
      ? { text: "📋 Общее расписание", callback_data: "schedule:view:all" }
      : { text: "📅 Сегодня", callback_data: "schedule:view:today" }]],
  };
}

function schedulePosterUrl(viewMode, dateParts) {
  if (viewMode !== "today") return `${REPORT_FILES_ORIGIN}/assets/schedule/schedule-all.png?v=${SCHEDULE_POSTER_VERSION}`;
  const weekdayFiles = {
    понедельник: "monday",
    вторник: "tuesday",
    среда: "wednesday",
    четверг: "thursday",
    пятница: "friday",
    суббота: "saturday",
    воскресенье: "sunday",
  };
  const weekday = String(dateParts?.weekday || "").replace(/ё/g, "е").toLocaleLowerCase("ru-RU");
  return `${REPORT_FILES_ORIGIN}/assets/schedule/schedule-${weekdayFiles[weekday] || "all"}.png?v=${SCHEDULE_POSTER_VERSION}`;
}

async function sendTournamentSchedule(chatId, messageId, scheduleChatId = chatId, viewMode = "all", editMessageId = null) {
  const storedRows = await getTournamentSchedule(scheduleChatId);
  const rows = expandScheduleRows(storedRows);
  const dateParts = moscowDateParts();
  const todayRows = rows.filter((row) => scheduleIsToday(row, dateParts));
  const todayMain = todayRows.filter((row) => ["month", "day"].includes(row.category));
  const todayRegular = todayRows.filter((row) => row.category === "daily");
  const categories = [
    { key: "month", title: "🏆 <b>ТУРНИРЫ МЕСЯЦА</b>" },
    { key: "day", title: "🔥 <b>ТУРНИРЫ ДНЯ</b>" },
    { key: "daily", title: "🔁 <b>ЕЖЕДНЕВНЫЕ ТУРНИРЫ</b>" },
  ];
  const formattedToday = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());
  const todayPosterUrl = schedulePosterUrl("today", dateParts);
  const todayLines = [
    `🖼 <a href="${todayPosterUrl}"><b>АФИША НА СЕГОДНЯ</b></a>`,
    "",
    `📅 <b>СЕГОДНЯ · ${escapeTelegramHtml(formattedToday.toLocaleUpperCase("ru-RU"))}</b>`,
    "",
    ...(todayMain.length
      ? ["<b>ГЛАВНЫЕ ТУРНИРЫ</b>", "", ...todayMain.map((row, index) => scheduleEntryText(row, index, true))]
      : []),
    ...(todayRegular.length
      ? [todayMain.length ? "" : "<b>СЕГОДНЯШНИЕ ТУРНИРЫ</b>", "", ...groupedDailyScheduleLines(todayRegular)]
      : []),
    ...(!todayRows.length ? ["На сегодня турниры не указаны."] : []),
  ];
  if (viewMode === "today") {
    const sent = await telegram(editMessageId ? "editMessageText" : "sendMessage", {
      chat_id: chatId,
      ...(editMessageId ? { message_id: editMessageId } : {}),
      text: todayLines.join("\n"),
      parse_mode: "HTML",
      ...(!editMessageId && messageId ? { reply_to_message_id: messageId } : {}),
      reply_markup: scheduleViewKeyboard(viewMode),
      link_preview_options: { url: todayPosterUrl, prefer_large_media: true, show_above_text: true },
    });
    return Boolean(sent.ok);
  }
  const allPosterUrl = schedulePosterUrl("all", dateParts);
  const lines = [
    `🖼 <a href="${allPosterUrl}"><b>ОБЩАЯ АФИША</b></a>`,
    "",
    "📋 <b>ОБЩЕЕ РАСПИСАНИЕ</b>",
  ];
  for (const category of categories) {
    const categoryRows = rows.filter((row) => row.category === category.key);
    if (!categoryRows.length) continue;
    lines.push(
      "",
      category.title,
      "",
      ...(category.key === "daily"
        ? groupedDailyScheduleLines(categoryRows)
        : category.key === "day"
          ? groupedDayScheduleLines(categoryRows)
        : categoryRows.map((row, index) => scheduleEntryText(row, index, category.key === "month"))),
    );
  }
  if (!storedRows.length) lines.push("", "Расписание пока не заполнено.");
  const sent = await telegram(editMessageId ? "editMessageText" : "sendMessage", {
    chat_id: chatId,
    ...(editMessageId ? { message_id: editMessageId } : {}),
    text: lines.join("\n"),
    parse_mode: "HTML",
    ...(!editMessageId && messageId ? { reply_to_message_id: messageId } : {}),
    reply_markup: scheduleViewKeyboard(viewMode),
    link_preview_options: { url: allPosterUrl, prefer_large_media: true, show_above_text: true },
  });
  return Boolean(sent.ok);
}

async function getChatStopGeneration(chatId) {
  if (isRedisConfigured()) {
    const result = await redisPipeline([["GET", chatStopKey(chatId)]], { context: "telegram-report.stop.get", timeoutMs: 2000 });
    return Number(result?.[0]?.result || 0);
  }
  return Number(chatStopGenerations.get(String(chatId)) || 0);
}

async function stopChatCommands(chatId) {
  if (isRedisConfigured()) {
    const active = await redisPipeline([["EXISTS", chatActiveCommandKey(chatId)]], { context: "telegram-report.stop.active", timeoutMs: 2000 });
    if (!Number(active?.[0]?.result || 0)) return false;
    const result = await redisPipeline([["INCR", chatStopKey(chatId)]], { context: "telegram-report.stop.increment", timeoutMs: 2000 });
    return result?.[0]?.result != null;
  }
  if (!activeChatCommands.has(String(chatId))) return false;
  chatStopGenerations.set(String(chatId), Number(chatStopGenerations.get(String(chatId)) || 0) + 1);
  return true;
}

async function chatCommandWasStopped(chatId, generation) {
  return Number(await getChatStopGeneration(chatId)) !== Number(generation);
}

async function markChatCommandActive(chatId) {
  if (isRedisConfigured()) {
    await redisPipeline([["SET", chatActiveCommandKey(chatId), "1", "EX", "600"]], { context: "telegram-report.command.active", timeoutMs: 2000 });
  } else {
    activeChatCommands.add(String(chatId));
  }
}

async function clearChatCommandActive(chatId) {
  if (isRedisConfigured()) {
    await redisPipeline([["DEL", chatActiveCommandKey(chatId)]], { context: "telegram-report.command.clear", timeoutMs: 2000 });
  } else {
    activeChatCommands.delete(String(chatId));
  }
}

async function scanRedisKeys(pattern, context) {
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const result = await redisPipeline(
      [["SCAN", cursor, "MATCH", pattern, "COUNT", "100"]],
      { context, timeoutMs: 4000 },
    );
    const raw = result?.[0]?.result;
    if (!Array.isArray(raw) || raw.length < 2) return [];
    cursor = String(raw[0] ?? "0");
    if (Array.isArray(raw[1])) keys.push(...raw[1].map(String));
    if (cursor === "0") break;
  }
  return keys;
}

async function listUnrecordedBalanceOperations() {
  const rows = [];
  const pageSize = 500;
  for (let page = 0; page < 20; page += 1) {
    const start = page * pageSize;
    const result = await redisPipeline(
      [["LRANGE", UNRECORDED_BALANCE_OPERATIONS_KEY, String(start), String(start + pageSize - 1)]],
      { context: "telegram-report.balances.unrecorded", timeoutMs: 4000 },
    );
    const batch = Array.isArray(result?.[0]?.result) ? result[0].result : [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows.map((raw) => { try { return JSON.parse(String(raw)); } catch (_) { return null; } }).filter(Boolean);
}

function parseBalanceCommand(text) {
  const match = String(text || "").trim().match(/^\/баланс(?:@[A-Za-z0-9_]+)?(?:\s+(.+?))?\s*$/iu);
  if (!match) return null;
  if (!match[1]) return { action: "show" };
  const payload = match[1].trim();
  const numberOnly = payload.replace(/[\s\u00a0\u202f]/g, "");
  if (/^\d+(?:[.,]\d{1,2})?$/.test(numberOnly)) {
    return { action: "ambiguous", cents: Math.round(Number(numberOnly.replace(",", ".")) * 100) };
  }
  const valuePattern = /([=]?\s*[+-]?\s*\d[\d\s\u00a0\u202f]*(?:[.,]\d{1,2})?)\s*(р|руб(?:лей|ля|ль)?|₽|\$|usd|дол(?:лар(?:ов|а)?)?)/giu;
  const valueMatches = Array.from(payload.matchAll(valuePattern));
  let rub = null;
  let usd = null;
  const mergeChange = (current, next) => current ? {
    action: current.action === "set" || next.action === "set" ? "set" : "adjust",
    cents: current.cents + next.cents,
  } : next;
  for (const valueMatch of valueMatches) {
    const raw = valueMatch[1].replace(/[\s\u00a0\u202f]/g, "");
    const explicitSet = raw.startsWith("=");
    const numeric = Number((explicitSet ? raw.slice(1) : raw).replace(",", "."));
    if (!Number.isFinite(numeric)) return { action: "invalid" };
    const change = {
      action: !explicitSet && (raw.startsWith("+") || raw.startsWith("-")) ? "adjust" : "set",
      cents: Math.round(numeric * 100),
    };
    const currency = String(valueMatch[2]).toLowerCase();
    if (currency === "$" || currency === "usd" || currency.startsWith("дол")) {
      usd = mergeChange(usd, change);
    } else {
      rub = mergeChange(rub, change);
    }
  }
  if (!rub && !usd) return { action: "invalid" };
  const comment = payload
    .replace(valuePattern, " ")
    .replace(/^[,;:\s\u00a0\u202f]+|[,;:\s\u00a0\u202f]+$/gu, "")
    .trim();
  if (comment.length > 300) return { action: "invalid" };
  return { action: "change", rub, usd, comment };
}

function parsePaymentDetailsCommand(text) {
  const match = String(text || "").trim().match(/^\/(реквизиты|реквизты|платежи|разместить)(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+?))?\s*$/iu);
  if (!match) return null;
  const command = match[1].toLowerCase();
  if (!match[2]) return { action: command === "разместить" ? "prompt" : "list" };
  const payload = match[2].trim();
  if (/^(?:удалить|закрыть)$/iu.test(payload)) return { action: "remove" };
  const parts = payload.includes("|")
    ? payload.split(/\s*\|\s*/u)
    : payload.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (parts.length < 4) return { action: "invalid" };
  const amountMatch = parts.shift().replace(/[\s\u00a0\u202f]/g, "").match(/^(\d+(?:[.,]\d{1,2})?)(р|₽|руб|\$|usd)?$/iu);
  if (!amountMatch) return { action: "invalid" };
  const amountCents = Math.round(Number(amountMatch[1].replace(",", ".")) * 100);
  const currency = /^(?:\$|usd)$/iu.test(amountMatch[2] || "") ? "usd" : "rub";
  const phone = parts[0];
  const phoneDigits = phone.replace(/\D/g, "");
  if (!/^\+?[\d\s()-]+$/u.test(phone) || !/^[78]\d{10}$/u.test(phoneDigits)) return { action: "invalid" };
  const details = parts.join("\n").trim();
  if (!amountCents || amountCents < 0 || details.length < 3 || details.length > 500) return { action: "invalid" };
  return { action: "publish", amountCents, currency, details };
}

function paymentDetailsFormText(error = false) {
  return [
    error
      ? "Не удалось распознать данные. Введите их ещё раз — каждое значение с новой строки:"
      : "Введите реквизиты — каждое значение с новой строки:",
    "",
    "Сумма",
    "Номер телефона",
    "Банк",
    "Имя получателя",
    "",
    "Например:",
    "5000",
    "+7 999 999-99-99",
    "Сбер",
    "Андрей Андреич",
  ].join("\n");
}

function isPaymentConfirmCommand(text) {
  return /^\/(?:подтвердить|confirm)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isPaymentNotificationsCommand(text) {
  return /^\/уведомлени(?:е|я)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isPaymentDetailsRemoveCommand(text) {
  return /^\/убрать(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function parseImageGenerationCommand(text) {
  const match = String(text || "").trim().match(/^\/сделать(?:@[A-Za-z0-9_]+)?(?:\s+([\s\S]+))?$/iu);
  if (!match) return null;
  const description = String(match[1] || "").trim();
  return { description, valid: description.length >= 3 && description.length <= 700 };
}

function paymentEntity(binding) {
  return {
    type: binding?.type === "union" ? "union" : "club",
    name: binding?.type === "union" ? binding.league : binding?.club,
    id: binding?.type === "union" ? binding.leagueId : binding?.clubId,
  };
}

function formatPaymentAmount(item) {
  return `${formatRake(Number(item.amountCents || 0) / 100)} ${item.currency === "usd" ? "$" : "₽"}`;
}

async function getPaymentDetails(id) {
  const result = await redisPipeline([["GET", paymentDetailsKey(id)]], { context: "telegram-report.payment-details.get", timeoutMs: 2000 });
  try {
    const item = JSON.parse(String(result?.[0]?.result || ""));
    return await reopenExpiredPaymentDetails(item);
  } catch (_) { return null; }
}

async function savePaymentDetails(item) {
  const result = await redisPipeline([["SET", paymentDetailsKey(item.id), JSON.stringify(item)]], { context: "telegram-report.payment-details.save", timeoutMs: 2000 });
  return result?.[0]?.result === "OK";
}

async function reopenExpiredPaymentDetails(item) {
  if (!item || !["claimed", "awaiting_receipt"].includes(item.status) || !item.claimedAt) return item;
  const claimedAt = new Date(item.claimedAt).getTime();
  if (!Number.isFinite(claimedAt) || Date.now() - claimedAt < PAYMENT_CLAIM_TTL_MS) return item;
  const reopened = { ...item, status: "open", reopenedAt: new Date().toISOString() };
  delete reopened.payer;
  delete reopened.claimedAt;
  await savePaymentDetails(reopened);
  await redisPipeline([["DEL", paymentDetailsClaimKey(item.id)]], { context: "telegram-report.payment-details.reopen", timeoutMs: 2000 });
  return reopened;
}

async function listPaymentDetails() {
  const index = await redisPipeline([["LRANGE", PAYMENT_DETAILS_INDEX_KEY, "0", "99"]], { context: "telegram-report.payment-details.index", timeoutMs: 2000 });
  const ids = Array.isArray(index?.[0]?.result) ? [...new Set(index[0].result.map(String))] : [];
  if (!ids.length) return [];
  const result = await redisPipeline(ids.map((id) => ["GET", paymentDetailsKey(id)]), { context: "telegram-report.payment-details.list", timeoutMs: 3000 });
  const items = result.map((row) => { try { return JSON.parse(String(row?.result || "")); } catch (_) { return null; } }).filter(Boolean);
  return Promise.all(items.map(reopenExpiredPaymentDetails));
}

function isBalanceHistoryCommand(text) {
  return /^\/(?:история(?:@[A-Za-z0-9_]+)?\s+переводов|история_переводов(?:@[A-Za-z0-9_]+)?)\s*$/iu.test(String(text || "").trim());
}

async function getChatBalance(chatId, historyLimit = 3) {
  if (isRedisConfigured()) {
    const historyEnd = Math.max(0, Number(historyLimit) || 0) - 1;
    const result = await redisPipeline([
      ["GET", chatBalanceKey(chatId)],
      ["GET", chatBalanceUsdKey(chatId)],
      ["LRANGE", chatBalanceHistoryKey(chatId), "0", String(historyEnd)],
      ["GET", paymentBalanceKey(chatId)],
      ["GET", paymentBalanceUsdKey(chatId)],
    ], { context: "telegram-report.chat-balance.get", timeoutMs: 2000 });
    const raw = result?.[0]?.result;
    const usdRaw = result?.[1]?.result;
    const paymentRaw = result?.[3]?.result;
    const paymentUsdRaw = result?.[4]?.result;
    const history = Array.isArray(result?.[2]?.result)
      ? result[2].result.map((item) => { try { return JSON.parse(String(item)); } catch (_) { return null; } }).filter(Boolean)
      : [];
    return {
      cents: raw == null ? null : Number(raw),
      usdCents: usdRaw == null ? null : Number(usdRaw),
      paymentCents: Number(paymentRaw || 0),
      paymentUsdCents: Number(paymentUsdRaw || 0),
      history,
    };
  }
  const balance = chatBalances.get(String(chatId)) || { cents: null, usdCents: null, history: [] };
  return { paymentCents: 0, paymentUsdCents: 0, ...balance, history: balance.history.slice(0, Math.max(0, Number(historyLimit) || 0)) };
}

async function changeChatBalance(chatId, command, user, binding) {
  const timestamp = new Date().toISOString();
  const actor = user?.username ? `@${user.username}` : [user?.first_name, user?.last_name].filter(Boolean).join(" ") || String(user?.id || "администратор");
  if (isRedisConfigured()) {
    const operations = [];
    for (const [currency, change, key] of [["rub", command.rub, chatBalanceKey(chatId)], ["usd", command.usd, chatBalanceUsdKey(chatId)]]) {
      if (!change) continue;
      operations.push({ currency, change, command: [change.action === "adjust" ? "INCRBY" : "SET", key, String(change.cents)] });
    }
    const result = await redisPipeline(operations.map((item) => item.command), { context: "telegram-report.chat-balance.change", timeoutMs: 2000 });
    const values = {};
    operations.forEach((item, index) => { values[item.currency] = item.change.action === "adjust" ? Number(result?.[index]?.result) : item.change.cents; });
    if (operations.some((item, index) => item.change.action === "set" && result?.[index]?.result !== "OK")) return null;
    const current = await getChatBalance(chatId);
    const cents = values.rub ?? current.cents;
    const usdCents = values.usd ?? current.usdCents;
    const balanceEntry = { rub: command.rub, usd: command.usd, cents, usdCents, actor, timestamp, comment: command.comment || "" };
    const entry = JSON.stringify(balanceEntry);
    const operation = JSON.stringify({
      ...balanceEntry,
      chatId: String(chatId),
      type: binding?.type === "union" ? "union" : "club",
      name: binding?.type === "union" ? binding.league : binding?.club,
    });
    await redisPipeline([
      ["LPUSH", chatBalanceHistoryKey(chatId), entry],
      ["LTRIM", chatBalanceHistoryKey(chatId), "0", "19"],
      ["LPUSH", UNRECORDED_BALANCE_OPERATIONS_KEY, operation],
    ], { context: "telegram-report.chat-balance.history", timeoutMs: 2000 });
    return { cents, usdCents, actor, timestamp, comment: command.comment || "" };
  }
  if (!allowEphemeralClubBindings()) return null;
  const current = chatBalances.get(String(chatId)) || { cents: null, usdCents: null, history: [] };
  const apply = (oldValue, change) => !change ? oldValue : change.action === "adjust" ? Number(oldValue || 0) + change.cents : change.cents;
  const cents = apply(current.cents, command.rub);
  const usdCents = apply(current.usdCents, command.usd);
  const entry = { rub: command.rub, usd: command.usd, cents, usdCents, actor, timestamp, comment: command.comment || "" };
  chatBalances.set(String(chatId), { cents, usdCents, history: [entry, ...current.history].slice(0, 20) });
  return { cents, usdCents, actor, timestamp, comment: command.comment || "" };
}

async function getClubBinding(chatId) {
  if (isRedisConfigured()) {
    const result = await redisPipeline([["GET", clubBindingKey(chatId)]], { context: "telegram-report.club-binding.get", timeoutMs: 2000 });
    const raw = result?.[0]?.result;
    if (raw) {
      try {
        const binding = JSON.parse(String(raw));
        clubChatBindings.set(String(chatId), binding);
        return binding;
      } catch (_) {}
    }
  }
  return allowEphemeralClubBindings() ? clubChatBindings.get(String(chatId)) || null : null;
}

async function setClubBinding(chatId, binding) {
  // Главные отчётные группы являются общей бухгалтерией и никогда не должны
  // переходить в режим отдельного клуба или союза.
  if (isMainReportChat(chatId)) return false;
  if (!isRedisConfigured()) {
    if (!allowEphemeralClubBindings()) return false;
    clubChatBindings.set(String(chatId), binding);
    return true;
  }
  const result = await redisPipeline([["SET", clubBindingKey(chatId), JSON.stringify(binding)]], { context: "telegram-report.club-binding.set", timeoutMs: 2000 });
  const saved = Boolean(result?.[0]?.result === "OK");
  if (saved) clubChatBindings.set(String(chatId), binding);
  return saved;
}

async function deleteClubBinding(chatId) {
  if (!isRedisConfigured()) {
    if (!allowEphemeralClubBindings()) return false;
    clubChatBindings.delete(String(chatId));
    return true;
  }
  const result = await redisPipeline([["DEL", clubBindingKey(chatId)]], { context: "telegram-report.club-binding.delete", timeoutMs: 2000 });
  const deleted = Boolean(result?.[0]?.result);
  if (deleted) clubChatBindings.delete(String(chatId));
  return deleted;
}

function parseClubBindingCommand(text) {
  const match = String(text || "").trim().match(/^\/(?:привязать|bind)(?:@[A-Za-z0-9_]+)?\s+(?:(клуб|союз)\s+)?(.+?)\s*$/iu);
  return match ? {
    type: match[1] ? (match[1].toLowerCase() === "союз" ? "union" : "club") : null,
    query: match[2].trim(),
  } : null;
}

function parseManualClubCommand(text) {
  const match = String(text || "").trim().match(/^\/(?:создать(?:_|\s+)клуб|create(?:_|\s+)club)(?:@[A-Za-z0-9_]+)?\s+(.+?)\s*$/iu);
  if (!match) return null;
  const name = match[1].trim();
  return name.length >= 2 && name.length <= 80 ? name : "";
}

function isClubUnbindCommand(text) {
  return /^\/(?:отвязать|unbind)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isBindingStatusCommand(text) {
  return /^\/(?:привязка|binding)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isCurrentClubCommand(text) {
  return /^\/(?:мой\s+клуб|клуб|союз|club|union|отчет|отчёт|report)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

async function claimClubBroadcast(update, message) {
  const key = update.update_id != null
    ? `update:${update.update_id}`
    : `message:${message.chat.id}:${message.message_id}`;
  if (isRedisConfigured()) {
    const result = await redisPipeline(
      [["SET", `poker21:telegram-report:clubs:${key}`, "1", "NX", "EX", "3600"]],
      { context: "telegram-report.club-broadcast-lock", timeoutMs: 2000 },
    );
    if (result && result[0]) return result[0].result === "OK";
  }
  const now = Date.now();
  for (const [storedKey, timestamp] of processedClubBroadcasts) {
    if (now - timestamp > 60 * 60 * 1000) processedClubBroadcasts.delete(storedKey);
  }
  if (processedClubBroadcasts.has(key)) return false;
  processedClubBroadcasts.set(key, now);
  return true;
}

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

function reportPeriodLine(data = latestUnionData) {
  const source = data?.jackpot || data?.directory || data?.leagueReports || data?.clubReports || {};
  return `<b>Период: ${displayIso(source.startDate)}–${displayIso(source.endDate)}</b>`;
}

function formatRub(value) {
  return `${Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function isRakeSummaryCommand(text) {
  return /^\/клубы(?:@[A-Za-z0-9_]+)?\s+рейк\s*$/iu.test(String(text || "").trim());
}

function parseUnionPeriodSuffix(text) {
  const match = String(text || "").trim().match(/\s+(\d{1,2})\.(\d{1,2})\s*[-–—]\s*(\d{1,2})\.(\d{1,2})\s*$/u);
  if (!match) return { text: String(text || "").trim(), data: latestUnionData, requested: false };
  const [, startDay, startMonth, endDay, endMonth] = match;
  const periods = Array.isArray(unionPeriods.periods) ? unionPeriods.periods : [];
  const data = periods.find((row) => {
    const start = dateParts(row.startDate);
    const end = dateParts(row.endDate);
    return start.day === Number(startDay) && start.month === Number(startMonth) && end.day === Number(endDay) && end.month === Number(endMonth);
  });
  return { text: String(text || "").slice(0, match.index).trim(), data: data || null, requested: true, label: `${startDay}.${startMonth}-${endDay}.${endMonth}` };
}

function isPeriodCommand(text) {
  return /^\/(?:период|period)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

async function sendPeriod(chatId, messageId, selection) {
  const periods = Array.isArray(unionPeriods.periods) ? unionPeriods.periods : [];
  const lines = selection.requested && selection.data
    ? [
        "<b>Период найден</b>",
        `<b>${displayIso(selection.data.startDate)}–${displayIso(selection.data.endDate)}</b>`,
        "",
        `Например: <code>/игры ${selection.label}</code>`,
        `<code>/клуб Два Туза ${selection.label}</code>`,
        `<code>/игрок Waaar ${selection.label}</code>`,
      ]
    : [
        "<b>Доступные периоды</b>",
        "",
        ...periods.map((row) => `${displayIso(row.startDate)}–${displayIso(row.endDate)}`),
        "",
        "Без периода показывается последняя загруженная неделя.",
      ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

function isCommandsCommand(text) {
  return /^\/(?:команды|commands|help)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isOverlaysCommand(text) {
  return /^\/(?:оверлеи|overlays)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isGamesCommand(text) {
  return /^\/(?:игры|games)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isJackpotCommand(text) {
  return /^\/(?:джекпот|jackpot)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isCalculationsCommand(text) {
  return /^\/(?:расчеты|расчёты|calculations)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isUnionsCommand(text) {
  return /^\/(?:союзы|unions)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isUnionTotalsCommand(text) {
  return /^\/(?:союзы|unions)(?:@[A-Za-z0-9_]+)?\s+(?:итого|total)\s*$/iu.test(String(text || "").trim());
}

function isClubsCommand(text) {
  return /^\/(?:клубы|clubs)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isBoundUnionClubsCommand(text) {
  return /^\/(?:клубы_союза|union_clubs)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function parseLiveTablesCommand(text) {
  const match = String(text || "").trim().match(/^\/(онлайн|online|столы|tables)(?:@[A-Za-z0-9_]+)?\s*$/iu);
  if (!match) return null;
  return /^(?:столы|tables)$/iu.test(match[1]) ? "tables" : "online";
}

function isClubTotalsCommand(text) {
  return /^\/(?:клубы|clubs)(?:@[A-Za-z0-9_]+)?\s+(?:итого|total)\s*$/iu.test(String(text || "").trim());
}

function isChineseCommand(text) {
  return /^\/(?:китайцы|chinese)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isShareCommand(text) {
  return /^\/(?:доля|share)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isDiamondSalesCommand(text) {
  return /^\/(?:алмазы|diamonds)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isRomanTotalCommand(text) {
  return /^\/итого(?:@[A-Za-z0-9_]+)?\s+роман\s*$/iu.test(String(text || "").trim());
}

function parseRomanAmountInput(text) {
  const match = String(text || "").trim().match(/^\+?([\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)\s*(?:р|руб(?:лей|ля|ль)?|₽)?\s*$/iu);
  if (!match) return null;
  const value = Number(match[1].replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

function isOverviewCommand(text) {
  return /^\/(?:сводка|summary)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isKickbacksCommand(text) {
  return /^\/(?:откаты|kickbacks)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isBalancesCommand(text) {
  return /^\/балансы(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isTransferBalancesCommand(text) {
  return /^\/переводы(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isRecordBalancesCommand(text) {
  return /^\/записать(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isActivityCommand(text) {
  return /^\/(?:активность|activity)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function formatActivityTop(title, rows, field, formatter, nameField = "club") {
  return [
    "",
    `<b>${title}</b>`,
    ...(Array.isArray(rows) ? rows : []).map((row, index) => `${index + 1}. ${escapeTelegramHtml(row[nameField])} — ${formatter(row[field])}`),
  ];
}

function getActivityClubs(data) {
  if (Array.isArray(data.activity?.clubs)) return data.activity.clubs;
  const memberIds = new Set((data.memberRake?.clubs || []).map((row) => String(row.clubId)));
  const knownActivity = new Map();
  for (const key of ["topPlayers", "topHands", "topRakePerPlayer"]) {
    for (const row of data.activity?.[key] || []) knownActivity.set(String(row.clubId), { ...knownActivity.get(String(row.clubId)), ...row });
  }
  return (data.directory?.clubs || []).filter((club) => memberIds.has(String(club.id))).map((club) => {
    const known = knownActivity.get(String(club.id)) || {};
    const activePlayers = known.activePlayers ?? (club.playerRows || []).filter((player) =>
      Number(player.winnings || 0) || Number(player.rake || 0) || Number(player.insurance || 0)
    ).length;
    const rake = Number(club.rake || 0);
    return { club: club.name, clubId: club.id, activePlayers, hands: Number(club.hands || 0), rake,
      rakePerPlayer: activePlayers ? rake / activePlayers : 0 };
  });
}

function getActivityLeagues(data) {
  if (Array.isArray(data.activity?.leagues)) return data.activity.leagues;
  const rows = (data.leaguePlayerTops?.leagues || []).map((league) => {
    const activePlayers = (league.players || []).filter((player) =>
      Number(player.rake || 0) || Number(player.winnings || 0) || Number(player.insurance || 0) ||
      Number(player.jackpotFee || 0) || Number(player.jackpotPayout || 0)
    ).length;
    const rake = (league.players || []).reduce((sum, player) => sum + Number(player.rake || 0), 0);
    return { league: league.league, leagueId: league.leagueId, activePlayers, rake,
      rakePerPlayer: activePlayers ? rake / activePlayers : 0 };
  });
  const known = new Set(rows.map((row) => String(row.leagueId || row.league).toLocaleLowerCase("ru")));
  for (const report of data.leagueReports?.reports || []) {
    const key = String(report.leagueId || report.league).toLocaleLowerCase("ru");
    if (!known.has(key)) rows.push({ league: report.league, leagueId: report.leagueId, activePlayers: 0, rake: 0, rakePerPlayer: 0 });
  }
  return rows;
}

async function sendActivity(chatId, messageId, data = latestUnionData) {
  const unionActivitySummary = data.activity;
  const clubs = getActivityClubs(data);
  const leagues = getActivityLeagues(data);
  const sortedLeaguesByPlayers = [...leagues].sort((a, b) => b.activePlayers - a.activePlayers || a.league.localeCompare(b.league, "ru"));
  const sortedLeaguesByRake = [...leagues].sort((a, b) => b.rakePerPlayer - a.rakePerPlayer || a.league.localeCompare(b.league, "ru"));
  const sortedClubsByPlayers = [...clubs].sort((a, b) => b.activePlayers - a.activePlayers || a.club.localeCompare(b.club, "ru"));
  const sortedClubsByHands = [...clubs].sort((a, b) => b.hands - a.hands || a.club.localeCompare(b.club, "ru"));
  const sortedClubsByRake = [...clubs].sort((a, b) => b.rakePerPlayer - a.rakePerPlayer || a.club.localeCompare(b.club, "ru"));
  const lines = [
    "Активность союзов и клубов",
    `<b>Период: ${displayIso(unionActivitySummary.startDate)}–${displayIso(unionActivitySummary.endDate)}</b>`,
    "",
    "<b>Общая статистика по союзам</b>",
    `Всего союзов: ${formatInteger(leagues.length)}`,
    `Активных союзов: ${formatInteger(leagues.filter((row) => row.activePlayers || row.rake).length)}`,
    `Активных игроков: ${formatInteger(leagues.reduce((sum, row) => sum + Number(row.activePlayers || 0), 0))}`,
    ...formatActivityTop("Союзы по активным игрокам", sortedLeaguesByPlayers, "activePlayers", formatInteger, "league"),
    ...formatActivityTop("Союзы по рейку на игрока", sortedLeaguesByRake, "rakePerPlayer", formatRake, "league"),
    "",
    "<b>Клубы союза Anti-Reg</b>",
    `Всего клубов: ${formatInteger(clubs.length)}`,
    `Активных клубов: ${formatInteger(unionActivitySummary.activeClubs)}`,
    `Активных игроков: ${formatInteger(unionActivitySummary.activePlayers)}`,
    `Раздач: ${formatInteger(unionActivitySummary.hands)}`,
    ...formatActivityTop("Клубы по активным игрокам", sortedClubsByPlayers, "activePlayers", formatInteger),
    ...formatActivityTop("Клубы по раздачам", sortedClubsByHands, "hands", formatInteger),
    ...formatActivityTop("Клубы по рейку на игрока", sortedClubsByRake, "rakePerPlayer", formatRake),
  ];
  const chunks = [];
  let chunk = "";
  for (const line of lines) {
    const candidate = chunk ? `${chunk}\n${line}` : line;
    if (candidate.length > 3900 && chunk) {
      chunks.push(chunk);
      chunk = line;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  let allSent = chunks.length > 0;
  for (const [index, text] of chunks.entries()) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(index === 0 ? { reply_to_message_id: messageId } : {}),
    });
    allSent = allSent && Boolean(sent.ok);
  }
  return allSent;
}

async function readPlayingTablesCached() {
  const now = Date.now();
  if (Array.isArray(playingTablesCache.tables) && playingTablesCache.expiresAt > now) return playingTablesCache.tables;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 7000) : null;
  let response;
  try {
    response = await fetch(POKER21_TABLES_ENDPOINT, { signal: controller?.signal });
  } finally {
    if (timer) clearTimeout(timer);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !Array.isArray(payload.tables)) {
    throw new Error(payload.error || `Poker21 tables HTTP ${response.status}`);
  }
  const tables = payload.tables;
  playingTablesCache = { tables, expiresAt: now + PLAYING_TABLES_CACHE_MS };
  return tables;
}

function formatCountWithNoun(value, one, few, many) {
  const count = Math.max(0, Math.round(Number(value || 0)));
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun = mod100 >= 11 && mod100 <= 14 ? many : mod10 === 1 ? one : mod10 >= 2 && mod10 <= 4 ? few : many;
  return `${formatInteger(count)} ${noun}`;
}

function liveTableLabel(table) {
  const name = String(table.deskName || table.deskId || "Стол").trim();
  const game = String(table.playType || "Игра").trim();
  const blind = String(table.blindAnnotation || "").trim();
  const entry = Number.isFinite(Number(table.entryFees)) && Number(table.entryFees) > 0
    ? `, вход ${formatRake(table.entryFees)}`
    : "";
  return `${escapeTelegramHtml(name)} — ${escapeTelegramHtml(game)}${blind ? `, ${escapeTelegramHtml(blind)}` : ""}${entry} — ${formatCountWithNoun(table.playerCount, "место", "места", "мест")}`;
}

async function sendLiveTables(chatId, messageId, mode) {
  try {
    const leagueName = "гранд-союзе";
    const tables = (await readPlayingTablesCached())
      .filter((table) => Number(table.playerCount || 0) > 0)
      .sort((a, b) => Number(b.playerCount || 0) - Number(a.playerCount || 0) || String(a.deskName || "").localeCompare(String(b.deskName || ""), "ru"));
    const occupiedSeats = tables.reduce((sum, table) => sum + Number(table.playerCount || 0), 0);
    const byGame = new Map();
    for (const table of tables) {
      const game = String(table.playType || "Другая игра").trim();
      const row = byGame.get(game) || { tables: 0, seats: 0 };
      row.tables += 1;
      row.seats += Number(table.playerCount || 0);
      byGame.set(game, row);
    }
    const summary = [...byGame.entries()]
      .sort((a, b) => b[1].seats - a[1].seats || a[0].localeCompare(b[0], "ru"))
      .map(([game, row]) => `${escapeTelegramHtml(game)} — ${formatCountWithNoun(row.tables, "стол", "стола", "столов")} / ${formatCountWithNoun(row.seats, "место", "места", "мест")}`);
    const lines = [
      `🟢 <b>Сейчас в ${leagueName}</b>`,
      "",
      `Столов с игрой: <b>${formatInteger(tables.length)}</b>`,
      `Занято мест: <b>${formatInteger(occupiedSeats)}</b>`,
      "<i>Один игрок за несколькими столами учитывается несколько раз.</i>",
      ...(summary.length ? ["", "<b>По видам игр</b>", ...summary] : []),
      ...(mode === "tables" && tables.length ? ["", "<b>Столы</b>", ...tables.map((table, index) => `${index + 1}. ${liveTableLabel(table)}`)] : []),
      ...(!tables.length ? ["", "Сейчас активных столов не найдено."] : []),
    ];
    const chunks = [];
    let current = [];
    for (const line of lines) {
      if ([...current, line].join("\n").length > 3800 && current.length) {
        chunks.push(current.join("\n"));
        current = ["<b>Столы гранд-союза — продолжение</b>", ""];
      }
      current.push(line);
    }
    if (current.length) chunks.push(current.join("\n"));
    let allSent = chunks.length > 0;
    for (const [index, text] of chunks.entries()) {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        ...(index === 0 ? { reply_to_message_id: messageId } : {}),
      });
      allSent = allSent && Boolean(sent.ok);
    }
    return allSent;
  } catch (error) {
    console.error("telegram-report-webhook: playing tables failed", error?.message || error);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Не удалось получить текущие столы Poker21. Попробуйте ещё раз немного позже.",
      reply_to_message_id: messageId,
    });
    return Boolean(sent.ok);
  }
}

function parsePlayersCommand(text) {
  const match = String(text || "").trim().match(
    /^\/игроки(?:@[A-Za-z0-9_]+)?\s+(рейк|минус|плюс)\s*$/iu
  );
  return match ? match[1].toLowerCase() : null;
}

function parseClubTopCommand(text) {
  const match = String(text || "").trim().match(/^\/(?:топ_клубов|club_top)(?:@[A-Za-z0-9_]+)?\s+(рейк|плюс|минус)\s*$/iu);
  return match ? match[1].toLowerCase() : null;
}

function parseUnionClubInfoCommand(text) {
  const match = String(text || "").trim().match(/^\/клуб(?:@[A-Za-z0-9_]+)?\s+инфо\s+(.+?)\s*$/iu);
  return match ? match[1].trim() : null;
}

function parseAutoReportCommand(text) {
  const match = String(text || "").trim().match(/^\/(?:автоотчет|автоотчёт|auto_report)(?:@[A-Za-z0-9_]+)?(?:\s+(вкл|выкл|статус))?\s*$/iu);
  return match ? (match[1] || "статус").toLowerCase() : null;
}

function isBoundUnionTotalCommand(text) {
  return /^\/(?:итого_союза|union_total)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function parseEntityCommand(text, command) {
  const pattern = new RegExp(`^/${command}(?:@[A-Za-z0-9_]+)?\\s+(.+?)\\s*$`, "iu");
  const match = String(text || "").trim().match(pattern);
  return match ? match[1].trim() : null;
}

function normalizeLookup(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

function transliterateLatinToRussian(value) {
  let text = normalizeLookup(value);
  const pairs = [
    ["shch", "щ"], ["yo", "е"], ["zh", "ж"], ["kh", "х"], ["ts", "ц"],
    ["ch", "ч"], ["sh", "ш"], ["yu", "ю"], ["ya", "я"], ["ye", "е"],
  ];
  for (const [latin, russian] of pairs) text = text.replaceAll(latin, russian);
  const letters = { a: "а", b: "б", c: "к", d: "д", e: "е", f: "ф", g: "г", h: "х", i: "и", j: "дж", k: "к", l: "л", m: "м", n: "н", o: "о", p: "п", q: "к", r: "р", s: "с", t: "т", u: "у", v: "в", w: "в", x: "кс", y: "и", z: "з" };
  return text.replace(/[a-z]/g, (letter) => letters[letter] || letter);
}

function levenshteinDistance(left, right) {
  const a = normalizeLookup(left);
  const b = normalizeLookup(right);
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function lookupScore(candidate, query) {
  const values = Array.from(new Set([normalizeLookup(candidate), transliterateLatinToRussian(candidate)]));
  const needles = Array.from(new Set([normalizeLookup(query), transliterateLatinToRussian(query)]));
  const scores = [];
  for (const value of values) for (const needle of needles) {
    if (!value || !needle) continue;
    if (value === needle) scores.push(0);
    else if (value.startsWith(needle)) scores.push(1);
    else if (value.includes(needle)) scores.push(2);
    else {
      const maxDistance = needle.length <= 4 ? 1 : needle.length <= 8 ? 2 : 3;
      const distance = levenshteinDistance(value, needle);
      const prefixDistance = value.length >= needle.length ? levenshteinDistance(value.slice(0, needle.length), needle) : Infinity;
      const bestDistance = Math.min(distance, prefixDistance);
      if (bestDistance <= maxDistance) scores.push(3 + bestDistance / 10);
    }
  }
  return scores.length ? Math.min(...scores) : null;
}

function findClubMatches(query, data = latestUnionData) {
  const unionDirectory = data.directory;
  const clubs = Array.isArray(unionDirectory.clubs) ? unionDirectory.clubs : [];
  const exactId = clubs.find((club) => String(club.id) === String(query).trim());
  if (exactId) return [exactId];
  return clubs
    .map((club) => ({ club, score: lookupScore(club.name, query) }))
    .filter((row) => row.score !== null)
    .sort((a, b) => a.score - b.score || Number(b.club.rake || 0) - Number(a.club.rake || 0))
    .slice(0, 10)
    .map((row) => row.club);
}

function findPlayerMatches(query, data = latestUnionData) {
  const unionDirectory = data.directory;
  const players = Array.isArray(unionDirectory.players) ? unionDirectory.players : [];
  const exactId = players.find((player) => String(player.id) === String(query).trim());
  if (exactId) return [exactId];
  return players
    .map((player) => {
      const names = [player.nick].concat(Array.isArray(player.aliases) ? player.aliases : []);
      const scores = names.map((name) => lookupScore(name, query)).filter((score) => score !== null);
      return { player, score: scores.length ? Math.min(...scores) : null };
    })
    .filter((row) => row.score !== null)
    .sort((a, b) => a.score - b.score || Math.abs(Number(b.winnings || 0)) - Math.abs(Number(a.winnings || 0)))
    .slice(0, 10)
    .map((row) => row.player);
}

function playerLookupScore(player, query) {
  const names = [player && player.nick].concat(Array.isArray(player && player.aliases) ? player.aliases : []);
  const scores = names.map((name) => lookupScore(name, query)).filter((score) => score !== null);
  return scores.length ? Math.min(...scores) : null;
}

function clubNameById(clubId, data = latestUnionData) {
  const unionDirectory = data.directory;
  const club = (unionDirectory.clubs || []).find((row) => String(row.id) === String(clubId));
  return club ? club.name : String(clubId);
}

function formatPlayerRanking(title, rows, field) {
  const items = Array.isArray(rows) ? rows : [];
  if (!items.length) return [];
  return [
    "",
    `<b>${title}</b>`,
    ...items.map((row, index) => `${index + 1}. ${escapeTelegramHtml(row.nick)} (${row.id}) — ${formatRake(row[field])}`),
  ];
}

async function sendClubProfile(chatId, messageId, query, data = latestUnionData) {
  const unionDirectory = data.directory;
  const matches = findClubMatches(query, data);
  if (!matches.length) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Клуб «${query}» не найден.`, reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const topScore = lookupScore(matches[0].name, query);
  const secondScore = matches.length > 1 ? lookupScore(matches[1].name, query) : null;
  if (matches.length > 1 && topScore !== 0 && topScore === secondScore) {
    const lines = ["Найдено несколько клубов. Уточните название или используйте ID:", "", ...matches.map((club) => `${club.name} — <code>/клуб ${club.id}</code>`)];
    const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const club = matches[0];
  const lines = [
    `<b>${escapeTelegramHtml(club.name)} (${club.id})</b>`,
    `<b>Период: ${displayIso(unionDirectory.startDate)}–${displayIso(unionDirectory.endDate)}</b>`,
    "",
    `Выигрыш игроков: ${formatRake(club.winnings)}`,
    `<b>Весь рейк: ${formatRake(club.rake)}</b>`,
    `Cash: ${formatRake(club.cashRake)}`,
    `MTT: ${formatRake(club.mttRake)}`,
    `SNG: ${formatRake(club.sngRake)}`,
    `Страховка: ${formatRake(club.insurance)}`,
    `Сбор джекпота: ${formatRake(club.jackpotFee)}`,
    `Выплаты джекпота: ${formatRake(club.jackpotPayout)}`,
    `Profits: ${formatRake(club.profits)}`,
    `Игроков в статистике: ${Number(club.players || 0).toLocaleString("ru-RU")}`,
    ...formatPlayerRanking("Топ-5 по рейку", club.topRake, "rake"),
    ...formatPlayerRanking("Топ-5 по выигрышу", club.topPlus, "winnings"),
    ...formatPlayerRanking("Топ-5 по проигрышу", club.topMinus, "winnings"),
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

async function sendPlayerProfile(chatId, messageId, query, data = latestUnionData) {
  const unionDirectory = data.directory;
  const matches = findPlayerMatches(query, data);
  if (!matches.length) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Игрок «${query}» не найден.`, reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const topScore = playerLookupScore(matches[0], query);
  const secondScore = matches.length > 1 ? playerLookupScore(matches[1], query) : null;
  if (matches.length > 1 && topScore !== 0 && topScore === secondScore && String(matches[0].id) !== String(query).trim()) {
    const lines = [
      "Найдено несколько похожих игроков. Выберите ID:",
      "",
      ...matches.map((player) => `${escapeTelegramHtml(player.nick)} (${player.id}) — ${player.clubs.map((id) => clubNameById(id, data)).map(escapeTelegramHtml).join(", ")} — <code>/игрок ${player.id}</code>`),
    ];
    const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const player = matches[0];
  const lines = [
    `<b>${escapeTelegramHtml(player.nick)} (${player.id})</b>`,
    `<b>Период: ${displayIso(unionDirectory.startDate)}–${displayIso(unionDirectory.endDate)}</b>`,
    "",
    `Клубы: ${player.clubs.map((id) => clubNameById(id, data)).map(escapeTelegramHtml).join(", ") || "—"}`,
    `Агенты: ${(player.agents || []).map(escapeTelegramHtml).join(", ") || "—"}`,
    `<b>Выигрыш: ${formatRake(player.winnings)}</b>`,
    `<b>Рейк: ${formatRake(player.rake)}</b>`,
    `Cash: ${formatRake(player.cashRake)}`,
    `MTT: ${formatRake(player.mttRake)}`,
    `SNG: ${formatRake(player.sngRake)}`,
    `Страховка: ${formatRake(player.insurance)}`,
    `Сбор джекпота: ${formatRake(player.jackpotFee)}`,
    `Выплаты джекпота: ${formatRake(player.jackpotPayout)}`,
  ];
  if (Array.isArray(player.winGames) && player.winGames.length) {
    lines.push("", "<b>Выигрыш по играм</b>", ...player.winGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  }
  if (Array.isArray(player.rakeGames) && player.rakeGames.length) {
    lines.push("", "<b>Рейк по играм</b>", ...player.rakeGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  }
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

function escapeTelegramHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendPlayerTops(chatId, messageId, type, data = latestUnionData) {
  const unionPlayerTops = data.playerTops;
  const configs = {
    рейк: { key: "rake", title: "Топ-10 игроков по рейку" },
    минус: { key: "minus", title: "Топ-10 игроков по проигрышу" },
    плюс: { key: "plus", title: "Топ-10 игроков по выигрышу" },
  };
  const config = configs[type];
  const rows = config && Array.isArray(unionPlayerTops[config.key]) ? unionPlayerTops[config.key] : [];
  const lines = [
    config.title,
    `<b>Период: ${displayIso(unionPlayerTops.startDate)}–${displayIso(unionPlayerTops.endDate)}</b>`,
    "",
    ...rows.map((row, index) => {
      const clubs = Array.isArray(row.clubs) ? row.clubs.join(", ") : "";
      return `${index + 1}. <b>${escapeTelegramHtml(row.nick)}</b> (${row.playerId}) — ${formatRake(row.value)} — ${escapeTelegramHtml(clubs)}`;
    }),
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendBoundUnionPlayerTops(chatId, binding, type, data = latestUnionData) {
  const leagueRows = Array.isArray(data.leaguePlayerTops?.leagues) ? data.leaguePlayerTops.leagues : [];
  const league = leagueRows.find((row) => String(row.leagueId) === String(binding.leagueId));
  const configs = {
    рейк: { key: "rake", title: "Топ-10 игроков по рейку" },
    минус: { key: "minus", title: "Топ-10 игроков по проигрышу" },
    плюс: { key: "plus", title: "Топ-10 игроков по выигрышу" },
  };
  const config = configs[type];
  const rows = league && config && Array.isArray(league[config.key]) ? league[config.key] : [];
  const lines = [
    `<b>${config.title} — ${escapeTelegramHtml(binding.league)}</b>`,
    `<b>Период: ${displayIso(data.leaguePlayerTops?.startDate)}–${displayIso(data.leaguePlayerTops?.endDate)}</b>`,
    "",
    ...(rows.length ? rows.map((row, index) => {
      const clubs = Array.isArray(row.clubs) ? row.clubs.join(", ") : "";
      return `${index + 1}. <b>${escapeTelegramHtml(row.nick)}</b> (${row.playerId}) — ${formatRake(row.value)}${clubs ? ` — ${escapeTelegramHtml(clubs)}` : ""}`;
    }) : ["Нет игроков с ненулевым показателем."]),
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendBoundUnionPlayerProfile(chatId, binding, query, data = latestUnionData) {
  const leagues = Array.isArray(data.leaguePlayerTops?.leagues) ? data.leaguePlayerTops.leagues : [];
  const league = leagues.find((row) => String(row.leagueId) === String(binding.leagueId));
  const fallback = new Map();
  for (const type of ["rake", "minus", "plus"]) {
    for (const row of Array.isArray(league?.[type]) ? league[type] : []) {
      const player = fallback.get(String(row.playerId)) || { playerId: String(row.playerId), nick: row.nick, clubs: row.clubs || [], rake: 0, winnings: 0 };
      if (type === "rake") player.rake = Number(row.value || 0);
      else player.winnings = Number(row.value || 0);
      fallback.set(String(row.playerId), player);
    }
  }
  const players = Array.isArray(league?.players) && league.players.length ? league.players : Array.from(fallback.values());
  const exact = players.find((row) => String(row.playerId) === String(query).trim());
  const matches = exact ? [exact] : players
    .map((row) => ({ row, score: lookupScore(row.nick, query) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score || Number(b.row.rake || 0) - Number(a.row.rake || 0))
    .slice(0, 10)
    .map(({ row }) => row);
  if (!matches.length) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Игрок «${query}» в союзе «${binding.league}» не найден.` });
    return Boolean(sent.ok);
  }
  if (matches.length > 1 && lookupScore(matches[0].nick, query) === lookupScore(matches[1].nick, query)) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: ["Найдено несколько игроков в этом союзе. Выберите ID:", "", ...matches.map((row) => `${escapeTelegramHtml(row.nick)} (${row.playerId}) — <code>/игрок ${row.playerId}</code>`)].join("\n"),
      parse_mode: "HTML",
    });
    return Boolean(sent.ok);
  }
  const player = matches[0];
  const generalPlayer = Array.isArray(data.directory?.players)
    ? data.directory.players.find((row) => String(row.id) === String(player.playerId))
    : null;
  const lines = [
    `<b>${escapeTelegramHtml(player.nick)} (${player.playerId}) — ${escapeTelegramHtml(binding.league)}</b>`,
    `<b>Период: ${displayIso(data.leaguePlayerTops?.startDate)}–${displayIso(data.leaguePlayerTops?.endDate)}</b>`,
    "",
    `Клубы: ${(player.clubs || []).map(escapeTelegramHtml).join(", ") || "—"}`,
    `<b>Выигрыш: ${formatRake(player.winnings)}</b>`,
    `<b>Рейк: ${formatRake(player.rake)}</b>`,
    `Страховка: ${formatRake(player.insurance)}`,
  ];
  const winGames = Array.isArray(generalPlayer?.winGames) ? generalPlayer.winGames : [];
  const rakeGames = Array.isArray(generalPlayer?.rakeGames) ? generalPlayer.rakeGames : [];
  if (winGames.length) {
    lines.push("", "<b>Выигрыш по играм</b>", ...winGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  }
  if (rakeGames.length) {
    lines.push("", "<b>Рейк по играм</b>", ...rakeGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  }
  if (!winGames.length && !rakeGames.length) {
    lines.push("Детализация по видам игр для этого игрока в файле отсутствует.");
  }
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

function boundClubData(binding, data = latestUnionData) {
  return (Array.isArray(data.directory?.clubs) ? data.directory.clubs : []).find((row) => String(row.id) === String(binding.clubId));
}

async function sendBoundClubPlayerTops(chatId, binding, type, data = latestUnionData) {
  const club = boundClubData(binding, data);
  const players = Array.isArray(club?.playerRows) ? club.playerRows : [];
  const configs = {
    рейк: { title: "Топ-10 игроков по рейку", field: "rake", filter: (row) => Number(row.rake || 0) !== 0, sort: (a, b) => Number(b.rake || 0) - Number(a.rake || 0) },
    плюс: { title: "Топ-10 игроков по выигрышу", field: "winnings", filter: (row) => Number(row.winnings || 0) > 0, sort: (a, b) => Number(b.winnings || 0) - Number(a.winnings || 0) },
    минус: { title: "Топ-10 игроков по проигрышу", field: "winnings", filter: (row) => Number(row.winnings || 0) < 0, sort: (a, b) => Number(a.winnings || 0) - Number(b.winnings || 0) },
  };
  const config = configs[type];
  const rows = players.filter(config.filter).sort(config.sort).slice(0, 10);
  const lines = [
    `<b>${config.title} — ${escapeTelegramHtml(binding.club)}</b>`,
    `<b>Период: ${displayIso(data.directory?.startDate)}–${displayIso(data.directory?.endDate)}</b>`,
    "",
    ...(rows.length ? rows.map((row, index) => `${index + 1}. <b>${escapeTelegramHtml(row.nick)}</b> (${row.id}) — ${formatRake(row[config.field])}`) : ["Нет игроков с ненулевым показателем."]),
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendBoundClubPlayerProfile(chatId, binding, query, data = latestUnionData) {
  const club = boundClubData(binding, data);
  const players = Array.isArray(club?.playerRows) ? club.playerRows : [];
  const exact = players.find((row) => String(row.id) === String(query).trim());
  const matches = exact ? [exact] : players
    .map((row) => ({ row, score: lookupScore(row.nick, query) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score || Number(b.row.rake || 0) - Number(a.row.rake || 0))
    .slice(0, 10)
    .map(({ row }) => row);
  if (!matches.length) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Игрок «${query}» в клубе «${binding.club}» не найден.` });
    return Boolean(sent.ok);
  }
  if (matches.length > 1 && lookupScore(matches[0].nick, query) === lookupScore(matches[1].nick, query)) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: ["Найдено несколько игроков в этом клубе. Выберите ID:", "", ...matches.map((row) => `${escapeTelegramHtml(row.nick)} (${row.id}) — <code>/игрок ${row.id}</code>`)].join("\n"),
      parse_mode: "HTML",
    });
    return Boolean(sent.ok);
  }
  const player = matches[0];
  const lines = [
    `<b>${escapeTelegramHtml(player.nick)} (${player.id}) — ${escapeTelegramHtml(binding.club)}</b>`,
    `<b>Период: ${displayIso(data.directory?.startDate)}–${displayIso(data.directory?.endDate)}</b>`,
    "",
    `<b>Выигрыш: ${formatRake(player.winnings)}</b>`,
    `<b>Рейк: ${formatRake(player.rake)}</b>`,
    `Cash: ${formatRake(player.cashRake)}`,
    `MTT: ${formatRake(player.mttRake)}`,
    `SNG: ${formatRake(player.sngRake)}`,
    `Страховка: ${formatRake(player.insurance)}`,
  ];
  if (Array.isArray(player.winGames) && player.winGames.length) lines.push("", "<b>Выигрыш по играм</b>", ...player.winGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  if (Array.isArray(player.rakeGames) && player.rakeGames.length) lines.push("", "<b>Рейк по играм</b>", ...player.rakeGames.map(([name, value]) => `${escapeTelegramHtml(name)} — ${formatRake(value)}`));
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendBoundUnionClubs(chatId, binding, data = latestUnionData) {
  const leagueRows = Array.isArray(data.leaguePlayerTops?.leagues) ? data.leaguePlayerTops.leagues : [];
  const league = leagueRows.find((row) => String(row.leagueId) === String(binding.leagueId));
  const clubs = Array.isArray(league?.clubs) ? league.clubs.filter((row) => Number(row.rake || 0) !== 0 || Number(row.winLose || 0) !== 0) : [];
  const totalRake = clubs.reduce((sum, row) => sum + Number(row.rake || 0), 0);
  const totalWinLose = clubs.reduce((sum, row) => sum + Number(row.winLose || 0), 0);
  const totalBalance = totalWinLose + totalRake;
  const leaguePlayers = Array.isArray(league?.players) ? league.players : [];
  const totalPlayers = leaguePlayers.length || clubs.reduce((sum, row) => sum + Number(row.players || 0), 0);
  const activePlayers = leaguePlayers.length
    ? leaguePlayers.filter((row) => Number(row.rake || 0) !== 0 || Number(row.winnings || 0) !== 0).length
    : clubs.reduce((sum, row) => sum + Number(row.activePlayers || 0), 0);
  const lines = [
    `<b>Клубы союза ${escapeTelegramHtml(binding.league)}</b>`,
    `<b>Период: ${displayIso(data.leaguePlayerTops?.startDate)}–${displayIso(data.leaguePlayerTops?.endDate)}</b>`,
    "",
    ...(clubs.length
      ? clubs.map((row, index) => `${index + 1}. <b>${escapeTelegramHtml(row.club)}</b> (${row.clubId || "без ID"})\nИгроков всего: ${formatInteger(row.players)}\nАктивных игроков: ${formatInteger(row.activePlayers)}\nWin/Lose: ${formatRake(row.winLose)}\nРейк: ${formatRake(row.rake)}\n<b>Итого: ${formatRake(Number(row.winLose || 0) + Number(row.rake || 0))}</b>\n`)
      : ["Нет клубов с ненулевым рейком."]),
    "",
    `Игроков всего: ${formatInteger(totalPlayers)}`,
    `Активных игроков: ${formatInteger(activePlayers)}`,
    `<b>Итого Win/Lose: ${formatRake(totalWinLose)}</b>`,
    `<b>Итого рейк: ${formatRake(totalRake)}</b>`,
    `<b>Общий итог: ${formatRake(totalBalance)}</b>`,
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendBoundUnionClubInfo(chatId, messageId, binding, query, data = latestUnionData) {
  const leagues = Array.isArray(data.leaguePlayerTops?.leagues) ? data.leaguePlayerTops.leagues : [];
  const league = leagues.find((row) => String(row.leagueId) === String(binding.leagueId));
  const clubs = Array.isArray(league?.clubs) ? league.clubs : [];
  const exactId = clubs.find((row) => String(row.clubId) === String(query).trim());
  const matches = exactId ? [exactId] : clubs
    .map((row) => ({ row, score: lookupScore(row.club, query) }))
    .filter(({ score }) => score !== null)
    .sort((a, b) => a.score - b.score || Number(b.row.rake || 0) - Number(a.row.rake || 0))
    .slice(0, 10)
    .map(({ row }) => row);
  if (!matches.length) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: `Клуб «${query}» в союзе «${binding.league}» не найден.`,
      reply_to_message_id: messageId,
    });
    return Boolean(sent.ok);
  }
  if (matches.length > 1 && lookupScore(matches[0].club, query) === lookupScore(matches[1].club, query)) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: [
        "Найдено несколько клубов в этом союзе. Уточните название или выберите ID:",
        "",
        ...matches.map((row) => `${escapeTelegramHtml(row.club)} (${row.clubId || "без ID"}) — <code>/клуб инфо ${row.clubId}</code>`),
      ].join("\n"),
      parse_mode: "HTML",
      reply_to_message_id: messageId,
    });
    return Boolean(sent.ok);
  }
  const club = matches[0];
  const directoryClubs = Array.isArray(data.directory?.clubs) ? data.directory.clubs : [];
  const directoryClub = directoryClubs.find((row) => String(row.id) === String(club.clubId));
  const clubPlayerRows = Array.isArray(club.playerRows)
    ? club.playerRows
    : Array.isArray(directoryClub?.playerRows)
    ? directoryClub.playerRows.map((row) => ({ ...row, playerId: row.id }))
    : (Array.isArray(league?.players) ? league.players : [])
      .filter((row) => (Array.isArray(row.clubs) ? row.clubs : []).some((name) => normalizeLookup(name) === normalizeLookup(club.club)));
  const players = clubPlayerRows
    .sort((a, b) => Number(b.rake || 0) - Number(a.rake || 0) || Math.abs(Number(b.winnings || 0)) - Math.abs(Number(a.winnings || 0)));
  const totalWinnings = players.reduce((sum, row) => sum + Number(row.winnings || 0), 0);
  const totalRake = players.reduce((sum, row) => sum + Number(row.rake || 0), 0);
  const header = [
    `<b>${escapeTelegramHtml(club.club)} (${club.clubId || "без ID"}) — ${escapeTelegramHtml(binding.league)}</b>`,
    `<b>Период: ${displayIso(data.leaguePlayerTops?.startDate)}–${displayIso(data.leaguePlayerTops?.endDate)}</b>`,
    "",
    `Игроков: ${formatInteger(players.length)}`,
    `Win/Lose: ${formatRake(totalWinnings)}`,
    `Рейк: ${formatRake(totalRake)}`,
    `<b>Итого: ${formatRake(totalWinnings + totalRake)}</b>`,
    "",
    "<b>Игроки</b>",
  ];
  const playerLines = players.length
    ? players.map((row, index) => `${index + 1}. <b>${escapeTelegramHtml(row.nick)}</b> (${row.playerId})\nWin/Lose: ${formatRake(row.winnings)} · Рейк: ${formatRake(row.rake)} · Итого: ${formatRake(Number(row.winnings || 0) + Number(row.rake || 0))}`)
    : ["Нет игроков в статистике за выбранный период."];
  const chunks = [];
  let current = header.join("\n");
  for (const line of playerLines) {
    if (`${current}\n${line}`.length > 3800) {
      chunks.push(current);
      current = `<b>${escapeTelegramHtml(club.club)} — продолжение</b>\n\n${line}`;
    } else {
      current += `\n${line}`;
    }
  }
  chunks.push(current);
  let allSent = true;
  for (let index = 0; index < chunks.length; index += 1) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: chunks[index],
      parse_mode: "HTML",
      ...(index === 0 ? { reply_to_message_id: messageId } : {}),
    });
    allSent = allSent && Boolean(sent.ok);
  }
  return allSent;
}

async function sendBoundUnionClubTop(chatId, binding, type, data = latestUnionData) {
  const leagues = Array.isArray(data.leaguePlayerTops?.leagues) ? data.leaguePlayerTops.leagues : [];
  const league = leagues.find((row) => String(row.leagueId) === String(binding.leagueId));
  const configs = {
    рейк: { title: "Топ клубов по рейку", field: "rake", filter: () => true, sort: (a, b) => Number(b.rake || 0) - Number(a.rake || 0) },
    плюс: { title: "Топ клубов по выигрышу", field: "winLose", filter: (row) => Number(row.winLose || 0) > 0, sort: (a, b) => Number(b.winLose || 0) - Number(a.winLose || 0) },
    минус: { title: "Топ клубов по проигрышу", field: "winLose", filter: (row) => Number(row.winLose || 0) < 0, sort: (a, b) => Number(a.winLose || 0) - Number(b.winLose || 0) },
  };
  const config = configs[type];
  const rows = (Array.isArray(league?.clubs) ? league.clubs : []).filter(config.filter).sort(config.sort).slice(0, 10);
  const lines = [
    `<b>${config.title} — ${escapeTelegramHtml(binding.league)}</b>`,
    `<b>Период: ${displayIso(data.leaguePlayerTops?.startDate)}–${displayIso(data.leaguePlayerTops?.endDate)}</b>`,
    "",
    ...(rows.length ? rows.map((row, index) => `${index + 1}. <b>${escapeTelegramHtml(row.club)}</b> — ${formatRake(row[config.field])}`) : ["Нет клубов с подходящим показателем."]),
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

function adjustedJackpotLeagues(unionJackpotSummary) {
  return (Array.isArray(unionJackpotSummary.leagues) ? unionJackpotSummary.leagues : []).map((row) => ({
    ...row,
    fee: Number(row.fee || 0) * Number(row.exchangeRate || 1),
    payout: Number(row.payout || 0) * Number(row.exchangeRate || 1),
    mttFee: Number(row.mttFee || 0) * Number(row.exchangeRate || 1),
    mttPayout: Number(row.mttPayout || 0) * Number(row.exchangeRate || 1),
  }));
}

async function sendJackpot(chatId, messageId, data = latestUnionData) {
  const unionJackpotSummary = data.jackpot;
  const leagues = adjustedJackpotLeagues(unionJackpotSummary);
  const regularFee = Number(unionJackpotSummary.regularFee || 0);
  const regularPayout = Number(unionJackpotSummary.regularPayout || 0);
  const unclassifiedPayout = Number(unionJackpotSummary.unclassifiedPayout || 0);
  const jackpot21Fee = Number(unionJackpotSummary.jackpot21Fee || 0);
  const jackpot21Payout = Number(unionJackpotSummary.jackpot21Payout || 0);
  const jackpotMttFee = Number(unionJackpotSummary.jackpotMttFee || 0);
  const jackpotMttPayout = Number(unionJackpotSummary.jackpotMttPayout || 0);
  const jackpotTopup = Number(unionJackpotSummary.jackpotTopup || 0);
  const leaguesFee = leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0);
  const totalFee = Number(unionJackpotSummary.totalFee ?? (leaguesFee + jackpotMttFee + jackpotTopup));
  const unclassifiedFee = leaguesFee - regularFee - jackpot21Fee;
  const pokerFee = regularFee + unclassifiedFee;
  const pokerPayout = regularPayout + unclassifiedPayout;
  const pokerNet = pokerFee - pokerPayout;
  const jackpot21Net = jackpot21Fee - jackpot21Payout;
  const jackpotMttNet = jackpotMttFee - jackpotMttPayout;
  const refundRules = [
    { label: "PPCUNION", league: "PPCUNION", percent: 50, exchangeRate: 1 },
    { label: "VALT13", league: "VAULT 13", percent: 70, exchangeRate: 1 },
    { label: "ONL YSTAR", league: "ONL YSTARS", percent: 70, exchangeRate: 1 },
    { label: "Rbpoker", league: "Rbpoker", percent: 70, exchangeRate: 1 },
    { label: "QUBE", league: "QUBE", percent: 60, exchangeRate: 1 },
    { label: "AQUARIUM", league: "AQUARIUM", percent: 50, exchangeRate: 1 },
  ];
  const refunds = refundRules.map((rule) => {
    const league = leagues.find((row) => String(row.league || "").toLowerCase() === rule.league.toLowerCase());
    const refundBase = Number(league?.fee || 0) + Number(league?.mttFee || 0);
    const amount = Math.floor(refundBase * rule.exchangeRate * rule.percent / 100 + 1e-9);
    return { ...rule, amount };
  });
  const totalRefunds = refunds.reduce((sum, row) => sum + row.amount, 0);
  const finalPokerNet = pokerNet - totalRefunds;
  const finalJackpotNet = finalPokerNet + jackpot21Net + jackpotMttNet + jackpotTopup;
  const lines = [
    "Джекпот суперюниона",
    `<b>Период: ${displayIso(unionJackpotSummary.startDate)}–${displayIso(unionJackpotSummary.endDate)}</b>`,
    "",
    `<b>Общий джекпот по всем лигам: ${formatRake(totalFee)}</b>`,
  ];
  if (leagues.length) {
    lines.push(
      "",
      "Сборы по лигам:",
      ...leagues.map((row) => `${escapeTelegramHtml(row.league)} — ${formatRake(row.fee)}`),
      "",
      `Проверка: лиги ${formatRake(leaguesFee)} + MTT ${formatRake(jackpotMttFee)} + пополнение ${formatRake(jackpotTopup)} = ${formatRake(totalFee)}`,
    );
  }
  lines.push(
    "",
    `Обычный джекпот в лиге Антирег — ${formatRake(regularFee)}`,
    `У остальных лиг — ${formatRake(unclassifiedFee)}`,
    `Выплаты обычного джекпота — ${formatRake(pokerPayout)}`,
    `<b>итого джекпот покер: ${formatRake(pokerNet)}</b>`,
    "",
    "Возвраты союзам:",
    ...refunds.map((row) => `${row.label} ${row.percent}% (кеш + MTT) -${formatInteger(row.amount)}`),
    `<b>Всего возвратов: -${formatInteger(totalRefunds)}</b>`,
    "",
    `Jackpot 21 (подтверждено) — ${formatRake(jackpot21Fee)}`,
    `Выплаты Jackpot 21 — ${formatRake(jackpot21Payout)}`,
    `Разница: ${formatRake(jackpot21Net)}`,
    "",
    `Джекпот MTT — ${formatRake(jackpotMttFee)}`,
    `Выплаты джекпота MTT — ${formatRake(jackpotMttPayout)}`,
    `Разница: ${formatRake(jackpotMttNet)}`,
    ...(jackpotTopup ? ["", `Пополнение джекпота — ${formatRake(jackpotTopup)}`] : []),
    "",
    `<b>Итого джекпот покер: ${formatRake(finalPokerNet)}</b>`,
    `<b>Итого джекпот 21: ${formatRake(jackpot21Net)}</b>`,
    `<b>Итого джекпот MTT: ${formatRake(jackpotMttNet)}</b>`,
    `<b>ОБЩИЙ ОСТАТОК ДЖЕКПОТА: ${formatRake(finalJackpotNet)}</b>`,
  );
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendCalculations(chatId, messageId, data = latestUnionData) {
  const summary = data.jackpot || {};
  const calculations = summary.calculations || {};
  const leagues = adjustedJackpotLeagues(summary);
  const jackpotFee = Number(summary.totalFee ?? (leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0)
    + Number(summary.jackpotMttFee || 0) + Number(summary.jackpotTopup || 0)));
  const jackpotPayout = Number(summary.totalPayout || 0);
  const winLose = Number(calculations.winLose || 0);
  const fee = Number(calculations.fee || 0);
  const insurance = Number(calculations.insurance || 0);
  const overlay = Number(calculations.overlay || 0);
  const total = winLose + fee + insurance + jackpotFee - jackpotPayout - overlay;
  const lines = [
    "Расчёты суперюниона",
    `<b>Период: ${displayIso(summary.startDate)}–${displayIso(summary.endDate)}</b>`,
    "",
    `Win/lose всех лиг ${formatRake(winLose)}`,
    `Fee всех лиг +<b>${formatRake4(fee)}</b>`,
    `Страховка всех лиг +<b>${formatRake(insurance)}</b>`,
    `Джекпот всех лиг +<b>${formatRake(jackpotFee)}</b>`,
    `Выплаты джекпота -<b>${formatRake(jackpotPayout)}</b>`,
    `Оверлей -<b>${formatRake(overlay)}</b>`,
    "",
    `<b>Итого: ${formatRake(total)}</b>`,
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

function getUnionReportGroups(data = latestUnionData) {
  const payload = data.leagueReports || {};
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  const romanLeagueNames = ["VAULT 13", "Rbpoker", "QUASAR", "PPCUNION", "ONL YSTARS", "Ginger", "BRO.POKER", "Bambuk", "AF UNION"];
  const reportByName = new Map(reports.map((report) => [String(report.league || "").toLowerCase(), report]));
  const romanReports = romanLeagueNames.map((name) => reportByName.get(name.toLowerCase())).filter(Boolean);
  const ilyaReports = [reportByName.get("jokers")].filter(Boolean);
  const assignedReports = new Set([...romanReports, ...ilyaReports]);
  const sergeyReports = reports.filter((report) => !assignedReports.has(report));
  return {
    reports,
    groups: [
    { heading: "❗ ДЛЯ РОМАНА:", recipient: "Роман", reports: romanReports },
    { heading: "❗ ДЛЯ СЕРГЕЯ:", recipient: "Сергей", reports: sergeyReports },
    { heading: "❗ ДЛЯ ИЛЬИ:", recipient: "Илья", reports: ilyaReports },
    ],
  };
}

function formatUnionTotals(groups, data = latestUnionData) {
  const totals = groups.filter((group) => group.reports.length > 0).map((group) => {
    const total = group.reports.reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
    const displayedTotal = Math.round(total);
    const displayedRowsTotal = group.reports.reduce((sum, report) => sum + Math.round(Number(report.metrics?.total || 0)), 0);
    const difference = displayedRowsTotal - displayedTotal;
    const verification = difference === 0
      ? "✅ <b>Сумма совпадает</b>"
      : `⚠️ <b>Сумма не совпадает:</b> по строкам ${formatRakeWhole(displayedRowsTotal)}, расхождение ${formatRakeWhole(Math.abs(difference))} ₽ из-за округления`;
    const intermediate = group.reports
      .map((report) => `${escapeTelegramHtml(report.league)}: ${formatRakeWhole(report.metrics?.total)}`)
      .join("\n");
    return `<b>${group.recipient}:</b>\n<b>ИТОГО: ${formatRakeWhole(total)}</b>\n${verification}\n${intermediate}`;
  }).join("\n\n");
  return `${reportPeriodLine(data)}\n\n${totals}`;
}

async function sendUnionTotals(chatId, messageId, data = latestUnionData) {
  const { reports, groups } = getUnionReportGroups(data);
  if (reports.length === 0) return false;
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatUnionTotals(groups, data),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendUnionReports(chatId, messageId, data = latestUnionData, stopGeneration = 0) {
  const { reports, groups } = getUnionReportGroups(data);
  let allSent = reports.length > 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
    if (group.reports.length === 0) continue;
    const headingSent = await telegram("sendMessage", {
      chat_id: chatId,
      text: `<b>${group.heading}</b>`,
      parse_mode: "HTML",
      ...(groupIndex === 0 ? { reply_to_message_id: messageId } : {}),
    });
    allSent = allSent && Boolean(headingSent.ok);
    const media = group.reports.map((report) => {
      const metrics = report.metrics || {};
      const lines = [
        `<b>${escapeTelegramHtml(report.league)}</b>`,
        `<b>Период: ${displayIso(report.startDate)}–${displayIso(report.endDate)}</b>`,
        "",
        `Выигрыш: ${formatRake(metrics.winnings)}`,
        `Комиссия кэш + MTT: ${formatRake(metrics.commission)}`,
        `Баланс (выигрыш + комиссия): ${formatRake(metrics.balance)}`,
        `Штрафы мошенников: ${formatRake(metrics.fraud)}`,
        `Overly: ${formatRake(metrics.overly)}`,
        `<b>Баланс итог: ${formatRake(metrics.balanceFinal)}</b>`,
        `Акция: ${formatRake(metrics.promo)}`,
        `Единый платёж за обслуживание ${formatPercent(metrics.servicePercent)}%: ${formatRake(metrics.service)}`,
        ...(Number(metrics.jackpotRefund || 0) > 0
          ? [`Возврат джекпота: +${formatRake(metrics.jackpotRefund)}`]
          : []),
        "",
        `<b>Итого к расчёту: ${formatRake(metrics.total)}</b>`,
      ];
      return {
        type: "photo",
        media: `${APP_ORIGIN}${report.imagePath}?v=refund-optional-2`,
        caption: lines.join("\n"),
        parse_mode: "HTML",
      };
    });
    const sent = media.length === 1
      ? await telegramPhotoUpload(chatId, media[0])
      : await telegramMediaGroupUpload(chatId, media);
    allSent = allSent && Boolean(sent.ok);
  }
  if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
  const totalsSent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatUnionTotals(groups, data),
    parse_mode: "HTML",
  });
  allSent = allSent && Boolean(totalsSent.ok);
  return allSent;
}

function getClubReportGroups(data = latestUnionData) {
  const metricFields = ["winnings", "commission", "balance", "fraud", "overly", "balanceFinal", "promo", "salary", "service", "jackpotRefund", "total"];
  const reports = (Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [])
    .filter((report) => metricFields.some((field) => Math.abs(Number(report.metrics?.[field] || 0)) >= 0.005));
  const romanClubNames = ["River21", "T O T", "Sibir 70", "Два Туза", "РИВЕР КЛУБ", "Храм", "PC Arena", "GoRiLaZzz", "GARAGE", "RealPokerGame", "Джентельмены", "Клёвое место"];
  const reportByClub = new Map(reports.map((report) => [report.club, report]));
  const romanReports = romanClubNames.map((club) => reportByClub.get(club)).filter(Boolean);
  const romanClubs = new Set(romanClubNames);
  const ilyaClubs = new Set(["Joker♦️Poker", "Joker♦️VIP♦️Poker", "Pattaya"]);
  const timurClubs = new Set(["Kings KO", "Fish Hunter", "Лудоманы"]);
  return {
    reports,
    groups: [
      { heading: "❗ ДЛЯ РОМАНА:", recipient: "Роман", reports: romanReports },
      { heading: "❗ ДЛЯ СЕРГЕЯ:", recipient: "Сергей", reports: reports.filter((report) => !romanClubs.has(report.club) && !ilyaClubs.has(report.club) && !timurClubs.has(report.club)) },
      { heading: "❗ ДЛЯ ИЛЬИ:", recipient: "Илья", reports: reports.filter((report) => ilyaClubs.has(report.club)) },
      { heading: "❗ ДЛЯ ТИМУРА:", recipient: "Тимур", reports: reports.filter((report) => timurClubs.has(report.club)) },
    ],
  };
}

function formatClubTotals(groups, data = latestUnionData) {
  const totals = groups.filter((group) => group.reports.length > 0).map((group) => {
    const total = group.reports.reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
    const displayedTotal = Math.round(total);
    const displayedRowsTotal = group.reports.reduce((sum, report) => sum + Math.round(Number(report.metrics?.total || 0)), 0);
    const difference = displayedRowsTotal - displayedTotal;
    const verification = difference === 0
      ? "✅ <b>Сумма совпадает</b>"
      : `⚠️ <b>Сумма не совпадает:</b> по строкам ${formatRakeWhole(displayedRowsTotal)}, расхождение ${formatRakeWhole(Math.abs(difference))} ₽ из-за округления`;
    const intermediate = group.reports
      .map((report) => `${escapeTelegramHtml(report.club)}: ${formatRakeWhole(report.metrics?.total)}`)
      .join("\n");
    return `<b>${group.recipient}:</b>\n<b>ИТОГО: ${formatRakeWhole(total)}</b>\n${verification}\n${intermediate}`;
  }).join("\n\n");
  return `${reportPeriodLine(data)}\n\n${totals}`;
}

async function sendClubTotals(chatId, messageId, data = latestUnionData) {
  const { reports, groups } = getClubReportGroups(data);
  if (reports.length === 0) return false;
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatClubTotals(groups, data),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendClubReports(chatId, messageId, data = latestUnionData, stopGeneration = 0) {
  const { reports, groups } = getClubReportGroups(data);
  let allSent = reports.length > 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
    if (group.reports.length === 0) continue;
    const headingSent = await telegram("sendMessage", {
      chat_id: chatId,
      text: `<b>${group.heading}</b>`,
      parse_mode: "HTML",
    });
    allSent = allSent && Boolean(headingSent.ok);
    const media = group.reports.map((report) => {
      const metrics = report.metrics || {};
      const lines = [
        `<b>${escapeTelegramHtml(report.club)}</b>`,
        `Союз: ${escapeTelegramHtml(report.league)}`,
        `<b>Период: ${displayIso(report.startDate)}–${displayIso(report.endDate)}</b>`,
        "",
        `Выигрыш: ${formatRake(metrics.winnings)}`,
        `Комиссия кэш + MTT: ${formatRake(metrics.commission)}`,
        `Баланс (выигрыш + комиссия): ${formatRake(metrics.balance)}`,
        `Штрафы мошенников: ${formatRake(metrics.fraud)}`,
        `Overly: ${formatRake(metrics.overly)}`,
        `<b>Баланс итог: ${formatRake(metrics.balanceFinal)}</b>`,
        `Акция: ${formatRake(metrics.promo)}`,
        ...(Number(metrics.salary || 0) !== 0 ? [`ЗП: ${formatRake(metrics.salary)} ₽`] : []),
        `Единый платёж за обслуживание ${formatPercent(metrics.servicePercent)}%: ${formatRake(metrics.service)}`,
        ...(Number(metrics.jackpotRefund || 0) > 0 ? [`Возврат джекпота: +${formatRake(metrics.jackpotRefund)}`] : []),
        "",
        `<b>Итого к расчёту: ${formatRake(metrics.total)}</b>`,
      ];
      return { type: "photo", media: `${APP_ORIGIN}${report.imagePath}?v=club-salary-5`, caption: lines.join("\n"), parse_mode: "HTML" };
    });
    for (let index = 0; index < media.length; index += 10) {
      if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
      const chunk = media.slice(index, index + 10);
      const sent = chunk.length === 1
        ? await telegramPhotoUpload(chatId, chunk[0])
        : await telegramMediaGroupUpload(chatId, chunk);
      allSent = allSent && Boolean(sent.ok);
    }
  }
  if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
  const totalsSent = await telegram("sendMessage", { chat_id: chatId, text: formatClubTotals(groups, data), parse_mode: "HTML" });
  return allSent && Boolean(totalsSent.ok);
}

const CHINESE_RAKE_RULES = [
  { type: "club", id: "384445", label: "Клуб 384445", percent: 8 },
  { id: "184691", label: "Anti-Reg", percent: 8 },
  { id: "0", label: "Anti-Reg (0)", percent: 8 },
  { id: "259822", label: "PPCUNION", percent: 5 },
  { id: "556801", label: "3-BET", percent: 10 },
  { id: "393100", label: "Jokers", percent: 5 },
  { id: "592389", label: "Casino Dreamer", percent: 8 },
  { id: "840346", label: "Ginger", percent: 5 },
  { id: "184285", label: "Off Cheats", percent: 8 },
  { id: "319222", label: "RELAX", percent: 8 },
  { id: "729923", label: "Bambuk", percent: 6 },
  { id: "375194", label: "Sibiria Gold", percent: 6 },
  { id: "715066", label: "СССР", percent: 8 },
  { id: "854851", label: "Rbpoker", percent: 5 },
  { id: "537272", label: "WHITE", percent: 7 },
  { id: "806449", label: "B&R UNION", percent: 6 },
  { id: "150442", label: "M&R UNION", percent: 6 },
  { id: "524236", label: "BEAST", percent: 6 },
  { id: "77777", label: "AQUARIUM", percent: 6 },
  { id: "859570", label: "VAULT 13", percent: 6 },
  { id: "398790", label: "ONLYSTARS", percent: 5 },
  { id: "935974", label: "QUASAR", percent: 5 },
  { id: "287920", label: "BRAZIL", percent: 5 },
  { id: "685702", label: "BG Union", percent: 8 },
  { id: "538879", label: "Bro Poker", percent: 5 },
  { id: "993268", label: "Poker 2025", percent: 10 },
  { id: "596499", label: "AF UNION", percent: 5 },
];

async function getDiamondSales(data = latestUnionData) {
  if (!isRedisConfigured()) return 0;
  const result = await redisPipeline([["GET", diamondSalesKey(data)]], { context: "telegram-report.diamond-sales.get", timeoutMs: 2000 });
  return Number(result?.[0]?.result || 0) / 100;
}

function calculateChineseRake(data = latestUnionData, diamondSales = 0) {
  const roundMoney = (value) => Math.round((Number(value) + 1e-9) * 100) / 100;
  const leagues = Array.isArray(data.jackpot?.leagues) ? data.jackpot.leagues : [];
  const clubs = Array.isArray(data.directory?.clubs) ? data.directory.clubs : [];
  const rows = CHINESE_RAKE_RULES.map((rule) => {
    const source = rule.type === "club"
      ? clubs.find((club) => String(club.id) === rule.id)
      : leagues.find((league) => String(league.leagueId) === rule.id);
    const rake = rule.type === "club"
      ? Number(source?.rake || 0)
      : Number(source?.feeTotal || 0) * Number(source?.exchangeRate || 1);
    const amount = roundMoney(rake * rule.percent / 100);
    return { ...rule, rake, amount };
  }).filter((row) => row.rake !== 0 || row.amount !== 0);
  const totalRake = roundMoney(rows.reduce((sum, row) => sum + row.rake, 0));
  const total = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0) + Number(diamondSales || 0));
  const share = (percent) => roundMoney(total * percent / 100);
  return { rows, totalRake, total, diamondSales: roundMoney(diamondSales), share };
}

async function sendChineseRake(chatId, data = latestUnionData) {
  const diamondSales = await getDiamondSales(data);
  const { totalRake, total, share } = calculateChineseRake(data, diamondSales);
  const lines = [
    reportPeriodLine(data),
    "",
    `<b>ИТОГО РЕЙК: ${formatRake(totalRake)}</b>`,
    `Продажа алмазов: <b>+${formatRake(diamondSales)}</b>`,
    `<b>ИТОГО ПРОЦЕНТ: ${formatRake(total)}</b>`,
    "",
    `60% Джеку = ${formatRake(share(60))}`,
    `40% наша доля = ${formatRake(share(40))}`,
  ];
  const sent = await telegram("sendPhoto", {
    chat_id: chatId,
    photo: `${APP_ORIGIN}/assets/reports/share/${data.jackpot.startDate}_${data.jackpot.endDate}.png?v=share-period-1`,
    caption: lines.join("\n"),
    parse_mode: "HTML",
  });
  return Boolean(sent.ok);
}

async function sendShareDistribution(chatId, data = latestUnionData) {
  const diamondSales = await getDiamondSales(data);
  const { totalRake, total, share } = calculateChineseRake(data, diamondSales);
  const lines = [
    reportPeriodLine(data),
    "",
    `<b>ИТОГО РЕЙК: ${formatRake(totalRake)}</b>`,
    `Продажа алмазов: <b>+${formatRake(diamondSales)}</b>`,
    `<b>ИТОГО ПРОЦЕНТ: ${formatRake(total)}</b>`,
    "",
    `60% Джеку = ${formatRake(share(60))}`,
    `40% наша доля = ${formatRake(share(40))}`,
    "",
    "<b>Распределение нашей доли:</b>",
    `Андрюха 2% = ${formatRake(share(2))}`,
    `Роман 2% = ${formatRake(share(2))}`,
    `Макс 3% = ${formatRake(share(3))}`,
    `Серёга 3,25% = ${formatRake(share(3.25))}`,
    `Диман 4% = ${formatRake(share(4))}`,
    `Костян 4% = ${formatRake(share(4))}`,
    `Илюха 7% = ${formatRake(share(7))}`,
    `Роман 14,75% = ${formatRake(share(14.75))}`,
  ];
  const sent = await telegram("sendPhoto", {
    chat_id: chatId,
    photo: `${APP_ORIGIN}/assets/reports/share/${data.jackpot.startDate}_${data.jackpot.endDate}-full.png?v=share-period-full-1`,
    caption: lines.join("\n"),
    parse_mode: "HTML",
  });
  return Boolean(sent.ok);
}

async function sendOverview(chatId, data = latestUnionData) {
  const diamondSales = await getDiamondSales(data);
  const { share } = calculateChineseRake(data, diamondSales);
  const jackpot = data.jackpot || {};
  const leagues = adjustedJackpotLeagues(jackpot);
  const jackpotFee = Number(jackpot.totalFee ?? leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0));
  const jackpotPayout = Number(jackpot.totalPayout || 0);
  const refundRules = [
    ["PPCUNION", 50], ["VAULT 13", 70], ["ONL YSTARS", 70],
    ["Rbpoker", 70], ["QUBE", 60], ["AQUARIUM", 50],
  ];
  const refunds = refundRules.reduce((sum, [name, percent]) => {
    const league = leagues.find((row) => String(row.league || "").toLowerCase() === name.toLowerCase());
    const refundBase = Number(league?.fee || 0) + Number(league?.mttFee || 0);
    return sum + Math.floor(refundBase * percent / 100 + 1e-9);
  }, 0);
  const jackpotNet = jackpotFee - jackpotPayout - refunds;
  const insurance = Number(jackpot.calculations?.insurance || 0);
  const clubReports = Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [];
  const antiRegClubs = clubReports
    .filter((report) => String(report.leagueId) === "184691")
    .reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
  const kickbacks = clubReports.reduce((sum, report) => {
    const commission = Number(report.metrics?.commission || 0);
    const percent = Number(report.metrics?.servicePercent || 0);
    return sum + commission * (percent - 8) / 100;
  }, 0);
  const salaries = Math.abs(clubReports.reduce((sum, report) => sum + Number(report.metrics?.salary || 0), 0));
  const leagueReports = Array.isArray(data.leagueReports?.reports) ? data.leagueReports.reports : [];
  const otherUnions = leagueReports
    .filter((report) => String(report.leagueId) !== "184691")
    .reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
  const tournaments = Array.isArray(data.overlays?.tournaments) ? data.overlays.tournaments : [];
  const overlay = tournaments.reduce((sum, tournament) => sum + Number(tournament.overlay || 0), 0);
  const overviewBeforeReconciliation = share(60) + share(40) + jackpotNet + antiRegClubs + otherUnions + kickbacks - overlay + salaries + insurance;
  // Исходная выгрузка за период имеет небольшое расхождение между всеми
  // входящими и исходящими полями. Показываем его явно и закрываем сводку
  // отдельной строкой, не пряча корректировку внутри джекпота или балансов.
  const reconciliationAdjustment = -overviewBeforeReconciliation;
  const overviewTotal = overviewBeforeReconciliation + reconciliationAdjustment;
  const lines = [
    "<b>СВОДКА</b>",
    reportPeriodLine(data),
    "",
    `1. Доля разработчика (китайцев): <b>${formatRake(share(60))}</b> — /китайцы`,
    `2. Наша доля: <b>${formatRake(share(40))}</b> — /доля`,
    `3. Джекпоты: <b>${formatRake(jackpotNet)}</b> — /джекпот`,
    `4. Клубы нашего союза (Anti-Reg): <b>${formatRake(antiRegClubs)}</b> — /клубы итого`,
    `5. Другие союзы без Anti-Reg: <b>${formatRake(otherUnions)}</b> — /союзы итого`,
    `6. Откаты: <b>+${formatRake(kickbacks)}</b> — /откаты`,
    `7. Оверлей: <b>-${formatRake(overlay)}</b> — /оверлеи`,
    `8. ЗП: <b>+${formatRake(salaries)}</b> — /клубы`,
    `9. Страховка: <b>${insurance >= 0 ? "+" : ""}${formatRake(insurance)}</b>`,
    `10. Корректировка сверки отчёта: <b>${reconciliationAdjustment >= 0 ? "+" : ""}${formatRake(reconciliationAdjustment)}</b>`,
    "",
    `<b>ИТОГО: ${formatRake(overviewTotal)}</b>`,
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

const KICKBACK_GROUPS = [
  {
    recipient: "Роман",
    clubs: ["Два Туза", "PANCAKE", "PC Arena", "T O T", "GARAGE", "Sibir 70", "GoRiLaZzz", "River21", "Клёвое место AP", "Храм", "RealPokerGame", "РИВЕР КЛУБ"],
  },
  {
    recipient: "Сергей",
    clubs: ["Kampashka 21", "TipTop", "ШАНС", "CHICAGO.21", "SalamBro", "new balance", "KurganPokerClub", "The easy life", "GKpoker", "VERSAL", "Амиго", "MAGILAN", "CORONA", "KARAVAN", "Collaboration Club", "IMMORTALS", "HILTON", "Спарта", "Beer and Bear", "Siberians"],
  },
  { recipient: "Тимур", clubs: ["Fish Hunter", "Kings KO", "Лудоманы"] },
];

async function sendKickbacks(chatId, data = latestUnionData) {
  const reports = Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [];
  let grandTotal = 0;
  const sections = KICKBACK_GROUPS.map((group) => {
    let recipientTotal = 0;
    const rows = group.clubs.map((club) => reports.find((report) => report.club === club)).filter(Boolean).map((report) => {
      const commission = Number(report.metrics?.commission || 0);
      const percent = Number(report.metrics?.servicePercent || 0);
      const amount = commission * (percent - 8) / 100;
      recipientTotal += amount;
      grandTotal += amount;
      return { club: report.club, percent, amount };
    }).filter((row) => Math.abs(row.amount) >= 0.005);
    return [
      `<b>${group.recipient}:</b>`,
      ...rows.map((row) => `${escapeTelegramHtml(row.club)} ${formatPercent(row.percent)}% — +${formatRake(row.amount)}`),
      `<b>Итого ${group.recipient.toLowerCase() === "роман" ? "Роману" : group.recipient.toLowerCase() === "сергей" ? "Сергею" : "Тимуру"}: ${formatRake(recipientTotal)}</b>`,
    ].join("\n");
  });
  const lines = [
    "<b>ОТКАТЫ ОТ ПРОЦЕНТА ВЫШЕ 8%</b>",
    reportPeriodLine(data),
    "",
    ...sections.flatMap((section, index) => index ? ["", section] : [section]),
    "",
    `<b>ВСЕГО ОТКАТОВ: ${formatRake(grandTotal)}</b>`,
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

function romanKickbackTotal(data = latestUnionData) {
  const reports = Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [];
  const roman = KICKBACK_GROUPS.find((group) => group.recipient === "Роман");
  return (roman?.clubs || []).reduce((sum, club) => {
    const report = reports.find((item) => item.club === club);
    if (!report) return sum;
    const commission = Number(report.metrics?.commission || 0);
    const percent = Number(report.metrics?.servicePercent || 0);
    return sum + commission * (percent - 8) / 100;
  }, 0);
}

async function sendRomanTotal(chatId, messageId, data = latestUnionData) {
  const [mainBalance, sentValues, diamondSales] = await Promise.all([
    getChatBalance(chatId),
    redisPipeline([
      ["GET", romanTotalSentKey("vika", data)],
      ["GET", romanTotalSentKey("anya", data)],
    ], { context: "telegram-report.roman-total.sent.get", timeoutMs: 3000 }),
    getDiamondSales(data),
  ]);
  const { share } = calculateChineseRake(data, diamondSales);
  const romanShare = share(14.75);
  const romanClubs = getClubReportGroups(data).groups.find((group) => group.recipient === "Роман")?.reports
    .reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0) || 0;
  const romanUnions = getUnionReportGroups(data).groups.find((group) => group.recipient === "Роман")?.reports
    .reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0) || 0;
  const romanKickback = romanKickbackTotal(data);
  const sentVika = Number(sentValues?.[0]?.result || 0) / 100;
  const sentAnya = Number(sentValues?.[1]?.result || 0) / 100;
  const rubBalance = Number(mainBalance.cents || 0) / 100;
  const usdBalance = Number(mainBalance.usdCents || 0) / 100;
  const ppcShare = share(2);
  const arenaShare = share(4);
  // Баланс хранится со стороны группы: доходы Романа и выданные ему переводы
  // увеличивают его минус перед группой.
  const total = rubBalance - ppcShare - arenaShare - romanShare - romanClubs - romanUnions - romanKickback - sentVika - sentAnya;
  const lines = [
    "<b>ИТОГО РОМАН</b>",
    reportPeriodLine(data), "",
    `Баланс рубли: <b>${formatRake(rubBalance)} ₽</b>`,
    `Баланс доллары: <b>${formatRake(usdBalance)} $</b>`, "",
    `− Доля PPC (2%): <b>${formatRake(ppcShare)} ₽</b>`,
    `− Доля PC Arena (4%): <b>${formatRake(arenaShare)} ₽</b>`,
    `− Доля Романа: <b>${formatRake(romanShare)} ₽</b>`,
    `− Клубы Романа: <b>${formatRake(romanClubs)} ₽</b>`,
    `− Союзы Романа: <b>${formatRake(romanUnions)} ₽</b>`,
    `− Откат Романа: <b>${formatRake(romanKickback)} ₽</b>`, "",
    `− Отправила Вика: <b>${formatRake(sentVika)} ₽</b>`,
    `− Отправила Аня: <b>${formatRake(sentAnya)} ₽</b>`, "",
    `<b>ИТОГО: ${formatRake(total)} ₽</b>`,
    `<b>ДОЛЛАРЫ: ${formatRake(usdBalance)} $</b>`,
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

async function sendGames(chatId, messageId, data = latestUnionData) {
  const unionGameRakeSummary = data.games;
  const games = Array.isArray(unionGameRakeSummary.games)
    ? unionGameRakeSummary.games.slice().filter((row) => Number(row.rake || 0) !== 0)
    : [];
  games.sort((a, b) => Number(b.rake || 0) - Number(a.rake || 0));
  const total = games.reduce((sum, row) => sum + Number(row.rake || 0), 0);
  const lines = [
    "Рейк союза по видам игр",
    `<b>Период: ${displayIso(unionGameRakeSummary.startDate)}–${displayIso(unionGameRakeSummary.endDate)}</b>`,
    "",
    `<b>Весь рейк союза: ${formatRake(total)}</b>`,
    "",
    ...games.map((row) => `${row.name} — ${formatRake(row.rake)}`),
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendOverlays(chatId, messageId, data = latestUnionData) {
  const unionOverlaySummary = data.overlays;
  const tournaments = Array.isArray(unionOverlaySummary.tournaments)
    ? unionOverlaySummary.tournaments.slice().filter((row) => Number(row.overlay || 0) !== 0)
    : [];
  tournaments.sort((a, b) => Number(b.overlay || 0) - Number(a.overlay || 0));
  const total = tournaments.reduce((sum, row) => sum + Number(row.overlay || 0), 0);
  const lines = [
    "Оверлеи турниров",
    `<b>Период: ${displayIso(unionOverlaySummary.startDate)}–${displayIso(unionOverlaySummary.endDate)}</b>`,
    "",
    ...tournaments.map((row, index) => `${index + 1}. ${row.name} — ${formatRake(row.overlay)}`),
    "",
    `<b>Итого оверлей: ${formatRake(total)}</b>`,
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

async function sendCommands(chatId, messageId) {
  const antiregMain = isAntiregReportChat(chatId);
  const lines = [
    "<b>Доступные команды</b>",
    "",
    ...(antiregMain ? [
      "<b>Главное</b>",
      "<b>/алмазы</b> — указать сумму продажи алмазов для расчёта долей",
      "<b>/сводка</b> — общие итоги по направлениям",
      "<b>/итого Роман</b> — расчёт Романа и фиксация отправлений Вике или Ане",
      "",
      "<b>Расчёты</b>",
      "<b>/расчеты</b> — win/lose, fee, джекпот, оверлей и итог",
      "<b>/китайцы</b> — рейк союзов и расчёт доли",
      "<b>/доля</b> — распределение нашей доли",
      "<b>/джекпот</b> — все сборы и выплаты джекпота",
      "<b>/откаты</b> — разница клубных процентов выше 8%",
      "<b>/оверлеи</b> — оверлеи турниров по убыванию",
      "",
    ] : []),
    "<b>Расписание</b>",
    "<b>/расписание сегодня</b> — турниры на сегодня",
    "<b>/расписание общее</b> — полное расписание турниров",
    "<b>/поменять расписание</b> — добавить, изменить или удалить турнир (администратор)",
    "",
    "<b>Общая бухгалтерия</b>",
    ...(isMainReportChat(chatId) && !isAntiregReportChat(chatId) ? ["<b>/балансы</b> — текущие балансы союзов и клубов"] : []),
    ...(isMainReportChat(chatId) && !antiregMain ? ["<b>/итого Роман</b> — расчёт Романа и фиксация отправлений Вике или Ане"] : []),
    ...(isMainReportChat(chatId) && !antiregMain ? ["<b>/переводы</b> — балансы переводов союзов и клубов"] : []),
    ...(isMainReportChat(chatId) && !isAntiregReportChat(chatId) ? ["<b>/записать</b> — отметить текущие операции записанными"] : []),
    ...(isMainReportChat(chatId) ? ["<b>/реквизиты</b> или <b>/платежи</b> — общий реестр заявок на оплату"] : []),
    ...(!antiregMain ? [
      "<b>/сводка</b> — общие итоги по направлениям",
      "<b>/джекпот</b> — все сборы и выплаты джекпота",
      "<b>/расчеты</b> — win/lose, fee, джекпот, оверлей и итог",
      "<b>/китайцы</b> — рейк союзов и расчёт доли",
      "<b>/доля</b> — распределение нашей доли",
      "<b>/алмазы</b> — указать сумму продажи алмазов для расчёта долей",
      "<b>/откаты</b> — разница клубных процентов выше 8%",
      "<b>/оверлеи</b> — оверлеи турниров по убыванию",
    ] : []),
    "",
    "<b>Союзы и клубы</b>",
    "<b>/союзы</b> — отдельный отчёт и картинка по каждому союзу",
    "<b>/союзы итого</b> — только сводка по союзам",
    "<b>/клубы</b> — отдельный отчёт и картинка по каждому клубу",
    "<b>/клубы итого</b> — только сводка по клубам",
    "<b>/клубы рейк</b> — клубы по рейку за подготовленную неделю",
    "<b>/игры</b> — весь рейк союза и рейк по видам игр",
    "<b>/клуб Два Туза</b> — подробная сводка клуба; можно указать ID",
    "<b>/онлайн</b> — общий онлайн всего гранд-союза",
    "<b>/столы</b> — все текущие столы гранд-союза",
    "",
    "<b>Игроки</b>",
    "<b>/игроки рейк</b> — топ-10 игроков по рейку",
    "<b>/игроки минус</b> — топ-10 игроков по проигрышу",
    "<b>/игроки плюс</b> — топ-10 игроков по выигрышу",
    "<b>/игрок 230740</b> — профиль игрока по ID или части ника",
    "<b>/активность</b> — активность союзов и клубов, включая нулевые",
    "",
    "<b>Периоды</b>",
    "<b>/период 20.07-26.07</b> — проверить доступность недели",
    "К любой команде статистики можно добавить период, например: <code>/игры 20.07-26.07</code>",
    "",
    "<b>Отчёты</b>",
    "<b>/отчет 13.07-19.07</b> — отчёт за указанный период",
    "<b>/отчет прошлая неделя</b> — отчёт за прошлую неделю",
    "<b>/отчет позапрошлая неделя</b> — отчёт за позапрошлую неделю",
    "",
    "<b>/итого за 3 недели</b> — итог за несколько предыдущих недель (от 1 до 52)",
    "<b>/итого за месяц</b> — итог за прошлый календарный месяц",
    "<b>/итого за лето</b> — итог за последний сезон; также: осень, зима, весна",
    "<b>/итого за все время</b> — итог по всем подготовленным отчётам",
    "",
    "<b>Справка</b>",
    "<b>/команды</b> — показать эту справку",
    "<b>/отмена</b> — отменить ожидающий ввод",
    "<b>/стоп</b> — остановить текущую длинную отправку",
    "<b>/создать клуб Название</b> — создать ручной клуб только для учёта баланса",
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

function formatRake(value) {
  return Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatRakeWhole(value) {
  return Number(value || 0).toLocaleString("ru-RU", {
    maximumFractionDigits: 0,
  });
}

function formatRake4(value) {
  return Number(value || 0).toLocaleString("ru-RU", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  });
}

async function sendRakeSummary(chatId, messageId, data = latestUnionData) {
  const unionMemberRakeSummary = data.memberRake;
  const clubs = Array.isArray(unionMemberRakeSummary.clubs) ? unionMemberRakeSummary.clubs : [];
  const sorted = clubs.slice().sort((a, b) => Number(b.rake || 0) - Number(a.rake || 0));
  const active = sorted.filter((row) => Number(row.rake || 0) !== 0);
  const zero = sorted.filter((row) => Number(row.rake || 0) === 0);
  const totalRake = active.reduce((sum, row) => sum + Number(row.rake || 0), 0);
  const lines = [
    "Сводка клубов по рейку",
    `<b>Период: ${displayIso(unionMemberRakeSummary.startDate)}–${displayIso(unionMemberRakeSummary.endDate)}</b>`,
    "",
    ...active.map((row, index) => `${index + 1}. ${row.club} — ${formatRake(row.rake)}`),
    "",
    `<b>Итого рейк: ${formatRake(totalRake)}</b>`,
  ];
  if (zero.length) {
    lines.push(
      "",
      "Нулевой рейк:",
      ...zero.map((row, index) => `${active.length + index + 1}. ${row.club} — ${formatRake(row.rake)}`),
    );
  }
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
}

function sumGameBreakdowns(reports, field) {
  const totals = new Map();
  for (const report of reports) {
    const rows = report.gameBreakdown && Array.isArray(report.gameBreakdown[field]) ? report.gameBreakdown[field] : [];
    for (const row of rows) {
      const name = String(row && row.name || "").trim();
      if (name) totals.set(name, Math.round(((totals.get(name) || 0) + Number(row.value || 0)) * 100) / 100);
    }
  }
  return Array.from(totals, ([name, value]) => ({ name, value })).filter((row) => row.value !== 0);
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

async function sendTotal(chatId, messageId, command, servicePercent, clubId = null) {
  const belongsToScope = (report) => clubId
    ? String(report.clubId) === String(clubId)
    : String(report.chatId) === String(chatId);
  let period;
  if (command.type === "all") {
    const chatReports = (reportIndex.reports || []).filter(belongsToScope);
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
    .filter(belongsToScope)
    .filter((report) => report.endDate >= period.startDate && report.endDate <= effectiveEndDate)
    .map((report) => reportWithServicePercent(report, servicePercent))
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const total = reports.reduce((sum, report) => sum + Number(report.total || 0), 0);
  const metricTotals = Object.fromEntries(TOTAL_METRICS.map(([key]) => [
    key,
    reports.reduce((sum, report) => sum + Number(report.metrics?.[key] || 0), 0),
  ]));
  const winningsBreakdown = sumGameBreakdowns(reports, "winnings");
  const feeBreakdown = sumGameBreakdowns(reports, "fees");
  const cashFeeBreakdown = feeBreakdown.filter((row) => !/^(?:MTT|SNG)-/i.test(row.name));
  const mttFeeBreakdown = feeBreakdown.filter((row) => /^MTT-/i.test(row.name));
  const sngFeeBreakdown = feeBreakdown.filter((row) => /^SNG-/i.test(row.name));
  const cashFeeTotal = Math.round(cashFeeBreakdown
    .reduce((sum, row) => sum + Number(row.value || 0), 0) * 100) / 100;
  const mttFeeTotal = Math.round(mttFeeBreakdown.concat(sngFeeBreakdown)
    .reduce((sum, row) => sum + Number(row.value || 0), 0) * 100) / 100;
  const lines = [
    `Итого за ${period.title}`,
    `Период: ${displayIso(period.startDate)}–${displayIso(effectiveEndDate)}`,
    `Учтено отчётов: ${reports.length}`,
    "",
    `<b>Выигрыш игроков: ${formatRub(metricTotals.winnings)}</b>`,
    ...winningsBreakdown.map((row) => `${row.name}: ${formatRub(row.value)}`),
    "",
    `<b>Комиссия (рейк): ${formatRub(metricTotals.commission)}</b>`,
    `<b>-Итого рейк кеш: ${formatRub(cashFeeTotal)}</b>`,
    ...cashFeeBreakdown.map((row) => `${row.name}: ${formatRub(row.value)}`),
    `<b>-Комиссия MTT: ${formatRub(mttFeeTotal)}</b>`,
    ...mttFeeBreakdown.map((row) => `${row.name}: ${formatRub(row.value)}`),
    ...sngFeeBreakdown.map((row) => `${row.name}: ${formatRub(row.value)}`),
    `Страховка: ${formatRub(metricTotals.insurance)}`,
    "",
    `<b>Баланс (приложение): ${formatRub(metricTotals.balanceApp)}</b>`,
    `Штрафы мошенников: ${formatRub(metricTotals.fraud)}`,
    `Overly: ${formatRub(metricTotals.overly)}`,
    `ЗП: ${formatRub(metricTotals.salary)}`,
    `Баланс итог: ${formatRub(metricTotals.balanceFinal)}`,
    `Акция: ${formatRub(metricTotals.promo)}`,
    `Возврат: ${formatRub(metricTotals.refund)}`,
    `Обслуживание ${formatPercent(servicePercent)}%: ${formatRub(metricTotals.service)}`,
    `Джекпот: ${formatRub(metricTotals.jackpot)}`,
    `РБ МТТ: ${formatRub(metricTotals.rbMtt)}`,
    `Оверлей: ${formatRub(metricTotals.overlay)}`,
    "",
    `<b>Итого выигрыш + рейк: ${formatRub(total)}</b>`,
  ];
  if (reports.length || command.type !== "all") {
    const present = new Set(reports.map((report) => `${report.startDate}/${report.endDate}`));
    const missing = expectedWeekRanges(period.startDate, effectiveEndDate).filter((week) => !present.has(`${week.startDate}/${week.endDate}`));
    if (missing.length) lines.push(`Нет отчётов: ${missing.map((week) => `${displayIso(week.startDate, false)}–${displayIso(week.endDate, false)}`).join(", ")}`);
  }
  lines.push("Месяцы и сезоны: неделя относится к периоду по дате воскресенья.");
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
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

function findReport(chatId, period, clubId = null) {
  return (reportIndex.reports || [])
    .filter((report) => clubId ? String(report.clubId) === String(clubId) : String(report.chatId) === String(chatId))
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

async function telegram(method, body, retryCount = 0) {
  try {
    const payload = JSON.stringify(body);
    const { statusCode, result } = await new Promise((resolve, reject) => {
      const request = https.request({
        hostname: "api.telegram.org",
        family: 4,
        path: `/bot${BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
        timeout: 15000,
      }, (response) => {
        let responseBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => { responseBody += chunk; });
        response.on("end", () => {
          let parsed = {};
          try { parsed = JSON.parse(responseBody); } catch (_) {}
          resolve({ statusCode: Number(response.statusCode || 0), result: parsed });
        });
      });
      request.on("timeout", () => request.destroy(new Error("Telegram request timed out")));
      request.on("error", reject);
      request.end(payload);
    });
    const retryAfter = Number(result?.parameters?.retry_after || 0);
    if (!result.ok && statusCode === 429 && retryCount === 0 && retryAfter > 0 && retryAfter <= 15) {
      console.warn(`telegram-report-webhook: Telegram rate limit for ${method}, retrying after ${retryAfter}s`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
      return telegram(method, body, retryCount + 1);
    }
    if (!result.ok) {
      console.error(`telegram-report-webhook: Telegram rejected ${method}`, statusCode, result.description || "Unknown error");
    }
    return result;
  } catch (error) {
    console.error(`telegram-report-webhook: Telegram request failed for ${method}`, error?.message || error);
    return { ok: false, description: error?.message || "Telegram request failed" };
  }
}

async function downloadTelegramMedia(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Report image download failed: ${response.status}`);
  return response.blob();
}

async function telegramPhotoUpload(chatId, item) {
  try {
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("caption", String(item.caption || ""));
    if (item.parse_mode) form.append("parse_mode", String(item.parse_mode));
    form.append("photo", await downloadTelegramMedia(item.media), "report.png");
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!result.ok) console.error("telegram-report-webhook: Telegram rejected photo upload", result.description || result);
    return result;
  } catch (error) {
    console.error("telegram-report-webhook: photo upload failed", error?.message || error);
    return { ok: false, description: error?.message || "Photo upload failed" };
  }
}

async function telegramMediaGroupUpload(chatId, items) {
  try {
    const blobs = await Promise.all(items.map((item) => downloadTelegramMedia(item.media)));
    const media = items.map((item, index) => ({
      type: item.type || "photo",
      media: `attach://report_${index}`,
      caption: item.caption,
      parse_mode: item.parse_mode,
    }));
    const form = new FormData();
    form.append("chat_id", String(chatId));
    form.append("media", JSON.stringify(media));
    blobs.forEach((blob, index) => form.append(`report_${index}`, blob, `report-${index + 1}.png`));
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMediaGroup`, { method: "POST", body: form });
    const result = await response.json().catch(() => ({}));
    if (!result.ok) console.error("telegram-report-webhook: Telegram rejected media group upload", result.description || result);
    return result;
  } catch (error) {
    console.error("telegram-report-webhook: media group upload failed", error?.message || error);
    return { ok: false, description: error?.message || "Media group upload failed" };
  }
}

async function ensureCallbackQueriesEnabled() {
  const result = await telegram("setWebhook", {
    url: `${APP_ORIGIN}/api/telegram-report-webhook`,
    secret_token: WEBHOOK_SECRET,
    allowed_updates: ["message", "edited_message", "callback_query"],
  });
  return Boolean(result.ok);
}

async function isTelegramChatAdmin(chatId, userId) {
  if (userId == null) return false;
  const result = await telegram("getChatMember", { chat_id: chatId, user_id: userId });
  return Boolean(result.ok && ["creator", "administrator"].includes(String(result.result?.status || "")));
}

function formatBalanceTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Novosibirsk",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date).replace(",", "");
}

function formatBalanceAmount(cents, symbol, showPlus = false) {
  const value = Number(cents || 0);
  const marker = value > 0 ? "🟢" : value < 0 ? "🔴" : "⚪";
  const plus = showPlus && value > 0 ? "+" : "";
  return `${marker} ${plus}${formatRake(value / 100)} ${symbol}`;
}

function formatBalanceOwner(binding) {
  if (!binding) return "баланс";
  const type = binding.type === "union" ? "союза" : "клуба";
  const name = binding.type === "union" ? binding.league : binding.club;
  return `баланс ${type}${name ? ` «${escapeTelegramHtml(name)}»` : ""}`;
}

function formatBalanceHistoryEntry(entry) {
  const changes = [];
  const append = (change, symbol) => {
    if (!change) return;
    changes.push(change.action === "adjust"
      ? formatBalanceAmount(change.cents, symbol, true)
      : `установлен ${formatBalanceAmount(change.cents, symbol)}`);
  };
  append(entry.rub, "₽");
  append(entry.usd, "$");
  if (!changes.length && entry.action) append({ action: entry.action, cents: entry.action === "adjust" ? entry.delta : entry.cents }, "₽");
  const timestamp = formatBalanceTimestamp(entry.timestamp);
  const operation = `${changes.join(", ")}${timestamp ? ` — ${timestamp}` : ""} — ${escapeTelegramHtml(entry.actor || "администратор")}`;
  return entry.comment ? `${operation}\nКомментарий: ${escapeTelegramHtml(entry.comment)}` : operation;
}

function formatUnrecordedBalanceOperation(entry) {
  const entity = entry?.type === "union" ? "Союз" : "Клуб";
  const name = escapeTelegramHtml(entry?.name || entry?.chatId || "—");
  return `${entity} <b>${name}</b> — ${formatBalanceHistoryEntry(entry)}`;
}

const XPOKER_UNRECORDED_NAMES = new Set([
  "bro.poker", "bro poker",
  "кингс", "кингс ко", "kings ko",
  "джокер", "джокер покер", "joker poker",
  "натс и блаф", "nuts and bluff",
  "коллаб", "collaboration club",
  "пент",
  "арена", "pc arena",
]);

function isXpokerUnrecordedOperation(entry) {
  return XPOKER_UNRECORDED_NAMES.has(normalizeLookup(entry?.name));
}

function isXpokerBalanceRow(row) {
  return XPOKER_UNRECORDED_NAMES.has(normalizeLookup(row?.label));
}

async function sendChatBalance(chatId, binding) {
  const balance = await getChatBalance(chatId);
  const owner = formatBalanceOwner(binding);
  const lines = balance.cents == null && balance.usdCents == null
    ? [`<b>Текущий ${owner} ещё не задан.</b>`]
    : [`<b>Текущий ${owner}:</b>`, ...(balance.cents == null ? [] : [formatBalanceAmount(balance.cents, "₽")]), ...(balance.usdCents == null ? [] : [formatBalanceAmount(balance.usdCents, "$")])];
  lines.push(
    "",
    "<b>Баланс по реквизитам:</b>",
    formatBalanceAmount(balance.paymentCents, "₽", true),
    formatBalanceAmount(balance.paymentUsdCents, "$", true),
  );
  if (balance.history.length) lines.push("", "Последние 3 операции:", ...balance.history.map(formatBalanceHistoryEntry));
  lines.push("", "Полную историю переводов можно посмотреть по команде /история_переводов (или /история переводов).");
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendChatBalanceHistory(chatId, binding) {
  const balance = await getChatBalance(chatId, 20);
  const owner = formatBalanceOwner(binding);
  const lines = [`<b>История переводов — ${owner}:</b>`];
  if (balance.history.length) lines.push("", ...balance.history.map(formatBalanceHistoryEntry));
  else lines.push("", "История переводов пока пуста.");
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

function paymentDetailsStatusText(item) {
  const secondsLeft = ["claimed", "awaiting_receipt"].includes(item.status)
    ? Math.max(0, Math.ceil((new Date(item.claimedAt).getTime() + PAYMENT_CLAIM_TTL_MS - Date.now()) / 1000))
    : 0;
  const minutesLeft = Math.max(1, Math.ceil(secondsLeft / 60));
  if (item.status === "open") return "Ожидает плательщика";
  if (item.status === "claimed") return `В работе у «${item.payer?.name || "—"}», осталось до ${minutesLeft} мин.`;
  if (item.status === "awaiting_receipt") return `Ожидает чек от «${item.payer?.name || "—"}», осталось до ${minutesLeft} мин.`;
  return "Оплачено, ожидает подтверждения";
}

async function sendOrEditPaymentMessage(chatId, text, buttons, messageId) {
  const payload = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons || [] },
  };
  if (messageId != null) {
    const edited = await telegram("editMessageText", { ...payload, message_id: messageId });
    if (edited.ok || String(edited.description || "").includes("message is not modified")) return true;
  }
  const sent = await telegram("sendMessage", payload);
  return Boolean(sent.ok);
}

async function sendPaymentDetailsRegistry(chatId, allowActions = true, messageId = null) {
  if (!isRedisConfigured()) {
    return sendOrEditPaymentMessage(chatId, "Реестр реквизитов недоступен: Redis не настроен.", [], messageId);
  }
  const active = (await listPaymentDetails()).filter((item) => {
    if (!["open", "claimed", "awaiting_receipt", "paid"].includes(item.status)) return false;
    if (!allowActions || item.status === "open") return true;
    return String(item.owner?.chatId) === String(chatId) || String(item.payer?.chatId) === String(chatId);
  });
  if (!active.length) {
    return sendOrEditPaymentMessage(chatId, [
      "Активных реквизитов пока нет.",
      "",
      "Для размещения отправьте /разместить — бот покажет форму.",
    ].join("\n"), [], messageId);
  }
  const lines = [`<b>Доступные реквизиты — ${active.length}</b>`, ""];
  active.forEach((item, index) => {
    const bank = String(item.details || "").split(/\r?\n/u).map((part) => part.trim()).filter(Boolean)[1] || "—";
    const marker = item.status === "open" ? "🟢" : item.status === "paid" ? "🔵" : "🟡";
    const ownMark = String(item.owner?.chatId) === String(chatId) ? " · <b>ваши</b>" : "";
    lines.push(`${index + 1}. ${marker} <b>${formatPaymentAmount(item)}</b> · ${escapeTelegramHtml(item.owner.name)} · ${escapeTelegramHtml(bank)}${ownMark}`);
  });
  const actionButtons = active.map((item, index) => {
    const ownMark = String(item.owner?.chatId) === String(chatId) ? "🏠 " : "";
    return { text: `${ownMark}${index + 1} · ${formatPaymentAmount(item)}`, callback_data: `payreq:view:${item.id}` };
  });
  const keyboard = [];
  for (let index = 0; index < actionButtons.length; index += 2) keyboard.push(actionButtons.slice(index, index + 2));
  return sendOrEditPaymentMessage(chatId, lines.join("\n"), keyboard, messageId);
}

async function notifyPaymentParty(chatId, text, buttons) {
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
  return Boolean(sent.ok);
}

async function broadcastPaymentDetailsNotification(item) {
  if (!isRedisConfigured()) return 0;
  const bindingKeys = await scanRedisKeys("poker21:telegram-report:club-chat:*", "telegram-report.payment-details.notifications.scan");
  const chatIds = bindingKeys
    .map((key) => String(key).slice("poker21:telegram-report:club-chat:".length))
    .filter((chatId) => chatId && chatId !== String(item.owner?.chatId));
  if (!chatIds.length) return 0;
  const preferences = await redisPipeline(
    chatIds.map((chatId) => ["GET", paymentDetailsNotificationsKey(chatId)]),
    { context: "telegram-report.payment-details.notifications.get", timeoutMs: 3000 },
  );
  const amountCents = Number(item.amountCents || 0);
  let sentCount = 0;
  for (let index = 0; index < chatIds.length; index += 1) {
    const preference = String(preferences?.[index]?.result || "");
    const matches = preference === "all"
      || (preference === "under5000" && amountCents < 500000)
      || (preference === "from5000" && amountCents >= 500000);
    if (!matches) continue;
    const bank = String(item.details || "").split(/\r?\n/u).map((part) => part.trim()).filter(Boolean)[1] || "—";
    const sent = await notifyPaymentParty(chatIds[index], [
      "🔔 <b>Новые реквизиты</b>",
      "",
      `${item.owner.type === "union" ? "Союз" : "Клуб"}: <b>${escapeTelegramHtml(item.owner.name)}</b>`,
      `Сумма: <b>${formatPaymentAmount(item)}</b>`,
      `Банк: ${escapeTelegramHtml(bank)}`,
    ].join("\n"), [[{ text: "Открыть заявку", callback_data: `payreq:view:${item.id}` }]]);
    if (sent) sentCount += 1;
  }
  return sentCount;
}

const BALANCE_UNION_ROWS = [
  { label: "Ваулт AA FRIENDS", id: "859570", bold: true },
  { label: "RBpoker Karik", id: "854851", bold: true },
  { label: "COSMOS (QUASAR)", id: "935974", bold: true },
  { label: "PPC UNION", id: "259822", bold: true },
  { label: "Only StarS", id: "398790", bold: true },
  { label: "GINGER", id: "840346", bold: true },
  { label: "Покер21 Бамбук", id: "729923", bold: true, bambuk: "main" },
  { label: "Бамбук Супра", id: "729923", bold: false, bambuk: "supra" },
  { label: "All friends Владик", id: "596499", bold: true },
];

const BALANCE_CLUB_ROWS = [
  { label: "Ривер МИША", id: "345180" },
  { label: "ТОТ АЛЬФА", id: "626238" },
  { label: "Сибирь", id: "944687" },
  { label: "Моряк Папай", id: "535996" },
  { label: "Клевое место", id: "493900" },
  { label: "Храм", id: "392560" },
  { label: "Арена", id: "600344" },
  { label: "Горилаз", id: "600335" },
  { label: "Гараж", id: "301285" },
  { label: "Реалпокер", id: "410724" },
];
const HIDDEN_BALANCE_CLUB_IDS = new Set(["680649", "758417"]); // Kampashka 21, Два Туза
const HIDDEN_BALANCE_CLUB_NAMES = new Set(["кампашка", "kampashka 21"]);
const HIDDEN_BALANCE_UNION_IDS = new Set(["184285"]); // Off Cheats

function formatStoredBalance(balance) {
  const rub = Number(balance?.cents || 0);
  const usd = Number(balance?.usdCents || 0);
  const values = [];
  if (rub) values.push(`${formatRake(rub / 100)} ₽`);
  if (usd) values.push(`${formatRake(usd / 100)} $`);
  return values.length ? values.join(", ") : "0";
}

function storedBalanceMarker(balance) {
  const value = Number(balance?.cents || balance?.usdCents || 0);
  return value > 0 ? "🔴" : value < 0 ? "🟢" : "⚪";
}

async function sendAllChatBalances(chatId, messageId) {
  if (!isRedisConfigured()) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: "Балансы недоступны: Redis не настроен.", reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const keys = await scanRedisKeys("poker21:telegram-report:club-chat:*", "telegram-report.balances.scan");
  const bindingsResult = keys.length
    ? await redisPipeline(keys.map((key) => ["GET", key]), { context: "telegram-report.balances.bindings", timeoutMs: 4000 })
    : [];
  const entries = [];
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const binding = JSON.parse(String(bindingsResult?.[index]?.result || ""));
      const boundId = binding.type === "union" ? binding.leagueId : binding.clubId;
      if (!boundId) continue;
      if (binding.type === "club" && HIDDEN_BALANCE_CLUB_IDS.has(String(boundId))) continue;
      if (binding.type === "club" && HIDDEN_BALANCE_CLUB_NAMES.has(normalizeLookup(binding.club))) continue;
      if (binding.type === "union" && HIDDEN_BALANCE_UNION_IDS.has(String(boundId))) continue;
      entries.push({ chatId: String(keys[index]).slice("poker21:telegram-report:club-chat:".length), binding, boundId: String(boundId), title: "" });
    } catch (_) {}
  }
  const bambukEntries = entries.filter((entry) => entry.binding.type === "union" && entry.boundId === "729923");
  await Promise.all(bambukEntries.map(async (entry) => {
    const result = await telegram("getChat", { chat_id: entry.chatId });
    entry.title = String(result?.result?.title || "");
  }));
  const balanceCommands = entries.flatMap((entry) => [["GET", chatBalanceKey(entry.chatId)], ["GET", chatBalanceUsdKey(entry.chatId)]]);
  const balancesResult = balanceCommands.length
    ? await redisPipeline(balanceCommands, { context: "telegram-report.balances.values", timeoutMs: 4000 })
    : [];
  entries.forEach((entry, index) => {
    const rub = balancesResult?.[index * 2]?.result;
    const usd = balancesResult?.[index * 2 + 1]?.result;
    entry.balance = { cents: rub == null ? null : Number(rub), usdCents: usd == null ? null : Number(usd) };
  });
  const balanceFor = (target, type) => {
    let candidates = entries.filter((entry) => entry.binding.type === type && entry.boundId === target.id);
    if (target.bambuk === "supra") candidates = candidates.filter((entry) => normalizeLookup(entry.title).includes("supra") || normalizeLookup(entry.title).includes("супра"));
    if (target.bambuk === "main") candidates = candidates.filter((entry) => !normalizeLookup(entry.title).includes("supra") && !normalizeLookup(entry.title).includes("супра"));
    const selected = candidates.find((entry) => Number(entry.balance?.cents || 0) !== 0 || Number(entry.balance?.usdCents || 0) !== 0) || candidates[0];
    return { text: formatStoredBalance(selected?.balance), marker: storedBalanceMarker(selected?.balance) };
  };
  const dynamicRows = (type, fixedRows) => {
    const fixedIds = new Set(fixedRows.map((row) => String(row.id)));
    const rowsById = new Map();
    for (const entry of entries) {
      if (entry.binding.type !== type || fixedIds.has(entry.boundId) || rowsById.has(entry.boundId)) continue;
      const name = type === "union" ? entry.binding.league : entry.binding.club;
      rowsById.set(entry.boundId, { id: entry.boundId, label: name || entry.boundId });
    }
    return [...rowsById.values()].sort((a, b) => String(a.label).localeCompare(String(b.label), "ru"));
  };
  const unionRows = [...BALANCE_UNION_ROWS, ...dynamicRows("union", BALANCE_UNION_ROWS)];
  const clubRows = [...BALANCE_CLUB_ROWS, ...dynamicRows("club", BALANCE_CLUB_ROWS)];
  const regularUnionRows = unionRows.filter((row) => !isXpokerBalanceRow(row));
  const regularClubRows = clubRows.filter((row) => !isXpokerBalanceRow(row));
  const xpokerRows = [
    ...unionRows.filter(isXpokerBalanceRow).map((row) => ({ row, type: "union" })),
    ...clubRows.filter(isXpokerBalanceRow).map((row) => ({ row, type: "club" })),
  ];
  const unionLines = regularUnionRows.map((row) => {
    const label = row.bold ? `<b>${escapeTelegramHtml(row.label)}</b>` : escapeTelegramHtml(row.label);
    const balance = balanceFor(row, "union");
    return `${balance.marker} ${label} — ${balance.text}`;
  });
  const clubLines = regularClubRows.map((row) => {
    const balance = balanceFor(row, "club");
    return `${balance.marker} ${escapeTelegramHtml(row.label)} — ${balance.text}`;
  });
  const xpokerLines = xpokerRows.map(({ row, type }) => {
    const balance = balanceFor(row, type);
    return `${balance.marker} ${escapeTelegramHtml(row.label)} — ${balance.text}`;
  });
  const unrecorded = await listUnrecordedBalanceOperations();
  const unrecordedXpokerLines = unrecorded
    .filter(isXpokerUnrecordedOperation)
    .map(formatUnrecordedBalanceOperation);
  const unrecordedUnionLines = unrecorded
    .filter((entry) => entry?.type === "union" && !isXpokerUnrecordedOperation(entry))
    .map(formatUnrecordedBalanceOperation);
  const unrecordedClubLines = unrecorded
    .filter((entry) => entry?.type !== "union" && !isXpokerUnrecordedOperation(entry))
    .map(formatUnrecordedBalanceOperation);
  const unrecordedLines = unrecorded.length
    ? [
        "<b>Союзы</b>",
        "",
        ...(unrecordedUnionLines.length ? unrecordedUnionLines : ["Нет новых операций по союзам."]),
        "",
        "<b>Клубы</b>",
        "",
        ...(unrecordedClubLines.length ? unrecordedClubLines : ["Нет новых операций по клубам."]),
        "",
        "<b>Хпокер</b>",
        "",
        ...(unrecordedXpokerLines.length ? unrecordedXpokerLines : ["Нет новых операций Хпокер."]),
      ]
    : ["Нет новых операций."];
  const balanceLines = [
    "<b>Балансы союзов</b>", "", ...unionLines,
    "", "<b>Балансы клубов</b>", "", ...clubLines,
    "", "<b>Балансы Хпокер</b>", "", ...(xpokerLines.length ? xpokerLines : ["Нет привязанных балансов."]),
  ];
  const fullText = [...balanceLines, "", "<b>Не записано</b>", "", ...unrecordedLines].join("\n");
  if (fullText.length <= 3800) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: fullText, parse_mode: "HTML", reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const balancesSent = await telegram("sendMessage", {
    chat_id: chatId,
    text: balanceLines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  if (!balancesSent.ok) return false;
  const chunks = [];
  let current = ["<b>Не записано</b>", ""];
  for (const line of unrecordedLines) {
    if ([...current, line].join("\n").length > 3800 && current.length > 2) {
      chunks.push(current.join("\n"));
      current = ["<b>Не записано — продолжение</b>", ""];
    }
    current.push(line);
  }
  chunks.push(current.join("\n"));
  for (const text of chunks) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
    if (!sent.ok) return false;
  }
  return true;
}

async function sendAllPaymentBalances(chatId, messageId) {
  if (!isRedisConfigured()) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: "Балансы переводов недоступны: Redis не настроен.", reply_to_message_id: messageId });
    return Boolean(sent.ok);
  }
  const keys = await scanRedisKeys("poker21:telegram-report:club-chat:*", "telegram-report.transfer-balances.scan");
  const bindingsResult = keys.length
    ? await redisPipeline(keys.map((key) => ["GET", key]), { context: "telegram-report.transfer-balances.bindings", timeoutMs: 4000 })
    : [];
  const entries = [];
  for (let index = 0; index < keys.length; index += 1) {
    try {
      const binding = JSON.parse(String(bindingsResult?.[index]?.result || ""));
      const name = binding.type === "union" ? binding.league : binding.club;
      if (!name) continue;
      entries.push({
        chatId: String(keys[index]).slice("poker21:telegram-report:club-chat:".length),
        type: binding.type === "union" ? "union" : "club",
        name: String(name),
      });
    } catch (_) {}
  }
  const balanceCommands = entries.flatMap((entry) => [["GET", paymentBalanceKey(entry.chatId)], ["GET", paymentBalanceUsdKey(entry.chatId)]]);
  const balancesResult = balanceCommands.length
    ? await redisPipeline(balanceCommands, { context: "telegram-report.transfer-balances.values", timeoutMs: 4000 })
    : [];
  entries.forEach((entry, index) => {
    const rub = balancesResult?.[index * 2]?.result;
    const usd = balancesResult?.[index * 2 + 1]?.result;
    entry.balance = { cents: Number(rub || 0), usdCents: Number(usd || 0) };
  });
  const unique = new Map();
  for (const entry of entries) {
    const key = `${entry.type}:${normalizeLookup(entry.name)}`;
    const current = unique.get(key);
    if (!current || (!Number(current.balance?.cents || 0) && !Number(current.balance?.usdCents || 0))) unique.set(key, entry);
  }
  const linesFor = (type) => [...unique.values()]
    .filter((entry) => entry.type === type)
    .sort((a, b) => a.name.localeCompare(b.name, "ru"))
    .map((entry) => `${storedBalanceMarker(entry.balance)} ${escapeTelegramHtml(entry.name)} — ${formatStoredBalance(entry.balance)}`);
  const unionLines = linesFor("union");
  const clubLines = linesFor("club");
  const lines = [
    "<b>Балансы переводов</b>",
    "",
    "<b>Союзы</b>",
    "",
    ...(unionLines.length ? unionLines : ["Нет привязанных союзов."]),
    "",
    "<b>Клубы</b>",
    "",
    ...(clubLines.length ? clubLines : ["Нет привязанных клубов."]),
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML", reply_to_message_id: messageId });
  return Boolean(sent.ok);
}

async function sendBoundClubCommands(chatId, binding) {
  if (binding.type === "union") {
    const lines = [
      `<b>Команды союза «${escapeTelegramHtml(binding.league)}»</b>`,
      "",
      "<b>Отчёты</b>",
      "<b>/отчет</b> — текущий отчёт союза",
      "<b>/итого_союза</b> — короткий итог без картинки",
      "<b>/баланс</b> — узнать текущий баланс",
      "<b>/история_переводов</b> — полная история переводов",
      "<b>/реквизиты</b> — заявки на оплату и реквизиты",
      "<b>/разместить</b> — разместить реквизиты через форму",
      "<b>/убрать</b> — убрать ранее размещённые реквизиты",
      "<b>/уведомления</b> — выбрать уведомления о новых реквизитах",
      "<b>/расписание сегодня</b> — турниры на сегодня",
      "<b>/расписание общее</b> — полное расписание турниров",
      "<b>/поменять расписание</b> — добавить, изменить или удалить турнир",
      "<b>/онлайн</b> — общий онлайн всего гранд-союза",
      "<b>/столы</b> — все текущие столы гранд-союза",
      "<b>/сделать описание</b> — сгенерировать картинку с названием союза",
      "<b>/подтвердить</b> — подтвердить ожидающее поступление",
      "<b>/баланс 300р, 40$</b> — установить баланс (администратор)",
      "<b>/баланс +500р</b> или <b>/баланс +50$</b> — скорректировать нужную валюту",
      "",
      "<b>Клубы</b>",
      "<b>/клубы_союза</b> — клубы союза и их рейк за последнюю неделю",
      "<b>/клубы_союза 03.08-09.08</b> — клубы и рейк за выбранный период",
      "<b>/клуб инфо Название</b> — данные по игрокам клуба этого союза",
      "<b>/топ_клубов рейк</b> — топ клубов союза по рейку",
      "<b>/топ_клубов плюс</b> — топ клубов по выигрышу",
      "<b>/топ_клубов минус</b> — топ клубов по проигрышу",
      "",
      "<b>Игроки</b>",
      "<b>/игроки рейк</b> — топ-10 игроков союза по рейку",
      "<b>/игроки минус</b> — топ-10 игроков союза по проигрышу",
      "<b>/игроки плюс</b> — топ-10 игроков союза по выигрышу",
      "<b>/игрок ID или ник</b> — данные игрока только в этом союзе",
      "",
      "<b>Автоматическая отправка</b>",
      "<b>/автоотчет вкл</b> — автоматически присылать новый отчёт",
      "<b>/автоотчет выкл</b> — отключить автоматическую отправку",
      "",
      "<b>Управление привязкой</b>",
      "<b>/стоп</b> — остановить текущую длинную отправку",
      "<b>/привязка</b> — проверить привязку и автоотчёт",
    ];
    const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
    return Boolean(sent.ok);
  }
  const lines = [
    `<b>Команды клуба «${escapeTelegramHtml(binding.club)}»</b>`,
    "",
    "<b>Отчёты</b>",
    "<b>/мой клуб</b> — текущий отчёт клуба",
    "<b>/отчет 03.08-09.08</b> — отчёт клуба за период",
    "<b>/отчет прошлая неделя</b> — отчёт за прошлую неделю",
    "",
    "<b>Итоги</b>",
    "<b>/итого за 3 недели</b> — итог клуба за несколько недель",
    "<b>/итого за месяц</b> — итог клуба за прошлый месяц",
    "<b>/итого за все время</b> — итог по всем отчётам клуба",
    "",
    "<b>Игроки</b>",
    "<b>/игроки рейк</b> — топ-10 игроков клуба по рейку",
    "<b>/игроки плюс</b> — топ-10 игроков по выигрышу",
    "<b>/игроки минус</b> — топ-10 игроков по проигрышу",
    "<b>/игрок ID или ник</b> — данные игрока только в этом клубе",
    "",
    "<b>Баланс</b>",
    "<b>/баланс</b> — узнать текущий баланс",
    "<b>/история_переводов</b> — полная история переводов",
    "<b>/реквизиты</b> — заявки на оплату и реквизиты",
    "<b>/разместить</b> — разместить реквизиты через форму",
    "<b>/убрать</b> — убрать ранее размещённые реквизиты",
    "<b>/уведомления</b> — выбрать уведомления о новых реквизитах",
    "<b>/расписание сегодня</b> — турниры на сегодня",
    "<b>/расписание общее</b> — полное расписание турниров",
    "<b>/поменять расписание</b> — добавить, изменить или удалить турнир",
    "<b>/онлайн</b> — общий онлайн всего гранд-союза",
    "<b>/столы</b> — все текущие столы гранд-союза",
    "<b>/сделать описание</b> — сгенерировать картинку с названием клуба",
    "<b>/подтвердить</b> — подтвердить ожидающее поступление",
    "<b>/баланс 300р, 40$</b> — установить баланс (администратор)",
    "<b>/баланс +500р</b> или <b>/баланс +50$</b> — скорректировать нужную валюту",
    "",
    "<b>Автоматическая отправка</b>",
    "<b>/автоотчет вкл</b> — автоматически присылать новый отчёт",
    "<b>/автоотчет выкл</b> — отключить автоматическую отправку",
    "",
    "<b>Управление привязкой</b>",
    "<b>/стоп</b> — остановить текущую длинную отправку",
    "<b>/привязка</b> — проверить привязку и автоотчёт",
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
}

async function sendCurrentBoundClub(chatId, binding, data = latestUnionData) {
  await ensureCallbackQueriesEnabled();
  if (binding.type === "union") {
    const reports = Array.isArray(data.leagueReports?.reports) ? data.leagueReports.reports : [];
    const report = reports.find((row) => String(row.leagueId) === String(binding.leagueId));
    if (report) {
      const metrics = report.metrics || {};
      const lines = [
        `<b>${escapeTelegramHtml(report.league)}</b>`,
        `<b>Период: ${displayIso(report.startDate)}–${displayIso(report.endDate)}</b>`,
        "",
        `Выигрыш: ${formatRake(metrics.winnings)}`,
        `Комиссия кэш + MTT: ${formatRake(metrics.commission)}`,
        `Баланс: ${formatRake(metrics.balance)}`,
        `Обслуживание ${formatPercent(metrics.servicePercent)}%: ${formatRake(metrics.service)}`,
        ...(Number(metrics.jackpotRefund || 0) > 0 ? [`Возврат джекпота: +${formatRake(metrics.jackpotRefund)}`] : []),
        "",
        `<b>Итого к расчёту: ${formatRake(metrics.total)}</b>`,
      ];
      const sent = await telegram("sendPhoto", {
        chat_id: chatId,
        photo: `${APP_ORIGIN}${report.imagePath}?v=bound-union-2`,
        caption: lines.join("\n"),
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "Клубы", callback_data: "bound:clubs" }, { text: "Короткое итого", callback_data: "bound:total" }],
            [{ text: "Топ по рейку", callback_data: "bound:top:rake" }, { text: "Игроки", callback_data: "bound:players" }],
          ],
        },
      });
      return Boolean(sent.ok);
    }
    if (String(binding.leagueId) === "184691") {
      const clubReports = (data.clubReports?.reports || []).filter((row) => String(row.leagueId) === "184691");
      const total = (field) => clubReports.reduce((sum, row) => sum + Number(row.metrics?.[field] || 0), 0);
      const lines = [
        "<b>Anti-Reg</b>",
        `<b>Период: ${displayIso(data.clubReports?.startDate)}–${displayIso(data.clubReports?.endDate)}</b>`,
        "",
        `Выигрыш: ${formatRake(total("winnings"))}`,
        `Комиссия кэш + MTT: ${formatRake(total("commission"))}`,
        `Баланс: ${formatRake(total("balance"))}`,
        `Обслуживание клубов: ${formatRake(total("service"))}`,
        `ЗП: ${formatRake(total("salary"))}`,
        "",
        `<b>Итого к расчёту: ${formatRake(total("total"))}</b>`,
      ];
      const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
      return Boolean(sent.ok);
    }
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Для союза «${binding.league}» нет отчёта за текущую неделю.` });
    return Boolean(sent.ok);
  }
  const reports = Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [];
  const report = reports.find((row) => String(row.clubId) === String(binding.clubId));
  if (!report) {
    const sent = await telegram("sendMessage", { chat_id: chatId, text: `Для клуба «${binding.club}» нет отчёта за текущую неделю.` });
    return Boolean(sent.ok);
  }
  const metrics = report.metrics || {};
  const lines = [
    `<b>${escapeTelegramHtml(report.club)}</b>`,
    `<b>Период: ${displayIso(report.startDate)}–${displayIso(report.endDate)}</b>`,
    "",
    `Выигрыш: ${formatRake(metrics.winnings)}`,
    `Комиссия кэш + MTT: ${formatRake(metrics.commission)}`,
    `Баланс: ${formatRake(metrics.balance)}`,
    `Обслуживание ${formatPercent(metrics.servicePercent)}%: ${formatRake(metrics.service)}`,
    ...(Number(metrics.salary || 0) !== 0 ? [`ЗП: ${formatRake(metrics.salary)} ₽`] : []),
    "",
    `<b>Итого к расчёту: ${formatRake(metrics.total)}</b>`,
  ];
  const sent = await telegram("sendPhoto", {
    chat_id: chatId,
    photo: `${APP_ORIGIN}${report.imagePath}?v=bound-club-1`,
    caption: lines.join("\n"),
    parse_mode: "HTML",
  });
  return Boolean(sent.ok);
}

async function sendBoundUnionTotal(chatId, binding, data = latestUnionData) {
  const reports = Array.isArray(data.leagueReports?.reports) ? data.leagueReports.reports : [];
  const report = reports.find((row) => String(row.leagueId) === String(binding.leagueId));
  if (report) {
    const metrics = report.metrics || {};
    const lines = [
      `<b>${escapeTelegramHtml(report.league)} — короткое итого</b>`,
      `<b>Период: ${displayIso(report.startDate)}–${displayIso(report.endDate)}</b>`,
      "",
      `Выигрыш: ${formatRake(metrics.winnings)}`,
      `Рейк: ${formatRake(metrics.commission)}`,
      `Баланс: ${formatRake(metrics.balance)}`,
      `Обслуживание: ${formatRake(metrics.service)}`,
      ...(Number(metrics.jackpotRefund || 0) > 0 ? [`Возврат джекпота: +${formatRake(metrics.jackpotRefund)}`] : []),
      `<b>Итого: ${formatRake(metrics.total)}</b>`,
    ];
    const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
    return Boolean(sent.ok);
  }
  if (String(binding.leagueId) === "184691") {
    const rows = (data.clubReports?.reports || []).filter((row) => String(row.leagueId) === "184691");
    const total = (field) => rows.reduce((sum, row) => sum + Number(row.metrics?.[field] || 0), 0);
    const lines = [
      "<b>Anti-Reg — короткое итого</b>",
      `<b>Период: ${displayIso(data.clubReports?.startDate)}–${displayIso(data.clubReports?.endDate)}</b>`,
      "",
      `Выигрыш: ${formatRake(total("winnings"))}`,
      `Рейк: ${formatRake(total("commission"))}`,
      `Баланс: ${formatRake(total("balance"))}`,
      `Обслуживание: ${formatRake(total("service"))}`,
      `ЗП: ${formatRake(total("salary"))}`,
      `<b>Итого: ${formatRake(total("total"))}</b>`,
    ];
    const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
    return Boolean(sent.ok);
  }
  const sent = await telegram("sendMessage", { chat_id: chatId, text: `Для союза «${binding.league}» нет итога за текущую неделю.` });
  return Boolean(sent.ok);
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

function escapeSvgText(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

async function generateBoundEntityImage(description, entityName) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), 52000) : null;
  try {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-2",
        prompt: [
          "Create a polished square promotional image for a poker club or poker union.",
          `User description: ${description}`,
          `Brand context: ${entityName}.`,
          "Do not render any words, letters, numbers, logos, watermarks, UI, or captions; the exact title will be overlaid separately.",
          "Leave a visually calm dark area along the bottom for a title overlay.",
        ].join("\n"),
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
      }),
      signal: controller?.signal,
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.data?.[0]?.b64_json) {
      const error = new Error(result?.error?.message || `OpenAI image generation failed: ${response.status}`);
      error.status = response.status;
      throw error;
    }
    const title = escapeSvgText(entityName);
    const fontSize = entityName.length > 28 ? 40 : entityName.length > 18 ? 48 : 58;
    const overlay = Buffer.from(`<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="824" width="1024" height="200" fill="rgba(0,0,0,0.72)"/>
      <text x="512" y="925" text-anchor="middle" dominant-baseline="middle" fill="#ffffff" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700">${title}</text>
    </svg>`);
    return sharp(Buffer.from(result.data[0].b64_json, "base64"))
      .resize(1024, 1024, { fit: "cover" })
      .composite([{ input: overlay }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function sendGeneratedTelegramPhoto(chatId, imageBuffer, caption) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("photo", new Blob([imageBuffer], { type: "image/jpeg" }), "generated-poker21.jpg");
  if (caption) form.append("caption", caption);
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, { method: "POST", body: form });
  return response.json().catch(() => ({}));
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return res.status(500).json({ ok: false, error: "Bot webhook is not configured" });
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }

  const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const callbackQuery = update.callback_query || null;
  const balanceCallback = callbackQuery ? String(callbackQuery.data || "").match(/^balance:(op|apply):(add|subtract)(?::(rub|usd))?:(\d+)$/) : null;
  const paymentNotificationCallback = callbackQuery ? String(callbackQuery.data || "").match(/^paynotify:set:(under5000|from5000|all|off)$/) : null;
  const paymentCallback = callbackQuery ? String(callbackQuery.data || "").match(/^payreq:(view|list|remove|take|paid|cancel|confirm|reject):([A-Za-z0-9_-]+)$/) : null;
  const scheduleViewCallback = callbackQuery ? String(callbackQuery.data || "").match(/^schedule:view:(today|all)$/) : null;
  const scheduleCallback = callbackQuery ? String(callbackQuery.data || "").match(/^schedule:(add|edit|delete)(?::(?:(group):(month|day|daily)|([A-Za-z0-9_-]+)))?$/) : null;
  if (scheduleViewCallback && callbackQuery?.message?.chat?.id != null) {
    const actorChatId = String(callbackQuery.message.chat.id);
    const viewMode = scheduleViewCallback[1];
    const publicScheduleChat = isPublicScheduleChat(callbackQuery.message.chat);
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    const sent = await sendTournamentSchedule(
      actorChatId,
      null,
      publicScheduleChat ? ANTIREG_REPORT_CHAT_ID : actorChatId,
      viewMode,
      callbackQuery.message.message_id,
    );
    return res.status(200).json({ ok: true, schedule: true, viewMode, sent });
  }
  if (scheduleCallback && callbackQuery?.message?.chat?.id != null) {
    const actorChatId = String(callbackQuery.message.chat.id);
    const actorId = callbackQuery.from?.id;
    const action = scheduleCallback[1];
    const selectedCategory = scheduleCallback[2] === "group" ? scheduleCallback[3] : "";
    const itemId = scheduleCallback[4] || "";
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    if (!await isTelegramChatAdmin(actorChatId, actorId)) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Менять расписание может только администратор группы." });
      return res.status(200).json({ ok: true, schedule: false, forbidden: true });
    }
    if (!isRedisConfigured()) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Расписание недоступно: Redis не настроен." });
      return res.status(200).json({ ok: true, schedule: false, redis: false });
    }
    await telegram("deleteMessage", {
      chat_id: actorChatId,
      message_id: callbackQuery.message.message_id,
    });
    const storedRows = await getTournamentSchedule(actorChatId);
    const normalized = normalizedScheduleRows(storedRows);
    const rows = normalized.rows;
    if (normalized.changed) await saveTournamentSchedule(actorChatId, rows);
    if ((action === "edit" || action === "delete") && !itemId && !selectedCategory) {
      if (!rows.length) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Расписание пока пустое. Сначала добавьте турнир." });
        return res.status(200).json({ ok: true, schedule: true, empty: true });
      }
      await telegram("sendMessage", {
        chat_id: actorChatId,
        text: action === "edit" ? "В какой группе изменить турнир?" : "Из какой группы удалить турнир?",
        reply_markup: scheduleCategoryKeyboard(action, rows),
      });
      return res.status(200).json({ ok: true, schedule: true, action, categorySelection: true });
    }
    if ((action === "edit" || action === "delete") && selectedCategory) {
      const categoryRows = rows.filter((row) => row.category === selectedCategory);
      if (!categoryRows.length) {
        await telegram("sendMessage", { chat_id: actorChatId, text: `В разделе «${SCHEDULE_CATEGORY_LABELS[selectedCategory]}» пока нет турниров.` });
        return res.status(200).json({ ok: true, schedule: true, empty: true, selectedCategory });
      }
      const buttons = categoryRows.slice(0, 50).map((row, index) => [{
        text: `${index + 1}. ${String(row.text).replace(/\s+/g, " ").slice(0, 45)}`,
        callback_data: `schedule:${action}:${row.id}`,
      }]);
      await telegram("sendMessage", {
        chat_id: actorChatId,
        text: `${SCHEDULE_CATEGORY_LABELS[selectedCategory]}\n\n${action === "edit" ? "Какой турнир изменить?" : "Какой турнир удалить?"}`,
        reply_markup: { inline_keyboard: buttons },
      });
      return res.status(200).json({ ok: true, schedule: true, action, selection: true, selectedCategory });
    }
    if (action === "delete" && itemId) {
      const item = rows.find((row) => String(row.id) === itemId);
      if (!item) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Турнир уже удалён или не найден." });
        return res.status(200).json({ ok: true, schedule: true, deleted: false });
      }
      await saveTournamentSchedule(actorChatId, rows.filter((row) => String(row.id) !== itemId));
      await telegram("sendMessage", { chat_id: actorChatId, text: `🗑 Турнир удалён:\n${item.text}` });
      return res.status(200).json({ ok: true, schedule: true, deleted: true });
    }
    const item = itemId ? rows.find((row) => String(row.id) === itemId) : null;
    if (action === "edit" && !item) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Турнир не найден." });
      return res.status(200).json({ ok: true, schedule: true, found: false });
    }
    await redisPipeline(
      [["SET", tournamentSchedulePendingKey(actorChatId, actorId), JSON.stringify({ action, itemId }), "EX", "600"]],
      { context: "telegram-report.schedule.pending.set", timeoutMs: 2000 },
    );
    await telegram("sendMessage", {
      chat_id: actorChatId,
      text: action === "add"
        ? "Отправьте турнир обычной строкой в любом формате. После него можно сразу отправить следующий.\n\nНапример:\nПятница 20:00 — Турнир дня — Friday Special — вход 3 000 ₽ — GTD 100 000 ₽\n\nДля разделения используйте в тексте: «Турнир месяца», «Турнир дня» или «Ежедневный». Без пометки турнир попадёт в блок «Турниры дня».\n\nКогда закончите: /готово\nДля отмены: /отмена"
        : `Отправьте новый текст турнира одним сообщением.\n\nСейчас:\n${item.text}\n\nДля отмены: /отмена`,
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Введите данные турнира" },
    });
    return res.status(200).json({ ok: true, schedule: true, action, pending: true });
  }
  if (paymentNotificationCallback && callbackQuery?.message?.chat?.id != null) {
    const actorChatId = String(callbackQuery.message.chat.id);
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    const binding = await getClubBinding(actorChatId);
    if (!binding) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Сначала привяжите эту группу к клубу или союзу." });
      return res.status(200).json({ ok: true, paymentNotifications: false, unbound: true });
    }
    if (!await isTelegramChatAdmin(actorChatId, callbackQuery.from?.id)) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Настраивать уведомления может только администратор этой группы." });
      return res.status(200).json({ ok: true, paymentNotifications: false, forbidden: true });
    }
    const preference = paymentNotificationCallback[1];
    const saved = await redisPipeline(
      [preference === "off"
        ? ["DEL", paymentDetailsNotificationsKey(actorChatId)]
        : ["SET", paymentDetailsNotificationsKey(actorChatId), preference]],
      { context: "telegram-report.payment-details.notifications.set", timeoutMs: 2000 },
    );
    const labels = { under5000: "реквизиты до 5 000 ₽", from5000: "реквизиты от 5 000 ₽", all: "все реквизиты" };
    const success = preference === "off" ? saved?.[0]?.result != null : saved?.[0]?.result === "OK";
    await telegram("sendMessage", {
      chat_id: actorChatId,
      text: success
        ? preference === "off" ? "Уведомления о новых реквизитах выключены." : `Уведомления включены: ${labels[preference]}.`
        : "Не удалось сохранить настройку уведомлений.",
    });
    return res.status(200).json({ ok: true, paymentNotifications: success && preference !== "off", preference });
  }
  if (paymentCallback && callbackQuery?.message?.chat?.id != null) {
    const action = paymentCallback[1];
    const id = paymentCallback[2];
    const actorChatId = String(callbackQuery.message.chat.id);
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    const isReadOnlyMainRegistry = isMainReportChat(actorChatId) && ["view", "list"].includes(action);
    const binding = await getClubBinding(actorChatId);
    if (!binding && !isReadOnlyMainRegistry) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Сначала привяжите эту группу к клубу или союзу." });
      return res.status(200).json({ ok: true, paymentDetails: false, unbound: true });
    }
    if (!isReadOnlyMainRegistry && !await isTelegramChatAdmin(actorChatId, callbackQuery.from?.id)) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Управлять оплатами может только администратор этой группы." });
      return res.status(200).json({ ok: true, paymentDetails: false, forbidden: true });
    }
    if (action === "list") {
      const sent = await sendPaymentDetailsRegistry(actorChatId, !isReadOnlyMainRegistry, callbackQuery.message.message_id);
      return res.status(200).json({ ok: true, paymentDetails: true, action, sent });
    }
    const item = await getPaymentDetails(id);
    if (!item) {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Заявка уже удалена или не найдена." });
      return res.status(200).json({ ok: true, paymentDetails: false, missing: true });
    }
    if (action === "remove") {
      if (item.status !== "open" || String(item.owner?.chatId) !== actorChatId) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Эти реквизиты уже нельзя убрать: заявка взята в работу или принадлежит другой группе." });
        return res.status(200).json({ ok: true, paymentDetails: false, removed: false, invalidState: true });
      }
      item.status = "cancelled";
      item.cancelledAt = new Date().toISOString();
      const removed = await savePaymentDetails(item);
      await sendOrEditPaymentMessage(actorChatId, removed
        ? `Реквизиты на <b>${formatPaymentAmount(item)}</b> убраны из списка.`
        : "Не удалось убрать реквизиты. Попробуйте ещё раз.",
      [[{ text: "Назад к списку", callback_data: `payreq:list:${id}` }]], callbackQuery.message.message_id);
      return res.status(200).json({ ok: true, paymentDetails: removed, removed });
    }
    if (action === "view") {
      const buttons = [];
      const isOwner = String(item.owner?.chatId) === actorChatId;
      if (!isReadOnlyMainRegistry && item.status === "open" && isOwner) {
        buttons.push([{ text: "Убрать реквизиты", callback_data: `payreq:remove:${id}` }]);
      }
      if (!isReadOnlyMainRegistry && item.status === "open" && String(item.owner?.chatId) !== actorChatId) {
        buttons.push([{ text: "Взять в работу", callback_data: `payreq:take:${id}` }]);
      } else if (item.status === "claimed" && String(item.payer?.chatId) === actorChatId) {
        buttons.push([
          { text: "Я оплатил", callback_data: `payreq:paid:${id}` },
          { text: "Отменить", callback_data: `payreq:cancel:${id}` },
        ]);
      } else if (item.status === "awaiting_receipt" && String(item.payer?.chatId) === actorChatId) {
        buttons.push([{ text: "Отменить", callback_data: `payreq:cancel:${id}` }]);
      } else if (item.status === "paid" && String(item.owner?.chatId) === actorChatId) {
        buttons.push([
          { text: "Подтвердить", callback_data: `payreq:confirm:${id}` },
          { text: "Не поступило", callback_data: `payreq:reject:${id}` },
        ]);
      }
      buttons.push([{ text: "Назад к списку", callback_data: `payreq:list:${id}` }]);
      await sendOrEditPaymentMessage(actorChatId, [
        `${isOwner ? "🏠 <b>Ваши реквизиты</b>\n" : ""}<b>${item.owner.type === "union" ? "Союз" : "Клуб"}: ${escapeTelegramHtml(item.owner.name)}</b>`,
        `Сумма: <b>${formatPaymentAmount(item)}</b>`,
        escapeTelegramHtml(item.details),
        `Статус: ${escapeTelegramHtml(paymentDetailsStatusText(item))}`,
      ].join("\n"), buttons, callbackQuery.message.message_id);
      return res.status(200).json({ ok: true, paymentDetails: true, action });
    }
    if (action === "take") {
      if (item.status !== "open") {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Эту заявку уже взяли в работу." });
        return res.status(200).json({ ok: true, paymentDetails: false, busy: true });
      }
      if (String(item.owner.chatId) === actorChatId) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Нельзя взять в работу собственные реквизиты." });
        return res.status(200).json({ ok: true, paymentDetails: false, own: true });
      }
      const claim = await redisPipeline([["SET", paymentDetailsClaimKey(id), actorChatId, "NX", "EX", String(PAYMENT_CLAIM_TTL_SECONDS)]], { context: "telegram-report.payment-details.claim", timeoutMs: 2000 });
      if (claim?.[0]?.result !== "OK") {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Эту заявку уже взяли в работу." });
        return res.status(200).json({ ok: true, paymentDetails: false, busy: true });
      }
      item.status = "claimed";
      item.payer = { ...paymentEntity(binding), chatId: actorChatId };
      item.claimedAt = new Date().toISOString();
      await savePaymentDetails(item);
      await sendOrEditPaymentMessage(actorChatId, `<b>Вы взяли оплату в работу</b>\n\n${escapeTelegramHtml(item.owner.name)} — <b>${formatPaymentAmount(item)}</b>\n${escapeTelegramHtml(item.details)}\n\n⏱ На оплату 15 минут. Если не отметить оплату, заявка снова станет доступна другим.`, [[
        { text: "Я оплатил", callback_data: `payreq:paid:${id}` },
        { text: "Отменить", callback_data: `payreq:cancel:${id}` },
      ], [{ text: "Назад к списку", callback_data: `payreq:list:${id}` }]], callbackQuery.message.message_id);
      await notifyPaymentParty(item.owner.chatId, `<b>${escapeTelegramHtml(item.payer.name)}</b> взял оплату <b>${formatPaymentAmount(item)}</b> в работу.\n\nОжидайте оплату, чтобы подтвердить поступление. Срок оплаты — 15 минут.`);
      return res.status(200).json({ ok: true, paymentDetails: true, action });
    }
    if (action === "cancel") {
      if (!["claimed", "awaiting_receipt"].includes(item.status) || String(item.payer?.chatId) !== actorChatId) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Эту заявку уже нельзя отменить из данной группы." });
        return res.status(200).json({ ok: true, paymentDetails: false, invalidState: true });
      }
      const payerName = item.payer?.name || "Плательщик";
      item.status = "open";
      item.reopenedAt = new Date().toISOString();
      delete item.payer;
      delete item.claimedAt;
      await savePaymentDetails(item);
      await redisPipeline([["DEL", paymentDetailsClaimKey(id)]], { context: "telegram-report.payment-details.cancel", timeoutMs: 2000 });
      await sendOrEditPaymentMessage(actorChatId, `Оплата <b>${formatPaymentAmount(item)}</b> отменена. Заявка возвращена в общий список.`, [[
        { text: "Назад к списку", callback_data: `payreq:list:${id}` },
      ]], callbackQuery.message.message_id);
      await notifyPaymentParty(item.owner.chatId, `<b>${escapeTelegramHtml(payerName)}</b> отменил оплату <b>${formatPaymentAmount(item)}</b>. Заявка снова доступна другим.`);
      return res.status(200).json({ ok: true, paymentDetails: true, action });
    }
    if (action === "paid") {
      if (item.status !== "claimed" || String(item.payer?.chatId) !== actorChatId) {
        await telegram("sendMessage", { chat_id: actorChatId, text: "Эту оплату нельзя отметить оплаченной из данной группы." });
        return res.status(200).json({ ok: true, paymentDetails: false, invalidState: true });
      }
      item.status = "awaiting_receipt";
      item.receiptRequestedAt = new Date().toISOString();
      item.receiptRequestedBy = String(callbackQuery.from?.id || "");
      await telegram("deleteMessage", { chat_id: actorChatId, message_id: callbackQuery.message.message_id });
      const receiptPrompt = await telegram("sendMessage", {
        chat_id: actorChatId,
        text: [
          `Вы взяли реквизиты у ${item.owner.type === "union" ? "союза" : "клуба"} <b>«${escapeTelegramHtml(item.owner.name)}»</b>.`,
          "",
          "Вот полные данные:",
          `Сумма: <b>${formatPaymentAmount(item)}</b>`,
          escapeTelegramHtml(item.details),
          "",
          "<b>Прикрепите чек.</b>",
        ].join("\n"),
        parse_mode: "HTML",
        reply_markup: { force_reply: true, input_field_placeholder: "Прикрепите фото или файл чека" },
      });
      item.receiptPromptMessageId = String(receiptPrompt.result?.message_id || "");
      await savePaymentDetails(item);
      return res.status(200).json({ ok: true, paymentDetails: true, action });
    }
    if (!item.owner || String(item.owner.chatId) !== actorChatId || item.status !== "paid") {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Подтвердить эту оплату из данной группы нельзя." });
      return res.status(200).json({ ok: true, paymentDetails: false, invalidState: true });
    }
    if (action === "reject") {
      item.status = "claimed";
      item.rejectedAt = new Date().toISOString();
      item.claimedAt = new Date().toISOString();
      await savePaymentDetails(item);
      await redisPipeline([["SET", paymentDetailsClaimKey(id), String(item.payer.chatId), "EX", String(PAYMENT_CLAIM_TTL_SECONDS)]], { context: "telegram-report.payment-details.retry", timeoutMs: 2000 });
      await sendOrEditPaymentMessage(actorChatId, "Отмечено: платёж пока не поступил.", [], callbackQuery.message.message_id);
      await notifyPaymentParty(item.payer.chatId, `<b>${escapeTelegramHtml(item.owner.name)}</b> сообщил, что платёж <b>${formatPaymentAmount(item)}</b> пока не поступил. Проверьте перевод.`, [[
        { text: "Я оплатил", callback_data: `payreq:paid:${id}` },
        { text: "Отменить", callback_data: `payreq:cancel:${id}` },
      ]]);
      return res.status(200).json({ ok: true, paymentDetails: true, action });
    }
    const confirmation = await redisPipeline([["SET", paymentDetailsConfirmedKey(id), "1", "NX"]], { context: "telegram-report.payment-details.confirm-lock", timeoutMs: 2000 });
    if (confirmation?.[0]?.result !== "OK") {
      await telegram("sendMessage", { chat_id: actorChatId, text: "Этот платёж уже был подтверждён и учтён в балансе." });
      return res.status(200).json({ ok: true, paymentDetails: true, action, duplicate: true });
    }
    item.status = "confirmed";
    item.confirmedAt = new Date().toISOString();
    await savePaymentDetails(item);
    const ownerBalanceKey = item.currency === "usd" ? paymentBalanceUsdKey(item.owner.chatId) : paymentBalanceKey(item.owner.chatId);
    const payerBalanceKey = item.currency === "usd" ? paymentBalanceUsdKey(item.payer.chatId) : paymentBalanceKey(item.payer.chatId);
    const balanceResult = await redisPipeline([
      ["INCRBY", ownerBalanceKey, String(-Number(item.amountCents || 0))],
      ["INCRBY", payerBalanceKey, String(Number(item.amountCents || 0))],
      ["DEL", paymentDetailsClaimKey(id)],
    ], { context: "telegram-report.payment-details.confirm", timeoutMs: 2000 });
    const symbol = item.currency === "usd" ? "$" : "₽";
    const ownerAfter = Number(balanceResult?.[0]?.result || 0);
    const payerAfter = Number(balanceResult?.[1]?.result || 0);
    const ownerBefore = ownerAfter + Number(item.amountCents || 0);
    const payerBefore = payerAfter - Number(item.amountCents || 0);
    await sendOrEditPaymentMessage(actorChatId, [
      `✅ Получение <b>${formatPaymentAmount(item)}</b> подтверждено. Заявка закрыта.`,
      "",
      `<b>Баланс по реквизитам изменён:</b>`,
      `${formatBalanceAmount(ownerBefore, symbol)} → ${formatBalanceAmount(ownerAfter, symbol)}`,
      `Операция: −${formatPaymentAmount(item)}`,
    ].join("\n"), [], callbackQuery.message.message_id);
    await notifyPaymentParty(item.payer.chatId, [
      `✅ <b>${escapeTelegramHtml(item.owner.name)}</b> подтвердил получение <b>${formatPaymentAmount(item)}</b>.`,
      "",
      `<b>Баланс по реквизитам изменён:</b>`,
      `${formatBalanceAmount(payerBefore, symbol)} → ${formatBalanceAmount(payerAfter, symbol)}`,
      `Операция: +${formatPaymentAmount(item)}`,
    ].join("\n"));
    return res.status(200).json({ ok: true, paymentDetails: true, action });
  }

  const receiptMessage = update.message;
  const hasReceiptAttachment = Boolean(receiptMessage && (receiptMessage.photo?.length || receiptMessage.document));
  if (hasReceiptAttachment && receiptMessage.chat?.id != null) {
    const payerChatId = String(receiptMessage.chat.id);
    const awaitingReceipts = (await listPaymentDetails())
      .filter((item) => item.status === "awaiting_receipt" && String(item.payer?.chatId) === payerChatId)
      .sort((a, b) => new Date(b.receiptRequestedAt || 0).getTime() - new Date(a.receiptRequestedAt || 0).getTime());
    const repliedToMessageId = String(receiptMessage.reply_to_message?.message_id || "");
    const item = awaitingReceipts.find((candidate) => candidate.receiptPromptMessageId === repliedToMessageId) || awaitingReceipts[0];
    if (item) {
      if (!await isTelegramChatAdmin(payerChatId, receiptMessage.from?.id)) {
        await telegram("sendMessage", { chat_id: payerChatId, text: "Прикрепить чек может только администратор этой группы." });
        return res.status(200).json({ ok: true, paymentDetails: false, receipt: false, forbidden: true });
      }
      const copied = await telegram("copyMessage", {
        chat_id: String(item.owner.chatId),
        from_chat_id: payerChatId,
        message_id: receiptMessage.message_id,
      });
      if (!copied.ok) {
        await telegram("sendMessage", { chat_id: payerChatId, text: "Не удалось отправить чек получателю. Прикрепите его ещё раз." });
        return res.status(200).json({ ok: true, paymentDetails: true, receipt: false, sent: false });
      }
      item.status = "paid";
      item.paidAt = new Date().toISOString();
      item.receiptMessageId = String(receiptMessage.message_id);
      await savePaymentDetails(item);
      await sendOrEditPaymentMessage(
        payerChatId,
        `Чек отправлен получателю. Оплата <b>${formatPaymentAmount(item)}</b> ожидает подтверждения.`,
        [],
        item.receiptPromptMessageId || null,
      );
      await notifyPaymentParty(item.owner.chatId, `<b>${escapeTelegramHtml(item.payer.name)}</b> сообщил об оплате <b>${formatPaymentAmount(item)}</b>.\n\nПроверьте чек и поступление, затем подтвердите.`, [[
        { text: "Подтвердить", callback_data: `payreq:confirm:${item.id}` },
        { text: "Не поступило", callback_data: `payreq:reject:${item.id}` },
      ]]);
      return res.status(200).json({ ok: true, paymentDetails: true, receipt: true, sent: true });
    }
  }

  const nonTextPlacementMessage = update.message;
  if (nonTextPlacementMessage?.chat?.id != null && !String(nonTextPlacementMessage.text || "").trim() && isRedisConfigured()) {
    const placementChatId = String(nonTextPlacementMessage.chat.id);
    const placement = await redisPipeline(
      [["GET", paymentDetailsPlacementKey(placementChatId)]],
      { context: "telegram-report.payment-details.placement.non-text", timeoutMs: 2000 },
    );
    if (String(placement?.[0]?.result || "") === String(nonTextPlacementMessage.from?.id || "")) {
      const sent = await telegram("sendMessage", {
        chat_id: placementChatId,
        text: `Введите данные текстовым сообщением.\n\n${paymentDetailsFormText()}`,
        reply_to_message_id: nonTextPlacementMessage.message_id,
        reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Введите реквизиты" },
      });
      return res.status(200).json({ ok: true, paymentDetails: false, prompt: true, textRequired: true, sent: Boolean(sent.ok) });
    }
  }
  if (balanceCallback?.[1] === "op" && callbackQuery?.message?.chat?.id != null) {
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    if (!await isTelegramChatAdmin(String(callbackQuery.message.chat.id), callbackQuery.from?.id)) {
      await telegram("sendMessage", { chat_id: String(callbackQuery.message.chat.id), text: "Изменять баланс может только администратор этой группы." });
      return res.status(200).json({ ok: true, balanceChoice: false, forbidden: true });
    }
    const action = balanceCallback[2];
    const cents = balanceCallback[4];
    const sent = await telegram("sendMessage", {
      chat_id: String(callbackQuery.message.chat.id),
      text: "В какой валюте изменить баланс?",
      reply_markup: {
        inline_keyboard: [[
          { text: "Рубли ₽", callback_data: `balance:apply:${action}:rub:${cents}` },
          { text: "Доллары $", callback_data: `balance:apply:${action}:usd:${cents}` },
        ]],
      },
    });
    return res.status(200).json({ ok: true, balanceChoice: "currency", sent: Boolean(sent.ok) });
  }
  const callbackCommands = {
    "bound:report": "/отчет",
    "bound:clubs": "/клубы_союза",
    "bound:total": "/итого_союза",
    "bound:top:rake": "/топ_клубов рейк",
    "bound:players": "/игроки рейк",
  };
  const callbackLabels = {
    "bound:report": "Отчёт",
    "bound:clubs": "Клубы",
    "bound:total": "Короткое итого",
    "bound:top:rake": "Топ по рейку",
    "bound:players": "Игроки",
  };
  const callbackText = balanceCallback?.[1] === "apply"
    ? `/баланс ${balanceCallback[2] === "add" ? "+" : "-"}${Number(balanceCallback[4]) / 100}${balanceCallback[3] === "usd" ? "$" : "р"}`
    : callbackQuery ? callbackCommands[String(callbackQuery.data || "")] : null;
  const sourceMessage = update.message || update.edited_message || callbackQuery?.message;
  const message = sourceMessage && callbackText
    ? { ...sourceMessage, text: callbackText, from: callbackQuery.from || sourceMessage.from }
    : sourceMessage;
  if (callbackQuery) {
    await telegram("answerCallbackQuery", { callback_query_id: callbackQuery.id });
    const callbackLabel = callbackLabels[String(callbackQuery.data || "")];
    if (callbackLabel && callbackQuery.message?.chat?.id != null) {
      const actor = callbackQuery.from?.username
        ? `@${callbackQuery.from.username}`
        : [callbackQuery.from?.first_name, callbackQuery.from?.last_name].filter(Boolean).join(" ") || `ID ${callbackQuery.from?.id || "—"}`;
      await telegram("sendMessage", {
        chat_id: String(callbackQuery.message.chat.id),
        text: `👤 ${escapeTelegramHtml(actor)} нажал кнопку «${escapeTelegramHtml(callbackLabel)}»`,
        parse_mode: "HTML",
      });
    }
  }
  if (!message || !message.chat || !message.text) return res.status(200).json({ ok: true });

  const chatId = String(message.chat.id);
  const publicScheduleChat = isPublicScheduleChat(message.chat);
  if (publicScheduleChat && !isScheduleCommand(message.text)) {
    return res.status(200).json({ ok: true, ignored: true, publicScheduleChat: true });
  }
  if (isCancelCommand(message.text)) {
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Сейчас нет активного ввода для отмены." });
      return res.status(200).json({ ok: true, cancel: true, cancelled: false, sent: Boolean(sent.ok) });
    }
    const result = await redisPipeline(
      [
        ["DEL", romanTotalPendingKey(chatId, message.from?.id)],
        ["DEL", diamondSalesPendingKey(chatId, message.from?.id)],
        ["DEL", tournamentSchedulePendingKey(chatId, message.from?.id)],
      ],
      { context: "telegram-report.pending.cancel", timeoutMs: 2000 },
    );
    const romanCancelled = Number(result?.[0]?.result || 0) > 0;
    const diamondsCancelled = Number(result?.[1]?.result || 0) > 0;
    const scheduleCancelled = Number(result?.[2]?.result || 0) > 0;
    const cancelled = romanCancelled || diamondsCancelled || scheduleCancelled;
    const cancelledText = [romanCancelled, diamondsCancelled, scheduleCancelled].filter(Boolean).length > 1
      ? "✅ Ожидающий ввод отменён."
      : scheduleCancelled
        ? "✅ Изменение расписания отменено."
      : diamondsCancelled
        ? "✅ Ввод суммы продажи алмазов отменён."
        : "✅ Ввод после /итого Роман отменён.";
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: cancelled ? cancelledText : "Сейчас нет активного ввода для отмены.",
      reply_to_message_id: message.message_id,
    });
    return res.status(200).json({ ok: true, cancel: true, cancelled, sent: Boolean(sent.ok) });
  }
  if (isScheduleDoneCommand(message.text)) {
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Сейчас нет активного добавления турниров." });
      return res.status(200).json({ ok: true, schedule: false, done: false, sent: Boolean(sent.ok) });
    }
    const pendingKey = tournamentSchedulePendingKey(chatId, message.from?.id);
    const result = await redisPipeline([["DEL", pendingKey]], { context: "telegram-report.schedule.pending.done", timeoutMs: 2000 });
    if (!Number(result?.[0]?.result || 0)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Сейчас нет активного добавления турниров." });
      return res.status(200).json({ ok: true, schedule: false, done: false, sent: Boolean(sent.ok) });
    }
    const sent = await sendTournamentSchedule(chatId, message.message_id);
    return res.status(200).json({ ok: true, schedule: true, done: true, sent });
  }
  if (isRedisConfigured() && !String(message.text || "").trim().startsWith("/")) {
    const pendingKey = tournamentSchedulePendingKey(chatId, message.from?.id);
    const pending = await redisPipeline([["GET", pendingKey]], { context: "telegram-report.schedule.pending.get", timeoutMs: 2000 });
    if (pending?.[0]?.result) {
      let state = null;
      try { state = JSON.parse(String(pending[0].result)); } catch (_) {}
      const tournamentText = String(message.text || "").trim();
      if (!state || !["add", "edit"].includes(state.action)) {
        await redisPipeline([["DEL", pendingKey]], { context: "telegram-report.schedule.pending.invalid", timeoutMs: 2000 });
      } else if (tournamentText.length < 3 || tournamentText.length > 1000) {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: "Описание турнира должно содержать от 3 до 1000 символов. Отправьте его ещё раз или используйте /отмена.",
          reply_to_message_id: message.message_id,
        });
        return res.status(200).json({ ok: true, schedule: true, recorded: false, invalid: true, sent: Boolean(sent.ok) });
      } else {
        const rows = await getTournamentSchedule(chatId);
        let savedRows;
        let addedCount = 1;
        if (state.action === "edit") {
          const index = rows.findIndex((row) => String(row.id) === String(state.itemId || ""));
          if (index < 0) {
            await redisPipeline([["DEL", pendingKey]], { context: "telegram-report.schedule.pending.missing", timeoutMs: 2000 });
            const sent = await telegram("sendMessage", { chat_id: chatId, text: "Турнир уже удалён или не найден." });
            return res.status(200).json({ ok: true, schedule: true, recorded: false, missing: true, sent: Boolean(sent.ok) });
          }
          savedRows = rows.slice();
          savedRows[index] = { ...savedRows[index], text: tournamentText, updatedAt: new Date().toISOString() };
        } else {
          const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
          const parsed = normalizedScheduleRows([{ id, text: tournamentText, createdAt: new Date().toISOString() }]).rows;
          addedCount = parsed.length;
          savedRows = [...rows, ...parsed];
        }
        await saveTournamentSchedule(chatId, savedRows);
        if (state.action === "edit") {
          await redisPipeline([["DEL", pendingKey]], { context: "telegram-report.schedule.pending.clear", timeoutMs: 2000 });
        } else {
          await redisPipeline([["EXPIRE", pendingKey, "600"]], { context: "telegram-report.schedule.pending.extend", timeoutMs: 2000 });
        }
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: state.action === "edit"
            ? "✅ Турнир изменён.\n\nПоказать список: /расписание общее"
            : `${addedCount > 1 ? `✅ Добавлено турниров: ${addedCount}.` : "✅ Турнир добавлен."} Отправьте следующую строку или нажмите /готово.`,
          reply_to_message_id: message.message_id,
        });
        return res.status(200).json({ ok: true, schedule: true, recorded: true, action: state.action, sent: Boolean(sent.ok) });
      }
    }
  }
  if (isMainReportChat(chatId) && isRedisConfigured() && !String(message.text || "").trim().startsWith("/")) {
    const pendingKey = diamondSalesPendingKey(chatId, message.from?.id);
    const pending = await redisPipeline([["GET", pendingKey]], { context: "telegram-report.diamond-sales.pending.get", timeoutMs: 2000 });
    if (pending?.[0]?.result) {
      const cents = parseRomanAmountInput(message.text);
      if (cents == null) {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: "Введите сумму продажи алмазов только числом. Например: 50000. Если продаж не было — 0.",
          reply_to_message_id: message.message_id,
        });
        return res.status(200).json({ ok: true, diamondSales: true, recorded: false, invalid: true, sent: Boolean(sent.ok) });
      }
      const reportData = latestUnionData;
      const entry = JSON.stringify({
        cents,
        startDate: reportData.clubReports?.startDate || reportData.leagueReports?.startDate || null,
        endDate: reportData.clubReports?.endDate || reportData.leagueReports?.endDate || null,
        actorId: String(message.from?.id || ""),
        timestamp: new Date().toISOString(),
      });
      await redisPipeline([
        ["SET", diamondSalesKey(reportData), String(cents)],
        ["LPUSH", "poker21:telegram-report:diamond-sales:history", entry],
        ["LTRIM", "poker21:telegram-report:diamond-sales:history", "0", "99"],
        ["DEL", pendingKey],
      ], { context: "telegram-report.diamond-sales.record", timeoutMs: 3000 });
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: `✅ Продажа алмазов: ${formatRake(cents / 100)} ₽.\nСумма учтена в /китайцы, /доля и распределении долей.`,
        reply_to_message_id: message.message_id,
      });
      return res.status(200).json({ ok: true, diamondSales: true, recorded: true, cents, sent: Boolean(sent.ok) });
    }
  }
  if (isMainReportChat(chatId) && isRedisConfigured() && !String(message.text || "").trim().startsWith("/")) {
    const pendingKey = romanTotalPendingKey(chatId, message.from?.id);
    const pending = await redisPipeline([["GET", pendingKey]], { context: "telegram-report.roman-total.pending.get", timeoutMs: 2000 });
    if (pending?.[0]?.result) {
      let state = { stage: "vika", vikaCents: 0 };
      try { state = { ...state, ...JSON.parse(String(pending[0].result)) }; } catch (_) {}
      const cents = parseRomanAmountInput(message.text);
      if (cents == null) {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: `Введите сумму, которую отправила ${state.stage === "anya" ? "Аня" : "Вика"}, только числом. Например: 50000. Если ничего не отправляла — 0.`,
          reply_to_message_id: message.message_id,
        });
        return res.status(200).json({ ok: true, romanTotal: true, recorded: false, invalid: true, sent: Boolean(sent.ok) });
      }
      if (state.stage !== "anya") {
        await redisPipeline(
          [["SET", pendingKey, JSON.stringify({ stage: "anya", vikaCents: cents }), "EX", "600"]],
          { context: "telegram-report.roman-total.pending.anya", timeoutMs: 2000 },
        );
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: "Сколько отправила Аня?\n\nВведите только сумму, например: 50000. Если ничего не отправляла — 0.\n\nДля отмены: /отмена",
          reply_markup: { force_reply: true, selective: true, input_field_placeholder: "0" },
        });
        return res.status(200).json({ ok: true, romanTotal: true, recorded: false, stage: "anya", sent: Boolean(sent.ok) });
      }
      const timestamp = new Date().toISOString();
      const vikaCents = Number(state.vikaCents || 0);
      const anyaCents = cents;
      const entry = JSON.stringify({ vikaCents, anyaCents, actorId: String(message.from?.id || ""), timestamp });
      await redisPipeline([
        ["SET", romanTotalSentKey("vika"), String(vikaCents)],
        ["SET", romanTotalSentKey("anya"), String(anyaCents)],
        ["LPUSH", "poker21:telegram-report:roman-total:history", entry],
        ["LTRIM", "poker21:telegram-report:roman-total:history", "0", "99"],
        ["DEL", pendingKey],
      ], { context: "telegram-report.roman-total.sent.record", timeoutMs: 3000 });
      const summarySent = await sendRomanTotal(chatId, message.message_id);
      return res.status(200).json({ ok: true, romanTotal: true, recorded: true, vikaCents, anyaCents, sent: summarySent });
    }
  }
  if (isStopCommand(message.text)) {
    const stopped = await stopChatCommands(chatId);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: stopped ? "⛔ Текущая отправка остановлена." : "Сейчас нет активной отправки.",
    });
    return res.status(200).json({ ok: true, stop: true, stopped, sent: Boolean(sent.ok) });
  }
  if (isScheduleCommand(message.text)) {
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Расписание недоступно: Redis не настроен." });
      return res.status(200).json({ ok: true, schedule: false, sent: Boolean(sent.ok) });
    }
    const viewMode = scheduleViewMode(message.text);
    if (viewMode === "menu") {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: "Какое расписание показать?",
        reply_to_message_id: message.message_id,
        reply_markup: {
          inline_keyboard: [[
            { text: "📅 Сегодня", callback_data: "schedule:view:today" },
            { text: "📋 Общее", callback_data: "schedule:view:all" },
          ]],
        },
      });
      return res.status(200).json({ ok: true, schedule: true, menu: true, sent: Boolean(sent.ok) });
    }
    const sent = await sendTournamentSchedule(
      chatId,
      message.message_id,
      publicScheduleChat ? ANTIREG_REPORT_CHAT_ID : chatId,
      viewMode,
    );
    return res.status(200).json({ ok: true, schedule: true, sent });
  }
  if (isEditScheduleCommand(message.text)) {
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Менять расписание может только администратор группы." });
      return res.status(200).json({ ok: true, scheduleEdit: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Расписание недоступно: Redis не настроен." });
      return res.status(200).json({ ok: true, scheduleEdit: false, sent: Boolean(sent.ok) });
    }
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Управление расписанием турниров:",
      reply_to_message_id: message.message_id,
      reply_markup: scheduleMenuKeyboard(),
    });
    return res.status(200).json({ ok: true, scheduleEdit: true, sent: Boolean(sent.ok) });
  }
  const manualClubName = parseManualClubCommand(message.text);
  if (manualClubName !== null) {
    if (!String(chatId).startsWith("-")) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Создать ручной клуб можно только в группе клуба." });
      return res.status(200).json({ ok: true, manualClub: false, sent: Boolean(sent.ok) });
    }
    if (!manualClubName) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Укажите название клуба длиной от 2 до 80 символов: /создать клуб Название" });
      return res.status(200).json({ ok: true, manualClub: false, invalid: true, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Создать ручной клуб может только администратор этой группы." });
      return res.status(200).json({ ok: true, manualClub: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const reportClub = (latestUnionData.directory?.clubs || []).find((row) => normalizeLookup(row.name) === normalizeLookup(manualClubName));
    if (reportClub) {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: `Клуб «${escapeTelegramHtml(reportClub.name)}» уже есть в актуальном отчёте. Привяжите его командой <code>/привязать клуб ${reportClub.id}</code>.`,
        parse_mode: "HTML",
      });
      return res.status(200).json({ ok: true, manualClub: false, reportClub: true, sent: Boolean(sent.ok) });
    }
    const binding = {
      type: "club",
      clubId: `manual-${String(chatId).replace(/\D/g, "")}`,
      club: manualClubName,
      manual: true,
      autoReport: false,
      boundBy: String(message.from.id),
      boundAt: new Date().toISOString(),
    };
    const saved = await setClubBinding(chatId, binding);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: saved
        ? `Создан ручной клуб «${escapeTelegramHtml(manualClubName)}». Теперь можно использовать /баланс, а клуб появится в /балансы.\n\nАвтоотчёт недоступен, пока группа не будет привязана к клубу из Excel командой /привязать клуб ID.`
        : "Не удалось создать ручной клуб: Redis недоступен или не настроен.",
      parse_mode: "HTML",
    });
    return res.status(200).json({ ok: true, manualClub: saved, clubId: binding.clubId, sent: Boolean(sent.ok) });
  }
  const bindingRequest = parseClubBindingCommand(message.text);
  if (bindingRequest) {
    if (isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: "Это главная отчётная группа. Её нельзя привязать к отдельному клубу или союзу.",
      });
      return res.status(200).json({ ok: true, binding: false, mainChat: true, sent: Boolean(sent.ok) });
    }
    if (!String(chatId).startsWith("-")) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Привязка клуба или союза доступна только в группах." });
      return res.status(200).json({ ok: true, binding: false, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Привязать клуб или союз может только администратор этой группы." });
      return res.status(200).json({ ok: true, binding: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const unionCandidates = (latestUnionData.jackpot?.leagues || []).map((row) => ({ id: String(row.leagueId), name: row.league, type: "union" }));
    const clubCandidates = (latestUnionData.directory?.clubs || []).map((row) => ({ ...row, type: "club" }));
    const candidates = bindingRequest.type === "union" ? unionCandidates : bindingRequest.type === "club" ? clubCandidates : [...unionCandidates, ...clubCandidates];
    const exactMatches = candidates.filter((row) => String(row.id) === bindingRequest.query || normalizeLookup(row.name) === normalizeLookup(bindingRequest.query));
    const matches = exactMatches.length ? exactMatches : candidates
      .map((row) => ({ ...row, score: lookupScore(row.name, bindingRequest.query) }))
      .filter((row) => row.score !== null)
      .sort((a, b) => a.score - b.score || (a.type === "union" ? -1 : 1))
      .slice(0, 10);
    const entity = matches.length === 1 ? matches[0] : null;
    const isUnion = entity ? entity.type === "union" : bindingRequest.type === "union";
    if (!entity && matches.length > 1) {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: [
          `Найдено несколько вариантов по запросу «${escapeTelegramHtml(bindingRequest.query)}»:`,
          "",
          ...matches.map((row) => `${row.type === "union" ? "Союз" : "Клуб"}: ${escapeTelegramHtml(row.name)} — <code>${row.id}</code>`),
          "",
          "Повторите команду с типом и точным ID, например: <code>/привязать союз 184691</code> или <code>/привязать клуб 758417</code>",
        ].join("\n"),
        parse_mode: "HTML",
      });
      return res.status(200).json({ ok: true, binding: false, ambiguous: true, sent: Boolean(sent.ok) });
    }
    if (!entity) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: `${bindingRequest.type === "union" ? "Союз" : bindingRequest.type === "club" ? "Клуб" : "Клуб или союз"} «${bindingRequest.query}» не найден в актуальном отчёте.` });
      return res.status(200).json({ ok: true, binding: false, found: false, sent: Boolean(sent.ok) });
    }
    const binding = isUnion
      ? { type: "union", leagueId: String(entity.id), league: entity.name, boundBy: String(message.from.id), boundAt: new Date().toISOString() }
      : { type: "club", clubId: String(entity.id), club: entity.name, boundBy: String(message.from.id), boundAt: new Date().toISOString() };
    const saved = await setClubBinding(chatId, binding);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: saved
        ? `Группа привязана к ${isUnion ? "союзу" : "клубу"} «${escapeTelegramHtml(entity.name)}» (${entity.id}). Теперь бот показывает здесь только его данные. Отправьте /команды.`
        : "Не удалось сохранить постоянную привязку: Redis недоступен или не настроен. Попробуйте ещё раз позже.",
      parse_mode: "HTML",
    });
    return res.status(200).json({ ok: true, binding: saved, type: binding.type, ...(isUnion ? { leagueId: String(entity.id) } : { clubId: String(entity.id) }), sent: Boolean(sent.ok) });
  }

  let clubBinding = await getClubBinding(chatId);
  if (clubBinding && isMainReportChat(chatId) && !clubBinding.balanceOnly) {
    await deleteClubBinding(chatId);
    clubBinding = null;
  }
  if (isBindingStatusCommand(message.text)) {
    const boundName = clubBinding && (clubBinding.type === "union" ? clubBinding.league : clubBinding.club);
    const boundId = clubBinding && (clubBinding.type === "union" ? clubBinding.leagueId : clubBinding.clubId);
    const text = clubBinding
      ? `Группа привязана к ${clubBinding.type === "union" ? "союзу" : "клубу"} «${boundName}» (${boundId}). Хранилище: ${isRedisConfigured() ? "Redis" : "временная локальная память"}. Автоотчёт: ${clubBinding.autoReport ? "включён" : "выключен"}.`
      : isRedisConfigured()
        ? "Эта группа не привязана к клубу или союзу."
        : "Эта группа не привязана. Redis не настроен, поэтому постоянная привязка сейчас невозможна.";
    const sent = await telegram("sendMessage", { chat_id: chatId, text });
    return res.status(200).json({ ok: true, bindingStatus: true, bound: Boolean(clubBinding), sent: Boolean(sent.ok) });
  }
  if (isClubUnbindCommand(message.text)) {
    if (!clubBinding) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Эта группа не привязана к клубу или союзу." });
      return res.status(200).json({ ok: true, unbound: false, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Отвязать клуб или союз может только администратор этой группы." });
      return res.status(200).json({ ok: true, unbound: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const deleted = await deleteClubBinding(chatId);
    const boundName = clubBinding.type === "union" ? clubBinding.league : clubBinding.club;
    const sent = await telegram("sendMessage", { chat_id: chatId, text: deleted ? `Привязка к «${boundName}» удалена.` : "Не удалось удалить привязку." });
    return res.status(200).json({ ok: true, unbound: deleted, sent: Boolean(sent.ok) });
  }

  const mainPaymentDetailsCommand = parsePaymentDetailsCommand(message.text);
  if (isMainReportChat(chatId) && mainPaymentDetailsCommand) {
    if (mainPaymentDetailsCommand.action !== "list") {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: "В главной группе доступен только просмотр реестра. Размещайте реквизиты в привязанной группе клуба или союза.",
      });
      return res.status(200).json({ ok: true, paymentDetails: false, mainChat: true, sent: Boolean(sent.ok) });
    }
    const sent = await sendPaymentDetailsRegistry(chatId, false);
    return res.status(200).json({ ok: true, paymentDetails: true, mainChat: true, sent });
  }

  // Главные отчётные группы могут иметь привязку для баланса и рассылок,
  // но эта привязка не должна скрывать общую сводку и админские команды.
  const mainBalanceOnlyCommand = Boolean(clubBinding?.balanceOnly && isMainReportChat(chatId)
    && (isBalanceHistoryCommand(message.text) || parseBalanceCommand(message.text)));
  if (clubBinding && (!isMainReportChat(chatId) || mainBalanceOnlyCommand)) {
    const imageGenerationCommand = parseImageGenerationCommand(message.text);
    if (imageGenerationCommand) {
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Генерировать картинки может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      if (!imageGenerationCommand.valid) {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: "Добавьте описание длиной от 3 до 700 символов. Например:\n/сделать Афиша вечернего турнира в неоновом стиле",
        });
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: false, invalid: true, sent: Boolean(sent.ok) });
      }
      if (!OPENAI_API_KEY) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Генерация изображений пока не настроена: отсутствует OPENAI_API_KEY." });
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: false, unconfigured: true, sent: Boolean(sent.ok) });
      }
      const lock = await redisPipeline(
        [["SET", imageGenerationLockKey(chatId), "1", "NX", "EX", "60"]],
        { context: "telegram-report.image-generation.lock", timeoutMs: 2000 },
      );
      if (lock?.[0]?.result !== "OK") {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Предыдущая генерация ещё выполняется. Попробуйте снова через минуту." });
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: false, busy: true, sent: Boolean(sent.ok) });
      }
      const entityName = clubBinding.type === "union" ? clubBinding.league : clubBinding.club;
      const progress = await telegram("sendMessage", { chat_id: chatId, text: `Создаю картинку для «${entityName}»…` });
      try {
        const image = await generateBoundEntityImage(imageGenerationCommand.description, entityName);
        const sent = await sendGeneratedTelegramPhoto(chatId, image, `Создано для «${entityName}»`);
        if (progress.result?.message_id) await telegram("deleteMessage", { chat_id: chatId, message_id: progress.result.message_id });
        if (!sent.ok) throw new Error(sent.description || "Telegram sendPhoto failed");
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: true, sent: true });
      } catch (error) {
        await redisPipeline([["DEL", imageGenerationLockKey(chatId)]], { context: "telegram-report.image-generation.unlock", timeoutMs: 2000 });
        console.error("telegram-report-webhook: image generation failed", error?.message || error);
        const errorText = "Не удалось создать картинку. Попробуйте ещё раз позже.";
        if (progress.result?.message_id) {
          await telegram("editMessageText", { chat_id: chatId, message_id: progress.result.message_id, text: errorText });
        } else {
          await telegram("sendMessage", { chat_id: chatId, text: errorText });
        }
        return res.status(200).json({ ok: true, clubMode: true, imageGeneration: false, error: true });
      }
    }
    if (isPaymentDetailsRemoveCommand(message.text)) {
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Убирать реквизиты может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      const ownOpen = (await listPaymentDetails()).filter((item) => item.status === "open" && String(item.owner?.chatId) === chatId);
      if (!ownOpen.length) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "У этой группы нет открытых реквизитов, которые можно убрать." });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: true, removable: 0, sent: Boolean(sent.ok) });
      }
      const lines = ["<b>Какие реквизиты убрать?</b>", ""];
      ownOpen.forEach((item, index) => {
        const bank = String(item.details || "").split(/\r?\n/u).map((part) => part.trim()).filter(Boolean)[1] || "—";
        lines.push(`${index + 1}. <b>${formatPaymentAmount(item)}</b> · ${escapeTelegramHtml(bank)}`);
      });
      const buttons = ownOpen.map((item, index) => [{
        text: `Убрать ${index + 1} · ${formatPaymentAmount(item)}`,
        callback_data: `payreq:remove:${item.id}`,
      }]);
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: buttons },
      });
      return res.status(200).json({ ok: true, clubMode: true, paymentDetails: true, removable: ownOpen.length, sent: Boolean(sent.ok) });
    }
    if (isPaymentNotificationsCommand(message.text)) {
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Настраивать уведомления может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, paymentNotifications: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: "О каких новых реквизитах уведомлять эту группу?",
        reply_markup: {
          inline_keyboard: [
            [{ text: "До 5 000 ₽", callback_data: "paynotify:set:under5000" }],
            [{ text: "От 5 000 ₽", callback_data: "paynotify:set:from5000" }],
            [{ text: "И те и те", callback_data: "paynotify:set:all" }],
            [{ text: "Выключить", callback_data: "paynotify:set:off" }],
          ],
        },
      });
      return res.status(200).json({ ok: true, clubMode: true, paymentNotifications: true, sent: Boolean(sent.ok) });
    }
    let paymentDetailsCommand = parsePaymentDetailsCommand(message.text);
    let paymentDetailsFormReply = false;
    if (!paymentDetailsCommand && !String(message.text || "").trim().startsWith("/") && isRedisConfigured()) {
      const placement = await redisPipeline(
        [["GET", paymentDetailsPlacementKey(chatId)]],
        { context: "telegram-report.payment-details.placement.get", timeoutMs: 2000 },
      );
      if (String(placement?.[0]?.result || "") === String(message.from?.id || "")) {
        paymentDetailsCommand = parsePaymentDetailsCommand(`/разместить\n${message.text}`);
        paymentDetailsFormReply = true;
      }
    }
    if (paymentDetailsCommand) {
      if (paymentDetailsCommand.action === "list") {
        const sent = await sendPaymentDetailsRegistry(chatId);
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: true, sent });
      }
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Размещать и удалять реквизиты может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      if (paymentDetailsCommand.action === "prompt") {
        await redisPipeline(
          [["SET", paymentDetailsPlacementKey(chatId), String(message.from?.id || ""), "EX", "600"]],
          { context: "telegram-report.payment-details.placement.set", timeoutMs: 2000 },
        );
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: paymentDetailsFormText(),
          reply_to_message_id: message.message_id,
          reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Введите реквизиты" },
        });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: true, prompt: true, sent: Boolean(sent.ok) });
      }
      if (paymentDetailsCommand.action === "invalid") {
        await redisPipeline(
          [["SET", paymentDetailsPlacementKey(chatId), String(message.from?.id || ""), "EX", "600"]],
          { context: "telegram-report.payment-details.placement.retry", timeoutMs: 2000 },
        );
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: paymentDetailsFormText(true),
          reply_to_message_id: message.message_id,
          reply_markup: { force_reply: true, selective: true, input_field_placeholder: "Введите реквизиты" },
        });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: false, invalid: true, sent: Boolean(sent.ok) });
      }
      if (paymentDetailsCommand.action === "remove") {
        const currentItems = await listPaymentDetails();
        const ownActive = currentItems.filter((item) => String(item.owner?.chatId) === chatId && ["open", "claimed", "awaiting_receipt", "paid"].includes(item.status));
        if (ownActive.some((item) => item.status !== "open")) {
          const sent = await telegram("sendMessage", { chat_id: chatId, text: "Нельзя удалить заявку, которую уже взяли в работу или отметили оплаченной." });
          return res.status(200).json({ ok: true, clubMode: true, paymentDetails: false, busy: true, sent: Boolean(sent.ok) });
        }
        await Promise.all(ownActive.map(async (item) => { item.status = "cancelled"; item.cancelledAt = new Date().toISOString(); await savePaymentDetails(item); }));
        const sent = await telegram("sendMessage", { chat_id: chatId, text: ownActive.length ? "Реквизиты сняты с публикации." : "У этой группы нет активных реквизитов." });
        return res.status(200).json({ ok: true, clubMode: true, paymentDetails: true, removed: ownActive.length, sent: Boolean(sent.ok) });
      }
      const owner = { ...paymentEntity(clubBinding), chatId };
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const item = {
        id,
        owner,
        amountCents: paymentDetailsCommand.amountCents,
        currency: paymentDetailsCommand.currency,
        details: paymentDetailsCommand.details,
        status: "open",
        createdAt: new Date().toISOString(),
        createdBy: String(message.from?.id || ""),
      };
      const saved = await savePaymentDetails(item);
      if (saved) await redisPipeline([
        ["LPUSH", PAYMENT_DETAILS_INDEX_KEY, id],
        ["LTRIM", PAYMENT_DETAILS_INDEX_KEY, "0", "199"],
        ["DEL", paymentDetailsPlacementKey(chatId)],
      ], { context: "telegram-report.payment-details.publish", timeoutMs: 2000 });
      const notified = saved ? await broadcastPaymentDetailsNotification(item) : 0;
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: saved
          ? `<b>Реквизиты опубликованы</b>\n\nСумма: <b>${formatPaymentAmount(item)}</b>\n${escapeTelegramHtml(item.details)}\n\nДругие клубы и союзы увидят заявку по /реквизиты.`
          : "Не удалось опубликовать реквизиты.",
        parse_mode: "HTML",
      });
      return res.status(200).json({ ok: true, clubMode: true, paymentDetails: saved, formReply: paymentDetailsFormReply, notified, sent: Boolean(sent.ok) });
    }
    if (isPaymentConfirmCommand(message.text)) {
      const pending = (await listPaymentDetails()).filter((item) => item.status === "paid" && String(item.owner?.chatId) === chatId);
      if (!pending.length) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Нет поступлений, ожидающих подтверждения." });
        return res.status(200).json({ ok: true, clubMode: true, paymentConfirm: true, pending: 0, sent: Boolean(sent.ok) });
      }
      for (const item of pending) {
        await notifyPaymentParty(chatId, `<b>${escapeTelegramHtml(item.payer?.name || "Плательщик")}</b> сообщил об оплате <b>${formatPaymentAmount(item)}</b>.`, [[
          { text: "Подтвердить", callback_data: `payreq:confirm:${item.id}` },
          { text: "Не поступило", callback_data: `payreq:reject:${item.id}` },
        ]]);
      }
      return res.status(200).json({ ok: true, clubMode: true, paymentConfirm: true, pending: pending.length, sent: true });
    }
    if (isBalanceHistoryCommand(message.text)) {
      const sent = await sendChatBalanceHistory(chatId, clubBinding);
      return res.status(200).json({ ok: true, clubMode: true, balanceHistory: true, sent });
    }
    const balanceCommand = parseBalanceCommand(message.text);
    if (balanceCommand) {
      if (balanceCommand.action === "show") {
        const sent = await sendChatBalance(chatId, clubBinding);
        return res.status(200).json({ ok: true, clubMode: true, balance: true, sent });
      }
      if (balanceCommand.action === "ambiguous") {
        if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
          const sent = await telegram("sendMessage", { chat_id: chatId, text: "Изменять баланс может только администратор этой группы." });
          return res.status(200).json({ ok: true, clubMode: true, balance: false, forbidden: true, sent: Boolean(sent.ok) });
        }
        const current = await getChatBalance(chatId);
        if (current.cents == null && current.usdCents == null) {
          const sent = await telegram("sendMessage", { chat_id: chatId, text: "Сначала укажите валюту: /баланс 50р или /баланс 50$" });
          return res.status(200).json({ ok: true, clubMode: true, balance: false, currencyRequired: true, sent: Boolean(sent.ok) });
        }
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: `Что сделать с суммой ${formatRake(balanceCommand.cents / 100)}?`,
          reply_markup: {
            inline_keyboard: [[
              { text: "➕ Добавить", callback_data: `balance:op:add:${balanceCommand.cents}` },
              { text: "➖ Отнять", callback_data: `balance:op:subtract:${balanceCommand.cents}` },
            ]],
          },
        });
        return res.status(200).json({ ok: true, clubMode: true, balance: true, choice: "operation", sent: Boolean(sent.ok) });
      }
      if (balanceCommand.action === "invalid") {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Укажите валюту: /баланс 300р, 40$, /баланс +50$ или /баланс -100р. Можно указать несколько сумм: /баланс -79000р +5000р -1500р комментарий" });
        return res.status(200).json({ ok: true, clubMode: true, balance: false, invalid: true, sent: Boolean(sent.ok) });
      }
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Изменять баланс может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, balance: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      const changed = await changeChatBalance(chatId, balanceCommand, message.from, clubBinding);
      const formatChange = (change, symbol) => !change ? null : change.action === "adjust"
        ? `${change.cents >= 0 ? "+" : ""}${formatRake(change.cents / 100)} ${symbol}`
        : `установлен ${formatRake(change.cents / 100)} ${symbol}`;
      const operations = [formatChange(balanceCommand.rub, "₽"), formatChange(balanceCommand.usd, "$")].filter(Boolean).join(", ");
      const balances = changed ? [
        changed.cents == null ? null : formatBalanceAmount(changed.cents, "₽"),
        changed.usdCents == null ? null : formatBalanceAmount(changed.usdCents, "$"),
      ].filter(Boolean).join("\n") : "";
      const balanceOwner = formatBalanceOwner(clubBinding);
      const commentLine = changed?.comment ? `\nКомментарий: ${escapeTelegramHtml(changed.comment)}` : "";
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: changed
          ? `${operations} — изменение баланса\nДата и время: ${formatBalanceTimestamp(changed.timestamp)}${commentLine}\n\n<b>Текущий ${balanceOwner}:</b>\n${balances}`
          : "Не удалось сохранить баланс: Redis недоступен или не настроен.",
        parse_mode: "HTML",
      });
      return res.status(200).json({ ok: true, clubMode: true, balance: Boolean(changed), sent: Boolean(sent.ok) });
    }
    const autoReportCommand = parseAutoReportCommand(message.text);
    if (autoReportCommand) {
      if (["964699", "577707", "190714"].includes(String(clubBinding.clubId)) && autoReportCommand === "вкл") {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Автоотчёт для этого клуба отключён в настройках главной бухгалтерии." });
        return res.status(200).json({ ok: true, clubMode: true, autoReport: false, blocked: true, sent: Boolean(sent.ok) });
      }
      if (clubBinding.manual && autoReportCommand === "вкл") {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: "Автоотчёт нельзя включить для ручного клуба. Сначала привяжите группу к клубу из Excel: /привязать клуб ID",
        });
        return res.status(200).json({ ok: true, clubMode: true, autoReport: false, manualClub: true, sent: Boolean(sent.ok) });
      }
      if (autoReportCommand !== "статус" && !await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Менять автоотчёт может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, autoReport: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      if (autoReportCommand !== "статус") {
        clubBinding = { ...clubBinding, autoReport: autoReportCommand === "вкл" };
        const saved = await setClubBinding(chatId, clubBinding);
        if (!saved) {
          const sent = await telegram("sendMessage", { chat_id: chatId, text: "Не удалось сохранить настройку автоотчёта." });
          return res.status(200).json({ ok: true, clubMode: true, autoReport: false, saved: false, sent: Boolean(sent.ok) });
        }
      }
      const sent = await telegram("sendMessage", { chat_id: chatId, text: `Автоотчёт: ${clubBinding.autoReport ? "включён" : "выключен"}.` });
      return res.status(200).json({ ok: true, clubMode: true, autoReport: Boolean(clubBinding.autoReport), sent: Boolean(sent.ok) });
    }
    if (isCommandsCommand(message.text)) {
      const sent = await sendBoundClubCommands(chatId, clubBinding);
      return res.status(200).json({ ok: true, clubMode: true, commands: true, sent });
    }
    const liveTablesCommand = parseLiveTablesCommand(message.text);
    if (liveTablesCommand) {
      const sent = await sendLiveTables(chatId, message.message_id, liveTablesCommand);
      return res.status(200).json({ ok: true, clubMode: true, liveTables: liveTablesCommand, sent });
    }
    if (isCurrentClubCommand(message.text)) {
      const sent = await sendCurrentBoundClub(chatId, clubBinding);
      return res.status(200).json({ ok: true, clubMode: true, report: true, sent });
    }
    if (clubBinding.type === "union" && isBoundUnionTotalCommand(message.text)) {
      const sent = await sendBoundUnionTotal(chatId, clubBinding);
      return res.status(200).json({ ok: true, clubMode: true, unionTotal: true, sent });
    }
    const boundClubTop = clubBinding.type === "union" ? parseClubTopCommand(message.text) : null;
    if (boundClubTop) {
      const sent = await sendBoundUnionClubTop(chatId, clubBinding, boundClubTop);
      return res.status(200).json({ ok: true, clubMode: true, unionClubTop: boundClubTop, sent });
    }
    const boundUnionClubInfo = clubBinding.type === "union" ? parseUnionClubInfoCommand(message.text) : null;
    if (boundUnionClubInfo) {
      const sent = await sendBoundUnionClubInfo(chatId, message.message_id, clubBinding, boundUnionClubInfo);
      return res.status(200).json({ ok: true, clubMode: true, unionClubInfo: boundUnionClubInfo, sent });
    }
    const boundUnionSelection = clubBinding.type === "union" ? parseUnionPeriodSuffix(message.text) : null;
    if (boundUnionSelection && isBoundUnionClubsCommand(boundUnionSelection.text)) {
      if (!boundUnionSelection.data?.leaguePlayerTops) {
        const sent = await telegram("sendMessage", {
          chat_id: chatId,
          text: boundUnionSelection.requested
            ? `Детализация клубов за период ${boundUnionSelection.label} не найдена.`
            : "Детализация клубов за последнюю неделю не найдена.",
        });
        return res.status(200).json({ ok: true, clubMode: true, unionClubs: true, found: false, sent: Boolean(sent.ok) });
      }
      const sent = await sendBoundUnionClubs(chatId, clubBinding, boundUnionSelection.data);
      return res.status(200).json({ ok: true, clubMode: true, unionClubs: true, found: true, sent });
    }
    const boundPlayersCommand = parsePlayersCommand(message.text);
    if (boundPlayersCommand) {
      const sent = clubBinding.type === "union"
        ? await sendBoundUnionPlayerTops(chatId, clubBinding, boundPlayersCommand)
        : await sendBoundClubPlayerTops(chatId, clubBinding, boundPlayersCommand);
      return res.status(200).json({ ok: true, clubMode: true, [clubBinding.type === "union" ? "unionPlayers" : "clubPlayers"]: boundPlayersCommand, sent });
    }
    const boundPlayerQuery = parseEntityCommand(message.text, "игрок");
    if (boundPlayerQuery) {
      const sent = clubBinding.type === "union"
        ? await sendBoundUnionPlayerProfile(chatId, clubBinding, boundPlayerQuery)
        : await sendBoundClubPlayerProfile(chatId, clubBinding, boundPlayerQuery);
      return res.status(200).json({ ok: true, clubMode: true, [clubBinding.type === "union" ? "unionPlayer" : "clubPlayer"]: boundPlayerQuery, sent });
    }
    if (!String(message.text || "").trim().startsWith("/")) {
      return res.status(200).json({ ok: true, clubMode: true, ignored: true });
    }
    if (clubBinding.type === "union" || (!parseTotalCommand(message.text) && !parseReportPeriod(message.text))) {
      const boundName = clubBinding.type === "union" ? clubBinding.league : clubBinding.club;
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: `В этой группе доступна только статистика ${clubBinding.type === "union" ? "союза" : "клуба"} «${boundName}». Отправьте /команды.`,
      });
      return res.status(200).json({ ok: true, clubMode: true, restricted: true, sent: Boolean(sent.ok) });
    }
  }

  if (isRecordBalancesCommand(message.text)) {
    if (isAntiregReportChat(chatId)) {
      return res.status(200).json({ ok: true, balancesRecorded: false, disabled: true });
    }
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /записать доступна только в главной группе «Отчёты Два Туза»." });
      return res.status(200).json({ ok: true, balancesRecorded: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Отметить операции записанными может только администратор группы." });
      return res.status(200).json({ ok: true, balancesRecorded: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Операции недоступны: Redis не настроен." });
      return res.status(200).json({ ok: true, balancesRecorded: false, sent: Boolean(sent.ok) });
    }
    const recorded = await redisPipeline([
      ["LLEN", UNRECORDED_BALANCE_OPERATIONS_KEY],
      ["DEL", UNRECORDED_BALANCE_OPERATIONS_KEY],
    ], { context: "telegram-report.balances.record", timeoutMs: 2000 });
    const count = Number(recorded?.[0]?.result || 0);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: count
        ? `Записано операций: ${count}. Новые операции будут отображаться в разделе «Не записано».`
        : "Незаписанных операций нет. Новые операции будут отображаться в разделе «Не записано».",
      reply_to_message_id: message.message_id,
    });
    return res.status(200).json({ ok: true, balancesRecorded: true, count, sent: Boolean(sent.ok) });
  }

  if (isBalancesCommand(message.text)) {
    if (isAntiregReportChat(chatId)) {
      return res.status(200).json({ ok: true, balances: false, disabled: true });
    }
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /балансы доступна только в главной группе «Отчёты Два Туза»." });
      return res.status(200).json({ ok: true, balances: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const sent = await sendAllChatBalances(chatId, message.message_id);
    return res.status(200).json({ ok: true, balances: true, sent });
  }

  if (isDiamondSalesCommand(message.text)) {
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /алмазы доступна только в главной группе." });
      return res.status(200).json({ ok: true, diamondSales: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Указать сумму продажи алмазов может только администратор группы." });
      return res.status(200).json({ ok: true, diamondSales: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Учёт продажи алмазов недоступен: Redis не настроен." });
      return res.status(200).json({ ok: true, diamondSales: false, sent: Boolean(sent.ok) });
    }
    await redisPipeline(
      [["SET", diamondSalesPendingKey(chatId, message.from?.id), "1", "EX", "600"]],
      { context: "telegram-report.diamond-sales.pending.set", timeoutMs: 2000 },
    );
    const prompt = await telegram("sendMessage", {
      chat_id: chatId,
      text: "На какую сумму продано алмазов?\n\nВведите только сумму, например: 50000. Если продаж не было — 0. Новая сумма заменит ранее указанную за текущую отчётную неделю.\n\nДля отмены: /отмена",
      reply_to_message_id: message.message_id,
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "0" },
    });
    return res.status(200).json({ ok: true, diamondSales: true, sent: Boolean(prompt.ok) });
  }

  if (isRomanTotalCommand(message.text)) {
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /итого Роман доступна только в главной группе." });
      return res.status(200).json({ ok: true, romanTotal: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Фиксировать итог Романа может только администратор группы." });
      return res.status(200).json({ ok: true, romanTotal: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    if (!isRedisConfigured()) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Итог Романа недоступен: Redis не настроен." });
      return res.status(200).json({ ok: true, romanTotal: false, sent: Boolean(sent.ok) });
    }
    await redisPipeline(
      [["SET", romanTotalPendingKey(chatId, message.from?.id), JSON.stringify({ stage: "vika", vikaCents: 0 }), "EX", "600"]],
      { context: "telegram-report.roman-total.pending.set", timeoutMs: 2000 },
    );
    const prompt = await telegram("sendMessage", {
      chat_id: chatId,
      text: "Сколько отправила Вика?\n\nВведите только сумму, например: 50000. Если ничего не отправляла — 0.\n\nДля отмены: /отмена",
      reply_to_message_id: message.message_id,
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: "0" },
    });
    const sent = Boolean(prompt.ok);
    return res.status(200).json({ ok: true, romanTotal: true, sent });
  }

  if (isTransferBalancesCommand(message.text)) {
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /переводы доступна только в главной группе «Отчёты Два Туза»." });
      return res.status(200).json({ ok: true, transferBalances: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const sent = await sendAllPaymentBalances(chatId, message.message_id);
    return res.status(200).json({ ok: true, transferBalances: true, sent });
  }

  const liveTablesCommand = parseLiveTablesCommand(message.text);
  if (liveTablesCommand) {
    const sent = await sendLiveTables(chatId, message.message_id, liveTablesCommand);
    return res.status(200).json({ ok: true, liveTables: liveTablesCommand, sent });
  }

  const unionSelection = parseUnionPeriodSuffix(message.text);
  const unionText = unionSelection.text;
  const unionData = unionSelection.data;

  if (isPeriodCommand(unionText)) {
    if (unionSelection.requested && !unionData) {
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: `Статистика за период ${unionSelection.label} не найдена. Отправьте /период, чтобы увидеть доступные недели.`,
        reply_to_message_id: message.message_id,
      });
      return res.status(200).json({ ok: true, period: true, found: false, sent: Boolean(sent.ok) });
    }
    const sent = await sendPeriod(chatId, message.message_id, unionSelection);
    return res.status(200).json({ ok: true, period: true, found: true, sent });
  }

  const isUnionCommand = isActivityCommand(unionText) || isRakeSummaryCommand(unionText) || isGamesCommand(unionText) ||
    isCalculationsCommand(unionText) || isUnionsCommand(unionText) || isUnionTotalsCommand(unionText) ||
    isClubsCommand(unionText) || isClubTotalsCommand(unionText) ||
    isChineseCommand(unionText) ||
    isShareCommand(unionText) ||
    isOverviewCommand(unionText) ||
    isKickbacksCommand(unionText) ||
    isJackpotCommand(unionText) || isOverlaysCommand(unionText) || Boolean(parsePlayersCommand(unionText)) ||
    Boolean(parseEntityCommand(unionText, "клуб")) || Boolean(parseEntityCommand(unionText, "игрок"));
  if (unionSelection.requested && isUnionCommand && !unionData) {
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: `Статистика за период ${unionSelection.label} не найдена. Отправьте /период, чтобы увидеть доступные недели.`,
      reply_to_message_id: message.message_id,
    });
    return res.status(200).json({ ok: true, found: false, sent: Boolean(sent.ok) });
  }

  if (isActivityCommand(unionText)) {
    const sent = await sendActivity(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, activity: true, sent });
  }

  const clubQuery = parseEntityCommand(unionText, "клуб");
  if (clubQuery) {
    const sent = await sendClubProfile(chatId, message.message_id, clubQuery, unionData);
    return res.status(200).json({ ok: true, club: true, sent });
  }

  const playerQuery = parseEntityCommand(unionText, "игрок");
  if (playerQuery) {
    const sent = await sendPlayerProfile(chatId, message.message_id, playerQuery, unionData);
    return res.status(200).json({ ok: true, player: true, sent });
  }

  const playersCommand = parsePlayersCommand(unionText);
  if (playersCommand) {
    const sent = await sendPlayerTops(chatId, message.message_id, playersCommand, unionData);
    return res.status(200).json({ ok: true, players: playersCommand, sent });
  }

  if (isJackpotCommand(unionText)) {
    const sent = await sendJackpot(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, jackpot: true, sent });
  }

  if (isCalculationsCommand(unionText)) {
    const sent = await sendCalculations(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, calculations: true, sent });
  }

  if (isUnionsCommand(unionText)) {
    const stopGeneration = await getChatStopGeneration(chatId);
    await markChatCommandActive(chatId);
    let sent;
    try {
      sent = await sendUnionReports(chatId, message.message_id, unionData, stopGeneration);
    } finally {
      await clearChatCommandActive(chatId);
    }
    return res.status(200).json({ ok: true, unions: true, sent });
  }

  if (isUnionTotalsCommand(unionText)) {
    const sent = await sendUnionTotals(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, unionTotals: true, sent });
  }

  if (isClubsCommand(unionText)) {
    if (!await claimClubBroadcast(update, message)) {
      return res.status(200).json({ ok: true, clubs: true, duplicate: true });
    }
    const stopGeneration = await getChatStopGeneration(chatId);
    await markChatCommandActive(chatId);
    let sent;
    try {
      sent = await sendClubReports(chatId, message.message_id, unionData, stopGeneration);
    } finally {
      await clearChatCommandActive(chatId);
    }
    return res.status(200).json({ ok: true, clubs: true, sent });
  }

  if (isClubTotalsCommand(unionText)) {
    const sent = await sendClubTotals(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, clubTotals: true, sent });
  }

  if (isChineseCommand(unionText)) {
    const sent = await sendChineseRake(chatId, unionData);
    return res.status(200).json({ ok: true, chinese: true, sent });
  }

  if (isShareCommand(unionText)) {
    const sent = await sendShareDistribution(chatId, unionData);
    return res.status(200).json({ ok: true, share: true, sent });
  }

  if (isOverviewCommand(unionText)) {
    const sent = await sendOverview(chatId, unionData);
    return res.status(200).json({ ok: true, summary: true, sent });
  }

  if (isKickbacksCommand(unionText)) {
    const sent = await sendKickbacks(chatId, unionData);
    return res.status(200).json({ ok: true, kickbacks: true, sent });
  }

  if (isGamesCommand(unionText)) {
    const sent = await sendGames(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, games: true, sent });
  }

  if (isOverlaysCommand(unionText)) {
    const sent = await sendOverlays(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, overlays: true, sent });
  }

  if (isCommandsCommand(message.text)) {
    const sent = await sendCommands(chatId, message.message_id);
    return res.status(200).json({ ok: true, commands: true, sent });
  }

  if (isRakeSummaryCommand(unionText)) {
    const sent = await sendRakeSummary(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, summary: true, sent });
  }

  const totalCommand = parseTotalCommand(message.text);
  if (totalCommand) {
    const servicePercent = DEFAULT_SERVICE_PERCENT;
    const sent = await sendTotal(chatId, message.message_id, totalCommand, servicePercent, clubBinding?.clubId || null);
    return res.status(200).json({ ok: true, total: true, sent });
  }

  const period = parseReportPeriod(message.text);
  if (!period) return res.status(200).json({ ok: true });

  const storedReport = findReport(chatId, period, clubBinding?.clubId || null);
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
