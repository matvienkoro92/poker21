const reportIndex = require("../../data/prepared-reports.json");
const unionMemberRakeSummary = require("../../data/union-member-rake-summary.json");
const unionOverlaySummary = require("../../data/union-overlay-summary.json");
const unionGameRakeSummary = require("../../data/union-game-rake-summary.json");
const unionJackpotSummary = require("../../data/union-jackpot-summary.json");
const unionPlayerTops = require("../../data/union-player-tops.json");
const unionDirectory = require("../../data/union-directory.json");
const unionActivitySummary = require("../../data/union-activity-summary.json");
const unionLeagueReports = require("../../data/union-league-reports.json");
const unionPeriods = require("../../data/union-periods.json");

const latestUnionData = {
  directory: unionDirectory,
  memberRake: unionMemberRakeSummary,
  games: unionGameRakeSummary,
  overlays: unionOverlaySummary,
  jackpot: unionJackpotSummary,
  playerTops: unionPlayerTops,
  activity: unionActivitySummary,
  leagueReports: unionLeagueReports,
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

function isSummaryCommand(text) {
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

async function sendUnionReports(chatId, messageId, data = latestUnionData) {
  const payload = data.leagueReports || {};
  const reports = Array.isArray(payload.reports) ? payload.reports : [];
  let allSent = reports.length > 0;
  const romanLeagueNames = ["VAULT 13", "Rbpoker", "QUASAR", "PPCUNION", "ONL YSTARS", "Ginger", "BRO.POKER", "Bambuk", "AF UNION"];
  const reportByName = new Map(reports.map((report) => [String(report.league || "").toLowerCase(), report]));
  const romanReports = romanLeagueNames.map((name) => reportByName.get(name.toLowerCase())).filter(Boolean);
  const ilyaReports = [reportByName.get("jokers")].filter(Boolean);
  const assignedReports = new Set([...romanReports, ...ilyaReports]);
  const sergeyReports = reports.filter((report) => !assignedReports.has(report));
  const groups = [
    { heading: "❗ ДЛЯ РОМАНА:", reports: romanReports },
    { heading: "❗ ДЛЯ СЕРГЕЯ:", reports: sergeyReports },
    { heading: "❗ ДЛЯ ИЛЬИ:", reports: ilyaReports },
  ];
  for (const [groupIndex, group] of groups.entries()) {
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
  return allSent;
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
    "<b>/рейк клубов</b> — клубы по рейку за подготовленную неделю",
    "<b>/игры</b> — весь рейк союза и рейк по видам игр",
    "<b>/джекпот</b> — все сборы и выплаты джекпота",
    "<b>/расчеты</b> — win/lose, fee, джекпот, оверлей и итог",
    "<b>/союзы</b> — отдельный отчёт и картинка по каждому союзу",
    "<b>/оверлеи</b> — оверлеи турниров по убыванию",
    "<b>/игроки рейк</b> — топ-10 игроков по рейку",
    "<b>/игроки минус</b> — топ-10 игроков по проигрышу",
    "<b>/игроки плюс</b> — топ-10 игроков по выигрышу",
    "<b>/клуб Два Туза</b> — подробная сводка клуба; можно указать ID",
    "<b>/игрок 230740</b> — профиль игрока по ID или части ника",
    "<b>/активность</b> — активные игроки, игры, раздачи и рейк на игрока",
    "<b>/период 20.07-26.07</b> — проверить доступность недели",
    "К любой команде статистики можно добавить период, например: <code>/игры 20.07-26.07</code>",
    "",
    "<b>/отчет 13.07-19.07</b> — отчёт за указанный период",
    "<b>/отчет прошлая неделя</b> — отчёт за прошлую неделю",
    "<b>/отчет позапрошлая неделя</b> — отчёт за позапрошлую неделю",
    "",
    "<b>/итого за 3 недели</b> — итог за несколько предыдущих недель (от 1 до 52)",
    "<b>/итого за месяц</b> — итог за прошлый календарный месяц",
    "<b>/итого за лето</b> — итог за последний сезон; также: осень, зима, весна",
    "<b>/итого за все время</b> — итог по всем подготовленным отчётам",
    "",
    "<b>/команды</b> — показать эту справку",
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

  const isUnionCommand = isActivityCommand(unionText) || isSummaryCommand(unionText) || isGamesCommand(unionText) ||
    isCalculationsCommand(unionText) || isUnionsCommand(unionText) ||
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
    const sent = await sendUnionReports(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, unions: true, sent });
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

  if (isSummaryCommand(unionText)) {
    const sent = await sendRakeSummary(chatId, message.message_id, unionData);
    return res.status(200).json({ ok: true, summary: true, sent });
  }

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
