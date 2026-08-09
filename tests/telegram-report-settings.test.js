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

test("/рейк клубов выводит клубы по рейку и отделяет нулевые", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/рейк клубов", 4), res);
  assert.deepEqual(res.body, { ok: true, summary: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Сводка клубов по рейку\n<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/m);
  assert.match(sentMessage.text, /1\. Два Туза — 724 837,89/);
  assert.match(sentMessage.text, /27\. Храм — 0,20\n\n<b>Итого рейк: 1 878 391,42<\/b>\n\nНулевой рейк:\n28\. CORONA — 0,00/);
  assert.match(sentMessage.text, /39\. ••KARAVAN•• — 0,00$/);
});

test("/команды показывает справку по доступным командам", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/команды", 5), res);
  assert.deepEqual(res.body, { ok: true, commands: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^<b>Доступные команды<\/b>/);
  assert.match(sentMessage.text, /<b>\/рейк клубов<\/b>/);
  assert.match(sentMessage.text, /<b>\/игры<\/b>/);
  assert.match(sentMessage.text, /<b>\/оверлеи<\/b>/);
  assert.match(sentMessage.text, /<b>\/отчет 13\.07-19\.07<\/b>/);
  assert.match(sentMessage.text, /<b>\/итого за все время<\/b>/);
  assert.match(sentMessage.text, /<b>\/команды<\/b>/);
});

test("/игры выводит весь рейк союза и разбивку по играм", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/игры", 7), res);
  assert.deepEqual(res.body, { ok: true, games: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Рейк союза по видам игр\n<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/);
  assert.match(sentMessage.text, /<b>Весь рейк союза: 1 878 391,42<\/b>/);
  assert.match(sentMessage.text, /NLH — 591 111,78\nPLO6 — 585 668,17/);
  assert.match(sentMessage.text, /MTT-Durak — 65,00$/);
});

test("/оверлеи выводит турниры по убыванию и итог", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/оверлеи", 6), res);
  assert.deepEqual(res.body, { ok: true, overlays: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Оверлеи турниров\n<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/);
  assert.match(sentMessage.text, /1\. Субботний Фриролл 🏆 — 66 520,00/);
  assert.match(sentMessage.text, /56\. Satellite 5 ticke💥 — 760,00/);
  assert.match(sentMessage.text, /<b>Итого оверлей: 353 680,20<\/b>$/);
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
