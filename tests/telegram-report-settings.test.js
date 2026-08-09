"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

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
    body: { message: { message_id: messageId, text, chat: { id: -1004391487736 }, from: { id: 42 } } },
  };
}

test("/отчет применяет процент из кода и отправляет оригинальный Excel", async (t) => {
  const telegramCalls = [];
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).startsWith("https://raw.githubusercontent.com/")) {
      return { ok: true, status: 200, arrayBuffer: async () => new Uint8Array([80, 75, 3, 4]).buffer };
    }
    const isForm = typeof FormData !== "undefined" && options.body instanceof FormData;
    const body = isForm ? Object.fromEntries(options.body.entries()) : JSON.parse(options.body);
    telegramCalls.push({ method: String(url).split("/").at(-1), body });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/отчет 27.07-02.08", 1), res);
  assert.equal(res.body.sent, true);
  const photo = telegramCalls.at(-2);
  assert.equal(photo.method, "sendPhoto");
  assert.equal(photo.body.caption, "Отчёт клуба «Два Туза»\nПериод: 27.07.2026–02.08.2026\n\nИтого к расчёту: 90 655,25 ₽");
  const document = telegramCalls.at(-1);
  assert.equal(document.method, "sendDocument");
  assert.ok(document.body.document instanceof Blob);
  assert.equal(document.body.document.name, "Два_Туза_отчет_27.07-02.08.2026.xlsx");
});

test("/настройка больше не запускает диалог", async () => {
  const res = responseRecorder();
  await handler(update("/настройка", 2), res);
  assert.deepEqual(res.body, { ok: true });
});

test("/итого за 1 неделю показывает игровые разбивки и сверенные итоги", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/итого за 1 неделю", 3), res);
  assert.equal(res.body.sent, true);
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /<b>Выигрыш игроков: -384 824,24 ₽<\/b>/);
  assert.match(sentMessage.text, /NLH: -259 665,01 ₽/);
  assert.match(sentMessage.text, /PLO5: -23 359,86 ₽/);
  assert.match(sentMessage.text, /<b>Комиссия \(рейк\): 518 455,97 ₽<\/b>/);
  assert.match(sentMessage.text, /MTT-NLH: 147 075,00 ₽/);
  assert.match(sentMessage.text, /Комиссия MTT: 0,00 ₽/);
  assert.match(sentMessage.text, /<b>Итого Рейк \+ выигрыш: 133 631,73 ₽<\/b>/);
  assert.match(sentMessage.text, /Обслуживание 8%: -41 476,48 ₽/);
  assert.match(sentMessage.text, /<b>Итого к расчёту: 90 655,25 ₽<\/b>/);
});
