/**
 * Рассылка сообщения (и опционально картинки) группам подписчиков.
 * POST body: { initData, groups: ["visitors","gazette","rating","raffle"], month?: "YYYY-MM", text, imageUrl? }
 * Только админ. groups — какие аудитории включить.
 */
const crypto = require("crypto");
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN || "";
const ADMIN_IDS = (process.env.TELEGRAM_ADMIN_ID || "388008256,2144406710,1897001087")
  .toString()
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function isAdmin(userId) {
  const id = String(userId).replace(/^tg_/, "");
  return id && ADMIN_IDS.length > 0 && ADMIN_IDS.includes(id);
}

function validateUser(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    params.delete("hash");
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => k + "=" + v)
      .join("\n");
    const secretKey = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
    if (calculatedHash !== hash) return null;
    const user = JSON.parse(params.get("user") || "{}");
    return user.id ? { id: user.id } : null;
  } catch (e) {
    return null;
  }
}

async function redisPipeline(commands) {
  if (!REDIS_URL || !REDIS_TOKEN) return null;
  const base = REDIS_URL.replace(/\/$/, "");
  const res = await fetch(base + "/pipeline", {
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

function toNumericIds(ids) {
  const out = new Set();
  for (const id of ids) {
    const s = String(id).trim();
    if (/^\d+$/.test(s)) out.add(s);
    if (s.indexOf("tg_") === 0) out.add(s.replace(/^tg_/, ""));
  }
  return [...out];
}

async function getIdsForGroups(groups, monthParam) {
  const wantVisitors = groups && groups.includes("visitors");
  const wantGazette = groups && groups.includes("gazette");
  const wantRating = groups && groups.includes("rating");
  const wantRaffle = groups && groups.includes("raffle");
  const monthKey =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam)
      ? "poker_app:visitors_month:" + monthParam
      : "poker_app:visitors_month:" +
        new Date().getUTCFullYear() +
        "-" +
        String(new Date().getUTCMonth() + 1).padStart(2, "0");

  const commands = [];
  if (wantVisitors) commands.push(["SMEMBERS", monthKey]);
  if (wantGazette) commands.push(["SMEMBERS", "poker_app:gazette_subscribers"]);
  if (wantRating) commands.push(["SMEMBERS", "poker_app:rating_subscribers"]);
  if (wantRaffle) commands.push(["SMEMBERS", "poker_app:raffle_subscribers"]);

  if (commands.length === 0) return [];
  const results = await redisPipeline(commands);
  if (!results || !Array.isArray(results)) return [];

  const allIds = new Set();
  let idx = 0;
  if (wantVisitors && results[idx]) {
    const arr = Array.isArray(results[idx].result) ? results[idx].result : [];
    toNumericIds(arr).forEach((id) => allIds.add(id));
    idx++;
  }
  if (wantGazette && results[idx]) {
    const arr = Array.isArray(results[idx].result) ? results[idx].result : [];
    toNumericIds(arr).forEach((id) => allIds.add(id));
    idx++;
  }
  if (wantRating && results[idx]) {
    const arr = Array.isArray(results[idx].result) ? results[idx].result : [];
    toNumericIds(arr).forEach((id) => allIds.add(id));
    idx++;
  }
  if (wantRaffle && results[idx]) {
    const arr = Array.isArray(results[idx].result) ? results[idx].result : [];
    toNumericIds(arr).forEach((id) => allIds.add(id));
    idx++;
  }
  return [...allIds];
}

async function sendTelegramMessage(chatId, text, imageUrlOrBuffer, imageMimeType) {
  if (!BOT_TOKEN) return { ok: false, error: "Bot not configured" };
  const id = String(chatId).replace(/^tg_/, "");
  if (!/^\d+$/.test(id)) return { ok: false, error: "Invalid chat_id" };

  const hasImageUrl = imageUrlOrBuffer && typeof imageUrlOrBuffer === "string" && imageUrlOrBuffer.trim();
  const hasImageBuffer = imageUrlOrBuffer && Buffer.isBuffer(imageUrlOrBuffer);

  if (hasImageUrl) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: id,
        photo: imageUrlOrBuffer.trim(),
        caption: text || undefined,
        disable_web_page_preview: true,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.description || "Ошибка отправки" };
  }

  if (hasImageBuffer) {
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`;
    const mime = imageMimeType || "image/jpeg";
    const ext = mime.split("/")[1] || "jpg";
    const boundary = "----FormBoundary" + Math.random().toString(36).slice(2, 12);
    const b = (s) => Buffer.from(s, "utf8");
    const parts = [
      b("--" + boundary + "\r\nContent-Disposition: form-data; name=\"chat_id\"\r\n\r\n" + id + "\r\n"),
      b("--" + boundary + "\r\nContent-Disposition: form-data; name=\"caption\"\r\n\r\n" + (text || "") + "\r\n"),
      b("--" + boundary + "\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"photo." + ext + "\"\r\nContent-Type: " + mime + "\r\n\r\n"),
      imageUrlOrBuffer,
      b("\r\n--" + boundary + "--\r\n"),
    ];
    const bodyBuffer = Buffer.concat(parts);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": String(bodyBuffer.length) },
      body: bodyBuffer,
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return { ok: true };
    return { ok: false, error: data.description || "Ошибка отправки" };
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: id,
      text: text || "",
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) return { ok: true };
  return { ok: false, error: data.description || "Ошибка отправки" };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "POST only" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (e) {
    return res.status(400).json({ ok: false, error: "Invalid JSON" });
  }

  const initData = body.initData || body.init_data || "";
  const adminUser = initData ? validateUser(initData) : null;
  const adminId = adminUser ? "tg_" + adminUser.id : null;
  if (!adminUser || !isAdmin(adminId)) {
    return res.status(403).json({ ok: false, error: "Not admin" });
  }

  const groups = Array.isArray(body.groups) ? body.groups : [];
  const text = (body.text || body.message || "").trim();
  const imageUrl = (body.imageUrl || body.image_url || "").trim();
  const imageBase64 = body.imageBase64 || body.image_base64 || "";
  const imageMimeType = (body.imageMimeType || body.image_mime_type || "image/jpeg").trim();
  const month = (body.month || "").trim();

  if (groups.length === 0) {
    return res.status(400).json({ ok: false, error: "Выберите хотя бы одну группу" });
  }
  if (!text && !imageUrl && !imageBase64) {
    return res.status(400).json({ ok: false, error: "Укажите текст или прикрепите картинку" });
  }

  let imagePayload = imageUrl || null;
  if (imageBase64 && typeof imageBase64 === "string") {
    try {
      const buf = Buffer.from(imageBase64, "base64");
      if (buf.length > 0) imagePayload = buf;
    } catch (e) {
      return res.status(400).json({ ok: false, error: "Неверные данные картинки" });
    }
  }

  const userIds = await getIdsForGroups(groups, month || null);
  if (userIds.length === 0) {
    return res.status(200).json({ ok: true, sent: 0, failed: 0, total: 0, message: "Нет получателей в выбранных группах" });
  }

  let sent = 0;
  let failed = 0;
  const delayMs = 80;
  const imageForSend = imagePayload && Buffer.isBuffer(imagePayload) ? [imagePayload, imageMimeType] : imagePayload;

  for (const chatId of userIds) {
    const result =
      imageForSend && Array.isArray(imageForSend)
        ? await sendTelegramMessage(chatId, text, imageForSend[0], imageForSend[1])
        : await sendTelegramMessage(chatId, text, imageForSend);
    if (result.ok) sent++;
    else failed++;
    await sleep(delayMs);
  }

  return res.status(200).json({ ok: true, sent, failed, total: userIds.length });
};
