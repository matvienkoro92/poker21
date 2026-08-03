"use strict";

const {
  pokerProfileStatusFromCachedProfile: defaultPokerProfileStatusFromCachedProfile,
} = require("./chat-profile-status");

function createChatProfileLookupHelpers(deps) {
  const {
    AVATAR_PREFIX,
    DT_IDS_KEY,
    POKERPLUS_BIND_HASH_KEY,
    PRESET_AVATAR_IDS,
    PRESET_AVATAR_SRC_BY_ID,
    PROFILE_HASH_KEY,
    RESPECT_SCORE_KEY,
    normalizePeerChatUserId,
    pokerProfileFeeFromCachedProfile,
    pokerProfileStatusFromCachedProfile,
    pokerProfileStatusFromRakeServer,
    redisPipeline,
  } = deps;

  async function getDtIds(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const cmds = userIds.map((id) => ["HGET", DT_IDS_KEY, id]);
    const res = await redisPipeline(cmds);
    const out = {};
    if (res && Array.isArray(res)) {
      userIds.forEach((id, i) => {
        const v = res[i] && res[i].result ? String(res[i].result).trim() : null;
        if (v) out[id] = v;
      });
    }
    return out;
  }

  function sanitizeAvatarAccountId(id) {
    return String(id || "").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function resolveChatAvatarValue(value) {
    const data = value && typeof value === "string" ? value.trim() : "";
    if (!data) return "";
    if (data.startsWith("data:")) return data;
    if (data.startsWith("preset:")) {
      return PRESET_AVATAR_SRC_BY_ID[data.slice("preset:".length)] || "";
    }
    return "";
  }

  function presetAvatarIdForAccountId(accountId) {
    const s = String(accountId || "");
    let hash = 0;
    for (let i = 0; i < s.length; i += 1) {
      hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
    }
    return PRESET_AVATAR_IDS[hash % PRESET_AVATAR_IDS.length] || PRESET_AVATAR_IDS[0];
  }

  async function getAvatars(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const dtIds = await getDtIds(userIds);
    const lookups = [];
    const cmds = [];
    userIds.forEach((id) => {
      const accountId = dtIds[id] || id;
      const accountKey = AVATAR_PREFIX + sanitizeAvatarAccountId(accountId);
      const legacyKey = AVATAR_PREFIX + sanitizeAvatarAccountId(id);
      const hasLegacyFallback = legacyKey !== accountKey;
      lookups.push({ id, accountId, accountKey, hasLegacyFallback });
      cmds.push(["GET", accountKey]);
      if (hasLegacyFallback) cmds.push(["GET", legacyKey]);
    });
    const res = await redisPipeline(cmds);
    const out = {};
    const missingPresetWrites = [];
    if (res && Array.isArray(res)) {
      let resIndex = 0;
      lookups.forEach((lookup) => {
        const primary = res[resIndex] && res[resIndex].result;
        resIndex += 1;
        const legacy = lookup.hasLegacyFallback && res[resIndex] ? res[resIndex].result : "";
        if (lookup.hasLegacyFallback) resIndex += 1;
        const avatar = resolveChatAvatarValue(primary) || resolveChatAvatarValue(legacy);
        if (avatar) {
          out[lookup.id] = avatar;
          return;
        }
        const presetId = presetAvatarIdForAccountId(lookup.accountId);
        const presetSrc = PRESET_AVATAR_SRC_BY_ID[presetId];
        if (!presetSrc) return;
        out[lookup.id] = presetSrc;
        missingPresetWrites.push(["SET", lookup.accountKey, "preset:" + presetId]);
      });
    }
    if (missingPresetWrites.length) {
      await redisPipeline(missingPresetWrites);
    }
    return out;
  }

  async function getP21Ids(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const dtIds = await getDtIds(userIds);
    const cmds = userIds.map((id) => ["HGET", POKERPLUS_BIND_HASH_KEY, dtIds[id] || id]);
    const res = await redisPipeline(cmds);
    const out = {};
    if (res && Array.isArray(res)) {
      userIds.forEach((id, i) => {
        const v = res[i] && res[i].result ? String(res[i].result).trim() : null;
        if (v) out[id] = v;
      });
    }
    return out;
  }

  async function getPokerPlusVerifiedIds(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const dtIds = await getDtIds(userIds);
    const cmds = userIds.map((id) => ["HGET", POKERPLUS_BIND_HASH_KEY, dtIds[id] || id]);
    const res = await redisPipeline(cmds);
    const out = {};
    if (res && Array.isArray(res)) {
      userIds.forEach((id, i) => {
        const raw = res[i] ? res[i].result : null;
        const v = raw != null && raw !== false ? String(raw).trim() : "";
        if (v) out[id] = true;
      });
    }
    return out;
  }

  async function getPokerProfileStatusMeta(userIds, dtIdsKnown) {
    if (!userIds || userIds.length === 0) return {};
    const ids = [...new Set(userIds.filter(Boolean))];
    const canonicalIds = ids.map((id) => normalizePeerChatUserId(id));
    const lookupIds = [...new Set(ids.concat(canonicalIds).filter(Boolean))];
    const knownDtIds = dtIdsKnown && typeof dtIdsKnown === "object" ? dtIdsKnown : {};
    const missingDtLookupIds = lookupIds.filter((id) => !knownDtIds[id]);
    const fetchedDtIds = missingDtLookupIds.length ? await getDtIds(missingDtLookupIds) : {};
    const dtIds = Object.assign({}, fetchedDtIds, knownDtIds);
    const lookupGroups = ids.map((id, idx) => {
      const canonicalId = canonicalIds[idx];
      const accountIds = [dtIds[id], dtIds[canonicalId]].filter(Boolean);
      return accountIds.length
        ? [...new Set(accountIds)]
        : [...new Set([id, canonicalId].filter(Boolean))];
    });
    const cmds = lookupGroups.flatMap((keys) =>
      keys.flatMap((key) => [
        ["HGET", POKERPLUS_BIND_HASH_KEY, key],
        ["HGET", PROFILE_HASH_KEY, key],
      ])
    );
    const res = await redisPipeline(cmds);
    const out = {};
    if (res && Array.isArray(res)) {
      let resIndex = 0;
      ids.forEach((id, i) => {
        const keys = lookupGroups[i];
        let raw = "";
        for (let ki = 0; ki < keys.length; ki += 1) {
          const bindRow = res[resIndex++];
          const profileRow = res[resIndex++];
          const bound = bindRow && bindRow.result != null && String(bindRow.result).trim() !== "";
          if (!raw && bound && profileRow && profileRow.result != null) raw = String(profileRow.result);
        }
        if (!raw) return;
        let profile = null;
        try {
          profile = JSON.parse(raw);
        } catch (eParseProfile) {
          profile = null;
        }
        const fee = pokerProfileFeeFromCachedProfile(profile);
        if (fee == null && !profile) return;
        const statusFromProfile = typeof pokerProfileStatusFromCachedProfile === "function"
          ? pokerProfileStatusFromCachedProfile
          : defaultPokerProfileStatusFromCachedProfile;
        const meta = typeof statusFromProfile === "function"
          ? statusFromProfile(profile, { pokerPlusLinked: true })
          : pokerProfileStatusFromRakeServer(fee);
        const nickname = pokerPlusNicknameFromProfile(profile);
        if (nickname) meta.pokerPlusNickname = nickname;
        out[id] = meta;
      });
    }
    return out;
  }

  async function getRespectScores(userIds) {
    if (!userIds || userIds.length === 0) return {};
    const dtIds = await getDtIds(userIds);
    const cmds = userIds.map((id) => ["HGET", RESPECT_SCORE_KEY, dtIds[id] || id]);
    const res = await redisPipeline(cmds);
    const out = {};
    if (res && Array.isArray(res)) {
      userIds.forEach((id, i) => {
        const v = res[i] && res[i].result != null ? res[i].result : null;
        const num = v !== null && v !== undefined ? parseInt(String(v), 10) : 0;
        out[id] = Number.isNaN(num) ? 0 : num;
      });
    }
    return out;
  }

  return {
    getAvatars,
    getDtIds,
    getP21Ids,
    getPokerPlusVerifiedIds,
    getPokerProfileStatusMeta,
    getRespectScores,
    presetAvatarIdForAccountId,
    resolveChatAvatarValue,
    sanitizeAvatarAccountId,
  };
}

function pokerPlusNicknameFromProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return String(p.nickname || p.Nike || p.nick || p.name || p.displayName || p.display_name || "").trim();
}

module.exports = {
  createChatProfileLookupHelpers,
};
