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
  if (/(?:за|с)\s+\d{1,2}\.\d{1,2}(?![.\d])|\b20\d{2}\b|месяц|квартал|(?:^|[^\p{L}])год(?:а|у|ом|е)?(?!\p{L})|(?:последн\S*\s+)?\d+\s+недел|понедельник|вторник|среду|четверг|пятницу|субботу|воскресенье|позавчера/u.test(normalized)) {
    return { error: "Укажите одну дату интересующей недели в формате ДД.ММ.ГГГГ." };
  }
  const moscowToday = new Date(now.getTime() + 3 * 3600000).toISOString().slice(0, 10);
  const today = Date.parse(moscowToday);
  const yesterday = /вчера/u.test(normalized);
  if (yesterday || /сегодня/u.test(normalized)) {
    return { date: new Date(today - (yesterday ? 86400000 : 0)).toISOString().slice(0, 10) };
  }
  const previous = /прошл\S*\s+недел/u.test(normalized);
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
  const words = question.toLowerCase().replace(/ё/g, "е").replace(/[.!?]+$/u, "").trim();
  if (!/(?:^|\s)(?:excel|эксель|эксел|xlsx|\.xlsx)(?:$|\s)/u.test(words)) return null;
  if (!/(?:скинь|отправь|выгрузи|экспорт|сохрани|скачай|в excel|в эксел|в xlsx)/u.test(words)
    && !/^(?:excel|эксель|xlsx)$/u.test(words)) return null;
  if (/игрок/u.test(words)) return "players";
  if (/сделк|перевод|реквизит/u.test(words)) return "deals";
  return "auto";
}

function followUpFor(question) {
  const words = question.toLowerCase().replace(/ё/g, "е").replace(/[.!?]+$/u, "").trim();
  const prefix = /^(?:а|и|тогда)\s+/u.test(words);
  const phrase = words.replace(/^(?:а|и|тогда)\s+/u, "");
  const direction = dealDirection(phrase);
  const total = /^(?:на какую сумму|какая (?:общая )?сумма|сколько (?:всего|по сумме)|итого|сумма|(?:покажи|посчитай) (?:общую )?сумму)(?:\s+(?:всего|по ним))?$/u.test(phrase);
  const directionOnly = /^(?:(?:только|покажи)\s+)?(?:входящие|исходящие)(?:\s+(?:только|сделки))?$/u.test(phrase);
  const allDirections = /^(?:(?:теперь|покажи)\s+)?(?:обе стороны|все направления|без фильтра по направлению)$/u.test(phrase);
  const metric = /^(?:(?:какой|сколько|покажи)\s+)?(?:у него\s+)?(рейк|выигрыш|игровой результат)(?:\s+у него)?$/u.exec(phrase)?.[1];
  const dealDetail = /^(?:когда (?:ее |его |сделку )?подтвердили|в какое время подтвердили)$/u.test(phrase) ? "confirmedAt"
    : /^(?:какой (?:у нее |у сделки )?статус|что со сделкой|статус(?: сделки)?)$/u.test(phrase) ? "status" : null;
  const period = periodFor(phrase);
  const periodOnly = (prefix || /^(?:за|на)\s/u.test(phrase))
    && /^(?:(?:за|на)\s+)?(?:вчера|сегодня|прошлую неделю|эту неделю|текущую неделю|\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})$/u.test(phrase);
  if (total || directionOnly || allDirections || dealDetail || (metric && (prefix || /у него/u.test(phrase))) || periodOnly) {
    return { total, direction, allDirections, metric, dealDetail, period: periodOnly ? period : null };
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

module.exports = { HELP, intent, periodFor, dealDirection, followUpFor, excelRequest, containsDate, inPeriod };
