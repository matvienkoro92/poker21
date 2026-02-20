/**
 * Единая точка входа для всех API (лимит Vercel Hobby: 12 функций).
 * Маршруты: /api/chat, /api/users, /api/raffles и т.д. → handlers/chat.js, handlers/users.js, ...
 */
const pathSegment = (req) => {
  const pathname = (req.url || "").split("?")[0];
  const segment = pathname.replace(/^\/api\/?/, "").split("/")[0];
  return segment || null;
};

const path = require("path");
const handlersDir = path.join(__dirname, "..", "lib", "api-handlers");
const handlers = {
  "auth-telegram": () => require(path.join(handlersDir, "auth-telegram.js")),
  avatar: () => require(path.join(handlersDir, "avatar.js")),
  chat: () => require(path.join(handlersDir, "chat.js")),
  visit: () => require(path.join(handlersDir, "visit.js")),
  users: () => require(path.join(handlersDir, "users.js")),
  pikhanina: () => require(path.join(handlersDir, "pikhanina.js")),
  "visitors-list": () => require(path.join(handlersDir, "visitors-list.js")),
  "setup-qstash-reminder": () => require(path.join(handlersDir, "setup-qstash-reminder.js")),
  "freeroll-reminder-send": () => require(path.join(handlersDir, "freeroll-reminder-send.js")),
  "send-to-user": () => require(path.join(handlersDir, "send-to-user.js")),
  "cron-reminder-10min": () => require(path.join(handlersDir, "cron-reminder-10min.js")),
  "freeroll-reminder-subscribe": () => require(path.join(handlersDir, "freeroll-reminder-subscribe.js")),
  raffles: () => require(path.join(handlersDir, "raffles.js")),
  respect: () => require(path.join(handlersDir, "respect.js")),
};

module.exports = async function handler(req, res) {
  const segment = pathSegment(req);
  if (!segment || !handlers[segment]) {
    res.status(404).json({ ok: false, error: "Not found" });
    return;
  }
  try {
    const fn = handlers[segment]();
    const handlerFn = typeof fn === "function" ? fn : fn.default || fn;
    await handlerFn(req, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, error: "Server error" });
  }
};
