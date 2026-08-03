"use strict";

const DEFAULT_MAX_READ_COMMANDS = 500;
const DEFAULT_MAX_MULTI_READ_FIELDS = 500;
const DEFAULT_MAX_RANGE_ITEMS = 2000;
const WARN_THROTTLE_MS = 60 * 1000;

const READ_COMMANDS = new Set([
  "EXISTS",
  "GET",
  "HGET",
  "HGETALL",
  "HLEN",
  "HMGET",
  "KEYS",
  "LLEN",
  "LPOS",
  "LRANGE",
  "MGET",
  "SCARD",
  "SCAN",
  "SISMEMBER",
  "SMEMBERS",
  "ZCOUNT",
  "ZRANGE",
  "ZREVRANGE",
  "ZSCORE",
]);

const warnThrottle = new Map();

function safeInt(value) {
  const n = parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
}

function commandName(command) {
  return Array.isArray(command) && command.length ? String(command[0] || "").trim().toUpperCase() : "";
}

function lrangeInfo(command, maxRangeItems) {
  const start = safeInt(command && command[2]);
  const stop = safeInt(command && command[3]);
  if (start == null || stop == null) return { large: true, reason: "LRANGE с нечисловым диапазоном" };
  if (start === 0 && stop === -1) return { large: true, critical: true, reason: "LRANGE 0 -1 читает весь список" };
  if (start < 0 && stop === -1) {
    const size = Math.abs(start);
    return {
      large: size > maxRangeItems,
      reason: "LRANGE tail читает " + size + " элементов",
      estimatedItems: size,
    };
  }
  if (start >= 0 && stop >= start) {
    const size = stop - start + 1;
    return {
      large: size > maxRangeItems,
      reason: "LRANGE читает " + size + " элементов",
      estimatedItems: size,
    };
  }
  return { large: true, reason: "LRANGE с широким диапазоном" };
}

function normalizeMode(options) {
  const raw = String(
    options && options.bandwidthGuardMode ||
    options && options.redisBandwidthGuardMode ||
    process.env.REDIS_BANDWIDTH_GUARD_MODE ||
    "block"
  ).trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off" || raw === "disabled") return "off";
  if (raw === "warn" || raw === "warning" || raw === "log") return "warn";
  return "block";
}

function analyzeRedisBandwidth(commands, options) {
  const opts = options || {};
  const list = Array.isArray(commands) ? commands : [];
  const maxReadCommands = Math.max(1, parseInt(String(opts.maxRedisReadCommands || DEFAULT_MAX_READ_COMMANDS), 10) || DEFAULT_MAX_READ_COMMANDS);
  const maxMultiReadFields = Math.max(1, parseInt(String(opts.maxRedisMultiReadFields || DEFAULT_MAX_MULTI_READ_FIELDS), 10) || DEFAULT_MAX_MULTI_READ_FIELDS);
  const maxRangeItems = Math.max(1, parseInt(String(opts.maxRedisRangeItems || DEFAULT_MAX_RANGE_ITEMS), 10) || DEFAULT_MAX_RANGE_ITEMS);
  const context = String(opts.context || "redis.pipeline");
  const issues = [];
  const warnings = [];
  let readCommandCount = 0;

  list.forEach((command, index) => {
    const name = commandName(command);
    if (!name) return;
    if (READ_COMMANDS.has(name)) readCommandCount += 1;
    if (name === "KEYS") {
      issues.push({ index, command: name, reason: "KEYS может прочитать всё keyspace" });
      return;
    }
    if (name === "LRANGE") {
      const info = lrangeInfo(command, maxRangeItems);
      if (info && info.large) {
        const target = info.critical ? issues : warnings;
        target.push({ index, command: name, reason: info.reason, estimatedItems: info.estimatedItems || null });
      }
      return;
    }
    if (name === "MGET" || name === "HMGET") {
      const fieldCount = Math.max(0, command.length - (name === "HMGET" ? 2 : 1));
      if (fieldCount > maxMultiReadFields) {
        issues.push({ index, command: name, reason: name + " читает " + fieldCount + " полей за раз" });
      }
      return;
    }
    if (name === "HGETALL" || name === "SMEMBERS") {
      warnings.push({ index, command: name, reason: name + " читает всю коллекцию" });
      return;
    }
    if (name === "SCAN") {
      warnings.push({ index, command: name, reason: "SCAN допустим только с bounded loop и таймаутом" });
    }
  });

  if (readCommandCount > maxReadCommands) {
    issues.push({
      index: -1,
      command: "PIPELINE",
      reason: "pipeline содержит " + readCommandCount + " read-команд",
    });
  }

  return {
    context,
    commandCount: list.length,
    readCommandCount,
    issues,
    warnings,
  };
}

function shouldLog(context, kind) {
  const key = String(kind || "warn") + ":" + String(context || "redis.pipeline");
  const now = Date.now();
  const prev = warnThrottle.get(key) || 0;
  if (now - prev < WARN_THROTTLE_MS) return false;
  warnThrottle.set(key, now);
  return true;
}

function redisBandwidthMessage(report, rows) {
  const parts = (rows || []).slice(0, 4).map((row) => {
    const idx = row.index >= 0 ? "#" + row.index + " " : "";
    return idx + row.command + ": " + row.reason;
  });
  return "[redis-bandwidth-guard] " + report.context + " blocked: " + parts.join("; ");
}

function enforceRedisBandwidthGuard(commands, options) {
  const opts = options || {};
  if (opts.bandwidthGuard === "off" || opts.skipRedisBandwidthGuard === true) return analyzeRedisBandwidth(commands, opts);
  const mode = normalizeMode(opts);
  const report = analyzeRedisBandwidth(commands, opts);
  if (mode === "off") return report;

  const allowLarge = opts.allowLargeRedisRead === true || opts.allowBandwidthHeavyRedisRead === true;
  const allowDangerous = opts.allowDangerousRedisRead === true;
  const blockingIssues = report.issues.filter((issue) => issue.command === "KEYS" ? !allowDangerous : !allowLarge);

  if (blockingIssues.length) {
    const message = redisBandwidthMessage(report, blockingIssues);
    if (mode === "warn" || opts.bandwidthGuard === "warn") {
      if (shouldLog(report.context, "blocked-warn")) console.warn(message);
      return report;
    }
    const error = new Error(message);
    error.code = "REDIS_BANDWIDTH_GUARD";
    error.context = report.context;
    error.issues = blockingIssues;
    throw error;
  }

  const shouldWarn = report.warnings.length && !allowLarge;
  if (shouldWarn && shouldLog(report.context, "warn")) {
    console.warn("[redis-bandwidth-guard] " + report.context + " wide Redis read: " + report.warnings.slice(0, 4).map((row) => row.command + ": " + row.reason).join("; "));
  }
  return report;
}

module.exports = {
  analyzeRedisBandwidth,
  enforceRedisBandwidthGuard,
};
