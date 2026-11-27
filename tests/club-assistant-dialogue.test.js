"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const assistant = require("../lib/club-assistant");
const { periods } = require("../data/union-periods.json");

const now = new Date("2026-11-27T19:24:00Z");
const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
const start = source.indexOf("async function answerClubQuestion(");
const end = source.indexOf("async function handler(", start);

function dialogue(role = "owner") {
  const values = new Map();
  const messages = [];
  const member = { clubId: "758417", role, name: "Два Туза" };
  const handler = vm.runInNewContext(source.slice(start, end) + "\nhandlePrivateClubAssistant", {
    require(name) {
      if (name === "../club-team") return { clubMemberships: async () => [member] };
      assert.equal(name, "../club-assistant");
      return { ...assistant, periodFor: text => assistant.periodFor(text, now) };
    },
    insightPeriods: () => periods,
    latestUnionData: periods[0],
    boundClubData: ({ clubId }, report) => report.directory?.clubs.find(club => String(club.id) === clubId),
    module: { exports: { clubBalances: async () => ({ accounts: [{
      rub: 55_000, paymentRub: 25_000, operations: ["Пополнение 100 ₽"],
      operationRows: [{ at: "2026-11-26T10:00:00+03:00" }],
    }] }) } },
    cabinetAccountIds: async () => new Map([[member.clubId, new Set(["club-chat"])]]),
    allRequisiteItems: async () => [
      { id: "local", status: "confirmed", payer: { chatId: "club-chat" }, amountCents: 50_000, confirmedAt: "2026-11-26T10:00:00+03:00" },
      { id: "foreign", status: "confirmed", payer: { chatId: "other-chat" }, amountCents: 999_000, confirmedAt: "2026-11-26T10:00:00+03:00" },
    ],
    requisiteSearchEvents: item => [Date.parse(item.confirmedAt)],
    formatPaymentAmount: item => (item.amountCents / 100).toFixed(2),
    requisiteSearchStatus: item => item.status,
    formatBalanceTimestamp: value => String(value),
    reportIndex: { reports: [] },
    historicalClubReports: () => [],
    displayIso: date => date,
    formatRub: value => value.toFixed(2),
    telegram: async (_, { text }) => { messages.push(text); return { ok: true }; },
    redisPipeline: async commands => commands.map(([op, key, value]) => {
      if (op === "SET") values.set(key, value);
      return { result: values.get(key) };
    }),
  });
  return async (text, type = "private") => {
    const count = messages.length;
    await handler({ message: { text, chat: { id: 1, type }, from: { id: 1 } } });
    return messages.length > count ? messages.at(-1) : null;
  };
}

for (const phrase of ["Привет!", "Доброе утро", "Здарова", "Привет 👋", "Здравствуйте", "Добрый вечер"]) {
  test("личное приветствие: " + phrase, async () => {
    const ask = dialogue();
    assert.match(await ask(phrase), /^Привет!/);
    assert.equal(await ask(phrase, "group"), null);
  });
}

test("месяц, два показателя и прозрачное покрытие", async () => {
  const ask = dialogue();
  const reply = await ask("Привет, покажи рэйк и выигрыш в ноябре 2026");
  assert.match(reply, /^Привет!/);
  assert.match(reply, /Рейк за 2026-11-01–2026-11-30\nЧастичный итог: 2002171\.92/);
  assert.match(reply, /Игровой результат за 2026-11-01–2026-11-30/);
  assert.doesNotMatch(reply, /2026-10-26/);
});

test("переключение показателя и продолжение на другой месяц", async () => {
  const ask = dialogue();
  await ask("сколько рэйка набежало в ноябре 2026?");
  assert.match(await ask("А выигрыш?"), /Игровой результат за 2026-11/);
  assert.match(await ask("А, в октябре 2026?"), /Игровой результат за 2026-10/);
});

test("ответ за неделю показывает рейк или результат по запросу", async () => {
  const ask = dialogue();
  const rake = await ask("какой рейк клуба за 22.11.2026?");
  assert.match(rake, /594453\.86/);
  assert.match(rake, /Отдельных данных за 2026-11-22 нет/);
  const result = await ask("а проигрыш?");
  assert.match(result, /Игровой результат: -851770\.53/);
  assert.doesNotMatch(result, /Рейк:/);
});

test("уточнение без контекста и закрытый доступ к отчёту", async () => {
  assert.match(await dialogue()("А в октябре 2026?"), /Сначала задайте вопрос/);
  const staff = await dialogue("staff")("рейк за ноябрь 2026");
  assert.match(staff, /доступны владельцу/);
  assert.doesNotMatch(staff, /2002171/);
});

test("неизвестный вопрос сопровождается подсказкой в активном диалоге", async () => {
  const ask = dialogue();
  assert.equal(await ask("непонятный запрос"), null);
  await ask("Привет");
  assert.match(await ask("непонятный запрос"), /Уточните, что посмотреть/);
  assert.match(await ask("спс"), /Пожалуйста/);
});

test("ошибки дат и многозначность периода", () => {
  assert.ok(assistant.periodFor("за 31.11.2026", now).error);
  assert.ok(assistant.periodFor("в ноябре и октябре", now).error);
  assert.deepEqual(assistant.periodFor("за минувший месяц", now).month, ["2026-10-01", "2026-10-31"]);
  assert.deepEqual(assistant.periodFor("позавчера", now), { date: "2026-11-25" });
  assert.ok(assistant.followUpFor("А за минувшую неделю?").period.week);
});

test("баланс и история операций сохраняют права владельца", async () => {
  const request = "Баланс и операции за 26.11.2026";
  const owner = await dialogue()(request);
  assert.match(owner, /Основной: 550.00/);
  assert.match(owner, /Пополнение 100/);
  const staff = await dialogue("staff")(request);
  assert.match(staff, /История операций доступна владельцу/);
  assert.doesNotMatch(staff, /Пополнение 100/);
});

test("сделки клуба, направление и итог коротким уточнением", async () => {
  const ask = dialogue();
  const reply = await ask("Подтверждённые сделки за 26.11.2026");
  assert.match(reply, /local/);
  assert.doesNotMatch(reply, /foreign/);
  assert.match(await ask("Только исходящие"), /исходящие/);
  assert.match(await ask("А на какую сумму?"), /Общая сумма: 500.00/);
});

const monthlyCases = [
  ["январе 2026", "2026-01-01", "2026-01-31"],
  ["феврале 2026", "2026-02-01", "2026-02-28"],
  ["марте 2026", "2026-03-01", "2026-03-31"],
  ["апреле 2026", "2026-04-01", "2026-04-30"],
  ["мае 2026", "2026-05-01", "2026-05-31"],
  ["июне 2026", "2026-06-01", "2026-06-30"],
  ["июле 2026", "2026-07-01", "2026-07-31"],
  ["августе 2026", "2026-08-01", "2026-08-31"],
  ["сентябре 2026", "2026-09-01", "2026-09-30"],
  ["октябре 2026", "2026-10-01", "2026-10-31"],
  ["ноябре 2026", "2026-11-01", "2026-11-30"],
  ["декабре 2026", "2026-12-01", "2026-12-31"],
];

function reportedTotal(field, start, end) {
  const values = new Map();
  for (const report of periods) {
    if (report.startDate < start || report.endDate > end) continue;
    const value = report.directory?.clubs.find(club => String(club.id) === "758417")?.[field];
    if (Number.isFinite(value)) values.set(report.startDate + "/" + report.endDate, Math.round(value * 100));
  }
  return values.size ? ([...values.values()].reduce((sum, value) => sum + value, 0) / 100).toFixed(2) : null;
}

for (const [month, start, end] of monthlyCases) {
  for (const [phrase, label, field] of [
    ["Сколько набежало рейка", "Рейк", "rake"],
    ["Покажи рэйк клуба", "Рейк", "rake"],
    ["Какой у клуба был рейк", "Рейк", "rake"],
    ["Какой был выигрыш клуба", "Игровой результат", "winnings"],
    ["Какой у нас проигрыш", "Игровой результат", "winnings"],
    ["Покажи игровой результат", "Игровой результат", "winnings"],
  ]) {
    const question = phrase + " в " + month + "?";
    test(question, async () => {
      const reply = await dialogue()(question);
      assert.ok(reply.includes(label + " за " + start + "–" + end));
      const total = reportedTotal(field, start, end);
      if (total === null) assert.match(reply, /нет отчётов/);
      else assert.ok(reply.includes(": " + total), reply);
    });
  }
}

for (const [phrase, date] of [
  ["за сегодня", "2026-11-27"],
  ["за вчера", "2026-11-26"],
  ["за позавчера", "2026-11-25"],
  ["за минувшую неделю", "2026-11-16"],
  ["за прошлую неделю", "2026-11-16"],
  ["неделю назад", "2026-11-16"],
  ["за текущую неделю", "2026-11-23"],
  ["за эту неделю", "2026-11-23"],
  ["за 22.11.2026", "2026-11-22"],
  ["за 2026-11-09", "2026-11-09"],
]) {
  test("Период " + phrase, () => {
    assert.equal(assistant.periodFor("Рейк " + phrase, now).date, date);
  });
}

for (const phrase of ["благодарю", "спасибо большое", "ясно", "принято", "окей", "понятно"]) {
  test("Завершение диалога: " + phrase, async () => {
    const ask = dialogue();
    assert.equal(await ask(phrase), null);
    await ask("Привет");
    assert.match(await ask(phrase), /Пожалуйста/);
  });
}

for (const phrase of ["рейк за ноябрь 2026", "проигрыш за 22.11.2026", "покажи отчёт за прошлую неделю"]) {
  test("Доступ менеджера: " + phrase, async () => {
    const reply = await dialogue("staff")(phrase);
    assert.match(reply, /доступны владельцу/);
    assert.doesNotMatch(reply, /594453|851770|2002171/);
  });
}
