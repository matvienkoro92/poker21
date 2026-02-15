# Настройка напоминаний «за час» и «за 10 мин»

Турнир в **воскресенье в 22:03 МСК** → напоминание «за час» в **21:03 МСК**, «за 10 мин» в **21:53 МСК** (только воскресенье).

## Шаг 1. Добавить CRON_SECRET в Vercel

1. Сгенерируйте пароль: https://randomkeygen.com
2. Vercel → **Settings** → **Environment Variables**
3. Добавьте:
   - **Name:** `CRON_SECRET`
   - **Value:** сгенерированный пароль
4. **Save** → **Redeploy**

## Шаг 2. Выбрать способ запуска

### Вариант А: Vercel Cron (тариф Pro)

Cron уже настроен в `vercel.json`. Vercel автоматически передаёт `CRON_SECRET` в заголовке. Просто добавьте `CRON_SECRET` (шаг 1) и задеплойте.

### Вариант Б: cron-job.org (бесплатно)

1. Зарегистрируйтесь на https://cron-job.org
2. **Create Cronjob** #1:
   - URL: `https://ВАШ-ДОМЕН.vercel.app/api/freeroll-reminder-send?when=1h&secret=ВАШ_CRON_SECRET`
   - Schedule: **воскресенье 21:03** (часовой пояс: Москва)
3. **Create Cronjob** #2:
   - URL: `https://ВАШ-ДОМЕН.vercel.app/api/freeroll-reminder-send?when=10min&secret=ВАШ_CRON_SECRET`
   - Schedule: **воскресенье 21:53** (часовой пояс: Москва)

## Проверка

После настройки нажмите в приложении «За час до старта» или «За 10 мин до старта» — подписка сохранится. Сообщения придут в воскресенье в 21:03 и 21:53 МСК по расписанию.
