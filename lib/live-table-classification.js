// Prefer explicit tournament format and report/schedule names over poker variant.
function normalizeName(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}
const hasSng = value => /(?:^|\s)(?:sng|снг|sit\s*(?:and|n|&)\s*go)(?:\s|$)/i.test(value);
const hasMtt = value => /(?:^|\s)(?:mtt|мтт)(?:\s|$)/i.test(value);

function createClassifier({ report = {}, overlays = [], schedule = [] } = {}) {
  const reported = new Map((report.games || []).map(row => [normalizeName(row.name), row.types || []]));
  const mttNames = new Set(overlays.map(row => normalizeName(row.name)).filter(Boolean));
  const scheduledNames = new Set();
  for (const row of schedule) {
    for (const line of String(row.text || '').split(/\n/)) {
      const title = line.replace(/^\s*\d{1,2}[:.]\d{2}\s*(?:МСК)?\s*[·—-]?\s*/i, '').split('·')[0];
      if (/бай.?ин|гаранти|билет|месяца|^(?:понедельник|вторник|среда|четверг|пятница|суббота|воскресенье)$/iu.test(title.trim())) continue;
      const normalized = normalizeName(title);
      if (normalized && /[\p{L}]/u.test(normalized)) scheduledNames.add(normalized);
    }
  }
  return function classify(table) {
    const rawType = String(table.playType || '').trim();
    const type = normalizeName(rawType);
    const name = normalizeName(table.deskName);
    const baseName = name.replace(/\s+(?:table|стол)\s*\d+$/, '');
    const inReportLeague = !report.leagueId || !table.leagueId || String(table.leagueId) === String(report.leagueId);
    const types = inReportLeague ? (reported.get(name) || reported.get(baseName) || []) : [];
    if (hasSng(type) || hasSng(name)) return {category:'other',name:'СНГ'};
    if (hasMtt(type)) return {category:'tournaments',name:'МТТ'};
    if (types.some(t => hasSng(normalizeName(t)))) return {category:'other',name:'СНГ'};
    if (types.some(t => hasMtt(normalizeName(t))) || (inReportLeague && (mttNames.has(name) || mttNames.has(baseName)))) return {category:'tournaments',name:'МТТ'};
    if (scheduledNames.has(name) || scheduledNames.has(baseName) || hasMtt(name)
      || /tournament|турнир|satellite|сателлит|фриролл|freeroll|rebuy|ребай|freezeout|фризаут|нокаут|knockout|main event/i.test(name)
      || /^(?:free )?sat(?: |$)/i.test(name)) return {category:'tournaments',name:'МТТ'};
    if (/^nlh(?: |$)/.test(type) || rawType === '6+') return {category:'cash',name:'Холдем'};
    if (/^plo(?:\d| |$)/.test(type)) return {category:'cash',name:'Омаха'};
    const otherNames = {durak:'Дурак','21':'Двадцать одно',tweneyone:'Двадцать одно',twentyone:'Двадцать одно',ofc:'Китайский покер',офс:'Китайский покер',thirteen:'Thirteen',ceka:'Сека'};
    return {category:'other',name:otherNames[type] || rawType || 'Другая игра'};
  };
}
module.exports = {normalizeName,createClassifier};
