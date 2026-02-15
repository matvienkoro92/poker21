#!/usr/bin/env node
/**
 * Отправить сообщение одному пользователю через Telegram бота.
 * Использование: TELEGRAM_BOT_TOKEN=xxx node scripts/send-message.js [user_id] [text]
 * Пример: TELEGRAM_BOT_TOKEN=xxx node scripts/send-message.js 388008256 куку
 */
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_TOKEN || process.env.BOT_TOKEN;
const userId = (process.argv[2] || "388008256").replace(/^tg_/, "");
const text = (process.argv[3] || "куку").trim();

if (!BOT_TOKEN) {
  console.error("Укажите TELEGRAM_BOT_TOKEN в переменных окружения.");
  process.exit(1);
}
if (!userId || !/^\d+$/.test(userId)) {
  console.error("Неверный user_id. Пример: 388008256");
  process.exit(1);
}
if (!text) {
  console.error("Текст сообщения не указан.");
  process.exit(1);
}

async function send() {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: userId,
      text: text,
      disable_web_page_preview: true,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (data.ok) {
    console.log("Сообщение отправлено пользователю tg_" + userId);
  } else {
    console.error("Ошибка:", data.description || res.status);
    process.exit(1);
  }
}

send();
