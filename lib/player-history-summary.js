// Periods are newest first. Missing report weeks are not treated as inactivity.
function analyze(periods) {
  const maps = periods.map(p => {
    const map = new Map();
    for (const r of p.rows) {
      const old = map.get(String(r.id)) || { rake: 0, hands: 0, active: false };
      map.set(String(r.id), { ...r, rake: old.rake + r.rake, hands: old.hands + (r.hands || 0), active: old.active || r.active });
    }
    return map;
  });
  const continuous = periods.every((p, i) => !i || Date.parse(periods[i - 1].startDate) - Date.parse(p.startDate) === 7 * 86400000);
  const players = [...new Set(maps.flatMap(m => [...m.keys()]))].map(id => {
    const weeks = maps.map(m => m.get(id));
    const active = weeks.map((r, i) => r?.active ? i : -1).filter(i => i >= 0);
    const baseline = weeks.slice(1, 5);
    const average = baseline.length ? baseline.reduce((s, r) => s + (r?.rake || 0), 0) / baseline.length : 0;
    const current = weeks[0]?.rake || 0;
    return { id, nick: weeks.find(Boolean)?.nick || id, activeWeeks: active.length, last: active.length ? periods[active[0]].startDate : null,
      current, average, delta: current - average, total: weeks.reduce((s, r) => s + (r?.rake || 0), 0),
      hands: weeks[0]?.hands || 0, averageHands: baseline.length ? baseline.reduce((s,r) => s + (r?.hands || 0), 0) / baseline.length : 0,
      active: Boolean(weeks[0]?.active), baselineWeeks: baseline.length,
      single: active.length === 1 && active[0] >= 2, recentSingle: active.length === 1 && active[0] < 2,
      risk: continuous && baseline.length >= 3 && active.filter(i => i >= 1 && i <= 4).length >= 2 && weeks[0]?.active && average > 0 && current <= average * 0.5,
      growth: continuous && baseline.length >= 3 && active.filter(i => i >= 1 && i <= 4).length >= 2 && average > 0 && current >= average * 1.5 };
  }).filter(p => p.activeWeeks).sort((a,b) => b.total-a.total || a.id.localeCompare(b.id));
  const top = new Set(players.slice(0, Math.max(1, Math.ceil(players.length * .1))).filter(p => p.total > 0).map(p => p.id));
  const single = players.filter(p => p.single);
  const stopped = players.filter(p => top.has(p.id) && !p.active);
  const risk = players.filter(p => p.risk).sort((a,b) => a.delta-b.delta);
  const growth = players.filter(p => p.growth).sort((a,b) => b.delta-a.delta);
  const contact = [...new Map([...stopped, ...risk, ...single].map(p => [p.id, { ...p, reason: stopped.includes(p) ? 'Топ-10% по суммарному рейку, сейчас неактивен' : risk.includes(p) ? 'Рейк снизился минимум на 50% относительно среднего предыдущих отчётов' : 'Активен в одном отчёте, затем минимум два отчёта без активности' }])).values()];
  return { players, single, stopped, risk, growth, contact, continuous, recentSingle: players.filter(p => p.recentSingle).length };
}
module.exports = { analyze };
