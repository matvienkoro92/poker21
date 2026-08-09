"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";
process.env.UPSTASH_REDIS_REST_URL = "https://redis.test";
process.env.UPSTASH_REDIS_REST_TOKEN = "redis-token";

const handler = require("../lib/api-handlers/telegram-report-webhook");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function update(text, messageId) {
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    body: {
      message: {
        message_id: messageId,
        text,
        chat: { id: -1004391487736 },
        from: { id: 42 },
      },
    },
  };
}

test("/настройка сохраняет процент и применяет его в отчёте", async (t) => {
  const strings = new Map();
  const hashes = new Map();
  const telegramCalls = [];
  const originalFetch = global.fetch;

  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://raw.githubusercontent.com/")) {
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer };
    }
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const body = isForm ? Object.fromEntries(options.body.entries()) : JSON.parse(options.body);
    if (String(url).includes("redis.test")) {
      const results = body.map((command) => {
        const [name, key, ...args] = command;
        if (name === "SETEX") { strings.set(key, args[1]); return { result: "OK" }; }
        if (name === "GET") return { result: strings.has(key) ? strings.get(key) : null };
        if (name === "DEL") { strings.delete(key); return { result: 1 }; }
        if (name === "HSET") {
          if (!hashes.has(key)) hashes.set(key, new Map());
          hashes.get(key).set(args[0], args[1]);
          return { result: 1 };
        }
        if (name === "HGET") return { result: hashes.get(key)?.get(args[0]) ?? null };
        throw new Error(`Unexpected Redis command: ${name}`);
      });
      return { ok: true, json: async () => results };
    }
    telegramCalls.push({ method: String(url).split("/").at(-1), body });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  let res = responseRecorder();
  await handler(update("/настройка", 1), res);
  assert.equal(res.body.settings, true);
  assert.match(telegramCalls.at(-1).body.text, /Введите процент/);

  res = responseRecorder();
  await handler(update("10,5%", 2), res);
  assert.equal(res.body.saved, true);
  assert.equal(res.body.servicePercent, 10.5);
  assert.equal(telegramCalls.at(-1).body.text, "Процент за обслуживание изменён на 10,5%.");

  res = responseRecorder();
  await handler(update("/отчет 27.07-02.08", 3), res);
  assert.equal(res.body.sent, true);
  const photo = telegramCalls.at(-2);
  assert.equal(photo.method, "sendPhoto");
  assert.equal(photo.body.caption, "Отчёт клуба «Два Туза»\nПериод: 27.07.2026–02.08.2026\n\nИтого к расчёту: 77 693,85 ₽");
  const document = telegramCalls.at(-1);
  assert.equal(document.method, "sendDocument");
  assert.ok(document.body.document instanceof Blob);
  assert.equal(document.body.document.name, "Два_Туза_отчет_27.07-02.08.2026.xlsx");
});

test("неверный процент не завершает настройку", async (t) => {
  const originalFetch = global.fetch;
  let pending = false;
  const telegramCalls = [];
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).includes("redis.test")) {
      return {
        ok: true,
        json: async () => body.map(([name]) => {
          if (name === "SETEX") { pending = true; return { result: "OK" }; }
          if (name === "GET") return { result: pending ? "service_percent" : null };
          return { result: null };
        }),
      };
    }
    telegramCalls.push(body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  await handler(update("/настройка", 10), responseRecorder());
  const res = responseRecorder();
  await handler(update("сто", 11), res);
  assert.equal(res.body.saved, false);
  assert.match(telegramCalls.at(-1).text, /число от 0 до 100/);
  assert.equal(pending, true);
});
