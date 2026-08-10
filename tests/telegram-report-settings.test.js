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
  assert.match(sentMessage.text, /^Сводка клубов по рейку\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/m);
  assert.match(sentMessage.text, /1\. Два Туза — 619 437,00/);
  assert.match(sentMessage.text, /28\. РИВЕР КЛУБ — 5,00\n\n<b>Итого рейк: 1 905 711,67<\/b>\n\nНулевой рейк:/);
  assert.match(sentMessage.text, /40\. /);
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
  assert.match(sentMessage.text, /<b>\/джекпот<\/b>/);
  assert.match(sentMessage.text, /<b>\/игроки рейк<\/b>/);
  assert.match(sentMessage.text, /<b>\/игроки минус<\/b>/);
  assert.match(sentMessage.text, /<b>\/игроки плюс<\/b>/);
  assert.match(sentMessage.text, /<b>\/клуб Два Туза<\/b>/);
  assert.match(sentMessage.text, /<b>\/игрок 230740<\/b>/);
  assert.match(sentMessage.text, /<b>\/активность<\/b>/);
  assert.match(sentMessage.text, /<b>\/период 20\.07-26\.07<\/b>/);
  assert.match(sentMessage.text, /<b>\/оверлеи<\/b>/);
  assert.match(sentMessage.text, /<b>\/отчет 13\.07-19\.07<\/b>/);
  assert.match(sentMessage.text, /<b>\/итого за все время<\/b>/);
  assert.match(sentMessage.text, /<b>\/команды<\/b>/);
});

test("команда статистики принимает период, а без периода показывает последнюю неделю", async (t) => {
  const originalFetch = global.fetch;
  const messages = [];
  global.fetch = async (url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  await handler(update("/игры 13.07-19.07", 51), responseRecorder());
  assert.match(messages.at(-1).text, /<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/);
  assert.match(messages.at(-1).text, /<b>Весь рейк союза: 1 878 391,42<\/b>/);

  await handler(update("/игры", 52), responseRecorder());
  assert.match(messages.at(-1).text, /<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
});

test("период показывает доступные недели и сообщает об отсутствующей", async (t) => {
  const originalFetch = global.fetch;
  const messages = [];
  global.fetch = async (url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  await handler(update("/период", 53), responseRecorder());
  assert.match(messages.at(-1).text, /03\.08\.2026–09\.08\.2026/);
  assert.match(messages.at(-1).text, /13\.07\.2026–19\.07\.2026/);

  const res = responseRecorder();
  await handler(update("/клуб Два Туза 20.07-26.07", 54), res);
  assert.equal(res.body.found, false);
  assert.match(messages.at(-1).text, /Статистика за период 20\.07-26\.07 не найдена/);
});

test("клуб и игрок принимают период после поискового запроса", async (t) => {
  const originalFetch = global.fetch;
  const messages = [];
  global.fetch = async (url, options) => {
    messages.push(JSON.parse(options.body));
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  await handler(update("/клуб Два Туза 13.07-19.07", 55), responseRecorder());
  assert.match(messages.at(-1).text, /<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/);
  assert.match(messages.at(-1).text, /<b>Весь рейк: 724 837,89<\/b>/);

  await handler(update("/игрок Waaar 13.07-19.07", 56), responseRecorder());
  assert.match(messages.at(-1).text, /<b>Период: 13\.07\.2026–19\.07\.2026<\/b>/);
});

test("/активность выводит общие показатели и четыре топа", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/активность", 14), res);
  assert.deepEqual(res.body, { ok: true, activity: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Активность клубов\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
  assert.match(sentMessage.text, /Активных клубов: 28/);
  assert.match(sentMessage.text, /Активных игроков: 543/);
  assert.match(sentMessage.text, /Раздач: 404 718/);
  assert.match(sentMessage.text, /<b>Топ-10 по активным игрокам<\/b>\n1\. Два Туза — 278/);
  assert.match(sentMessage.text, /<b>Топ-10 по играм<\/b>\n1\. Два Туза — 371/);
  assert.match(sentMessage.text, /<b>Топ-10 по раздачам<\/b>\n1\. Два Туза — 203 323/);
  assert.match(sentMessage.text, /<b>Топ-10 по рейку на игрока<\/b>\n1\. Fish Hunter — 20 644,20/);
});

test("/клуб находит клуб по части названия", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/клуб два туза", 10), res);
  assert.deepEqual(res.body, { ok: true, club: true, sent: true });
  assert.match(sentMessage.text, /^<b>Два Туза \(758417\)<\/b>/);
  assert.match(sentMessage.text, /<b>Весь рейк: 619 437,00<\/b>/);
  assert.match(sentMessage.text, /<b>Топ-5 по рейку<\/b>/);
});

test("/клуб находит латинское название по русскому написанию", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/клуб компашка", 13), res);
  assert.deepEqual(res.body, { ok: true, club: true, sent: true });
  assert.match(sentMessage.text, /^<b>Kampashka 21 \(680649\)<\/b>/);
});

test("/игрок находит игрока по ID", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/игрок 230740", 11), res);
  assert.deepEqual(res.body, { ok: true, player: true, sent: true });
  assert.match(sentMessage.text, /^<b>PlayerE32BA7 \(230740\)<\/b>/);
  assert.match(sentMessage.text, /Клубы: new balance/);
  assert.match(sentMessage.text, /<b>Рейк: 200,00<\/b>/);
});

test("/игрок допускает неточный ник", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/игрок playere32ba", 12), res);
  assert.deepEqual(res.body, { ok: true, player: true, sent: true });
  assert.match(sentMessage.text, /^<b>PlayerE32BA7 \(230740\)<\/b>/);
});

for (const [command, type, title, firstLine] of [
  ["/игроки рейк", "рейк", "Топ-10 игроков по рейку", "1. <b>СвошникZ</b> (316424) — 139 157,80 — Kings KO"],
  ["/игроки минус", "минус", "Топ-10 игроков по проигрышу", "1. <b>MupHbIu</b> (416594) — -186 162,28 — Joker♦️Poker"],
  ["/игроки плюс", "плюс", "Топ-10 игроков по выигрышу", "1. <b>СвошникZ</b> (316424) — 224 984,43 — Kings KO"],
]) {
  test(`${command} выводит нужный топ-10`, async (t) => {
    const originalFetch = global.fetch;
    let sentMessage = null;
    global.fetch = async (url, options) => {
      sentMessage = JSON.parse(options.body);
      return { ok: true, json: async () => ({ ok: true }) };
    };
    t.after(() => { global.fetch = originalFetch; });

    const res = responseRecorder();
    await handler(update(command, 9), res);
    assert.deepEqual(res.body, { ok: true, players: type, sent: true });
    assert.equal(sentMessage.parse_mode, "HTML");
    assert.match(sentMessage.text, new RegExp(`^${title}\\n<b>Период: 03\\.08\\.2026–09\\.08\\.2026<\\/b>`));
    assert.ok(sentMessage.text.includes(firstLine));
    assert.match(sentMessage.text, /10\. /);
  });
}

test("/джекпот выводит общий сбор суперюниона, лиги, сверку, типы и чистый остаток", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/джекпот", 8), res);
  assert.deepEqual(res.body, { ok: true, jackpot: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Джекпот суперюниона\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
  assert.match(sentMessage.text, /<b>Общий джекпот по всем лигам: 383 507,58<\/b>/);
  assert.match(sentMessage.text, /Анти-Рег — 246 302,96/);
  assert.match(sentMessage.text, /Off Cheats — 47 175,91/);
  assert.match(sentMessage.text, /AF UNION — 0,50/);
  assert.match(sentMessage.text, /PPCUNION — 1 288,76/);
  assert.match(sentMessage.text, /AQUARIUM — 138,69/);
  assert.match(sentMessage.text, /Проверка: сумма по лигам 383 507,58 = общий джекпот 383 507,58/);
  assert.match(sentMessage.text, /Обычный джекпот в лиге Антирег — 171 646,96/);
  assert.match(sentMessage.text, /У остальных лиг — 137 204,62/);
  assert.match(sentMessage.text, /Jackpot 21 \(подтверждено\) — 74 656,00/);
  assert.match(sentMessage.text, /<b>итого:<\/b>\n\nВыплаты обычного джекпота — 0,00/);
  assert.match(sentMessage.text, /Выплаты Jackpot 21 — 83 094,90\n<b>Всего выплачено: 83 094,90<\/b>/);
  assert.match(sentMessage.text, /<b>Сборы минус выплаты: 300 412,68<\/b>/);
  assert.match(sentMessage.text, /Возвраты союзам:\nPPCUNION 50% -644\nVALT13 70% -315/);
  assert.match(sentMessage.text, /ONL YSTAR 70% -1 927\nRbpoker 70% -3 269/);
  assert.match(sentMessage.text, /QUBE 60% -0\nAQUARIUM 50% -69/);
  assert.match(sentMessage.text, /<b>Всего возвратов: -6 224<\/b>/);
  assert.match(sentMessage.text, /<b>Полный итог: 294 188,68<\/b>$/);
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
  assert.match(sentMessage.text, /^Рейк союза по видам игр\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
  assert.match(sentMessage.text, /<b>Весь рейк союза: 1 905 711,67<\/b>/);
  assert.match(sentMessage.text, /NLH — 566 045,69\nPLO6 — 506 603,30/);
  assert.match(sentMessage.text, /OFC — 839,50$/);
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
  assert.match(sentMessage.text, /^Оверлеи турниров\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
  assert.match(sentMessage.text, /1\. 💥Big Boss 💥 — 120 000,00/);
  assert.match(sentMessage.text, /45\. Magic Chest — 75,00/);
  assert.match(sentMessage.text, /<b>Итого оверлей: 342 333,10<\/b>$/);
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
