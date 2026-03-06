# Руководство: Клуб «Два туза» — Mini App (полное приложение)

Документ для анализа всего приложения покерного клуба «Два туза» в Telegram Mini App.

---

## 1. Обзор проекта

- **Тип**: SPA (Single Page Application) для Telegram Mini App
- **Платформа**: Vercel (serverless API + статика)
- **Размер**: index.html ~2466 строк, app.js ~10.4k строк, styles.css ~11.5k строк
- **Стек**: Vanilla JS, HTML, CSS, Node.js API handlers

---

## 2. Структура файлов

```
poker-club-miniapp/
├── index.html              # Единственная HTML-страница (SPA)
├── preview-iphone.html     # Превью в рамке iPhone (430×932)
├── app.js                  # Основная логика (~10.4k строк)
├── styles.css              # Стили (~11.5k строк)
├── poker-tasks-data.js     # MTT_LEVELS, MTT_TASKS
├── winter-rating-data.js   # Данные зимнего рейтинга
├── updates-data.js         # window.APP_UPDATES — список обновлений
├── sw.js                   # Service Worker (PWA)
├── manifest.json           # PWA manifest
├── package.json
├── vercel.json             # Деплой, cron, headers
├── api/
│   └── [[...slug]].js      # Единая точка входа API (Vercel serverless)
├── lib/api-handlers/       # Обработчики API
│   ├── auth-telegram.js
│   ├── chat.js
│   ├── users.js
│   ├── raffles.js
│   ├── respect.js
│   ├── friends.js
│   ├── pikhanina.js
│   ├── gazette-subscribe.js
│   ├── rating-subscribe.js
│   └── ...
├── assets/                 # Изображения (логотипы, рейтинги, газета)
├── scripts/
│   ├── copy-to-public.js   # npm run build → public/
│   └── ...
└── public/                 # Результат сборки (outputDirectory для Vercel)
```

---

## 3. Экраны (views)

| data-view | Описание |
|-----------|----------|
| home | Главная: приветствие, турнир дня, газета, быстрые ссылки |
| winter-rating | Зимний рейтинг (декабрь–февраль) |
| spring-rating | Весенний рейтинг (март–май) |
| chat | Чат клуба, ЛС, чат с админами |
| download | Инструкции по установке |
| bonus-game | «Найти Пиханину» |
| cooler-game | Скрытая игра (is-hidden) |
| plasterer-game | «Переедь Штукатура» |
| raffles | Розыгрыши |
| poker-tasks | MTT Tournament Pro Challenge |
| hall-of-fame | Зал славы |
| cashout | Депозит и кэшаут |
| profile | Профиль (имя, ID, респект, друзья) |
| streams | Стримы |
| schedule | Расписание турниров |
| equilator | Расчёт эквити (Монте-Карло) |

---

## 4. Навигация

### Точка входа
- `#app` — `data-telegram-app-url`, `data-api-base`
- `body[data-view]` — текущий экран
- `.view[data-view="..."]` — контейнеры экранов
- `.view--active` — видимый экран

### setView(viewName)
```javascript
// app.js ~строка 1551
function setView(viewName) {
  document.body.setAttribute("data-view", viewName);
  // Показ/скрытие .view по data-view
  // Подсветка bottom-nav
  // Вызов view-специфичных init: initChat, initRaffles, initPokerTasksMtt, ...
}
```

### Переходы
- `[data-view-target="view-name"]` — клик переключает экран
- Нижняя навигация: home, chat (выпадающее меню), download, cashout, profile

---

## 5. API

### Базовый URL
`#app` → `data-api-base` (по умолчанию `https://poker-app-ebon.vercel.app`)

### Маршрутизация
`api/[[...slug]].js` — по первому сегменту пути:
- `/api/chat` → `lib/api-handlers/chat.js`
- `/api/users` → `lib/api-handlers/users.js`
- `/api/auth-telegram` → авторизация
- `/api/raffles`, `/api/respect`, `/api/friends`, `/api/pikhanina`, и т.д.
- `/api/twitch-viewers` — счётчик зрителей Twitch (нужны `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` в env)

### Внешние сервисы
- Telegram Bot API — sendMessage, getChatMember
- Poker21 pipeline — данные пользователей
- QStash — планировщик напоминаний

### Cron (vercel.json)
- `/api/cron-reminder-10min` — воскресенье 21:21
- `/api/deploy-hook` — ежедневно 12:00

---

## 6. Зависимости (CDN)

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
<script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter|Pacifico|Permanent+Marker" rel="stylesheet">
```

---

## 7. Ключевые модули app.js

### Инициализация (IIFE)
- `initTheme` — тёмная/светлая тема, localStorage
- `initRadioToggle` — радио (Chill, Lounge, 90е, Радио7)
- `initPwaInstall` — «Поделиться», установка PWA
- `initPokerTasksMtt` — кнопка «Начать задачи», refreshMttStats
- `initMttChallenge` — MTT задачи, таймер, баллы, стрик
- `initBonusGame`, `initCoolerGame`, `initPlastererGame`
- `initRaffles`, `initStreams`, `initEquilator`
- `initWinterRating`, `initProfile*`, `initChat`

### Глобальные функции
- `setView(viewName)` — переключение экранов
- `getAssetUrl(relativePath)` — URL ассетов
- `openGazette(panel, articleIndex)` — газета
- `openWinterRatingPlayerModal(nick)` — модалка игрока рейтинга

---

## 8. Deep links (startParam)

| startParam | Действие |
|------------|----------|
| news, news_N | Газета, статья N |
| winter_rating | Зимний рейтинг |
| spring_rating | Весенний рейтинг |
| raffles | Розыгрыши |
| streams_ROOMID | Стримы, комната |
| poker_task_* | MTT задачи (старт челленджа) |
| rating_top_* | Топ рейтинга |

---

## 9. localStorage ключи

- `poker_theme` — "dark" | "light"
- `chill_radio_mode` — "", "chill", "lounge", "90s", "radio7"
- `mtt_challenge_progress` — { totalPoints, dailyCompleted, dailyDate }
- `poker_streak_best_score` — (legacy)
- Ключи бонус-игр, профиля, чата

---

## 10. Сборка и деплой

```bash
npm run build   # node scripts/copy-to-public.js → public/
```

Копируются: index.html, styles.css, app.js, winter-rating-data.js, updates-data.js, preview-iphone.html, manifest.json, sw.js, assets/

Vercel: `outputDirectory: "public"`, serverless в `api/`

---

## 11. MTT Tournament Pro Challenge (кратко)

- 150 задач (план), 10 уровней, 5 задач/день
- Таймер 0–30 сек, бонус за скорость до +20
- Баллы: `(10 + timeBonus) * streakMult`, штраф −5
- localStorage: `mtt_challenge_progress`
- Файлы: poker-tasks-data.js, app.js (initPokerTasksMtt, initMttChallenge)

---

## 12. Вопросы для анализа

1. Архитектура: уместна ли монолитная app.js, стоит ли разбивать на модули?
2. API: безопасность, rate limiting, обработка ошибок
3. Производительность: оптимизация загрузки, lazy init
4. UX: навигация, доступность, мобильная адаптация
5. Масштабируемость: добавление новых разделов, поддержка
