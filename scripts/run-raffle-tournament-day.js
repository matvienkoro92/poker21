#!/usr/bin/env node
/**
 * Создать розыгрыш: 5 билетов на турнир дня (500₽), итоги в 17:00 МСК.
 * Требует CRON_SECRET и URL приложения (из Vercel или .env).
 *
 * Использование:
 *   CRON_SECRET=xxx node scripts/run-raffle-tournament-day.js
 * или из корня с .env:
 *   node scripts/run-raffle-tournament-day.js
 */
const path = require("path");
const fs = require("fs");
const envPath = path.resolve(__dirname, "..", ".env");
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, "utf8")
    .split("\n")
    .forEach(function (line) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
    });
}

const CRON_SECRET = process.env.CRON_SECRET;
const BASE_URL = (process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : process.env.APP_URL || process.env.MINI_APP_URL || "").replace(/\/$/, "");

if (!CRON_SECRET || !BASE_URL) {
  console.error("Задайте CRON_SECRET и URL приложения (VERCEL_URL или APP_URL в .env или окружении).");
  process.exit(1);
}

// Сегодня 17:00 МСК = 14:00 UTC в тот же календарный день по Москве
const now = new Date();
const moscowOffsetMs = 3 * 60 * 60 * 1000;
const moscowNow = new Date(now.getTime() + moscowOffsetMs);
const y = moscowNow.getUTCFullYear();
const mo = moscowNow.getUTCMonth();
const da = moscowNow.getUTCDate();
const endDate = new Date(Date.UTC(y, mo, da, 14, 0, 0, 0));

const body = {
  action: "create",
  totalWinners: 5,
  title: "5 билетов на турнир дня (500₽)",
  groups: [{ count: 5, prize: "Билет на турнир дня (500₽)" }],
  endDate: endDate.toISOString(),
};

async function run() {
  const res = await fetch(BASE_URL + "/api/raffles", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Cron-Secret": CRON_SECRET,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok && data.ok) {
    console.log("Розыгрыш создан:", data.raffle && data.raffle.id ? data.raffle.id : "ok");
    console.log("Итоги:", endDate.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }));
  } else {
    console.error("Ошибка:", res.status, data.error || data);
    process.exit(1);
  }
}

run();
