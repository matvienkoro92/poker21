# Настройка напоминаний «за час» и «за 10 мин»

Турнир в **понедельник в 3:47 (Бали, UTC+8)** → напоминание «за час» в **2:47 Бали**, «за 10 мин» в **3:37 Бали** (только понедельник).

## ⚠️ Vercel Hobby: Cron не подходит

На бесплатном плане Vercel Cron — **максимум раз в день**. Два напоминания (2:47 и 3:37 Бали) не успеют оба сработать. **Используйте cron-job.org** (ниже).

## Шаг 1. Добавить CRON_SECRET в Vercel

1. Сгенерируйте пароль: https://randomkeygen.com
2. Vercel → **Settings** → **Environment Variables**
3. Добавьте:
   - **Name:** `CRON_SECRET`
   - **Value:** сгенерированный пароль
4. **Save** → **Redeploy**

## Шаг 2. cron-job.org (рекомендуется, бесплатно)

1. Зарегистрируйтесь на https://cron-job.org
2. **Create Cronjob** #1 (за час):
   - URL: `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=1h&secret=ВАШ_CRON_SECRET`
   - Schedule: **Каждый понедельник, 02:47** (часовой пояс Asia/Makassar — Бали)
3. **Create Cronjob** #2 (за 10 мин):
   - URL: `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`
   - Schedule: **Каждый понедельник, 03:37** (часовой пояс Asia/Makassar — Бали)

## Тест вручную

Откройте в браузере (подставьте свой CRON_SECRET):
- `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`

Должно прийти сообщение всем, кто нажал «Напомнить за 10 минут».

## Проверка подписчиков

Откройте `/api/debug-env?reminders=1` — увидите, сколько подписчиков в «за час» и «за 10 мин». Если 0 — нажмите кнопку в приложении для подписки.

## Итог

После настройки нажмите в приложении «Напомнить за час» / «Напомнить за 10 минут» — подписка сохранится. Сообщения придут в понедельник в 2:47 и 3:37 по Бали (если cron-job.org вызывает URL вовремя).
