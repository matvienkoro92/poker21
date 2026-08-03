"use strict";

const POKER_PROFILE_MAX_LEVEL = 100;
const POKER_PROFILE_BIND_POINTS = 500;
const POKER_PROFILE_LEVEL_BANDS = Object.freeze([
  { until: 10, step: 3000 },
  { until: 25, step: 7000 },
  { until: 40, step: 15000 },
  { until: 60, step: 30000 },
  { until: 80, step: 60000 },
  { until: 100, step: 100000 },
]);

function pokerProfileNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pokerProfilePickCounterNumber(total, ...keys) {
  const src = total && typeof total === "object" ? total : {};
  for (let i = 0; i < keys.length; i += 1) {
    const value = src[keys[i]];
    if (value != null && value !== "" && Number.isFinite(Number(value))) return pokerProfileNumber(value);
  }
  return 0;
}

function pokerProfileTotalCounterFromCachedProfile(profile) {
  return profile && profile.totalCounter && typeof profile.totalCounter === "object"
    ? profile.totalCounter
    : profile && profile.total_counter && typeof profile.total_counter === "object"
      ? profile.total_counter
      : {};
}

function pokerProfileLevelFromPointsServer(pointsValue) {
  const points = pokerProfileNumber(pointsValue);
  let level = 1;
  let levelStart = 0;
  for (let bandIndex = 0; bandIndex < POKER_PROFILE_LEVEL_BANDS.length; bandIndex += 1) {
    const band = POKER_PROFILE_LEVEL_BANDS[bandIndex];
    while (level < band.until) {
      const nextStart = levelStart + band.step;
      if (points < nextStart) {
        const valuePercent = Math.floor(Math.min(99, Math.max(0, ((points - levelStart) / Math.max(1, band.step)) * 100)));
        return {
          level,
          nextLevel: Math.min(POKER_PROFILE_MAX_LEVEL, level + 1),
          levelStart,
          nextStart,
          levelSize: band.step,
          valuePercent,
          statusValue: valuePercent,
        };
      }
      levelStart = nextStart;
      level += 1;
    }
  }
  return {
    level: POKER_PROFILE_MAX_LEVEL,
    nextLevel: POKER_PROFILE_MAX_LEVEL,
    levelStart,
    nextStart: levelStart,
    levelSize: 0,
    valuePercent: 100,
    statusValue: 100,
  };
}

function pokerProfileStatusFromPointsServer(pointsValue) {
  const points = pokerProfileNumber(pointsValue);
  return Object.assign({ points }, pokerProfileLevelFromPointsServer(points));
}

function pokerProfileLevelPointsFromCachedProfile(profile, options) {
  const opts = options && typeof options === "object" ? options : {};
  const total = pokerProfileTotalCounterFromCachedProfile(profile);
  const fee = pokerProfilePickCounterNumber(total, "fee");
  const mttCountRaw = pokerProfilePickCounterNumber(total, "mttCount", "mtt_count");
  const mttItm = pokerProfilePickCounterNumber(total, "mttItmCount", "mtt_itm_count");
  const mttFirst = pokerProfilePickCounterNumber(total, "mttFirstCount", "mtt_1st_count", "mtt_first_count", "mttFirstPlaceCount", "mtt_first_place_count");
  const sngCountRaw = pokerProfilePickCounterNumber(total, "sngCount", "sng_count");
  const sngItm = pokerProfilePickCounterNumber(total, "sngItmCount", "sng_itm_count");
  const sngFirst = pokerProfilePickCounterNumber(total, "sngFirstCount", "sng_1st_count", "sng_first_count", "sngFirstPlaceCount", "sng_first_place_count");
  const mttCount = Math.max(mttCountRaw, mttItm, mttFirst);
  const sngCount = Math.max(sngCountRaw, sngItm, sngFirst);
  const mttNonWinItm = Math.max(0, mttItm - mttFirst);
  const sngNonWinItm = Math.max(0, sngItm - sngFirst);
  const poker21Bind = opts.pokerPlusLinked === false ? 0 : POKER_PROFILE_BIND_POINTS;
  return {
    fee,
    mttCount,
    mttItm,
    mttFirst,
    sngCount,
    sngItm,
    sngFirst,
    breakdown: {
      cash: fee,
      mttParticipation: mttCount * 300,
      mttItm: mttNonWinItm * 700,
      mttWins: mttFirst * 3000,
      sngParticipation: sngCount * 60,
      sngItm: sngNonWinItm * 140,
      sngWins: sngFirst * 400,
      poker21Bind,
    },
  };
}

function pokerProfileStatusFromCachedProfile(profile, options) {
  const meta = pokerProfileLevelPointsFromCachedProfile(profile, options);
  const points = Object.keys(meta.breakdown).reduce((sum, key) => sum + pokerProfileNumber(meta.breakdown[key]), 0);
  return Object.assign({ points, counters: meta }, pokerProfileLevelFromPointsServer(points));
}

function pokerProfileStatusFromRakeServer(value) {
  return pokerProfileStatusFromPointsServer(value);
}

function pokerProfileFeeFromCachedProfile(profile) {
  const total = pokerProfileTotalCounterFromCachedProfile(profile);
  const fee = total.fee != null ? Number(total.fee) : null;
  return Number.isFinite(fee) ? fee : null;
}

module.exports = {
  POKER_PROFILE_BIND_POINTS,
  POKER_PROFILE_LEVEL_BANDS,
  POKER_PROFILE_MAX_LEVEL,
  pokerProfileFeeFromCachedProfile,
  pokerProfileLevelFromPointsServer,
  pokerProfileLevelPointsFromCachedProfile,
  pokerProfileStatusFromCachedProfile,
  pokerProfileStatusFromPointsServer,
  pokerProfileStatusFromRakeServer,
  pokerProfileTotalCounterFromCachedProfile,
};
