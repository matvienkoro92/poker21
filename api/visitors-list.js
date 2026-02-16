/**
 * Список всех посетителей приложения.
 * GET /api/visitors-list?secret=CRON_SECRET
 *
 * Ответ: { ok, visitors: [{ id, count }], total, unique }
 */
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const CRON_SECRET = process.env.CRON_SECRET;

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = REDIS_URL.replace(/\/$/, "");
  const url = base + "/pipeline";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(commands),
  });
  if (!res.ok) return null;
  return res.json();
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "GET only" });

  const secret = req.query.secret || (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "").trim();
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return res.status(403).json({ ok: false, error: "Invalid or missing secret" });
  }

  if (!REDIS_URL || !REDIS_TOKEN) {
    return res.status(500).json({ ok: false, error: "Redis not configured" });
  }

  const results = await redisPipeline([
    ["SMEMBERS", "poker_app:visitors"],
    ["HGETALL", "poker_app:visits"],
    ["HGETALL", "poker_app:visitor_usernames"],
    ["HGETALL", "poker_app:visitor_dt_ids"],
  ]);

  if (!results || !Array.isArray(results) || results.length < 2) {
    return res.status(500).json({ ok: false, error: "Redis error" });
  }

  const ids = Array.isArray(results[0]?.result) ? results[0].result : [];
  const hash = results[1]?.result;
  const usernamesRaw = results[2]?.result;
  const dtIdsRaw = results[3]?.result;

  let dtIds = {};
  if (Array.isArray(dtIdsRaw)) {
    for (let i = 0; i < dtIdsRaw.length; i += 2) {
      if (dtIdsRaw[i] && dtIdsRaw[i + 1]) dtIds[dtIdsRaw[i]] = String(dtIdsRaw[i + 1]).trim();
    }
  } else if (dtIdsRaw && typeof dtIdsRaw === "object") {
    dtIds = dtIdsRaw;
  }

  let visitsHash = {};
  if (Array.isArray(hash)) {
    for (let i = 0; i < hash.length; i += 2) {
      visitsHash[hash[i]] = parseInt(hash[i + 1], 10) || 0;
    }
  } else if (hash && typeof hash === "object") {
    visitsHash = hash;
  }

  let usernames = {};
  if (Array.isArray(usernamesRaw)) {
    for (let i = 0; i < usernamesRaw.length; i += 2) {
      if (usernamesRaw[i] && usernamesRaw[i + 1]) usernames[usernamesRaw[i]] = String(usernamesRaw[i + 1]).trim();
    }
  } else if (usernamesRaw && typeof usernamesRaw === "object") {
    usernames = usernamesRaw;
  }

  const visitors = ids.map((id) => ({
    id,
    count: visitsHash[id] || 1,
    username: usernames[id] || null,
    dtId: dtIds[id] || null,
  }));
  visitors.sort((a, b) => b.count - a.count);

  const total = visitors.reduce((s, v) => s + (v.count || 0), 0);

  const format = (req.query.format || "").toLowerCase();
  const secretParam = escapeAttr(secret);

  if (format === "chats") {
    const chatResults = await redisPipeline([["SMEMBERS", "poker_app:chat_users"], ["HGETALL", "poker_app:visitor_usernames"]]);
    const chatUserIds = Array.isArray(chatResults?.[0]?.result) ? chatResults[0].result : [];
    const usernamesMap = {};
    if (Array.isArray(chatResults?.[1]?.result)) {
      const u = chatResults[1].result;
      for (let i = 0; i < u.length; i += 2) if (u[i] && u[i + 1]) usernamesMap[u[i]] = u[i + 1];
    }
    const chatUsers = chatUserIds.map((id) => ({ id, username: usernamesMap[id] || null }));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const listItems = chatUsers.map(
      (u) =>
        `<li class="chat-user-item"><strong>${escapeHtml(u.id)}</strong> ${u.username ? "@" + escapeHtml(u.username) : ""}
        <button type="button" class="chat-open-btn" data-user-id="${escapeAttr(u.id)}" data-secret="${secretParam}">Ответить</button>
        <div class="chat-thread" id="chat-${escapeAttr(u.id)}" style="display:none">
          <div class="chat-messages-preview" data-user-id="${escapeAttr(u.id)}"></div>
          <div class="chat-reply-wrap">
            <input type="text" class="chat-reply-input" placeholder="Сообщение..." maxlength="500" data-user-id="${escapeAttr(u.id)}" />
            <button type="button" class="chat-reply-btn" data-user-id="${escapeAttr(u.id)}" data-secret="${secretParam}">Отправить</button>
          </div>
        </div>
        </li>`
    ).join("");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Чаты с пользователями</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 24px; background: #1a1a2e; color: #eee; }
    h1 { font-size: 1.5rem; }
    ul { list-style: none; padding: 0; }
    .chat-user-item { padding: 12px; border-bottom: 1px solid #333; }
    .chat-open-btn, .chat-reply-btn { padding: 6px 12px; background: #2d5a87; color: #fff; border: none; border-radius: 6px; cursor: pointer; margin-left: 8px; }
    .chat-thread { margin-top: 12px; padding: 12px; background: #0f172a; border-radius: 8px; }
    .chat-messages-preview { max-height: 200px; overflow-y: auto; margin-bottom: 12px; font-size: 14px; }
    .chat-msg-admin { color: #4fc3f7; }
    .chat-msg-user { color: #aaa; }
    .chat-reply-wrap { display: flex; gap: 8px; }
    .chat-reply-input { flex: 1; padding: 8px; border-radius: 6px; background: #1e293b; border: 1px solid #333; color: #eee; }
  </style>
</head>
<body>
  <h1>Чаты с пользователями</h1>
  <p><a href="?format=html&secret=${secretParam}" style="color:#4fc3f7">← К списку посетителей</a></p>
  <ul id="chatList">${listItems || "<li class='empty'>Нет чатов</li>"}</ul>
  <script>
  var base = window.location.origin;
  document.querySelectorAll(".chat-open-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var uid = this.dataset.userId;
      var thread = document.getElementById("chat-" + uid);
      if (thread.style.display === "none") {
        thread.style.display = "block";
        loadChat(uid);
      } else { thread.style.display = "none"; }
    });
  });
  document.querySelectorAll(".chat-reply-btn").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var uid = this.dataset.userId;
      var secret = this.dataset.secret;
      var input = document.querySelector(".chat-reply-input[data-user-id='" + uid + "']");
      var text = (input && input.value || "").trim();
      if (!text) return;
      btn.disabled = true;
      fetch(base + "/api/chat", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({secret: secret, userId: uid, text: text}) })
        .then(function(r){return r.json();})
        .then(function(d){ btn.disabled = false; if(d.ok){ input.value=""; loadChat(uid); } else alert(d.error||"Ошибка"); })
        .catch(function(){ btn.disabled = false; alert("Ошибка сети"); });
    });
  });
  function loadChat(uid) {
    var secret = document.querySelector(".chat-reply-btn[data-user-id='" + uid + "']")?.dataset.secret || "";
    var el = document.querySelector(".chat-messages-preview[data-user-id='" + uid + "']");
    if (!el) return;
    fetch(base + "/api/chat?userId=" + encodeURIComponent(uid) + "&secret=" + encodeURIComponent(secret))
      .then(function(r){return r.json();})
      .then(function(d){
        if (!d.ok || !d.messages) { el.innerHTML = "<p>Ошибка загрузки</p>"; return; }
        el.innerHTML = d.messages.map(function(m){
          var who = m.fromAdmin ? "Админ" : (m.userName || "Пользователь");
          var cls = m.fromAdmin ? "chat-msg-admin" : "chat-msg-user";
          var t = (m.text||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
          return "<p class="+cls+"><b>"+who+"</b>: "+t+" <small>"+(m.time?new Date(m.time).toLocaleString("ru-RU"):"")+"</small></p>";
        }).join("") || "<p>Нет сообщений</p>";
        el.scrollTop = el.scrollHeight;
      });
  }
  </script>
</body>
</html>`);
  }

  if (format === "html") {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const rows = visitors.map((v, i) => {
      let linkCell = `<code>${escapeHtml(v.id)}</code>`;
      if (v.id.startsWith("tg_")) {
        const userId = v.id.replace(/^tg_/, "");
        const href = v.username
          ? "https://t.me/" + escapeAttr(v.username.replace(/^@/, ""))
          : "tg://user?id=" + escapeAttr(userId);
        linkCell = `<a href="${escapeAttr(href)}" target="_blank" rel="noopener" class="visitor-link" title="Открыть в Telegram">${escapeHtml(v.id)}</a>`;
      }
      const dtCell = v.dtId ? escapeHtml(v.dtId) : "—";
      return `<tr><td>${i + 1}</td><td>${linkCell}</td><td>${dtCell}</td><td>${v.count}</td><td>${v.id.startsWith("tg_") ? "Telegram" : "Web"}</td></tr>`;
    }).join("");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Посетители</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 24px; background: #1a1a2e; color: #eee; }
    h1 { font-size: 1.5rem; }
    .stats { margin-bottom: 16px; color: #aaa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #333; }
    th { background: #16213e; }
    tr:hover { background: #16213e; }
    code { font-size: 0.9em; background: #0f0f1a; padding: 2px 6px; border-radius: 4px; }
    a { color: #4fc3f7; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .visitor-link { color: #4fc3f7; }
    .empty { color: #666; padding: 24px; }
  </style>
</head>
<body>
  <h1>Посетители приложения</h1>
  <p class="stats">Всего визитов: <strong>${total}</strong> • Уникальных: <strong>${visitors.length}</strong> • <a href="?format=chats&secret=${secretParam}" style="color:#4fc3f7">Чаты</a></p>
  <table>
    <thead><tr><th>#</th><th>ID</th><th>DT#</th><th>Визитов</th><th>Тип</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5" class="empty">Нет данных</td></tr>'}</tbody>
  </table>
</body>
</html>`);
  }

  return res.status(200).json({
    ok: true,
    visitors,
    total,
    unique: visitors.length,
  });
};

function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(s) {
  if (!s) return "";
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
