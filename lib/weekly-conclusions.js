function compareWeeks(current, previous) {
  const aggregate = rows => {
    const map = new Map();
    for (const row of rows) {
      const id = String(row.id);
      const old = map.get(id) || { id, rake: 0, active: false };
      map.set(id, { ...old, nick: row.nick, rake: old.rake + Number(row.rake || 0), active: old.active || Boolean(row.active) });
    }
    return map;
  };
  const now = aggregate(current), before = aggregate(previous);
  const changes = [...new Set([...now.keys(), ...before.keys()])].map(id => ({
    id, nick: now.get(id)?.nick || before.get(id)?.nick || id,
    current: now.get(id)?.rake || 0, previous: before.get(id)?.rake || 0,
    delta: (now.get(id)?.rake || 0) - (before.get(id)?.rake || 0),
    inactive: Boolean(before.get(id)?.active) && !now.get(id)?.active,
  }));
  const total = rows => [...rows.values()].reduce((sum, r) => sum + r.rake, 0);
  const active = rows => [...rows.values()].filter(r => r.active).length;
  const up = changes.filter(r => r.delta > 0).sort((a, b) => b.delta - a.delta || a.id.localeCompare(b.id));
  const down = changes.filter(r => r.delta < 0).sort((a, b) => a.delta - b.delta || a.id.localeCompare(b.id));
  return { current: total(now), previous: total(before), active: active(now), previousActive: active(before),
    delta: total(now) - total(before), up, down,
    grossGain: up.reduce((sum, r) => sum + r.delta, 0), grossLoss: -down.reduce((sum, r) => sum + r.delta, 0) };
}
module.exports = { compareWeeks };
