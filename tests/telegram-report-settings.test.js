"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";
process.env.REPORT_NOW_ISO = "2026-08-03T00:00:00.000Z";

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
  await handler(update("/отчет 13.07-19.07", 1), res);
  assert.equal(res.body.sent, true);
  const photo = telegramCalls.at(-2);
  assert.equal(photo.method, "sendPhoto");
  assert.equal(photo.body.caption, "Отчёт клуба «Два Туза»\nПериод: 13.07.2026–19.07.2026\n\nИтого к расчёту: -81 432,84 ₽");
  const document = telegramCalls.at(-1);
  assert.equal(document.method, "sendDocument");
  assert.ok(document.body.document instanceof Blob);
  assert.equal(document.body.document.name, "Два_Туза_отчет_13.07-19.07.2026.xlsx");
});

test("/настройка больше не запускает диалог", async () => {
  const res = responseRecorder();
  await handler(update("/настройка", 2), res);
  assert.deepEqual(res.body, { ok: true });
});

test("/сводка выводит клубы по рейку и отделяет нулевые", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/сводка", 4), res);
  assert.deepEqual(res.body, { ok: true, summary: true, sent: true });
  assert.match(sentMessage.text, /^Сводка клубов по рейку\nПериод: 13\.07\.2026–19\.07\.2026/m);
  assert.match(sentMessage.text, /1\. Два Туза — 724 837,89/);
  assert.match(sentMessage.text, /27\. Храм — 0,20\n\nНулевой рейк:\n28\. CORONA — 0,00/);
  assert.match(sentMessage.text, /39\. ••KARAVAN•• — 0,00$/);
});

test("/итого показывает игровые разбивки единственного оставшегося отчёта", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/итого за 3 недели", 3), res);
  assert.equal(res.body.sent, true);
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /<b>Выигрыш игроков: -746 783,70 ₽<\/b>/);
  assert.match(sentMessage.text, /NLH: -401 450,29 ₽/);
  assert.match(sentMessage.text, /PLO5: -14 975,96 ₽/);
  assert.match(sentMessage.text, /<b>Комиссия \(рейк\): 724 837,89 ₽<\/b>/);
  assert.match(sentMessage.text, /<b>-Итого рейк кеш: 544 223,19 ₽<\/b>/);
  assert.match(sentMessage.text, /NLH 3-1: 40 357,01 ₽\n<b>-Комиссия MTT: 180 614,70 ₽<\/b>/);
  assert.match(sentMessage.text, /MTT-NLH: 172 549,70 ₽/);
  assert.match(sentMessage.text, /SNG-NLH: 7 010,00 ₽/);
  assert.match(sentMessage.text, /<b>Баланс \(приложение\): -21 945,81 ₽<\/b>/);
  assert.match(sentMessage.text, /Обслуживание 8%: -57 987,03 ₽/);
  assert.match(sentMessage.text, /<b>Итого выигрыш \+ рейк: -81 432,84 ₽<\/b>/);
});
