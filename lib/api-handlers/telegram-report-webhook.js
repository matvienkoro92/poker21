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
const unionLeagueReports = require("../../data/union-league-reports.json");
const unionClubReports = require("../../data/union-club-reports.json");
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
const APP_ORIGIN = "https://poker21-app.vercel.app";
const REPORT_FILES_ORIGIN = "https://raw.githubusercontent.com/matvienkoro92/poker21/main";
// Меняется вручную в коде и применяется ко всем отчётам.
const DEFAULT_SERVICE_PERCENT = 8;
const MAIN_REPORT_CHAT_IDS = new Set(["-1004391487736", "-1004472155269"]);
const processedClubBroadcasts = new Map();
const clubChatBindings = new Map();
const chatBalances = new Map();
const chatStopGenerations = new Map();
const activeChatCommands = new Set();

function allowEphemeralClubBindings() {
  return !process.env.VERCEL && process.env.NODE_ENV !== "production";
}

function isMainReportChat(chatId) {
  return MAIN_REPORT_CHAT_IDS.has(String(chatId));
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

function chatStopKey(chatId) {
  return `poker21:telegram-report:stop-generation:${chatId}`;
}

function chatActiveCommandKey(chatId) {
  return `poker21:telegram-report:active-command:${chatId}`;
}

function isStopCommand(text) {
  return /^\/(?:стоп|stop)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
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

function parseBalanceCommand(text) {
  const match = String(text || "").trim().match(/^\/баланс(?:@[A-Za-z0-9_]+)?(?:\s+(.+?))?\s*$/iu);
  if (!match) return null;
  if (!match[1]) return { action: "show" };
  const payload = match[1].trim();
  const numberOnly = payload.replace(/[\s\u00a0\u202f]/g, "");
  if (/^\d+(?:[.,]\d{1,2})?$/.test(numberOnly)) {
    return { action: "ambiguous", cents: Math.round(Number(numberOnly.replace(",", ".")) * 100) };
  }
  const valuePattern = /([=]?\s*[+-]?\s*[\d\s\u00a0\u202f]+(?:[.,]\d{1,2})?)\s*(р|руб(?:лей|ля|ль)?|₽|\$|usd|дол(?:лар(?:ов|а)?)?)/giu;
  const currencyCount = (payload.match(/(?:р|руб(?:лей|ля|ль)?|₽|\$|usd|дол(?:лар(?:ов|а)?)?)/giu) || []).length;
  let rub = null;
  let usd = null;
  let valueMatch;
  while ((valueMatch = valuePattern.exec(payload)) !== null) {
    const raw = valueMatch[1].replace(/[\s\u00a0\u202f]/g, "");
    const explicitSet = raw.startsWith("=");
    const numeric = Number((explicitSet ? raw.slice(1) : raw).replace(",", "."));
    if (!Number.isFinite(numeric)) return { action: "invalid" };
    const change = {
      action: currencyCount === 1 && !explicitSet && (raw.startsWith("+") || raw.startsWith("-")) ? "adjust" : "set",
      cents: Math.round(numeric * 100),
    };
    const currency = String(valueMatch[2]).toLowerCase();
    if (currency === "$" || currency === "usd" || currency.startsWith("дол")) {
      if (usd) return { action: "invalid" };
      usd = change;
    } else {
      if (rub) return { action: "invalid" };
      rub = change;
    }
  }
  const unmatched = payload.replace(valuePattern, "").replace(/[,\s\u00a0\u202f]/g, "");
  if (unmatched) return { action: "invalid" };
  if (!rub && !usd) return { action: "invalid" };
  return { action: "change", rub, usd };
}

async function getChatBalance(chatId) {
  if (isRedisConfigured()) {
    const result = await redisPipeline([
      ["GET", chatBalanceKey(chatId)],
      ["GET", chatBalanceUsdKey(chatId)],
      ["LRANGE", chatBalanceHistoryKey(chatId), "0", "4"],
    ], { context: "telegram-report.chat-balance.get", timeoutMs: 2000 });
    const raw = result?.[0]?.result;
    const usdRaw = result?.[1]?.result;
    const history = Array.isArray(result?.[2]?.result)
      ? result[2].result.map((item) => { try { return JSON.parse(String(item)); } catch (_) { return null; } }).filter(Boolean)
      : [];
    return { cents: raw == null ? null : Number(raw), usdCents: usdRaw == null ? null : Number(usdRaw), history };
  }
  return chatBalances.get(String(chatId)) || { cents: null, usdCents: null, history: [] };
}

async function changeChatBalance(chatId, command, user) {
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
    const entry = JSON.stringify({ rub: command.rub, usd: command.usd, cents, usdCents, actor, timestamp });
    await redisPipeline([
      ["LPUSH", chatBalanceHistoryKey(chatId), entry],
      ["LTRIM", chatBalanceHistoryKey(chatId), "0", "19"],
    ], { context: "telegram-report.chat-balance.history", timeoutMs: 2000 });
    return { cents, usdCents, actor, timestamp };
  }
  if (!allowEphemeralClubBindings()) return null;
  const current = chatBalances.get(String(chatId)) || { cents: null, usdCents: null, history: [] };
  const apply = (oldValue, change) => !change ? oldValue : change.action === "adjust" ? Number(oldValue || 0) + change.cents : change.cents;
  const cents = apply(current.cents, command.rub);
  const usdCents = apply(current.usdCents, command.usd);
  const entry = { rub: command.rub, usd: command.usd, cents, usdCents, actor, timestamp };
  chatBalances.set(String(chatId), { cents, usdCents, history: [entry, ...current.history].slice(0, 20) });
  return { cents, usdCents, actor, timestamp };
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

function formatRub(value) {
  return `${Number(value || 0).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

function isRakeSummaryCommand(text) {
  return /^\/рейк(?:@[A-Za-z0-9_]+)?\s+клубов\s*$/iu.test(String(text || "").trim());
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

function isClubTotalsCommand(text) {
  return /^\/(?:клубы|clubs)(?:@[A-Za-z0-9_]+)?\s+(?:итого|total)\s*$/iu.test(String(text || "").trim());
}

function isChineseCommand(text) {
  return /^\/(?:китайцы|chinese)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function isShareCommand(text) {
  return /^\/(?:доля|share)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
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

function isActivityCommand(text) {
  return /^\/(?:активность|activity)(?:@[A-Za-z0-9_]+)?\s*$/iu.test(String(text || "").trim());
}

function formatInteger(value) {
  return Number(value || 0).toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

function formatActivityTop(title, rows, field, formatter) {
  return [
    "",
    `<b>${title}</b>`,
    ...(Array.isArray(rows) ? rows : []).map((row, index) => `${index + 1}. ${escapeTelegramHtml(row.club)} — ${formatter(row[field])}`),
  ];
}

async function sendActivity(chatId, messageId, data = latestUnionData) {
  const unionActivitySummary = data.activity;
  const lines = [
    "Активность клубов",
    `<b>Период: ${displayIso(unionActivitySummary.startDate)}–${displayIso(unionActivitySummary.endDate)}</b>`,
    "",
    `Активных клубов: ${formatInteger(unionActivitySummary.activeClubs)}`,
    `Активных игроков: ${formatInteger(unionActivitySummary.activePlayers)}`,
    `Игр: ${formatInteger(unionActivitySummary.games)}`,
    `Раздач: ${formatInteger(unionActivitySummary.hands)}`,
    ...formatActivityTop("Топ-10 по активным игрокам", unionActivitySummary.topPlayers, "activePlayers", formatInteger),
    ...formatActivityTop("Топ-10 по играм", unionActivitySummary.topGames, "games", formatInteger),
    ...formatActivityTop("Топ-10 по раздачам", unionActivitySummary.topHands, "hands", formatInteger),
    ...formatActivityTop("Топ-10 по рейку на игрока", unionActivitySummary.topRakePerPlayer, "rakePerPlayer", formatRake),
  ];
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: lines.join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
  return Boolean(sent.ok);
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
  }));
}

async function sendJackpot(chatId, messageId, data = latestUnionData) {
  const unionJackpotSummary = data.jackpot;
  const leagues = adjustedJackpotLeagues(unionJackpotSummary);
  const regularFee = Number(unionJackpotSummary.regularFee || 0);
  const regularPayout = Number(unionJackpotSummary.regularPayout || 0);
  const jackpot21Fee = Number(unionJackpotSummary.jackpot21Fee || 0);
  const jackpot21Payout = Number(unionJackpotSummary.jackpot21Payout || 0);
  const leaguesFee = leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0);
  const totalFee = leagues.length ? leaguesFee : Number(unionJackpotSummary.totalFee ?? (regularFee + jackpot21Fee));
  const unclassifiedFee = totalFee - regularFee - jackpot21Fee;
  const pokerFee = regularFee + unclassifiedFee;
  const pokerNet = pokerFee - regularPayout;
  const jackpot21Net = jackpot21Fee - jackpot21Payout;
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
    const amount = Math.floor(Number(league && league.fee || 0) * rule.exchangeRate * rule.percent / 100 + 1e-9);
    return { ...rule, amount };
  });
  const totalRefunds = refunds.reduce((sum, row) => sum + row.amount, 0);
  const finalPokerNet = pokerNet - totalRefunds;
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
      `Проверка: сумма по лигам ${formatRake(leaguesFee)} = общий джекпот ${formatRake(totalFee)}`,
    );
  }
  lines.push(
    "",
    `Обычный джекпот в лиге Антирег — ${formatRake(regularFee)}`,
    `У остальных лиг — ${formatRake(unclassifiedFee)}`,
    `Выплаты обычного джекпота — ${formatRake(regularPayout)}`,
    `<b>итого джекпот покер: ${formatRake(pokerNet)}</b>`,
    "",
    "Возвраты союзам:",
    ...refunds.map((row) => `${row.label} ${row.percent}% -${formatInteger(row.amount)}`),
    `<b>Всего возвратов: -${formatInteger(totalRefunds)}</b>`,
    "",
    `Jackpot 21 (подтверждено) — ${formatRake(jackpot21Fee)}`,
    `Выплаты Jackpot 21 — ${formatRake(jackpot21Payout)}`,
    `Разница: ${formatRake(jackpot21Net)}`,
    "",
    `<b>Итого джекпот покер: ${formatRake(finalPokerNet)}</b>`,
    `<b>Итого джекпот 21: ${formatRake(jackpot21Net)}</b>`,
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
  const jackpotFee = leagues.length
    ? leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0)
    : Number(summary.totalFee || 0);
  const jackpotPayout = Number(summary.totalPayout || 0);
  const winLose = Number(calculations.winLose || 0);
  const fee = Number(calculations.fee || 0);
  const overlay = Number(calculations.overlay || 0);
  const total = winLose + fee + jackpotFee - jackpotPayout - overlay;
  const lines = [
    "Расчёты суперюниона",
    `<b>Период: ${displayIso(summary.startDate)}–${displayIso(summary.endDate)}</b>`,
    "",
    `Win/lose всех лиг ${formatRake(winLose)}`,
    `Fee всех лиг +<b>${formatRake4(fee)}</b>`,
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

function formatUnionTotals(groups) {
  return groups.filter((group) => group.reports.length > 0).map((group) => {
    const total = group.reports.reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
    const intermediate = group.reports
      .map((report) => `${escapeTelegramHtml(report.league)}: ${formatRakeWhole(report.metrics?.total)}`)
      .join("\n");
    return `<b>${group.recipient}:</b>\n<b>ИТОГО: ${formatRakeWhole(total)}</b>\n${intermediate}`;
  }).join("\n\n");
}

async function sendUnionTotals(chatId, messageId, data = latestUnionData) {
  const { reports, groups } = getUnionReportGroups(data);
  if (reports.length === 0) return false;
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatUnionTotals(groups),
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
      ? await telegram("sendPhoto", {
          chat_id: chatId,
          photo: media[0].media,
          caption: media[0].caption,
          parse_mode: media[0].parse_mode,
        })
      : await telegram("sendMediaGroup", { chat_id: chatId, media });
    allSent = allSent && Boolean(sent.ok);
  }
  if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
  const totalsSent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatUnionTotals(groups),
    parse_mode: "HTML",
  });
  allSent = allSent && Boolean(totalsSent.ok);
  return allSent;
}

function getClubReportGroups(data = latestUnionData) {
  const reports = Array.isArray(data.clubReports?.reports) ? data.clubReports.reports : [];
  const romanClubNames = ["River21", "T O T", "Sibir 70", "Два Туза", "РИВЕР КЛУБ", "Храм", "PC Arena", "GoRiLaZzz", "GARAGE", "RealPokerGame"];
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

function formatClubTotals(groups) {
  return groups.filter((group) => group.reports.length > 0).map((group) => {
    const total = group.reports.reduce((sum, report) => sum + Number(report.metrics?.total || 0), 0);
    const intermediate = group.reports
      .map((report) => `${escapeTelegramHtml(report.club)}: ${formatRakeWhole(report.metrics?.total)}`)
      .join("\n");
    return `<b>${group.recipient}:</b>\n<b>ИТОГО: ${formatRakeWhole(total)}</b>\n${intermediate}`;
  }).join("\n\n");
}

async function sendClubTotals(chatId, messageId, data = latestUnionData) {
  const { reports, groups } = getClubReportGroups(data);
  if (reports.length === 0) return false;
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: formatClubTotals(groups),
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
        ? await telegram("sendPhoto", { chat_id: chatId, photo: chunk[0].media, caption: chunk[0].caption, parse_mode: "HTML" })
        : await telegram("sendMediaGroup", { chat_id: chatId, media: chunk });
      allSent = allSent && Boolean(sent.ok);
    }
  }
  if (await chatCommandWasStopped(chatId, stopGeneration)) return false;
  const totalsSent = await telegram("sendMessage", { chat_id: chatId, text: formatClubTotals(groups), parse_mode: "HTML" });
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

function calculateChineseRake(data = latestUnionData) {
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
  const total = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
  const share = (percent) => roundMoney(total * percent / 100);
  return { rows, totalRake, total, share };
}

async function sendChineseRake(chatId, data = latestUnionData) {
  const { totalRake, total, share } = calculateChineseRake(data);
  const lines = [
    `<b>ИТОГО РЕЙК: ${formatRake(totalRake)}</b>`,
    `<b>ИТОГО ПРОЦЕНТ: ${formatRake(total)}</b>`,
    "",
    `60% Джеку = ${formatRake(share(60))}`,
    `40% наша доля = ${formatRake(share(40))}`,
  ];
  const sent = await telegram("sendPhoto", {
    chat_id: chatId,
    photo: `${APP_ORIGIN}/assets/reports/share/2026-08-03_2026-08-09.png?v=share-table-3`,
    caption: lines.join("\n"),
    parse_mode: "HTML",
  });
  return Boolean(sent.ok);
}

async function sendShareDistribution(chatId, data = latestUnionData) {
  const { totalRake, total, share } = calculateChineseRake(data);
  const lines = [
    `<b>ИТОГО РЕЙК: ${formatRake(totalRake)}</b>`,
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
    photo: `${APP_ORIGIN}/assets/reports/share/2026-08-03_2026-08-09-full.png?v=share-full-1`,
    caption: lines.join("\n"),
    parse_mode: "HTML",
  });
  return Boolean(sent.ok);
}

async function sendOverview(chatId, data = latestUnionData) {
  const { share } = calculateChineseRake(data);
  const jackpot = data.jackpot || {};
  const leagues = adjustedJackpotLeagues(jackpot);
  const jackpotFee = leagues.reduce((sum, row) => sum + Number(row.fee || 0), 0);
  const jackpotPayout = Number(jackpot.totalPayout || 0);
  const refundRules = [
    ["PPCUNION", 50], ["VAULT 13", 70], ["ONL YSTARS", 70],
    ["Rbpoker", 70], ["QUBE", 60], ["AQUARIUM", 50],
  ];
  const refunds = refundRules.reduce((sum, [name, percent]) => {
    const league = leagues.find((row) => String(row.league || "").toLowerCase() === name.toLowerCase());
    return sum + Math.floor(Number(league?.fee || 0) * percent / 100 + 1e-9);
  }, 0);
  const jackpotNet = jackpotFee - jackpotPayout - refunds;
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
  const overviewTotal = share(60) + share(40) + jackpotNet + antiRegClubs + otherUnions + kickbacks - overlay + salaries;
  const lines = [
    "<b>СВОДКА</b>",
    "",
    `1. Доля разработчика (китайцев): <b>${formatRake(share(60))}</b> — /китайцы`,
    `2. Наша доля: <b>${formatRake(share(40))}</b> — /доля`,
    `3. Джекпоты: <b>${formatRake(jackpotNet)}</b> — /джекпот`,
    `4. Клубы нашего союза (Anti-Reg): <b>${formatRake(antiRegClubs)}</b> — /клубы итого`,
    `5. Другие союзы без Anti-Reg: <b>${formatRake(otherUnions)}</b> — /союзы итого`,
    `6. Откаты: <b>+${formatRake(kickbacks)}</b> — /откаты`,
    `7. Оверлей: <b>-${formatRake(overlay)}</b> — /оверлеи`,
    `8. ЗП: <b>+${formatRake(salaries)}</b> — /клубы`,
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
    "",
    ...sections.flatMap((section, index) => index ? ["", section] : [section]),
    "",
    `<b>ВСЕГО ОТКАТОВ: ${formatRake(grandTotal)}</b>`,
  ];
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
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
  const lines = [
    "<b>Доступные команды</b>",
    "",
    "<b>Общая бухгалтерия</b>",
    ...(isMainReportChat(chatId) ? ["<b>/балансы</b> — текущие балансы союзов и клубов"] : []),
    "<b>/сводка</b> — общие итоги по направлениям",
    "<b>/джекпот</b> — все сборы и выплаты джекпота",
    "<b>/расчеты</b> — win/lose, fee, джекпот, оверлей и итог",
    "<b>/китайцы</b> — рейк союзов и расчёт доли",
    "<b>/доля</b> — распределение нашей доли",
    "<b>/откаты</b> — разница клубных процентов выше 8%",
    "<b>/оверлеи</b> — оверлеи турниров по убыванию",
    "",
    "<b>Союзы и клубы</b>",
    "<b>/союзы</b> — отдельный отчёт и картинка по каждому союзу",
    "<b>/союзы итого</b> — только сводка по союзам",
    "<b>/клубы</b> — отдельный отчёт и картинка по каждому клубу",
    "<b>/клубы итого</b> — только сводка по клубам",
    "<b>/рейк клубов</b> — клубы по рейку за подготовленную неделю",
    "<b>/игры</b> — весь рейк союза и рейк по видам игр",
    "<b>/клуб Два Туза</b> — подробная сводка клуба; можно указать ID",
    "",
    "<b>Игроки</b>",
    "<b>/игроки рейк</b> — топ-10 игроков по рейку",
    "<b>/игроки минус</b> — топ-10 игроков по проигрышу",
    "<b>/игроки плюс</b> — топ-10 игроков по выигрышу",
    "<b>/игрок 230740</b> — профиль игрока по ID или части ника",
    "<b>/активность</b> — активные игроки, игры, раздачи и рейк на игрока",
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
    "<b>/стоп</b> — остановить текущую длинную отправку",
    "<b>/привязать клуб Два Туза</b> — закрепить группу за клубом (только администратор)",
    "<b>/привязать союз Anti-Reg</b> — закрепить группу за союзом (только администратор)",
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

async function telegram(method, body) {
  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json().catch(() => ({}));
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

async function sendChatBalance(chatId) {
  const balance = await getChatBalance(chatId);
  const lines = balance.cents == null && balance.usdCents == null
    ? ["<b>Текущий баланс ещё не задан.</b>"]
    : ["<b>Текущий баланс:</b>", ...(balance.cents == null ? [] : [formatBalanceAmount(balance.cents, "₽")]), ...(balance.usdCents == null ? [] : [formatBalanceAmount(balance.usdCents, "$")])];
  if (balance.history.length) {
    lines.push("", "Последние изменения:", ...balance.history.map((entry) => {
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
      return `${changes.join(", ")}${timestamp ? ` — ${timestamp}` : ""} — ${escapeTelegramHtml(entry.actor || "администратор")}`;
    }));
  }
  const sent = await telegram("sendMessage", { chat_id: chatId, text: lines.join("\n"), parse_mode: "HTML" });
  return Boolean(sent.ok);
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
  const unionLines = BALANCE_UNION_ROWS.map((row) => {
    const label = row.bold ? `<b>${escapeTelegramHtml(row.label)}</b>` : escapeTelegramHtml(row.label);
    const balance = balanceFor(row, "union");
    return `${balance.marker} ${label} — ${balance.text}`;
  });
  const clubLines = BALANCE_CLUB_ROWS.map((row) => {
    const balance = balanceFor(row, "club");
    return `${balance.marker} ${escapeTelegramHtml(row.label)} — ${balance.text}`;
  });
  const sent = await telegram("sendMessage", {
    chat_id: chatId,
    text: ["<b>Балансы союзов</b>", "", ...unionLines, "", "<b>Балансы клубов</b>", "", ...clubLines].join("\n"),
    parse_mode: "HTML",
    reply_to_message_id: messageId,
  });
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
      "<b>/баланс 300р, 40$</b> — установить баланс (администратор)",
      "<b>/баланс +500р</b> или <b>/баланс +50$</b> — скорректировать нужную валюту",
      "",
      "<b>Клубы</b>",
      "<b>/клубы_союза</b> — клубы союза и их рейк за последнюю неделю",
      "<b>/клубы_союза 03.08-09.08</b> — клубы и рейк за выбранный период",
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
      "<b>/отвязать</b> — отключить союзный режим (только администратор)",
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
    "<b>/отвязать</b> — отключить клубный режим (только администратор)",
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

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false });
  if (!BOT_TOKEN || !WEBHOOK_SECRET) return res.status(500).json({ ok: false, error: "Bot webhook is not configured" });
  if (req.headers["x-telegram-bot-api-secret-token"] !== WEBHOOK_SECRET) {
    return res.status(403).json({ ok: false });
  }

  const update = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  const callbackQuery = update.callback_query || null;
  const balanceCallback = callbackQuery ? String(callbackQuery.data || "").match(/^balance:(op|apply):(add|subtract)(?::(rub|usd))?:(\d+)$/) : null;
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
  if (isStopCommand(message.text)) {
    const stopped = await stopChatCommands(chatId);
    const sent = await telegram("sendMessage", {
      chat_id: chatId,
      text: stopped ? "⛔ Текущая отправка остановлена." : "Сейчас нет активной отправки.",
    });
    return res.status(200).json({ ok: true, stop: true, stopped, sent: Boolean(sent.ok) });
  }
  const bindingRequest = parseClubBindingCommand(message.text);
  if (bindingRequest) {
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

  if (clubBinding) {
    const balanceCommand = parseBalanceCommand(message.text);
    if (balanceCommand) {
      if (balanceCommand.action === "show") {
        const sent = await sendChatBalance(chatId);
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
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Укажите валюту: /баланс 300р, 40$, /баланс +50$ или /баланс -100р" });
        return res.status(200).json({ ok: true, clubMode: true, balance: false, invalid: true, sent: Boolean(sent.ok) });
      }
      if (!await isTelegramChatAdmin(chatId, message.from?.id)) {
        const sent = await telegram("sendMessage", { chat_id: chatId, text: "Изменять баланс может только администратор этой группы." });
        return res.status(200).json({ ok: true, clubMode: true, balance: false, forbidden: true, sent: Boolean(sent.ok) });
      }
      const changed = await changeChatBalance(chatId, balanceCommand, message.from);
      const formatChange = (change, symbol) => !change ? null : change.action === "adjust"
        ? `${change.cents >= 0 ? "+" : ""}${formatRake(change.cents / 100)} ${symbol}`
        : `установлен ${formatRake(change.cents / 100)} ${symbol}`;
      const operations = [formatChange(balanceCommand.rub, "₽"), formatChange(balanceCommand.usd, "$")].filter(Boolean).join(", ");
      const balances = changed ? [
        changed.cents == null ? null : formatBalanceAmount(changed.cents, "₽"),
        changed.usdCents == null ? null : formatBalanceAmount(changed.usdCents, "$"),
      ].filter(Boolean).join("\n") : "";
      const sent = await telegram("sendMessage", {
        chat_id: chatId,
        text: changed
          ? `${operations} — изменение баланса\nДата и время: ${formatBalanceTimestamp(changed.timestamp)}\n\n<b>Текущий баланс:</b>\n${balances}`
          : "Не удалось сохранить баланс: Redis недоступен или не настроен.",
        parse_mode: "HTML",
      });
      return res.status(200).json({ ok: true, clubMode: true, balance: Boolean(changed), sent: Boolean(sent.ok) });
    }
    const autoReportCommand = parseAutoReportCommand(message.text);
    if (autoReportCommand) {
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

  if (isBalancesCommand(message.text)) {
    if (!isMainReportChat(chatId)) {
      const sent = await telegram("sendMessage", { chat_id: chatId, text: "Команда /балансы доступна только в главной группе «Отчёты Два Туза»." });
      return res.status(200).json({ ok: true, balances: false, forbidden: true, sent: Boolean(sent.ok) });
    }
    const sent = await sendAllChatBalances(chatId, message.message_id);
    return res.status(200).json({ ok: true, balances: true, sent });
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
