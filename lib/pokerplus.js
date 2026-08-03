const crypto = require("crypto");
const { redisPipeline } = require("./account-id");
const { hscanall } = require("./redis");

const POKERPLUS_BASE_URL = String(process.env.POKERPLUS_BASE_URL || "https://sp.poker21pro.com/service_v1").replace(/\/$/, "");
const POKERPLUS_MERCHANT_ID = String(process.env.POKERPLUS_MERCHANT_ID || "").trim();
const POKERPLUS_SECRET_KEY = String(process.env.POKERPLUS_SECRET_KEY || "").trim();
const POKERPLUS_STORAGE_SECRET = String(
  process.env.POKERPLUS_STORAGE_SECRET || process.env.POKERPLUS_CIPHERTEXT_SECRET || POKERPLUS_SECRET_KEY || ""
).trim();
const POKERPLUS_REQUEST_TIMEOUT_MS = Math.max(
  1000,
  Number(process.env.POKERPLUS_REQUEST_TIMEOUT_MS || process.env.POKERPLUS_TIMEOUT_MS || 5000) || 5000
);

const TOKEN_CACHE_KEY = "poker_app:pokerplus:token";
const BIND_HASH_KEY = "poker_app:pokerplus_user_ids";
const BIND_REVERSE_HASH_KEY = "poker_app:pokerplus_accounts_by_user_id";
const NICKNAME_REVERSE_HASH_KEY = "poker_app:pokerplus_accounts_by_nickname";
const BIND_LOCK_PREFIX = "poker_app:pokerplus_bind_lock:";
const BIND_AT_HASH_KEY = "poker_app:pokerplus_bound_at";
const UNBIND_AT_HASH_KEY = "poker_app:pokerplus_unbound_at";
const PROFILE_HASH_KEY = "poker_app:pokerplus_profiles";
const PROFILE_SYNC_AT_HASH_KEY = "poker_app:pokerplus_profiles_synced_at";
const PROFILE_SNAPSHOT_HASH_PREFIX = "poker_app:pokerplus_profile_snapshots:";
const EMAIL_HASH_KEY = "poker_app:pokerplus_emails";
const EMAIL_ORIGINALS_HASH_KEY = "poker_app:email_originals";
const CIPHERTEXT_HASH_KEY = "poker_app:pokerplus_ciphertexts";
const TELEGRAM_HASH_KEY = "poker_app:pokerplus_telegram_values";
const TELEGRAM_REVERSE_HASH_KEY = "poker_app:pokerplus_accounts_by_telegram_value";
const KEY_FIELD_HASH_KEY = "poker_app:pokerplus_key_fields";
const ENCRYPTED_PREFIX = "enc:v1:";
const KEY_BIND_FIELD_NAMES = Object.freeze(["ciphertext", "cipherText", "key", "code"]);
const INVISIBLE_KEY_CHARS_RE = /[\u200B-\u200D\u2060\uFEFF]/g;
const CYRILLIC_KEY_LOOKALIKE_MAP = Object.freeze({
  "\u0410": "A",
  "\u0412": "B",
  "\u0415": "E",
  "\u041a": "K",
  "\u041c": "M",
  "\u041d": "H",
  "\u041e": "O",
  "\u0420": "P",
  "\u0421": "C",
  "\u0422": "T",
  "\u0423": "Y",
  "\u0425": "X",
  "\u0430": "a",
  "\u0432": "b",
  "\u0435": "e",
  "\u043a": "k",
  "\u043c": "m",
  "\u043d": "h",
  "\u043e": "o",
  "\u0440": "p",
  "\u0441": "c",
  "\u0442": "t",
  "\u0443": "y",
  "\u0445": "x",
});

function hasPokerPlusConfig() {
  return !!(POKERPLUS_BASE_URL && POKERPLUS_MERCHANT_ID && POKERPLUS_SECRET_KEY);
}

function normalizePokerPlusUserAppId(value) {
  return String(value || "").trim().replace(/^tg_/, "");
}

function normalizePokerPlusCiphertext(value) {
  return String(value || "")
    .replace(INVISIBLE_KEY_CHARS_RE, "")
    .replace(/\s+/g, "")
    .trim()
    .replace(/[\u0410\u0412\u0415\u041a\u041c\u041d\u041e\u0420\u0421\u0422\u0423\u0425\u0430\u0432\u0435\u043A\u043C\u043D\u043E\u0440\u0441\u0442\u0443\u0445]/g, function (ch) {
      return CYRILLIC_KEY_LOOKALIKE_MAP[ch] || ch;
    });
}

function pokerPlusSafeKeyMeta(value) {
  const normalized = normalizePokerPlusCiphertext(value);
  return {
    length: normalized.length,
    ascii: /^[\x20-\x7E]*$/.test(normalized),
    alnum: /^[A-Za-z0-9]*$/.test(normalized),
  };
}

function buildPokerPlusUserAppIdVariants(value) {
  const input = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const variants = [];
  input.forEach(function (item) {
    const normalized = normalizePokerPlusUserAppId(item);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    variants.push(normalized);
  });
  return variants;
}

function buildPokerPlusKeyBindUserAppIdVariants(value) {
  const variants = [""].concat(buildPokerPlusUserAppIdVariants(value));
  const seen = new Set();
  return variants.filter(function (item) {
    const normalized = String(item || "").trim();
    if (seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function getCipherStorageKey() {
  if (!POKERPLUS_STORAGE_SECRET) return null;
  return crypto.createHash("sha256").update(POKERPLUS_STORAGE_SECRET).digest();
}

function encryptStoredCiphertext(ciphertext) {
  const key = getCipherStorageKey();
  if (!key) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(String(ciphertext || ""), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ENCRYPTED_PREFIX + iv.toString("base64") + "." + tag.toString("base64") + "." + enc.toString("base64");
}

function decryptStoredCiphertext(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.indexOf(ENCRYPTED_PREFIX) !== 0) return raw;
  const key = getCipherStorageKey();
  if (!key) return "";
  const payload = raw.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(".");
  if (parts.length !== 3) {
    const err = new Error("PokerPlus ciphertext payload is invalid");
    err.statusCode = 500;
    throw err;
  }
  const iv = Buffer.from(parts[0], "base64");
  const tag = Buffer.from(parts[1], "base64");
  const enc = Buffer.from(parts[2], "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

async function postForm(endpoint, payload) {
  const form = new FormData();
  Object.keys(payload || {}).forEach(function (key) {
    if (payload[key] == null) return;
    form.append(key, String(payload[key]));
  });
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(function () {
    try { controller.abort(); } catch (eAbort) {}
  }, POKERPLUS_REQUEST_TIMEOUT_MS) : null;
  let res;
  try {
    res = await fetch(POKERPLUS_BASE_URL + "/" + endpoint, {
      method: "POST",
      body: form,
      signal: controller ? controller.signal : undefined,
    });
  } catch (errFetch) {
    const aborted = errFetch && (errFetch.name === "AbortError" || /abort/i.test(String(errFetch.message || "")));
    const err = new Error(aborted ? "Poker21 request timeout" : "Poker21 request failed");
    err.statusCode = aborted ? 504 : 502;
    err.payload = { endpoint, timeout: aborted };
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error("PokerPlus HTTP " + res.status);
    err.statusCode = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

function unwrapSuccessResponse(data, fallbackMessage) {
  if (data && Number(data.status) === 1) return data.data || {};
  const err = new Error(
    (data && (data.message || data.error || data.msg)) || fallbackMessage || "PokerPlus request failed"
  );
  err.statusCode = 502;
  err.payload = data;
  throw err;
}

async function readCachedToken() {
  const pipe = await redisPipeline([["GET", TOKEN_CACHE_KEY]]);
  const value = pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
  return value || "";
}

async function writeCachedToken(token) {
  if (!token) return;
  await redisPipeline([["SETEX", TOKEN_CACHE_KEY, "28740", String(token)]]);
}

async function getPokerPlusToken(forceRefresh) {
  if (!hasPokerPlusConfig()) {
    const err = new Error("PokerPlus is not configured");
    err.statusCode = 500;
    throw err;
  }
  if (!forceRefresh) {
    const cached = await readCachedToken();
    if (cached) return cached;
  }
  const tokenResp = await postForm("getToken", {
    merchantId: POKERPLUS_MERCHANT_ID,
    secretKey: POKERPLUS_SECRET_KEY,
  });
  const tokenData = unwrapSuccessResponse(tokenResp, "PokerPlus token request failed");
  const token = tokenData && tokenData.token ? String(tokenData.token).trim() : "";
  if (!token) {
    const err = new Error("PokerPlus token is empty");
    err.statusCode = 502;
    throw err;
  }
  await writeCachedToken(token);
  return token;
}

async function requestWithToken(endpoint, payload, retryOnAuthError) {
  const token = await getPokerPlusToken(false);
  try {
    const res = await postForm(endpoint, Object.assign({}, payload || {}, { token }));
    return unwrapSuccessResponse(res, "PokerPlus request failed");
  } catch (err) {
    if (retryOnAuthError !== false) {
      const msg = String((err && err.payload && err.payload.message) || err.message || "").toLowerCase();
      if (msg.indexOf("token") !== -1 || msg.indexOf("expired") !== -1 || msg.indexOf("invalid") !== -1) {
        const freshToken = await getPokerPlusToken(true);
        const retryRes = await postForm(endpoint, Object.assign({}, payload || {}, { token: freshToken }));
        return unwrapSuccessResponse(retryRes, "PokerPlus request failed");
      }
    }
    throw err;
  }
}

function normalizeCounter(data) {
  const total = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const pickNumber = (...keys) => {
    for (let i = 0; i < keys.length; i += 1) {
      const value = total[keys[i]];
      if (value != null && value === value && String(value).trim() !== "") return Number(value);
    }
    return null;
  };
  return {
    fee: pickNumber("fee"),
    mttRound: pickNumber("mtt_round", "mttRound", "mtt_rounds", "mttRounds"),
    mttWinnings: pickNumber("mtt_winnings", "mttWinnings"),
    mttCountedWinnings: pickNumber("mtt_counted_winnings", "mttCountedWinnings", "mtt_count_winnings", "mttCountWinnings", "mtt_tournament_winnings", "mttTournamentWinnings"),
    sngRound: pickNumber("sng_round", "sngRound", "sng_rounds", "sngRounds"),
    sngWinnings: pickNumber("sng_winnings", "sngWinnings"),
    hands: pickNumber("hands", "hand", "hands_count", "hand_count", "hands_cnt", "hand_cnt", "played_hands", "playedHands", "played_hands_count", "hands_num", "hand_num"),
    winnings: pickNumber("winnings"),
    bb: pickNumber("bb"),
    ofcWinnings: pickNumber("ofc_winnings", "ofcWinnings"),
    mttCount: pickNumber("mtt_count", "mttCount"),
    mttItmCount: pickNumber("mtt_itm_count", "mttItmCount"),
    mttFirstCount: pickNumber("mtt_1st_count", "mttFirstCount", "mtt_first_count", "mttFirstPlaceCount", "mtt_first_place_count"),
    sngCount: pickNumber("sng_count", "sngCount"),
    sngItmCount: pickNumber("sng_itm_count", "sngItmCount"),
    sngFirstCount: pickNumber("sng_1st_count", "sngFirstCount", "sng_first_count", "sngFirstPlaceCount", "sng_first_place_count"),
  };
}

const POKERPLUS_COUNTER_PROFILE_KEYS = Object.freeze(["todayCounter", "weekCounter", "totalCounter"]);
const POKERPLUS_COUNTER_STAT_KEYS = Object.freeze([
  "fee",
  "mttRound",
  "mttWinnings",
  "mttCountedWinnings",
  "sngRound",
  "sngWinnings",
  "hands",
  "winnings",
  "bb",
  "ofcWinnings",
  "mttCount",
  "mttItmCount",
  "mttFirstCount",
  "sngCount",
  "sngItmCount",
  "sngFirstCount",
]);

function pokerPlusMoscowDateKey(rawTs) {
  const n = Number(rawTs);
  const ts = Number.isFinite(n) && n > 0 ? n : Date.now();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts));
  const out = {};
  parts.forEach(function (part) {
    if (part.type !== "literal") out[part.type] = part.value;
  });
  return [out.year, out.month, out.day].join("-");
}

function pokerPlusSnapshotHashKey(accountId) {
  const id = String(accountId || "").trim();
  return id ? PROFILE_SNAPSHOT_HASH_PREFIX + id : "";
}

function pokerPlusCounterHasAnyNumber(counter) {
  const total = counter && typeof counter === "object" ? counter : null;
  if (!total) return false;
  return POKERPLUS_COUNTER_STAT_KEYS.some(function (key) {
    const raw = total[key];
    return raw != null && raw !== "" && Number.isFinite(Number(raw));
  });
}

function pokerPlusStatsSnapshotFromProfile(profile, syncedAt) {
  const p = profile && typeof profile === "object" ? profile : null;
  if (!p) return null;
  const capturedAt = Number(syncedAt) || Date.now();
  const totalCounter = normalizeCounter(p.totalCounter || p.total_counter);
  const todayCounter = normalizeCounter(p.todayCounter || p.today_counter);
  const weekCounter = normalizeCounter(p.weekCounter || p.week_counter);
  if (!pokerPlusCounterHasAnyNumber(totalCounter) && !pokerPlusCounterHasAnyNumber(todayCounter)) return null;
  const snapshot = {
    date: pokerPlusMoscowDateKey(capturedAt),
    capturedAt,
    totalCounter,
    todayCounter,
  };
  if (pokerPlusCounterHasAnyNumber(weekCounter)) snapshot.weekCounter = weekCounter;
  return snapshot;
}

function parsePokerPlusStatsSnapshot(raw, fallbackDate) {
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(parsed.date || ""))
    ? String(parsed.date)
    : /^\d{4}-\d{2}-\d{2}$/.test(String(fallbackDate || ""))
      ? String(fallbackDate)
      : "";
  if (!date) return null;
  return {
    date,
    capturedAt: Number(parsed.capturedAt) || 0,
    totalCounter: normalizeCounter(parsed.totalCounter || parsed.total_counter),
    todayCounter: normalizeCounter(parsed.todayCounter || parsed.today_counter),
    weekCounter: normalizeCounter(parsed.weekCounter || parsed.week_counter),
  };
}

async function savePokerPlusStatsSnapshot(accountId, profile, syncedAt) {
  const key = pokerPlusSnapshotHashKey(accountId);
  const snapshot = key ? pokerPlusStatsSnapshotFromProfile(profile, syncedAt) : null;
  if (!key || !snapshot) return null;
  await redisPipeline([["HSET", key, snapshot.date, JSON.stringify(snapshot)]]);
  return snapshot;
}

async function readPokerPlusStatsSnapshots(accountId) {
  const key = pokerPlusSnapshotHashKey(accountId);
  if (!key) return null;
  const pipe = await redisPipeline([["HGETALL", key]]);
  const raw = pipe && pipe[0] && Array.isArray(pipe[0].result) ? pipe[0].result : [];
  const dailyCounters = {};
  const capturedAtByDate = {};
  const dates = [];
  for (let i = 0; i < raw.length - 1; i += 2) {
    const date = String(raw[i] || "").trim();
    const snapshot = parsePokerPlusStatsSnapshot(raw[i + 1], date);
    if (!snapshot || !pokerPlusCounterHasAnyNumber(snapshot.todayCounter)) continue;
    if (dates.indexOf(snapshot.date) === -1) dates.push(snapshot.date);
    dailyCounters[snapshot.date] = snapshot.todayCounter;
    capturedAtByDate[snapshot.date] = snapshot.capturedAt || 0;
  }
  dates.sort();
  return {
    dates,
    firstDate: dates[0] || "",
    lastDate: dates.length ? dates[dates.length - 1] : "",
    dailyCounters,
    capturedAtByDate,
  };
}

async function attachPokerPlusStatsSnapshots(accountId, profile) {
  if (!profile || typeof profile !== "object") return profile;
  let snapshots = await readPokerPlusStatsSnapshots(accountId);
  if (!(snapshots && snapshots.dates && snapshots.dates.length) && pokerPlusStatsSnapshotFromProfile(profile, profile.syncedAt)) {
    await savePokerPlusStatsSnapshot(accountId, profile, profile.syncedAt || Date.now());
    snapshots = await readPokerPlusStatsSnapshots(accountId);
  }
  if (snapshots && snapshots.dates && snapshots.dates.length) {
    profile.statsSnapshots = snapshots;
  } else {
    delete profile.statsSnapshots;
  }
  return profile;
}

function pokerPlusCounterValues(profile) {
  const p = profile && typeof profile === "object" ? profile : null;
  if (!p) return [];
  const values = [];
  POKERPLUS_COUNTER_PROFILE_KEYS.forEach(function (counterKey) {
    const counter = p[counterKey] && typeof p[counterKey] === "object" ? p[counterKey] : null;
    if (!counter) return;
    POKERPLUS_COUNTER_STAT_KEYS.forEach(function (statKey) {
      const raw = counter[statKey];
      if (raw == null || raw !== raw || String(raw).trim() === "") return;
      const n = Number(raw);
      if (Number.isFinite(n)) values.push(n);
    });
  });
  return values;
}

function pokerPlusProfileStatsOnlyZero(profile) {
  const values = pokerPlusCounterValues(profile);
  return values.length > 0 && values.every(function (value) { return value === 0; });
}

function pokerPlusProfileHasAnyStats(profile) {
  return pokerPlusCounterValues(profile).length > 0;
}

function pokerPlusStripProfileStats(profile) {
  const next = Object.assign({}, profile || {});
  POKERPLUS_COUNTER_PROFILE_KEYS.forEach(function (key) {
    delete next[key];
  });
  next.statsPending = true;
  return next;
}

async function pokerPlusReplacePlaceholderStats(accountId, profile) {
  if (!pokerPlusProfileStatsOnlyZero(profile)) return profile;
  const cached = await readPokerPlusProfile(accountId);
  if (cached && pokerPlusProfileHasAnyStats(cached) && !pokerPlusProfileStatsOnlyZero(cached)) {
    const next = Object.assign({}, profile);
    POKERPLUS_COUNTER_PROFILE_KEYS.forEach(function (key) {
      if (cached[key] && typeof cached[key] === "object") next[key] = cached[key];
    });
    delete next.statsPending;
    return next;
  }
  return pokerPlusStripProfileStats(profile);
}

function normalizePlayerProfile(data, linkedUserId) {
  return {
    linked: true,
    pokerPlusUserId: data && data.Id != null ? String(data.Id).trim() : linkedUserId || null,
    nickname: data && data.Nike != null ? String(data.Nike).trim() : "",
    avatarUrl: data && data.HeadImageUrl != null ? String(data.HeadImageUrl).trim() : "",
    leagueId: data && data.league_id != null ? String(data.league_id).trim() : "",
    groupId: data && data.group_id != null ? String(data.group_id).trim() : "",
    registerDate: data && data.RegisterDate != null ? String(data.RegisterDate).trim() : "",
    position: data && data.position != null ? String(data.position).trim() : "",
    balance: data && data.gold != null ? String(data.gold).trim() : "",
    lastLoginDate: data && data.LastLoginDate != null ? String(data.LastLoginDate).trim() : "",
    lastLoginIp: data && data.LastLoginIp != null ? String(data.LastLoginIp).trim() : "",
    country: data && data.Country != null ? String(data.Country).trim() : "",
    role: data && data.Role != null ? String(data.Role).trim() : "",
    email: data && data.email != null ? String(data.email).trim() : "",
    totalCounter: normalizeCounter(data && data.total_counter),
    todayCounter: normalizeCounter(data && data.today_counter),
    weekCounter: normalizeCounter(data && data.week_counter),
  };
}

function isPokerPlusPlayerNotFoundError(err) {
  const raw = String(
    (err && err.payload && (err.payload.message || err.payload.error || err.payload.msg)) ||
      (err && err.message) ||
      ""
  );
  return /player data not found/i.test(raw);
}

function isPokerPlusBindingFailedError(err) {
  const raw = String(
    (err && err.payload && (err.payload.message || err.payload.error || err.payload.msg)) ||
      (err && err.message) ||
      ""
  );
  return /\bbinding failed\b/i.test(raw) || /\bbind failed\b/i.test(raw);
}

function isPokerPlusParameterError(err) {
  const raw = String(
    (err && err.payload && (err.payload.message || err.payload.error || err.payload.msg)) ||
      (err && err.message) ||
      ""
  );
  return /parameter error|param(?:eter)? invalid|invalid param/i.test(raw);
}

function isPokerPlusNoBindingInfoError(err) {
  const raw = String(
    (err && err.payload && (err.payload.message || err.payload.error || err.payload.msg)) ||
      (err && err.message) ||
      ""
  );
  return /no binding information/i.test(raw);
}

function buildEmailCaseVariants(email) {
  const raw = String(email || "").trim().slice(0, 190);
  if (!raw) return [];
  const at = raw.indexOf("@");
  if (at <= 0) return [raw];
  const local = raw.slice(0, at);
  const domain = raw.slice(at + 1);
  const lowerLocal = local.toLowerCase();
  const lowerDomain = domain.toLowerCase();
  const titleLocal = lowerLocal.replace(/(^|[._+-])([a-z])/g, function (_, prefix, letter) {
    return prefix + letter.toUpperCase();
  });
  const variants = [
    raw,
    lowerLocal + "@" + lowerDomain,
    local + "@" + lowerDomain,
    lowerLocal.charAt(0).toUpperCase() + lowerLocal.slice(1) + "@" + lowerDomain,
    titleLocal + "@" + lowerDomain,
    lowerLocal.toUpperCase() + "@" + lowerDomain,
  ];
  const seen = new Set();
  return variants.filter(function (item) {
    const value = String(item || "").trim().slice(0, 190);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function buildRefreshEmailVariants(email) {
  const input = Array.isArray(email) ? email : [email];
  const seen = new Set();
  const variants = [];
  input.forEach(function (item) {
    buildEmailCaseVariants(item).forEach(function (variant) {
      const value = String(variant || "").trim().slice(0, 190);
      if (!value || seen.has(value)) return;
      seen.add(value);
      variants.push(value);
    });
  });
  return variants;
}

function buildBindEmailVariants(email) {
  const variants = buildRefreshEmailVariants(email);
  const seen = new Set();
  return [""].concat(variants).filter(function (item) {
    const value = String(item || "").trim().slice(0, 190);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function hasPokerPlusEmailCandidate(email) {
  const input = Array.isArray(email) ? email : [email];
  return input.some(function (item) {
    return !!String(item || "").trim();
  });
}

function isPokerPlusBindRetryableError(err) {
  return isPokerPlusBindingFailedError(err) || isPokerPlusPlayerNotFoundError(err) || isPokerPlusParameterError(err);
}

function pokerPlusBindAttemptErrorMessage(err) {
  return String(
    (err && err.payload && (err.payload.message || err.payload.error || err.payload.msg)) ||
      (err && err.message) ||
      "PokerPlus bind failed"
  );
}

function attachPokerPlusBindAttempts(err, attempts) {
  if (err && attempts && attempts.length) {
    err.pokerPlusBindAttempts = attempts;
    err.pokerPlusBindAttemptsTotal = attempts.length;
  }
  return err;
}

function buildPokerPlusBindFailureError(lastErr, attempts) {
  const sourceAttempts = Array.isArray(attempts) ? attempts : [];
  const bindingFailed = sourceAttempts.some(function (attempt) {
    return /binding failed|bind failed/i.test(String((attempt && attempt.error) || ""));
  });
  if (!bindingFailed) return attachPokerPlusBindAttempts(lastErr || new Error("PokerPlus bind failed"), sourceAttempts);
  const err = new Error("Binding failed");
  err.statusCode = lastErr && lastErr.statusCode ? lastErr.statusCode : 502;
  return attachPokerPlusBindAttempts(err, sourceAttempts);
}

function buildPokerPlusKeyBindMetadataVariants(userAppIdVariants, emailVariants) {
  const users = Array.isArray(userAppIdVariants) ? userAppIdVariants : [userAppIdVariants];
  const emails = Array.isArray(emailVariants) ? emailVariants : [emailVariants];
  const seen = new Set();
  const result = [];
  function push(userAppId, mail) {
    const normalizedUserAppId = normalizePokerPlusUserAppId(userAppId);
    const normalizedMail = String(mail || "").trim().slice(0, 190);
    const key = normalizedUserAppId + "\n" + normalizedMail;
    if (seen.has(key)) return;
    seen.add(key);
    result.push({ userAppId: normalizedUserAppId, mail: normalizedMail });
  }
  push("", "");
  emails.forEach(function (mail) {
    if (String(mail || "").trim()) push("", mail);
  });
  users.forEach(function (userAppId) {
    const normalizedUserAppId = normalizePokerPlusUserAppId(userAppId);
    if (!normalizedUserAppId) return;
    push(normalizedUserAppId, "");
    emails.forEach(function (mail) {
      if (String(mail || "").trim()) push(normalizedUserAppId, mail);
    });
  });
  return result;
}

function pokerPlusKeyBindPayload(userAppId, ciphertext, mail, keyField) {
  const field = KEY_BIND_FIELD_NAMES.indexOf(keyField) !== -1 ? keyField : KEY_BIND_FIELD_NAMES[0];
  const payload = {};
  payload[field] = ciphertext;
  const normalizedMail = String(mail || "").trim().slice(0, 190);
  if (normalizedMail) payload.mail = normalizedMail;
  const normalizedUserAppId = normalizePokerPlusUserAppId(userAppId);
  if (normalizedUserAppId) payload.user_app_id = normalizedUserAppId;
  return payload;
}

function buildPokerPlusFastKeyBindMetadataVariants(userAppIdVariants) {
  const users = buildPokerPlusKeyBindUserAppIdVariants(userAppIdVariants).filter(Boolean);
  const firstUser = users[0] || "";
  const lastUser = users.length > 1 ? users[users.length - 1] : "";
  const seen = new Set();
  const result = [];
  function push(userAppId) {
    const normalized = normalizePokerPlusUserAppId(userAppId);
    if (seen.has(normalized)) return;
    seen.add(normalized);
    result.push({ userAppId: normalized, mail: "" });
  }
  push("");
  push(firstUser);
  push(lastUser);
  return result;
}

async function requestPokerPlusKeyBindFastVariants(userAppId, ciphertext) {
  const normalizedCiphertext = normalizePokerPlusCiphertext(ciphertext);
  if (!normalizedCiphertext) {
    const err = new Error("PokerPlus bind requires a key");
    err.statusCode = 400;
    throw err;
  }
  const metadataVariants = buildPokerPlusFastKeyBindMetadataVariants(userAppId);
  const attempts = [];
  const tasks = [];
  metadataVariants.forEach(function (meta) {
    KEY_BIND_FIELD_NAMES.forEach(function (keyField) {
      tasks.push(
        requestWithToken(
          "getBindMiniAppPlayer",
          pokerPlusKeyBindPayload(meta.userAppId, normalizedCiphertext, meta.mail, keyField)
        )
          .then(function (data) {
            return {
              data,
              matchedEmail: meta.mail,
              matchedKeyField: keyField,
              matchedUserAppId: meta.userAppId,
              normalizedCiphertext,
            };
          })
          .catch(function (err) {
            attempts.push({
              keyField,
              userAppId: meta.userAppId ? "present" : "omitted",
              mail: "omitted",
              error: pokerPlusBindAttemptErrorMessage(err),
            });
            throw err;
          })
      );
    });
  });
  try {
    return await Promise.any(tasks);
  } catch (errAny) {
    const errors = errAny && Array.isArray(errAny.errors) ? errAny.errors : [];
    const lastErr = errors.length ? errors[errors.length - 1] : errAny;
    throw buildPokerPlusBindFailureError(lastErr, attempts);
  }
}

async function requestPokerPlusKeyBindVariants(userAppId, ciphertext, email) {
  const userAppIdVariants = buildPokerPlusKeyBindUserAppIdVariants(userAppId);
  const normalizedCiphertext = normalizePokerPlusCiphertext(ciphertext);
  const emailVariants = buildBindEmailVariants(email);
  if (!normalizedCiphertext) {
    const err = new Error("PokerPlus bind requires a key");
    err.statusCode = 400;
    throw err;
  }
  const metadataVariants = buildPokerPlusKeyBindMetadataVariants(userAppIdVariants, emailVariants);
  const attempts = [];
  let data = null;
  let matchedUserAppId = "";
  let matchedEmail = "";
  let matchedKeyField = KEY_BIND_FIELD_NAMES[0];
  let lastErr = null;
  for (let i = 0; i < metadataVariants.length && !data; i += 1) {
    const meta = metadataVariants[i];
    for (let f = 0; f < KEY_BIND_FIELD_NAMES.length; f += 1) {
      const keyField = KEY_BIND_FIELD_NAMES[f];
      try {
        data = await requestWithToken(
          "getBindMiniAppPlayer",
          pokerPlusKeyBindPayload(meta.userAppId, normalizedCiphertext, meta.mail, keyField)
        );
        matchedUserAppId = meta.userAppId;
        matchedEmail = meta.mail;
        matchedKeyField = keyField;
        break;
      } catch (err) {
        lastErr = err;
        attempts.push({
          keyField,
          userAppId: meta.userAppId ? "present" : "omitted",
          mail: meta.mail ? "present" : "omitted",
          error: pokerPlusBindAttemptErrorMessage(err),
        });
        if (!isPokerPlusBindRetryableError(err)) throw attachPokerPlusBindAttempts(err, attempts);
      }
    }
  }
  if (!data) throw buildPokerPlusBindFailureError(lastErr, attempts);
  return {
    data,
    matchedEmail,
    matchedKeyField,
    matchedUserAppId,
    normalizedCiphertext,
  };
}

async function saveBoundPokerPlusUserId(accountId, pokerPlusUserId, options) {
  if (!accountId) return;
  if (pokerPlusUserId) {
    const normalizedPokerPlusUserId = String(pokerPlusUserId).trim();
    const existingRows = await redisPipeline([["HGET", BIND_HASH_KEY, accountId]]);
    const existingPokerPlusUserId = existingRows && existingRows[0] && existingRows[0].result != null
      ? String(existingRows[0].result).trim()
      : "";
    const bindingChanged = existingPokerPlusUserId !== normalizedPokerPlusUserId;
    const lockToken = crypto.randomBytes(16).toString("hex");
    const lockKey = BIND_LOCK_PREFIX + crypto.createHash("sha256").update(normalizedPokerPlusUserId.toLowerCase()).digest("hex");
    let lockAcquired = false;
    try {
      if (bindingChanged) {
        const lockRows = await redisPipeline([["SET", lockKey, lockToken, "NX", "EX", "30"]]);
        lockAcquired = !!(lockRows && lockRows[0] && (lockRows[0].result === "OK" || lockRows[0].result === true));
        if (!lockAcquired) {
          const busy = new Error("Привязка этого Poker21 уже выполняется. Попробуйте ещё раз.");
          busy.statusCode = 409;
          busy.code = "POKER21_BIND_BUSY";
          throw busy;
        }
        const reverseField = normalizedPokerPlusUserId.toLowerCase();
        const reverseRows = await redisPipeline([["HGET", BIND_REVERSE_HASH_KEY, reverseField]]);
        let ownerAccountId = reverseRows && reverseRows[0] && reverseRows[0].result
          ? String(reverseRows[0].result).trim()
          : "";
        if (!ownerAccountId) {
          const bindings = await hscanall(BIND_HASH_KEY, {
            context: "pokerplus.bind-index-backfill",
            count: 500,
            maxPages: 100,
          });
          const backfillCommands = [];
          Object.keys(bindings || {}).forEach((boundAccountId) => {
            const boundPokerPlusId = String(bindings[boundAccountId] || "").trim();
            if (!boundPokerPlusId) return;
            backfillCommands.push(["HSET", BIND_REVERSE_HASH_KEY, boundPokerPlusId.toLowerCase(), boundAccountId]);
            if (boundPokerPlusId.toLowerCase() === reverseField) ownerAccountId = boundAccountId;
          });
          if (backfillCommands.length) await redisPipeline(backfillCommands);
        }
        if (ownerAccountId && ownerAccountId !== accountId) {
          const conflict = new Error("Этот аккаунт Poker21 уже привязан к другому профилю.");
          conflict.statusCode = 409;
          conflict.code = "POKER21_ALREADY_BOUND";
          throw conflict;
        }
      }
      const commands = [
        ["HSET", BIND_HASH_KEY, accountId, normalizedPokerPlusUserId],
        ["HSET", BIND_REVERSE_HASH_KEY, normalizedPokerPlusUserId.toLowerCase(), accountId],
      ];
      if (existingPokerPlusUserId && existingPokerPlusUserId !== normalizedPokerPlusUserId) {
        commands.push(["HDEL", BIND_REVERSE_HASH_KEY, existingPokerPlusUserId.toLowerCase()]);
      }
      if ((!options || options.recordBoundAt !== false) && !existingPokerPlusUserId) {
        commands.push(["HSET", BIND_AT_HASH_KEY, accountId, String(Date.now())]);
      }
      await redisPipeline(commands);
    } finally {
      if (lockAcquired) {
        await redisPipeline([[
          "EVAL",
          "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
          "1",
          lockKey,
          lockToken,
        ]]);
      }
    }
  } else {
    const existingRows = await redisPipeline([["HGET", BIND_HASH_KEY, accountId]]);
    const existingPokerPlusUserId = existingRows && existingRows[0] && existingRows[0].result
      ? String(existingRows[0].result).trim()
      : "";
    await redisPipeline([
      ["HDEL", BIND_HASH_KEY, accountId],
      ["HDEL", BIND_AT_HASH_KEY, accountId],
      ...(existingPokerPlusUserId ? [["HDEL", BIND_REVERSE_HASH_KEY, existingPokerPlusUserId.toLowerCase()]] : []),
    ]);
  }
}

async function readBoundPokerPlusUserId(accountId) {
  if (!accountId) return "";
  const pipe = await redisPipeline([["HGET", BIND_HASH_KEY, accountId]]);
  return pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
}

async function savePokerPlusProfile(accountId, profile) {
  if (!accountId || !profile) return;
  const syncedAt = Date.now();
  const storedProfile = Object.assign({}, profile, { syncedAt });
  const nickname = pokerPlusProfileNickname(storedProfile);
  const commands = [
    ["HSET", PROFILE_HASH_KEY, accountId, JSON.stringify(storedProfile)],
    ["HSET", PROFILE_SYNC_AT_HASH_KEY, accountId, String(syncedAt)],
    ["DEL", "poker_app:private_cash_search_ready:v1"],
  ];
  if (nickname) commands.push(["HSET", NICKNAME_REVERSE_HASH_KEY, normalizePokerPlusNicknameKey(nickname), accountId]);
  await redisPipeline(commands);
  await savePokerPlusStatsSnapshot(accountId, storedProfile, syncedAt);
  const snapshots = await readPokerPlusStatsSnapshots(accountId);
  try {
    profile.syncedAt = syncedAt;
    if (snapshots && snapshots.dates && snapshots.dates.length) profile.statsSnapshots = snapshots;
    else delete profile.statsSnapshots;
  } catch (e) {}
}

function pokerPlusProfileNickname(profile) {
  const row = profile && typeof profile === "object" ? profile : {};
  return String(row.nickname || row.Nike || row.nick || row.name || row.displayName || row.display_name || "").trim();
}

function normalizePokerPlusNicknameKey(value) {
  return String(value || "")
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ");
}

async function savePokerPlusEmail(accountId, email) {
  if (!accountId) return;
  const normalized = String(email || "").trim().slice(0, 190);
  if (normalized) {
    await redisPipeline([["HSET", EMAIL_HASH_KEY, accountId, normalized]]);
  } else {
    await redisPipeline([["HDEL", EMAIL_HASH_KEY, accountId]]);
  }
}

async function readPokerPlusEmail(accountId) {
  if (!accountId) return "";
  const pipe = await redisPipeline([["HGET", EMAIL_HASH_KEY, accountId]]);
  return pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
}

async function savePokerPlusTelegramValue(accountId, telegramValue) {
  if (!accountId) return;
  const normalized = String(telegramValue || "").trim();
  const previousRows = await redisPipeline([["HGET", TELEGRAM_HASH_KEY, accountId]]);
  const previous = previousRows && previousRows[0] && previousRows[0].result != null
    ? String(previousRows[0].result).trim()
    : "";
  if (normalized) {
    await redisPipeline([
      ["HSET", TELEGRAM_HASH_KEY, accountId, normalized],
      ["HSET", TELEGRAM_REVERSE_HASH_KEY, normalizePokerPlusUserAppId(normalized), accountId],
      ...(previous && previous !== normalized
        ? [["HDEL", TELEGRAM_REVERSE_HASH_KEY, normalizePokerPlusUserAppId(previous)]]
        : []),
    ]);
  } else {
    await redisPipeline([
      ["HDEL", TELEGRAM_HASH_KEY, accountId],
      ...(previous ? [["HDEL", TELEGRAM_REVERSE_HASH_KEY, normalizePokerPlusUserAppId(previous)]] : []),
    ]);
  }
}

async function savePokerPlusKeyField(accountId, keyField) {
  if (!accountId) return;
  const normalized = KEY_BIND_FIELD_NAMES.indexOf(keyField) !== -1 ? keyField : KEY_BIND_FIELD_NAMES[0];
  await redisPipeline([["HSET", KEY_FIELD_HASH_KEY, accountId, normalized]]);
}

async function readPokerPlusKeyField(accountId) {
  if (!accountId) return KEY_BIND_FIELD_NAMES[0];
  const pipe = await redisPipeline([["HGET", KEY_FIELD_HASH_KEY, accountId]]);
  const raw = pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
  return KEY_BIND_FIELD_NAMES.indexOf(raw) !== -1 ? raw : KEY_BIND_FIELD_NAMES[0];
}

async function readPokerPlusTelegramValue(accountId) {
  if (!accountId) return "";
  const pipe = await redisPipeline([["HGET", TELEGRAM_HASH_KEY, accountId]]);
  return pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
}

function pokerPlusHashResultToObject(raw) {
  const out = {};
  if (Array.isArray(raw)) {
    for (let i = 0; i < raw.length - 1; i += 2) {
      const key = raw[i] != null ? String(raw[i]).trim() : "";
      if (!key) continue;
      out[key] = raw[i + 1] != null ? String(raw[i + 1]).trim() : "";
    }
    return out;
  }
  if (raw && typeof raw === "object") {
    Object.keys(raw).forEach(function (key) {
      const normalizedKey = key != null ? String(key).trim() : "";
      if (!normalizedKey) return;
      out[normalizedKey] = raw[key] != null ? String(raw[key]).trim() : "";
    });
  }
  return out;
}

function isPokerPlusDtAccountId(value) {
  return /^ID\d{6}$/.test(String(value || "").trim());
}

function pushUniquePokerPlusSourceValue(list, seen, value) {
  const normalized = normalizePokerPlusUserAppId(value);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  list.push(normalized);
}

function pushUniquePokerPlusMail(list, seen, value) {
  const mail = String(value || "").trim();
  const key = mail.toLowerCase();
  if (!mail || seen.has(key)) return;
  seen.add(key);
  list.push(mail);
}

function pokerPlusResponseEmail(data) {
  return data && data.email != null ? String(data.email).trim().slice(0, 190) : "";
}

async function readPokerPlusLinkedSourcesByUserAppIds(userAppIds) {
  const allowed = new Set(buildPokerPlusUserAppIdVariants(userAppIds));
  if (allowed.size) {
    const allowedIds = Array.from(allowed);
    const reverseRows = await redisPipeline([
      ["HMGET", BIND_REVERSE_HASH_KEY, ...allowedIds.map((id) => id.toLowerCase())],
      ["HMGET", TELEGRAM_REVERSE_HASH_KEY, ...allowedIds],
    ]);
    const accountIds = Array.from(new Set(
      []
        .concat(reverseRows && reverseRows[0] && Array.isArray(reverseRows[0].result) ? reverseRows[0].result : [])
        .concat(reverseRows && reverseRows[1] && Array.isArray(reverseRows[1].result) ? reverseRows[1].result : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    ));
    if (accountIds.length) {
      const pointRows = await redisPipeline([
        ["HMGET", TELEGRAM_HASH_KEY, ...accountIds],
        ["HMGET", EMAIL_HASH_KEY, ...accountIds],
        ["HMGET", BIND_HASH_KEY, ...accountIds],
        ["HMGET", EMAIL_ORIGINALS_HASH_KEY, ...accountIds],
      ]);
      const out = [];
      accountIds.forEach((accountId, index) => {
        const telegramValue = normalizePokerPlusUserAppId(pointRows?.[0]?.result?.[index]);
        const boundUserId = normalizePokerPlusUserAppId(pointRows?.[2]?.result?.[index]);
        const mail = String(pointRows?.[1]?.result?.[index] || pointRows?.[3]?.result?.[index] || "").trim();
        const sourceIds = [boundUserId, isPokerPlusDtAccountId(telegramValue) ? telegramValue : ""].filter(Boolean);
        if (!sourceIds.length && telegramValue) sourceIds.push(telegramValue);
        sourceIds.forEach((userAppId) => {
          if (allowed.has(userAppId) && mail) out.push({ accountId, userAppId, mail });
        });
      });
      if (out.length) return out;
    }
  }
  const pipe = await redisPipeline([
    ["HGETALL", TELEGRAM_HASH_KEY],
    ["HGETALL", EMAIL_HASH_KEY],
    ["HGETALL", BIND_HASH_KEY],
    ["HGETALL", EMAIL_ORIGINALS_HASH_KEY],
  ]);
  const telegramByAccount = pokerPlusHashResultToObject(pipe && pipe[0] ? pipe[0].result : null);
  const emailByAccount = pokerPlusHashResultToObject(pipe && pipe[1] ? pipe[1].result : null);
  const boundByAccount = pokerPlusHashResultToObject(pipe && pipe[2] ? pipe[2].result : null);
  const appEmailByAccount = pokerPlusHashResultToObject(pipe && pipe[3] ? pipe[3].result : null);
  const accountIds = Array.from(new Set(Object.keys(telegramByAccount).concat(Object.keys(boundByAccount))));
  const reverseBackfill = [];
  accountIds.forEach((accountId) => {
    const bound = normalizePokerPlusUserAppId(boundByAccount[accountId]);
    const telegram = normalizePokerPlusUserAppId(telegramByAccount[accountId]);
    if (bound) reverseBackfill.push(["HSET", BIND_REVERSE_HASH_KEY, bound.toLowerCase(), accountId]);
    if (telegram) reverseBackfill.push(["HSET", TELEGRAM_REVERSE_HASH_KEY, telegram, accountId]);
  });
  if (reverseBackfill.length) await redisPipeline(reverseBackfill);
  const groups = new Map();
  const directSources = [];
  accountIds.forEach(function (accountId) {
    const boundUserId = normalizePokerPlusUserAppId(boundByAccount[accountId]);
    const telegramValue = normalizePokerPlusUserAppId(telegramByAccount[accountId]);
    const mail = String(emailByAccount[accountId] || appEmailByAccount[accountId] || "").trim();
    const boundAllowed = boundUserId && (!allowed.size || allowed.has(boundUserId));
    if (boundAllowed) {
      let group = groups.get(boundUserId);
      if (!group) {
        group = {
          sourceIds: [],
          sourceSeen: new Set(),
          mails: [],
          mailSeen: new Set(),
        };
        groups.set(boundUserId, group);
      }
      pushUniquePokerPlusSourceValue(group.sourceIds, group.sourceSeen, boundUserId);
      if (isPokerPlusDtAccountId(telegramValue)) {
        pushUniquePokerPlusSourceValue(group.sourceIds, group.sourceSeen, telegramValue);
      }
      if (!telegramValue && isPokerPlusDtAccountId(accountId)) {
        pushUniquePokerPlusSourceValue(group.sourceIds, group.sourceSeen, accountId);
      }
      pushUniquePokerPlusMail(group.mails, group.mailSeen, mail);
      return;
    }
    if (!telegramValue || !mail) return;
    if (allowed.size && !allowed.has(telegramValue)) return;
    directSources.push({ accountId, userAppId: telegramValue, mail });
  });
  const sources = directSources.slice();
  groups.forEach(function (group) {
    group.mails.forEach(function (mail) {
      group.sourceIds.forEach(function (userAppId) {
        sources.push({ userAppId, mail });
      });
    });
  });
  return sources;
}

async function savePokerPlusCiphertext(accountId, ciphertext) {
  if (!accountId) return;
  const normalized = normalizePokerPlusCiphertext(ciphertext);
  if (normalized) {
    const encrypted = encryptStoredCiphertext(normalized);
    if (!encrypted) {
      await redisPipeline([["HDEL", CIPHERTEXT_HASH_KEY, accountId]]);
      return;
    }
    await redisPipeline([["HSET", CIPHERTEXT_HASH_KEY, accountId, encrypted]]);
  } else {
    await redisPipeline([["HDEL", CIPHERTEXT_HASH_KEY, accountId]]);
  }
}

async function readPokerPlusCiphertext(accountId) {
  if (!accountId) return "";
  const pipe = await redisPipeline([["HGET", CIPHERTEXT_HASH_KEY, accountId]]);
  const raw = pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result).trim() : "";
  return normalizePokerPlusCiphertext(decryptStoredCiphertext(raw));
}

async function readPokerPlusProfile(accountId) {
  if (!accountId) return null;
  const pipe = await redisPipeline([
    ["HGET", PROFILE_HASH_KEY, accountId],
    ["HGET", PROFILE_SYNC_AT_HASH_KEY, accountId],
  ]);
  const raw = pipe && pipe[0] && pipe[0].result != null ? String(pipe[0].result) : "";
  if (!raw) return null;
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const syncedAtRaw = pipe && pipe[1] && pipe[1].result != null ? String(pipe[1].result).trim() : "";
  if (syncedAtRaw) parsed.syncedAt = Number(syncedAtRaw) || null;
  await attachPokerPlusStatsSnapshots(accountId, parsed);
  return parsed;
}

async function clearPokerPlusBinding(accountId) {
  if (!accountId) return;
  const existingRows = await redisPipeline([["HGET", BIND_HASH_KEY, accountId]]);
  const existingPokerPlusUserId = existingRows && existingRows[0] && existingRows[0].result
    ? String(existingRows[0].result).trim()
    : "";
  const hadBinding = !!existingPokerPlusUserId;
  await redisPipeline([
    ["HDEL", BIND_HASH_KEY, accountId],
    ...(existingPokerPlusUserId ? [["HDEL", BIND_REVERSE_HASH_KEY, existingPokerPlusUserId.toLowerCase()]] : []),
    ...(hadBinding ? [["HSET", UNBIND_AT_HASH_KEY, accountId, String(Date.now())]] : []),
    ["HDEL", PROFILE_HASH_KEY, accountId],
    ["HDEL", PROFILE_SYNC_AT_HASH_KEY, accountId],
    ["HDEL", EMAIL_HASH_KEY, accountId],
    ["HDEL", CIPHERTEXT_HASH_KEY, accountId],
    ["HDEL", TELEGRAM_HASH_KEY, accountId],
    ["HDEL", KEY_FIELD_HASH_KEY, accountId],
    ["DEL", pokerPlusSnapshotHashKey(accountId)],
  ]);
}

async function requestPokerPlusSavedKeyFastPath(accountId, ciphertext) {
  const savedUserAppId = await readPokerPlusTelegramValue(accountId);
  const savedEmail = await readPokerPlusEmail(accountId);
  const savedKeyField = await readPokerPlusKeyField(accountId);
  const hasSavedMeta = !!(savedUserAppId || savedEmail || savedKeyField !== KEY_BIND_FIELD_NAMES[0]);
  if (!hasSavedMeta) return null;
  const normalizedCiphertext = normalizePokerPlusCiphertext(ciphertext);
  if (!normalizedCiphertext) return null;
  const data = await requestWithToken(
    "getBindMiniAppPlayer",
    pokerPlusKeyBindPayload(savedUserAppId, normalizedCiphertext, savedEmail, savedKeyField)
  );
  return {
    data,
    matchedEmail: savedEmail,
    matchedKeyField: savedKeyField,
    matchedUserAppId: savedUserAppId,
    normalizedCiphertext,
  };
}

async function bindMiniAppPlayer(accountId, userAppId, ciphertext, email, options) {
  const bindUserAppIdCandidates = (Array.isArray(userAppId) ? userAppId : [userAppId]).concat([accountId]);
  const useFastBind = !!(options && options.fast && !hasPokerPlusEmailCandidate(email));
  let bindResult = null;
  if (useFastBind) {
    try {
      bindResult = await requestPokerPlusKeyBindFastVariants(bindUserAppIdCandidates, ciphertext);
    } catch (fastErr) {
      if (!isPokerPlusBindRetryableError(fastErr)) throw fastErr;
      try {
        bindResult = await requestPokerPlusKeyBindVariants(bindUserAppIdCandidates, ciphertext, email);
      } catch (fallbackErr) {
        const attempts = []
          .concat(Array.isArray(fastErr && fastErr.pokerPlusBindAttempts) ? fastErr.pokerPlusBindAttempts : [])
          .concat(Array.isArray(fallbackErr && fallbackErr.pokerPlusBindAttempts) ? fallbackErr.pokerPlusBindAttempts : []);
        throw attachPokerPlusBindAttempts(fallbackErr, attempts);
      }
    }
  } else {
    bindResult = await requestPokerPlusKeyBindVariants(bindUserAppIdCandidates, ciphertext, email);
  }
  const data = bindResult.data;
  const matchedUserAppId = bindResult.matchedUserAppId;
  const matchedEmail = bindResult.matchedEmail;
  const normalizedCiphertext = bindResult.normalizedCiphertext;
  const pokerPlusUserId =
    data && data.Id != null ? String(data.Id).trim() : data && data.userId != null ? String(data.userId).trim() : "";
  if (!pokerPlusUserId) {
    const err = new Error("PokerPlus bind returned empty userId");
    err.statusCode = 502;
    throw err;
  }
  const resolvedEmail = matchedEmail || pokerPlusResponseEmail(data);
  await saveBoundPokerPlusUserId(accountId, pokerPlusUserId);
  await savePokerPlusEmail(accountId, resolvedEmail);
  await savePokerPlusCiphertext(accountId, normalizedCiphertext);
  await savePokerPlusTelegramValue(accountId, matchedUserAppId);
  await savePokerPlusKeyField(accountId, bindResult.matchedKeyField);
  let normalized = normalizePlayerProfile(
    Object.assign({}, data, { email: resolvedEmail }),
    pokerPlusUserId
  );
  if (options && options.fast) normalized = await pokerPlusReplacePlaceholderStats(accountId, normalized);
  await savePokerPlusProfile(accountId, normalized);
  return normalized;
}

async function fetchPlayerInfo(accountId, fallbackUserAppId, fallbackEmail) {
  const savedTelegramValue = await readPokerPlusTelegramValue(accountId);
  const savedEmail = await readPokerPlusEmail(accountId);
  return refreshMiniAppPlayer(accountId, [savedTelegramValue].concat(Array.isArray(fallbackUserAppId) ? fallbackUserAppId : [fallbackUserAppId]), [savedEmail, fallbackEmail]);
}

async function refreshMiniAppPlayerBySavedKey(accountId, userAppId, email) {
  const savedCiphertext = await readPokerPlusCiphertext(accountId);
  if (!savedCiphertext) {
    const err = new Error("Для обновления Poker21 нужен сохранённый ключ. Отвяжите Poker21 и привяжите ключ заново.");
    err.statusCode = 400;
    throw err;
  }
  let bindResult = null;
  try {
    bindResult = await requestPokerPlusSavedKeyFastPath(accountId, savedCiphertext);
  } catch (fastErr) {
    if (!isPokerPlusBindRetryableError(fastErr)) throw fastErr;
  }
  if (!bindResult) {
    const err = new Error("Для быстрого обновления Poker21 нужен ключ. Вставьте ключ один раз и нажмите «Обновить по ключу», дальше он сохранится.");
    err.statusCode = 400;
    throw err;
  }
  const data = bindResult.data;
  const matchedUserAppId = bindResult.matchedUserAppId;
  const matchedEmail = bindResult.matchedEmail;
  const pokerPlusUserId =
    data && data.Id != null ? String(data.Id).trim() : data && data.userId != null ? String(data.userId).trim() : "";
  if (!pokerPlusUserId) {
    const err = new Error("PokerPlus key refresh returned empty userId");
    err.statusCode = 502;
    throw err;
  }
  const resolvedEmail = matchedEmail || pokerPlusResponseEmail(data);
  await savePokerPlusTelegramValue(accountId, matchedUserAppId);
  await savePokerPlusKeyField(accountId, bindResult.matchedKeyField);
  await saveBoundPokerPlusUserId(accountId, pokerPlusUserId, { recordBoundAt: false });
  await savePokerPlusEmail(accountId, resolvedEmail);
  let normalized = normalizePlayerProfile(Object.assign({}, data, { email: resolvedEmail || "" }), pokerPlusUserId);
  normalized = await pokerPlusReplacePlaceholderStats(accountId, normalized);
  await savePokerPlusProfile(accountId, normalized);
  return normalized;
}

async function refreshMiniAppPlayer(accountId, userAppId, email) {
  const emailVariants = buildRefreshEmailVariants(email);
  const savedEmail = emailVariants[0] || "";
  const userAppIdVariants = buildPokerPlusUserAppIdVariants(userAppId);
  let savedCiphertext = "";
  const linkedUserId = await readBoundPokerPlusUserId(accountId);
  if (!savedEmail) {
    savedCiphertext = await readPokerPlusCiphertext(accountId);
    if (!savedCiphertext && !linkedUserId) {
      const err = new Error("Для обновления PokerPlus сначала привяжите email или используйте ключ PokerPlus.");
      err.statusCode = 400;
      throw err;
    }
  }
  if (!userAppIdVariants.length) {
    if (!savedCiphertext) savedCiphertext = await readPokerPlusCiphertext(accountId);
  }
  if (!userAppIdVariants.length && !savedCiphertext) {
    const cached = await readPokerPlusProfile(accountId);
    if (cached) return cached;
    const err = new Error("PokerPlus refresh requires a saved Telegram ID");
    err.statusCode = 400;
    throw err;
  }
  const refreshEmails = savedEmail ? emailVariants : [""];
  let data = null;
  let matchedEmail = savedEmail;
  let matchedUserAppId = userAppIdVariants[0] || "";
  let lastErr = null;
  if (savedEmail) {
    for (let u = 0; u < userAppIdVariants.length && !data; u += 1) {
      const candidateUserAppId = userAppIdVariants[u];
      for (let i = 0; i < refreshEmails.length; i += 1) {
        const candidateEmail = refreshEmails[i];
        try {
          data = await requestWithToken("getBindMiniAppPlayer", {
            user_app_id: candidateUserAppId,
            mail: candidateEmail,
          });
          matchedEmail = candidateEmail;
          matchedUserAppId = candidateUserAppId;
          break;
        } catch (err) {
          lastErr = err;
          if (isPokerPlusBindingFailedError(err)) continue;
          if (!isPokerPlusPlayerNotFoundError(err)) throw err;
        }
      }
    }
  }
  if (!data) {
    if (!savedCiphertext) savedCiphertext = await readPokerPlusCiphertext(accountId);
    if (savedCiphertext) {
      try {
        const bindResult = await requestPokerPlusKeyBindVariants(userAppIdVariants, savedCiphertext, refreshEmails);
        data = bindResult.data;
        matchedEmail = bindResult.matchedEmail;
        matchedUserAppId = bindResult.matchedUserAppId;
        await savePokerPlusKeyField(accountId, bindResult.matchedKeyField);
      } catch (err) {
        lastErr = err;
        if (!isPokerPlusBindRetryableError(err)) throw err;
      }
    }
  }
  if (!data) throw lastErr;
  const pokerPlusUserId =
    data && data.Id != null ? String(data.Id).trim() : data && data.userId != null ? String(data.userId).trim() : linkedUserId || "";
  if (!pokerPlusUserId) {
    const err = new Error("PokerPlus refresh returned empty userId");
    err.statusCode = 502;
    throw err;
  }
  const resolvedEmail = matchedEmail || pokerPlusResponseEmail(data);
  await savePokerPlusTelegramValue(accountId, matchedUserAppId);
  await saveBoundPokerPlusUserId(accountId, pokerPlusUserId, { recordBoundAt: false });
  await savePokerPlusEmail(accountId, resolvedEmail);
  const normalized = normalizePlayerProfile(Object.assign({}, data, { email: resolvedEmail || "" }), pokerPlusUserId);
  await savePokerPlusProfile(accountId, normalized);
  return normalized;
}

async function unbindMiniAppPlayer(accountId) {
  const linkedUserId = await readBoundPokerPlusUserId(accountId);
  const savedTelegramValue = await readPokerPlusTelegramValue(accountId);
  if (!linkedUserId) {
    await clearPokerPlusBinding(accountId);
    return "";
  }
  const normalizedUserAppId = normalizePokerPlusUserAppId(savedTelegramValue);
  if (!normalizedUserAppId) {
    await clearPokerPlusBinding(accountId);
    return linkedUserId;
  }
  let data = null;
  try {
    data = await requestWithToken("unBindMiniAppId", {
      user_app_id: normalizedUserAppId,
    });
  } catch (err) {
    if (!isPokerPlusNoBindingInfoError(err)) throw err;
  }
  const userId = data && data.userId != null ? String(data.userId).trim() : linkedUserId;
  await clearPokerPlusBinding(accountId);
  return userId;
}

function pokerPlusNumberOrNull(value) {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pokerPlusPositiveInt(value, fallback, max) {
  const n = Math.trunc(Number(value));
  const safeFallback = Math.trunc(Number(fallback)) || 1;
  if (!Number.isFinite(n) || n < 1) return safeFallback;
  return Math.min(n, Math.trunc(Number(max)) || n);
}

function pokerPlusNonNegativeInt(value, fallback) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n < 0) return Math.trunc(Number(fallback)) || 0;
  return n;
}

function pokerPlusString(value) {
  return value != null ? String(value).trim() : "";
}

function normalizeGroupOrLeagueCounter(data) {
  const src = data && typeof data === "object" && !Array.isArray(data) ? data : {};
  const pickNumber = (...keys) => {
    for (let i = 0; i < keys.length; i += 1) {
      const n = pokerPlusNumberOrNull(src[keys[i]]);
      if (n != null) return n;
    }
    return null;
  };
  return {
    serviceCharge: pickNumber("service_charge", "serviceCharge"),
    round: pickNumber("round"),
    score: pickNumber("score"),
    mttFee: pickNumber("mtt_fee", "mttFee"),
    sngFee: pickNumber("sng_fee", "sngFee"),
    mttScore: pickNumber("mtt_score", "mttScore"),
    sngScore: pickNumber("sng_score", "sngScore"),
  };
}

async function getGroupOrLeagueData() {
  const data = await requestWithToken("getGroupOrLeagueData", {});
  return {
    today: normalizeGroupOrLeagueCounter(data && data.today),
    week: normalizeGroupOrLeagueCounter(data && data.week),
  };
}

function pokerPlusFirstString(row, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = row && row[keys[i]];
    const normalized = pokerPlusString(value);
    if (normalized) return normalized;
  }
  return "";
}

function pokerPlusFirstNumberOrNull(row, keys) {
  for (let i = 0; i < keys.length; i += 1) {
    const value = row && row[keys[i]];
    const normalized = pokerPlusNumberOrNull(value);
    if (normalized != null) return normalized;
  }
  return null;
}

function normalizePlayerChipsChangeRow(item) {
  const row = item && typeof item === "object" ? item : {};
  return {
    userId: pokerPlusFirstString(row, ["userId", "user_id", "userID"]),
    operUserId: pokerPlusFirstString(row, ["operUserId", "oper_user_id", "operUserid", "operUserID", "operatorUserId", "operator_user_id", "operatorId", "operator_id"]),
    operType: pokerPlusFirstString(row, ["operType", "oper_type", "operationType", "operation_type"]),
    operGold: pokerPlusFirstNumberOrNull(row, ["operGold", "oper_gold", "operationGold", "operation_gold", "gold"]),
    groupId: pokerPlusFirstString(row, ["groupId", "group_id"]),
    leagueId: pokerPlusFirstString(row, ["leagueId", "league_id"]),
    operTime: pokerPlusFirstNumberOrNull(row, ["operTime", "oper_time", "operationTime", "operation_time", "time"]),
  };
}

async function getPlayerChipsChangeLog(options) {
  const opts = options && typeof options === "object" ? options : {};
  const userAppId = normalizePokerPlusUserAppId(opts.user_app_id || opts.userAppId);
  const mail = String(opts.mail || "").trim().slice(0, 190);
  const page = pokerPlusPositiveInt(opts.page, 1, 1000000);
  const pageSize = pokerPlusPositiveInt(opts.pageSize || opts.page_size, 20, 200);
  if (!userAppId) {
    const err = new Error("PokerPlus chip log requires user_app_id");
    err.statusCode = 400;
    throw err;
  }
  if (!mail) {
    const err = new Error("PokerPlus chip log requires mail");
    err.statusCode = 400;
    throw err;
  }
  const data = await requestWithToken("getPlayerChipsChangeLog", {
    user_app_id: userAppId,
    mail,
    page,
    pageSize,
  });
  const list = Array.isArray(data && data.list) ? data.list : [];
  return {
    list: list.map(normalizePlayerChipsChangeRow),
    page: pokerPlusPositiveInt(data && data.page, page, 1000000),
    pageSize: pokerPlusPositiveInt(data && data.pageSize, pageSize, 200),
    totalPage: pokerPlusNonNegativeInt(data && data.totalPage, 0),
    totalCount: pokerPlusNonNegativeInt(data && data.totalCount, 0),
  };
}

async function getPlayingTables() {
  const data = await requestWithToken("getPlayingTables", {});
  const list = Array.isArray(data && data.list) ? data.list : [];
  return list.map(function (item) {
    return {
      playerCount: item && item.playerCount != null ? Number(item.playerCount) : 0,
      deskId: item && item.deskId != null ? String(item.deskId).trim() : "",
      deskName: item && item.deskName != null ? String(item.deskName).trim() : "",
      unionId: item && item.unionId != null ? String(item.unionId).trim() : "",
      leagueId: item && item.leagueId != null ? String(item.leagueId).trim() : "",
      groupId: item && item.groupId != null ? String(item.groupId).trim() : "",
      playType: item && item.playType != null ? String(item.playType).trim() : "",
      blindAnnotation: item && item.blindAnnotation != null ? String(item.blindAnnotation).trim() : "",
      entryFees: item && item.entryFees != null ? Number(item.entryFees) : null,
    };
  });
}

async function getUpcomingCompetitions() {
  const data = await requestWithToken("getTheUpcomingCompetitions", {});
  const list = Array.isArray(data && data.list) ? data.list : [];
  return list.map(function (item) {
    return {
      competitionId: item && item.competitionId != null ? String(item.competitionId).trim() : "",
      competitionName: item && item.competitionName != null ? String(item.competitionName).trim() : "",
      unionId: item && item.unionId != null ? String(item.unionId).trim() : "",
      leagueId: item && item.leagueId != null ? String(item.leagueId).trim() : "",
      groupId: item && item.groupId != null ? String(item.groupId).trim() : "",
      playType: item && item.playType != null ? String(item.playType).trim() : "",
      startTime: item && item.startTime != null ? Number(item.startTime) : null,
      endTime: item && item.endTime != null ? Number(item.endTime) : null,
    };
  });
}

async function getMaintenanceStatus() {
  const data = await requestWithToken("getGameMaintainStatus", {});
  return {
    maintainStatus: data && data.maintainStatus != null ? Number(data.maintainStatus) : -1,
    startTime: data && data.startTime != null ? String(data.startTime).trim() : "",
    endTime: data && data.endTime != null ? String(data.endTime).trim() : "",
    content: data && data.content != null ? String(data.content).trim() : "",
    title: data && data.title != null ? String(data.title).trim() : "",
  };
}

module.exports = {
  BIND_AT_HASH_KEY,
  UNBIND_AT_HASH_KEY,
  BIND_HASH_KEY,
  BIND_REVERSE_HASH_KEY,
  NICKNAME_REVERSE_HASH_KEY,
  CIPHERTEXT_HASH_KEY,
  EMAIL_HASH_KEY,
  KEY_FIELD_HASH_KEY,
  PROFILE_HASH_KEY,
  normalizePokerPlusNicknameKey,
  PROFILE_SNAPSHOT_HASH_PREFIX,
  PROFILE_SYNC_AT_HASH_KEY,
  TELEGRAM_HASH_KEY,
  TELEGRAM_REVERSE_HASH_KEY,
  bindMiniAppPlayer,
  clearPokerPlusBinding,
  fetchPlayerInfo,
  getGroupOrLeagueData,
  getMaintenanceStatus,
  getPlayerChipsChangeLog,
  getPlayingTables,
  getUpcomingCompetitions,
  hasPokerPlusConfig,
  pokerPlusSafeKeyMeta,
  readBoundPokerPlusUserId,
  readPokerPlusCiphertext,
  readPokerPlusEmail,
  readPokerPlusLinkedSourcesByUserAppIds,
  readPokerPlusProfile,
  readPokerPlusStatsSnapshots,
  readPokerPlusTelegramValue,
  refreshMiniAppPlayerBySavedKey,
  refreshMiniAppPlayer,
  savePokerPlusProfile,
  savePokerPlusStatsSnapshot,
  savePokerPlusCiphertext,
  savePokerPlusEmail,
  savePokerPlusTelegramValue,
  unbindMiniAppPlayer,
};
