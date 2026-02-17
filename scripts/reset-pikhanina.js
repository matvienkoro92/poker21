#!/usr/bin/env node
/**
 * Сброс счётчика призов «Найди Пиханину» в Redis (остаток снова станет 15).
 * Нужны URL и токен Redis из настроек Vercel или из .env в корне проекта.
 *
 * Использование:
 *   node scripts/reset-pikhanina.js
 */
const path = require("path");
const fs = require("fs");
// Загрузить .env из корня проекта, если есть
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8").split("\n").forEach(function (line) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  });
}
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "poker_app:pikhanina_claimed_count";

if (!REDIS_URL || !REDIS_TOKEN) {
  console.error("Задайте URL и токен Redis (из настроек Vercel или из .env в корне проекта).");
  process.exit(1);
}

const base = REDIS_URL.replace(/\/$/, "");

async function reset() {
  const res = await fetch(base + "/pipeline", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + REDIS_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([["SET", KEY, "0"]]),
  });
  if (!res.ok) {
    console.error("Ошибка Redis:", res.status, await res.text());
    process.exit(1);
  }
  const data = await res.json().catch(() => null);
  const ok = Array.isArray(data) && data[0] && data[0].result === "OK";
  if (ok) {
    console.log("Счётчик призов Пиханины сброшен. Остаток снова 15.");
  } else {
    console.error("Неожиданный ответ Redis:", data);
    process.exit(1);
  }
}

reset();
