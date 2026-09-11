const report = require('../data/live-table-report-types.json');
const { normalizeName } = require('./live-table-classification');

// The tables API has no tournament instance/start time. For recurring names,
// use the earliest observed Moscow start time, without guessing the instance.
const starts = new Map(report.games.filter(game => game.startTimesMoscow?.length)
  .map(game => [normalizeName(game.name), [...game.startTimesMoscow].sort()[0]]));

function reportStart(table) {
  if (String(table.leagueId) !== String(report.leagueId)) return null;
  const name = normalizeName(table.deskName).replace(/\s+(?:table|стол)\s*\d+$/, '');
  return starts.get(name) || null;
}

function compareTournamentStarts(a, b) {
  return (reportStart(a) || '99:99').localeCompare(reportStart(b) || '99:99')
    || normalizeName(a.deskName).localeCompare(normalizeName(b.deskName), 'ru')
    || String(a.deskId).localeCompare(String(b.deskId), 'en', { numeric: true });
}

function groupTournamentTables(tables) {
  const groups = new Map();
  const seen = new Set();
  for (const table of tables) {
    const name = normalizeName(table.deskName).replace(/\s+(?:table|стол)\s*\d+$/, '');
    const key = JSON.stringify([String(table.unionId || ''), String(table.leagueId || ''),
      name || String(table.deskId), String(table.playType || '').replace(/^MTT[- ]?/i, '')]);
    const id = key + ':' + table.deskId;
    if (table.deskId != null && seen.has(id)) continue;
    seen.add(id);
    if (!groups.has(key)) groups.set(key, {...table, playerCount: 0, blinds: new Set()});
    const group = groups.get(key);
    group.playerCount += Number(table.playerCount || 0);
    if (table.blindAnnotation) group.blinds.add(String(table.blindAnnotation));
  }
  return [...groups.values()].map(({blinds, ...table}) => ({...table,
    blindAnnotation: [...blinds].join(' · ')}));
}

module.exports = { reportStart, compareTournamentStarts, groupTournamentTables };
