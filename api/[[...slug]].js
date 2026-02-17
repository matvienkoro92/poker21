/**
 * Единая точка входа для всех API (лимит Vercel Hobby: 12 функций).
 * Маршруты: /api/chat, /api/users, /api/raffles и т.д. → handlers/chat.js, handlers/users.js, ...
 */
const pathSegment = (req) => {
  const pathname = (req.url || "").split("?")[0];
  const segment = pathname.replace(/^\/api\/?/, "").split("/")[0];
  return segment || null;
};

const handlers = {
  "auth-telegram": () => require("./handlers/auth-telegram.js"),
  avatar: () => require("./handlers/avatar.js"),
  chat: () => require("./handlers/chat.js"),
  visit: () => require("./handlers/visit.js"),
  users: () => require("./handlers/users.js"),
  pikhanina: () => require("./handlers/pikhanina.js"),
  "visitors-list": () => require("./handlers/visitors-list.js"),
  "setup-qstash-reminder": () => require("./handlers/setup-qstash-reminder.js"),
  "freeroll-reminder-send": () => require("./handlers/freeroll-reminder-send.js"),
  "send-to-user": () => require("./handlers/send-to-user.js"),
  "cron-reminder-10min": () => require("./handlers/cron-reminder-10min.js"),
  "freeroll-reminder-subscribe": () => require("./handlers/freeroll-reminder-subscribe.js"),
  raffles: () => require("./handlers/raffles.js"),
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
