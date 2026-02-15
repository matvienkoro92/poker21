# Настройка напоминаний «за час» и «за 10 мин»

Турнир в **воскресенье в 22:03 МСК** → напоминание «за час» в **21:03 МСК**, «за 10 мин» в **21:53 МСК** (только воскресенье).

## ⚠️ Vercel Hobby: Cron не подходит

На бесплатном плане Vercel Cron — **максимум раз в день**. Два напоминания (21:03 и 21:53) не успеют оба сработать. **Используйте cron-job.org** (ниже).

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
   - Schedule: **Каждое воскресенье, 21:03** (выберите часовой пояс Europe/Moscow)
3. **Create Cronjob** #2 (за 10 мин):
   - URL: `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`
   - Schedule: **Каждое воскресенье, 21:53** (часовой пояс Europe/Moscow)

## Тест вручную

Откройте в браузере (подставьте свой CRON_SECRET):
- `https://poker-app-ebon.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`

Должно прийти сообщение всем, кто нажал «За 10 мин».

## Проверка подписчиков

Откройте `/api/debug-env?reminders=1` — увидите, сколько подписчиков в «за час» и «за 10 мин». Если 0 — нажмите кнопку в приложении для подписки.

## Итог

После настройки нажмите в приложении «За час» / «За 10 мин» — подписка сохранится. Сообщения придут в воскресенье в 21:03 и 21:53 МСК (если cron-job.org вызывает URL вовремя).
