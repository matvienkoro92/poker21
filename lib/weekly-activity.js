const WEEK = 7 * 86400000;

// Only complete reports belong here; null rows mean missing player data.
function analyze(inputPeriods) {
  const periods = [...inputPeriods].sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
  const latestDate = Date.parse(periods[0]?.startDate);
  const age = periods.map(p => (latestDate - Date.parse(p.startDate)) / WEEK);
  const windowIndexes = age.flatMap((weeks, i) => weeks >= 0 && weeks < 4 ? [i] : []);
  const baselineIndexes = age.flatMap((weeks, i) => weeks >= 1 && weeks <= 4 && Array.isArray(periods[i].rows) ? [i] : []);
  const coverageWeeks = windowIndexes.filter(i => Array.isArray(periods[i].rows)).length;
  const continuity = [];
  periods.forEach((p, i) => { continuity[i] = Array.isArray(p.rows) && (!i || continuity[i - 1] && age[i] - age[i - 1] === 1); });
  const players = new Map();
  for (const [index, period] of periods.entries()) {
    for (const row of period.rows || []) {
      if (!row.id) continue;
      const id = String(row.id);
      if (!players.has(id)) players.set(id, { id, nick: row.nick || id, weeks: new Set(), rake: new Map(), hands: new Map() });
      const player = players.get(id);
      player.rake.set(index, (player.rake.get(index) || 0) + (Number(row.rake) || 0));
      if (Number.isFinite(row.hands)) player.hands.set(index, (player.hands.get(index) || 0) + row.hands);
      if (row.active) player.weeks.add(index);
    }
  }
  const consecutive = end => end < 0 || Boolean(continuity[end]);
  const median = values => { const sorted = [...values].sort((a,b) => a-b); const n = sorted.length; return n ? (sorted[Math.floor(n/2)] + sorted[Math.ceil(n/2)-1]) / 2 : 0; };
  const all = [...players.values()].filter(p => p.weeks.size).map(p => {
    const last = Math.min(...p.weeks);
    const baseline = baselineIndexes.map(i => Math.max(0, p.rake.get(i) || 0));
    const baselineRake = median(baseline);
    const baselineReady = baseline.length >= 3 && baselineIndexes.filter(i => p.weeks.has(i)).length >= 2;
    return { baselineRake, baselineReady, baselineWeeks: baseline.length,
      baselineTotal: baseline.reduce((sum, value) => sum + value, 0),
      currentHands: p.hands.get(0) ?? null,
      baselineHands: baselineIndexes.length && baselineIndexes.every(i => p.hands.has(i) || !p.weeks.has(i))
        ? median(baselineIndexes.map(i => p.hands.get(i) || 0)) : null,
      baselineDelta: (p.rake.get(0) || 0) - baselineRake,
      id: p.id, nick: p.nick, active: last === 0, activeWeeks: p.weeks.size,
      totalRake: [...p.rake.entries()].filter(([index]) => windowIndexes.includes(index)).reduce((sum, [, rake]) => sum + Math.max(0, rake), 0),
      currentRake: p.rake.get(0) || 0, previousRake: p.rake.get(1) || 0,
      delta: (p.rake.get(0) || 0) - (p.rake.get(1) || 0),
      previousActive: p.weeks.has(1),
      lastRake: p.rake.get(last) || 0,
      lastDate: periods[last].endDate, absentWeeks: consecutive(last) ? last : null,
      isNew: last === 0 && p.weeks.size === 1,
      returned: last === 0 && p.weeks.size > 1 && !p.weeks.has(1) && periods.length > 1 && consecutive(1) };
  }).sort((a, b) => (a.absentWeeks ?? Infinity) - (b.absentWeeks ?? Infinity) || a.nick.localeCompare(b.nick) || a.id.localeCompare(b.id));
  const comparable = periods.length >= 2 && consecutive(1);
  const ranked = [...all].filter(p => p.totalRake > 0).sort((a, b) => b.totalRake - a.totalRake || a.id.localeCompare(b.id));
  const fourWeekTotal = ranked.reduce((sum, player) => sum + player.totalRake, 0);
  const key = [];
  let keyRake = 0;
  for (const player of ranked) {
    if (keyRake >= fourWeekTotal * 0.7) break;
    keyRake += player.totalRake;
    player.rakeShare = fourWeekTotal > 0 ? player.totalRake / fourWeekTotal * 100 : 0;
    player.cumulativeRakeShare = fourWeekTotal > 0 ? keyRake / fourWeekTotal * 100 : 0;
    key.push(player);
  }
  const historicalRanked = [...all].filter(p => p.baselineTotal > 0).sort((a,b) => b.baselineTotal-a.baselineTotal || a.id.localeCompare(b.id));
  const historicalTotal = historicalRanked.reduce((sum,p) => sum+p.baselineTotal,0);
  const previousKeyIds = new Set();
  let historicalRake = 0;
  for (const p of historicalRanked) {
    if (historicalRake >= historicalTotal * .7) break;
    historicalRake += p.baselineTotal;
    previousKeyIds.add(p.id);
  }
  for (const p of all) p.previousKey = previousKeyIds.has(p.id);
  const keyIds = new Set(key.map(p => p.id));
  for (const p of all) p.key = keyIds.has(p.id);
  const previousTotal = all.reduce((sum, p) => sum + Math.max(0, p.previousRake), 0);
  const currentTotal = all.reduce((sum, p) => sum + Math.max(0, p.currentRake), 0);
  // Scale materiality to club size: >=1% of weekly rake, or >=20% of
  // the player's previous rake with a club-wide floor of 0.25%.
  const significant = p => Math.abs(p.delta) > 0 && (
    Math.abs(p.delta) >= previousTotal * 0.01 ||
    (p.previousRake > 0 && Math.abs(p.delta) >= p.previousRake * 0.2 && Math.abs(p.delta) >= previousTotal * 0.0025));
  const growth = comparable ? all.filter(p => p.active && p.previousActive && p.delta > 0 && significant(p)).sort((a,b) => b.delta-a.delta || a.id.localeCompare(b.id)) : [];
  const decline = comparable ? all.filter(p => p.active && p.previousActive && p.delta < 0 && significant(p)).sort((a,b) => a.delta-b.delta || a.id.localeCompare(b.id)) : [];
  const declineIds = new Set(decline.map(p => p.id));
  const attention = all.filter(p => {
    const important = p.key || p.previousKey;
    const stopped = !p.active && Array.isArray(periods[0]?.rows) && (important ||
      comparable && p.previousActive && p.previousRake > 0 && p.previousRake >= previousTotal * .01);
    const baselineDrop = p.active && p.baselineReady && p.baselineRake > 0 &&
      -p.baselineDelta >= p.baselineRake * .2 && -p.baselineDelta >= previousTotal * .0025;
    // A return to the normal range after a spike remains visible in weekly declines,
    // but is not presented as an actionable risk.
    const weeklyDrop = declineIds.has(p.id) && (important || -p.delta >= previousTotal * .01) &&
      (!p.baselineReady || p.currentRake < p.baselineRake * .8);
    if (!stopped && !baselineDrop && !weeklyDrop) return false;
    p.priorityAmount = stopped ? (p.baselineReady ? p.baselineRake : p.lastRake) :
      p.baselineReady ? Math.max(0, -p.baselineDelta) : -p.delta;
    p.attentionReason = stopped ? 'Нет игры в отчётную неделю' : baselineDrop ? 'Рейк ниже обычного уровня' : 'Заметное снижение рейка';
    p.action = stopped ? 'Проверьте полноту отчёта и активность в других клубах союза.' :
      'Сопоставьте число раздач и состав игр с предыдущими неделями; проверьте причину снижения.';
    p.confidence = p.baselineReady ? (baselineIndexes.length === 4 ? 'достаточно истории' : 'есть пропуски или короткая история') : 'мало истории';
    return true;
  });
  attention.sort((a,b) => b.priorityAmount-a.priorityAmount || Number(b.previousKey)-Number(a.previousKey) || a.id.localeCompare(b.id));
  const breakdown = comparable ? all.reduce((out,p) => {
    if (p.active && !p.previousActive) out[p.isNew ? 'new' : 'returned'] += p.currentRake;
    else if (!p.active && p.previousActive) out.absent -= p.previousRake;
    else out.continuing += p.delta;
    return out;
  }, { new: 0, returned: 0, continuing: 0, absent: 0 }) : null;
  const inactive = all.filter(p => !p.active);
  return { comparable, currentTotal, previousTotal, fourWeekTotal, keyRakeShare: fourWeekTotal > 0 ? keyRake / fourWeekTotal * 100 : 0,
    keyWindowWeeks: 4, coverageWeeks, baselineCoverageWeeks: baselineIndexes.length, breakdown, key, growth, decline, attention, periods, players: all, active: all.filter(p => p.active), inactive,
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
