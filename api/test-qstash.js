/**
 * Тест QStash: GET /api/test-qstash — попытка запланировать запрос через 5 сек.
 * Покажет успех или ошибку QStash.
 */
const QSTASH_TOKEN = process.env.QSTASH_TOKEN;
const qHost = (process.env.QSTASH_URL || "https://qstash.upstash.io").replace(/\/$/, "");

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "GET only" });
  if (!QSTASH_TOKEN) {
    return res.status(200).json({ ok: false, error: "QSTASH_TOKEN не задан в Vercel" });
  }
  const apiBase = process.env.VERCEL_URL
    ? "https://" + process.env.VERCEL_URL
    : (process.env.VERCEL_BRANCH_URL || "https://poker-app-ebon.vercel.app");
  const sendUrl = apiBase + "/api/freeroll-reminder-send?when=5sec";
  try {
    const qRes = await fetch(qHost + "/v2/publish/" + encodeURIComponent(sendUrl), {
      method: "POST",
      headers: {
        Authorization: "Bearer " + QSTASH_TOKEN,
        "Content-Type": "application/json",
        "Upstash-Delay": "5s",
      },
      body: JSON.stringify({ initData: "test", test: true }),
    });
    const data = await qRes.json().catch(() => ({}));
    if (qRes.ok) {
      return res.status(200).json({ ok: true, message: "QStash принял задачу. Через 5 сек будет вызов (send вернёт ошибку initData — это ок)." });
    }
    return res.status(200).json({ ok: false, error: data.error || "HTTP " + qRes.status, status: qRes.status });
  } catch (e) {
    return res.status(200).json({ ok: false, error: (e && e.message) || "Ошибка сети" });
  }
};
