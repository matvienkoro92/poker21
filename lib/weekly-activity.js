const WEEK = 7 * 86400000;

// Only complete reports belong here; null rows mean missing player data.
function analyze(periods) {
  const players = new Map();
  for (const [index, period] of periods.entries()) {
    for (const row of period.rows || []) {
      if (!row.id) continue;
      const id = String(row.id);
      if (!players.has(id)) players.set(id, { id, nick: row.nick || id, weeks: new Set(), rake: new Map() });
      const player = players.get(id);
      player.rake.set(index, (player.rake.get(index) || 0) + (Number(row.rake) || 0));
      if (row.active) player.weeks.add(index);
    }
  }
  const consecutive = end => periods.slice(0, end + 1).every((p, i) => Array.isArray(p.rows)
    && (!i || Date.parse(periods[i - 1].startDate) - Date.parse(p.startDate) === WEEK));
  const all = [...players.values()].filter(p => p.weeks.size).map(p => {
    const last = Math.min(...p.weeks);
    return { id: p.id, nick: p.nick, active: last === 0, activeWeeks: p.weeks.size,
      totalRake: [...p.rake.values()].reduce((a, b) => a + b, 0),
      currentRake: p.rake.get(0) || 0, previousRake: p.rake.get(1) || 0,
      delta: (p.rake.get(0) || 0) - (p.rake.get(1) || 0),
      previousActive: p.weeks.has(1),
      lastDate: periods[last].endDate, absentWeeks: consecutive(last) ? last : null,
      isNew: last === 0 && p.weeks.size === 1,
      returned: last === 0 && p.weeks.size > 1 && !p.weeks.has(1) && periods.length > 1 && consecutive(1) };
  }).sort((a, b) => (a.absentWeeks ?? Infinity) - (b.absentWeeks ?? Infinity) || a.nick.localeCompare(b.nick) || a.id.localeCompare(b.id));
  const comparable = periods.length >= 2 && consecutive(1);
  const key = [...all].filter(p => p.totalRake > 0).sort((a, b) => b.totalRake - a.totalRake || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.ceil(all.length * 0.1)));
  const keyIds = new Set(key.map(p => p.id));
  for (const p of all) p.key = keyIds.has(p.id);
  const growth = comparable ? all.filter(p => p.active && p.previousActive && p.delta > 0).sort((a,b) => b.delta-a.delta || a.id.localeCompare(b.id)) : [];
  const decline = comparable ? all.filter(p => p.active && p.previousActive && p.delta < 0).sort((a,b) => a.delta-b.delta || a.id.localeCompare(b.id)) : [];
  const attention = key.filter(p => (!p.active && Array.isArray(periods[0]?.rows)) || (comparable && p.previousRake > 0 && p.currentRake <= p.previousRake * 0.5));
  const inactive = all.filter(p => !p.active);
  return { comparable, key, growth, decline, attention, periods, players: all, active: all.filter(p => p.active), inactive,
    new: all.filter(p => p.isNew), returned: all.filter(p => p.returned),
    first: inactive.filter(p => p.absentWeeks === 1),
    middle: inactive.filter(p => p.absentWeeks === 2),
    third: inactive.filter(p => p.absentWeeks === 3),
    long: inactive.filter(p => p.absentWeeks === 4),
    older: inactive.filter(p => p.absentWeeks > 4),
    unknown: inactive.filter(p => p.absentWeeks === null),
    single: inactive.filter(p => p.activeWeeks === 1),
    currentMissing: Boolean(periods.length && !Array.isArray(periods[0].rows)),
    historyComplete: consecutive(periods.length - 1) };
}
module.exports = { analyze };
