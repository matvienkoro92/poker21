const {normalizeName} = require('./live-table-classification');
const {templates} = require('../data/live-tournament-structures.json');
const number = n => Number(n).toLocaleString('ru-RU');
const MINUTE = 60000;
const MOSCOW_OFFSET = 3 * 60 * MINUTE;
function clockMoscow(timestamp) {
  return new Date(timestamp + MOSCOW_OFFSET).toISOString().slice(11, 16);
}
function countdown(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return [Math.floor(seconds / 3600), Math.floor(seconds % 3600 / 60), seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
}
function tournamentState(table, now = Date.now()) {
  const name = normalizeName(table.deskName).replace(/\s+(?:table|стол)\s*\d+$/, '');
  const template = templates.find(t => normalizeName(t.name) === name
    && String(t.leagueId) === String(table.leagueId)
    && ['NLH', 'MTT-NLH'].includes(String(table.playType || '').trim().toUpperCase()));
  if (!template) return null;
  const timing = template.timing;
  const date = new Date(now + MOSCOW_OFFSET).toISOString().slice(0, 10);
  const start = Date.parse(`${date}T${template.schedule.startMoscow}:00+03:00`);
  const play = timing.playMinutesBetweenBreaks;
  const pause = timing.breakMinutes;
  const cycle = play + pause;
  const elapsed = Math.max(0, (now - start) / MINUTE);
  const completedCycles = Math.floor(elapsed / cycle);
  const withinCycle = elapsed % cycle;
  const played = completedCycles * play + Math.min(withinCycle, play);
  const lateMinutes = template.lateRegistrationLevel * timing.minutesBeforeRegistration;
  // A break starting exactly when registration ends is not part of registration.
  const wallMinutes = minutes => minutes + Math.max(0, Math.ceil(minutes / play) - 1) * pause;
  const closes = start + wallMinutes(lateMinutes) * MINUTE;
  const beforeStart = now < start;
  const registrationOpenBySchedule = !beforeStart && now < closes;
  const estimatedLevel = played < lateMinutes
    ? Math.floor(played / timing.minutesBeforeRegistration) + 1
    : template.lateRegistrationLevel + Math.floor((played - lateMinutes) / timing.minutesAfterRegistration) + 1;
  const blindMatch = String(table.blindAnnotation || '').replace(/[\s\u00a0\u202f]/g, '').match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  const levelFromApi = blindMatch && template.levels.find(l => l.smallBlind === Number(blindMatch[1]) && l.bigBlind === Number(blindMatch[2]));
  const expectedLevel = template.levels.find(l => l.level === estimatedLevel);
  const conflict = !beforeStart && Boolean(blindMatch && (expectedLevel
    ? expectedLevel.smallBlind !== Number(blindMatch[1]) || expectedLevel.bigBlind !== Number(blindMatch[2])
    : levelFromApi));
  const onBreak = !beforeStart && withinCycle >= play;
  const breakEnds = start + (completedCycles + 1) * cycle * MINUTE;
  const currentLevel = levelFromApi || template.levels.find(l => l.level === estimatedLevel);
  const next = currentLevel && template.levels.find(l => l.level === currentLevel.level + 1);
  return {template, start, closes, beforeStart, registrationOpenBySchedule, estimatedLevel, currentLevel, levelFromApi, next, conflict, onBreak, breakEnds};
}
function tournamentDetails(table, now = Date.now()) {
  const state = tournamentState(table, now);
  if (!state) return [];
  const {template, start, closes, beforeStart, registrationOpenBySchedule, estimatedLevel, currentLevel, levelFromApi, next, conflict, onBreak, breakEnds} = state;
  const players = number(table.remainingPlayers ?? table.playerCount ?? 0);
  const lines = [];
  if (beforeStart) {
    lines.push(`Старт: ${clockMoscow(start)} МСК`);
    lines.push(`👨 Игроков в турнире ${players}.`);
    lines.push(`До старта по расписанию: ≈ ${countdown(start - now)}`);
  } else if (conflict) {
    lines.push('Блайнды API расходятся с расписанием; отсчёт регистрации не подтверждён');
    lines.push(`👨 Игроков в турнире ${players}.`);
    if (levelFromApi) lines.push(`Идет уровень LV${levelFromApi.level}.`);
  } else {
    lines.push(registrationOpenBySchedule
      ? `🟢 Регистрация ещё идёт · осталось ≈ ${countdown(closes - now)} · до ${clockMoscow(closes)} МСК`
      : '🔴 Регистрация уже закрыта');
    lines.push(`👨 ${registrationOpenBySchedule ? 'Игроков в турнире' : 'Игроков осталось'} ${players}.`);
    lines.push(`Идет уровень ${levelFromApi ? '' : '≈ '}LV${levelFromApi ? levelFromApi.level : estimatedLevel}.`);

  }
  lines.push(`Стартовый стек: ${number(template.startingChips)}`);

  return lines;
}
module.exports = {tournamentDetails, tournamentState};
