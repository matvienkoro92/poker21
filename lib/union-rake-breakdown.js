'use strict';
const sourceRake = require('../data/union-club-rake-rub.json');
const escape = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const amount = value => Number(value || 0).toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function aggregate(periods) {
  const unions = new Map();
  for (const period of periods) {
    for (const league of period.jackpot?.leagues || []) {
      const id = String(league.leagueId), rate = Number(league.exchangeRate || 1);
      const row = unions.get(id) || { id, name: league.league, rake: 0, clubs: new Map(), missing: false };
      row.rake += Number(league.feeTotal || 0) * rate;
      if (id !== '184691') {
        const detail = (period.leaguePlayerTops?.leagues || []).find(item => String(item.leagueId) === id);
        if (!detail || !Array.isArray(detail.clubs)) row.missing = true;
        const precise = sourceRake[period.startDate + '_' + period.endDate]?.[id];
        for (const club of precise || detail?.clubs || []) {
          const key = String(club.clubId || club.club), value = row.clubs.get(key) || { name: club.club, rake: 0 };
          value.rake += club.rakeRub != null ? Number(club.rakeRub) : Number(club.rake || 0);
          row.clubs.set(key, value);
        }
      }
      unions.set(id, row);
    }
  }
  return [...unions.values()].sort((a, b) => b.rake - a.rake);
}
function pages(periods, header) {
  const rows = aggregate(periods), footer = `<b>Итого рейк: ${amount(rows.reduce((sum, row) => sum + row.rake, 0))}</b>`;
  const output = []; let current = header + '\n\n';
  const finish = () => { output.push(current.trimEnd() + '\n\n' + footer); current = header + '\n\n'; };
  if (!rows.length) current += 'Нет данных за выбранные недели.\n';
  rows.forEach((row, index) => {
    const title = `${index + 1}. <b>${escape(row.name)}</b> — ${amount(row.rake)}`;
    const lines = [];
    if (row.id !== '184691') {
      const clubs = [...row.clubs.values()].sort((a, b) => b.rake - a.rake || String(a.name).localeCompare(String(b.name), 'ru'));
      lines.push(...clubs.map(club => `   • ${escape(club.name)} — ${amount(club.rake)}`));
      if (row.missing) lines.push('   Данные клубов доступны не за все выбранные недели.');
      else if (clubs.length) {
        const difference = Math.round((row.rake - clubs.reduce((sum, club) => sum + club.rake, 0)) * 100) / 100;
        if (difference) lines.push(`   Разница с итогом союза — ${amount(difference)}`);
      }
      if (!clubs.length && !row.missing) lines.push('   Нет данных клубов.');
    }
    const reserve = title.length + (lines[0]?.length || 0) + footer.length + 10;
    if (current.length + reserve > 3600 && current.trim() !== header.trim()) finish();
    current += title + '\n';
    for (const line of lines) {
      if (current.length + line.length + footer.length + 4 > 3600) { finish(); current += title + ' (продолжение)\n'; }
      current += line + '\n';
    }
    current += '\n';
  });
  finish(); return output;
}
module.exports = { aggregate, pages };
