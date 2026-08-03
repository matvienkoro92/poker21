"use strict";

const { resolveTelegramIdentity, memberIdFromIdentity } = require("./resolve-telegram-auth");

const DEFAULT_ADMIN_IDS = ["388008256", "2144406710", "1897001087"];
const DEFAULT_ADMIN_USERNAMES = ["roman1_matvienko"];
const DEFAULT_ADMIN_EMAILS = ["matvienkoro92@gmail.com"];

const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean)
  .concat(DEFAULT_ADMIN_IDS)
  .filter((id, index, arr) => arr.indexOf(id) === index);

const ADMIN_USERNAMES = (process.env.TELEGRAM_ADMIN_USERNAME || "")
  .toString()
  .split(",")
  .map((s) => s.replace(/^@+/, "").trim().toLowerCase())
  .filter(Boolean)
  .concat(DEFAULT_ADMIN_USERNAMES)
  .filter((id, index, arr) => arr.indexOf(id) === index);

const ADMIN_EMAILS = (process.env.ADMIN_EMAIL || process.env.TELEGRAM_ADMIN_EMAIL || "")
  .toString()
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)
  .concat(DEFAULT_ADMIN_EMAILS)
  .filter((id, index, arr) => arr.indexOf(id) === index);

function normalizeTelegramId(userId) {
  return String(userId || "").replace(/^tg_/, "").trim();
}

function isAdmin(userId) {
  const id = normalizeTelegramId(userId);
  return Boolean(id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id));
}

function isAdminUsername(username) {
  const u = String(username || "").replace(/^@+/, "").trim().toLowerCase();
  return Boolean(u && ADMIN_USERNAMES.includes(u));
}

function isAdminEmail(email) {
  const e = String(email || "").trim().toLowerCase();
  return Boolean(e && ADMIN_EMAILS.includes(e));
}

function isAdminIdentity(identity, memberId) {
  if (memberId && isAdmin(memberId)) return true;
  if (!identity) return false;
  if (identity.adminAccess === true) return true;
  if (identity.id != null && isAdmin(identity.id)) return true;
  return isAdminUsername(identity.telegramUsername || identity.pwaUsername || "");
}

function setCors(res, methods, headers) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", methods || "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", headers || "Content-Type");
}

function parseBody(req) {
  if (!req || req.body == null || req.body === "") return {};
  if (typeof req.body === "string") return JSON.parse(req.body);
  if (typeof req.body === "object") return req.body;
  return {};
}

function authRequired(req, body, botToken, opts) {
  const options = opts || {};
  const identity = resolveTelegramIdentity(req, body || {}, botToken || "");
  if (!identity) {
    return {
      ok: false,
      status: 401,
      error: options.authError || "Auth required",
    };
  }
  const memberId = memberIdFromIdentity(identity);
  if (!memberId) {
    return {
      ok: false,
      status: 401,
      error: options.memberError || "Member not resolved",
    };
  }
  const admin = isAdminIdentity(identity, memberId);
  if (options.adminOnly && !admin) {
    return {
      ok: false,
      status: 403,
      error: options.adminError || "Admin only",
      identity,
      memberId,
      isAdmin: false,
    };
  }
  return { ok: true, identity, memberId, isAdmin: admin };
}

module.exports = {
  ADMIN_IDS,
  ADMIN_EMAILS,
  ADMIN_USERNAMES,
  authRequired,
  isAdmin,
  isAdminEmail,
  isAdminIdentity,
  isAdminUsername,
  normalizeTelegramId,
  parseBody,
  setCors,
};
