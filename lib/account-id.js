const { pipeline: redisPipeline, hscanall, sscanall } = require("./redis");

const DT_IDS_KEY = "poker_app:visitor_dt_ids";
const ID_TO_USER_KEY = "poker_app:id_to_user";
const ACCOUNT_USERS_PREFIX = "poker_app:account_users:";

function generateDtId() {
  return "ID" + String(Math.floor(100000 + Math.random() * 900000));
}

async function getDtIdByUserId(userId) {
  if (!userId) return null;
  const rawId = String(userId).trim();
  if (/^(tg|vk)_ID\d{6}$/.test(rawId)) return rawId.slice(3);
  if (/^mail_ID\d{6}$/.test(rawId)) return rawId.slice(5);
  const res = await redisPipeline([["HGET", DT_IDS_KEY, String(userId)]]);
  const value = res && res[0] && res[0].result != null ? String(res[0].result).trim() : "";
  return value || null;
}

async function getUserIdByDtId(dtId) {
  if (!dtId) return null;
  const res = await redisPipeline([["HGET", ID_TO_USER_KEY, String(dtId)]]);
  const value = res && res[0] && res[0].result != null ? String(res[0].result).trim() : "";
  return value || null;
}

async function getPreferredUserIdByDtId(dtId) {
  const id = dtId != null ? String(dtId).trim() : "";
  if (!id) return null;
  const direct = await getUserIdByDtId(id);
  // The primary mapping is already the preferred identity for normal Telegram,
  // VK and legacy accounts. Do not scan the complete alias hash in this common
  // path: on profile previews it multiplied one wide Redis read per friend.
  if (direct && !/^mail_/.test(direct) && !/^mail_pending_/.test(direct)) {
    return String(direct).trim();
  }
  let found = await sscanall(ACCOUNT_USERS_PREFIX + id, {
    context: "account-id.aliases",
    count: 100,
    maxPages: 10,
  }) || [];
  if (!found.length) {
    const aliases = await hscanall(DT_IDS_KEY, {
      context: "account-id.alias-backfill",
      count: 500,
      maxPages: 100,
    });
    const backfill = [];
    Object.keys(aliases || {}).forEach((userId) => {
      const accountId = String(aliases[userId] || "").trim();
      if (!accountId) return;
      backfill.push(["SADD", ACCOUNT_USERS_PREFIX + accountId, userId]);
      if (accountId === id) found.push(userId);
    });
    if (backfill.length) await redisPipeline(backfill, { context: "account-id.alias-backfill-write" });
  }
  if (direct) found.unshift(String(direct).trim());
  const unique = [...new Set(found.filter(Boolean))];
  for (const userId of unique) {
    if (userId.startsWith("tg_")) return userId;
  }
  for (const userId of unique) {
    if (userId.startsWith("vk_")) return userId;
  }
  for (const userId of unique) {
    if (!/^mail_/.test(userId) && !/^mail_pending_/.test(userId)) return userId;
  }
  return unique[0] || null;
}

async function ensureDtIdForUserId(userId) {
  const rawId = String(userId || "").trim();
  if (/^(tg|vk)_ID\d{6}$/.test(rawId)) return rawId.slice(3);
  if (/^mail_ID\d{6}$/.test(rawId)) return rawId.slice(5);
  const existing = await getDtIdByUserId(userId);
  if (existing) return existing;
  for (let i = 0; i < 10; i += 1) {
    const candidate = generateDtId();
    const taken = await getUserIdByDtId(candidate);
    if (taken) continue;
    const saved = await redisPipeline([
      ["HSET", DT_IDS_KEY, String(userId), candidate],
      ["HSET", ID_TO_USER_KEY, candidate, String(userId)],
      ["SADD", ACCOUNT_USERS_PREFIX + candidate, String(userId)],
    ]);
    if (saved) return candidate;
  }
  return null;
}

async function linkUserIdToDtId(userId, dtId, preferAsPrimary) {
  const rawUserId = String(userId || "").trim();
  const rawDtId = String(dtId || "").trim();
  if (!rawUserId || !rawDtId) return false;
  const commands = [["HSET", DT_IDS_KEY, rawUserId, rawDtId]];
  commands.push(["SADD", ACCOUNT_USERS_PREFIX + rawDtId, rawUserId]);
  if (preferAsPrimary !== false) commands.push(["HSET", ID_TO_USER_KEY, rawDtId, rawUserId]);
  const saved = await redisPipeline(commands);
  return !!saved;
}

async function resolveAccountId(rawId) {
  const id = rawId != null ? String(rawId).trim() : "";
  if (!id) return null;
  if (/^ID\d{6}$/.test(id) || id.startsWith("guest_")) return id;
  if (/^(tg|vk)_ID\d{6}$/.test(id)) return id.slice(3);
  if (id.startsWith("tg_") || id.startsWith("vk_") || /^mail_ID\d{6}$/.test(id)) return await ensureDtIdForUserId(id);
  return null;
}

module.exports = {
  DT_IDS_KEY,
  ID_TO_USER_KEY,
  ACCOUNT_USERS_PREFIX,
  ensureDtIdForUserId,
  getDtIdByUserId,
  getPreferredUserIdByDtId,
  getUserIdByDtId,
  linkUserIdToDtId,
  resolveAccountId,
  redisPipeline,
};
