"use strict";

const HELP = [
  "Помощник клуба. Можно спросить своими словами:",
  "• Какой у нас баланс и какие были последние операции?",
  "• Покажи отчёт за прошлую неделю",
  "• Какие сделки ждут подтверждения?",
  "• Сколько рейка у игрока 735493 за 22.11.2026?",
  "После ответа можно уточнить: «А на какую сумму?», «Только исходящие» или «А за вчера?».",
  "После списка сделок или игроков можно написать «Скинь это в Excel».",
  "Если клубов несколько, /помощник откроет выбор клуба.",
].join("\n");

function intent(text) {
  const words = text.toLowerCase().replace(/ё/g, "е");
  return {
    player: /игрок|рейкбэк|рейкбек|ник(?:[аиу]|\s|$)|\bid\b.*(?:рейк|выигрыш)/u.test(words),
    balance: /баланс|остаток|касс|движени|проводк|операци|списан|зачислен|куда делись/u.test(words),
    report: /отчет|итог.*недел|рейк|выигрыш|сколько.*игрок/u.test(words),
    deals: /сделк|реквизит|перевод|перевел|отправил.*денег|подтвержден|платеж|поступлен|заявк.*(?:оплат|подтвержд)/u.test(words),
  };
}

const previousWeek = /прошл\S*\s+недел|(?:неделю|неделей)\s+назад/u;
const earlierWeek = /(?:неделю|неделей)\s+(?:до\s+(?:этого|того)|раньше)|(?:предыдущую|предыдущей)\s+неделю/u;
const normalizeQuestion = text => text.toLowerCase().replace(/ё/g, "е").trim().replace(/[.!?]+$/u, "").trim();

function smallTalk(question) {
  const words = normalizeQuestion(question);
  if (/^(?:ты\s+)?(?:на связи|тут|здесь|работаешь|онлайн)$|^(?:привет|здравствуй(?:те)?|добрый день)$/u.test(words)) return "presence";
  if (/^(?:спасибо(?: большое)?|благодарю|понял[аи]?|ясно|ок(?:ей)?)$/u.test(words)) return "ack";
  if (/^(?:что (?:ты )?умеешь|чем (?:ты )?можешь помочь|как (?:это|ты) работаешь)$/u.test(words)) return "help";
  return null;
}

function weekBefore(context) {
  const anchor = Date.parse(context.reportDate || context.period?.date);
  if (!Number.isFinite(anchor)) return null;
  const days = (new Date(anchor).getUTCDay() + 6) % 7 + 7;
  return { date: new Date(anchor - days * 86400000).toISOString().slice(0, 10), week: true };
}

function periodFor(question, now = new Date()) {
  const date = /(?:^|\D)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/u.exec(question);
  const iso = /\b\d{4}-\d{2}-\d{2}\b/u.exec(question);
  const value = date ? [date[3], date[2].padStart(2, "0"), date[1].padStart(2, "0")].join("-") : iso?.[0];
  if (value) {
    if ((question.match(/\d{4}-\d{2}-\d{2}|\d{1,2}\.\d{1,2}\.\d{4}/gu) || []).length > 1) {
      return { error: "Укажите одну дату интересующей недели в формате ДД.ММ.ГГГГ." };
    }
    const time = Date.parse(value);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
      ? { date: value } : { error: "Проверьте дату и укажите её в формате ДД.ММ.ГГГГ." };
  }
  const normalized = question.toLowerCase().replace(/ё/g, "е");
  if (/(?:за|с)\s+\d{1,2}\.\d{1,2}(?![.\d])|\b20\d{2}\b|месяц|квартал|(?:^|[^\p{L}])год(?:а|у|ом|е)?(?!\p{L})|(?:последн\S*\s+)?\d+\s+недел|понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье/u.test(normalized)) {
    return { error: "Укажите одну дату интересующей недели в формате ДД.ММ.ГГГГ." };
  }
  const moscowToday = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  const today = Date.parse(moscowToday);
  const daysAgo = /позавчера/u.test(normalized) ? 2 : /вчера/u.test(normalized) ? 1 : /сегодня/u.test(normalized) ? 0 : null;
  if (daysAgo !== null) {
    return { date: new Date(today - daysAgo * 86400000).toISOString().slice(0, 10) };
  }
  const previous = previousWeek.test(normalized);
  if (previous || /(?:эт\S*|текущ\S*)\s+недел/u.test(normalized)) {
    const offset = (new Date(today).getUTCDay() + 6) % 7 + (previous ? 7 : 0);
    return { date: new Date(today - offset * 86400000).toISOString().slice(0, 10), week: true };
  }
  return {};
}

function dealDirection(question) {
  const incoming = /входящ|поступивш/iu.test(question);
  const outgoing = /исходящ/iu.test(question);
  if (incoming === outgoing) return null;
  return incoming ? "incoming" : "outgoing";
}

function excelRequest(question) {
  const words = normalizeQuestion(question);
  if (!/(?:^|\s)(?:excel|эксель|эксел|xlsx|\.xlsx)(?:$|\s)/u.test(words)) return null;
  if (!/(?:скинь|отправь|выгрузи|экспорт|сохрани|скачай|в excel|в эксел|в xlsx)/u.test(words)
    && !/^(?:excel|эксель|xlsx)$/u.test(words)) return null;
  if (/игрок/u.test(words)) return "players";
  if (/сделк|перевод|реквизит/u.test(words)) return "deals";
  return "auto";
}

const followUpPeriod = /(?:^|\s)(?:(?:за|на)\s+)?(?:позавчера|вчера|сегодня|(?:неделю|неделей) назад|прошлую неделю|эту неделю|текущую неделю|\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})(?=$|\s|[,.;])/u;

function dealFilters(question) {
  let rest = question.replace(/^(?:(?:а|и|теперь|тогда|лучше|давай|покажи|оставь|только)\s+)+/u, "");
  const period = followUpPeriod.exec(rest);
  if (period) rest = (rest.slice(0, period.index) + " " + rest.slice(period.index + period[0].length)).trim();
  let direction = null, status = null;
  rest = rest.replace(/(^|\s)(входящие|исходящие)(?=$|\s)/u, (_, space, value) => {
    direction = value === "входящие" ? "incoming" : "outgoing";
    return space;
  });
  const statuses = [
    [/ждут подтверждения|ожидают подтверждения|неподтвержденные/u, "paid"],
    [/подтвержденные|закрытые/u, "confirmed"],
    [/отмененные/u, "cancelled"],
    [/незавершенные|в работе/u, "pending"],
    [/любого статуса|все статусы/u, "all"],
  ];
  for (const [pattern, value] of statuses) {
    const match = pattern.exec(rest);
    if (!match) continue;
    if (status) return null;
    status = value;
    rest = rest.slice(0, match.index) + " " + rest.slice(match.index + match[0].length);
  }
  rest = rest.replace(/[,;]/gu, " ").trim().replace(/\s+/gu, " ");
  const view = /^(?:(?:а|и) )?(?:(?:на )?какую сумму|на сколько всего|сколько их|сколько всего|итого)$/u.exec(rest)?.[0];
  if (!direction && !status && !period) return null;
  if (rest && !/^(?:сделки|сделок|только|сделки только|только сделки)$/u.test(rest) && !view) return null;
  return { direction, status, period: period ? periodFor(period[0]) : null,
    total: Boolean(view && !/сколько их/u.test(view)), count: Boolean(view && /сколько их/u.test(view)) };
}

function followUpFor(question) {
  const words = normalizeQuestion(question)
    .replace(/^(?:нет|да|хм)[, ]+|(?:,? пожалуйста)$/gu, "").trim();
  const prefix = /^(?:а|и|тогда)\s+/u.test(words);
  const phrase = words.replace(/^(?:а|и|тогда)\s+/u, "");
  const compare = /^(?:(?:сравни(?: это)?|сравнение) с (?:прошлой|предыдущей) неделей|(?:(?:это|рейк|выигрыш) )?(?:больше|меньше),? чем (?:неделю назад|на прошлой неделе)|(?:на сколько|насколько) изменил(?:ся|ось)(?: рейк| выигрыш| результат)?)$/u.test(phrase);
  const direction = dealDirection(phrase);
  const total = /^(?:на какую сумму|какая (?:общая )?сумма|сколько (?:всего(?: вышло)?|по сумме|вышло)|итого|сумма|(?:покажи|посчитай) (?:общую )?сумму)(?:\s+(?:всего|по ним))?$/u.test(phrase);
  const count = /^(?:сколько их(?: всего)?|а их сколько|сколько получилось)$/u.test(phrase);
  const directionOnly = /^(?:(?:только|покажи)\s+)?(?:входящие|исходящие)(?:\s+(?:только|сделки))?$/u.test(phrase);
  const allDirections = /^(?:(?:теперь|покажи)\s+)?(?:обе стороны|все направления|без фильтра по направлению)$/u.test(phrase);
  const metric = /^(?:(?:какой|сколько|покажи)\s+)?(?:у него\s+)?(рейк|выигрыш|игровой результат)(?:\s+у него)?$/u.exec(phrase)?.[1];
  const dealDetail = /^(?:когда (?:ее |его |сделку )?подтвердили|в какое время подтвердили)$/u.test(phrase) ? "confirmedAt"
    : /^(?:какой (?:у нее |у сделки )?статус|что со сделкой|(?:(?:ее|его) )?(?:уже )?подтвердили(?: уже)?|статус(?: сделки)?)$/u.test(phrase) ? "status" : null;
  const earlier = /^(?:еще )?раньше$/u.test(phrase) || earlierWeek.test(phrase)
    && /^(?:(?:за|на)\s+)?(?:(?:еще\s+)?(?:неделю|неделей)\s+(?:до\s+(?:этого|того)|раньше)|предыдущую\s+неделю)$/u.test(
      phrase.replace(/^(?:(?:а )?(?:какой|сколько|какая был[ао]?)\s+)?(?:рейк[ау]?|выигрыш)\s+(?:был\s+)?/u, "")
        .replace(/[\s,]+(?:(?:какой|сколько)\s+)?(?:был\s+)?(?:рейк[ау]?|выигрыш)(?:\s+был)?$/u, "")
    );
  const period = periodFor(phrase);
  const periodOnly = (/^(?:неделю|неделей) назад$/u.test(phrase) || prefix || /^(?:за|на)\s/u.test(phrase))
    && /^(?:(?:за|на)\s+)?(?:позавчера|вчера|сегодня|(?:неделю|неделей) назад|прошлую неделю|эту неделю|текущую неделю|\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})$/u.test(phrase);
  if (compare || earlier || total || count || directionOnly || allDirections || dealDetail || (metric && (prefix || /у него/u.test(phrase))) || periodOnly) {
    return { compare, earlier, total, count, direction, allDirections, metric, dealDetail, period: periodOnly ? period : null };
  }
  const datedMetric = followUpPeriod.exec(phrase);
  if (datedMetric && (prefix || /у него|у нее/u.test(phrase))) {
    const rest = (phrase.slice(0, datedMetric.index) + " " + phrase.slice(datedMetric.index + datedMetric[0].length)).trim();
    const metric = /^(?:(?:какой|сколько)\s+)?(?:у (?:него|нее)\s+)?(?:было?\s+)?(рейк[ау]?|выигрыш|игровой результат)(?:\s+у (?:него|нее))?$/u.exec(rest)?.[1];
    if (metric) return { metric: metric.startsWith("рейк") ? "рейк" : metric, period: periodFor(datedMetric[0]) };
  }
  if (prefix || /^(?:только|теперь|лучше|оставь)\s/u.test(phrase)) {
    const filters = dealFilters(phrase);
    if (filters) return filters;
  }
  return null;
}

const containsDate = (period, date) => !date || period[0] <= date && date <= period[1];
const inPeriod = (at, { date, week }) => {
  if (!date) return true;
  const start = Date.parse(date + "T00:00:00+03:00");
  const time = Date.parse(at);
  return time >= start && time < start + (week ? 7 : 1) * 86400000;
};

module.exports = { HELP, intent, periodFor, dealDirection, followUpFor, excelRequest, smallTalk, weekBefore, containsDate, inPeriod };
