"use strict";

const { enforceRedisBandwidthGuard } = require("./redis-bandwidth-guard");

const DEFAULT_TIMEOUT_MS = 6000;
const REDIS_COMMAND_VOLUME_LOG_THRESHOLD = 50;

function getConfig() {
  const url = String(process.env.UPSTASH_REDIS_REST_URL || "").trim();
  const token = String(process.env.UPSTASH_REDIS_REST_TOKEN || "").trim();
  return { url, token };
}

function isConfigured() {
  const cfg = getConfig();
  return !!(cfg.url && cfg.token);
}

function pipelineUrl(url) {
  const base = String(url || "").replace(/\/$/, "");
  return base.indexOf("/pipeline") !== -1 ? base : base + "/pipeline";
}

function normalizeRedisError(error, context) {
  const message = error && error.message ? String(error.message) : String(error || "Redis request failed");
  return {
    ok: false,
    error: "redis_error",
    context: context || "redis",
    message,
  };
}

async function timeout(promise, ms, context) {
  const timeoutMs = Math.max(1, Number(ms) || DEFAULT_TIMEOUT_MS);
  let timer = null;
  const guard = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error((context || "redis") + " timeout");
      err.code = "REDIS_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, guard]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function pipeline(commands, options) {
  const cfg = getConfig();
  if (!cfg.url || !cfg.token) return null;
  const opts = options || {};
  const context = opts.context || "redis.pipeline";
  const timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT_MS;
  const commandList = Array.isArray(commands) ? commands : [];
  if (commandList.length >= REDIS_COMMAND_VOLUME_LOG_THRESHOLD) {
    const commandCounts = commandList.reduce((counts, command) => {
      const name = String(command && command[0] || "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
      counts[name] = (counts[name] || 0) + 1;
      return counts;
    }, {});
    console.warn("[redis-command-volume]", {
      context,
      commands: commandList.length,
      operations: commandCounts,
    });
  }
  enforceRedisBandwidthGuard(commands || [], opts);
  const url = pipelineUrl(cfg.url);
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let abortTimer = null;
  try {
    if (controller) {
      abortTimer = setTimeout(() => controller.abort(), timeoutMs);
    }
    const res = await timeout(fetch(url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands || []),
      signal: controller ? controller.signal : undefined,
    }), timeoutMs, context);
    if (!res || !res.ok) return null;
    return await res.json();
  } catch (error) {
    const normalized = normalizeRedisError(error, context);
    if (opts.throwOnError) throw normalized;
    return null;
  } finally {
    if (abortTimer) clearTimeout(abortTimer);
  }
}

function hashPairsToObject(raw) {
  if (!raw) return {};
  if (Array.isArray(raw)) {
    const out = {};
    for (let i = 0; i < raw.length - 1; i += 2) {
      if (raw[i] != null) out[String(raw[i])] = raw[i + 1];
    }
    return out;
  }
  if (typeof raw === "object") return { ...raw };
  return {};
}

async function hgetall(key, options) {
  if (!key) return {};
  const res = await pipeline([["HGETALL", String(key)]], options);
  return hashPairsToObject(res && res[0] ? res[0].result : null);
}

async function scanCollection(command, key, options) {
  if (!key) return [];
  const opts = options || {};
  const pageSize = Math.max(25, Math.min(1000, Number(opts.count) || 250));
  const maxPages = Math.max(1, Math.min(1000, Number(opts.maxPages) || 200));
  let cursor = "0";
  const out = [];
  for (let page = 0; page < maxPages; page += 1) {
    const res = await pipeline([[command, String(key), cursor, "COUNT", String(pageSize)]], opts);
    const raw = res && res[0] ? res[0].result : null;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    cursor = String(raw[0] == null ? "0" : raw[0]);
    const values = Array.isArray(raw[1]) ? raw[1] : [];
    out.push(...values);
    if (cursor === "0") return out;
  }
  return null;
}

async function hscanall(key, options) {
  const pairs = await scanCollection("HSCAN", key, options);
  return pairs == null ? null : hashPairsToObject(pairs);
}

async function sscanall(key, options) {
  return scanCollection("SSCAN", key, options);
}

async function getJson(key, fallback, options) {
  if (!key) return fallback;
  const res = await pipeline([["GET", String(key)]], options);
  const raw = res && res[0] ? res[0].result : null;
  if (raw == null || raw === "") return fallback;
  try {
    return JSON.parse(String(raw));
  } catch (error) {
    return fallback;
  }
}

async function setJson(key, value, options) {
  if (!key) return false;
  const opts = options || {};
  const command = ["SET", String(key), JSON.stringify(value)];
  if (opts.ttlSec) command.push("EX", String(Math.max(1, Number(opts.ttlSec) || 1)));
  const res = await pipeline([command], opts);
  return !!res;
}

module.exports = {
  DEFAULT_TIMEOUT_MS,
  getConfig,
  isConfigured,
  pipelineUrl,
  normalizeRedisError,
  timeout,
  pipeline,
  hgetall,
  hscanall,
  sscanall,
  getJson,
  setJson,
  hashPairsToObject,
};
