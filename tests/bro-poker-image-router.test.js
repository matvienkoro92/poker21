"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { countBroPokerReports, destinationName, flushBroPokerBatch, isBroPokerSource, isMonday,
  listBroPokerClubs, normalizeName, parseAmount, photoFromReply, routeBroPokerImage } = require("../lib/bro-poker-image-router");

test("показывает только проведённые операции клубов BRO.POKER", async () => {
  const chatId = "-1001";
  const batchId = "a".repeat(20);
  const values = new Map([
    [`poker21:bro-poker-batch:${batchId}:status`, "done"],
  ]);
  for (const [messageId, club, totalCents] of [
    [3812, "Kings KO", -364266], [3813, "Два Туза X", 4070718],
    [3814, "JOKER", -1495524], [3815, "Nuts_and_Bluff", -155150],
    [3816, "Collab club", -466275], [3817, "BluffCatcher", -471660],
    [3818, "PC Arena", -4909425],
  ]) values.set(`poker21:bro-poker-report:${chatId}:${messageId}`,
    JSON.stringify({ sourceChatId: chatId, batchId, club, totalCents, period: "27.07.2026-02.08.2026" }));
  const pipeline = async (commands) => commands.map(([op, key, , pattern]) => {
    if (op === "SCAN") return { result: ["0", [...values.keys()].filter((entry) => entry.startsWith(pattern.slice(0, -1)))] };
    if (op === "GET") return { result: values.get(key) || null };
    throw new Error(`Unexpected ${op}`);
  });
  const result = await listBroPokerClubs({ chatId, redisPipeline: pipeline });
  assert.match(result, /Коллаб — 🔴 -4\s?662,75 ₽/);
  assert.match(result, /Два Туза X — 🟢 \+40\s?707,18 ₽/);
  assert.match(result, /Итого операций: 🔴 -37\s?915,82 ₽/);
  assert.doesNotMatch(result, /баланс/i);
});

test("достаёт фото из ответа на старое сообщение без повторной загрузки", async () => {
  const calls = [];
  const telegram = async (method, body) => {
    calls.push({ method, body });
    if (method === "forwardMessage") return { ok: true, result: { message_id: 900, photo: [{ file_id: "old-photo" }] } };
    return { ok: true };
  };
  const message = { chat: { id: -1001 }, from: { id: 42 }, reply_to_message: { message_id: 77 } };
  const original = await photoFromReply(message, telegram);
  assert.equal(original.message_id, 77);
  assert.equal(original.photo[0].file_id, "old-photo");
  assert.deepEqual(calls, [
    { method: "forwardMessage", body: { chat_id: "42", from_chat_id: "-1001", message_id: 77, disable_notification: true } },
    { method: "deleteMessage", body: { chat_id: "42", message_id: 900 } },
  ]);
});

test("использует фото из ответа напрямую, когда Telegram его передал", async () => {
  const original = await photoFromReply({ chat: { id: -1001 },
    reply_to_message: { message_id: 77, photo: [{ file_id: "photo" }] } }, () => { throw new Error("unexpected API call"); });
  assert.equal(original.photo[0].file_id, "photo");
  assert.equal(original.message_id, 77);
});

test("распознаёт исходную группу BRO.POKER по привязке и названию", () => {
  assert.equal(isBroPokerSource({ title: "Любое имя" }, { type: "union", leagueId: "538879" }), true);
  assert.equal(isBroPokerSource({ title: "Бро покер" }, null), true);
  assert.equal(isBroPokerSource({ title: "BRO.POKER" }, null), true);
  assert.equal(isBroPokerSource({ title: "Poker21 Bro poker" }, null), true);
  assert.equal(isBroPokerSource({ title: "Другой союз" }, null), false);
  assert.equal(normalizeName("PC-Arena"), "pc arena");
  assert.equal(destinationName("BluffCatcher"), "Пент");
  assert.equal(destinationName("Kings KO"), "Кингс ко");
  assert.equal(destinationName("JOKER"), "Джокер");
  assert.equal(destinationName("Nuts_and_Bluff"), "Натс и Блаф");
  assert.equal(destinationName("Collab club"), "Коллаб");
  assert.equal(destinationName("Два Туза X"), "Два Туза X");
  assert.equal(parseAmount("-27 717 ₽"), -2771700);
  assert.equal(isMonday(new Date("2026-09-20T22:00:00Z")), true);
  assert.equal(isMonday(new Date("2026-09-21T21:00:00Z")), false);
});

test("не действует до ручного расчёта, затем копирует PC Arena и записывает общий итог", async () => {
  const source = { type: "union", leagueId: "538879", league: "BRO.POKER" };
  const bindings = {
    "poker21:telegram-report:club-chat:-2001": JSON.stringify({ type: "club", clubId: "600344", club: "PC Arena" }),
    "poker21:telegram-report:club-chat:-2002": JSON.stringify({ type: "club", clubId: "600344", club: "PC Arena" }),
    "poker21:telegram-report:club-chat:-3001": JSON.stringify({ type: "club", clubId: "128900", club: "Beer and Bear" }),
  };
  const values = new Map(Object.entries(bindings));
  const sorted = new Map();
  const balances = new Map();
  const pipeline = async (commands) => commands.map((command) => {
    if (command[0] === "SCAN") return { result: ["0", Object.keys(bindings)] };
    if (command[0] === "GET") return { result: values.get(command[1]) || null };
    if (command[0] === "ZADD") { sorted.set(command[1], [...new Set([...(sorted.get(command[1]) || []), command[3]])]); return { result: 1 }; }
    if (command[0] === "ZRANGE") return { result: sorted.get(command[1]) || [] };
    if (command[0] === "EXPIRE") return { result: 1 };
    if (command[0] === "SET" && command.includes("NX")) {
      if (values.has(command[1])) return { result: null };
      values.set(command[1], command[2]); return { result: "OK" };
    }
    if (command[0] === "SET") { values.set(command[1], command[2]); return { result: "OK" }; }
    if (command[0] === "EVAL") {
      if (command[1].includes("redis.call('GET', KEYS[1]) ~= ARGV[1]")) {
        if (values.get(command[3]) !== command[6]) return { result: 0 };
        values.set(command[5], "1"); values.set(command[4], "processing");
        return { result: 1 };
      }
      const dedupeKey = command[3];
      const balanceKey = command[4];
      if (values.has(dedupeKey)) return { result: [0, balances.get(balanceKey) || 0] };
      const current = (balances.get(balanceKey) || 0) + Number(command[7]);
      balances.set(balanceKey, current);
      values.set(dedupeKey, "1");
      return { result: [1, current] };
    }
    if (command[0] === "DEL") { values.delete(command[1]); return { result: 1 }; }
    return { result: null };
  });
  const telegramCalls = [];
  const telegram = async (method, body) => {
    telegramCalls.push({ method, body });
    if (method === "getFile") return { ok: true, result: { file_path: "photos/report.jpg" } };
    return { ok: true, result: { message_id: 99 } };
  };
  let reportName = "PC Arena";
  const recognizeClub = async () => ({ club: reportName,
    totalCents: reportName === "PC Arena" ? -2771700 : 1894900, period: "14.09.2026-20.09.2026" });
  const message = { message_id: 77, chat: { id: -1001, title: "BRO.POKER" }, photo: [{ file_id: "small" }, { file_id: "large" }] };

  const result = await routeBroPokerImage({
    message, updateId: 55, sourceBinding: source, telegram, redisPipeline: pipeline,
    redisConfigured: true, botToken: "token", recognizeClub,
    chooseBatchId: async () => "a".repeat(20),
    now: new Date("2026-09-21T12:00:00Z"),
  });
  assert.equal(result.staged, true);
  assert.equal(result.club, "PC Arena");
  assert.equal(telegramCalls.filter((call) => call.method === "copyMessage").length, 0);
  reportName = "Два Туза X";
  const second = await routeBroPokerImage({ message: { ...message, message_id: 78 }, sourceBinding: source,
    telegram, redisPipeline: pipeline, redisConfigured: true, botToken: "token", recognizeClub,
    chooseBatchId: async () => "a".repeat(20), now: new Date("2026-09-21T12:02:00Z") });
  assert.equal(second.staged, true);
  const flushed = await flushBroPokerBatch({ id: result.batchId, telegram, redisPipeline: pipeline,
    now: new Date("2026-09-21T12:02:01Z"), sourceBinding: source });
  assert.equal(flushed.routed, true);
  assert.equal(flushed.count, 2);
  assert.equal(flushed.totalCents, -876800);
  assert.deepEqual(flushed.results[0].targets.map((row) => row.chatId), ["-2001", "-2002"]);
  const copies = telegramCalls.filter((call) => call.method === "copyMessage");
  assert.equal(copies.length, 2);
  assert.deepEqual(copies[0].body, { chat_id: "-2001", from_chat_id: "-1001", message_id: 77 });
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), 876800);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-2001"), -2771700);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-2002"), -2771700);
  assert.equal(balances.has("poker21:telegram-report:chat-balance:-3001"), false);
  const sourceNotice = telegramCalls.find((call) => call.method === "sendMessage" && call.body.chat_id === "-1001"
    && call.body.text.includes("Предыдущий баланс"));
  assert.equal(sourceNotice.body.parse_mode, "HTML");
  assert.match(sourceNotice.body.text, /<b>Предыдущий баланс: ⚪ 0,00 ₽<\/b>/);
  assert.match(sourceNotice.body.text, /🟢 \+8\s?768,00 ₽ — отчёт BRO\.POKER/);
  assert.match(sourceNotice.body.text, /<b>🟢 8\s?768,00 ₽ — текущий баланс<\/b>/);

  const duplicate = await routeBroPokerImage({
    message, updateId: 55, sourceBinding: source, telegram, redisPipeline: pipeline,
    redisConfigured: true, botToken: "token", recognizeClub,
    chooseBatchId: async () => "a".repeat(20),
    now: new Date("2026-09-21T12:00:00Z"),
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(telegramCalls.filter((call) => call.method === "copyMessage").length, 2);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), 876800);

  const repeat = await flushBroPokerBatch({ id: result.batchId, telegram, redisPipeline: pipeline,
    now: new Date("2026-09-21T12:12:00Z"), sourceBinding: source });
  assert.equal(repeat.duplicate, true);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), 876800);
});

test("не обрабатывает картинки из других групп", async () => {
  const result = await routeBroPokerImage({
    message: { message_id: 1, chat: { id: -1, title: "Не тот союз" }, photo: [{ file_id: "x" }] },
    sourceBinding: null,
  });
  assert.deepEqual(result, { handled: false });
});

test("восстанавливает семь зависших фото и просит подтверждение перед балансами", async () => {
  const chatId = "-1001";
  const values = new Map();
  const sorted = new Map();
  for (let id = 3812; id <= 3818; id += 1) values.set(`poker21:bro-poker-report:${chatId}:${id}`, "1");
  for (const [index, club] of ["Кингс ко", "Джокер", "Натс и Блаф", "Коллаб", "Пент", "PC Arena"].entries()) {
    values.set(`poker21:telegram-report:club-chat:-20${index}`,
      JSON.stringify({ type: "club", club }));
  }
  const pipeline = async (commands) => commands.map((command) => {
    const [op, key] = command;
    if (op === "SCAN") {
      const pattern = command[3];
      const prefix = pattern.slice(0, -1);
      return { result: ["0", [...values.keys()].filter((value) => value.startsWith(prefix))] };
    }
    if (op === "GET") return { result: values.get(key) || null };
    if (op === "SET" && command.includes("NX") && values.has(key)) return { result: null };
    if (op === "SET") { values.set(key, command[2]); return { result: "OK" }; }
    if (op === "DEL") { values.delete(key); return { result: 1 }; }
    if (op === "ZADD") { sorted.set(key, [...new Set([...(sorted.get(key) || []), command[3]])]); return { result: 1 }; }
    if (op === "ZRANGE") return { result: sorted.get(key) || [] };
    if (op === "EVAL") {
      const activeKey = command[3];
      const current = values.get(activeKey);
      const id = current || command[5];
      values.set(activeKey, id);
      return { result: id };
    }
    return { result: 1 };
  });
  const sent = [];
  const telegram = async (method, body) => { sent.push({ method, body }); return { ok: true, result: { message_id: 999 } }; };
  const counted = await countBroPokerReports({ chatId, sourceTitle: "Poker21 Bro poker",
    sourceBinding: { type: "union", leagueId: "538879", league: "BRO.POKER" }, telegram, redisPipeline: pipeline,
    now: new Date("2026-09-28T10:00:00Z") });
  assert.equal(counted.results?.[0]?.pending, true);
  assert.equal(counted.results?.[0]?.count, 7);
  assert.equal(sent.filter((call) => call.method === "copyMessage").length, 0);
  assert.equal(sent.filter((call) => call.method === "sendMessage").length, 1);
  assert.match(sent[0].body.text, /Итого: -37\s?915,82 ₽/);
  assert.match(sent[0].body.text, /Два Туза X: 40\s?707,18 ₽/);
  assert.equal(sent[0].body.reply_markup.inline_keyboard[0][0].text, "✅ Разрешить");
});

test("исправляет знак проведённого пакета один раз и не меняет клубные балансы", async () => {
  const chatId = "-1001";
  const id = "a".repeat(20);
  const base = `poker21:bro-poker-batch:${id}`;
  const values = new Map([
    [`${base}:status`, "done"], [`${base}:source`, chatId], [`${base}:last`, "1790670000000"], [`${base}:manual-review`, "1"],
    [`poker21:bro-poker-batch:active:${chatId}:period`, id],
    [`poker21:bro-poker-report:balance:batch:${id}:${chatId}`, "1"],
    [`poker21:telegram-report:chat-balance:${chatId}`, String(-1146356)],
    ["poker21:telegram-report:chat-balance:-2001", "10000"],
  ]);
  values.set("poker21:telegram-report:club-chat:-203",
    JSON.stringify({ type: "club", club: "Коллаб" }));
  const expected = [
    [3812, "Kings KO", -364266], [3813, "Два Туза X", 4070718],
    [3814, "JOKER", -1495524], [3815, "Nuts_and_Bluff", -155150],
    [3816, "Collab club", -466275], [3817, "BluffCatcher", -471660],
    [3818, "PC Arena", -4909425],
  ];
  for (const [messageId, club, totalCents] of expected) values.set(`poker21:bro-poker-report:${chatId}:${messageId}`,
    JSON.stringify({ batchId: id, club, totalCents, period: "27.07.2026-02.08.2026" }));
  const pipeline = async (commands) => commands.map((command) => {
    const [op, key] = command;
    if (op === "SCAN") return { result: ["0", [...values.keys()].filter((value) => value.startsWith(command[3].slice(0, -1)))] };
    if (op === "GET") return { result: values.get(key) || null };
    if (op === "SMEMBERS") return { result: [] };
    if (op === "ZRANGE") return { result: expected.map((row) => String(row[0])) };
    if (op === "LRANGE") {
      assert.deepEqual(command.slice(2), ["0", "199"]);
      return { result: values.get(key) || [] };
    }
    if (op === "SET") { values.set(key, command[2]); return { result: "OK" }; }
    if (op === "EVAL") {
      const dedupeKey = command[3];
      const balanceKey = command[4];
      if (values.has(dedupeKey)) return { result: [0, values.get(balanceKey)] };
      const balance = Number(values.get(balanceKey) || 0) + Number(command[7]);
      values.set(balanceKey, String(balance)); values.set(dedupeKey, "1");
      return { result: [1, balance] };
    }
    return { result: 1 };
  });
  const sent = [];
  const telegram = async (method, body) => { sent.push({ method, body }); return { ok: true, result: { message_id: 99 } }; };
  const args = { chatId, sourceTitle: "Poker21 Bro poker",
    sourceBinding: { type: "union", leagueId: "538879", league: "BRO.POKER" }, telegram, redisPipeline: pipeline };
  const first = await countBroPokerReports(args);
  assert.equal(first.results[0].sourceSignCorrected, true);
  assert.equal(first.results[0].correctionCents, 7583164);
  assert.equal(first.results[0].balanceCents, 6436808);
  assert.equal(values.get("poker21:telegram-report:chat-balance:-2001"), "10000");
  assert.equal(sent.filter((call) => call.method === "sendMessage").length, 1);
  assert.match(sent[0].body.text, /64\s?368,08 ₽/);
  values.set(`poker21:bro-poker-report:balance-notice:${chatId}:3816:-203`, "321");
  values.set("poker21:telegram-report:chat-balance-history:-203",
    [JSON.stringify({ rub: { action: "adjust", cents: -466275 }, cents: -1781597,
      comment: `Скриншот ${chatId}:3816` })]);
  const second = await countBroPokerReports(args);
  assert.equal(second.results[0].duplicate, true);
  assert.equal(second.results[0].clubNoticesUpdated, 1);
  const edit = sent.find((call) => call.method === "editMessageText" && call.body.chat_id === "-203");
  assert.equal(edit.body.message_id, 321);
  assert.match(edit.body.text, /<b>Предыдущий баланс: 🔴 -13\s?153,22 ₽<\/b>/);
  assert.match(edit.body.text, /🔴 -4\s?662,75 ₽ — отчёт Collab club/);
  assert.match(edit.body.text, /<b>🔴 -17\s?815,97 ₽ — текущий баланс<\/b>/);
  assert.equal(values.get(`poker21:telegram-report:chat-balance:${chatId}`), "6436808");
  assert.equal(sent.filter((call) => call.method === "sendMessage").length, 1);
});
