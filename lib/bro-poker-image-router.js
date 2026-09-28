"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const https = require("node:https");
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
  ["joker", "Джокер"],
  ["nuts and bluff", "Натс и Блаф"],
  ["collab club", "Коллаб"],
]);
const SOURCE_ONLY_CLUBS = new Set(["два туза x"]);
// Reports forwarded to Poker21 Bro poker on 28.09.2026. Their OCR jobs expired;
// these amounts were verified against the seven original tables.
const RECOVERY_2026_09_28 = new Map([
  ["3812", ["Kings KO", -364266]],
  ["3813", ["Два Туза X", 4070718]],
  ["3814", ["JOKER", -1495524]],
  ["3815", ["Nuts_and_Bluff", -155150]],
  ["3816", ["Collab club", -466275]],
  ["3817", ["BluffCatcher", -471660]],
  ["3818", ["PC Arena", -4909425]],
]);
const RECOVERY_PERIOD = "27.07.2026-02.08.2026";

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
  return title === "bro poker" || title === "бро покер" || title === "poker21 bro poker";
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

async function photoFromReply(message, telegram) {
  const chatId = String(message?.chat?.id || "");
  const reply = message?.reply_to_message;
  const external = message?.external_reply;
  const original = imageFileId(reply) ? reply : imageFileId(external) ? external : null;
  const originalId = Number(reply?.message_id || external?.message_id || 0);
  if (original && originalId) return { ...original, message_id: originalId, chat: message.chat };
  if (!originalId || !chatId || (external?.chat?.id && String(external.chat.id) !== chatId)) return null;

  // Telegram may omit the media of a message sent before the bot became a chat admin.
  // Forward only the requested message briefly to obtain its file_id, then delete the copy.
  const destinations = [String(message.from?.id || ""), chatId].filter(Boolean);
  for (const destination of [...new Set(destinations)]) {
    const forwarded = await telegram("forwardMessage", {
      chat_id: destination, from_chat_id: chatId, message_id: originalId, disable_notification: true,
    });
    if (!forwarded?.ok) continue;
    try {
      if (imageFileId(forwarded.result)) return { ...forwarded.result, message_id: originalId, chat: message.chat };
    } finally {
      if (forwarded.result?.message_id) {
        const deleted = await telegram("deleteMessage", { chat_id: destination, message_id: forwarded.result.message_id });
        if (!deleted?.ok) console.error("bro-poker-image-router: temporary forwarded message could not be deleted", destination);
      }
    }
  }
  return null;
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

async function fetchTelegramFile(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { family: 4, timeout: 20000 }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > 25 * 1024 * 1024) {
          request.destroy(new Error("Telegram image is too large"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const bytes = Buffer.concat(chunks);
        resolve({ ok: response.statusCode >= 200 && response.statusCode < 300,
          status: response.statusCode, arrayBuffer: async () => bytes });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Telegram image download timed out")));
    request.on("error", reject);
  });
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

function formatBalance(cents, showPlus = false) {
  const value = Number(cents || 0);
  const marker = value > 0 ? "🟢" : value < 0 ? "🔴" : "⚪";
  return `${marker} ${showPlus && value > 0 ? "+" : ""}${formatRub(value)}`;
}

function escapeHtml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function balanceNotice({ currentCents, deltaCents, period, label = "отчёт", details = [] }) {
  return [
    ...details.map(escapeHtml),
    ...(details.length ? [""] : []),
    `<b>Предыдущий баланс: ${formatBalance(currentCents - deltaCents)}</b>`,
    "",
    `${formatBalance(deltaCents, true)} — ${escapeHtml(label)} за ${escapeHtml(period)} учтён в балансе`,
    "",
    `<b>${formatBalance(currentCents)} — текущий баланс</b>`,
  ].join("\n");
}

async function applyBalance({ redisPipeline, chatId, binding, totalCents, reportId, period, actor, comment }) {
  const timestamp = new Date().toISOString();
  actor ||= `Расчёт BRO.POKER ${period || ""}`.trim();
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
    String(totalCents), actor, timestamp, comment || `Скриншот ${reportId}`, String(chatId),
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
  const sent = await telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
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
      text: balanceNotice({ currentCents: balance.cents, deltaCents: report.totalCents,
        period: report.period, label: `отчёт ${report.club}` }) });
    results.push({ chatId: target.chatId, ok: true, copied, balanceApplied: balance.applied });
  }
  if (!skipSourceBalance && results.some((row) => row.ok)) {
    const balance = await applyBalance({ redisPipeline, chatId: report.sourceChatId,
      binding: sourceBinding || { type: "union", league: "BRO.POKER" }, totalCents: -report.totalCents, reportId, period: report.period });
    await sendBalanceNotice({ telegram, redisPipeline, chatId: report.sourceChatId, reportId,
      text: balanceNotice({ currentCents: balance.cents, deltaCents: -report.totalCents,
        period: report.period, label: `отчёт ${report.club}` }) });
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
    ["GET", `${base}:status`], ["GET", `${base}:source`], ["GET", `${base}:manual-review`],
  ], { context: "bro-poker-image-router.batch.read", timeoutMs: 4000 });
  const last = Number(rows?.[0]?.result);
  const messageIds = rows?.[1]?.result;
  const status = String(rows?.[2]?.result || "");
  const sourceChatId = String(rows?.[3]?.result || "");
  const manualReview = rows?.[4]?.result === "1";
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
  if (manualReview) {
    const bindings = (await scanBindings(redisPipeline)).filter((row) => row.chatId !== sourceChatId);
    for (const report of reports) {
      if (!report.sourceOnly) report.targets = bindings.filter((row) =>
        normalizeName(row.binding.club) === normalizeName(destinationName(report.club)));
    }
  }
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
  if (!approved && (manualReview || !isMonday(now))) {
    if (status !== "pending") {
      const sent = await telegram("sendMessage", {
        chat_id: reports[0].sourceChatId,
        text: manualReview
          ? [`Восстановлено ${reports.length} отчётов после сбоя распознавания:`,
            ...reports.map((report) => `${report.club}: ${formatRub(report.totalCents)}`),
            `Итого: ${formatRub(reports.reduce((sum, report) => sum + report.totalCents, 0))}`,
            `Изменение баланса BRO.POKER: ${formatRub(-reports.reduce((sum, report) => sum + report.totalCents, 0))}`,
            "Разрешить рассылку и изменение балансов?"].join("\n")
          : `Пакет из ${reports.length} отчётов готов. Итог: ${formatRub(reports.reduce((sum, report) => sum + report.totalCents, 0))}. Сейчас не понедельник. Разрешить рассылку и изменение балансов?`,
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
    await redisPipeline([["SET", `${base}:source-sign`, "counterparty", "EX", "604800"]],
      { context: "bro-poker-image-router.batch.source-sign", timeoutMs: 2500 });
    const balance = await applyBalance({ redisPipeline, chatId: sourceChatId,
      binding: sourceBinding || { type: "union", league: "BRO.POKER" }, totalCents: -totalCents, reportId: `batch:${id}`,
      period: reports[0].period });
    await sendBalanceNotice({ telegram, redisPipeline, chatId: sourceChatId, reportId: `batch:${id}`,
      text: balanceNotice({ currentCents: balance.cents, deltaCents: -totalCents,
        period: reports[0].period, label: "отчёт BRO.POKER",
        details: [`Расчёт BRO.POKER за ${reports[0].period}:`,
          ...reports.map((report) => `${report.club}: ${formatRub(report.totalCents)}`),
          `Итого по скриншотам: ${formatRub(totalCents)}`] }) });
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

async function correctCompletedSourceSign({ id, chatId, sourceBinding, telegram, redisPipeline }) {
  const base = batchKey(id);
  const rows = await redisPipeline([
    ["GET", `${base}:status`], ["GET", `${base}:source`],
    ["GET", `${base}:manual-review`], ["GET", `${base}:source-sign`],
    ["ZRANGE", `${base}:messages`, "0", "-1"],
    ["GET", `${REPORT_PREFIX}balance:batch:${id}:${chatId}`],
  ], { context: "bro-poker-image-router.sign-correction.check", timeoutMs: 4000 });
  const messageIds = rows?.[4]?.result;
  if (rows?.[0]?.result !== "done" || String(rows?.[1]?.result) !== String(chatId)
    || rows?.[2]?.result !== "1" || rows?.[3]?.result === "counterparty"
    || !rows?.[5]?.result || !Array.isArray(messageIds)
    || messageIds.length !== RECOVERY_2026_09_28.size
    || messageIds.some((messageId) => !RECOVERY_2026_09_28.has(String(messageId)))) return null;
  const reports = await redisPipeline(messageIds.map((messageId) => ["GET", reportKey(chatId, messageId)]),
    { context: "bro-poker-image-router.sign-correction.reports", timeoutMs: 4000 });
  const expectedTotalCents = [...RECOVERY_2026_09_28.values()].reduce((sum, row) => sum + row[1], 0);
  const valid = reports.every((row, index) => {
    let report;
    try { report = JSON.parse(String(row?.result || "")); } catch (_) { return false; }
    const expected = RECOVERY_2026_09_28.get(String(messageIds[index]));
    return report.batchId === id && report.club === expected[0]
      && report.totalCents === expected[1] && report.period === RECOVERY_PERIOD;
  });
  if (!valid) return null;
  const correctionCents = -2 * expectedTotalCents;
  const reportId = `batch:${id}:source-sign-correction`;
  const balance = await applyBalance({ redisPipeline, chatId,
    binding: sourceBinding || { type: "union", league: "BRO.POKER" },
    totalCents: correctionCents, reportId, period: RECOVERY_PERIOD,
    actor: `Исправление знака расчёта BRO.POKER ${RECOVERY_PERIOD}`,
    comment: `Коррекция знака пакета ${id}: ${formatRub(expectedTotalCents)} по скриншотам`,
  });
  await sendBalanceNotice({ telegram, redisPipeline, chatId, reportId,
    text: balanceNotice({ currentCents: balance.cents, deltaCents: correctionCents,
      period: RECOVERY_PERIOD, label: "исправление расчёта BRO.POKER",
      details: [`Итог по скриншотам: ${formatRub(expectedTotalCents)}`] }) });
  await redisPipeline([["SET", `${base}:source-sign`, "counterparty", "EX", "604800"]],
    { context: "bro-poker-image-router.sign-correction.done", timeoutMs: 2500 });
  return { handled: true, sourceSignCorrected: true, correctionCents, balanceCents: balance.cents };
}

async function refreshCompletedBalanceNotice({ id, chatId, telegram, redisPipeline }) {
  const base = batchKey(id);
  const noticeKey = `${REPORT_PREFIX}balance-notice:batch:${id}:source-sign-correction:${chatId}`;
  const doneKey = `${noticeKey}:standard-format`;
  const rows = await redisPipeline([
    ["GET", `${base}:status`], ["GET", `${base}:source`],
    ["GET", `${base}:manual-review`], ["GET", `${base}:source-sign`],
    ["GET", noticeKey], ["GET", doneKey], ["ZRANGE", `${base}:messages`, "0", "-1"],
  ], { context: "bro-poker-image-router.notice-refresh.check", timeoutMs: 3000 });
  if (rows?.[0]?.result !== "done" || String(rows?.[1]?.result) !== String(chatId)
    || rows?.[2]?.result !== "1" || rows?.[3]?.result !== "counterparty"
    || rows?.[5]?.result || !Array.isArray(rows?.[6]?.result)
    || rows[6].result.length !== RECOVERY_2026_09_28.size
    || rows[6].result.some((messageId) => !RECOVERY_2026_09_28.has(String(messageId)))) return false;
  const messageId = Number(rows?.[4]?.result);
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return false;
  const sent = await telegram("editMessageText", { chat_id: chatId, message_id: messageId,
    text: balanceNotice({ currentCents: 6436808, deltaCents: 7583164,
      period: RECOVERY_PERIOD, label: "исправление расчёта BRO.POKER",
      details: [`Итог по скриншотам: ${formatRub(-3791582)}`] }), parse_mode: "HTML" });
  if (!sent?.ok && !/message is not modified/i.test(sent?.description || "")) return false;
  await redisPipeline([["SET", doneKey, "1", "EX", "604800"]],
    { context: "bro-poker-image-router.notice-refresh.done", timeoutMs: 2500 });
  return true;
}

async function refreshCompletedClubNotices({ id, chatId, telegram, redisPipeline }) {
  const base = batchKey(id);
  const checks = await redisPipeline([
    ["GET", `${base}:status`], ["GET", `${base}:source`], ["GET", `${base}:manual-review`],
    ["ZRANGE", `${base}:messages`, "0", "-1"],
  ], { context: "bro-poker-image-router.club-notices.check", timeoutMs: 3000 });
  const messageIds = checks?.[3]?.result;
  if (checks?.[0]?.result !== "done" || String(checks?.[1]?.result) !== String(chatId)
    || checks?.[2]?.result !== "1" || !Array.isArray(messageIds)
    || messageIds.length !== RECOVERY_2026_09_28.size
    || messageIds.some((messageId) => !RECOVERY_2026_09_28.has(String(messageId)))) return 0;
  const reports = await redisPipeline(messageIds.map((messageId) => ["GET", reportKey(chatId, messageId)]),
    { context: "bro-poker-image-router.club-notices.reports", timeoutMs: 4000 });
  const bindings = (await scanBindings(redisPipeline)).filter((row) => row.chatId !== String(chatId));
  const updates = [];
  for (let index = 0; index < messageIds.length; index += 1) {
    const messageId = String(messageIds[index]);
    const expected = RECOVERY_2026_09_28.get(messageId);
    let report;
    try { report = JSON.parse(String(reports?.[index]?.result || "")); } catch (_) { continue; }
    if (report?.batchId !== id || report.club !== expected[0]
      || report.totalCents !== expected[1] || report.period !== RECOVERY_PERIOD || report.sourceOnly) continue;
    const targets = bindings.filter((row) => normalizeName(row.binding.club) === normalizeName(destinationName(report.club)));
    for (const target of targets) {
      updates.push((async () => {
        const targetChatId = String(target.chatId);
        const reportId = `${chatId}:${messageId}`;
        const noticeKey = `${REPORT_PREFIX}balance-notice:${reportId}:${targetChatId}`;
        const doneKey = `${noticeKey}:standard-format`;
        const rows = await redisPipeline([
          ["GET", noticeKey], ["GET", doneKey],
          ["LRANGE", `poker21:telegram-report:chat-balance-history:${targetChatId}`, "0", "199"],
        ], { context: "bro-poker-image-router.club-notices.history", timeoutMs: 4000 });
        if (rows?.[1]?.result) return 0;
        const oldMessageId = Number(rows?.[0]?.result);
        if (!Number.isSafeInteger(oldMessageId) || oldMessageId <= 0) return 0;
        const history = Array.isArray(rows?.[2]?.result) ? rows[2].result : [];
        const entry = history.map((value) => { try { return JSON.parse(value); } catch (_) { return null; } })
          .find((value) => value?.comment === `Скриншот ${reportId}`
            && Number(value?.rub?.cents) === report.totalCents);
        if (!entry || !Number.isSafeInteger(Number(entry.cents))) return 0;
        const sent = await telegram("editMessageText", { chat_id: targetChatId, message_id: oldMessageId,
          text: balanceNotice({ currentCents: Number(entry.cents), deltaCents: report.totalCents,
            period: report.period, label: `отчёт ${report.club}` }), parse_mode: "HTML" });
        if (!sent?.ok && !/message is not modified/i.test(sent?.description || "")) return 0;
        await redisPipeline([["SET", doneKey, "1", "EX", "604800"]],
          { context: "bro-poker-image-router.club-notices.done", timeoutMs: 2500 });
        return 1;
      })());
    }
  }
  return (await Promise.all(updates)).reduce((sum, value) => sum + value, 0);
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
      fileId, clubNames, telegram, fetchImpl: options.fetchImpl || fetchTelegramFile,
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

async function countBroPokerReports({ chatId, sourceBinding, sourceTitle, telegram, redisPipeline, now = new Date() }) {
  const scanKeys = async (pattern, context) => {
    let cursor = "0";
    const keys = [];
    for (let page = 0; page < 20; page += 1) {
      const rows = await redisPipeline([["SCAN", cursor, "MATCH", pattern, "COUNT", "100"]],
        { context, timeoutMs: 4000 });
      const result = rows?.[0]?.result;
      if (!Array.isArray(result)) break;
      cursor = String(result[0] || "0");
      if (Array.isArray(result[1])) keys.push(...result[1]);
      if (cursor === "0") break;
    }
    return keys;
  };
  const processing = await scanKeys(`${REPORT_PREFIX}processing:${chatId}:*`, "bro-poker-image-router.processing.scan");
  if (processing.length) {
    await telegram("sendMessage", { chat_id: chatId,
      text: `Скриншоты ещё распознаются (${processing.length}). Если это сообщение повторяется более двух минут, обработка зависла. Балансы не изменены.` });
    return { handled: true, waiting: true };
  }
  const reportKeys = await scanKeys(`${REPORT_PREFIX}${chatId}:*`, "bro-poker-image-router.reports.scan");
  if (reportKeys.length) {
    const rows = await redisPipeline(reportKeys.map((key) => ["GET", key]),
      { context: "bro-poker-image-router.reports.get", timeoutMs: 4000 });
    const stuck = reportKeys.filter((_, index) => rows?.[index]?.result === "1")
      .map((key) => key.slice(`${REPORT_PREFIX}${chatId}:`.length));
    const recoveryKeys = [...RECOVERY_2026_09_28.keys()].map((messageId) => reportKey(chatId, messageId));
    const recoverable = normalizeName(sourceTitle) === "poker21 bro poker"
      && recoveryKeys.every((key) => reportKeys.includes(key))
      && stuck.every((messageId) => RECOVERY_2026_09_28.has(messageId));
    if (recoverable) {
      const reports = new Map(reportKeys.map((key, index) => [key, rows?.[index]?.result]));
      let batchId = "";
      let valid = true;
      for (const [messageId, [club, totalCents]] of RECOVERY_2026_09_28) {
        const raw = reports.get(reportKey(chatId, messageId));
        if (raw === "1") {
          await redisPipeline([["DEL", reportKey(chatId, messageId)]],
            { context: "bro-poker-image-router.recovery.release", timeoutMs: 2500 });
          const staged = await routeBroPokerImage({
            message: { chat: { id: chatId, title: sourceTitle }, message_id: Number(messageId), photo: [{ file_id: "verified-manual-recovery" }] },
            sourceBinding, telegram, redisPipeline, redisConfigured: true,
            recognizeClub: async () => ({ club, totalCents, period: RECOVERY_PERIOD }), now,
          });
          if (!staged.staged) { valid = false; break; }
          batchId = staged.batchId;
        } else {
          let report;
          try { report = JSON.parse(String(raw || "")); } catch (_) {}
          if (report?.club !== club || report?.totalCents !== totalCents || report?.period !== RECOVERY_PERIOD) {
            valid = false; break;
          }
          if (batchId && batchId !== report.batchId) { valid = false; break; }
          batchId = report.batchId;
        }
      }
      if (valid && batchId) {
        await redisPipeline([["SET", `${batchKey(batchId)}:manual-review`, "1", "EX", "604800"]],
          { context: "bro-poker-image-router.recovery.review", timeoutMs: 2500 });
        return countBroPokerReports({ chatId, sourceBinding, sourceTitle: "", telegram, redisPipeline, now });
      }
    }
    if (stuck.length) {
      await telegram("sendMessage", { chat_id: chatId,
        text: `Обработка зависла на фото с ID ${stuck.join(", ")}. Расчёт остановлен, балансы не изменены.` });
      return { handled: true, blocked: true, stuck };
    }
  }
  const unreadableRows = await redisPipeline([["SMEMBERS", `${REPORT_PREFIX}unreadable:${chatId}`]],
    { context: "bro-poker-image-router.unreadable.read", timeoutMs: 2500 });
  const unreadable = unreadableRows?.[0]?.result || [];
  if (unreadable.length) {
    await telegram("sendMessage", { chat_id: chatId,
      text: `Расчёт остановлен: не удалось прочитать скриншоты с ID сообщений ${unreadable.join(", ")}. Ничего не отправлено, балансы не изменены.` });
    return { handled: true, blocked: true, unreadable };
  }
  const keys = await scanKeys(`${BATCH_PREFIX}active:${chatId}:*`, "bro-poker-image-router.active.scan");
  if (!keys.length) return { handled: true, empty: true };
  const ids = await redisPipeline(keys.map((key) => ["GET", key]),
    { context: "bro-poker-image-router.active.get", timeoutMs: 4000 });
  const results = [];
  for (const id of [...new Set(ids.map((row) => String(row?.result || "")).filter(Boolean))]) {
    const result = await flushBroPokerBatch({ id, now, telegram, redisPipeline, sourceBinding, expectedSourceChatId: chatId });
    const corrected = result.duplicate
      ? await correctCompletedSourceSign({ id, chatId, sourceBinding, telegram, redisPipeline }) : null;
    const noticeUpdated = result.duplicate && !corrected
      ? await refreshCompletedBalanceNotice({ id, chatId, telegram, redisPipeline }) : false;
    const clubNoticesUpdated = result.duplicate && !corrected
      ? await refreshCompletedClubNotices({ id, chatId, telegram, redisPipeline }) : 0;
    results.push({ id, ...(corrected || result), ...(noticeUpdated ? { noticeUpdated: true } : {}),
      ...(clubNoticesUpdated ? { clubNoticesUpdated } : {}) });
  }
  return { handled: true, results };
}

async function listBroPokerClubs({ chatId, redisPipeline }) {
  const prefix = `${REPORT_PREFIX}${chatId}:`;
  let cursor = "0";
  const keys = [];
  for (let page = 0; page < 20; page += 1) {
    const rows = await redisPipeline([["SCAN", cursor, "MATCH", `${prefix}*`, "COUNT", "100"]],
      { context: "bro-poker-image-router.clubs.scan", timeoutMs: 4000 });
    const result = rows?.[0]?.result;
    if (!Array.isArray(result)) break;
    cursor = String(result[0] || "0");
    keys.push(...(result[1] || []).filter((key) => /^\d+$/.test(String(key).slice(prefix.length))));
    if (cursor === "0") break;
  }
  const reports = [];
  for (let index = 0; index < keys.length; index += 100) {
    const rows = await redisPipeline(keys.slice(index, index + 100).map((key) => ["GET", key]),
      { context: "bro-poker-image-router.clubs.reports", timeoutMs: 4000 });
    for (const row of rows || []) {
      try {
        const report = JSON.parse(String(row?.result || ""));
        if (String(report.sourceChatId) === String(chatId) && report.batchId && report.club
          && report.period && Number.isSafeInteger(report.totalCents)) reports.push(report);
      } catch (_) {}
    }
  }
  const batchIds = [...new Set(reports.map((report) => report.batchId))];
  const states = batchIds.length ? await redisPipeline(batchIds.map((id) => ["GET", `${batchKey(id)}:status`]),
    { context: "bro-poker-image-router.clubs.status", timeoutMs: 4000 }) : [];
  const completed = new Set(batchIds.filter((_, index) => states?.[index]?.result === "done"));
  const totals = new Map();
  const periods = new Set();
  for (const report of reports) {
    if (!completed.has(report.batchId)) continue;
    const club = destinationName(report.club);
    totals.set(club, (totals.get(club) || 0) + report.totalCents);
    periods.add(report.period);
  }
  if (!totals.size) return "Проведённых расчётов по клубам BRO.POKER пока нет.";
  const balanceRows = await redisPipeline([["GET", `poker21:telegram-report:chat-balance:${chatId}`]],
    { context: "bro-poker-image-router.clubs.balance", timeoutMs: 2500 });
  const balanceCents = Number(balanceRows?.[0]?.result || 0);
  const totalCents = [...totals.values()].reduce((sum, value) => sum + value, 0);
  return [
    "<b>Клубы BRO.POKER</b>",
    `Проведённые расчёты: ${[...periods].sort().map(escapeHtml).join(", ")}`,
    "",
    ...[...totals.entries()].sort(([a], [b]) => a.localeCompare(b, "ru"))
      .map(([club, cents]) => `${escapeHtml(club)} — ${formatBalance(cents, true)}`),
    "",
    `<b>Итого по скриншотам: ${formatBalance(totalCents, true)}</b>`,
    `<b>Текущий баланс BRO.POKER: ${formatBalance(balanceCents)}</b>`,
  ].join("\n");
}

module.exports = { BRO_POKER_LEAGUE_ID, countBroPokerReports, decideReport, destinationName, listBroPokerClubs,
  flushBroPokerBatch, imageFileId, isBroPokerSource, isMonday, normalizeName, parseAmount, photoFromReply,
  recognizeClub, routeBroPokerImage };
