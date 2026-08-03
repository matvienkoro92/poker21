"use strict";

const crypto = require("crypto");
const { authRequired, parseBody, setCors } = require("../api-auth");
const { ensureDtIdForUserId, getPreferredUserIdByDtId } = require("../account-id");
const { createChatProfileLookupHelpers } = require("../chat-profile-lookups");
const { PROFILE_HASH_KEY, readPokerPlusProfile } = require("../pokerplus");
const { pokerProfileStatusFromCachedProfile } = require("../chat-profile-status");
const { pipeline: redisPipeline, sscanall, isConfigured: redisConfigured } = require("../redis");
const { resolveTelegramOpenButtonUrl, sendTelegramMessage } = require("../telegram-bot-send");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const TRANSFER_IDS_KEY = "poker_app:transfers:ids";
const TRANSFER_DEALS_COUNT_KEY = "poker_app:transfer_deals_count";
const TRANSFER_SUBSCRIBERS_KEY = "poker_app:transfers:subscribers";
const TRANSFER_ACCOUNT_SUBSCRIBERS_KEY = "poker_app:transfers:account_subscribers";
const TRANSFER_KEY_PREFIX = "poker_app:transfer:";
const TRANSFER_USER_LIST_PREFIX = "poker_app:transfers:user:";
const TRANSFER_RESERVATION_PREFIX = "poker_app:transfer_reservation:";
const POKERPLUS_BIND_HASH_KEY = "poker_app:pokerplus_user_ids";
const AVATAR_PREFIX = "poker_app:avatar:";
const DT_IDS_KEY = "poker_app:visitor_dt_ids";
const PROFILE_CITY_KEY = "poker_app:profile_cities";
const TELEGRAM_VISIBLE_HASH = "poker_app:telegram_visible";
const USERNAMES_KEY = "poker_app:visitor_usernames";
const MAX_AMOUNT_RUB = 2500;
const REQUIRED_LEVEL = 10;
const RESERVE_MS = 10 * 60 * 1000;
const PUBLIC_LIST_LIMIT = 60;
const MY_LIST_LIMIT = 40;
const KEEP_PUBLIC_IDS = 300;
const KEEP_USER_IDS = 160;
const OPEN_BUTTON_URL = withStartApp(resolveTelegramOpenButtonUrl("https://t.me/poker21app_bot/start"), "transfers");
const PRESET_AVATAR_SRC_BY_ID = {
  tiger: "./assets/avatar-tiger.jpg", raccoon: "./assets/avatar-raccoon.jpg",
  skull: "./assets/avatar-skull.jpg", phoenix: "./assets/avatar-phoenix.jpg",
  octopus: "./assets/avatar-octopus.jpg", cat: "./assets/avatar-cat.jpg",
  robot: "./assets/avatar-robot.jpg", bulldog: "./assets/avatar-bulldog.jpg",
  monkey: "./assets/daily-poker-monkey.webp", fox: "./assets/avatar-fox.jpg",
  chip: "./assets/avatar-chip.jpg", koala: "./assets/avatar-koala.jpg",
  raven: "./assets/avatar-raven.jpg", crocodile: "./assets/avatar-crocodile.jpg",
  rabbit: "./assets/avatar-rabbit.jpg", chameleon: "./assets/avatar-chameleon.jpg",
  panda: "./assets/avatar-panda.jpg", wolf: "./assets/avatar-wolf.jpg",
  owl: "./assets/avatar-owl.jpg", bat: "./assets/avatar-bat.jpg",
  gorilla: "./assets/avatar-gorilla.jpg",
};
const PRESET_AVATAR_IDS = Object.keys(PRESET_AVATAR_SRC_BY_ID);
const { getAvatars } = createChatProfileLookupHelpers({
  AVATAR_PREFIX,
  DT_IDS_KEY,
  POKERPLUS_BIND_HASH_KEY,
  PRESET_AVATAR_IDS,
  PRESET_AVATAR_SRC_BY_ID,
  redisPipeline,
});

function json(res, status, payload) {
  res.status(status).json(payload);
}

function transferKey(id) {
  return TRANSFER_KEY_PREFIX + String(id || "").trim();
}

function transferUserListKey(accountId) {
  return TRANSFER_USER_LIST_PREFIX + String(accountId || "").trim();
}

function transferReservationKey(id) {
  return TRANSFER_RESERVATION_PREFIX + String(id || "").trim();
}

function transferId() {
  return "tr_" + Date.now().toString(36) + "_" + crypto.randomBytes(4).toString("hex");
}

function sanitizeText(value, maxLen) {
  return String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function sanitizeMultiline(value, maxLen) {
  return String(value == null ? "" : value)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, maxLen);
}

function normalizeKind(value) {
  const raw = String(value || "").trim().toLowerCase();
  return raw === "deposit" ? "deposit" : "cashout";
}

function normalizeAmount(value) {
  const raw = String(value == null ? "" : value).trim();
  let amount = Number(raw.replace(",", "."));
  if (!Number.isFinite(amount)) {
    const digits = raw.replace(/[^\d]/g, "");
    amount = digits ? Number(digits) : 0;
  }
  amount = Math.floor(amount);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

function normalizeRussianPhone(value) {
  let digits = String(value == null ? "" : value).replace(/\D/g, "");
  if (digits.length === 10 && digits.charAt(0) === "9") digits = "7" + digits;
  if (digits.length === 11 && digits.charAt(0) === "8") digits = "7" + digits.slice(1);
  return /^79\d{9}$/.test(digits) ? digits : "";
}

function displayNameFromIdentity(identity, accountId) {
  const first = sanitizeText(identity && (identity.firstName || identity.first_name), 40);
  const last = sanitizeText(identity && (identity.lastName || identity.last_name), 40);
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  const username = sanitizeText(identity && (identity.telegramUsername || identity.pwaUsername || identity.username), 40).replace(/^@+/, "");
  if (username) return "@" + username;
  return accountId || "Игрок";
}

function telegramChatIdFromMemberId(memberId) {
  const raw = String(memberId || "").trim();
  return raw.indexOf("tg_") === 0 ? raw.slice(3) : "";
}

function withStartApp(rawUrl, startapp) {
  const fallback = "https://t.me/Poker_dvatuza_bot/DvaTuza";
  const source = String(rawUrl || fallback).trim() || fallback;
  try {
    const url = new URL(source);
    url.searchParams.set("startapp", String(startapp || "").trim());
    return url.toString();
  } catch (e) {
    const sep = source.indexOf("?") >= 0 ? "&" : "?";
    return source + sep + "startapp=" + encodeURIComponent(String(startapp || "").trim());
  }
}

async function resolveActor(auth) {
  const userId = String(auth.memberId || "").trim();
  const accountId = await ensureDtIdForUserId(userId);
  if (!accountId) return null;
  const poker21Id = await readPoker21IdForActor({ userId, accountId });
  return {
    userId,
    accountId,
    poker21Id,
    chatId: telegramChatIdFromMemberId(userId),
    name: displayNameFromIdentity(auth.identity, accountId),
  };
}

async function readPoker21IdForActor(actor) {
  if (!actor) return "";
  try {
    const rows = await redisPipeline([
      ["HGET", POKERPLUS_BIND_HASH_KEY, actor.accountId || ""],
      ["HGET", POKERPLUS_BIND_HASH_KEY, actor.userId || ""],
    ], { context: "transfers.actorPoker21.lookup" });
    return String((rows && rows[0] && rows[0].result) || (rows && rows[1] && rows[1].result) || "").trim();
  } catch (e) {
    return "";
  }
}

function actorDisplayId(actor) {
  return String((actor && actor.poker21Id) || (actor && actor.accountId) || "").trim();
}

function cleanPoker21Id(value) {
  return String(value || "").trim();
}

function pokerPlusNicknameFromProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return sanitizeText(p.nickname || p.Nike || p.nick || p.name || p.displayName || p.display_name, 60);
}

function pokerPlusAvatarFromProfile(profile) {
  const p = profile && typeof profile === "object" ? profile : {};
  return sanitizeText(p.avatarUrl || p.HeadImageUrl || p.avatar || p.photoUrl || p.photo_url, 500);
}

function transferParticipantProfile(profile, fallbackName, fallbackPoker21Id, directory) {
  const p = profile && typeof profile === "object" ? profile : null;
  const extra = directory && typeof directory === "object" ? directory : {};
  const status = p ? pokerProfileStatusFromCachedProfile(p, { pokerPlusLinked: true }) : null;
  const level = status && Number.isFinite(Number(status.level)) ? Math.max(0, Math.floor(Number(status.level))) : 0;
  const poker21Avatar = pokerPlusAvatarFromProfile(p);
  const directoryAvatar = sanitizeText(extra.avatarUrl, 500);
  const directoryAvatarIsPreset = /^\.\/assets\/(?:avatar-|daily-poker-monkey)/i.test(directoryAvatar);
  const avatarUrl = directoryAvatar && !directoryAvatarIsPreset ? directoryAvatar : poker21Avatar || directoryAvatar;
  const avatarFallbackUrl = [poker21Avatar, directoryAvatar].find((url) => url && url !== avatarUrl) || "";
  return {
    name: pokerPlusNicknameFromProfile(p) || sanitizeText(fallbackName, 60) || "Игрок Poker21",
    avatarUrl,
    avatarFallbackUrl,
    level,
    poker21Id: cleanPoker21Id((p && (p.pokerPlusUserId || p.pokerPlusUserID || p.poker21UserId || p.poker21Id || p.Id || p.id || p.userId || p.p21Id)) || fallbackPoker21Id),
    city: sanitizeText(extra.city, 80),
    telegramUsername: sanitizeText(extra.telegramUsername, 64).replace(/^@+/, ""),
  };
}

function participantCandidateIds(item, role) {
  const out = [];
  [item && item[role + "AccountId"], item && item[role + "UserId"], item && item[role + "Poker21Id"]].forEach((value) => {
    const id = String(value || "").trim();
    if (id && out.indexOf(id) === -1) out.push(id);
  });
  return out;
}

async function readTransferHashValues(hash, ids, context) {
  const out = Object.create(null);
  if (!ids.length) return out;
  try {
    const rows = await redisPipeline([["HMGET", hash, ...ids]], { context });
    const values = rows && rows[0] && Array.isArray(rows[0].result) ? rows[0].result : [];
    ids.forEach((id, index) => {
      const value = String(values[index] || "").trim();
      if (value) out[id] = value;
    });
  } catch (e) {}
  return out;
}

async function readTransferParticipantDirectory(items) {
  const ids = [];
  (items || []).forEach((item) => {
    ["owner", "buyer", "seller"].forEach((role) => participantCandidateIds(item, role).forEach((id) => {
      if (ids.indexOf(id) === -1) ids.push(id);
    }));
  });
  if (!ids.length) return { avatars: {}, cities: {}, visible: {}, usernames: {} };
  const [avatars, cities, visible, usernames] = await Promise.all([
    getAvatars(ids).catch(() => ({})),
    readTransferHashValues(PROFILE_CITY_KEY, ids, "transfers.profile-cities"),
    readTransferHashValues(TELEGRAM_VISIBLE_HASH, ids, "transfers.telegram-visibility"),
    readTransferHashValues(USERNAMES_KEY, ids, "transfers.telegram-usernames"),
  ]);
  return { avatars, cities, visible, usernames };
}

function participantDirectoryFor(item, role, directory) {
  const ids = participantCandidateIds(item, role);
  const first = (map) => ids.map((id) => map[id]).find(Boolean) || "";
  const telegramVisible = ids.some((id) => String(directory.visible[id] || "") === "1");
  return {
    avatarUrl: first(directory.avatars),
    city: first(directory.cities),
    telegramUsername: telegramVisible ? first(directory.usernames) : "",
  };
}

async function readTransferPokerProfiles(ids) {
  const profiles = Object.create(null);
  if (!ids.length) return profiles;
  try {
    const rows = await redisPipeline([["HMGET", PROFILE_HASH_KEY, ...ids]], { context: "transfers.participant-profiles" });
    const values = rows && rows[0] && Array.isArray(rows[0].result) ? rows[0].result : [];
    ids.forEach((id, index) => {
      const raw = values[index] != null ? String(values[index]) : "";
      if (!raw) return;
      try {
        const profile = JSON.parse(raw);
        if (profile && typeof profile === "object") profiles[id] = profile;
      } catch (e) {}
    });
  } catch (e) {}
  return profiles;
}

async function readTransferDealCounts(ids) {
  const counts = Object.create(null);
  if (!ids.length) return counts;
  try {
    const rows = await redisPipeline([['HMGET', TRANSFER_DEALS_COUNT_KEY, ...ids]], { context: "transfers.participant-deal-counts" });
    const values = rows && rows[0] && Array.isArray(rows[0].result) ? rows[0].result : [];
    ids.forEach((id, index) => {
      counts[id] = Math.max(0, parseInt(String(values[index] == null ? 0 : values[index]), 10) || 0);
    });
  } catch (e) {}
  return counts;
}

async function enrichTransfersPoker21Ids(items) {
  const source = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!source.length) return source;
  const ids = [];
  const seen = new Set();
  function addId(value) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  }
  source.forEach((item) => {
    ["owner", "buyer", "seller"].forEach((role) => {
      addId(item[role + "AccountId"]);
      addId(item[role + "UserId"]);
    });
  });
  if (!ids.length) return source;
  const found = Object.create(null);
  try {
    const rows = await redisPipeline(ids.map((id) => ["HGET", POKERPLUS_BIND_HASH_KEY, id]), { context: "transfers.poker21.display-ids" });
    (rows || []).forEach((row, index) => {
      const value = cleanPoker21Id(row && row.result);
      if (value) found[ids[index]] = value;
    });
  } catch (e) {}
  const missingProfileIds = ids.filter((id) => !found[id]);
  if (missingProfileIds.length) {
    await Promise.all(missingProfileIds.map(async (id) => {
      const profile = await readPokerPlusProfile(id).catch(() => null);
      const value = cleanPoker21Id(profile && (profile.pokerPlusUserId || profile.Id || profile.userId || profile.p21Id));
      if (value) found[id] = value;
    }));
  }
  return source.map((item) => {
    const next = { ...item };
    ["owner", "buyer", "seller"].forEach((role) => {
      const key = role + "Poker21Id";
      if (cleanPoker21Id(next[key])) return;
      next[key] = found[next[role + "AccountId"]] || found[next[role + "UserId"]] || "";
    });
    return next;
  });
}

async function enrichTransfersParticipantProfiles(items) {
  const enriched = await enrichTransfersPoker21Ids(items);
  const accountIds = [];
  enriched.forEach((item) => {
    [item.ownerAccountId, item.buyerAccountId, item.sellerAccountId].forEach((value) => {
      const id = String(value || "").trim();
      if (id && accountIds.indexOf(id) === -1) accountIds.push(id);
    });
  });
  const [directory, dealCounts] = await Promise.all([
    readTransferParticipantDirectory(enriched),
    readTransferDealCounts(accountIds),
  ]);
  const profileIds = [];
  const seen = new Set();
  function addProfileId(value) {
    const id = String(value || "").trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    profileIds.push(id);
  }
  enriched.forEach((item) => {
    ["owner", "buyer", "seller"].forEach((role) => {
      participantCandidateIds(item, role).forEach(addProfileId);
    });
  });
  const profiles = await readTransferPokerProfiles(profileIds);
  return enriched.map((item) => {
    const next = { ...item };
    ["owner", "buyer", "seller"].forEach((role) => {
      if (!next[role + "AccountId"] && !next[role + "UserId"] && !next[role + "Poker21Id"] && !next[role + "Name"]) return;
      const participantProfile = participantCandidateIds(next, role)
        .map((id) => profiles[id])
        .find((profile) => profile && typeof profile === "object") || null;
      next[role + "Profile"] = transferParticipantProfile(
        participantProfile,
        next[role + "Name"],
        next[role + "Poker21Id"],
        participantDirectoryFor(next, role, directory)
      );
      next[role + "Profile"].dealsCount = Math.max(0, Number(dealCounts[next[role + "AccountId"]]) || 0);
    });
    return next;
  });
}

async function publicTransferEnriched(item, actor, now) {
  const enriched = await enrichTransfersParticipantProfiles([item]);
  return publicTransfer(enriched[0] || item, actor, now);
}

function levelAccessPayload(level) {
  const safeLevel = Math.max(0, Math.floor(Number(level) || 0));
  const allowed = safeLevel >= REQUIRED_LEVEL;
  return {
    allowed,
    level: safeLevel,
    requiredLevel: REQUIRED_LEVEL,
    message: allowed
      ? "Переводы доступны игрокам уровня " + REQUIRED_LEVEL + "+."
      : safeLevel > 0
        ? "Переводы доступны с " + REQUIRED_LEVEL + " уровня. Ваш уровень: " + safeLevel + "."
        : "Переводы доступны с " + REQUIRED_LEVEL + " уровня. Привяжите аккаунт Poker21 в профиле, чтобы уровень подтянулся.",
  };
}

async function readActorLevel(actor) {
  if (!actor || !actor.accountId) return 0;
  const pokerPlusId = actor.poker21Id || await readPoker21IdForActor(actor);
  const lookupIds = [pokerPlusId, actor.accountId].filter(Boolean);
  for (const id of lookupIds) {
    const profile = await readPokerPlusProfile(id).catch(() => null);
    if (!profile) continue;
    const status = pokerProfileStatusFromCachedProfile(profile, { pokerPlusLinked: true });
    const level = status && Number.isFinite(Number(status.level)) ? Math.max(0, Math.floor(Number(status.level))) : 0;
    if (level > 0) return level;
  }
  return 0;
}

async function ensureActorAccess(actor) {
  const level = await readActorLevel(actor);
  return levelAccessPayload(level);
}

function viewerPayload(actor, access, isAdmin) {
  return {
    accountId: actorDisplayId(actor),
    appAccountId: actor && actor.accountId ? actor.accountId : "",
    poker21Id: actor && actor.poker21Id ? actor.poker21Id : "",
    level: access && Number.isFinite(Number(access.level)) ? Number(access.level) : 0,
    requiredLevel: REQUIRED_LEVEL,
    transfersAccess: !!(access && access.allowed),
    isAdmin: !!isAdmin,
  };
}

function deniedJson(res, access) {
  return json(res, 403, {
    ok: false,
    error: (access && access.message) || ("Переводы доступны с " + REQUIRED_LEVEL + " уровня."),
    code: "TRANSFERS_LEVEL_REQUIRED",
    requiredLevel: REQUIRED_LEVEL,
    level: access && Number.isFinite(Number(access.level)) ? Number(access.level) : 0,
    access: access || levelAccessPayload(0),
  });
}

function parseTransfer(raw) {
  if (!raw) return null;
  try {
    const item = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!item || typeof item !== "object" || !item.id) return null;
    return item;
  } catch (e) {
    return null;
  }
}

function isParticipant(item, actor) {
  if (!item || !actor) return false;
  return (
    item.ownerAccountId === actor.accountId ||
    item.buyerAccountId === actor.accountId ||
    item.sellerAccountId === actor.accountId
  );
}

function clearTransferParticipant(item, role) {
  if (!item || !role) return;
  delete item[role + "UserId"];
  delete item[role + "AccountId"];
  delete item[role + "Poker21Id"];
  delete item[role + "DisplayId"];
  delete item[role + "ChatId"];
  delete item[role + "Name"];
  delete item[role + "Profile"];
  delete item[role + "Level"];
}

function normalizeExpiredReservation(item, now) {
  if (!item) return item;
  let next = item;
  if (next.status === "reserved") {
    const reservedUntil = Number(next.reservedUntil || 0);
    if (reservedUntil && reservedUntil <= now) {
      next = { ...next, status: "open", reservedUntil: 0, updatedAt: now };
      if (next.kind === "deposit") {
        clearTransferParticipant(next, "seller");
        next.requisites = "";
      } else {
        clearTransferParticipant(next, "buyer");
      }
    }
  }
  if (next.status === "open" && Number(next.expiresAt || 0) > 0 && Number(next.expiresAt) <= now) {
    next = { ...next, status: "expired", expiredAt: Number(next.expiresAt), updatedAt: now };
  }
  return next;
}

function publicTransfer(item, actor, now) {
  const normalized = normalizeExpiredReservation(item, now);
  const participant = isParticipant(normalized, actor);
  const canSeeRequisites = participant && (actor.accountId === normalized.buyerAccountId || actor.accountId === normalized.sellerAccountId);
  const viewerDisplayId = actorDisplayId(actor);
  const ownerDisplayId = normalized.ownerAccountId === (actor && actor.accountId)
    ? viewerDisplayId
    : (normalized.ownerPoker21Id || normalized.ownerDisplayId || normalized.ownerAccountId || "");
  const buyerDisplayId = normalized.buyerAccountId === (actor && actor.accountId)
    ? viewerDisplayId
    : (normalized.buyerPoker21Id || normalized.buyerDisplayId || normalized.buyerAccountId || "");
  const sellerDisplayId = normalized.sellerAccountId === (actor && actor.accountId)
    ? viewerDisplayId
    : (normalized.sellerPoker21Id || normalized.sellerDisplayId || normalized.sellerAccountId || "");
  const out = {
    id: normalized.id,
    kind: normalized.kind,
    amount: Number(normalized.amount || 0),
    comment: normalized.comment || "",
    status: normalized.status || "open",
    createdAt: normalized.createdAt || 0,
    updatedAt: normalized.updatedAt || normalized.createdAt || 0,
    reservedUntil: normalized.status === "reserved" ? Number(normalized.reservedUntil || 0) : 0,
    expiresAt: Number(normalized.expiresAt || 0),
    ownerAccountId: normalized.ownerAccountId || "",
    ownerDisplayId,
    ownerName: normalized.ownerName || "",
    ownerProfile: normalized.ownerProfile || null,
    buyerAccountId: normalized.buyerAccountId || "",
    buyerDisplayId,
    buyerName: normalized.buyerName || "",
    buyerProfile: normalized.buyerProfile || null,
    sellerAccountId: normalized.sellerAccountId || "",
    sellerDisplayId,
    sellerName: normalized.sellerName || "",
    sellerProfile: normalized.sellerProfile || null,
    isOwner: !!(actor && normalized.ownerAccountId === actor.accountId),
    isBuyer: !!(actor && normalized.buyerAccountId === actor.accountId),
    isSeller: !!(actor && normalized.sellerAccountId === actor.accountId),
    isMine: participant,
    canSeeRequisites,
  };
  if (canSeeRequisites) out.requisites = normalized.requisites || "";
  return out;
}

async function readTransfer(id) {
  const rows = await redisPipeline([["GET", transferKey(id)]], { context: "transfers.readOne" });
  return parseTransfer(rows && rows[0] ? rows[0].result : null);
}

async function saveTransfer(item, extraCommands) {
  const commands = [
    ["SET", transferKey(item.id), JSON.stringify(item)],
  ].concat(extraCommands || []);
  const rows = await redisPipeline(commands, { context: "transfers.save" });
  return !!rows;
}

async function notifyTelegram(chatId, text) {
  if (!chatId || !BOT_TOKEN || !text) return;
  await sendTelegramMessage(BOT_TOKEN, {
    chatId,
    text,
    buttonText: "Открыть переводы",
    buttonUrl: OPEN_BUTTON_URL,
  }).catch(() => null);
}

async function resolveActorTelegramChatId(actor) {
  if (!actor) return "";
  if (actor.chatId) return String(actor.chatId);
  try {
    const preferred = await getPreferredUserIdByDtId(actor.accountId);
    return telegramChatIdFromMemberId(preferred);
  } catch (e) {
    return "";
  }
}

async function transferSubscriptionState(actor) {
  if (!actor) return false;
  const chatId = await resolveActorTelegramChatId(actor);
  const rows = await redisPipeline([
    ["SISMEMBER", TRANSFER_ACCOUNT_SUBSCRIBERS_KEY, actor.accountId],
    ["SISMEMBER", TRANSFER_SUBSCRIBERS_KEY, chatId || ""],
  ], { context: "transfers.subscriptionState" });
  return !!(
    (rows && rows[0] && Number(rows[0].result) === 1) ||
    (rows && rows[1] && Number(rows[1].result) === 1)
  );
}

async function setTransferSubscription(res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось определить игрока" });
  const chatId = await resolveActorTelegramChatId(actor);
  const subscribed = body.unsubscribe !== true && body.subscribe !== false;
  if (subscribed && !chatId) {
    return json(res, 400, {
      ok: false,
      code: "BOT_REQUIRED",
      error: "Чтобы получать уведомления, войдите через Telegram и запустите бота клуба.",
      openUrl: "https://t.me/Poker_dvatuza_bot",
    });
  }
  const command = subscribed ? "SADD" : "SREM";
  const commands = [[command, TRANSFER_ACCOUNT_SUBSCRIBERS_KEY, actor.accountId]];
  if (chatId) commands.push([command, TRANSFER_SUBSCRIBERS_KEY, chatId]);
  const rows = await redisPipeline(commands, { context: "transfers.subscriptionUpdate" });
  if (!rows) return json(res, 503, { ok: false, error: "Не удалось изменить подписку" });
  return json(res, 200, { ok: true, subscribed });
}

async function notifyTransferSubscribers(item, actor) {
  if (!item || item.kind !== "cashout") return;
  const subscriberIds = await sscanall(TRANSFER_SUBSCRIBERS_KEY, {
    context: "transfers.notifySubscribers",
    count: 250,
    maxPages: 200,
  }).catch(() => []);
  const ownChatId = await resolveActorTelegramChatId(actor);
  const chatIds = Array.isArray(subscriberIds) ? subscriberIds : [];
  const playerName = sanitizeText(actor.name, 80) || actorDisplayId(actor) || "Poker21";
  const playerId = actorDisplayId(actor);
  const playerLabel = playerId && playerName !== playerId ? playerName + " (ID " + playerId + ")" : playerName;
  const text = "Игрок " + playerLabel +
    " разместил реквизиты на сумму " + Number(item.amount || 0).toLocaleString("ru-RU") + " ₽.";
  await Promise.all(chatIds
    .map((id) => String(id || "").trim())
    .filter((id, index, list) => id && id !== ownChatId && list.indexOf(id) === index)
    .map((chatId) => notifyTelegram(chatId, text)));
}

function transferTitle(item) {
  return (item.kind === "deposit" ? "депозит" : "кешаут") + " на " + Number(item.amount || 0) + " ₽";
}

async function createTransfer(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);

  const kind = normalizeKind(body.kind);
  const amount = normalizeAmount(body.amount);
  if (!amount || amount > MAX_AMOUNT_RUB) return json(res, 400, { ok: false, error: "Укажите сумму до " + MAX_AMOUNT_RUB + " ₽" });

  const requisites = kind === "cashout" ? sanitizeMultiline(body.requisites || body.details, 700) : "";
  const rawPhoneNumber = sanitizeText(body.phoneNumber, 40);
  const recipientName = sanitizeText(body.recipientName, 120);
  if (kind === "cashout" && !recipientName) {
    return json(res, 400, { ok: false, error: "Укажите получателя (ФИО)" });
  }
  if (kind === "cashout" && rawPhoneNumber && !normalizeRussianPhone(rawPhoneNumber)) {
    return json(res, 400, { ok: false, error: "Телефон должен быть в формате +7 (999) 999-99-99" });
  }
  if (kind === "cashout" && !requisites) {
    return json(res, 400, { ok: false, error: "Для кешаута нужны реквизиты" });
  }

  const now = Date.now();
  const requestedActiveMinutes = Math.floor(Number(body.activeMinutes) || 30);
  const activeMinutes = [15, 30, 60].indexOf(requestedActiveMinutes) !== -1 ? requestedActiveMinutes : 30;
  const item = {
    id: transferId(),
    kind,
    amount,
    comment: sanitizeMultiline(body.comment, 240),
    requisites,
    status: "open",
    ownerUserId: actor.userId,
    ownerAccountId: actor.accountId,
    ownerPoker21Id: actor.poker21Id || "",
    ownerChatId: actor.chatId,
    ownerName: actor.name,
    createdAt: now,
    updatedAt: now,
    activeMinutes,
    expiresAt: now + activeMinutes * 60 * 1000,
  };
  if (kind === "cashout") {
    item.sellerUserId = actor.userId;
    item.sellerAccountId = actor.accountId;
    item.sellerPoker21Id = actor.poker21Id || "";
    item.sellerChatId = actor.chatId;
    item.sellerName = actor.name;
  } else {
    item.buyerUserId = actor.userId;
    item.buyerAccountId = actor.accountId;
    item.buyerPoker21Id = actor.poker21Id || "";
    item.buyerChatId = actor.chatId;
    item.buyerName = actor.name;
  }

  const saved = await saveTransfer(item, [
    ["LPUSH", TRANSFER_IDS_KEY, item.id],
    ["LTRIM", TRANSFER_IDS_KEY, "0", String(KEEP_PUBLIC_IDS - 1)],
    ["LPUSH", transferUserListKey(actor.accountId), item.id],
    ["LTRIM", transferUserListKey(actor.accountId), "0", String(KEEP_USER_IDS - 1)],
  ]);
  if (!saved) return json(res, 503, { ok: false, error: "Не удалось сохранить заявку" });
  await notifyTransferSubscribers(item, actor).catch(() => null);
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now), maxAmount: MAX_AMOUNT_RUB });
}

async function takeTransfer(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);
  const id = sanitizeText(body.id || body.transferId, 80);
  if (!id) return json(res, 400, { ok: false, error: "Не выбрана заявка" });

  const reserveRows = await redisPipeline([
    ["SET", transferReservationKey(id), actor.accountId, "NX", "PX", String(RESERVE_MS)],
  ], { context: "transfers.reserve" });
  const reserved = !!(reserveRows && reserveRows[0] && reserveRows[0].result);
  if (!reserved) return json(res, 409, { ok: false, error: "Эту заявку уже взяли. Попробуйте другую." });

  const now = Date.now();
  let item = normalizeExpiredReservation(await readTransfer(id), now);
  if (!item || item.status !== "open") {
    await redisPipeline([["DEL", transferReservationKey(id)]], { context: "transfers.reserve.release" });
    return json(res, 409, { ok: false, error: "Заявка уже недоступна" });
  }
  if (item.ownerAccountId === actor.accountId) {
    await redisPipeline([["DEL", transferReservationKey(id)]], { context: "transfers.reserve.release" });
    return json(res, 400, { ok: false, error: "Свою заявку брать нельзя" });
  }

  const requisites = item.kind === "deposit" ? sanitizeMultiline(body.requisites || body.details, 700) : item.requisites || "";
  if (item.kind === "deposit" && !requisites) {
    await redisPipeline([["DEL", transferReservationKey(id)]], { context: "transfers.reserve.release" });
    return json(res, 400, { ok: false, error: "Укажите реквизиты для депозита" });
  }

  item = {
    ...item,
    status: "reserved",
    reservedUntil: now + RESERVE_MS,
    requisites,
    updatedAt: now,
  };
  if (item.kind === "cashout") {
    item.buyerUserId = actor.userId;
    item.buyerAccountId = actor.accountId;
    item.buyerPoker21Id = actor.poker21Id || "";
    item.buyerChatId = actor.chatId;
    item.buyerName = actor.name;
  } else {
    item.sellerUserId = actor.userId;
    item.sellerAccountId = actor.accountId;
    item.sellerPoker21Id = actor.poker21Id || "";
    item.sellerChatId = actor.chatId;
    item.sellerName = actor.name;
  }

  const saved = await saveTransfer(item, [
    ["LPUSH", transferUserListKey(actor.accountId), item.id],
    ["LTRIM", transferUserListKey(actor.accountId), "0", String(KEEP_USER_IDS - 1)],
  ]);
  if (!saved) {
    await redisPipeline([["DEL", transferReservationKey(id)]], { context: "transfers.reserve.release" });
    return json(res, 503, { ok: false, error: "Не удалось взять заявку" });
  }

  if (item.kind === "cashout") {
    const buyerDisplayId = actorDisplayId(actor);
    await notifyTelegram(
      item.sellerChatId,
      buyerDisplayId + " взял ваши реквизиты в работу. После получения " + item.amount + " ₽ переведите фишки игроку на ID " + buyerDisplayId + "."
    );
  } else {
    await notifyTelegram(
      item.buyerChatId,
      actorDisplayId(actor) + " взял вашу заявку на депозит и указал реквизиты. У вас есть 10 минут, чтобы отправить " + item.amount + " ₽."
    );
  }
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now), reserveMs: RESERVE_MS });
}

async function markSent(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);
  const id = sanitizeText(body.id || body.transferId, 80);
  const now = Date.now();
  const item = normalizeExpiredReservation(await readTransfer(id), now);
  if (!item || item.status !== "reserved" || item.buyerAccountId !== actor.accountId) {
    return json(res, 409, { ok: false, error: "Заявка сейчас не ждёт вашу отправку" });
  }
  if (Number(item.reservedUntil || 0) <= now) {
    return json(res, 409, { ok: false, error: "10 минут истекли, заявка снова доступна другим" });
  }
  item.status = "buyer_sent";
  item.sentAt = now;
  item.updatedAt = now;
  const saved = await saveTransfer(item);
  if (!saved) return json(res, 503, { ok: false, error: "Не удалось обновить заявку" });
  const buyerDisplayId = actorDisplayId(actor);
  await notifyTelegram(
    item.sellerChatId,
    buyerDisplayId + " отправил вам " + item.amount + " ₽. Переведите ему фишки в приложении на ID " + buyerDisplayId + " и нажмите «Перевёл»."
  );
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now) });
}

async function markTransferred(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);
  const id = sanitizeText(body.id || body.transferId, 80);
  const now = Date.now();
  const item = normalizeExpiredReservation(await readTransfer(id), now);
  if (!item || item.status !== "buyer_sent" || item.sellerAccountId !== actor.accountId) {
    return json(res, 409, { ok: false, error: "Заявка сейчас не ждёт перевод фишек" });
  }
  item.status = "seller_transferred";
  item.transferredAt = now;
  item.updatedAt = now;
  const saved = await saveTransfer(item);
  if (!saved) return json(res, 503, { ok: false, error: "Не удалось обновить заявку" });
  await notifyTelegram(
    item.buyerChatId,
    "Вам перевели фишки в приложении по сделке " + transferTitle(item) + ". Нажмите «Получил», чтобы подтвердить получение."
  );
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now) });
}

async function markReceived(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);
  const id = sanitizeText(body.id || body.transferId, 80);
  const now = Date.now();
  const item = normalizeExpiredReservation(await readTransfer(id), now);
  if (!item || item.status !== "seller_transferred" || item.buyerAccountId !== actor.accountId) {
    return json(res, 409, { ok: false, error: "Заявка сейчас не ждёт ваше подтверждение" });
  }
  item.status = "completed";
  item.completedAt = now;
  item.updatedAt = now;
  const commands = [
    ["HINCRBY", TRANSFER_DEALS_COUNT_KEY, item.buyerAccountId, "1"],
    ["HINCRBY", TRANSFER_DEALS_COUNT_KEY, item.sellerAccountId, "1"],
  ];
  const saved = await saveTransfer(item, commands);
  if (!saved) return json(res, 503, { ok: false, error: "Не удалось закрыть сделку" });
  await notifyTelegram(
    item.sellerChatId,
    "Сделка " + transferTitle(item) + " закрыта. " + actorDisplayId(actor) + " подтвердил получение."
  );
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now) });
}

async function cancelTransfer(req, res, auth, body) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  if (!access.allowed) return deniedJson(res, access);
  const id = sanitizeText(body.id || body.transferId, 80);
  const now = Date.now();
  const item = normalizeExpiredReservation(await readTransfer(id), now);
  if (!item || item.ownerAccountId !== actor.accountId || item.status !== "open") {
    return json(res, 409, { ok: false, error: "Эту заявку уже нельзя отменить" });
  }
  item.status = "cancelled";
  item.updatedAt = now;
  const saved = await saveTransfer(item);
  if (!saved) return json(res, 503, { ok: false, error: "Не удалось отменить заявку" });
  return json(res, 200, { ok: true, item: await publicTransferEnriched(item, actor, now) });
}

async function deleteTransfer(req, res, auth, body) {
  if (!auth || !auth.isAdmin) return json(res, 403, { ok: false, error: "Удалять заявки может только администратор" });
  const id = sanitizeText(body.id || body.transferId, 80);
  if (!id) return json(res, 400, { ok: false, error: "Не выбрана заявка" });
  const item = await readTransfer(id);
  if (!item) return json(res, 404, { ok: false, error: "Заявка не найдена" });
  const accountIds = [item.ownerAccountId, item.buyerAccountId, item.sellerAccountId]
    .map((value) => String(value || "").trim())
    .filter((value, index, list) => value && list.indexOf(value) === index);
  const commands = [
    ["LREM", TRANSFER_IDS_KEY, "0", id],
    ["DEL", transferKey(id)],
    ["DEL", transferReservationKey(id)],
  ];
  accountIds.forEach((accountId) => commands.push(["LREM", transferUserListKey(accountId), "0", id]));
  const removed = await redisPipeline(commands, { context: "transfers.adminDelete" });
  if (!removed) return json(res, 503, { ok: false, error: "Не удалось удалить заявку" });
  return json(res, 200, { ok: true, deleted: true, id });
}

async function listTransfers(req, res, auth) {
  const actor = await resolveActor(auth);
  if (!actor) return json(res, 500, { ok: false, error: "Не удалось подготовить ID игрока" });
  const access = await ensureActorAccess(actor);
  const subscribed = await transferSubscriptionState(actor).catch(() => false);
  if (!access.allowed) {
    return json(res, 200, {
      ok: true,
      viewer: viewerPayload(actor, access, auth.isAdmin),
      access,
      items: [],
      maxAmount: MAX_AMOUNT_RUB,
      reserveMs: RESERVE_MS,
      now: Date.now(),
      subscribed,
    });
  }
  if (!redisConfigured()) {
    return json(res, 200, { ok: true, viewer: viewerPayload(actor, access, auth.isAdmin), access, items: [], maxAmount: MAX_AMOUNT_RUB, reserveMs: RESERVE_MS, now: Date.now(), subscribed });
  }
  const listRows = await redisPipeline([
    ["LRANGE", TRANSFER_IDS_KEY, "0", String(PUBLIC_LIST_LIMIT - 1)],
    ["LRANGE", transferUserListKey(actor.accountId), "0", String(MY_LIST_LIMIT - 1)],
  ], { context: "transfers.listIds" });
  const publicIds = listRows && listRows[0] && Array.isArray(listRows[0].result) ? listRows[0].result : [];
  const myIds = listRows && listRows[1] && Array.isArray(listRows[1].result) ? listRows[1].result : [];
  const ids = [];
  publicIds.concat(myIds).forEach((raw) => {
    const id = sanitizeText(raw, 80);
    if (id && ids.indexOf(id) === -1) ids.push(id);
  });
  if (!ids.length) {
    return json(res, 200, { ok: true, viewer: viewerPayload(actor, access, auth.isAdmin), access, items: [], maxAmount: MAX_AMOUNT_RUB, reserveMs: RESERVE_MS, now: Date.now(), subscribed });
  }
  const rows = await redisPipeline(ids.map((id) => ["GET", transferKey(id)]), { context: "transfers.listItems" });
  const now = Date.now();
  const normalizedItems = (rows || [])
    .map((row) => parseTransfer(row && row.result))
    .filter(Boolean)
    .map((item) => normalizeExpiredReservation(item, now))
    .filter((item) => item.status !== "cancelled" || isParticipant(item, actor));
  const enrichedItems = await enrichTransfersParticipantProfiles(normalizedItems);
  const items = enrichedItems
    .map((item) => publicTransfer(item, actor, now))
    .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0));
  return json(res, 200, {
    ok: true,
    viewer: viewerPayload(actor, access, auth.isAdmin),
    access,
    items,
    maxAmount: MAX_AMOUNT_RUB,
    reserveMs: RESERVE_MS,
    now,
    subscribed,
  });
}

module.exports = async function handler(req, res) {
  setCors(res, "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.status(204).end();
  let body = {};
  try {
    body = parseBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: "Bad JSON" });
  }
  const auth = authRequired(req, body, BOT_TOKEN);
  if (!auth.ok) return json(res, auth.status || 401, { ok: false, error: auth.error || "Auth required" });
  if (!redisConfigured()) return json(res, 503, { ok: false, error: "Redis не настроен" });

  if (req.method === "GET") return listTransfers(req, res, auth);
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" });

  const action = sanitizeText(body.action, 40).toLowerCase();
  if (action === "subscribe") return setTransferSubscription(res, auth, body);
  if (action === "create") return createTransfer(req, res, auth, body);
  if (action === "take") return takeTransfer(req, res, auth, body);
  if (action === "sent") return markSent(req, res, auth, body);
  if (action === "transferred") return markTransferred(req, res, auth, body);
  if (action === "received") return markReceived(req, res, auth, body);
  if (action === "cancel") return cancelTransfer(req, res, auth, body);
  if (action === "delete") return deleteTransfer(req, res, auth, body);
  return json(res, 400, { ok: false, error: "Unknown action" });
};
