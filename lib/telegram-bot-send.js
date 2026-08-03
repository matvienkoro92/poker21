/**
 * Единая отправка в Telegram Bot API (как в FootySquad handoff): прямой POST sendMessage,
 * опционально reply_markup.inline_keyboard с url-кнопкой.
 *
 * URL кнопки: TELEGRAM_MINI_APP_LINK (если https://t.me/… или http), иначе MINI_APP_URL / WEBAPP_URL / APP_URL / fallback.
 */
"use strict";

/**
 * @param {string} [fallbackUrl] — например deep link на чат
 * @returns {string}
 */
function resolveTelegramOpenButtonUrl(fallbackUrl) {
  const primary = String(process.env.TELEGRAM_MINI_APP_LINK || "").trim();
  if (primary.startsWith("https://t.me/") || primary.startsWith("http")) return primary;
  const chain = [
    process.env.MINI_APP_URL,
    process.env.WEBAPP_URL,
    process.env.APP_URL,
    fallbackUrl,
  ];
  for (let i = 0; i < chain.length; i++) {
    const s = String(chain[i] || "").trim();
    if (s.startsWith("http")) return s;
  }
  return String(fallbackUrl || "").trim();
}

function resolveOptsChatId(opts) {
  if (!opts) return null;
  const a = opts.chatId;
  const b = opts.chat_id;
  if (a != null && String(a) !== "") return a;
  if (b != null && String(b) !== "") return b;
  return null;
}

function buildInlineKeyboardReplyMarkup(opts) {
  const rawButtons = Array.isArray(opts.buttons) ? opts.buttons : [];
  const buttons = rawButtons
    .map((button) => ({
      text: button && button.text != null ? String(button.text).trim().slice(0, 64) : "",
      url: button && button.url != null ? String(button.url).trim().slice(0, 512) : "",
    }))
    .filter((button) => button.text && button.url && button.url.startsWith("http"))
    .slice(0, 2);
  if (!buttons.length) {
    const bt = opts.buttonText != null ? String(opts.buttonText).trim() : "";
    const url = opts.buttonUrl != null ? String(opts.buttonUrl).trim() : "";
    if (bt && url && url.startsWith("http")) buttons.push({ text: bt.slice(0, 64), url: url.slice(0, 512) });
  }
  if (!buttons.length) return null;
  return {
    inline_keyboard: buttons.map((button) => [button]),
  };
}

/**
 * @param {object} opts
 * @param {string|number} [opts.chatId] — или snake_case opts.chat_id
 * @param {string} opts.text
 * @param {string} [opts.buttonText]
 * @param {string} [opts.buttonUrl] — должен начинаться с http для кнопки
 * @param {{text:string,url:string}[]} [opts.buttons] — до двух URL-кнопок
 * @param {boolean} [opts.disableWebPagePreview=true]
 * @param {number} [opts.maxText=4090]
 * @returns {Record<string, unknown>}
 */
function buildSendMessagePayload(opts) {
  const chatId = resolveOptsChatId(opts);
  const text = String(opts.text || "").slice(0, opts.maxText != null ? opts.maxText : 4090);
  const payload = {
    chat_id: chatId,
    text,
    disable_web_page_preview: opts.disableWebPagePreview !== false,
  };
  if (opts.parseMode) payload.parse_mode = String(opts.parseMode);
  const bizId =
    opts.businessConnectionId != null
      ? String(opts.businessConnectionId).trim()
      : opts.business_connection_id != null
        ? String(opts.business_connection_id).trim()
        : "";
  if (bizId) payload.business_connection_id = bizId;
  const replyMarkup = buildInlineKeyboardReplyMarkup(opts);
  if (replyMarkup) payload.reply_markup = replyMarkup;
  return payload;
}

function imageExtFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseImagePayload(opts) {
  const rawDataUrl = String(opts.photoDataUrl || opts.imageDataUrl || "").trim();
  const rawBase64 = String(opts.photoBase64 || opts.imageBase64 || "").trim();
  let mime = String(opts.photoMimeType || opts.imageMimeType || "image/jpeg").trim().toLowerCase();
  let b64 = "";
  const match = rawDataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp|gif));base64,([0-9A-Za-z+/=\s]+)$/i);
  if (match) {
    mime = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
    b64 = match[2].replace(/\s/g, "");
  } else if (rawBase64) {
    if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(mime)) mime = "image/jpeg";
    if (mime === "image/jpg") mime = "image/jpeg";
    b64 = rawBase64.replace(/^data:image\/(?:jpeg|jpg|png|webp|gif);base64,/i, "").replace(/\s/g, "");
  }
  if (!b64) return null;
  if (b64.length > 1300000) return { error: "image_too_large" };
  let buffer;
  try {
    buffer = Buffer.from(b64, "base64");
  } catch (e) {
    return { error: "bad_image" };
  }
  if (!buffer || buffer.length < 16 || buffer.length > 1000000) return { error: "image_too_large" };
  return { buffer, mime, ext: imageExtFromMime(mime) };
}

function multipartField(boundary, name, value) {
  return Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"" + name + "\"\r\n\r\n" + String(value || "") + "\r\n", "utf8");
}

function extractTelegramPhotoFileId(result) {
  const photos = result && Array.isArray(result.photo) ? result.photo : [];
  const last = photos.length ? photos[photos.length - 1] : null;
  return last && last.file_id ? String(last.file_id) : "";
}

function telegramRateLimitResult(data) {
  if (!data || Number(data.error_code) !== 429) return null;
  const retryAfter = Math.max(1, Number(data.parameters && data.parameters.retry_after) || 5);
  return {
    ok: false,
    hint: "rate_limited",
    retryAfter,
    error_code: data.error_code,
  };
}

async function sendTelegramPhotoByFileId(botToken, opts, chatId, fileId) {
  const caption = String(opts.text || opts.caption || "").slice(0, opts.maxCaption != null ? opts.maxCaption : 1024);
  const replyMarkup = buildInlineKeyboardReplyMarkup(opts);
  const payload = {
    chat_id: chatId,
    photo: String(fileId || "").trim(),
  };
  if (opts.parseMode) payload.parse_mode = String(opts.parseMode);
  if (caption) payload.caption = caption;
  if (replyMarkup) payload.reply_markup = replyMarkup;
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) {
      return {
        ok: true,
        messageId: data.result && data.result.message_id,
        photoFileId: extractTelegramPhotoFileId(data.result) || payload.photo,
        reusedPhotoFileId: true,
      };
    }
    const rateLimit = telegramRateLimitResult(data);
    if (rateLimit) return rateLimit;
    const desc = (data && data.description) || res.statusText || "unknown";
    if (typeof desc === "string" && (desc.indexOf("can't initiate") !== -1 || desc.indexOf("blocked") !== -1)) {
      return { ok: false, hint: "user_blocked", error_code: data.error_code };
    }
    return { ok: false, hint: desc, error_code: data.error_code };
  } catch (e) {
    return { ok: false, hint: e && e.message ? String(e.message) : "fetch_error" };
  }
}

async function sendTelegramPhoto(botToken, opts, chatId) {
  const fileId = String((opts && (opts.photoFileId || opts.imageFileId)) || "").trim();
  if (fileId) return sendTelegramPhotoByFileId(botToken, opts || {}, chatId, fileId);
  const image = parseImagePayload(opts || {});
  if (!image || image.error) return { ok: false, hint: image && image.error ? image.error : "bad_image" };
  const boundary = "----PokerFormBoundary" + Math.random().toString(36).slice(2, 12);
  const caption = String(opts.text || opts.caption || "").slice(0, opts.maxCaption != null ? opts.maxCaption : 1024);
  const replyMarkup = buildInlineKeyboardReplyMarkup(opts);
  const parts = [multipartField(boundary, "chat_id", chatId)];
  if (caption) parts.push(multipartField(boundary, "caption", caption));
  if (opts.parseMode) parts.push(multipartField(boundary, "parse_mode", String(opts.parseMode)));
  if (replyMarkup) parts.push(multipartField(boundary, "reply_markup", JSON.stringify(replyMarkup)));
  parts.push(Buffer.from("--" + boundary + "\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"photo." + image.ext + "\"\r\nContent-Type: " + image.mime + "\r\n\r\n", "utf8"));
  parts.push(image.buffer);
  parts.push(Buffer.from("\r\n--" + boundary + "--\r\n", "utf8"));
  const url = `https://api.telegram.org/bot${botToken}/sendPhoto`;
  try {
    const body = Buffer.concat(parts);
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "multipart/form-data; boundary=" + boundary, "Content-Length": String(body.length) },
      body,
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) {
      return {
        ok: true,
        messageId: data.result && data.result.message_id,
        photoFileId: extractTelegramPhotoFileId(data.result),
        reusedPhotoFileId: false,
      };
    }
    const rateLimit = telegramRateLimitResult(data);
    if (rateLimit) return rateLimit;
    const desc = (data && data.description) || res.statusText || "unknown";
    if (typeof desc === "string" && (desc.indexOf("can't initiate") !== -1 || desc.indexOf("blocked") !== -1)) {
      return { ok: false, hint: "user_blocked", error_code: data.error_code };
    }
    return { ok: false, hint: desc, error_code: data.error_code };
  } catch (e) {
    return { ok: false, hint: e && e.message ? String(e.message) : "fetch_error" };
  }
}

/**
 * @param {string} botToken
 * @param {object} opts — как у buildSendMessagePayload
 * @returns {Promise<{ ok: boolean, hint?: string, error_code?: number }>}
 */
async function sendTelegramMessage(botToken, opts) {
  const chatId = resolveOptsChatId(opts);
  if (!botToken || !opts || chatId == null || chatId === "") {
    return { ok: false, hint: "bad_args" };
  }
  if (opts.photoFileId || opts.imageFileId || opts.photoDataUrl || opts.imageDataUrl || opts.photoBase64 || opts.imageBase64) {
    return sendTelegramPhoto(botToken, opts, chatId);
  }
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildSendMessagePayload({ ...opts, chatId })),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) return { ok: true, messageId: data.result && data.result.message_id };
    const rateLimit = telegramRateLimitResult(data);
    if (rateLimit) return rateLimit;
    const desc = (data && data.description) || res.statusText || "unknown";
    if (typeof desc === "string" && (desc.indexOf("can't initiate") !== -1 || desc.indexOf("blocked") !== -1)) {
      return { ok: false, hint: "user_blocked", error_code: data.error_code };
    }
    return { ok: false, hint: desc, error_code: data.error_code };
  } catch (e) {
    return { ok: false, hint: e && e.message ? String(e.message) : "fetch_error" };
  }
}

module.exports = {
  resolveTelegramOpenButtonUrl,
  buildSendMessagePayload,
  sendTelegramMessage,
};
