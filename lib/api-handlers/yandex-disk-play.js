const ALLOWED_PUBLIC_KEYS = new Set([
  "https://disk.yandex.ru/i/zP4fadqf3vHPEA", "https://disk.yandex.ru/i/TurgMWNdlC_UVQ",
  "https://disk.yandex.ru/i/D01KoNyWLSktNw", "https://disk.yandex.ru/i/W98502-sTwSFEA",
  "https://disk.yandex.ru/i/RnRTBzuL53MNeQ", "https://disk.yandex.ru/i/QMsbD0BTf7LF2A",
  "https://disk.yandex.ru/i/00CDFAqFwc-URA", "https://disk.yandex.ru/i/plNlLdTd-BH9sw",
  "https://disk.yandex.ru/i/JMke_A00_A7qGA", "https://disk.yandex.ru/i/OlVyOoTjrlHWpQ",
  "https://disk.yandex.ru/i/3vkmNfyz9-rseA", "https://disk.yandex.ru/i/mm8YvgRGyEsRCg",
  "https://disk.yandex.ru/i/VL_EMriPKGKajQ", "https://disk.yandex.ru/i/GwxB4iibOxWlKA",
  "https://disk.yandex.ru/i/8WyHiEJDTlHCug"
]);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Method not allowed" });
  const parsed = new URL(req.url || "", "https://poker21-app.vercel.app");
  const publicKey = (parsed.searchParams.get("public_key") || "").trim();
  if (!ALLOWED_PUBLIC_KEYS.has(publicKey)) return res.status(400).json({ ok: false, error: "invalid_public_key" });
  try {
    const response = await fetch("https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=" + encodeURIComponent(publicKey), { headers: { Accept: "application/json" } });
    const data = await response.json();
    if (!response.ok || !data.href) return res.status(502).json({ ok: false, error: "yandex_error" });
    res.setHeader("Cache-Control", "private, max-age=30");
    return res.status(200).json({ ok: true, href: data.href });
  } catch (error) {
    return res.status(502).json({ ok: false, error: "yandex_unreachable" });
  }
};
