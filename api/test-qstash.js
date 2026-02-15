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
  const hosts = process.env.QSTASH_URL ? [process.env.QSTASH_URL.replace(/\/$/, "")] : ["https://qstash-us-east-1.upstash.io", "https://qstash.upstash.io"];
  var lastErr = "";
  for (var i = 0; i < hosts.length; i++) {
    try {
      const qRes = await fetch(hosts[i] + "/v2/publish/" + encodeURIComponent(sendUrl), {
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
        return res.status(200).json({ ok: true, message: "QStash принял задачу (хост: " + hosts[i] + ")." });
      }
      lastErr = data.error || "HTTP " + qRes.status;
    } catch (e) {
      lastErr = (e && e.message) || "fetch failed";
    }
  }
  return res.status(200).json({ ok: false, error: lastErr, hint: "Проверьте QSTASH_TOKEN и регион. Для US: QSTASH_URL=https://qstash-us-east-1.upstash.io" });
};
