"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const Tesseract = require("tesseract.js");

const BINDING_PREFIX = "poker21:telegram-report:club-chat:";
const BRO_POKER_LEAGUE_ID = "538879";
const BALANCE_HISTORY_KEY = "poker21:telegram-report:balance-operations:unrecorded";
const REPORT_PREFIX = "poker21:bro-poker-report:";
const BATCH_PREFIX = "poker21:bro-poker-batch:";
const REPORT_DESTINATION_ALIASES = new Map([
  ["bluffcatcher", "Пент"],
  ["kings ko", "Кингс ко"],
]);
const SOURCE_ONLY_CLUBS = new Set(["два туза x"]);

function normalizeName(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/[._-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function destinationName(club) {
  return REPORT_DESTINATION_ALIASES.get(normalizeName(club)) || club;
}

function batchId(chatId, period, firstMessageId) {
  return crypto.createHash("sha256").update(`${chatId}:${period}:${firstMessageId}`).digest("hex").slice(0, 20);
}

function batchKey(id) { return `${BATCH_PREFIX}${id}`; }

async function chooseBatchId({ chatId, period, messageId, redisPipeline }) {
  const activeKey = `${BATCH_PREFIX}active:${chatId}:${crypto.createHash("sha256").update(period).digest("hex").slice(0, 12)}`;
  const candidate = batchId(chatId, period, messageId);
  const script = `
    local current = redis.call('GET', KEYS[1])
    if current then
      local status = redis.call('GET', ARGV[1] .. current .. ':status')
      if status ~= 'done' and status ~= 'rejected' and status ~= 'processing' then return current end
    end
    redis.call('SET', KEYS[1], ARGV[2], 'EX', 604800)
    return ARGV[2]
  `;
  const rows = await redisPipeline([["EVAL", script, "1", activeKey, BATCH_PREFIX, candidate]], {
    context: "bro-poker-image-router.batch.choose", timeoutMs: 2500,
  });
  return String(rows?.[0]?.result || "");
}

function isBroPokerSource(chat, binding) {
  if (binding?.type === "union" && String(binding.leagueId) === BRO_POKER_LEAGUE_ID) return true;
  const title = normalizeName(chat?.title);
  return title === "bro poker" || title === "бро покер";
}

async function scanBindings(redisPipeline) {
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const rows = await redisPipeline([["SCAN", cursor, "MATCH", `${BINDING_PREFIX}*`, "COUNT", "100"]], {
      context: "bro-poker-image-router.bindings.scan", timeoutMs: 4000,
    });
    const result = rows?.[0]?.result;
    if (!Array.isArray(result) || result.length < 2) break;
    cursor = String(result[0] || "0");
    if (Array.isArray(result[1])) keys.push(...result[1].map(String));
    if (cursor === "0") break;
  }
  if (!keys.length) return [];
  const values = await redisPipeline(keys.map((key) => ["GET", key]), {
    context: "bro-poker-image-router.bindings.get", timeoutMs: 4000,
  });
  return keys.flatMap((key, index) => {
    try {
      const binding = JSON.parse(String(values?.[index]?.result || ""));
      if (binding?.type !== "club" || !binding.club) return [];
      return [{ chatId: key.slice(BINDING_PREFIX.length), binding }];
    } catch (_) {
      return [];
    }
  });
}

function imageFileId(message) {
  if (Array.isArray(message?.photo) && message.photo.length) return message.photo.at(-1)?.file_id || "";
  if (String(message?.document?.mime_type || "").startsWith("image/")) return message.document.file_id || "";
  return "";
}

function parseAmount(value) {
  const normalized = String(value ?? "").replace(/[\s\u00a0\u202f₽]/g, "").replace(/−/g, "-").replace(",", ".");
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}

function isMonday(now = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Novosibirsk", weekday: "short" }).format(now) === "Mon";
}

async function recognizeClub({ fileId, clubNames, telegram, fetchImpl, botToken }) {
  const file = await telegram("getFile", { file_id: fileId });
  if (!file?.ok || !file.result?.file_path) throw new Error(file?.description || "Telegram file is unavailable");
  const downloaded = await fetchImpl(`https://api.telegram.org/file/bot${botToken}/${file.result.file_path}`);
  if (!downloaded.ok) throw new Error(`Image download failed: ${downloaded.status}`);
  const bytes = Buffer.from(await downloaded.arrayBuffer());
  const { data, info } = await sharp(bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
  const bands = [];
  for (let y = 0; y < info.height; y += 1) {
    let dark = 0;
    for (let x = 0; x < info.width; x += 1) if (data[y * info.width + x] < 70) dark += 1;
    if (dark / info.width > 0.55) {
      if (bands.length && bands.at(-1)[1] === y - 1) bands.at(-1)[1] = y;
      else bands.push([y, y]);
    }
  }
  if (bands.length < 6) return { notReport: true };
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "bro-poker-ocr-"));
  let worker;
  try {
    await Promise.all(["eng", "rus"].map(async (lang) => {
      const source = require.resolve(`@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`);
      await fs.copyFile(source, path.join(tempDir, `${lang}.traineddata.gz`));
    }));
    worker = await Tesseract.createWorker(["eng", "rus"], Tesseract.OEM.LSTM_ONLY,
      { langPath: tempDir, cachePath: tempDir });
    await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_LINE });
    const readRow = async (before, after) => {
      const top = bands[before][1] + 2;
      const bottom = bands[after][0] - 2;
      const left = Math.round(info.width * 0.47);
      if (bottom <= top || left >= info.width - 4) return null;
      const width = info.width - left - 4;
      const cropped = await sharp(bytes).extract({ left, top, width, height: bottom - top })
        .resize({ width: Math.max(width, 1200) }).greyscale().normalise().sharpen().png().toBuffer();
      return (await worker.recognize(cropped)).data;
    };
    const clubResult = await readRow(0, 1);
    const periodResult = await readRow(3, 4);
    const totalResult = await readRow(bands.length - 2, bands.length - 1);
    if (!clubResult || !periodResult || !totalResult
      || Math.min(clubResult.confidence, totalResult.confidence) < 80
      || periodResult.confidence < 65) return null;
    const clubText = normalizeName(clubResult.text);
    const club = clubNames.find((name) => clubText === normalizeName(name));
    const period = periodResult.text.match(/\d{2}\.\d{2}\.\d{4}\s*[-–]\s*\d{2}\.\d{2}\.\d{4}/)?.[0]?.replace(/\s/g, "");
    const amount = totalResult.text.match(/[-−]?\s*\d[\d\s.,]*/)?.[0]?.trim();
    const totalCents = parseAmount(amount);
    if (!club || !period || totalCents === null) return null;
    return { club, totalCents, period };
  } finally {
    await worker?.terminate();
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function reportKey(sourceChatId, messageId) {
  return `${REPORT_PREFIX}${sourceChatId}:${messageId}`;
}

function formatRub(cents) {
  return `${(Number(cents) / 100).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₽`;
}

async function applyBalance({ redisPipeline, chatId, binding, totalCents, reportId, period }) {
  const timestamp = new Date().toISOString();
  const actor = `Расчёт BRO.POKER ${period || ""}`.trim();
  const script = `
    if redis.call('EXISTS', KEYS[1]) == 1 then return {0, redis.call('GET', KEYS[2]) or '0'} end
    local balance = redis.call('INCRBY', KEYS[2], ARGV[1])
    local entry = cjson.encode({rub={action='adjust',cents=tonumber(ARGV[1])},usd=cjson.null,cents=balance,usdCents=cjson.null,actor=ARGV[2],timestamp=ARGV[3],comment=ARGV[4]})
    local operation = cjson.encode({rub={action='adjust',cents=tonumber(ARGV[1])},usd=cjson.null,cents=balance,usdCents=cjson.null,actor=ARGV[2],timestamp=ARGV[3],comment=ARGV[4],chatId=ARGV[5],type=ARGV[6],name=ARGV[7]})
    redis.call('LPUSH', KEYS[3], entry)
    redis.call('LPUSH', KEYS[4], operation)
    redis.call('SET', KEYS[1], '1')
    return {1, balance}
  `;
  const rows = await redisPipeline([["EVAL", script, "4",
    `${REPORT_PREFIX}balance:${reportId}:${chatId}`,
    `poker21:telegram-report:chat-balance:${chatId}`,
    `poker21:telegram-report:chat-balance-history:${chatId}`,
    BALANCE_HISTORY_KEY,
    String(totalCents), actor, timestamp, `Скриншот ${reportId}`, String(chatId),
    binding?.type === "union" ? "union" : "club",
    binding?.type === "union" ? String(binding.league || "BRO.POKER") : String(binding?.club || ""),
  ]], { context: "bro-poker-image-router.balance", timeoutMs: 4000 });
  if (!Array.isArray(rows?.[0]?.result)) throw new Error("Balance update failed");
  return { applied: Number(rows[0].result[0]) === 1, cents: Number(rows[0].result[1]) };
}

async function sendBalanceNotice({ telegram, redisPipeline, chatId, reportId, text }) {
  const key = `${REPORT_PREFIX}balance-notice:${reportId}:${chatId}`;
  const rows = await redisPipeline([["GET", key]], { context: "bro-poker-image-router.notice.get", timeoutMs: 2500 });
  if (rows?.[0]?.result) return;
  const sent = await telegram("sendMessage", { chat_id: chatId, text });
  if (!sent?.ok) throw new Error(sent?.description || "Balance notice failed");
  await redisPipeline([["SET", key, String(sent.result?.message_id || "1")]], {
    context: "bro-poker-image-router.notice.set", timeoutMs: 2500,
  });
}

async function dispatchReport({ report, telegram, redisPipeline, sourceBinding, skipSourceBalance = false }) {
  const reportId = `${report.sourceChatId}:${report.messageId}`;
  const results = [];
  for (const target of report.targets) {
    const copiedKey = `${REPORT_PREFIX}copied:${reportId}:${target.chatId}`;
    const status = await redisPipeline([["GET", copiedKey]], { context: "bro-poker-image-router.copied.get", timeoutMs: 2500 });
    let copied = Boolean(status?.[0]?.result);
    if (!copied) {
      const sent = await telegram("copyMessage", {
        chat_id: target.chatId, from_chat_id: report.sourceChatId, message_id: report.messageId,
      });
      if (!sent?.ok) {
        results.push({ chatId: target.chatId, ok: false, error: sent?.description || "Telegram error" });
        continue;
      }
      const recorded = await redisPipeline([["SET", copiedKey, String(sent.result?.message_id || "1")]], { context: "bro-poker-image-router.copied.set", timeoutMs: 2500 });
      if (recorded?.[0]?.result !== "OK") throw new Error("Copied message could not be recorded");
      copied = true;
    }
    const balance = await applyBalance({ redisPipeline, chatId: target.chatId, binding: target.binding,
      totalCents: report.totalCents, reportId, period: report.period });
    await sendBalanceNotice({ telegram, redisPipeline, chatId: target.chatId, reportId,
      text: `Расчёт ${report.club}: ${formatRub(report.totalCents)}\nТекущий баланс: ${formatRub(balance.cents)}` });
    results.push({ chatId: target.chatId, ok: true, copied, balanceApplied: balance.applied });
  }
  if (!skipSourceBalance && results.some((row) => row.ok)) {
    const balance = await applyBalance({ redisPipeline, chatId: report.sourceChatId,
      binding: sourceBinding || { type: "union", league: "BRO.POKER" }, totalCents: report.totalCents, reportId, period: report.period });
    await sendBalanceNotice({ telegram, redisPipeline, chatId: report.sourceChatId, reportId,
      text: `${report.club}: ${formatRub(report.totalCents)} учтено в балансе BRO.POKER.\nТекущий баланс: ${formatRub(balance.cents)}` });
  }
  return { handled: true, routed: results.some((row) => row.ok), club: report.club,
    totalCents: report.totalCents, targets: results };
}

async function decideReport({ sourceChatId, messageId, approved, telegram, redisPipeline, sourceBinding }) {
  const key = reportKey(sourceChatId, messageId);
  const rows = await redisPipeline([["GET", key]], { context: "bro-poker-image-router.pending.get", timeoutMs: 2500 });
  let report;
  try { report = JSON.parse(String(rows?.[0]?.result || "")); } catch (_) { return { handled: true, missing: true }; }
  if (report.status === "approved" && approved) return dispatchReport({ report, telegram, redisPipeline, sourceBinding });
  if (report.status !== "pending") return { handled: true, duplicate: true };
  const decisionKey = `${REPORT_PREFIX}decision:${sourceChatId}:${messageId}`;
  const claimed = await redisPipeline([["SET", decisionKey, approved ? "approved" : "rejected", "NX"]], {
    context: "bro-poker-image-router.decision.claim", timeoutMs: 2500,
  });
  if (claimed?.[0]?.result !== "OK") return { handled: true, duplicate: true };
  if (!approved) {
    await redisPipeline([["SET", key, JSON.stringify({ ...report, status: "rejected" })]], { context: "bro-poker-image-router.reject", timeoutMs: 2500 });
    return { handled: true, rejected: true };
  }
  await redisPipeline([["SET", key, JSON.stringify({ ...report, status: "approved" })]], { context: "bro-poker-image-router.approve", timeoutMs: 2500 });
  return dispatchReport({ report, telegram, redisPipeline, sourceBinding });
}

async function flushBroPokerBatch({ id, approved = false, rejected = false, now = new Date(), telegram, redisPipeline, sourceBinding, expectedSourceChatId }) {
  if (!/^[a-f0-9]{20}$/.test(String(id || ""))) return { handled: false, reason: "invalid-batch" };
  const base = batchKey(id);
  const rows = await redisPipeline([
    ["GET", `${base}:last`], ["ZRANGE", `${base}:messages`, "0", "-1"],
    ["GET", `${base}:status`], ["GET", `${base}:source`],
  ], { context: "bro-poker-image-router.batch.read", timeoutMs: 4000 });
  const last = Number(rows?.[0]?.result);
  const messageIds = rows?.[1]?.result;
  const status = String(rows?.[2]?.result || "");
  const sourceChatId = String(rows?.[3]?.result || "");
  if (!last || !sourceChatId || !Array.isArray(messageIds) || !messageIds.length) return { handled: false, reason: "empty-batch" };
  if (expectedSourceChatId && sourceChatId !== String(expectedSourceChatId)) return { handled: false, reason: "wrong-source" };
  if (status === "done" || status === "rejected") return { handled: true, duplicate: true };
  if (rejected) {
    await redisPipeline([["SET", `${base}:status`, "rejected"]], { context: "bro-poker-image-router.batch.reject", timeoutMs: 2500 });
    return { handled: true, rejected: true };
  }
  const idRows = await redisPipeline(messageIds.map((messageId) => ["GET", reportKey(sourceChatId, messageId)]), {
    context: "bro-poker-image-router.batch.reports", timeoutMs: 4000,
  });
  const reports = idRows.map((row) => { try { return JSON.parse(String(row?.result || "")); } catch (_) { return null; } });
  if (reports.some((report) => !report || report.batchId !== id)) return { handled: false, reason: "missing-report" };
  const unbound = reports.filter((report) => !report.sourceOnly && !report.targets?.length).map((report) => report.club);
  if (unbound.length) {
    const notice = await redisPipeline([["SET", `${base}:unbound-notified`, "1", "NX", "EX", "604800"]], {
      context: "bro-poker-image-router.batch.unbound", timeoutMs: 2500,
    });
    if (notice?.[0]?.result === "OK") await telegram("sendMessage", {
      chat_id: reports[0].sourceChatId,
      text: `Пакет расчётов остановлен: не найдены группы для ${[...new Set(unbound)].join(", ")}. Балансы не изменены.`,
    });
    return { handled: true, blocked: true, unbound };
  }
  if (!approved && !isMonday(now)) {
    if (status !== "pending") {
      const sent = await telegram("sendMessage", {
        chat_id: reports[0].sourceChatId,
        text: `Пакет из ${reports.length} отчётов готов. Итог: ${formatRub(reports.reduce((sum, report) => sum + report.totalCents, 0))}. Сейчас не понедельник. Разрешить рассылку и изменение балансов?`,
        reply_markup: { inline_keyboard: [[
          { text: "✅ Разрешить", callback_data: `brobatch:approve:${id}` },
          { text: "❌ Отклонить", callback_data: `brobatch:reject:${id}` },
        ]] },
      });
      if (!sent?.ok) throw new Error(sent?.description || "Batch approval request failed");
      await redisPipeline([["SET", `${base}:status`, "pending"]], { context: "bro-poker-image-router.batch.pending", timeoutMs: 2500 });
    }
    return { handled: true, pending: true, count: reports.length };
  }
  const claimScript = `
    if redis.call('GET', KEYS[1]) ~= ARGV[1] then return 0 end
    if redis.call('GET', KEYS[2]) == 'done' or redis.call('GET', KEYS[2]) == 'rejected' then return 0 end
    if not redis.call('SET', KEYS[3], '1', 'NX', 'EX', 600) then return 0 end
    redis.call('SET', KEYS[2], 'processing')
    return 1
  `;
  const claim = await redisPipeline([["EVAL", claimScript, "3", `${base}:last`, `${base}:status`, `${base}:processing`, String(last)]], {
    context: "bro-poker-image-router.batch.claim", timeoutMs: 2500,
  });
  if (Number(claim?.[0]?.result) !== 1) return { handled: true, processing: true };
  try {
    const results = [];
    for (const report of reports) {
      if (report.sourceOnly) {
        results.push({ handled: true, sourceOnly: true, club: report.club, targets: [] });
        continue;
      }
      const result = await dispatchReport({ report, telegram, redisPipeline, sourceBinding, skipSourceBalance: true });
      results.push(result);
      if (result.targets.some((target) => !target.ok)) throw new Error(`Delivery failed for ${report.club}`);
    }
    const totalCents = reports.reduce((sum, report) => sum + report.totalCents, 0);
    const balance = await applyBalance({ redisPipeline, chatId: sourceChatId,
      binding: sourceBinding || { type: "union", league: "BRO.POKER" }, totalCents, reportId: `batch:${id}`,
      period: reports[0].period });
    await sendBalanceNotice({ telegram, redisPipeline, chatId: sourceChatId, reportId: `batch:${id}`,
      text: [`Расчёт BRO.POKER за ${reports[0].period}:`,
        ...reports.map((report) => `${report.club}: ${formatRub(report.totalCents)}`),
        `Итого: ${formatRub(totalCents)}`,
        `Текущий баланс: ${formatRub(balance.cents)}`].join("\n") });
    await redisPipeline([["SET", `${base}:status`, "done"]], { context: "bro-poker-image-router.batch.done", timeoutMs: 2500 });
    return { handled: true, routed: true, count: reports.length, totalCents, results };
  } finally {
    await redisPipeline([["DEL", `${base}:processing`], ["GET", `${base}:status`]], {
      context: "bro-poker-image-router.batch.unlock", timeoutMs: 2500,
    }).then(async (rows) => {
      if (rows?.[1]?.result === "processing") await redisPipeline([["SET", `${base}:status`, "open"]], {
        context: "bro-poker-image-router.batch.retryable", timeoutMs: 2500,
      });
    });
  }
}

async function routeBroPokerImage(options) {
  const { message, sourceBinding, telegram, redisPipeline, redisConfigured, botToken } = options;
  const fileId = imageFileId(message);
  if (!fileId || !isBroPokerSource(message?.chat, sourceBinding)) return { handled: false };
  if (!redisConfigured) return { handled: true, routed: false, reason: "storage" };

  const lockKey = reportKey(message.chat.id, message.message_id);
  const claimed = await redisPipeline([["SET", lockKey, "1", "NX", "EX", "86400"]], {
    context: "bro-poker-image-router.claim", timeoutMs: 2500,
  });
  if (claimed?.[0]?.result !== "OK") {
    const rows = await redisPipeline([["GET", lockKey]], { context: "bro-poker-image-router.report.get", timeoutMs: 2500 });
    try {
      const report = JSON.parse(String(rows?.[0]?.result || ""));
      if (report.status === "approved") return dispatchReport({ report, telegram, redisPipeline, sourceBinding });
    } catch (_) {}
    return { handled: true, routed: false, duplicate: true };
  }

  const processingKey = `${REPORT_PREFIX}processing:${message.chat.id}:${message.message_id}`;
  try {
    await redisPipeline([["SET", processingKey, "1", "EX", "120"]],
      { context: "bro-poker-image-router.processing", timeoutMs: 2500 });
    const bindings = (await scanBindings(redisPipeline)).filter((row) => row.chatId !== String(message.chat.id));
    const clubNames = [...new Set([
      ...bindings.map((row) => String(row.binding.club).trim()).filter(Boolean),
      ...REPORT_DESTINATION_ALIASES.keys(),
      ...SOURCE_ONLY_CLUBS,
    ])];
    if (!clubNames.length) return { handled: true, routed: false, reason: "no-destinations" };
    const recognized = await (options.recognizeClub || recognizeClub)({
      fileId, clubNames, telegram, fetchImpl: options.fetchImpl || fetch,
      botToken,
    });
    if (recognized?.notReport) return { handled: true, routed: false, reason: "not-a-report" };
    if (!recognized) {
      await redisPipeline([["SADD", `${REPORT_PREFIX}unreadable:${message.chat.id}`, String(message.message_id)],
        ["EXPIRE", `${REPORT_PREFIX}unreadable:${message.chat.id}`, "604800"]],
        { context: "bro-poker-image-router.unreadable", timeoutMs: 2500 });
      return { handled: true, routed: false, reason: "report-not-recognized" };
    }
    const destination = destinationName(recognized.club);
    const sourceOnly = SOURCE_ONLY_CLUBS.has(normalizeName(recognized.club));
    const targets = sourceOnly ? [] : bindings.filter((row) => normalizeName(row.binding.club) === normalizeName(destination));
    const id = await (options.chooseBatchId || chooseBatchId)({ chatId: message.chat.id,
      period: recognized.period, messageId: message.message_id, redisPipeline });
    const report = { sourceChatId: String(message.chat.id), messageId: message.message_id,
      ...recognized, targets, sourceOnly, batchId: id, status: "staged" };
    const saved = await redisPipeline([["SET", lockKey, JSON.stringify(report)]], { context: "bro-poker-image-router.report.set", timeoutMs: 2500 });
    if (saved?.[0]?.result !== "OK") throw new Error("Recognized report could not be recorded");
    const receivedAt = (options.now || new Date()).getTime();
    await redisPipeline([
      ["ZADD", `${batchKey(id)}:messages`, String(message.message_id), String(message.message_id)],
      ["SET", `${batchKey(id)}:last`, String(receivedAt)],
      ["SET", `${batchKey(id)}:source`, String(message.chat.id)],
      ["SET", `${batchKey(id)}:status`, "open"],
      ["EXPIRE", `${batchKey(id)}:messages`, "604800"],
      ["EXPIRE", `${batchKey(id)}:last`, "604800"],
      ["EXPIRE", `${batchKey(id)}:source`, "604800"],
    ], { context: "bro-poker-image-router.stage", timeoutMs: 2500 });
    return { handled: true, routed: false, staged: true, batchId: id, club: report.club, totalCents: report.totalCents };
  } catch (error) {
    await redisPipeline([["SADD", `${REPORT_PREFIX}unreadable:${message.chat.id}`, String(message.message_id)],
      ["EXPIRE", `${REPORT_PREFIX}unreadable:${message.chat.id}`, "604800"]],
      { context: "bro-poker-image-router.unreadable-error", timeoutMs: 2500 }).catch(() => {});
    await redisPipeline([["DEL", lockKey]], { context: "bro-poker-image-router.release", timeoutMs: 2500 }).catch(() => {});
    return { handled: true, routed: false, reason: "error", error: error?.message || String(error) };
  } finally {
    await redisPipeline([["DEL", processingKey]], { context: "bro-poker-image-router.processing.done", timeoutMs: 2500 }).catch(() => {});
  }
}

async function countBroPokerReports({ chatId, sourceBinding, telegram, redisPipeline, now = new Date() }) {
  const processingRows = await redisPipeline([["SCAN", "0", "MATCH", `${REPORT_PREFIX}processing:${chatId}:*`, "COUNT", "100"]],
    { context: "bro-poker-image-router.processing.scan", timeoutMs: 2500 });
  if (processingRows?.[0]?.result?.[1]?.length) {
    await telegram("sendMessage", { chat_id: chatId,
      text: "Скриншоты ещё распознаются. Повторите /посчитать через несколько секунд; балансы не изменены." });
    return { handled: true, waiting: true };
  }
  const unreadableRows = await redisPipeline([["SMEMBERS", `${REPORT_PREFIX}unreadable:${chatId}`]],
    { context: "bro-poker-image-router.unreadable.read", timeoutMs: 2500 });
  const unreadable = unreadableRows?.[0]?.result || [];
  if (unreadable.length) {
    await telegram("sendMessage", { chat_id: chatId,
      text: `Расчёт остановлен: не удалось прочитать скриншоты с ID сообщений ${unreadable.join(", ")}. Ничего не отправлено, балансы не изменены.` });
    return { handled: true, blocked: true, unreadable };
  }
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const rows = await redisPipeline([["SCAN", cursor, "MATCH", `${BATCH_PREFIX}active:${chatId}:*`, "COUNT", "100"]],
      { context: "bro-poker-image-router.active.scan", timeoutMs: 4000 });
    const result = rows?.[0]?.result;
    if (!Array.isArray(result)) break;
    cursor = String(result[0] || "0");
    if (Array.isArray(result[1])) keys.push(...result[1]);
    if (cursor === "0") break;
  }
  if (!keys.length) return { handled: true, empty: true };
  const ids = await redisPipeline(keys.map((key) => ["GET", key]),
    { context: "bro-poker-image-router.active.get", timeoutMs: 4000 });
  const results = [];
  for (const id of [...new Set(ids.map((row) => String(row?.result || "")).filter(Boolean))]) {
    const result = await flushBroPokerBatch({ id, now, telegram, redisPipeline, sourceBinding, expectedSourceChatId: chatId });
    results.push({ id, ...result });
  }
  return { handled: true, results };
}

module.exports = { BRO_POKER_LEAGUE_ID, countBroPokerReports, decideReport, destinationName,
  flushBroPokerBatch, imageFileId, isBroPokerSource, isMonday, normalizeName, parseAmount,
  recognizeClub, routeBroPokerImage };
