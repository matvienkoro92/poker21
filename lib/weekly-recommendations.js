const { createHash } = require('node:crypto');
const cache = new Map();
const MAX_CACHE = 150;
const TTL = 5 * 60 * 1000;

function scope(binding) {
  return `${binding.type}:${binding.type === 'union' ? binding.leagueId : binding.clubId}`;
}

// Report JSON is immutable during a deployment. Replaced report objects, closed
// periods, a new deployment or TTL expiration invalidate cached analysis.
function cached(binding, periods, build, now = Date.now()) {
  const key = scope(binding);
  const old = cache.get(key);
  if (old && now - old.time < TTL && periods.length === old.periods.length && periods.every((p,i) => p === old.periods[i])) return old.result;
  const result = build();
  cache.delete(key);
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value);
  cache.set(key, { periods: [...periods], result, time: now });
  return result;
}

function token(binding, result, player) {
  return createHash('sha256').update(JSON.stringify([scope(binding), result.periods[0]?.startDate,
    result.periods[0]?.endDate, player.id, player.attentionReason, player.currentRake,
    player.previousRake, player.baselineRake, player.lastRake, player.absentWeeks,
    result.baselineCoverageWeeks, result.coverageWeeks])).digest('hex').slice(0,24);
}
function storageKey(chatId, binding, result, player) {
  return `poker21:weekly-review:${chatId}:${scope(binding)}:${token(binding,result,player)}`;
}
async function read(redis, chatId, binding, result, players = result.attention) {
  if (!players.length) return {};
  const responses = await redis(players.map(p => ['GET', storageKey(chatId,binding,result,p)]), { context: 'weekly-review.read', timeoutMs: 3000 });
  return Object.fromEntries(players.map((p,i) => {
    let value;
    try { value = JSON.parse(responses?.[i]?.result || 'null'); } catch (_) {}
    return [p.id, value && ['checked','watch'].includes(value.status) ? value : { status: 'open' }];
  }));
}
async function save(redis, chatId, binding, result, signalToken, status, actor, now = new Date()) {
  if (!['open','checked','watch'].includes(status)) throw new Error('Неизвестный статус');
  const player = result.attention.find(p => token(binding,result,p) === signalToken);
  if (!player) return null;
  const value = { status, actor: String(actor), updatedAt: now.toISOString(), period: result.periods[0].startDate };
  const responses = await redis([['SET', storageKey(chatId,binding,result,player), JSON.stringify(value), 'EX', String(180 * 86400)]], { context: 'weekly-review.save', timeoutMs: 3000 });
  if (responses?.[0]?.result !== 'OK') throw new Error('Не удалось сохранить статус');
  return player;
}
module.exports = { cached, token, read, save };
