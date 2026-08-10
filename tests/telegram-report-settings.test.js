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

function groupUpdate(text, messageId, chatId = -100999000111) {
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    body: { message: { message_id: messageId, text, chat: { id: chatId, type: "supergroup" }, from: { id: 42 } } },
  };
}

function callbackUpdate(data, messageId, chatId = -100999000111) {
  return {
    method: "POST",
    headers: { "x-telegram-bot-api-secret-token": "test-secret" },
    body: { callback_query: { id: `callback-${messageId}`, data, from: { id: 42 }, message: { message_id: messageId, chat: { id: chatId, type: "supergroup" } } } },
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
  assert.match(sentMessage.text, /<b>Общая бухгалтерия<\/b>[\s\S]*<b>Союзы и клубы<\/b>[\s\S]*<b>Игроки<\/b>/);
  assert.match(sentMessage.text, /<b>Периоды<\/b>[\s\S]*<b>Отчёты<\/b>[\s\S]*<b>Справка<\/b>/);
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
  assert.match(sentMessage.text, /<b>Общий джекпот по всем лигам: 383 557,08<\/b>/);
  assert.match(sentMessage.text, /Анти-Рег — 246 302,96/);
  assert.match(sentMessage.text, /Off Cheats — 47 175,91/);
  assert.match(sentMessage.text, /AF UNION — 50,00/);
  assert.match(sentMessage.text, /PPCUNION — 1 288,76/);
  assert.match(sentMessage.text, /AQUARIUM — 138,69/);
  assert.match(sentMessage.text, /Проверка: сумма по лигам 383 557,08 = общий джекпот 383 557,08/);
  assert.match(sentMessage.text, /Обычный джекпот в лиге Антирег — 171 646,96/);
  assert.match(sentMessage.text, /У остальных лиг — 137 254,12/);
  assert.match(sentMessage.text, /Выплаты обычного джекпота — 0,00\n<b>итого джекпот покер: 308 901,08<\/b>/);
  assert.match(sentMessage.text, /Возвраты союзам:\nPPCUNION 50% -644\nVALT13 70% -315/);
  assert.match(sentMessage.text, /ONL YSTAR 70% -1 927\nRbpoker 70% -3 269/);
  assert.match(sentMessage.text, /QUBE 60% -0\nAQUARIUM 50% -69/);
  assert.match(sentMessage.text, /<b>Всего возвратов: -6 224<\/b>/);
  assert.match(sentMessage.text, /Jackpot 21 \(подтверждено\) — 74 656,00/);
  assert.match(sentMessage.text, /Выплаты Jackpot 21 — 83 094,90\nРазница: -8 438,90/);
  assert.match(sentMessage.text, /<b>Итого джекпот покер: 302 677,08<\/b>/);
  assert.match(sentMessage.text, /<b>Итого джекпот 21: -8 438,90<\/b>$/);
});

test("/расчеты выводит актуальные показатели и итог без строки формулы", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = JSON.parse(options.body);
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/расчеты", 18), res);
  assert.deepEqual(res.body, { ok: true, calculations: true, sent: true });
  assert.equal(sentMessage.parse_mode, "HTML");
  assert.match(sentMessage.text, /^Расчёты суперюниона\n<b>Период: 03\.08\.2026–09\.08\.2026<\/b>/);
  assert.match(sentMessage.text, /Win\/lose всех лиг -2 792 778,73/);
  assert.match(sentMessage.text, /Fee всех лиг \+<b>2 830 227,2400<\/b>/);
  assert.doesNotMatch(sentMessage.text, /Insurance/);
  assert.match(sentMessage.text, /Джекпот всех лиг \+<b>383 557,08<\/b>/);
  assert.match(sentMessage.text, /Выплаты джекпота -<b>83 094,90<\/b>/);
  assert.match(sentMessage.text, /Оверлей -<b>342 333,10<\/b>/);
  assert.doesNotMatch(sentMessage.text, /<code>/);
  assert.match(sentMessage.text, /<b>Итого: -4 422,41<\/b>$/);
});

test("/союзы отправляет отдельные заголовки, два альбома и отчёт Jokers для Ильи", async (t) => {
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options) => {
    sentMessages.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/союзы", 19), res);
  assert.deepEqual(res.body, { ok: true, unions: true, sent: true });
  assert.equal(sentMessages.length, 7);
  assert.deepEqual(sentMessages.map((row) => row.method), [
    "sendMessage", "sendMediaGroup", "sendMessage", "sendMediaGroup", "sendMessage", "sendPhoto", "sendMessage",
  ]);
  const textMessages = sentMessages.filter((row) => row.method === "sendMessage").map((row) => row.body.text);
  assert.deepEqual(textMessages.slice(0, 3), [
    "<b>❗ ДЛЯ РОМАНА:</b>", "<b>❗ ДЛЯ СЕРГЕЯ:</b>", "<b>❗ ДЛЯ ИЛЬИ:</b>",
  ]);
  const totalsText = textMessages[3];
  assert.match(totalsText, /^<b>Роман:<\/b>\n<b>ИТОГО: -55 492<\/b>\nVAULT 13: 318\nRbpoker: -45 353/);
  assert.match(totalsText, /\n\n<b>Сергей:<\/b>\n<b>ИТОГО: -462 148<\/b>\nAQUARIUM: -17 662\nOff Cheats: -185 822\nСССР: -258 664/);
  assert.match(totalsText, /\n\n<b>Илья:<\/b>\n<b>ИТОГО: 169 816<\/b>\nJokers: 169 816$/);
  const albumPhotos = sentMessages
    .filter((row) => row.method === "sendMediaGroup")
    .flatMap((row) => row.body.media.map((photo) => ({ method: "sendPhoto", body: { photo: photo.media, caption: photo.caption } })));
  const ilyaPhotoMessage = sentMessages.find((row) => row.method === "sendPhoto");
  const photos = [...albumPhotos, ilyaPhotoMessage];
  assert.equal(photos.length, 13);
  assert.ok(photos.every((row) => row.body.photo.includes("/assets/reports/unions/2026-08-03_2026-08-09/")));
  assert.ok(photos.every((row) => row.body.photo.endsWith("?v=refund-optional-2")));
  assert.deepEqual(photos.slice(0, 9).map((row) => row.body.caption.match(/^<b>(.+?)<\/b>/)[1]), [
    "VAULT 13", "Rbpoker", "QUASAR", "PPCUNION", "ONL YSTARS", "Ginger", "BRO.POKER", "Bambuk", "AF UNION",
  ]);
  assert.match(photos[0].body.caption, /<b>VAULT 13<\/b>/);
  assert.equal(photos.some((row) => row.body.caption.startsWith("<b>Анти-Рег</b>")), false);
  const bambuk = photos.find((row) => row.body.caption.startsWith("<b>Bambuk</b>"));
  assert.match(bambuk.body.caption, /Единый платёж за обслуживание 6%:/);
  assert.doesNotMatch(bambuk.body.caption, /Возврат джекпота/);
  const vault = photos.find((row) => row.body.caption.includes("<b>VAULT 13</b>"));
  assert.match(vault.body.caption, /Единый платёж за обслуживание 6%: -237,32/);
  assert.match(vault.body.caption, /Итого к расчёту: 318,33/);
  const ussr = photos.find((row) => row.body.caption.includes("<b>СССР</b>"));
  assert.match(ussr.body.caption, /Единый платёж за обслуживание 8%: -10 091,00/);
  const offCheats = photos.find((row) => row.body.caption.includes("<b>Off Cheats</b>"));
  assert.match(offCheats.body.caption, /Единый платёж за обслуживание 8%: -25 246,50/);
  assert.doesNotMatch(offCheats.body.caption, /Возврат джекпота/);
  const aquarium = photos.find((row) => row.body.caption.includes("<b>AQUARIUM</b>"));
  assert.match(aquarium.body.caption, /Единый платёж за обслуживание 6%: -276,19/);
  assert.match(aquarium.body.caption, /Итого к расчёту: -17 662,47/);
  const ppc = photos.find((row) => row.body.caption.startsWith("<b>PPCUNION</b>"));
  assert.match(ppc.body.caption, /Возврат джекпота: \+644,00/);
  assert.match(ppc.body.caption, /Итого к расчёту: 33 816,02/);
  assert.equal(photos.filter((row) => /Возврат джекпота/.test(row.body.caption)).length, 5);
  assert.equal(sentMessages[0].body.reply_to_message_id, 19);
  assert.equal(sentMessages[1].body.reply_to_message_id, undefined);
  assert.match(ilyaPhotoMessage.body.caption, /^<b>Jokers<\/b>/);
  const sergeyAlbum = sentMessages[3].body.media;
  assert.ok(sergeyAlbum.some((photo) => photo.caption.startsWith("<b>СССР</b>")));
});

test("/союзы итого отправляет только итоговое сообщение", async (t) => {
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options) => {
    sentMessages.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/союзы итого", 20), res);
  assert.deepEqual(res.body, { ok: true, unionTotals: true, sent: true });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].method, "sendMessage");
  assert.equal(sentMessages[0].body.reply_to_message_id, 20);
  assert.match(sentMessages[0].body.text, /^<b>Роман:<\/b>\n<b>ИТОГО: -55 492<\/b>\nVAULT 13: 318/);
  assert.match(sentMessages[0].body.text, /\n\n<b>Сергей:<\/b>\n<b>ИТОГО: -462 148<\/b>/);
  assert.match(sentMessages[0].body.text, /\n\n<b>Илья:<\/b>\n<b>ИТОГО: 169 816<\/b>\nJokers: 169 816$/);
});

test("/клубы отправляет отчёты один раз и повторно один запрос не обрабатывает", async (t) => {
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options) => {
    sentMessages.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  const request = update("/клубы", 21);
  request.body.update_id = 2100;
  await handler(request, res);
  assert.deepEqual(res.body, { ok: true, clubs: true, sent: true });
  assert.deepEqual(sentMessages.map((row) => row.method), [
    "sendMessage", "sendMediaGroup", "sendMessage", "sendMediaGroup", "sendMediaGroup", "sendMessage", "sendMediaGroup", "sendMessage", "sendMediaGroup", "sendMessage",
  ]);
  assert.ok(sentMessages.every((row) => row.body.reply_to_message_id === undefined));
  assert.deepEqual(sentMessages.filter((row) => row.method === "sendMediaGroup").map((row) => row.body.media.length), [10, 10, 3, 2, 3]);
  const photos = sentMessages.filter((row) => row.method === "sendMediaGroup").flatMap((row) => row.body.media);
  assert.equal(photos.length, 28);
  assert.deepEqual(sentMessages[1].body.media.map((photo) => photo.caption.match(/^<b>(.+?)<\/b>/)[1]), [
    "River21", "T O T", "Sibir 70", "Два Туза", "РИВЕР КЛУБ", "Храм", "PC Arena", "GoRiLaZzz", "GARAGE", "RealPokerGame",
  ]);
  assert.ok(photos.every((photo) => photo.media.endsWith("?v=club-salary-5")));
  assert.ok(photos.every((photo) => !photo.caption.includes("Возврат джекпота")));
  const dvaTuza = photos.find((photo) => photo.caption.startsWith("<b>Два Туза</b>"));
  assert.match(dvaTuza.caption, /ЗП: -1 500,00 ₽/);
  const kampashka = photos.find((photo) => photo.caption.startsWith("<b>Kampashka 21</b>"));
  assert.match(kampashka.caption, /Единый платёж за обслуживание 8%:/);
  assert.match(kampashka.caption, /ЗП: -1 500,00 ₽/);
  const collaboration = photos.find((photo) => photo.caption.startsWith("<b>Collaboration Club</b>"));
  assert.match(collaboration.caption, /Единый платёж за обслуживание 20%:/);
  const amigo = photos.find((photo) => photo.caption.startsWith("<b>Амиго</b>"));
  assert.match(amigo.caption, /Единый платёж за обслуживание 15%:/);
  const jokerPoker = photos.find((photo) => photo.caption.startsWith("<b>Joker♦️Poker</b>"));
  assert.match(jokerPoker.caption, /Единый платёж за обслуживание 8%:/);
  const jokerVip = photos.find((photo) => photo.caption.startsWith("<b>Joker♦️VIP♦️Poker</b>"));
  assert.match(jokerVip.caption, /Единый платёж за обслуживание 8%:/);
  assert.equal(sentMessages[5].body.text, "<b>❗ ДЛЯ ИЛЬИ:</b>");
  assert.equal(sentMessages[7].body.text, "<b>❗ ДЛЯ ТИМУРА:</b>");
  const kingsKo = photos.find((photo) => photo.caption.startsWith("<b>Kings KO</b>"));
  assert.match(kingsKo.caption, /Единый платёж за обслуживание 8%:/);
  const fishHunter = photos.find((photo) => photo.caption.startsWith("<b>Fish Hunter</b>"));
  assert.match(fishHunter.caption, /Единый платёж за обслуживание 15%:/);
  const ludomany = photos.find((photo) => photo.caption.startsWith("<b>Лудоманы</b>"));
  assert.match(ludomany.caption, /Единый платёж за обслуживание 15%:/);
  const firstRunCalls = sentMessages.length;
  const duplicateRes = responseRecorder();
  await handler(request, duplicateRes);
  assert.deepEqual(duplicateRes.body, { ok: true, clubs: true, duplicate: true });
  assert.equal(sentMessages.length, firstRunCalls);
});

test("/клубы итого отправляет только округлённую клубную сводку", async (t) => {
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options) => {
    sentMessages.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/клубы итого", 22), res);
  assert.deepEqual(res.body, { ok: true, clubTotals: true, sent: true });
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].method, "sendMessage");
  assert.equal(sentMessages[0].body.reply_to_message_id, 22);
  assert.match(sentMessages[0].body.text, /^<b>Роман:<\/b>\n<b>ИТОГО: -316 552<\/b>/);
  assert.match(sentMessages[0].body.text, /<b>Роман:<\/b>\n<b>ИТОГО: -316 552<\/b>\nRiver21: 6 611\nT O T: -558\nSibir 70: -2 819\nДва Туза: -337 847\nРИВЕР КЛУБ: -46\nХрам: 1 683\nPC Arena: 8 121\nGoRiLaZzz: 6 573\nGARAGE: 4 802\nRealPokerGame: -3 072/);
  assert.match(sentMessages[0].body.text, /Два Туза: -337 847/);
  assert.match(sentMessages[0].body.text, /\n\n<b>Сергей:<\/b>\n<b>ИТОГО: 183 019<\/b>/);
  assert.match(sentMessages[0].body.text, /\n\n<b>Илья:<\/b>\n<b>ИТОГО: -173 740<\/b>\nJoker♦️Poker: -115 346/);
  assert.match(sentMessages[0].body.text, /\n\n<b>Тимур:<\/b>\n<b>ИТОГО: 471 380<\/b>\nFish Hunter: 107 867/);
});

test("/китайцы выводит союзы, рейк, процент и итог с картинкой", async (t) => {
  const originalFetch = global.fetch;
  const sentMessages = [];
  global.fetch = async (url, options) => {
    sentMessages.push({ method: url.split("/").at(-1), body: JSON.parse(options.body) });
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/китайцы", 23), res);
  assert.deepEqual(res.body, { ok: true, chinese: true, sent: true });
  assert.deepEqual(sentMessages.map((row) => row.method), ["sendPhoto"]);
  assert.equal(sentMessages[0].body.reply_to_message_id, undefined);
  const lines = sentMessages[0].body.caption.split("\n");
  assert.ok(sentMessages[0].body.caption.length <= 1024);
  assert.equal(lines[0], "<b>ИТОГО РЕЙК: 2 830 227,24</b>");
  assert.ok(!lines.some((line) => line.includes("Anti-Reg")));
  assert.ok(lines.includes("<b>ИТОГО ПРОЦЕНТ: 212 763,77</b>"));
  assert.ok(lines.includes("60% Джеку = 127 658,26"));
  assert.ok(lines.includes("40% наша доля = 85 105,51"));
  assert.ok(!lines.includes("<b>Распределение нашей доли:</b>"));
  assert.equal(sentMessages[0].body.photo, "https://poker21-app.vercel.app/assets/reports/share/2026-08-03_2026-08-09.png?v=share-table-3");
});

test("/доля выводит только распределение нашей доли", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = { method: url.split("/").at(-1), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/доля", 24), res);
  assert.deepEqual(res.body, { ok: true, share: true, sent: true });
  assert.equal(sentMessage.method, "sendPhoto");
  const lines = sentMessage.body.caption.split("\n");
  assert.equal(lines[0], "<b>ИТОГО РЕЙК: 2 830 227,24</b>");
  assert.ok(lines.includes("<b>ИТОГО ПРОЦЕНТ: 212 763,77</b>"));
  assert.ok(lines.includes("60% Джеку = 127 658,26"));
  assert.ok(lines.includes("40% наша доля = 85 105,51"));
  assert.ok(lines.includes("<b>Распределение нашей доли:</b>"));
  assert.ok(lines.includes("Андрюха 2% = 4 255,28"));
  assert.ok(lines.includes("Серёга 3,25% = 6 914,82"));
  assert.ok(lines.includes("Илюха 7% = 14 893,46"));
  assert.equal(lines.at(-1), "Роман 14,75% = 31 382,66");
  assert.equal(sentMessage.body.photo, "https://poker21-app.vercel.app/assets/reports/share/2026-08-03_2026-08-09-full.png?v=share-full-1");
});

test("/сводка выводит итоги по направлениям с откатами и зарплатой", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = { method: url.split("/").at(-1), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/сводка", 25), res);
  assert.deepEqual(res.body, { ok: true, summary: true, sent: true });
  assert.equal(sentMessage.method, "sendMessage");
  assert.match(sentMessage.body.text, /1\. Доля разработчика \(китайцев\): <b>127 658,26<\/b> — \/китайцы/);
  assert.match(sentMessage.body.text, /2\. Наша доля: <b>85 105,51<\/b> — \/доля/);
  assert.match(sentMessage.body.text, /3\. Джекпоты: <b>294 238,18<\/b> — \/джекпот/);
  assert.match(sentMessage.body.text, /4\. Клубы нашего союза \(Anti-Reg\): <b>164 106,45<\/b> — \/клубы итого/);
  assert.match(sentMessage.body.text, /5\. Другие союзы без Anti-Reg: <b>-347 824,03<\/b> — \/союзы итого/);
  assert.match(sentMessage.body.text, /6\. Откаты: <b>\+11 626,32<\/b> — \/откаты/);
  assert.match(sentMessage.body.text, /7\. Оверлей: <b>-342 333,10<\/b> — \/оверлеи/);
  assert.match(sentMessage.body.text, /8\. ЗП: <b>\+3 000,00<\/b> — \/клубы/);
  assert.match(sentMessage.body.text, /8\. ЗП: <b>\+3 000,00<\/b> — \/клубы\n\n<b>ИТОГО: -4 422,41<\/b>$/);
});

test("/откаты распределяет клубную разницу выше 8%", async (t) => {
  const originalFetch = global.fetch;
  let sentMessage = null;
  global.fetch = async (url, options) => {
    sentMessage = { method: url.split("/").at(-1), body: JSON.parse(options.body) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const res = responseRecorder();
  await handler(update("/откаты", 26), res);
  assert.deepEqual(res.body, { ok: true, kickbacks: true, sent: true });
  assert.equal(sentMessage.method, "sendMessage");
  assert.match(sentMessage.body.text, /<b>Роман:<\/b>[\s\S]*GoRiLaZzz 10% — \+31,21/);
  assert.match(sentMessage.body.text, /<b>Итого Роману: 218,89<\/b>/);
  assert.match(sentMessage.body.text, /<b>Итого Сергею: 6 204,59<\/b>/);
  assert.match(sentMessage.body.text, /<b>Итого Тимуру: 5 202,85<\/b>/);
  assert.match(sentMessage.body.text, /<b>ВСЕГО ОТКАТОВ: 11 626,32<\/b>/);
  assert.doesNotMatch(sentMessage.body.text, /Два Туза/);
});

test("привязанный чат получает только команды и данные своего клуба", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const method = String(url).split("/").at(-1);
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    if (method === "getChatMember") return { ok: true, json: async () => ({ ok: true, result: { status: "administrator" } }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const bindRes = responseRecorder();
  await handler(groupUpdate("/привязать Два Туза", 70), bindRes);
  assert.equal(bindRes.body.binding, true);
  assert.equal(bindRes.body.type, "club");
  assert.equal(bindRes.body.clubId, "758417");

  const commandsRes = responseRecorder();
  await handler(groupUpdate("/команды", 71), commandsRes);
  assert.deepEqual(commandsRes.body, { ok: true, clubMode: true, commands: true, sent: true });
  assert.match(calls.at(-1).body.text, /Команды клуба «Два Туза»/);
  assert.doesNotMatch(calls.at(-1).body.text, /\/сводка/);

  const reportRes = responseRecorder();
  await handler(groupUpdate("/мой клуб", 72), reportRes);
  assert.deepEqual(reportRes.body, { ok: true, clubMode: true, report: true, sent: true });
  assert.equal(calls.at(-1).method, "sendPhoto");
  assert.match(calls.at(-1).body.caption, /^<b>Два Туза<\/b>/);

  const callsBeforeChat = calls.length;
  const chatRes = responseRecorder();
  await handler(groupUpdate("привет", 721), chatRes);
  assert.deepEqual(chatRes.body, { ok: true, clubMode: true, ignored: true });
  assert.equal(calls.length, callsBeforeChat, "бот не должен отвечать на обычную переписку");

  const restrictedRes = responseRecorder();
  await handler(groupUpdate("/сводка", 73), restrictedRes);
  assert.equal(restrictedRes.body.restricted, true);
  assert.match(calls.at(-1).body.text, /доступна только статистика клуба «Два Туза»/);

  const unbindRes = responseRecorder();
  await handler(groupUpdate("/отвязать", 74), unbindRes);
  assert.equal(unbindRes.body.unbound, true);
});

test("группу можно привязать к союзу по названию", async (t) => {
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    const method = String(url).split("/").at(-1);
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    if (method === "getChatMember") return { ok: true, json: async () => ({ ok: true, result: { status: "creator" } }) };
    return { ok: true, json: async () => ({ ok: true }) };
  };
  t.after(() => { global.fetch = originalFetch; });
  const chatId = -100999000222;

  const bindRes = responseRecorder();
  await handler(groupUpdate("/привязать Rbpoker", 80, chatId), bindRes);
  assert.equal(bindRes.body.binding, true);
  assert.equal(bindRes.body.type, "union");
  assert.equal(bindRes.body.leagueId, "854851");

  const commandsRes = responseRecorder();
  await handler(groupUpdate("/команды", 81, chatId), commandsRes);
  assert.match(calls.at(-1).body.text, /Команды союза «Rbpoker»/);
  assert.match(calls.at(-1).body.text, /<b>\/клубы_союза<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>\/игроки рейк<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>\/игрок ID или ник<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>\/итого_союза<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>\/топ_клубов рейк<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>\/автоотчет вкл<\/b>/);
  assert.doesNotMatch(calls.at(-1).body.text, /\/мой союз/);
  assert.doesNotMatch(calls.at(-1).body.text, /\/сводка/);

  const reportRes = responseRecorder();
  await handler(groupUpdate("/отчет", 82, chatId), reportRes);
  assert.equal(reportRes.body.sent, true);
  assert.equal(calls.at(-1).method, "sendPhoto");
  assert.match(calls.at(-1).body.caption, /^<b>Rbpoker<\/b>/);
  assert.equal(calls.at(-1).body.reply_markup.inline_keyboard[0][0].callback_data, "bound:clubs");
  const webhookSetup = calls.find((call) => call.method === "setWebhook");
  assert.deepEqual(webhookSetup.body.allowed_updates, ["message", "edited_message", "callback_query"]);

  const callbackRes = responseRecorder();
  await handler(callbackUpdate("bound:clubs", 820, chatId), callbackRes);
  assert.equal(callbackRes.body.unionClubs, true);
  assert.ok(calls.some((call) => call.method === "answerCallbackQuery" && call.body.callback_query_id === "callback-820"));
  assert.match(calls.at(-1).body.text, /Клубы союза Rbpoker/);

  const totalRes = responseRecorder();
  await handler(groupUpdate("/итого_союза", 821, chatId), totalRes);
  assert.deepEqual(totalRes.body, { ok: true, clubMode: true, unionTotal: true, sent: true });
  assert.match(calls.at(-1).body.text, /Rbpoker — короткое итого/);

  const clubTopRes = responseRecorder();
  await handler(groupUpdate("/топ_клубов рейк", 822, chatId), clubTopRes);
  assert.deepEqual(clubTopRes.body, { ok: true, clubMode: true, unionClubTop: "рейк", sent: true });
  assert.match(calls.at(-1).body.text, /Топ клубов по рейку — Rbpoker/);
  assert.match(calls.at(-1).body.text, /1\. <b>Pokerrates<\/b> — 38 741,61/);

  const autoRes = responseRecorder();
  await handler(groupUpdate("/автоотчет вкл", 823, chatId), autoRes);
  assert.equal(autoRes.body.autoReport, true);
  assert.match(calls.at(-1).body.text, /Автоотчёт: включён/);

  const playersRes = responseRecorder();
  await handler(groupUpdate("/игроки рейк", 83, chatId), playersRes);
  assert.deepEqual(playersRes.body, { ok: true, clubMode: true, unionPlayers: "рейк", sent: true });
  assert.equal(calls.at(-1).method, "sendMessage");
  assert.match(calls.at(-1).body.text, /Топ-10 игроков по рейку — Rbpoker/);

  const playerRes = responseRecorder();
  await handler(groupUpdate("/игрок 237780", 831, chatId), playerRes);
  assert.deepEqual(playerRes.body, { ok: true, clubMode: true, unionPlayer: "237780", sent: true });
  assert.match(calls.at(-1).body.text, /<b>Major \(237780\) — Rbpoker<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>Рейк: 9 293,08<\/b>/);
  assert.match(calls.at(-1).body.text, /Страховка: 0,00/);
  assert.doesNotMatch(calls.at(-1).body.text, /джекпот/iu);

  const foreignPlayerRes = responseRecorder();
  await handler(groupUpdate("/игрок молоток", 832, chatId), foreignPlayerRes);
  assert.match(calls.at(-1).body.text, /в союзе «Rbpoker» не найден/);

  const clubsRes = responseRecorder();
  await handler(groupUpdate("/клубы_союза", 84, chatId), clubsRes);
  assert.deepEqual(clubsRes.body, { ok: true, clubMode: true, unionClubs: true, found: true, sent: true });
  assert.match(calls.at(-1).body.text, /<b>Клубы союза Rbpoker<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>Pokerrates<\/b>[\s\S]*Игроков всего: 28[\s\S]*Активных игроков: 28[\s\S]*Win\/Lose: [\s\S]*Рейк: [\s\S]*<b>Итого:/);
  assert.match(calls.at(-1).body.text, /<b>PokerJoker21<\/b>[\s\S]*Игроков всего: 4[\s\S]*Активных игроков: 4/);
  assert.match(calls.at(-1).body.text, /<b>Итого: -34 065,69<\/b>\n\n2\. <b>PokerJoker21<\/b>/);
  assert.match(calls.at(-1).body.text, /\nИгроков всего: 32\nАктивных игроков: 32\n/);
  assert.match(calls.at(-1).body.text, /<b>Итого Win\/Lose: -90 676,44<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>Итого рейк: 44 268,25<\/b>/);
  assert.match(calls.at(-1).body.text, /<b>Общий итог: -46 408,19<\/b>/);

  const datedClubsRes = responseRecorder();
  await handler(groupUpdate("/клубы_союза 03.08-09.08", 85, chatId), datedClubsRes);
  assert.equal(datedClubsRes.body.found, true);
  assert.match(calls.at(-1).body.text, /Период: 03\.08\.2026–09\.08\.2026/);

  const unbindRes = responseRecorder();
  await handler(groupUpdate("/отвязать", 86, chatId), unbindRes);
  assert.equal(unbindRes.body.unbound, true);
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
