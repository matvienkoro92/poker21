"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { destinationName, flushBroPokerBatch, isBroPokerSource, isMonday,
  normalizeName, parseAmount, routeBroPokerImage } = require("../lib/bro-poker-image-router");

test("распознаёт исходную группу BRO.POKER по привязке и названию", () => {
  assert.equal(isBroPokerSource({ title: "Любое имя" }, { type: "union", leagueId: "538879" }), true);
  assert.equal(isBroPokerSource({ title: "Бро покер" }, null), true);
  assert.equal(isBroPokerSource({ title: "BRO.POKER" }, null), true);
  assert.equal(isBroPokerSource({ title: "Другой союз" }, null), false);
  assert.equal(normalizeName("PC-Arena"), "pc arena");
  assert.equal(destinationName("BluffCatcher"), "Пент");
  assert.equal(destinationName("Kings KO"), "Кингс ко");
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
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), -876800);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-2001"), -2771700);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-2002"), -2771700);
  assert.equal(balances.has("poker21:telegram-report:chat-balance:-3001"), false);

  const duplicate = await routeBroPokerImage({
    message, updateId: 55, sourceBinding: source, telegram, redisPipeline: pipeline,
    redisConfigured: true, botToken: "token", recognizeClub,
    chooseBatchId: async () => "a".repeat(20),
    now: new Date("2026-09-21T12:00:00Z"),
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(telegramCalls.filter((call) => call.method === "copyMessage").length, 2);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), -876800);

  const repeat = await flushBroPokerBatch({ id: result.batchId, telegram, redisPipeline: pipeline,
    now: new Date("2026-09-21T12:12:00Z"), sourceBinding: source });
  assert.equal(repeat.duplicate, true);
  assert.equal(balances.get("poker21:telegram-report:chat-balance:-1001"), -876800);
});

test("не обрабатывает картинки из других групп", async () => {
  const result = await routeBroPokerImage({
    message: { message_id: 1, chat: { id: -1, title: "Не тот союз" }, photo: [{ file_id: "x" }] },
    sourceBinding: null,
  });
  assert.deepEqual(result, { handled: false });
});
