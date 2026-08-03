/**
 * Подписанная сессия PWA после OAuth ВКонтакте (обмен code на access_token на сервере).
 * Секрет: PWA_VK_SESSION_SECRET или (fallback) VK_CLIENT_SECRET.
 */
const crypto = require("crypto");

const PWA_VK_PREFIX = "pwa_sess_vk_v1:";
const PWA_VK_SESSION_TTL_SEC = 60 * 60 * 24 * 180;

function vkSigningSecret() {
  return (
    process.env.PWA_VK_SESSION_SECRET ||
    process.env.VK_CLIENT_SECRET ||
    process.env.VK_SECURE_KEY ||
    ""
  );
}

function signPwaVkSession(user, ttlSec) {
  const secret = vkSigningSecret();
  if (!user || user.vkId == null || !secret) return null;
  const exp = Math.floor(Date.now() / 1000) + (ttlSec || PWA_VK_SESSION_TTL_SEC);
  const payload = JSON.stringify({
    vid: Number(user.vkId),
    exp,
    fn: user.first_name != null ? String(user.first_name) : "",
    ln: user.last_name != null ? String(user.last_name) : "",
    dm: user.domain != null ? String(user.domain) : "",
    ph: user.photo_url != null ? String(user.photo_url) : "",
  });
  const sig = crypto.createHmac("sha256", secret).update(PWA_VK_PREFIX + payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyPwaVkSessionToken(token) {
  const secret = vkSigningSecret();
  if (!token || !secret) return null;
  const s = String(token);
  const dot = s.lastIndexOf(".");
  if (dot < 0) return null;
  const payload = s.slice(0, dot);
  const sig = s.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(PWA_VK_PREFIX + payload).digest("hex");
  if (sig !== expected || sig.length < 32) return null;
  let data;
  try {
    data = JSON.parse(payload);
  } catch (e) {
    return null;
  }
  if (!data || data.vid == null || data.exp == null) return null;
  if (Math.floor(Date.now() / 1000) > Number(data.exp)) return null;
  return {
    vkId: Number(data.vid),
    firstName: data.fn || "",
    lastName: data.ln || "",
    domain: data.dm || "",
    photo_url: data.ph || "",
  };
}

module.exports = { signPwaVkSession, verifyPwaVkSessionToken, vkSigningSecret };
