"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.CRON_SECRET = "test-cron-secret";

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function loadHandler(pipeline) {
  const redisPath = require.resolve("../lib/redis");
  const handlerPath = require.resolve("../lib/api-handlers/telegram-bound-auto-report");
  const redis = require(redisPath);
  const original = { isConfigured: redis.isConfigured, pipeline: redis.pipeline };
  redis.isConfigured = () => true;
  redis.pipeline = pipeline;
  delete require.cache[handlerPath];
  const handler = require(handlerPath);
  return { handler, restore() { redis.isConfigured = original.isConfigured; redis.pipeline = original.pipeline; delete require.cache[handlerPath]; } };
}

function request(body = {}, query = {}) {
  return { method: "POST", headers: { "x-cron-secret": "test-cron-secret" }, body, query };
}

test("автоотчёт отправляет только отчёт привязанного союза и только один раз", async (t) => {
  const bindings = {
    "poker21:telegram-report:club-chat:-1001": JSON.stringify({ type: "union", leagueId: "840346", league: "Ginger", autoReport: true }),
    "poker21:telegram-report:club-chat:-1002": JSON.stringify({ type: "union", leagueId: "854851", league: "Rbpoker", autoReport: false }),
  };
  const sentLocks = new Set();
  const pipeline = async (commands) => commands.map((command) => {
    const [name, key] = command;
    if (name === "SCAN") return { result: ["0", Object.keys(bindings)] };
    if (name === "GET") return { result: bindings[key] || null };
    if (name === "SET" && command.includes("NX")) {
      if (sentLocks.has(key)) return { result: null };
      sentLocks.add(key);
      return { result: "OK" };
    }
    if (name === "DEL") { sentLocks.delete(key); return { result: 1 }; }
    return { result: null };
  });
  const loaded = loadHandler(pipeline);
  t.after(loaded.restore);
  const telegramCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    telegramCalls.push({ method: String(url).split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const first = responseRecorder();
  await loaded.handler(request(), first);
  assert.equal(first.body.ok, true);
  assert.equal(telegramCalls.length, 1);
  assert.equal(telegramCalls[0].method, "sendPhoto");
  assert.equal(telegramCalls[0].body.chat_id, "-1001");
  assert.match(telegramCalls[0].body.caption, /^<b>Ginger — новый отчёт<\/b>/);
  assert.match(telegramCalls[0].body.photo, /ginger/i);
  assert.doesNotMatch(telegramCalls[0].body.caption, /Rbpoker/);

  const second = responseRecorder();
  await loaded.handler(request(), second);
  assert.equal(telegramCalls.length, 1, "повторная проверка не должна повторно отправлять период");
  assert.equal(second.body.results.find((row) => row.chatId === "-1001").skipped, true);
});

test("dry-run ничего не отправляет и точно показывает будущий отчёт", async (t) => {
  const key = "poker21:telegram-report:club-chat:-2001";
  let mutations = 0;
  const pipeline = async (commands) => commands.map((command) => {
    if (command[0] === "SCAN") return { result: ["0", [key]] };
    if (command[0] === "GET") return { result: JSON.stringify({ type: "union", leagueId: "854851", league: "Rbpoker", autoReport: true }) };
    mutations += 1;
    return { result: "OK" };
  });
  const loaded = loadHandler(pipeline);
  t.after(loaded.restore);
  const originalFetch = global.fetch;
  let sends = 0;
  global.fetch = async () => { sends += 1; return { ok: true, json: async () => ({ ok: true }) }; };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await loaded.handler(request({ dryRun: true }), res);
  assert.equal(res.body.dryRun, true);
  assert.equal(sends, 0);
  assert.equal(mutations, 0);
  assert.deepEqual(res.body.results[0], {
    chatId: "-2001", ok: true, dryRun: true, type: "union", entityId: "854851", entity: "Rbpoker",
    startDate: "2026-08-03", endDate: "2026-08-09", method: "sendPhoto",
    imagePath: "/assets/reports/unions/2026-08-03_2026-08-09/rbpoker.png",
  });
});
