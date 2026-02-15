# Настройка напоминания «за 10 мин» (при закрытом приложении)

Турнир в **понедельник в 4:35 (Бали, UTC+8)** → напоминание «за 10 мин» в **4:25 Бали**.

## Вариант 1: QStash (рекомендуется, без cron-job.org)

Используется Upstash QStash — тот же сервис, что и Redis. Расписание создаётся один раз.

### Шаг 1. Переменные в Vercel

В **Settings** → **Environment Variables** добавьте:

- `CRON_SECRET` — сгенерируйте пароль (https://randomkeygen.com)
- `QSTASH_TOKEN` — взять в [Upstash Console](https://console.upstash.com) → QStash → токен (если ещё нет)
- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — уже должны быть
- `TELEGRAM_BOT_TOKEN` — токен бота

### Шаг 2. Создать расписание

После деплоя откройте в браузере (подставьте свой `CRON_SECRET`):

```
https://poker-app-ebon.vercel.app/api/setup-qstash-reminder?key=ВАШ_CRON_SECRET
```

Должен вернуться `{"ok":true,"message":"QStash schedule created..."}`.

**Либо:** при первой подписке (кнопка «Напомнить за 10 минут») расписание создаётся автоматически.

### Итог

Расписание в QStash будет вызывать API каждый понедельник в 4:25 по Бали и отправлять сообщения всем подписчикам, даже если приложение закрыто.

---

## Вариант 2: cron-job.org (запасной)

Если QStash недоступен:

1. Зарегистрируйтесь на https://cron-job.org
2. **Create Cronjob:**
   - URL: `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`
   - Schedule: **Каждый понедельник, 04:25** (часовой пояс **Asia/Makassar**)

---

## Тест и проверка

- **Тест в приложении** — «Тест: отправить «за 10 мин» сейчас»
- **Проверка подписчиков** — `/api/debug-env?reminders=1` (если `subscribers10min` = 0 — нажмите «Напомнить за 10 минут»)
