const cache = new WeakMap();
const active = row => ['rake','winnings','insurance','jackpotFee','jackpotPayout','hands'].some(k => Number.isFinite(Number(row[k])) && Number(row[k]) !== 0);
const idOf = row => String(row.playerId || row.id || '');
const inScope = (place, binding) => binding.type === 'union'
  ? place.leagueId === String(binding.leagueId)
  : place.clubId === String(binding.clubId);

function buildIndex(periods) {
  const players = new Map();
  const coverage = new Map();
  for (const period of periods) {
    const memberships = new Map();
    for (const r of period.clubReports?.reports || []) if (r.leagueId) memberships.set(String(r.clubId), {leagueId:String(r.leagueId),league:r.league || String(r.leagueId)});
    for (const l of period.leaguePlayerTops?.leagues || []) for (const c of l.clubs || []) {
      memberships.set(String(c.clubId || c.id), {leagueId:String(l.leagueId),league:l.league || String(l.leagueId)});
    }
    const known = new Set();
    const seen = new Map();
    const add = (row, place) => {
      const id = idOf(row);
      if (!id || !active(row)) return;
      if (!players.has(id)) players.set(id, {id, nick:row.nick || id, observations:[]});
      const person = players.get(id);
      // Newest report wins for display name. Never match on nickname.
      const dedup = `${id}:${place.clubId ? 'club:'+place.clubId : 'union:'+place.leagueId}`;
      if (seen.has(dedup)) return;
      seen.set(dedup, true);
      person.observations.push({...place,nick:row.nick || id,startDate:period.startDate,endDate:period.endDate});
    };
    const clubs = [
      ...(period.directory?.clubs || []).map(c => ({id:String(c.id),name:c.name,rows:c.playerRows, ...memberships.get(String(c.id))})),
      ...(period.leaguePlayerTops?.leagues || []).flatMap(l => (l.clubs || []).map(c => ({id:String(c.clubId || c.id),name:c.club || c.name,rows:c.playerRows,leagueId:String(l.leagueId),league:l.league}))),
    ];
    for (const c of clubs) {
      if (!Array.isArray(c.rows)) continue;
      known.add('club:'+c.id);
      for (const row of c.rows) add(row,{clubId:c.id,club:c.name || c.id,leagueId:c.leagueId,league:c.league});
    }
    for (const l of period.leaguePlayerTops?.leagues || []) {
      if (!Array.isArray(l.players)) continue;
      known.add('union:'+l.leagueId);
      for (const row of l.players) {
        const person = players.get(idOf(row));
        const detailed = person?.observations.some(o => o.startDate === period.startDate && o.leagueId === String(l.leagueId) && o.clubId);
        if (!detailed) add(row,{leagueId:String(l.leagueId),league:l.league || String(l.leagueId)});
      }
    }
    coverage.set(period.startDate,known);
  }
  return {players,coverage};
}

function analyze(allPeriods, binding, now = Date.now()) {
  const periods = allPeriods.filter(p => Date.parse(`${p.endDate}T23:59:59.999+07:00`) < now)
    .slice().sort((a,b) => b.startDate.localeCompare(a.startDate));
  const version = periods.map(p => p.startDate+'/'+p.endDate).join(',');
  let entry = cache.get(allPeriods);
  if (!entry || entry.version !== version || now-entry.created >= 300000) {
    entry = {version,created:now,index:buildIndex(periods)};
    cache.set(allPeriods,entry);
  }
  const {players,coverage} = entry.index;
  const latest = periods[0];
  const scopeKey = binding.type === 'union' ? 'union:'+binding.leagueId : 'club:'+binding.clubId;
  const sourceCovered = Boolean(latest && coverage.get(latest.startDate)?.has(scopeKey));
  const result = [];
  const first = observations => observations.reduce((date,o) => date === null || o.startDate < date ? o.startDate : date,null);
  for (const person of players.values()) {
    const source = person.observations.filter(o => inScope(o,binding));
    if (!source.length) continue;
    // Unknown club within the same union cannot prove a different club.
    const sourceLeagues = new Set(source.map(o => o.leagueId).filter(Boolean));
    const outside = person.observations.filter(o => !inScope(o,binding) &&
      (binding.type === 'union' ? Boolean(o.leagueId) : Boolean(o.clubId) || Boolean(o.leagueId && sourceLeagues.size && !sourceLeagues.has(o.leagueId))));
    if (!outside.length) continue;
    const firstSource = first(source), firstOutside = first(outside), firstSeen = first(person.observations);
    const places = new Map();
    for (const o of outside) {
      const key = o.clubId ? 'club:'+o.clubId : 'union:'+o.leagueId;
      const old = places.get(key);
      if (!old) places.set(key,{...o,firstDate:o.startDate,lastDate:o.startDate});
      else { old.firstDate = old.firstDate < o.startDate ? old.firstDate : o.startDate; old.lastDate = old.lastDate > o.startDate ? old.lastDate : o.startDate; }
    }
    const destinations = [...places.values()].sort((a,b) => b.lastDate.localeCompare(a.lastDate) || a.firstDate.localeCompare(b.firstDate));
    const history = new Map();
    for (const o of person.observations) {
      const key = o.clubId ? 'club:'+o.clubId : 'union:'+o.leagueId;
      const old = history.get(key);
      if (!old) history.set(key,{...o,firstDate:o.startDate,lastDate:o.startDate,source:inScope(o,binding)});
      else { old.firstDate = old.firstDate < o.startDate ? old.firstDate : o.startDate; old.lastDate = old.lastDate > o.startDate ? old.lastDate : o.startDate; }
    }
    result.push({id:person.id,nick:source[0].nick,firstSource,firstOutside,firstSeen,
      history:[...history.values()].sort((a,b)=>a.firstDate.localeCompare(b.firstDate)||a.lastDate.localeCompare(b.lastDate)),
      origins:person.observations.filter(o=>o.startDate===firstSeen),
      sourceActive:source.some(o=>o.startDate===latest?.startDate) ? true : sourceCovered ? false : null,
      lastSource:source[0].startDate,
      currentOutside:destinations.some(d=>d.lastDate===latest?.startDate),
      chronology:firstOutside<firstSource?'earlier':firstOutside===firstSource?'same':'later',destinations});
  }
  result.sort((a,b)=>Number(b.currentOutside)-Number(a.currentOutside)||b.firstOutside.localeCompare(a.firstOutside)||a.id.localeCompare(b.id));
  return {players:result,latest,sourceCovered,periods:periods.map(p=>({startDate:p.startDate,endDate:p.endDate})),currentCount:result.filter(p=>p.currentOutside).length};
}
module.exports = {analyze};
