// Темы: тёмная / светлая
(function initTheme() {
  var LIGHT_OUTER_BG = "linear-gradient(135deg, #fff7ed 0%, #ffedd5 50%, #fed7aa 100%)";
  var DARK_BG = "radial-gradient(circle at top, #0f172a 0, #020617 55%, #000 100%)";
  function applyBg() {
    var isLight = document.documentElement.getAttribute("data-theme") === "light";
    document.documentElement.style.background = isLight ? LIGHT_OUTER_BG : DARK_BG;
    document.body.style.background = isLight ? LIGHT_OUTER_BG : DARK_BG;
    var app = document.getElementById("app");
    if (app) app.style.background = isLight ? LIGHT_OUTER_BG : DARK_BG;
  }
  var stored = localStorage.getItem("poker_theme");
  var theme = stored === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", theme);
  applyBg();
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg && tg.setBackgroundColor) {
    tg.setBackgroundColor(theme === "light" ? "#ffedd5" : "#0f172a");
  }
  var btn = document.getElementById("themeToggle");
  if (btn) {
    btn.addEventListener("click", function () {
      theme = theme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", theme);
      localStorage.setItem("poker_theme", theme);
      applyBg();
      if (tg && tg.setBackgroundColor) tg.setBackgroundColor(theme === "light" ? "#ffedd5" : "#0f172a");
    });
  }
})();

// Лайтбокс: увеличение картинок и аватарок по клику
(function initImageLightbox() {
  var lightbox = document.getElementById("imageLightbox");
  var lightboxImg = lightbox ? lightbox.querySelector(".image-lightbox__img") : null;
  var backdrop = lightbox ? lightbox.querySelector(".image-lightbox__backdrop") : null;
  var closeBtn = lightbox ? lightbox.querySelector(".image-lightbox__close") : null;
  if (!lightbox || !lightboxImg) return;
  function open(src) {
    lightboxImg.src = src;
    lightboxImg.alt = "Увеличено";
    lightbox.classList.add("image-lightbox--open");
    lightbox.setAttribute("aria-hidden", "false");
  }
  function close() {
    lightbox.classList.remove("image-lightbox--open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.removeAttribute("src");
  }
  if (backdrop) backdrop.addEventListener("click", close);
  if (closeBtn) closeBtn.addEventListener("click", close);
  document.body.addEventListener("click", function (e) {
    var t = e.target;
    if (t.classList && t.classList.contains("chat-msg__image") && t.src) {
      e.preventDefault();
      open(t.src);
      return;
    }
    if (t.classList && t.classList.contains("chat-msg__avatar") && t.src) {
      e.preventDefault();
      open(t.src);
      return;
    }
    if (t.classList && t.classList.contains("chat-contact__avatar") && t.src) {
      e.preventDefault();
      e.stopPropagation();
      open(t.src);
    }
  });
  document.body.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest(".chat-msg__tg-link") : null;
    if (!link || !link.href) return;
    e.preventDefault();
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(link.href); else window.open(link.href, "_blank");
  });
})();

// Инициализация Telegram WebApp (если открыто внутри Telegram)
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
  tg.ready();
  if (tg.expand) tg.expand();
  // requestFullscreen() не вызываем: после него на части устройств (iOS) перестают работать клики по кнопкам
  // Адаптация под тему Telegram
  const themeParams = tg.themeParams || {};
  if (themeParams.bg_color) {
    document.documentElement.style.setProperty(
      "--bg-color",
      themeParams.bg_color
    );
  }
  // Инициировать диалог с ботом при первом входе (чтобы пользователь мог получать рассылку)
  (function ensureBotStarted() {
    var appEl = document.getElementById("app");
    var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "";
    var botUsername = (appEl && appEl.getAttribute("data-bot-username")) || "";
    if (!botUsername && appUrl && appUrl.indexOf("t.me") !== -1) {
      var m = appUrl.match(/t\.me\/([a-zA-Z0-9_]+)/);
      if (m) botUsername = m[1];
    }
    if (!botUsername) return;
    var key = "poker_bot_start_done";
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
    var startLink = "https://t.me/" + botUsername + "?start=miniapp";
    if (tg.openTelegramLink) tg.openTelegramLink(startLink);
  })();
}

// Авторизация через Telegram: проверка initData на сервере
(function initTelegramAuth() {
  const banner = document.getElementById("authBanner");
  const bannerLink = document.getElementById("authBannerLink");
  const userEl = document.getElementById("authUser");
  const appEl = document.getElementById("app");
  const telegramAppUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "";

  const hintEl = document.getElementById("authBannerHint");
  if (bannerLink && telegramAppUrl && telegramAppUrl.indexOf("t.me") !== -1 && telegramAppUrl.indexOf("YourBotName") === -1) {
    bannerLink.href = telegramAppUrl;
    bannerLink.style.display = "";
    if (hintEl) hintEl.style.display = "none";
  } else {
    if (bannerLink) bannerLink.style.display = "none";
    if (hintEl) hintEl.style.display = "block";
  }

  function showAuthorized(user) {
    if (userEl) {
      var textEl = userEl.querySelector("#authUserText");
      if (textEl) textEl.textContent = user.first_name ? "Привет, " + user.first_name + "!" : "Вы вошли";
      userEl.classList.remove("auth-user--hidden");
      loadHeaderAvatar();
    }
    if (banner) banner.classList.add("auth-banner--hidden");
  }

  function showUnauthorized() {
    if (userEl) userEl.classList.add("auth-user--hidden");
    if (banner) banner.classList.remove("auth-banner--hidden");
  }

  function updateHeaderGreeting() {
    var el = document.getElementById("headerGreeting");
    if (!el) return;
    var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    el.textContent = u && u.first_name ? "Привет, " + u.first_name + "!" : "Привет, Роман";
  }

  // Нет Telegram — показываем баннер «Откройте в Telegram»
  if (!tg) {
    updateHeaderGreeting();
    showUnauthorized();
    return;
  }

  // Открыто из Telegram: сразу показываем пользователя авторизованным по данным от Telegram
  var userFromTelegram = tg.initDataUnsafe && tg.initDataUnsafe.user;
  updateHeaderGreeting();
  if (userFromTelegram) {
    showAuthorized(userFromTelegram);
    // Проверку на сервере можно вызывать в фоне для логирования/аналитики (не блокируем интерфейс)
    var base = typeof window !== "undefined" && window.location.origin ? window.location.origin : "";
    if (base && tg.initData) {
      fetch(base + "/api/auth-telegram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: tg.initData }),
      }).catch(function () {});
    }
    return;
  }

  showUnauthorized();
})();

updateProfileUserName();

// Логика кнопки "Начать игру"
const startButton = document.getElementById("startButton");

if (startButton) {
  startButton.addEventListener("click", () => {
    if (tg) {
      tg.HapticFeedback && tg.HapticFeedback.impactOccurred("medium");
      tg.sendData(JSON.stringify({ action: "enter_club" }));
    } else {
      console.log("Start club mini app (local preview mode)");
      alert(
        "Здесь будет переход к лобби клуба «Два туза». В Telegram Mini App кнопка отправит событие боту."
      );
    }
  });
}

// Простая навигация по разделам (вкладки внизу)
const views = document.querySelectorAll("[data-view]");
const navItems = document.querySelectorAll("[data-view-target]:not(.bonus-game-back)");
const footer = document.querySelector(".card__footer");

function setView(viewName) {
  views.forEach(function (view) {
    if (view.dataset.view === viewName) {
      view.classList.add("view--active");
    } else {
      view.classList.remove("view--active");
    }
  });
  navItems.forEach(function (item) {
    if (item.dataset.viewTarget === viewName) {
      item.classList.add("bottom-nav__item--active");
    } else {
      item.classList.remove("bottom-nav__item--active");
    }
  });
  if (footer) {
    if (viewName === "home") {
      footer.classList.remove("card__footer--hidden");
      fetchVisitorStatsOnly();
      fetchRaffleBadge();
    } else {
      footer.classList.add("card__footer--hidden");
    }
  }
  if (viewName === "winter-rating") initWinterRating();
  if (viewName === "profile") {
    updateProfileUserName();
    updateProfileDtId();
    initProfileP21Id();
    initProfileAvatar();
  }
  if (viewName === "bonus-game") {
    initBonusGame();
    if (bonusPikhaninaInterval) clearInterval(bonusPikhaninaInterval);
    bonusPikhaninaInterval = setInterval(function () {
      updatePikhaninaStats();
      updateBonusStats();
    }, 60000);
  } else if (bonusPikhaninaInterval) {
    clearInterval(bonusPikhaninaInterval);
    bonusPikhaninaInterval = null;
  }
  if (viewName === "cooler-game") initCoolerGame();
  if (viewName === "plasterer-game") initPlastererGame();
  if (viewName === "raffles") initRaffles();
  var headerGreeting = document.getElementById("headerGreeting");
  var headerSwitcherWrap = document.getElementById("headerChatSwitcherWrap");
  if (headerGreeting) headerGreeting.classList.toggle("header-greeting--hidden", viewName === "chat");
  if (headerSwitcherWrap) headerSwitcherWrap.classList.toggle("header-chat-switcher--hidden", viewName !== "chat");
  if (viewName === "chat") {
    document.documentElement.classList.add("app-view-chat");
    window.chatGeneralUnread = false;
    window.chatPersonalUnread = false;
    updateChatNavDot();
    initChat();
  } else {
    document.documentElement.classList.remove("app-view-chat");
  }
}
function updateChatNavDot() {
  var hasUnread = !!(window.chatGeneralUnread || window.chatPersonalUnread);
  var dot = document.getElementById("chatNavDot");
  if (dot) dot.classList.toggle("bottom-nav__dot--on", hasUnread);
}

function updateRaffleBadge(hasActive) {
  var badge = document.getElementById("raffleActiveBadge");
  if (badge) badge.classList.toggle("feature__badge--hidden", !hasActive);
}

// Рейтинг Турнирщиков зимы — 01.02, 02.02, 03.02 по скринам. Баллы: 1=135, 2=110, 3=90, 4=70, 5=60, 6=50.
var WINTER_RATING_UPDATED = "03.02.2026";
var WINTER_RATING_OVERALL = [
  { nick: "ПокерМанки", points: 385, reward: 77500 },
  { nick: "Prushnik", points: 200, reward: 28000 },
  { nick: "FishKopcheny", points: 195, reward: 44200 },
  { nick: "Waaar", points: 180, reward: 33840 },
  { nick: "Coo1er91", points: 160, reward: 16000 },
  { nick: "MTTwnik", points: 140, reward: 10500 },
  { nick: "DimassikFiskk", points: 135, reward: 25900 },
  { nick: "WiNifly", points: 120, reward: 15400 },
  { nick: "king00001", points: 110, reward: 9000 },
  { nick: "prozharka", points: 70, reward: 18500 },
  { nick: "DIVGO", points: 70, reward: 6920 },
  { nick: "Salamandr", points: 60, reward: 0 },
  { nick: "Rom4ik", points: 50, reward: 0 },
  { nick: "KOL1103", points: 50, reward: 0 },
  { nick: "aRbyZ", points: 50, reward: 0 },
  { nick: "RS888", points: 0, reward: 0 },
  { nick: "Prokopenya", points: 0, reward: 0 },
  { nick: "MiracleDivice", points: 0, reward: 0 },
  { nick: "m014yH", points: 0, reward: 0 },
  { nick: "Nuts", points: 0, reward: 0 },
  { nick: "Rifa", points: 0, reward: 0 },
  { nick: "MilkyWay77", points: 0, reward: 0 },
  { nick: "mr.Fox", points: 0, reward: 0 },
  { nick: "Рамиль01", points: 0, reward: 0 },
];
var WINTER_RATING_BY_DATE = {
  "01.02.2026": [
    { nick: "ПокерМанки", points: 180, reward: 42800 },
    { nick: "DimassikFiskk", points: 135, reward: 25900 },
    { nick: "Prushnik", points: 110, reward: 17500 },
    { nick: "MTTwnik", points: 90, reward: 10500 },
    { nick: "DIVGO", points: 70, reward: 6920 },
    { nick: "WiNifly", points: 60, reward: 7700 },
    { nick: "KOL1103", points: 50, reward: 0 },
    { nick: "aRbyZ", points: 50, reward: 0 },
    { nick: "Waaar", points: 0, reward: 16800 },
    { nick: "m014yH", points: 0, reward: 0 },
    { nick: "Nuts", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
  ],
  "02.02.2026": [
    { nick: "FishKopcheny", points: 195, reward: 44200 },
    { nick: "Waaar", points: 180, reward: 17040 },
    { nick: "king00001", points: 110, reward: 9000 },
    { nick: "prozharka", points: 70, reward: 18500 },
    { nick: "ПокерМанки", points: 70, reward: 8800 },
    { nick: "Salamandr", points: 60, reward: 0 },
    { nick: "MTTwnik", points: 50, reward: 0 },
    { nick: "Rom4ik", points: 50, reward: 0 },
    { nick: "RS888", points: 0, reward: 0 },
    { nick: "Prokopenya", points: 0, reward: 0 },
    { nick: "MiracleDivice", points: 0, reward: 0 },
  ],
  "03.02.2026": [
    { nick: "Coo1er91", points: 160, reward: 16000 },
    { nick: "ПокерМанки", points: 135, reward: 25900 },
    { nick: "Prushnik", points: 90, reward: 10500 },
    { nick: "WiNifly", points: 60, reward: 7700 },
    { nick: "MTTwnik", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "mr.Fox", points: 0, reward: 0 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "Рамиль01", points: 0, reward: 0 },
  ],
};
var WINTER_RATING_IMAGES = {
  "01.02.2026": ["rating-01-02-2026.png", "rating-01-02-2026-2.png", "rating-01-02-2026-3.png"],
  "02.02.2026": ["rating-02-02-2026.png", "rating-02-02-2026-2.png", "rating-02-02-2026-3.png"],
  "03.02.2026": ["rating-03-02-2026.png", "rating-03-02-2026-2.png"],
};

function openWinterRatingLightbox(dateStr, index) {
  var box = document.getElementById("winterRatingLightbox");
  var img = box && box.querySelector(".winter-rating-lightbox__img");
  var files = dateStr && WINTER_RATING_IMAGES[dateStr];
  if (!box || !img || !files || !files.length || index < 0 || index >= files.length) return;
  box.dataset.lightboxDate = dateStr;
  box.dataset.lightboxIndex = String(index);
  img.src = "./assets/" + files[index];
  img.alt = "Скрин рейтинга " + dateStr + " (" + (index + 1) + ")";
  box.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  updateWinterRatingLightboxArrows();
}

function updateWinterRatingLightboxArrows() {
  var box = document.getElementById("winterRatingLightbox");
  if (!box || box.getAttribute("aria-hidden") === "true") return;
  var dateStr = box.dataset.lightboxDate;
  var index = parseInt(box.dataset.lightboxIndex, 10) || 0;
  var files = dateStr && WINTER_RATING_IMAGES[dateStr];
  var prevBtn = box.querySelector(".winter-rating-lightbox__prev");
  var nextBtn = box.querySelector(".winter-rating-lightbox__next");
  var counter = box.querySelector(".winter-rating-lightbox__counter");
  if (prevBtn) prevBtn.style.display = files && index > 0 ? "" : "none";
  if (nextBtn) nextBtn.style.display = files && index < files.length - 1 ? "" : "none";
  if (counter && files) counter.textContent = (index + 1) + " / " + files.length;
}

function closeWinterRatingLightbox() {
  var box = document.getElementById("winterRatingLightbox");
  if (box) {
    box.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
}

function initWinterRatingLightbox() {
  var box = document.getElementById("winterRatingLightbox");
  if (!box || box.getAttribute("data-inited") === "1") return;
  box.setAttribute("data-inited", "1");
  var closeBtn = box.querySelector(".winter-rating-lightbox__close");
  var prevBtn = box.querySelector(".winter-rating-lightbox__prev");
  var nextBtn = box.querySelector(".winter-rating-lightbox__next");
  if (closeBtn) closeBtn.addEventListener("click", closeWinterRatingLightbox);
  if (prevBtn) prevBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var dateStr = box.dataset.lightboxDate;
    var index = parseInt(box.dataset.lightboxIndex, 10) || 0;
    if (index > 0) openWinterRatingLightbox(dateStr, index - 1);
  });
  if (nextBtn) nextBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var dateStr = box.dataset.lightboxDate;
    var index = parseInt(box.dataset.lightboxIndex, 10) || 0;
    var files = WINTER_RATING_IMAGES[dateStr];
    if (files && index < files.length - 1) openWinterRatingLightbox(dateStr, index + 1);
  });
  box.addEventListener("click", function (e) {
    if (e.target === box) closeWinterRatingLightbox();
  });
  document.addEventListener("keydown", function (e) {
    if (box.getAttribute("aria-hidden") !== "false") return;
    if (e.key === "Escape") closeWinterRatingLightbox();
    else if (e.key === "ArrowLeft") {
      var dateStr = box.dataset.lightboxDate;
      var idx = parseInt(box.dataset.lightboxIndex, 10) || 0;
      if (idx > 0) openWinterRatingLightbox(dateStr, idx - 1);
    } else if (e.key === "ArrowRight") {
      var dateStr = box.dataset.lightboxDate;
      var idx = parseInt(box.dataset.lightboxIndex, 10) || 0;
      var files = WINTER_RATING_IMAGES[dateStr];
      if (files && idx < files.length - 1) openWinterRatingLightbox(dateStr, idx + 1);
    }
  });
}

function winterRatingRowClass(place) {
  if (place === 1) return "winter-rating__row--gold";
  if (place === 2) return "winter-rating__row--silver";
  if (place === 3) return "winter-rating__row--bronze";
  return "";
}
function winterRatingPlaceCell(place) {
  if (place === 1) return "🥇 1";
  if (place === 2) return "🥈 2";
  if (place === 3) return "🥉 3";
  return String(place);
}
function renderWinterRatingTable(rows) {
  if (!rows || !rows.length) return "";
  var filtered = rows.filter(function (r) { return r.points !== 0 || r.reward !== 0; });
  var sorted = filtered.slice().sort(function (a, b) { return (b.points - a.points) || (b.reward - a.reward); });
  var place = 0;
  return "<table class=\"winter-rating__table\"><thead><tr><th>Место</th><th>Ник</th><th>Баллы</th><th>Призовые</th></tr></thead><tbody>" +
    sorted.map(function (r) {
      place++;
      var trClass = winterRatingRowClass(place);
      var placeCell = winterRatingPlaceCell(place);
      return "<tr" + (trClass ? " class=\"" + trClass + "\"" : "") + "><td>" + placeCell + "</td><td>" + String(r.nick).replace(/</g, "&lt;") + "</td><td>" + r.points + "</td><td>" + (r.reward ? r.reward.toLocaleString("ru-RU") : "0") + "</td></tr>";
    }).join("") + "</tbody></table>";
}

function escapeHtmlRating(s) {
  if (s == null) return "";
  return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
}

function getWinterRatingPlayerSummary(nick) {
  var dates = ["01.02.2026", "02.02.2026", "03.02.2026"];
  var out = [];
  dates.forEach(function (dateStr) {
    var list = WINTER_RATING_BY_DATE[dateStr];
    if (!list || !list.length) return;
    var filtered = list.filter(function (r) { return r.points !== 0 || r.reward !== 0; });
    var sorted = filtered.slice().sort(function (a, b) { return (b.points - a.points) || (b.reward - a.reward); });
    var idx = sorted.findIndex(function (r) { return r.nick === nick; });
    if (idx === -1) return;
    var row = sorted[idx];
    out.push({
      date: dateStr,
      place: idx + 1,
      points: row.points,
      reward: row.reward != null ? row.reward : 0,
    });
  });
  return out;
}

function openWinterRatingPlayerModal(nick) {
  var modal = document.getElementById("winterRatingPlayerModal");
  var titleEl = modal && modal.querySelector(".winter-rating-player-modal__title");
  var tableWrap = modal && modal.querySelector(".winter-rating-player-modal__table-wrap");
  if (!modal || !titleEl || !tableWrap) return;
  var summary = getWinterRatingPlayerSummary(nick);
  titleEl.textContent = nick;
  if (summary.length) {
    tableWrap.innerHTML = "<table class=\"winter-rating__table winter-rating-player-modal__table\"><thead><tr><th>Дата</th><th>Место</th><th>Баллы</th><th>Призовые</th></tr></thead><tbody>" +
      summary.map(function (s) {
        var placeStr = winterRatingPlaceCell(s.place);
        var rewardStr = s.reward ? Number(s.reward).toLocaleString("ru-RU") : "0";
        return "<tr><td>" + s.date + "</td><td>" + placeStr + "</td><td>" + s.points + "</td><td>" + rewardStr + "</td></tr>";
      }).join("") + "</tbody></table>";
  } else {
    tableWrap.innerHTML = "<p class=\"winter-rating-player-modal__empty\">Нет данных по датам</p>";
  }
  modal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeWinterRatingPlayerModal() {
  var modal = document.getElementById("winterRatingPlayerModal");
  if (modal) {
    modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
  }
}

function initWinterRatingPlayerModal() {
  var modal = document.getElementById("winterRatingPlayerModal");
  if (!modal || modal.getAttribute("data-inited") === "1") return;
  modal.setAttribute("data-inited", "1");
  var closeBtn = modal.querySelector(".winter-rating-player-modal__close");
  if (closeBtn) closeBtn.addEventListener("click", closeWinterRatingPlayerModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeWinterRatingPlayerModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeWinterRatingPlayerModal();
  });
}

function initWinterRating() {
  initWinterRatingLightbox();
  initWinterRatingPlayerModal();
  var updatedEl = document.getElementById("winterRatingUpdated");
  var tbody = document.getElementById("winterRatingTableBody");
  if (updatedEl) updatedEl.textContent = "Обновлено: " + WINTER_RATING_UPDATED;
  var allRows = WINTER_RATING_OVERALL.filter(function (r) { return r.points !== 0 || r.reward !== 0; });
  var rows = allRows.map(function (r, i) {
    var rewardStr = r.reward ? r.reward.toLocaleString("ru-RU") : "0";
    return { place: i + 1, nick: r.nick, points: r.points, reward: rewardStr };
  });
  if (tbody) {
    tbody.innerHTML = rows.map(function (r) {
      var trClass = winterRatingRowClass(r.place);
      var placeCell = winterRatingPlaceCell(r.place);
      var nickEsc = escapeHtmlRating(r.nick);
      var nickAttr = String(r.nick).replace(/"/g, "&quot;").replace(/</g, "&lt;");
      return "<tr" + (trClass ? " class=\"" + trClass + "\"" : "") + "><td>" + placeCell + "</td><td><button type=\"button\" class=\"winter-rating__nick-btn\" data-nick=\"" + nickAttr + "\">" + nickEsc + "</button></td><td>" + r.points + "</td><td>" + r.reward + "</td></tr>";
    }).join("");
    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest(".winter-rating__nick-btn");
      if (btn && btn.dataset.nick) openWinterRatingPlayerModal(btn.dataset.nick);
    });
    var tableWrap = document.getElementById("winterRatingTableWrap");
    var showAllWrap = document.getElementById("winterRatingShowAllWrap");
    var showAllBtn = document.getElementById("winterRatingShowAllBtn");
    if (rows.length > 20 && tableWrap && showAllWrap && showAllBtn) {
      tableWrap.classList.add("winter-rating__table-wrap--collapsed");
      showAllWrap.style.display = "";
      showAllBtn.textContent = "Показать всех";
      showAllBtn.onclick = function () {
        if (tableWrap.classList.contains("winter-rating__table-wrap--collapsed")) {
          tableWrap.classList.remove("winter-rating__table-wrap--collapsed");
          showAllBtn.textContent = "Скрыть";
        } else {
          tableWrap.classList.add("winter-rating__table-wrap--collapsed");
          showAllBtn.textContent = "Показать всех";
        }
      };
    } else if (showAllWrap) {
      showAllWrap.style.display = "none";
    }
  }
  var datesContainer = document.getElementById("winterRatingDates");
  if (!datesContainer) return;
  if (datesContainer.getAttribute("data-rating-inited") === "1") return;
  datesContainer.setAttribute("data-rating-inited", "1");
  var dateItems = datesContainer.querySelectorAll(".winter-rating__date-item");
  dateItems.forEach(function (item) {
    var dateStr = item.getAttribute("data-rating-date");
    var btn = item.querySelector(".winter-rating__date-btn");
    var panel = item.querySelector(".winter-rating__date-panel");
    var tableWrap = item.querySelector(".winter-rating__date-table-wrap");
    var screensContainer = item.querySelector(".winter-rating__screenshots");
    if (!btn || !panel || !tableWrap) return;
    var data = WINTER_RATING_BY_DATE[dateStr];
    if (data && tableWrap && !tableWrap.innerHTML) {
      tableWrap.innerHTML = renderWinterRatingTable(data);
    }
    if (screensContainer) {
      var files = WINTER_RATING_IMAGES[dateStr];
      if (files && files.length) {
        screensContainer.innerHTML = files.map(function (f, i) {
          return "<div class=\"winter-rating__screenshot\" role=\"button\" tabindex=\"0\"><img src=\"./assets/" + f + "\" alt=\"Скрин рейтинга " + dateStr + " (" + (i + 1) + ")\" /></div>";
        }).join("");
        screensContainer.querySelectorAll(".winter-rating__screenshot").forEach(function (cell, idx) {
          var img = cell.querySelector("img");
          if (img && img.src) {
            cell.addEventListener("click", function () { openWinterRatingLightbox(dateStr, idx); });
          }
        });
      }
    }
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var scrollY = window.scrollY || window.pageYOffset;
      panel.classList.toggle("winter-rating__date-panel--hidden");
      var open = !panel.classList.contains("winter-rating__date-panel--hidden");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      requestAnimationFrame(function () { window.scrollTo(0, scrollY); });
    });
  });
}

function fetchRaffleBadge() {
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base || !initData) return;
  fetch(base + "/api/raffles?initData=" + encodeURIComponent(initData))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) updateRaffleBadge(!!(data.activeRaffle));
    })
    .catch(function () {});
}

function updateProfileUserName() {
  var el = document.getElementById("profileUserName");
  if (!el) return;
  var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  el.textContent = user && user.first_name ? user.first_name : "гость";
}

function updateProfileDtId() {
  var el = document.getElementById("profileUserId");
  if (!el) return;
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  var cached = sessionStorage.getItem("poker_dt_id") || (typeof localStorage !== "undefined" && localStorage.getItem("poker_dt_id"));
  if (cached) {
    el.textContent = cached;
    if (!base || !initData) return;
  }
  if (!base || !initData) {
    if (!cached) el.textContent = "\u2014";
    return;
  }
  el.textContent = "\u2026";
  fetch(base + "/api/users?initData=" + encodeURIComponent(initData))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.dtId) {
        sessionStorage.setItem("poker_dt_id", data.dtId);
        if (typeof localStorage !== "undefined") localStorage.setItem("poker_dt_id", data.dtId);
        el.textContent = data.dtId;
      } else {
        el.textContent = cached || "\u2014";
      }
      if (data && data.ok && data.p21Id != null) {
        var p21Val = data.p21Id;
        sessionStorage.setItem("poker_p21_id", p21Val);
        if (typeof localStorage !== "undefined") localStorage.setItem("poker_p21_id", p21Val);
        var p21Input = document.getElementById("profileP21IdInput");
        if (p21Input) p21Input.value = p21Val;
      }
    })
    .catch(function () {
      el.textContent = cached || "\u2014";
    });
}

function initProfileP21Id() {
  var input = document.getElementById("profileP21IdInput");
  var saveBtn = document.getElementById("profileSaveBtn");
  var feedback = document.getElementById("profileSaveFeedback");
  if (!input) return;
  function getStoredP21() {
    return (typeof localStorage !== "undefined" && localStorage.getItem("poker_p21_id")) || sessionStorage.getItem("poker_p21_id") || "";
  }
  function setStoredP21(val) {
    if (typeof localStorage !== "undefined") {
      if (val) localStorage.setItem("poker_p21_id", val); else localStorage.removeItem("poker_p21_id");
    }
    if (val) sessionStorage.setItem("poker_p21_id", val); else sessionStorage.removeItem("poker_p21_id");
  }
  var saved = getStoredP21();
  if (saved) input.value = saved.replace(/\D/g, "").slice(0, 6);
  else input.value = "";
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (base && initData) {
    fetch(base + "/api/users?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        var serverP21 = data.p21Id != null ? String(data.p21Id).trim() : "";
        var localP21 = getStoredP21().replace(/\D/g, "").slice(0, 6);
        if (serverP21.length === 6) {
          setStoredP21(serverP21);
          input.value = serverP21;
        } else if (localP21.length === 6) {
          input.value = localP21;
          fetch(base + "/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: initData, p21Id: localP21 }),
          }).then(function (r) { return r.json(); }).catch(function () {});
        }
      })
      .catch(function () {});
  }
  function saveP21Id() {
    var val = (input.value || "").replace(/\D/g, "").slice(0, 6);
    input.value = val;
    if (val.length > 0 && val.length !== 6) {
      if (feedback) {
        feedback.textContent = "Введите 6 цифр или очистите поле";
        feedback.classList.add("profile-save-feedback--visible");
        setTimeout(function () {
          feedback.textContent = "";
          feedback.classList.remove("profile-save-feedback--visible");
        }, 2500);
      }
      return;
    }
    setStoredP21(val);
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) {
      if (feedback) {
        feedback.textContent = "Сохранено локально. Откройте в Telegram, чтобы привязать к аккаунту.";
        feedback.classList.add("profile-save-feedback--visible");
        setTimeout(function () {
          feedback.textContent = "";
          feedback.classList.remove("profile-save-feedback--visible");
        }, 4000);
      }
      return;
    }
    var url = base + "/api/users?initData=" + encodeURIComponent(initData);
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData, p21Id: val || "" }),
    })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, error: r.status === 401 ? "Откройте в Telegram" : "Ошибка " + r.status }; });
      })
      .then(function (data) {
        if (feedback) {
          var msg = data && data.ok ? "Сохранено" : (data && data.error) || "Ошибка";
          var m = String(msg).toLowerCase();
          if (/telegram|телеграм|откройте/.test(m)) msg = "Откройте приложение в Telegram";
          feedback.textContent = msg;
          feedback.classList.add("profile-save-feedback--visible");
          setTimeout(function () {
            feedback.textContent = "";
            feedback.classList.remove("profile-save-feedback--visible");
          }, 2500);
        }
      })
      .catch(function () {
        if (feedback) {
          feedback.textContent = "Ошибка сети";
          feedback.classList.add("profile-save-feedback--visible");
          setTimeout(function () {
            feedback.textContent = "";
            feedback.classList.remove("profile-save-feedback--visible");
          }, 2500);
        }
      });
  }
  input.addEventListener("input", function () {
    input.value = (input.value || "").replace(/\D/g, "").slice(0, 6);
  });
  input.addEventListener("blur", saveP21Id);
  if (saveBtn) saveBtn.addEventListener("click", saveP21Id);
}

function loadHeaderAvatar() {
  var avatarEl = document.getElementById("authUserAvatar");
  if (!avatarEl) return;
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base || !initData) {
    avatarEl.style.display = "none";
    return;
  }
  fetch(base + "/api/avatar?initData=" + encodeURIComponent(initData))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.avatar) {
        avatarEl.src = data.avatar;
        avatarEl.alt = "Аватар";
        avatarEl.style.display = "";
      } else {
        avatarEl.removeAttribute("src");
        avatarEl.style.display = "none";
      }
    })
    .catch(function () {
      avatarEl.style.display = "none";
    });
}

function initProfileAvatar() {
  var avatarEl = document.getElementById("profileAvatar");
  var inputEl = document.getElementById("profileAvatarInput");
  var btnEl = document.getElementById("profileAvatarBtn");
  if (!avatarEl || !inputEl || !btnEl) return;

  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base) return;

  function loadAvatar() {
    var url = base + "/api/avatar";
    if (initData) url += "?initData=" + encodeURIComponent(initData);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.avatar) {
          avatarEl.src = data.avatar;
        } else {
          avatarEl.src = "./assets/profile-pokerist.png";
        }
      })
      .catch(function () {
        avatarEl.src = "./assets/profile-pokerist.png";
      });
  }

  function resizeImage(file, maxW, maxH, quality, cb) {
    var img = new Image();
    var canvas = document.createElement("canvas");
    img.onload = function () {
      var w = img.width, h = img.height;
      if (w > maxW || h > maxH) {
        var r = Math.min(maxW / w, maxH / h);
        w = Math.round(w * r);
        h = Math.round(h * r);
      }
      canvas.width = w;
      canvas.height = h;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);
      try {
        var dataUrl = canvas.toDataURL("image/jpeg", quality);
        cb(dataUrl);
      } catch (e) {
        var reader = new FileReader();
        reader.onload = function () { cb(reader.result); };
        reader.readAsDataURL(file);
      }
    };
    img.onerror = function () {
      var reader = new FileReader();
      reader.onload = function () { cb(reader.result); };
      reader.readAsDataURL(file);
    };
    img.src = URL.createObjectURL(file);
  }

  btnEl.addEventListener("click", function () {
    if (!initData) {
      if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
      return;
    }
    inputEl.click();
  });

  inputEl.addEventListener("change", function () {
    var file = inputEl.files && inputEl.files[0];
    if (!file || !file.type.match(/^image\/(jpeg|png|webp)$/)) {
      if (tg && tg.showAlert) tg.showAlert("Выберите изображение (JPG, PNG или WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      if (tg && tg.showAlert) tg.showAlert("Файл не более 5 МБ.");
      return;
    }
    btnEl.disabled = true;
    resizeImage(file, 200, 200, 0.8, function (dataUrl) {
      var base64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      if (base64.length > 100000) {
        resizeImage(file, 150, 150, 0.6, function (dataUrl2) {
          uploadAvatar(dataUrl2);
        });
      } else {
        uploadAvatar(dataUrl);
      }
    });

    function uploadAvatar(dataUrl) {
      fetch(base + "/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, image: dataUrl }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          btnEl.disabled = false;
          inputEl.value = "";
          if (data && data.ok && data.avatar) {
            avatarEl.src = data.avatar;
            loadHeaderAvatar();
            if (tg && tg.showAlert) tg.showAlert("Аватар обновлён!");
          } else {
            if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка загрузки");
          }
        })
        .catch(function () {
          btnEl.disabled = false;
          inputEl.value = "";
          if (tg && tg.showAlert) tg.showAlert("Ошибка сети");
        });
    }
  });

  loadAvatar();
}

navItems.forEach(function (item) {
  item.addEventListener("click", function () {
    var target = item.dataset.viewTarget;
    if (target) {
      setView(target);
      if (target === "download") setDownloadPage("main");
    }
  });
});

document.addEventListener("click", function (e) {
  var backBtn = e.target.closest(".bonus-game-back[data-view-target]");
  if (backBtn) {
    e.preventDefault();
    e.stopPropagation();
    var target = backBtn.getAttribute("data-view-target");
    if (target) setView(target);
    return;
  }
  var link = e.target.closest("a[data-view-target]");
  if (!link || link.getAttribute("data-download-page")) return;
  e.preventDefault();
  var view = link.getAttribute("data-view-target");
  if (view) setView(view);
});

document.addEventListener("click", function (e) {
  var link = e.target.closest("[data-view-target][data-download-page]");
  if (!link) return;
  e.preventDefault();
  var view = link.getAttribute("data-view-target");
  var page = link.getAttribute("data-download-page");
  if (view) setView(view);
  if (page) setDownloadPage(page);
});

// Подстраницы раздела «Скачать»
const downloadPages = document.querySelectorAll("[data-download-page]");
const downloadAppButtons = document.querySelectorAll("[data-download-app]");
const downloadBackButtons = document.querySelectorAll("[data-download-back]");

function setDownloadPage(pageName) {
  downloadPages.forEach(function (page) {
    if (page.dataset.downloadPage === pageName) {
      page.classList.add("download-page--active");
    } else {
      page.classList.remove("download-page--active");
    }
  });
}

downloadAppButtons.forEach(function (btn) {
  btn.addEventListener("click", function () {
    var app = btn.dataset.downloadApp;
    if (app) setDownloadPage(app);
  });
});

downloadBackButtons.forEach(function (btn) {
  btn.addEventListener("click", function () { setDownloadPage("main"); });
});

// Мини-игра «Найди Пиханину» — колода буби (13) + колода пики (13) + джокер Пиханина = 27 карт
const BONUS_DIAMONDS = ["2♦", "3♦", "4♦", "5♦", "6♦", "7♦", "8♦", "9♦", "10♦", "J♦", "Q♦", "K♦", "A♦"];
const BONUS_SPADES = ["2♠", "3♠", "4♠", "5♠", "6♠", "7♠", "8♠", "9♠", "10♠", "J♠", "Q♠", "K♠", "A♠"];
const BONUS_PIHANINA = "Пиханина";
const BONUS_ALL_SUITS = BONUS_DIAMONDS.concat(BONUS_SPADES);
const BONUS_GAME_CARDS_COUNT = 27;
const BONUS_PROMO_CODES = ["ПИХ200-7К2М", "ПИХ200-Л9Н4", "ПИХ200-П1РС", "ПИХ200-Т8УФ", "ПИХ200-Х3ЦЧ"];
const BONUS_MAX_ATTEMPTS = 5;
const BONUS_STORAGE_VERSION = "v3";
let bonusGameContents = [];
var bonusPikhaninaInterval = null;

function bonusStorageKey(name) {
  return name + getDeviceId() + "_" + BONUS_STORAGE_VERSION;
}

function getDeviceId() {
  var key = "poker_device_id";
  var id = localStorage.getItem(key);
  if (!id) {
    id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 14);
    localStorage.setItem(key, id);
  }
  return id;
}

function getBonusAttempts() {
  return parseInt(localStorage.getItem(bonusStorageKey("poker_bonus_attempts_")) || "0", 10);
}

function setBonusAttempts(n) {
  localStorage.setItem(bonusStorageKey("poker_bonus_attempts_"), String(n));
}

function getUsedPromoIndices() {
  try {
    var raw = localStorage.getItem(bonusStorageKey("poker_bonus_used_promos_"));
    if (raw) return JSON.parse(raw);
    return [];
  } catch (_) {
    return [];
  }
}

function markPromoUsed(index) {
  var used = getUsedPromoIndices();
  if (used.indexOf(index) === -1) used.push(index);
  localStorage.setItem(bonusStorageKey("poker_bonus_used_promos_"), JSON.stringify(used));
}

function resetBonusLimitForDevice() {
  localStorage.removeItem(bonusStorageKey("poker_bonus_attempts_"));
  localStorage.removeItem(bonusStorageKey("poker_bonus_used_promos_"));
}

function updateBonusStats() {
  const attemptsEl = document.getElementById("bonusGameAttemptsCount");
  if (attemptsEl) attemptsEl.textContent = String(Math.max(0, BONUS_MAX_ATTEMPTS - getBonusAttempts()));
}

var PIKHANINA_DEFAULT_MAX = 15;

function updatePikhaninaStats() {
  const countEl = document.getElementById("bonusGamePromoCount");
  const allDoneEl = document.getElementById("bonusGameAllCodesDone");
  if (!countEl) return;
  const base = getApiBase();
  if (!base) {
    countEl.textContent = String(PIKHANINA_DEFAULT_MAX);
    if (allDoneEl) allDoneEl.style.display = "none";
    return;
  }
  fetch(base + "/api/pikhanina", { method: "GET" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var remaining = (data && typeof data.remaining === "number") ? Math.min(data.remaining, PIKHANINA_DEFAULT_MAX) : PIKHANINA_DEFAULT_MAX;
      var s = String(remaining);
      if (countEl.textContent !== s) countEl.textContent = s;
      if (allDoneEl) {
        var show = remaining === 0 ? "block" : "none";
        if (allDoneEl.style.display !== show) allDoneEl.style.display = show;
      }
    })
    .catch(function () {
      var s = String(PIKHANINA_DEFAULT_MAX);
      if (countEl.textContent !== s) countEl.textContent = s;
      if (allDoneEl && allDoneEl.style.display !== "none") allDoneEl.style.display = "none";
    });
}

function notifyBonusWon(promoCode) {
  const base = getApiBase();
  if (!base) return;
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const initData = tg && tg.initData ? tg.initData : "";
  if (!initData) return;
      fetch(base + "/api/pikhanina", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: initData, promoCode: promoCode }),
  }).catch(function () {});
}

function getNextPromoCode() {
  const used = getUsedPromoIndices();
  const available = BONUS_PROMO_CODES.map(function (_, i) { return i; }).filter(function (i) { return used.indexOf(i) === -1; });
  if (available.length === 0) return null;
  const idx = available[Math.floor(Math.random() * available.length)];
  markPromoUsed(idx);
  return BONUS_PROMO_CODES[idx];
}

function getCardRank(str) {
  return str.replace("♦", "").replace("♠", "");
}

function buildCardFaceContent(value) {
  if (value === BONUS_PIHANINA) {
    return "<span class=\"bonus-card__face-text bonus-card__face--joker\">Пиханина</span>";
  }
  const rank = getCardRank(value);
  const isSpade = value.indexOf("♠") !== -1;
  const suit = isSpade ? "♠" : "♦";
  const suitClass = isSpade ? "bonus-card__suit bonus-card__suit--spade" : "bonus-card__suit";
  return "<span class=\"bonus-card__rank bonus-card__rank--tl\">" + rank + "</span>" +
         "<span class=\"bonus-card__rank bonus-card__rank--br\">" + rank + "</span>" +
         "<span class=\"" + suitClass + "\">" + suit + "</span>";
}

function initBonusGame() {
  const container = document.getElementById("bonusGameCards");
  const resultEl = document.getElementById("bonusGameResult");
  const retryBtn = document.getElementById("bonusGameRetry");
  const noAttemptsEl = document.getElementById("bonusGameNoAttempts");
  if (!container || !resultEl || !retryBtn) return;

  updateBonusStats();
  updatePikhaninaStats();
  const attempts = getBonusAttempts();
  if (attempts >= BONUS_MAX_ATTEMPTS) {
    container.innerHTML = "";
    container.style.display = "none";
    if (noAttemptsEl) noAttemptsEl.style.display = "block";
    retryBtn.style.display = "none";
    resultEl.textContent = "";
    return;
  }

  if (noAttemptsEl) noAttemptsEl.style.display = "none";
  container.style.display = "";

  const pihaninaIndex = Math.floor(Math.random() * BONUS_GAME_CARDS_COUNT);
  bonusGameContents = [];
  for (let i = 0; i < BONUS_GAME_CARDS_COUNT; i++) {
    bonusGameContents.push(i === pihaninaIndex ? BONUS_PIHANINA : BONUS_ALL_SUITS[i < pihaninaIndex ? i : i - 1]);
  }

  container.innerHTML = "";
  for (let i = 0; i < BONUS_GAME_CARDS_COUNT; i++) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "bonus-card";
    card.dataset.cardIndex = String(i);
    card.setAttribute("aria-label", "Карта " + (i + 1));
    card.innerHTML = "<span class=\"bonus-card__back\">Poker21</span><span class=\"bonus-card__face\" aria-hidden=\"true\"></span>";
    container.appendChild(card);
  }

  resultEl.textContent = "";
  resultEl.className = "bonus-game-result";
  retryBtn.style.display = "none";
}

document.getElementById("bonusGameCards")?.addEventListener("click", (e) => {
  const card = e.target.closest(".bonus-card");
  if (!card || card.classList.contains("bonus-card--revealed")) return;
  const resultEl = document.getElementById("bonusGameResult");
  const retryBtn = document.getElementById("bonusGameRetry");
  if (!resultEl || !retryBtn) return;

  const attempts = getBonusAttempts();
  if (attempts >= BONUS_MAX_ATTEMPTS) {
    resultEl.textContent = "Вы проиграли и не смогли поймать Пиханину, он ускользнул от вас и счастливый пошел пушить K6s.";
    resultEl.className = "bonus-game-result bonus-game-result--lose";
    return;
  }
  setBonusAttempts(attempts + 1);

  const cards = card.parentElement.querySelectorAll(".bonus-card");
  const clickedIndex = parseInt(card.dataset.cardIndex, 10);
  const isWin = bonusGameContents[clickedIndex] === BONUS_PIHANINA;

  cards.forEach((c, i) => {
    c.classList.add("bonus-card--revealed");
    c.disabled = true;
    const face = c.querySelector(".bonus-card__face");
    if (face) {
      face.innerHTML = buildCardFaceContent(bonusGameContents[i]);
    }
    if (bonusGameContents[i] === BONUS_PIHANINA) c.classList.add("bonus-card--win");
    else if (i === clickedIndex) c.classList.add("bonus-card--lose");
  });

  if (isWin) {
    const base = getApiBase();
    const onWinDone = function (remaining, promoCode) {
      updateBonusStats();
      let promoText;
      if (remaining === 0 || !promoCode) {
        promoText = "Их Пиханины уже выбили сегодня все бонусы, но вы можете сыграть просто так.";
      } else {
        promoText = "Поздравляем, вы поймали Пиханину! Ваш приз 200р. Промокод для получения — " + promoCode + ". Напишите его в чат игроков.";
      }
      resultEl.textContent = promoText;
      resultEl.classList.add("bonus-game-result--win");
      const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
      if (promoCode) notifyBonusWon(promoCode);
      updatePikhaninaStats();
    };
    if (base) {
      fetch(base + "/api/pikhanina", { method: "GET" })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (data) {
          const remaining = (data && typeof data.remaining === "number") ? data.remaining : 0;
          const promoCode = remaining > 0 ? getNextPromoCode() : null;
          onWinDone(remaining, promoCode);
        })
        .catch(function () {
          const promoCode = getNextPromoCode();
          onWinDone(0, promoCode);
        });
    } else {
      const promoCode = getNextPromoCode();
      onWinDone(0, promoCode);
    }
  } else {
    const attemptsLeft = BONUS_MAX_ATTEMPTS - getBonusAttempts();
    resultEl.textContent = "Это не Пиханина. В следующий раз повезёт! Осталось попыток: " + attemptsLeft + ".";
    resultEl.classList.add("bonus-game-result--lose");
  }
  if (isWin) {
    retryBtn.style.display = "none";
    updateBonusStats();
  } else {
    const attemptsLeft = BONUS_MAX_ATTEMPTS - getBonusAttempts();
    updateBonusStats();
    if (attemptsLeft > 0) {
      retryBtn.style.display = "block";
    } else {
      retryBtn.style.display = "none";
      resultEl.textContent = "Вы проиграли и не смогли поймать Пиханину, он ускользнул от вас и счастливый пошел пушить K6s.";
    }
  }
  updateBonusStats();
});

document.getElementById("bonusGameRetry")?.addEventListener("click", function () {
  initBonusGame();
});

// Мини-игра «Слезы Кулера» — 27 карт (буби + пики + платок), найти платок = билет на турнир
const COOLER_HANDKERCHIEF = "Платок";
let coolerGameContents = [];

function buildCoolerCardFaceContent(value) {
  if (value === COOLER_HANDKERCHIEF) {
    return "<span class=\"bonus-card__face-text bonus-card__face--joker\">Платок</span>";
  }
  const rank = getCardRank(value);
  const isSpade = value.indexOf("♠") !== -1;
  const suit = isSpade ? "♠" : "♦";
  const suitClass = isSpade ? "bonus-card__suit bonus-card__suit--spade" : "bonus-card__suit";
  return "<span class=\"bonus-card__rank bonus-card__rank--tl\">" + rank + "</span>" +
         "<span class=\"bonus-card__rank bonus-card__rank--br\">" + rank + "</span>" +
         "<span class=\"" + suitClass + "\">" + suit + "</span>";
}

function initCoolerGame() {
  const container = document.getElementById("coolerGameCards");
  const resultEl = document.getElementById("coolerGameResult");
  const retryBtn = document.getElementById("coolerGameRetry");
  if (!container || !resultEl || !retryBtn) return;

  const handkerchiefIndex = Math.floor(Math.random() * BONUS_GAME_CARDS_COUNT);
  coolerGameContents = [];
  for (let i = 0; i < BONUS_GAME_CARDS_COUNT; i++) {
    coolerGameContents.push(i === handkerchiefIndex ? COOLER_HANDKERCHIEF : BONUS_ALL_SUITS[i < handkerchiefIndex ? i : i - 1]);
  }

  container.innerHTML = "";
  for (let i = 0; i < BONUS_GAME_CARDS_COUNT; i++) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "bonus-card";
    card.dataset.cardIndex = String(i);
    card.setAttribute("aria-label", "Карта " + (i + 1));
    card.innerHTML = "<span class=\"bonus-card__back\">Poker21</span><span class=\"bonus-card__face\" aria-hidden=\"true\"></span>";
    container.appendChild(card);
  }

  resultEl.textContent = "";
  resultEl.className = "bonus-game-result";
  retryBtn.style.display = "none";
}

document.getElementById("coolerGameCards")?.addEventListener("click", (e) => {
  const card = e.target.closest(".bonus-card");
  if (!card || card.classList.contains("bonus-card--revealed")) return;
  const resultEl = document.getElementById("coolerGameResult");
  const retryBtn = document.getElementById("coolerGameRetry");
  if (!resultEl || !retryBtn) return;

  const cards = card.parentElement.querySelectorAll(".bonus-card");
  const clickedIndex = parseInt(card.dataset.cardIndex, 10);
  const isWin = coolerGameContents[clickedIndex] === COOLER_HANDKERCHIEF;

  cards.forEach((c, i) => {
    c.classList.add("bonus-card--revealed");
    c.disabled = true;
    const face = c.querySelector(".bonus-card__face");
    if (face) {
      face.innerHTML = buildCoolerCardFaceContent(coolerGameContents[i]);
    }
    if (coolerGameContents[i] === COOLER_HANDKERCHIEF) c.classList.add("bonus-card--win");
    else if (i === clickedIndex) c.classList.add("bonus-card--lose");
  });

  if (isWin) {
    resultEl.textContent = "Спасибо! Кулер вытер слёзы и дал вам билет на турнир. Напишите в чат игроков.";
    resultEl.classList.add("bonus-game-result--win");
    retryBtn.style.display = "none";
    const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
  } else {
    resultEl.textContent = "Это не платок. Попробуйте ещё раз!";
    resultEl.classList.add("bonus-game-result--lose");
    retryBtn.style.display = "block";
  }
});

document.getElementById("coolerGameRetry")?.addEventListener("click", function () {
  initCoolerGame();
});

// Игра «Переедь Штукатура» — попытки безлимитные, считаем попытки до победы
var PLASTERER_RANKS = "2 3 4 5 6 7 8 9 T J Q K A".split(" ");
var PLASTERER_SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];
var plastererDeck = [];
var plastererOpponentHand = [];
var plastererPlayerHand = [];
var plastererBoardCards = [];
var plastererAttemptCount = 0;
var plastererBoardStep = 0;

function buildPlastererDeck() {
  var d = [];
  for (var s = 0; s < PLASTERER_SUITS.length; s++) {
    for (var r = 0; r < PLASTERER_RANKS.length; r++) {
      d.push(PLASTERER_RANKS[r] + PLASTERER_SUITS[s]);
    }
  }
  return d;
}

function shufflePlasterer(arr) {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

function plastererCardRank(card) {
  var r = card.charAt(0);
  var i = PLASTERER_RANKS.indexOf(r);
  return i >= 0 ? i : 0;
}

function plastererCardSuit(card) {
  return card.length >= 2 ? card.charAt(1) : "";
}

function plastererEval5(cards) {
  var ranks = cards.map(plastererCardRank).sort(function (a, b) { return b - a; });
  var suits = cards.map(plastererCardSuit);
  var countByRank = {};
  var countBySuit = {};
  for (var i = 0; i < 5; i++) {
    countByRank[ranks[i]] = (countByRank[ranks[i]] || 0) + 1;
    countBySuit[suits[i]] = (countBySuit[suits[i]] || 0) + 1;
  }
  var flush = Object.keys(countBySuit).length === 1;
  var sorted = ranks.slice().sort(function (a, b) { return a - b; });
  var wheel = sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 && sorted[3] === 3 && sorted[4] === 12;
  var straight = wheel || (sorted[4] - sorted[0] === 4 && sorted[1] - sorted[0] === 1 && sorted[2] - sorted[1] === 1 && sorted[3] - sorted[2] === 1 && sorted[4] - sorted[3] === 1);
  var quads = false, set = false, pairCount = 0, pairRank = -1, pairRank2 = -1, setRank = -1, quadRank = -1;
  for (var r = 12; r >= 0; r--) {
    var c = countByRank[r] || 0;
    if (c === 4) { quads = true; quadRank = r; }
    if (c === 3) { set = true; setRank = r; }
    if (c === 2) { pairCount++; if (pairRank < 0) pairRank = r; else if (pairRank2 < 0) pairRank2 = r; }
  }
  var kickers = ranks.filter(function (x) {
    if (quadRank >= 0 && x === quadRank) return false;
    if (setRank >= 0 && x === setRank) return false;
    if (pairRank >= 0 && x === pairRank) return false;
    if (pairRank2 >= 0 && x === pairRank2) return false;
    return true;
  }).slice(0, 5);
  var score = 0;
  if (flush && straight) score = 9000000000 + (wheel ? 0 : sorted[4]) * 1e7;
  else if (quads) score = 8000000000 + quadRank * 1e8 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e6;
  else if (set && pairCount >= 1) score = 7000000000 + setRank * 1e8 + pairRank * 1e6;
  else if (flush) score = 6000000000 + ranks[0] * 1e7 + ranks[1] * 1e5 + ranks[2] * 1e3 + ranks[3] * 10 + ranks[4];
  else if (straight) score = 5000000000 + (wheel ? 0 : sorted[4]) * 1e7;
  else if (set) score = 4000000000 + setRank * 1e8 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e6 + (kickers[1] !== undefined ? kickers[1] : 0) * 1e4;
  else if (pairCount === 2) score = 3000000000 + Math.max(pairRank, pairRank2) * 1e8 + Math.min(pairRank, pairRank2) * 1e6 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e4;
  else if (pairCount === 1) score = 2000000000 + pairRank * 1e8 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e6 + (kickers[1] !== undefined ? kickers[1] : 0) * 1e4 + (kickers[2] !== undefined ? kickers[2] : 0) * 1e2;
  else score = 1000000000 + ranks[0] * 1e7 + ranks[1] * 1e5 + ranks[2] * 1e3 + ranks[3] * 10 + ranks[4];
  return score;
}

function plastererBestHand(seven) {
  var best = 0;
  for (var i = 0; i < 7; i++) {
    for (var j = i + 1; j < 7; j++) {
      var five = seven.filter(function (_, idx) { return idx !== i && idx !== j; });
      var s = plastererEval5(five);
      if (s > best) best = s;
    }
  }
  return best;
}

var PLASTERER_RANK_NAMES = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "валета", "дамы", "короля", "туза"];
var PLASTERER_RANK_NAMES_PLURAL = ["двоек", "троек", "четвёрок", "пятёрок", "шестёрок", "семёрок", "восьмёрок", "девяток", "десяток", "валетов", "дам", "королей", "тузов"];

function plastererGetHandName5(fiveCards) {
  if (!fiveCards || fiveCards.length !== 5) return "";
  var ranks = fiveCards.map(plastererCardRank).sort(function (a, b) { return b - a; });
  var suits = fiveCards.map(plastererCardSuit);
  var countByRank = {};
  var countBySuit = {};
  for (var i = 0; i < 5; i++) {
    countByRank[ranks[i]] = (countByRank[ranks[i]] || 0) + 1;
    countBySuit[suits[i]] = (countBySuit[suits[i]] || 0) + 1;
  }
  var flush = Object.keys(countBySuit).length === 1;
  var sorted = ranks.slice().sort(function (a, b) { return a - b; });
  var wheel = sorted[0] === 0 && sorted[1] === 1 && sorted[2] === 2 && sorted[3] === 3 && sorted[4] === 12;
  var straight = wheel || (sorted[4] - sorted[0] === 4 && sorted[1] - sorted[0] === 1 && sorted[2] - sorted[1] === 1 && sorted[3] - sorted[2] === 1 && sorted[4] - sorted[3] === 1);
  var quads = false, set = false, pairCount = 0, pairRank = -1, pairRank2 = -1, setRank = -1, quadRank = -1;
  for (var r = 12; r >= 0; r--) {
    var c = countByRank[r] || 0;
    if (c === 4) { quads = true; quadRank = r; }
    if (c === 3) { set = true; setRank = r; }
    if (c === 2) { pairCount++; if (pairRank < 0) pairRank = r; else if (pairRank2 < 0) pairRank2 = r; }
  }
  var rn = function (i) { return PLASTERER_RANK_NAMES[i] || ""; };
  var rnPlural = function (i) { return PLASTERER_RANK_NAMES_PLURAL[i] || rn(i); };
  if (flush && straight) return wheel ? "Стрит-флеш (колесо)" : "Стрит-флеш";
  if (quads) return "Каре " + rnPlural(quadRank);
  if (set && pairCount >= 1) return "Фулл-хаус (" + rnPlural(setRank) + " и " + rnPlural(pairRank) + ")";
  if (flush) return "Флеш";
  if (straight) return wheel ? "Стрит (колесо)" : "Стрит";
  if (set) return "Сет " + rnPlural(setRank);
  if (pairCount === 2) return "Две пары (" + rnPlural(Math.max(pairRank, pairRank2)) + " и " + rnPlural(Math.min(pairRank, pairRank2)) + ")";
  if (pairCount === 1) return "Пара " + rnPlural(pairRank);
  return "Старшая карта " + rn(ranks[0]);
}

function plastererPlayerBestHandName(knownBoardCount) {
  var cards = plastererPlayerHand.concat(plastererBoardCards.slice(0, knownBoardCount));
  if (cards.length < 5) return "";
  var bestScore = 0, bestFive = null;
  if (cards.length === 5) {
    bestFive = cards;
    bestScore = plastererEval5(cards);
  } else {
    if (cards.length === 6) {
      for (var i = 0; i < cards.length; i++) {
        var five = cards.filter(function (_, idx) { return idx !== i; });
        var s = plastererEval5(five);
        if (s > bestScore) { bestScore = s; bestFive = five; }
      }
    } else {
      for (var i = 0; i < cards.length; i++) {
        for (var j = i + 1; j < cards.length; j++) {
          var five = cards.filter(function (_, idx) { return idx !== i && idx !== j; });
          var s = plastererEval5(five);
          if (s > bestScore) { bestScore = s; bestFive = five; }
        }
      }
    }
  }
  return bestFive ? plastererGetHandName5(bestFive) : "";
}

function plastererOpponentBestHandName(knownBoardCount) {
  var cards = plastererOpponentHand.concat(plastererBoardCards.slice(0, knownBoardCount));
  if (cards.length < 5) return "";
  var bestScore = 0, bestFive = null;
  if (cards.length === 5) {
    bestFive = cards;
    bestScore = plastererEval5(cards);
  } else {
    if (cards.length === 6) {
      for (var i = 0; i < cards.length; i++) {
        var five = cards.filter(function (_, idx) { return idx !== i; });
        var s = plastererEval5(five);
        if (s > bestScore) { bestScore = s; bestFive = five; }
      }
    } else {
      for (var i = 0; i < cards.length; i++) {
        for (var j = i + 1; j < cards.length; j++) {
          var five = cards.filter(function (_, idx) { return idx !== i && idx !== j; });
          var s = plastererEval5(five);
          if (s > bestScore) { bestScore = s; bestFive = five; }
        }
      }
    }
  }
  return bestFive ? plastererGetHandName5(bestFive) : "";
}

var PLASTERER_CARD_IMAGES_BASE = "./assets/карты%20бархат";

function plastererCardToFilename(card) {
  if (!card || card.length < 2) return "";
  var rankCh = card.charAt(0);
  var suitCh = card.charAt(1);
  var suit = suitCh === "\u2660" ? "s" : suitCh === "\u2665" ? "h" : suitCh === "\u2666" ? "d" : suitCh === "\u2663" ? "c" : "";
  if (!suit) return "";
  var rank = rankCh === "T" ? "10" : rankCh.toLowerCase();
  return "common_" + suit + "_" + rank + ".png";
}

function renderPlastererCard(card) {
  if (!card) return "";
  var suit = card.length >= 2 ? card.charAt(1) : "";
  var cls = "plasterer-card";
  if (suit === "\u2663") cls += " plasterer-card--club";
  else if (suit === "\u2666") cls += " plasterer-card--diamond";
  else if (suit === "\u2660") cls += " plasterer-card--spade";
  else if (suit === "\u2665") cls += " plasterer-card--heart";
  else cls += " plasterer-card--black";
  var filename = plastererCardToFilename(card);
  if (filename) {
    var src = PLASTERER_CARD_IMAGES_BASE + "/" + filename;
    return "<img class=\"" + cls + "\" src=\"" + src + "\" alt=\"" + card.replace(/"/g, "&quot;") + "\" loading=\"lazy\" />";
  }
  return "<div class=\"" + cls + "\">" + card + "</div>";
}

function renderPlastererCards(containerId, cards) {
  var el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = cards.map(function (c) { return renderPlastererCard(c, false); }).join("");
}

function initPlastererGame() {
  var nameEl = document.getElementById("plastererPlayerName");
  if (nameEl) {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    nameEl.textContent = user && user.first_name ? user.first_name : "Вы";
  }
  plastererOpponentHand = [];
  plastererPlayerHand = [];
  plastererBoardCards = [];
  renderPlastererCards("plastererOpponentCards", []);
  renderPlastererCards("plastererPlayerCards", []);
  ["plastererFlop0", "plastererFlop1", "plastererFlop2", "plastererTurn", "plastererRiver"].forEach(function (id) {
    var slot = document.getElementById(id);
    if (slot) { slot.innerHTML = ""; slot.classList.remove("has-card"); }
  });
  var resultEl = document.getElementById("plastererResult");
  if (resultEl) { resultEl.textContent = ""; resultEl.className = "plasterer-result"; }
  plastererAttemptCount = 0;
  var oppEq = document.getElementById("plastererOpponentEquity");
  var plEq = document.getElementById("plastererPlayerEquity");
  if (oppEq) oppEq.textContent = "";
  if (plEq) plEq.textContent = "";
  var handNameEl = document.getElementById("plastererPlayerHandName");
  if (handNameEl) handNameEl.textContent = "";
  var oppHandNameEl = document.getElementById("plastererOpponentHandName");
  if (oppHandNameEl) oppHandNameEl.textContent = "";
  var avatarImg = document.getElementById("plastererOpponentAvatarImg");
  if (avatarImg) avatarImg.src = "./assets/plasterer-smile.png";
  var dealBtn = document.getElementById("plastererDealBtn");
  var spinBtn = document.getElementById("plastererSpinBtn");
  var againBtn = document.getElementById("plastererPlayAgainBtn");
  if (dealBtn) dealBtn.style.display = "";
  if (spinBtn) spinBtn.style.display = "none";
  if (againBtn) againBtn.style.display = "none";
}

function dealPlastererHands() {
  var deck = buildPlastererDeck();
  var aces = deck.filter(function (c) { return c.charAt(0) === "A"; });
  shufflePlasterer(aces);
  plastererOpponentHand = aces.slice(0, 2);
  var rest = deck.filter(function (c) { return plastererOpponentHand.indexOf(c) < 0; });
  shufflePlasterer(rest);
  plastererPlayerHand = rest.slice(0, 2);
  plastererBoardCards = rest.slice(2, 7);
}

function plastererEquity(knownBoardCount) {
  knownBoardCount = knownBoardCount || 0;
  var known = plastererOpponentHand.concat(plastererPlayerHand);
  var boardKnown = plastererBoardCards.slice(0, knownBoardCount);
  for (var i = 0; i < boardKnown.length; i++) known.push(boardKnown[i]);
  var deck = buildPlastererDeck();
  var remaining = deck.filter(function (c) { return known.indexOf(c) < 0; });
  var need = 5 - knownBoardCount;
  var playerWins = 0, oppWins = 0, ties = 0;
  var trials = 1500;
  for (var t = 0; t < trials; t++) {
    shufflePlasterer(remaining);
    var board = boardKnown.concat(remaining.slice(0, need));
    var oppScore = plastererBestHand(plastererOpponentHand.concat(board));
    var plScore = plastererBestHand(plastererPlayerHand.concat(board));
    if (plScore > oppScore) playerWins++;
    else if (plScore < oppScore) oppWins++;
    else ties++;
  }
  return {
    player: (playerWins / trials) * 100,
    opponent: (oppWins / trials) * 100,
    tie: (ties / trials) * 100
  };
}

function formatEquityPct(value) {
  if (value >= 99.95) return "100%";
  if (value > 0 && value < 1) return value.toFixed(2) + "%";
  if (value === 0) return "0.0%";
  if (value >= 1 && value < 99) return Math.round(value) + "%";
  if (value >= 99) return value.toFixed(1) + "%";
  return value.toFixed(1) + "%";
}

function updatePlastererEquity(knownBoardCount) {
  var eq = plastererEquity(knownBoardCount);
  var oppEl = document.getElementById("plastererOpponentEquity");
  var plEl = document.getElementById("plastererPlayerEquity");
  if (oppEl) oppEl.textContent = "Шансы на победу: " + formatEquityPct(eq.opponent);
  if (plEl) plEl.textContent = "Шансы на победу: " + formatEquityPct(eq.player);
  var plHandEl = document.getElementById("plastererPlayerHandName");
  if (plHandEl) plHandEl.textContent = knownBoardCount === 0 ? "—" : plastererPlayerBestHandName(knownBoardCount);
  var oppHandEl = document.getElementById("plastererOpponentHandName");
  if (oppHandEl) oppHandEl.textContent = knownBoardCount === 0 ? "—" : plastererOpponentBestHandName(knownBoardCount);
}

function showPlastererBoard() {
  var ids = ["plastererFlop0", "plastererFlop1", "plastererFlop2", "plastererTurn", "plastererRiver"];
  ids.forEach(function (id, i) {
    var slot = document.getElementById(id);
    if (slot && plastererBoardCards[i]) {
      slot.innerHTML = renderPlastererCard(plastererBoardCards[i]);
      slot.classList.add("has-card");
    }
  });
}

function dealPlastererOnly() {
  plastererAttemptCount++;
  dealPlastererHands();
  renderPlastererCards("plastererOpponentCards", plastererOpponentHand);
  renderPlastererCards("plastererPlayerCards", plastererPlayerHand);
  ["plastererFlop0", "plastererFlop1", "plastererFlop2", "plastererTurn", "plastererRiver"].forEach(function (id) {
    var slot = document.getElementById(id);
    if (slot) { slot.innerHTML = ""; slot.classList.remove("has-card"); }
  });
  var resultEl = document.getElementById("plastererResult");
  if (resultEl) resultEl.textContent = "";
  plastererBoardStep = 0;
  var dealBtn = document.getElementById("plastererDealBtn");
  var spinBtn = document.getElementById("plastererSpinBtn");
  if (dealBtn) dealBtn.style.display = "none";
  if (spinBtn) {
    spinBtn.style.display = "";
    spinBtn.textContent = "Крути шарманку";
  }
  updatePlastererEquity(0);
}

function runPlastererBoardStep() {
  var spinBtn = document.getElementById("plastererSpinBtn");
  var resultEl = document.getElementById("plastererResult");

  if (plastererBoardStep === 0) {
    var ids = ["plastererFlop0", "plastererFlop1", "plastererFlop2"];
    ids.forEach(function (id, i) {
      var slot = document.getElementById(id);
      if (slot && plastererBoardCards[i]) {
        slot.innerHTML = renderPlastererCard(plastererBoardCards[i]);
        slot.classList.add("has-card");
      }
    });
    plastererBoardStep = 1;
    if (spinBtn) spinBtn.textContent = "Показать терн";
    updatePlastererEquity(3);
    return;
  }

  if (plastererBoardStep === 1) {
    var slot = document.getElementById("plastererTurn");
    if (slot && plastererBoardCards[3]) {
      slot.innerHTML = renderPlastererCard(plastererBoardCards[3]);
      slot.classList.add("has-card");
    }
    plastererBoardStep = 2;
    if (spinBtn) spinBtn.textContent = "Показать ривер";
    updatePlastererEquity(4);
    return;
  }

  if (plastererBoardStep === 2) {
    var riverSlot = document.getElementById("plastererRiver");
    if (riverSlot && plastererBoardCards[4]) {
      riverSlot.innerHTML = renderPlastererCard(plastererBoardCards[4]);
      riverSlot.classList.add("has-card");
    }
    updatePlastererEquity(5);
    var oppScore = plastererBestHand(plastererOpponentHand.concat(plastererBoardCards));
    var plScore = plastererBestHand(plastererPlayerHand.concat(plastererBoardCards));
    if (resultEl) {
      var avatarImg = document.getElementById("plastererOpponentAvatarImg");
      if (plScore > oppScore) {
        if (avatarImg) avatarImg.src = "./assets/plasterer-sad.png";
        var ord = plastererAttemptCount === 1 ? "1-й" : plastererAttemptCount + "-й";
        resultEl.textContent = "Вы выиграли Штукатура с " + ord + " попытки!";
        resultEl.className = "plasterer-result plasterer-result--win";
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
        var againBtn = document.getElementById("plastererPlayAgainBtn");
        if (spinBtn) spinBtn.style.display = "none";
        if (againBtn) againBtn.style.display = "";
      } else if (plScore < oppScore) {
        if (avatarImg) avatarImg.src = "./assets/plasterer-happy.png";
        resultEl.textContent = "Штукатур победил. В следующий раз повезёт!";
        resultEl.className = "plasterer-result plasterer-result--lose";
        if (spinBtn) spinBtn.style.display = "none";
        var dealBtn = document.getElementById("plastererDealBtn");
        if (dealBtn) dealBtn.style.display = "";
      } else {
        if (avatarImg) avatarImg.src = "./assets/plasterer-smile.png";
        resultEl.textContent = "Ничья!";
        resultEl.className = "plasterer-result";
        if (spinBtn) spinBtn.style.display = "none";
        var dealBtn = document.getElementById("plastererDealBtn");
        if (dealBtn) dealBtn.style.display = "";
      }
    }
  }
}

document.getElementById("plastererDealBtn")?.addEventListener("click", function () {
  dealPlastererOnly();
});

document.getElementById("plastererSpinBtn")?.addEventListener("click", function () {
  runPlastererBoardStep();
});

document.getElementById("plastererPlayAgainBtn")?.addEventListener("click", function () {
  initPlastererGame();
});

// Рендомайзер: из чисел 1..N выбрать K случайных
(function initRandomizer() {
  var maxInput = document.getElementById("randomizerMax");
  var countInput = document.getElementById("randomizerCount");
  var btn = document.getElementById("randomizerPickBtn");
  var resultEl = document.getElementById("randomizerResult");
  if (!btn || !maxInput || !countInput || !resultEl) return;
  btn.addEventListener("click", function () {
    var max = parseInt(maxInput.value, 10) || 0;
    var count = parseInt(countInput.value, 10) || 0;
    if (max < 1) { resultEl.textContent = "Введите число не меньше 1."; resultEl.className = "randomizer-result randomizer-result--error"; return; }
    if (count < 1) { resultEl.textContent = "Количество победителей не меньше 1."; resultEl.className = "randomizer-result randomizer-result--error"; return; }
    if (count > max) { resultEl.textContent = "Количество победителей не может быть больше " + max + "."; resultEl.className = "randomizer-result randomizer-result--error"; return; }
    var pool = [];
    for (var i = 1; i <= max; i++) pool.push(i);
    for (var j = pool.length - 1; j > 0; j--) {
      var r = Math.floor(Math.random() * (j + 1));
      var t = pool[j]; pool[j] = pool[r]; pool[r] = t;
    }
    var winners = pool.slice(0, count).sort(function (a, b) { return a - b; });
    resultEl.textContent = count === 1 ? "Победитель: " + winners[0] : "Победители: " + winners.join(", ");
    resultEl.className = "randomizer-result randomizer-result--ok";
  });
})();

// Розыгрыши: список, создание (админ), участие, жеребьёвка
function initRaffles() {
  var base = getApiBase();
  var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || "";
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var adminWrap = document.getElementById("rafflesAdminWrap");
  var createToggle = document.getElementById("rafflesCreateToggle");
  var createForm = document.getElementById("raffleCreateForm");
  var groupCountInput = document.getElementById("raffleGroupCount");
  var raffleGroupsEl = document.getElementById("raffleGroups");
  var totalWinnersInput = document.getElementById("raffleTotalWinners");
  var endDateInput = document.getElementById("raffleEndDate");
  var createBtn = document.getElementById("raffleCreateBtn");
  var raffleCurrent = document.getElementById("raffleCurrent");
  var raffleEmpty = document.getElementById("raffleEmpty");
  var rafflesTabActive = document.getElementById("rafflesTabActive");
  var rafflesTabCompleted = document.getElementById("rafflesTabCompleted");
  var rafflesPanelActive = document.getElementById("rafflesPanelActive");
  var rafflesPanelCompleted = document.getElementById("rafflesPanelCompleted");
  var rafflesTabActiveCount = document.getElementById("rafflesTabActiveCount");
  var rafflesTabActiveSum = document.getElementById("rafflesTabActiveSum");
  var rafflesTabCompletedCount = document.getElementById("rafflesTabCompletedCount");
  var rafflesTabCompletedSum = document.getElementById("rafflesTabCompletedSum");
  var rafflesCompleted = document.getElementById("rafflesCompleted");
  var rafflesCompletedEmpty = document.getElementById("rafflesCompletedEmpty");
  var raffleCard = document.getElementById("raffleCard");
  var raffleMeta = document.getElementById("raffleMeta");
  var raffleEnd = document.getElementById("raffleEnd");
  var rafflePrizes = document.getElementById("rafflePrizes");
  var raffleJoinBtn = document.getElementById("raffleJoinBtn");
  var raffleLeaveBtn = document.getElementById("raffleLeaveBtn");
  var raffleJoinedMsg = document.getElementById("raffleJoinedMsg");
  var raffleParticipants = document.getElementById("raffleParticipants");
  var raffleWinnersWrap = document.getElementById("raffleWinnersWrap");
  var raffleWinners = document.getElementById("raffleWinners");
  var currentRaffleId = null;
  var currentRaffleEndDate = null;
  var raffleTimerInterval = null;
  var rafflesIsAdmin = false;
  var myRaffleUserId = null;

  function formatRaffleCountdown(endDate) {
    if (!endDate) return "";
    var now = new Date();
    var ms = endDate.getTime() - now.getTime();
    if (ms <= 0) return "Завершён";
    var sec = Math.floor(ms / 1000) % 60;
    var min = Math.floor(ms / 60000) % 60;
    var hours = Math.floor(ms / 3600000) % 24;
    var days = Math.floor(ms / 86400000);
    var parts = [];
    if (days > 0) parts.push(days + " д.");
    if (hours > 0 || parts.length) parts.push(hours + " ч.");
    parts.push(min + " мин.");
    parts.push(sec + " сек.");
    return parts.join(" ");
  }

  function updateRaffleEndText() {
    if (!raffleEnd || !currentRaffleEndDate) return;
    var text = formatRaffleCountdown(currentRaffleEndDate);
    if (text === "Завершён") {
      raffleEnd.textContent = "Завершён";
      if (raffleTimerInterval) {
        clearInterval(raffleTimerInterval);
        raffleTimerInterval = null;
      }
      loadRaffles();
      return;
    }
    raffleEnd.textContent = "Завершится через " + text;
  }

  function escapeHtml(s) {
    if (s == null) return "";
    var str = String(s);
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function getMyUserId() {
    if (myRaffleUserId) return myRaffleUserId;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      myRaffleUserId = "tg_" + tg.initDataUnsafe.user.id;
      return myRaffleUserId;
    }
    return null;
  }

  function renderRaffle(raffle) {
    if (!raffle || !raffleCard) return;
    if (raffleTimerInterval) {
      clearInterval(raffleTimerInterval);
      raffleTimerInterval = null;
    }
    currentRaffleId = raffle.id;
    var total = raffle.totalWinners || 0;
    var groups = raffle.groups || [];
    var endDate = raffle.endDate ? new Date(raffle.endDate) : null;
    var isActive = raffle.status === "active";
    currentRaffleEndDate = isActive && endDate ? endDate : null;
    raffleMeta.textContent = "Победителей: " + total + (groups.length > 0 ? " · Групп призов: " + groups.length : "");
    if (currentRaffleEndDate) {
      updateRaffleEndText();
      raffleTimerInterval = setInterval(updateRaffleEndText, 1000);
    } else {
      raffleEnd.textContent = endDate ? "Завершение: " + endDate.toLocaleString("ru-RU") : (raffle.status === "drawn" ? "Завершён" : "");
    }
    var prizesHtml = "";
    groups.forEach(function (g, i) {
      prizesHtml += "<div class=\"raffle-prize\">Группа " + (i + 1) + ": " + escapeHtml(g.prize || "—") + " (мест: " + (g.count || 0) + ")</div>";
    });
    rafflePrizes.innerHTML = prizesHtml || "<p class=\"raffle-no-prizes\">Призы не указаны</p>";
    var me = getMyUserId();
    var iAmIn = me && raffle.participants && raffle.participants.some(function (p) { return p.userId === me; });
    if (raffleJoinBtn) {
      raffleJoinBtn.classList.toggle("raffle-join-btn--hidden", !!iAmIn || raffle.status !== "active");
      raffleJoinBtn.disabled = raffle.status !== "active" || (endDate && endDate <= new Date());
    }
    if (raffleLeaveBtn) {
      raffleLeaveBtn.classList.toggle("raffle-leave-btn--hidden", !iAmIn || raffle.status !== "active");
      raffleLeaveBtn.disabled = raffle.status !== "active" || (endDate && endDate <= new Date());
    }
    if (raffleJoinedMsg) raffleJoinedMsg.classList.toggle("raffle-joined-msg--hidden", !iAmIn);
    var parts = raffle.participants || [];
    raffleParticipants.innerHTML = parts.length === 0
      ? "<li class=\"raffle-participants-empty\">Пока никого</li>"
      : parts.map(function (p) { return "<li>" + escapeHtml(p.name) + " — " + escapeHtml(p.p21Id) + "</li>"; }).join("");
    if (raffle.status === "drawn" && raffle.winners && raffle.winners.length > 0) {
      raffleWinnersWrap.classList.remove("raffle-winners-wrap--hidden");
      var byGroup = {};
      raffle.winners.forEach(function (w) {
        var g = w.groupIndex >= 0 ? "Группа " + (w.groupIndex + 1) : "Без группы";
        if (!byGroup[g]) byGroup[g] = [];
        byGroup[g].push(w);
      });
      var winHtml = "";
      Object.keys(byGroup).forEach(function (g) {
        var prize = byGroup[g][0] && byGroup[g][0].prize ? byGroup[g][0].prize : "";
        winHtml += "<li class=\"raffle-winner-group\"><strong>" + escapeHtml(g) + (prize ? ": " + escapeHtml(prize) : "") + "</strong><ul>";
        byGroup[g].forEach(function (w) {
          winHtml += "<li>" + escapeHtml(w.name) + " — " + escapeHtml(w.p21Id) + "</li>";
        });
        winHtml += "</ul></li>";
      });
      raffleWinners.innerHTML = winHtml;
    } else {
      raffleWinnersWrap.classList.add("raffle-winners-wrap--hidden");
    }
  }

  function getRaffleDeviceId() {
    try {
      var key = "poker_raffle_device_id";
      var id = typeof localStorage !== "undefined" && localStorage.getItem(key);
      if (!id) {
        id = "dev_" + Date.now() + "_" + Math.random().toString(36).slice(2, 14);
        if (typeof localStorage !== "undefined") localStorage.setItem(key, id);
      }
      return id;
    } catch (e) { return ""; }
  }

  function loadRaffles() {
    if (!base || !initData) return;
    fetch(base + "/api/raffles?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        rafflesIsAdmin = !!data.isAdmin;
        if (adminWrap) adminWrap.classList.toggle("raffles-admin-wrap--hidden", !rafflesIsAdmin);
        var raw = data.raffles || [];
        var seen = {};
        var allRaffles = raw.filter(function (r) {
          var id = r && r.id;
          if (!id || seen[id]) return false;
          seen[id] = true;
          return true;
        });
        var now = new Date();
        var activeList = allRaffles.filter(function (r) {
          if (r.status !== "active") return false;
          var end = r.endDate ? new Date(r.endDate) : null;
          return !end || end > now;
        });
        var completed = allRaffles.filter(function (r) {
          if (r.status !== "active") return true;
          var end = r.endDate ? new Date(r.endDate) : null;
          return end && end <= now;
        });

        // Вкладка «Активные»: только активные розыгрыши
        var activeCount = activeList.length;
        var activeSum = activeList.reduce(function (s, r) { return s + (r.totalWinners || 0); }, 0);
        if (rafflesTabActiveCount) rafflesTabActiveCount.textContent = String(activeCount);
        if (rafflesTabActiveSum) rafflesTabActiveSum.textContent = String(activeSum);
        var active = activeList[0] || null;

        if (active) {
          if (raffleCurrent) raffleCurrent.classList.remove("raffle-current--hidden");
          if (raffleEmpty) raffleEmpty.classList.add("raffle-empty--hidden");
          renderRaffle(active);
        } else {
          if (raffleCurrent) raffleCurrent.classList.add("raffle-current--hidden");
          if (raffleEmpty) raffleEmpty.classList.remove("raffle-empty--hidden");
          currentRaffleId = null;
          currentRaffleEndDate = null;
          if (raffleTimerInterval) {
            clearInterval(raffleTimerInterval);
            raffleTimerInterval = null;
          }
        }
        updateRaffleBadge(!!active);

        // Вкладка «Завершённые»: только завершённые розыгрыши
        var completedCount = completed.length;
        var completedSum = completed.reduce(function (s, r) { return s + ((r.winners && r.winners.length) || 0); }, 0);
        if (rafflesTabCompletedCount) rafflesTabCompletedCount.textContent = String(completedCount);
        if (rafflesTabCompletedSum) rafflesTabCompletedSum.textContent = String(completedSum);

        if (rafflesCompleted) {
          if (completed.length > 0) {
            if (rafflesCompletedEmpty) rafflesCompletedEmpty.classList.add("raffle-empty--hidden");
            rafflesCompleted.innerHTML = completed.map(function (raffle) {
              var created = raffle.createdAt ? new Date(raffle.createdAt).toLocaleDateString("ru-RU") : "";
              var end = raffle.endDate ? new Date(raffle.endDate).toLocaleString("ru-RU") : "";
              var meta = "Розыгрыш" + (created ? " от " + created : "") + (end ? " · Завершён " + end : "");
              var winners = raffle.winners || [];
              var byGroup = {};
              winners.forEach(function (w) {
                var g = w.groupIndex >= 0 ? "Группа " + (w.groupIndex + 1) : "Без группы";
                if (!byGroup[g]) byGroup[g] = [];
                byGroup[g].push(w);
              });
              var winHtml = "";
              Object.keys(byGroup).forEach(function (g) {
                var prize = byGroup[g][0] && byGroup[g][0].prize ? byGroup[g][0].prize : "";
                winHtml += "<li class=\"raffle-winner-group\"><strong>" + escapeHtml(g) + (prize ? ": " + escapeHtml(prize) : "") + "</strong><ul>";
                byGroup[g].forEach(function (w) {
                  winHtml += "<li>" + escapeHtml(w.name) + " — " + escapeHtml(w.p21Id) + "</li>";
                });
                winHtml += "</ul></li>";
              });
              return "<div class=\"raffle-completed-card\"><p class=\"raffle-completed-card__meta\">" + escapeHtml(meta) + "</p>" +
                (winHtml ? "<p class=\"raffle-completed-card__winners-title\">Победители</p><ul class=\"raffle-completed-card__winners\">" + winHtml + "</ul>" : "") + "</div>";
              }).join("");
          } else {
            rafflesCompleted.innerHTML = "";
            if (rafflesCompletedEmpty) rafflesCompletedEmpty.classList.remove("raffle-empty--hidden");
          }
        }
      })
      .catch(function () {});
  }

  function buildGroupInputs() {
    var n = Math.max(1, Math.min(10, parseInt(groupCountInput.value, 10) || 1));
    raffleGroupsEl.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var div = document.createElement("div");
      div.className = "raffle-group-row";
      div.innerHTML = "<label class=\"randomizer-label\"><span class=\"randomizer-label__text\">Группа " + (i + 1) + " — мест:</span><input type=\"number\" class=\"raffle-group-count randomizer-input\" min=\"0\" max=\"100\" value=\"1\" data-group-index=\"" + i + "\" /></label>" +
        "<label class=\"randomizer-label\"><span class=\"randomizer-label__text\">Приз:</span><input type=\"text\" class=\"raffle-group-prize randomizer-input\" placeholder=\"Название приза\" data-group-index=\"" + i + "\" /></label>";
      raffleGroupsEl.appendChild(div);
    }
  }

  function setRafflesTab(tab) {
    var isActive = tab === "active";
    if (rafflesTabActive) rafflesTabActive.classList.toggle("raffles-tab--active", isActive);
    if (rafflesTabCompleted) rafflesTabCompleted.classList.toggle("raffles-tab--active", !isActive);
    if (rafflesPanelActive) rafflesPanelActive.classList.toggle("raffles-panel--active", isActive);
    if (rafflesPanelActive) rafflesPanelActive.classList.toggle("raffles-panel--hidden", !isActive);
    if (rafflesPanelCompleted) rafflesPanelCompleted.classList.toggle("raffles-panel--active", !isActive);
    if (rafflesPanelCompleted) rafflesPanelCompleted.classList.toggle("raffles-panel--hidden", isActive);
  }
  if (rafflesTabActive) rafflesTabActive.addEventListener("click", function () { setRafflesTab("active"); });
  if (rafflesTabCompleted) rafflesTabCompleted.addEventListener("click", function () { setRafflesTab("completed"); });

  if (createToggle && createForm) {
    createToggle.addEventListener("click", function () {
      createForm.classList.toggle("raffle-create-form--hidden");
      if (!createForm.classList.contains("raffle-create-form--hidden")) buildGroupInputs();
    });
  }
  if (groupCountInput && raffleGroupsEl) {
    groupCountInput.addEventListener("change", buildGroupInputs);
  }
  if (createBtn && totalWinnersInput && endDateInput) {
    createBtn.addEventListener("click", function () {
      var total = Math.max(1, Math.min(100, parseInt(totalWinnersInput.value, 10) || 1));
      var groupInputs = raffleGroupsEl ? raffleGroupsEl.querySelectorAll(".raffle-group-count") : [];
      var prizeInputs = raffleGroupsEl ? raffleGroupsEl.querySelectorAll(".raffle-group-prize") : [];
      var groups = [];
      for (var i = 0; i < groupInputs.length; i++) {
        var count = Math.max(0, parseInt(groupInputs[i].value, 10) || 0);
        var prize = prizeInputs[i] ? prizeInputs[i].value.trim().slice(0, 200) : "";
        groups.push({ count: count, prize: prize });
      }
      if (groups.length === 0) groups = [{ count: total, prize: "Приз" }];
      var endVal = endDateInput.value;
      if (!endVal) {
        if (tg && tg.showAlert) tg.showAlert("Укажите дату и время завершения");
        return;
      }
      var endDate = new Date(endVal);
      if (isNaN(endDate.getTime())) {
        if (tg && tg.showAlert) tg.showAlert("Некорректная дата");
        return;
      }
      createBtn.disabled = true;
      fetch(base + "/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, action: "create", totalWinners: total, groups: groups, endDate: endDate.toISOString() }),
      })
        .then(function (r) { return r.json(); })
        .then(function (data) {
          createBtn.disabled = false;
          if (data && data.ok && data.raffle) {
            createForm.classList.add("raffle-create-form--hidden");
            loadRaffles();
            if (tg && tg.showAlert) tg.showAlert("Розыгрыш создан");
          } else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
        })
        .catch(function () { createBtn.disabled = false; });
    });
  }

  if (raffleJoinBtn) {
    raffleJoinBtn.addEventListener("click", function () {
      if (!currentRaffleId) {
        if (tg && tg.showAlert) tg.showAlert("Розыгрыш не выбран. Обновите страницу.");
        return;
      }
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      raffleJoinBtn.disabled = true;
      fetch(base + "/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, action: "join", raffleId: currentRaffleId, deviceId: getRaffleDeviceId() }),
      })
        .then(function (r) {
          return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
        })
        .then(function (data) {
          raffleJoinBtn.disabled = false;
          if (data && data.ok) {
            if (data.raffle) renderRaffle(data.raffle);
            if (tg && tg.showAlert) {
              if (data.alreadyJoined) tg.showAlert("Вы уже участвуете");
              else tg.showAlert("Вы добавлены в розыгрыш");
            }
          } else {
            var err = (data && data.error) || "Ошибка";
            if (data && data.code === "P21_REQUIRED") {
              if (tg && tg.showAlert) tg.showAlert("Заполните свой ID в профиле. На него будет начисляться выигрыш!");
              if (typeof setView === "function") setView("profile");
            } else if (data && (data.code === "SAME_IP" || data.code === "SAME_DEVICE")) {
              if (tg && tg.showAlert) tg.showAlert(err);
            } else if (tg && tg.showAlert) tg.showAlert(err);
          }
        })
        .catch(function () {
          raffleJoinBtn.disabled = false;
          if (tg && tg.showAlert) tg.showAlert("Ошибка сети. Проверьте интернет и попробуйте снова.");
        });
    });
  }

  if (raffleLeaveBtn) {
    raffleLeaveBtn.addEventListener("click", function () {
      if (!currentRaffleId || !base || !initData) return;
      raffleLeaveBtn.disabled = true;
      fetch(base + "/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, action: "leave", raffleId: currentRaffleId }),
      })
        .then(function (r) {
          return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
        })
        .then(function (data) {
          raffleLeaveBtn.disabled = false;
          if (data && data.ok) {
            if (data.raffle) renderRaffle(data.raffle);
            if (tg && tg.showAlert) tg.showAlert(data.alreadyLeft ? "Вы не были в розыгрыше" : "Участие отменено");
          } else {
            if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
          }
        })
        .catch(function () {
          raffleLeaveBtn.disabled = false;
          if (tg && tg.showAlert) tg.showAlert("Ошибка сети.");
        });
    });
  }

  loadRaffles();
}

// Счётчик уникальных и повторных посетителей (стабильный ID: Telegram → localStorage → sessionStorage)
function getVisitorId() {
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  if (tg && tg.initData) {
    const params = new URLSearchParams(tg.initData);
    const userStr = params.get("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        if (user.id) return "tg_" + user.id;
      } catch (e) {}
    }
  }
  try {
    let id = localStorage.getItem("poker_visitor_id");
    if (id) return id;
    id = sessionStorage.getItem("poker_visitor_id");
    if (id) {
      try { localStorage.setItem("poker_visitor_id", id); } catch (e) {}
      return id;
    }
    id = "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
    try { localStorage.setItem("poker_visitor_id", id); } catch (e) {}
    sessionStorage.setItem("poker_visitor_id", id);
    return id;
  } catch (e) {
    return "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
  }
}

// Чат: общий + личные сообщения
var chatPollInterval = null;
var chatIsEditingMessage = false;
window.chatGeneralUnread = false;
window.chatPersonalUnread = false;
var chatWithUserId = null;
var chatWithUserName = null;
var chatActiveTab = "general";
var chatIsAdmin = false;
var chatListenersAttached = false;

function initChat() {
  var generalView = document.getElementById("chatGeneralView");
  var personalView = document.getElementById("chatPersonalView");
  var adminsView = document.getElementById("chatAdminsView");
  var generalMessages = document.getElementById("chatGeneralMessages");
  var generalInput = document.getElementById("chatGeneralInput");
  var generalSendBtn = document.getElementById("chatGeneralSendBtn");
  var listView = document.getElementById("chatListView");
  var convView = document.getElementById("chatConvView");
  var contactsEl = document.getElementById("chatContacts");
  var findByIdInput = document.getElementById("chatFindByIdInput");
  var findByIdBtn = document.getElementById("chatFindByIdBtn");
  var backBtn = document.getElementById("chatBackBtn");
  var convTitle = document.getElementById("chatConvTitle");
  var messagesEl = document.getElementById("chatMessages");
  var inputEl = document.getElementById("chatInput");
  var sendBtn = document.getElementById("chatSendBtn");
  var switcherBtn = document.getElementById("chatSwitcherBtn");
  var switcherDropdown = document.getElementById("chatSwitcherDropdown");
  var switcherLabel = document.getElementById("chatSwitcherLabel");
  var switcherOptions = document.querySelectorAll(".chat-switcher-option");
  if (!generalView || !personalView || !generalMessages) return;

  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base) {
    generalMessages.innerHTML = "<p class=\"chat-empty\">Не задан адрес API.</p>";
    return;
  }

  var myId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? "tg_" + tg.initDataUnsafe.user.id : null;

  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function linkTgUsernames(escapedText) {
    if (!escapedText) return "";
    return String(escapedText).replace(/@([a-zA-Z0-9_]{5,32})(?![a-zA-Z0-9_])/g, function (_, u) {
      return '<a href="https://t.me/' + escapeHtml(u) + '" class="chat-msg__tg-link">@' + escapeHtml(u) + '</a>';
    });
  }

  window.lastGeneralStats = "";
  window.lastListStats = "";
  window.lastConvStats = "";
  function updateChatHeaderStats() {
    var el = document.getElementById("chatHeaderStats");
    if (!el) return;
    var txt = "";
    if (chatActiveTab === "general") txt = window.lastGeneralStats || "";
    else if (chatActiveTab === "admins") txt = "Админы";
    else if (chatWithUserId && convView && !convView.classList.contains("chat-conv-view--hidden")) txt = window.lastConvStats || "";
    else txt = window.lastListStats || "";
    if (el.textContent !== txt) el.textContent = txt;
  }
  function closeSwitcherDropdown() {
    if (switcherDropdown) {
      switcherDropdown.classList.add("chat-switcher-dropdown--hidden");
      switcherDropdown.setAttribute("aria-hidden", "true");
    }
    if (switcherBtn) switcherBtn.setAttribute("aria-expanded", "false");
  }
  function setTab(tab) {
    chatActiveTab = tab;
    if (switcherLabel) {
      switcherLabel.textContent = tab === "general" ? "Чат клуба" : tab === "personal" ? "ЛС" : "Чат с админами";
    }
    closeSwitcherDropdown();
    generalView.style.display = tab === "general" ? "" : "none";
    personalView.classList.toggle("chat-personal-view--hidden", tab !== "personal");
    if (adminsView) adminsView.classList.toggle("chat-admins-view--hidden", tab !== "admins");
    if (tab === "general") { window.chatGeneralUnread = false; loadGeneral(); }
    else if (tab === "personal") {
      window.chatPersonalUnread = false;
      if (chatWithUserId) loadMessages();
      else loadContacts();
    }
    updateChatHeaderStats();
    updateUnreadDots();
  }

  var lastViewedGeneral = null;
  var lastViewedPersonal = {};
  var lastGeneralMessagesSig = null;
  var lastPersonalMessagesSig = null;
  function generalMessagesSignature(messages) {
    if (!messages || messages.length === 0) return "";
    var last = messages[messages.length - 1];
    var reactionsPart = messages.map(function (m) {
      var r = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
      return (m.id || "") + ":" + JSON.stringify(r);
    }).join(";");
    return messages.length + "-" + (last.id || "") + "-" + (last.time || "") + "-" + reactionsPart;
  }
  function updateUnreadDots() {
    var dot = document.getElementById("chatSwitcherDot");
    if (dot) dot.classList.toggle("chat-switcher-btn__dot--on", !!(window.chatGeneralUnread || window.chatPersonalUnread));
    updateChatNavDot();
  }
  window.chatGeneralUnread = false;
  window.chatPersonalUnread = false;

  var reactionPickerEl = document.getElementById("chatReactionPicker");
  var currentReactionPickerClose = null;
  function sendReaction(msgId, emoji, source, withId) {
    if (!msgId || !emoji || !initData) return;
    var body = { initData: initData, action: "reaction", messageId: msgId, emoji: emoji };
    if (source === "personal" && withId) body.with = withId;
    fetch(base + "/api/chat", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.ok) {
        if (source === "general") {
          lastGeneralMessagesSig = null;
          loadGeneral();
        } else {
          lastPersonalMessagesSig = null;
          loadMessages();
        }
      }
    });
  }
  function showReactionPicker(btn) {
    if (!reactionPickerEl) return;
    var rect = btn.getBoundingClientRect();
    reactionPickerEl.dataset.msgId = btn.dataset.msgId || "";
    reactionPickerEl.dataset.source = btn.dataset.source || "general";
    reactionPickerEl.dataset.with = btn.dataset.with || "";
    reactionPickerEl.style.left = rect.left + "px";
    reactionPickerEl.style.top = (rect.top - 44) + "px";
    reactionPickerEl.classList.remove("chat-reaction-picker--hidden");
    reactionPickerEl.setAttribute("aria-hidden", "false");
    function closePicker(ev) {
      if (ev && ev.target && ev.target.closest && ev.target.closest(".chat-reaction-picker")) return;
      reactionPickerEl.classList.add("chat-reaction-picker--hidden");
      reactionPickerEl.setAttribute("aria-hidden", "true");
      document.removeEventListener("click", closePicker);
      currentReactionPickerClose = null;
    }
    currentReactionPickerClose = closePicker;
    setTimeout(function () {
      document.addEventListener("click", closePicker);
    }, 0);
  }
  document.body.addEventListener("click", function (e) {
    var reactionBtn = e.target && e.target.closest ? e.target.closest(".chat-msg__reaction") : null;
    var addReactBtn = e.target && e.target.closest ? e.target.closest(".chat-msg__react-btn") : null;
    var pickerEmoji = e.target && e.target.closest ? e.target.closest(".chat-reaction-picker__emoji") : null;
    if (reactionBtn) {
      e.preventDefault();
      sendReaction(reactionBtn.dataset.msgId, reactionBtn.dataset.emoji, reactionBtn.dataset.source || "general", reactionBtn.dataset.with || "");
    } else if (addReactBtn) {
      e.preventDefault();
      showReactionPicker(addReactBtn);
    } else if (pickerEmoji) {
      e.preventDefault();
      e.stopPropagation();
      var msgId = reactionPickerEl && reactionPickerEl.dataset.msgId;
      var source = reactionPickerEl && reactionPickerEl.dataset.source;
      var withId = reactionPickerEl && reactionPickerEl.dataset.with;
      if (msgId && pickerEmoji.dataset.emoji) {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        sendReaction(msgId, pickerEmoji.dataset.emoji, source || "general", withId || "");
        if (currentReactionPickerClose) {
          currentReactionPickerClose();
        } else if (reactionPickerEl) {
          reactionPickerEl.classList.add("chat-reaction-picker--hidden");
          reactionPickerEl.setAttribute("aria-hidden", "true");
        }
      }
    }
  });

  function loadGeneral() {
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&mode=general";
    fetch(url).then(function (r) { return r.json().catch(function () { return { ok: false, error: "Ошибка ответа" }; }); }).then(function (data) {
      if (data && data.ok) {
        chatIsAdmin = !!data.isAdmin;
        var messages = data.messages || [];
        var latest = messages.length ? (messages[messages.length - 1].time || "") : "";
        var isChatViewActive = !!document.querySelector('[data-view="chat"].view--active');
        if (isChatViewActive && chatActiveTab === "general") {
          lastViewedGeneral = latest;
          window.chatGeneralUnread = false;
        } else if (latest && lastViewedGeneral !== null && latest > lastViewedGeneral) {
          window.chatGeneralUnread = true;
        } else {
          window.chatGeneralUnread = false;
        }
        var total = data.participantsCount != null ? data.participantsCount : "—";
        var online = data.onlineCount != null ? data.onlineCount : "—";
        window.lastGeneralStats = total + " уч · " + online + " онл";
        updateChatHeaderStats();
        if (isChatViewActive && chatActiveTab === "general" && !chatIsEditingMessage) {
          var sig = generalMessagesSignature(messages);
          if (sig !== lastGeneralMessagesSig) {
            lastGeneralMessagesSig = sig;
            renderGeneralMessages(messages);
          }
        }
        updateUnreadDots();
      } else if (chatActiveTab === "general" && generalMessages) {
        generalMessages.innerHTML = "<p class=\"chat-empty\">" + (data && data.error ? escapeHtml(data.error) : "Ошибка загрузки") + "</p>";
      }
    }).catch(function () { if (chatActiveTab === "general" && generalMessages) generalMessages.innerHTML = "<p class=\"chat-empty\">Ошибка сети</p>"; });
  }

  var generalReplyTo = null;
  var personalReplyTo = null;
  var generalImage = null;
  var personalImage = null;
  var generalVoice = null;
  var personalVoice = null;
  var chatCtxMsg = null;
  var chatCtxSource = null;

  function resizeImage(file, maxW, maxH, quality) {
    maxW = maxW || 800; maxH = maxH || 800; quality = quality || 0.8;
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.width, h = img.height;
        if (w > maxW || h > maxH) {
          if (w > h) { h = Math.round(h * maxW / w); w = maxW; } else { w = Math.round(w * maxH / h); h = maxH; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (!ctx) { resolve(url); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          var dataUrl = canvas.toDataURL("image/jpeg", quality);
          if (dataUrl.length > 250000) {
            resolve(canvas.toDataURL("image/jpeg", 0.6));
          } else resolve(dataUrl);
        } catch (e) { reject(e); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("Не удалось загрузить")); };
      img.src = url;
    });
  }

  function renderGeneralMessages(messages) {
    if (!messages || messages.length === 0) {
      generalMessages.innerHTML = '<p class="chat-empty">Нет сообщений. Напишите первым!</p>';
      return;
    }
    var html = messages.map(function (m) {
      var isOwn = myId && m.from === myId;
      var cls = isOwn ? "chat-msg chat-msg--own" : "chat-msg chat-msg--other";
      var dataAttrs = chatIsAdmin && !isOwn && m.id ? ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-from="' + escapeHtml(m.from || "") + '" data-msg-from-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"' : "";
      var time = m.time ? new Date(m.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
      var text = linkTgUsernames((m.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"));
      var imgBlock = m.image ? '<img class="chat-msg__image" src="' + escapeHtml(m.image) + '" alt="Картинка" loading="lazy" />' : "";
      var voiceBlock = m.voice ? '<audio class="chat-msg__voice" controls src="' + escapeHtml(m.voice) + '"></audio>' : "";
      var delBtn = chatIsAdmin && m.id && isOwn ? ' <button type="button" class="chat-msg__delete" data-msg-id="' + escapeHtml(m.id) + '" title="Удалить">✕</button>' : "";
      var editBtn = isOwn && m.id && !m.image && !m.voice ? ' <button type="button" class="chat-msg__edit" data-msg-id="' + escapeHtml(m.id) + '" data-msg-text="' + escapeHtml(String(m.text || "")) + '" title="Редактировать">✎</button>' : "";
      var blockBtn = "";
      var replyBlock = m.replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(m.replyTo.fromName || "Игрок") + ':</strong> ' + escapeHtml(String(m.replyTo.text || "").slice(0, 80)) + (String(m.replyTo.text || "").length > 80 ? "…" : "") + '</div>' : "";
      var adminBadge = m.fromAdmin ? '<span class="chat-msg__admin">(админ)</span>' : "";
      var editedBadge = m.edited ? '<span class="chat-msg__edited">(отредактировано)</span>' : "";
      var avatarEl = m.fromAvatar ? '<img class="chat-msg__avatar" src="' + escapeHtml(m.fromAvatar) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + (m.fromName || "И")[0] + '</span>';
      var nameStr = escapeHtml(m.fromName || "Игрок");
      var p21Str = m.fromP21Id ? escapeHtml(m.fromP21Id) : "\u2014";
      var nameWithP21 = nameStr + ' <span class="chat-msg__p21">P21_ID: ' + p21Str + "</span>";
      var nameEl = isOwn ? '<span class="chat-msg__name">' + nameWithP21 + '</span><span class="chat-msg__msg-actions">' + editBtn + delBtn + '</span>' : '<button type="button" class="chat-msg__name-btn" data-pm-id="' + escapeHtml(m.from) + '" data-pm-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '">' + nameWithP21 + '</button>';
      var textBlock = (text || imgBlock || voiceBlock) ? '<div class="chat-msg__text">' + imgBlock + voiceBlock + text + '</div>' : "";
      var reactionsHtml = "";
      if (m.id && m.reactions && typeof m.reactions === "object") {
        var pills = [];
        for (var em in m.reactions) {
          if (Object.prototype.hasOwnProperty.call(m.reactions, em) && Array.isArray(m.reactions[em]) && m.reactions[em].length > 0) {
            var count = m.reactions[em].length;
            var iReacted = myId && m.reactions[em].indexOf(myId) >= 0;
            pills.push('<button type="button" class="chat-msg__reaction ' + (iReacted ? 'chat-msg__reaction--mine' : '') + '" data-msg-id="' + escapeHtml(m.id) + '" data-emoji="' + escapeHtml(em) + '" data-source="general">' + escapeHtml(em) + ' <span class="chat-msg__reaction-count">' + count + '</span></button>');
          }
        }
        reactionsHtml = pills.join("");
      }
      var reactBtnHtml = m.id ? '<button type="button" class="chat-msg__react-btn" data-msg-id="' + escapeHtml(m.id) + '" data-source="general" title="Реакция">😊</button>' : "";
      var reactionsRow = m.id ? '<div class="chat-msg__reactions-wrap"><span class="chat-msg__reactions">' + reactionsHtml + '</span>' + reactBtnHtml + '</div>' : "";
      return '<div class="' + cls + '"' + dataAttrs + '><div class="chat-msg__row">' + avatarEl + '<div class="chat-msg__body"><div class="chat-msg__meta">' + nameEl + adminBadge + '</div>' + replyBlock + textBlock + '<div class="chat-msg__footer">' + '<span class="chat-msg__time">' + time + '</span>' + editedBadge + '</div>' + reactionsRow + '</div></div></div>';
    }).join("");
    var prevScrollTop = generalMessages.scrollTop;
    var prevScrollHeight = generalMessages.scrollHeight;
    var wasNearBottom = prevScrollHeight - prevScrollTop - generalMessages.clientHeight < 80;
    generalMessages.innerHTML = html;
    function restoreScroll() {
      var maxScroll = generalMessages.scrollHeight - generalMessages.clientHeight;
      if (wasNearBottom || maxScroll <= 0) {
        generalMessages.scrollTop = generalMessages.scrollHeight;
      } else {
        generalMessages.scrollTop = Math.min(prevScrollTop, Math.max(0, maxScroll));
      }
    }
    restoreScroll();
    requestAnimationFrame(function () { requestAnimationFrame(restoreScroll); });
    generalMessages.querySelectorAll(".chat-msg__name-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.pmId;
        var name = btn.dataset.pmName;
        if (id) {
          setTab("personal");
          showConv(id, name);
        }
      });
    });
    generalMessages.querySelectorAll(".chat-msg__delete").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.msgId;
        if (!id) return;
        fetch(base + "/api/chat", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, messageId: id }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) loadGeneral();
        });
      });
    });
    generalMessages.querySelectorAll(".chat-msg__edit").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var msgId = btn.dataset.msgId;
        var oldText = (btn.dataset.msgText || "").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (!msgId) return;
        var msgEl = btn.closest(".chat-msg");
        var textEl = msgEl && msgEl.querySelector(".chat-msg__text");
        if (!textEl) return;
        chatIsEditingMessage = true;
        var origHtml = textEl.innerHTML;
        textEl.innerHTML = '<div class="chat-msg__edit-form"><input type="text" class="chat-input chat-msg__edit-input" value="' + escapeHtml(oldText) + '" maxlength="500" /><div class="chat-msg__edit-actions"><button type="button" class="chat-msg__edit-save">Сохранить</button><button type="button" class="chat-msg__edit-cancel">Отмена</button></div></div>';
        var inputEl = textEl.querySelector(".chat-msg__edit-input");
        var saveBtn = textEl.querySelector(".chat-msg__edit-save");
        var cancelBtn = textEl.querySelector(".chat-msg__edit-cancel");
        if (inputEl) inputEl.focus();
        function closeEdit() { textEl.innerHTML = origHtml; chatIsEditingMessage = false; }
        saveBtn.addEventListener("click", function () {
          var newText = (inputEl.value || "").trim();
          if (!newText) return;
          fetch(base + "/api/chat", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: initData, action: "edit", messageId: msgId, text: newText }),
          }).then(function (r) { return r.json(); }).then(function (d) {
            chatIsEditingMessage = false;
            if (d && d.ok) loadGeneral();
            else if (tg && tg.showAlert) tg.showAlert((d && d.error) || "Ошибка");
          }).catch(function () { chatIsEditingMessage = false; });
        });
        cancelBtn.addEventListener("click", closeEdit);
      });
    });
    attachContextMenuForOthers(generalMessages, "general");
  }

  function attachContextMenuForOthers(container, source) {
    if (!chatIsAdmin) return;
    var ctxMenu = document.getElementById("chatContextMenu");
    var longPressTimer = null;
    var menuOpenedAt = 0;
    var ctxOpenedForEl = null;
    function showMenu(el, msg) {
      chatCtxMsg = msg;
      chatCtxSource = source;
      ctxOpenedForEl = el;
      if (!ctxMenu) return;
      var rect = el.getBoundingClientRect();
      ctxMenu.style.left = (rect.left + rect.width / 2 - 100) + "px";
      ctxMenu.style.top = Math.max(12, rect.top - 4) + "px";
      ctxMenu.classList.add("chat-ctx-menu--visible");
      ctxMenu.setAttribute("aria-hidden", "false");
      menuOpenedAt = Date.now();
    }
    function hideMenu() {
      if (ctxMenu) {
        ctxMenu.classList.remove("chat-ctx-menu--visible");
        ctxMenu.setAttribute("aria-hidden", "true");
      }
      chatCtxMsg = null;
      chatCtxSource = null;
      ctxOpenedForEl = null;
    }
    container.querySelectorAll(".chat-msg--other[data-msg-id]").forEach(function (el) {
      function onLongPress() {
        var textEl = el.querySelector(".chat-msg__text");
        var text = textEl ? (textEl.textContent || "").trim() : "";
        showMenu(el, {
          id: el.dataset.msgId,
          from: el.dataset.msgFrom,
          fromName: (el.dataset.msgFromName || "Игрок").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
          text: text,
        });
      }
      function startTimer(e) {
        if (longPressTimer) return;
        longPressTimer = setTimeout(function () {
          longPressTimer = null;
          onLongPress();
          if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
        }, 500);
      }
      function clearTimer() {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      }
      el.addEventListener("touchstart", startTimer, { passive: true });
      el.addEventListener("touchend", clearTimer);
      el.addEventListener("touchcancel", clearTimer);
      el.addEventListener("mousedown", startTimer);
      el.addEventListener("mouseup", clearTimer);
      el.addEventListener("mouseleave", clearTimer);
      el.addEventListener("contextmenu", function (e) {
        e.preventDefault();
        var textEl = el.querySelector(".chat-msg__text");
        var text = textEl ? (textEl.textContent || "").trim() : "";
        showMenu(el, {
          id: el.dataset.msgId,
          from: el.dataset.msgFrom,
          fromName: (el.dataset.msgFromName || "Игрок").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
          text: text,
        });
      });
    });
    if (ctxMenu && !ctxMenu.dataset.chatCtxBound) {
      ctxMenu.dataset.chatCtxBound = "1";
      function closeIfOutside(e) {
        if (!ctxMenu.classList.contains("chat-ctx-menu--visible")) return;
        if (ctxMenu.contains(e.target)) return;
        if (e.type === "touchend" && ctxOpenedForEl && (e.target === ctxOpenedForEl || ctxOpenedForEl.contains(e.target)))
          return;
        if (Date.now() - menuOpenedAt < 300) return;
        hideMenu();
      }
      document.addEventListener("click", closeIfOutside);
      document.addEventListener("touchend", closeIfOutside, { passive: true });
      function runAction(action) {
        var msg = chatCtxMsg;
        var src = chatCtxSource;
        hideMenu();
        if (!msg) return;
        if (action === "delete") {
            var delBody = { initData: initData, messageId: msg.id };
            if (src === "personal" && chatWithUserId) delBody.with = chatWithUserId;
            fetch(base + "/api/chat", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(delBody),
            }).then(function (r) { return r.json(); }).then(function (d) {
              if (d && d.ok) {
                if (src === "general") loadGeneral();
                else loadMessages();
              }
            });
          } else if (action === "block") {
            if (!msg.from) return;
            if (!confirm("Заблокировать " + (msg.fromName || "пользователя") + " в чате?")) return;
            fetch(base + "/api/chat", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ initData: initData, action: "block", userId: msg.from }),
            }).then(function (r) { return r.json(); }).then(function (d) {
              if (d && d.ok) loadGeneral();
            });
          } else if (action === "copy") {
            if (msg.text && navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(msg.text).then(function () {
                if (tg && tg.showAlert) tg.showAlert("Скопировано");
              });
            }
          } else if (action === "reply") {
            generalReplyTo = personalReplyTo = null;
            if (src === "general") {
              generalReplyTo = msg;
              var prev = document.getElementById("chatGeneralReplyPreview");
              if (prev) {
                prev.querySelector(".chat-reply-preview__text").textContent = "Ответ на " + (msg.fromName || "Игрок") + ": " + (msg.text || "").slice(0, 60) + (msg.text && msg.text.length > 60 ? "…" : "");
                prev.classList.add("chat-reply-preview--visible");
              }
              if (generalInput) generalInput.focus();
            } else {
              personalReplyTo = msg;
              var prevP = document.getElementById("chatPersonalReplyPreview");
              if (prevP) {
                prevP.querySelector(".chat-reply-preview__text").textContent = "Ответ на " + (msg.fromName || "Игрок") + ": " + (msg.text || "").slice(0, 60) + (msg.text && msg.text.length > 60 ? "…" : "");
                prevP.classList.add("chat-reply-preview--visible");
              }
              if (inputEl) inputEl.focus();
            }
          }
        }
      ctxMenu.querySelectorAll(".chat-ctx-menu__item").forEach(function (btn) {
        btn.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          runAction(btn.dataset.action);
        });
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
        });
      });
    }
  }

  var sendingGeneral = false;
  function sendGeneral() {
    var text = (generalInput && generalInput.value || "").trim();
    if ((!text && !generalImage && !generalVoice) || !initData || sendingGeneral) return;
    if (!initData) { if (tg && tg.showAlert) tg.showAlert("Откройте в Telegram."); return; }
    sendingGeneral = true;
    if (generalSendBtn) generalSendBtn.disabled = true;
    var body = { initData: initData, text: text };
    if (generalImage) body.image = generalImage;
    if (generalVoice) body.voice = generalVoice;
    if (generalReplyTo) body.replyTo = generalReplyTo;
    fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).then(function (data) {
      sendingGeneral = false;
      if (generalSendBtn) generalSendBtn.disabled = false;
      if (generalInput) generalInput.value = "";
      generalReplyTo = null;
      generalImage = null;
      generalVoice = null;
      var prevEl = document.getElementById("chatGeneralReplyPreview");
      if (prevEl) { prevEl.classList.remove("chat-reply-preview--visible"); prevEl.querySelector(".chat-reply-preview__text").textContent = ""; }
      var imgPrev = document.getElementById("chatGeneralImagePreview");
      if (imgPrev) { imgPrev.classList.remove("chat-image-preview--visible"); imgPrev.innerHTML = ""; }
      var voicePrev = document.getElementById("chatGeneralVoicePreview");
      if (voicePrev) voicePrev.classList.add("chat-voice-preview--hidden");
      if (data && data.ok) loadGeneral();
      else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
    }).catch(function () { sendingGeneral = false; if (generalSendBtn) generalSendBtn.disabled = false; });
  }

  function showList() {
    chatWithUserId = null;
    if (listView) listView.classList.remove("chat-list-view--hidden");
    if (convView) convView.classList.add("chat-conv-view--hidden");
    updateChatHeaderStats();
    loadContacts();
  }

  function showConv(userId, userName) {
    chatWithUserId = userId;
    chatWithUserName = userName || userId;
    personalReplyTo = null;
    personalImage = null;
    personalVoice = null;
    var prevP = document.getElementById("chatPersonalReplyPreview");
    if (prevP) { prevP.classList.remove("chat-reply-preview--visible"); prevP.querySelector(".chat-reply-preview__text").textContent = ""; }
    var imgP = document.getElementById("chatPersonalImagePreview");
    if (imgP) { imgP.classList.remove("chat-image-preview--visible"); imgP.innerHTML = ""; }
    var voicePrevP = document.getElementById("chatPersonalVoicePreview");
    if (voicePrevP) voicePrevP.classList.remove("chat-voice-preview--visible");
    if (listView) listView.classList.add("chat-list-view--hidden");
    if (convView) convView.classList.remove("chat-conv-view--hidden");
    if (convTitle) convTitle.textContent = userName || userId;
    updateChatHeaderStats();
    loadMessages();
  }

  function loadContacts() {
    if (!contactsEl) return;
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&mode=contacts";
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.ok && Array.isArray(data.contacts)) {
        chatIsAdmin = !!data.isAdmin;
        var total = data.participantsCount != null ? data.participantsCount : "—";
        var online = data.onlineCount != null ? data.onlineCount : "—";
        window.lastListStats = total + " конт · " + online + " онл";
        updateChatHeaderStats();
        if (data.contacts.length === 0) {
          contactsEl.innerHTML = '<p class="chat-empty">Пока нет личных переписок. Напишите кому-то по ID выше или дождитесь ответа.</p>';
        } else {
          contactsEl.innerHTML = data.contacts.map(function (c) {
            var dtSpan = c.dtId ? '<span class="chat-contact__dt">' + escapeHtml(c.dtId) + '</span>' : "";
            var avatarEl = c.avatar ? '<img class="chat-contact__avatar" src="' + escapeHtml(c.avatar) + '" alt="" />' : '<span class="chat-contact__avatar chat-contact__avatar--placeholder">' + (c.name || "?")[0] + '</span>';
            return '<button type="button" class="chat-contact" data-chat-id="' + escapeHtml(c.id) + '" data-chat-name="' + escapeHtml(c.name) + '">' + avatarEl + '<span class="chat-contact__main"><span class="chat-contact__name">' + escapeHtml(c.name) + '</span>' + dtSpan + '</span></button>';
          }).join("");
          contactsEl.querySelectorAll(".chat-contact").forEach(function (btn) {
            btn.addEventListener("click", function () { showConv(btn.dataset.chatId, btn.dataset.chatName); });
          });
        }
      }
    }).catch(function () { contactsEl.innerHTML = "<p class=\"chat-empty\">Ошибка</p>"; });
  }

  function renderMessages(messages) {
    if (!messagesEl) return;
    if (!messages || messages.length === 0) {
      messagesEl.innerHTML = '<p class="chat-empty">Нет сообщений.</p>';
      return;
    }
    var html = messages.map(function (m) {
      var isOwn = myId && m.from === myId;
      var cls = isOwn ? "chat-msg chat-msg--own" : "chat-msg chat-msg--other";
      var dataAttrs = chatIsAdmin && !isOwn && m.id ? ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-from="' + escapeHtml(m.from || "") + '" data-msg-from-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"' : "";
      var time = m.time ? new Date(m.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
      var text = linkTgUsernames((m.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"));
      var imgBlock = m.image ? '<img class="chat-msg__image" src="' + escapeHtml(m.image) + '" alt="Картинка" loading="lazy" />' : "";
      var voiceBlock = m.voice ? '<audio class="chat-msg__voice" controls src="' + escapeHtml(m.voice) + '"></audio>' : "";
      var delBtn = chatIsAdmin && m.id && isOwn ? ' <button type="button" class="chat-msg__delete" data-msg-id="' + escapeHtml(m.id) + '" title="Удалить">✕</button>' : "";
      var editBtn = isOwn && m.id && !m.image && !m.voice ? ' <button type="button" class="chat-msg__edit" data-msg-id="' + escapeHtml(m.id) + '" data-msg-text="' + escapeHtml(String(m.text || "")) + '" title="Редактировать">✎</button>' : "";
      var replyBlock = m.replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(m.replyTo.fromName || "Игрок") + ':</strong> ' + escapeHtml(String(m.replyTo.text || "").slice(0, 80)) + (String(m.replyTo.text || "").length > 80 ? "…" : "") + '</div>' : "";
      var adminBadge = m.fromAdmin ? '<span class="chat-msg__admin">(админ)</span>' : "";
      var editedBadge = m.edited ? '<span class="chat-msg__edited">(отредактировано)</span>' : "";
      var avatarEl = m.fromAvatar ? '<img class="chat-msg__avatar" src="' + escapeHtml(m.fromAvatar) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + (m.fromName || "И")[0] + '</span>';
      var nameStrP = escapeHtml(m.fromName || "Игрок");
      var p21StrP = m.fromP21Id ? escapeHtml(m.fromP21Id) : "\u2014";
      var nameWithP21P = nameStrP + ' <span class="chat-msg__p21">P21_ID: ' + p21StrP + "</span>";
      var textBlock = (text || imgBlock || voiceBlock) ? '<div class="chat-msg__text">' + imgBlock + voiceBlock + text + '</div>' : "";
      var reactionsHtmlP = "";
      if (m.id && m.reactions && typeof m.reactions === "object") {
        var pillsP = [];
        for (var emp in m.reactions) {
          if (Object.prototype.hasOwnProperty.call(m.reactions, emp) && Array.isArray(m.reactions[emp]) && m.reactions[emp].length > 0) {
            var countP = m.reactions[emp].length;
            var iReactedP = myId && m.reactions[emp].indexOf(myId) >= 0;
            pillsP.push('<button type="button" class="chat-msg__reaction ' + (iReactedP ? 'chat-msg__reaction--mine' : '') + '" data-msg-id="' + escapeHtml(m.id) + '" data-emoji="' + escapeHtml(emp) + '" data-source="personal" data-with="' + escapeHtml(chatWithUserId || "") + '">' + escapeHtml(emp) + ' <span class="chat-msg__reaction-count">' + countP + '</span></button>');
          }
        }
        reactionsHtmlP = pillsP.join("");
      }
      var reactBtnHtmlP = m.id ? '<button type="button" class="chat-msg__react-btn" data-msg-id="' + escapeHtml(m.id) + '" data-source="personal" data-with="' + escapeHtml(chatWithUserId || "") + '" title="Реакция">😊</button>' : "";
      var reactionsRowP = m.id ? '<div class="chat-msg__reactions-wrap"><span class="chat-msg__reactions">' + reactionsHtmlP + '</span>' + reactBtnHtmlP + '</div>' : "";
      var nameElP = isOwn ? '<span class="chat-msg__name">' + nameWithP21P + '</span><span class="chat-msg__msg-actions">' + editBtn + delBtn + '</span>' : '<span class="chat-msg__name">' + nameWithP21P + '</span>';
      return '<div class="' + cls + '"' + dataAttrs + '><div class="chat-msg__row">' + avatarEl + '<div class="chat-msg__body"><div class="chat-msg__meta">' + nameElP + adminBadge + '</div>' + replyBlock + textBlock + '<div class="chat-msg__footer">' + '<span class="chat-msg__time">' + time + '</span>' + editedBadge + '</div>' + reactionsRowP + '</div></div></div>';
    }).join("");
    var prevScrollTopP = messagesEl.scrollTop;
    var prevScrollHeightP = messagesEl.scrollHeight;
    var wasNearBottomP = prevScrollHeightP - prevScrollTopP - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = html;
    function restoreScrollP() {
      var maxScrollP = messagesEl.scrollHeight - messagesEl.clientHeight;
      if (wasNearBottomP || maxScrollP <= 0) {
        messagesEl.scrollTop = messagesEl.scrollHeight;
      } else {
        messagesEl.scrollTop = Math.min(prevScrollTopP, Math.max(0, maxScrollP));
      }
    }
    restoreScrollP();
    requestAnimationFrame(function () { requestAnimationFrame(restoreScrollP); });
    messagesEl.querySelectorAll(".chat-msg__delete").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.msgId;
        if (!id) return;
        fetch(base + "/api/chat", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, messageId: id, with: chatWithUserId }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) loadMessages();
        });
      });
    });
    messagesEl.querySelectorAll(".chat-msg__edit").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        var msgId = btn.dataset.msgId;
        var oldText = (btn.dataset.msgText || "").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
        if (!msgId) return;
        var msgEl = btn.closest(".chat-msg");
        var textEl = msgEl && msgEl.querySelector(".chat-msg__text");
        if (!textEl) return;
        chatIsEditingMessage = true;
        var origHtml = textEl.innerHTML;
        textEl.innerHTML = '<div class="chat-msg__edit-form"><input type="text" class="chat-input chat-msg__edit-input" value="' + escapeHtml(oldText) + '" maxlength="500" /><div class="chat-msg__edit-actions"><button type="button" class="chat-msg__edit-save">Сохранить</button><button type="button" class="chat-msg__edit-cancel">Отмена</button></div></div>';
        var inputEl = textEl.querySelector(".chat-msg__edit-input");
        var saveBtn = textEl.querySelector(".chat-msg__edit-save");
        var cancelBtn = textEl.querySelector(".chat-msg__edit-cancel");
        if (inputEl) inputEl.focus();
        function closeEdit() { textEl.innerHTML = origHtml; chatIsEditingMessage = false; }
        saveBtn.addEventListener("click", function () {
          var newText = (inputEl.value || "").trim();
          if (!newText) return;
          fetch(base + "/api/chat", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: initData, action: "edit", messageId: msgId, text: newText, with: chatWithUserId }),
          }).then(function (r) { return r.json(); }).then(function (d) {
            chatIsEditingMessage = false;
            if (d && d.ok) loadMessages();
            else if (tg && tg.showAlert) tg.showAlert((d && d.error) || "Ошибка");
          }).catch(function () { chatIsEditingMessage = false; });
        });
        cancelBtn.addEventListener("click", closeEdit);
      });
    });
    attachContextMenuForOthers(messagesEl, "personal");
  }

  function loadMessages() {
    if (!chatWithUserId || !messagesEl) return;
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&with=" + encodeURIComponent(chatWithUserId);
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.ok) {
        if (data.isAdmin !== undefined) chatIsAdmin = !!data.isAdmin;
        var messages = data.messages || [];
        var pt = data.participantsCount != null ? data.participantsCount : "—";
        var ol = data.onlineCount != null ? data.onlineCount : "—";
        window.lastConvStats = pt + " уч · " + ol + " онл";
        updateChatHeaderStats();
        var latest = messages.length ? (messages[messages.length - 1].time || "") : "";
        var isChatViewActive = !!document.querySelector('[data-view="chat"].view--active');
        if (isChatViewActive && chatActiveTab === "personal" && convView && !convView.classList.contains("chat-conv-view--hidden")) {
          lastViewedPersonal[chatWithUserId] = latest;
          window.chatPersonalUnread = false;
        } else if (latest && chatWithUserId && lastViewedPersonal[chatWithUserId] && latest > lastViewedPersonal[chatWithUserId]) {
          window.chatPersonalUnread = true;
        }
        if (Array.isArray(messages) && !chatIsEditingMessage) {
          var reactionsPartP = messages.map(function (m) {
            var r = m.reactions && typeof m.reactions === "object" ? m.reactions : {};
            return (m.id || "") + ":" + JSON.stringify(r);
          }).join(";");
          var sig = (chatWithUserId || "") + "-" + (messages.length) + "-" + (messages.length ? (messages[messages.length - 1].id || "") + "-" + (messages[messages.length - 1].time || "") : "") + "-" + reactionsPartP;
          if (sig !== lastPersonalMessagesSig) {
            lastPersonalMessagesSig = sig;
            renderMessages(messages);
          }
        }
        updateUnreadDots();
      }
    });
  }

  var sendingPrivate = false;
  function sendMessage() {
    var text = (inputEl && inputEl.value || "").trim();
    if ((!text && !personalImage && !personalVoice) || !chatWithUserId || !initData || sendingPrivate) return;
    sendingPrivate = true;
    if (sendBtn) sendBtn.disabled = true;
    var body = { initData: initData, with: chatWithUserId, text: text };
    if (personalImage) body.image = personalImage;
    if (personalVoice) body.voice = personalVoice;
    if (personalReplyTo) body.replyTo = personalReplyTo;
    fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).then(function (data) {
      sendingPrivate = false;
      if (sendBtn) sendBtn.disabled = false;
      if (inputEl) inputEl.value = "";
      personalReplyTo = null;
      personalImage = null;
      personalVoice = null;
      var prevEl = document.getElementById("chatPersonalReplyPreview");
      if (prevEl) { prevEl.classList.remove("chat-reply-preview--visible"); prevEl.querySelector(".chat-reply-preview__text").textContent = ""; }
      var imgPrev = document.getElementById("chatPersonalImagePreview");
      if (imgPrev) { imgPrev.classList.remove("chat-image-preview--visible"); imgPrev.innerHTML = ""; }
      var voicePrevP = document.getElementById("chatPersonalVoicePreview");
      if (voicePrevP) voicePrevP.classList.add("chat-voice-preview--hidden");
      if (data && data.ok) loadMessages();
      else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
    }).catch(function () { sendingPrivate = false; if (sendBtn) sendBtn.disabled = false; });
  }

  if (!chatListenersAttached) {
    chatListenersAttached = true;
    if (switcherBtn && switcherDropdown) {
      switcherBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        switcherDropdown.classList.toggle("chat-switcher-dropdown--hidden");
        var isOpen = !switcherDropdown.classList.contains("chat-switcher-dropdown--hidden");
        switcherBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
        switcherDropdown.setAttribute("aria-hidden", isOpen ? "false" : "true");
      });
      document.addEventListener("click", function (e) {
        if (e.target && e.target.closest && e.target.closest(".chat-switcher-wrap")) return;
        closeSwitcherDropdown();
      });
      document.addEventListener("touchend", function (e) {
        if (e.target && e.target.closest && e.target.closest(".chat-switcher-wrap")) return;
        closeSwitcherDropdown();
      }, { passive: true });
    }
    switcherOptions.forEach(function (opt) {
      opt.addEventListener("click", function () { setTab(opt.dataset.chatTab); });
    });
    document.querySelectorAll(".chat-manager-btn--tg").forEach(function (link) {
      link.addEventListener("click", function (e) {
        var href = link.getAttribute("href");
        if (href && href.startsWith("tg://") && tg && tg.openTelegramLink) {
          e.preventDefault();
          tg.openTelegramLink(href);
        }
      });
    });
    document.querySelectorAll(".chat-manager-btn[data-chat-user-id]").forEach(function (btn) {
        btn.addEventListener("click", function () {
        var raw = (btn.dataset.chatUserId || "").trim();
        var userName = btn.dataset.chatUserName || "Менеджер";
        if (!raw) {
          if (tg && tg.showAlert) tg.showAlert("Укажите data-chat-user-id (ID приложения или Telegram ID)");
          return;
        }
        function doShow(tgUserId) {
          setTab("personal");
          showConv(tgUserId, userName);
        }
        if (raw.startsWith("tg_")) {
          doShow(raw);
        } else if (/^ID\d{6}$/.test(raw.toUpperCase())) {
          var id = raw.toUpperCase();
          fetch(base + "/api/users?id=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData))
            .then(function (r) { return r.json(); })
            .then(function (data) {
              if (data && data.ok && data.userId) doShow(data.userId);
              else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Не найдено");
            })
            .catch(function () { if (tg && tg.showAlert) tg.showAlert("Ошибка сети"); });
        } else {
          doShow("tg_" + raw);
        }
      });
    });
    if (backBtn) backBtn.addEventListener("click", showList);
    if (findByIdBtn && findByIdInput) {
      function findByIdAndOpen() {
        var raw = (findByIdInput.value || "").trim().toUpperCase();
        var id = raw.startsWith("ID") ? raw : "ID" + raw;
        if (id.length !== 8 || !/^ID\d{6}$/.test(id)) {
          if (tg && tg.showAlert) tg.showAlert("Введите ID в формате ID123456");
          return;
        }
        findByIdBtn.disabled = true;
        fetch(base + "/api/users?id=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData))
          .then(function (r) { return r.json(); })
          .then(function (data) {
            findByIdBtn.disabled = false;
            findByIdInput.value = "";
            if (data && data.ok && data.userId) {
              showConv(data.userId, data.userName || data.userId);
            } else {
              if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Не найдено");
            }
          })
          .catch(function () {
            findByIdBtn.disabled = false;
            if (tg && tg.showAlert) tg.showAlert("Ошибка сети");
          });
      }
      findByIdBtn.addEventListener("click", findByIdAndOpen);
      if (findByIdInput) findByIdInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); findByIdAndOpen(); }
      });
    }
    var generalFileInput = document.getElementById("chatGeneralFileInput");
    var generalAttachBtn = document.getElementById("chatGeneralAttachBtn");
    var generalImagePreview = document.getElementById("chatGeneralImagePreview");
    if (generalAttachBtn && generalFileInput) {
      generalAttachBtn.addEventListener("click", function () { generalFileInput.click(); });
      generalFileInput.addEventListener("change", function () {
        var f = generalFileInput.files && generalFileInput.files[0];
        if (!f || !f.type.startsWith("image/")) return;
        resizeImage(f).then(function (dataUrl) {
          generalImage = dataUrl;
          if (generalImagePreview) {
            generalImagePreview.innerHTML = '<img class="chat-image-preview__thumb" src="' + dataUrl.replace(/"/g, "&quot;") + '" alt="" /><button type="button" class="chat-image-preview__remove">Убрать</button>';
            generalImagePreview.classList.add("chat-image-preview--visible");
            generalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
              generalImage = null; generalFileInput.value = "";
              generalImagePreview.classList.remove("chat-image-preview--visible"); generalImagePreview.innerHTML = "";
            });
          }
        }).catch(function () { if (tg && tg.showAlert) tg.showAlert("Не удалось обработать изображение"); });
        generalFileInput.value = "";
      });
    }
    var generalVoiceBtn = document.getElementById("chatGeneralVoiceBtn");
    var generalVoiceRemove = document.getElementById("chatGeneralVoiceRemove");
    var generalVoicePreviewEl = document.getElementById("chatGeneralVoicePreview");
    (function initVoiceRecording() {
      var voiceTarget = null;
      var voiceStream = null;
      var voiceChunks = [];
      var voiceRecorder = null;
      function stopAndDiscard() {
        voiceTarget = null;
        if (voiceRecorder && voiceRecorder.state !== "inactive") voiceRecorder.stop();
        voiceRecorder = null;
        if (voiceStream) {
          voiceStream.getTracks().forEach(function (t) { t.stop(); });
          voiceStream = null;
        }
        voiceChunks = [];
      }
      function startRecording(target) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (tg && tg.showAlert) tg.showAlert("Микрофон не поддерживается");
          return;
        }
        voiceTarget = target;
        if (target === "general" && generalVoiceBtn) {
          generalVoiceBtn.classList.add("chat-voice-btn--recording");
          generalVoiceBtn.title = "Остановить запись";
          if (generalVoicePreviewEl) {
            generalVoicePreviewEl.classList.remove("chat-voice-preview--hidden");
            generalVoicePreviewEl.classList.add("chat-voice-preview--recording");
          }
        }
        if (target === "personal") {
          var pvb = document.getElementById("chatPersonalVoiceBtn");
          if (pvb) { pvb.classList.add("chat-voice-btn--recording"); pvb.title = "Остановить запись"; }
          var pvPrev = document.getElementById("chatPersonalVoicePreview");
          if (pvPrev) {
            pvPrev.classList.remove("chat-voice-preview--hidden");
            pvPrev.classList.add("chat-voice-preview--recording");
          }
        }
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          if (voiceTarget !== target) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            return;
          }
          voiceStream = stream;
          voiceChunks = [];
          var opts = { audioBitsPerSecond: 64000 };
          try {
            voiceRecorder = new MediaRecorder(stream, opts);
          } catch (e) {
            voiceRecorder = new MediaRecorder(stream);
          }
          var savedTarget = target;
          voiceRecorder.ondataavailable = function (e) { if (e.data && e.data.size > 0) voiceChunks.push(e.data); };
          voiceRecorder.onstop = function () {
            var mime = (voiceRecorder && voiceRecorder.mimeType) ? voiceRecorder.mimeType : "audio/webm";
            voiceRecorder = null;
            if (voiceStream) {
              voiceStream.getTracks().forEach(function (t) { t.stop(); });
              voiceStream = null;
            }
            if (voiceChunks.length === 0) {
              if (savedTarget === "general" && generalVoicePreviewEl) {
                generalVoicePreviewEl.classList.remove("chat-voice-preview--recording");
                generalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
              }
              if (savedTarget === "personal") {
                var pvH = document.getElementById("chatPersonalVoicePreview");
                if (pvH) { pvH.classList.remove("chat-voice-preview--recording"); pvH.classList.add("chat-voice-preview--hidden"); }
              }
              voiceTarget = null;
              return;
            }
            var blob = new Blob(voiceChunks, { type: mime });
            voiceChunks = [];
            var reader = new FileReader();
            reader.onloadend = function () {
              var dataUrl = reader.result;
              if (savedTarget === "general") {
                generalVoice = dataUrl;
                if (generalVoicePreviewEl) {
                  generalVoicePreviewEl.classList.remove("chat-voice-preview--recording");
                  generalVoicePreviewEl.classList.remove("chat-voice-preview--hidden");
                }
              } else if (savedTarget === "personal") {
                personalVoice = dataUrl;
                var pv = document.getElementById("chatPersonalVoicePreview");
                if (pv) {
                  pv.classList.remove("chat-voice-preview--recording");
                  pv.classList.remove("chat-voice-preview--hidden");
                }
              }
              voiceTarget = null;
            };
            reader.readAsDataURL(blob);
          };
          voiceRecorder.start(1000);
        }).catch(function () {
          voiceTarget = null;
          if (generalVoiceBtn && target === "general") { generalVoiceBtn.classList.remove("chat-voice-btn--recording"); generalVoiceBtn.title = "Голосовое сообщение"; if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); } }
          if (target === "personal") {
            var pvb = document.getElementById("chatPersonalVoiceBtn");
            if (pvb) { pvb.classList.remove("chat-voice-btn--recording"); pvb.title = "Голосовое сообщение"; }
            var pvErr = document.getElementById("chatPersonalVoicePreview");
            if (pvErr) { pvErr.classList.remove("chat-voice-preview--recording"); pvErr.classList.add("chat-voice-preview--hidden"); }
          }
          if (tg && tg.showAlert) tg.showAlert("Нет доступа к микрофону");
        });
      }
      if (generalVoiceBtn) {
        generalVoiceBtn.addEventListener("click", function (e) {
          e.preventDefault();
          if (voiceTarget === "general") {
            if (voiceRecorder) {
              try {
                if (voiceRecorder.state === "recording" && voiceRecorder.requestData) voiceRecorder.requestData();
                voiceRecorder.stop();
              } catch (err) {}
            } else {
              voiceTarget = null;
              if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); }
            }
            generalVoiceBtn.classList.remove("chat-voice-btn--recording");
            generalVoiceBtn.title = "Голосовое сообщение";
          } else if (voiceTarget === "personal") {
            stopAndDiscard();
            var pvbEl = document.getElementById("chatPersonalVoiceBtn");
            if (pvbEl) pvbEl.classList.remove("chat-voice-btn--recording");
            var pvPrev = document.getElementById("chatPersonalVoicePreview");
            if (pvPrev) { pvPrev.classList.remove("chat-voice-preview--recording"); pvPrev.classList.add("chat-voice-preview--hidden"); }
            startRecording("general");
          } else {
            startRecording("general");
          }
        });
      }
      if (generalVoiceRemove && generalVoicePreviewEl) {
        generalVoiceRemove.addEventListener("click", function () {
          generalVoice = null;
          generalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
        });
      }
      var personalVoiceBtn = document.getElementById("chatPersonalVoiceBtn");
      var personalVoiceRemove = document.getElementById("chatPersonalVoiceRemove");
      var personalVoicePreviewEl = document.getElementById("chatPersonalVoicePreview");
      if (personalVoiceBtn) {
        personalVoiceBtn.addEventListener("click", function (e) {
          e.preventDefault();
          if (voiceTarget === "personal") {
            if (voiceRecorder) {
              try {
                if (voiceRecorder.state === "recording" && voiceRecorder.requestData) voiceRecorder.requestData();
                voiceRecorder.stop();
              } catch (err) {}
            } else {
              voiceTarget = null;
              var pvPrev = document.getElementById("chatPersonalVoicePreview");
              if (pvPrev) { pvPrev.classList.remove("chat-voice-preview--recording"); pvPrev.classList.add("chat-voice-preview--hidden"); }
            }
            personalVoiceBtn.classList.remove("chat-voice-btn--recording");
            personalVoiceBtn.title = "Голосовое сообщение";
          } else if (voiceTarget === "general") {
            stopAndDiscard();
            if (generalVoiceBtn) generalVoiceBtn.classList.remove("chat-voice-btn--recording");
            if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); }
            startRecording("personal");
          } else {
            startRecording("personal");
          }
        });
      }
      if (personalVoiceRemove && personalVoicePreviewEl) {
        personalVoiceRemove.addEventListener("click", function () {
          personalVoice = null;
          personalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
        });
      }
    })();
    function resizeChatTextarea(ta) {
      if (!ta || ta.nodeName !== "TEXTAREA") return;
      ta.style.height = "auto";
      var max = 140;
      var h = Math.min(ta.scrollHeight, max);
      ta.style.height = h + "px";
    }
    if (generalInput) {
      generalInput.addEventListener("input", function () { resizeChatTextarea(generalInput); });
      generalInput.addEventListener("focus", function () { resizeChatTextarea(generalInput); });
      resizeChatTextarea(generalInput);
    }
    if (generalSendBtn) generalSendBtn.addEventListener("click", sendGeneral);
    var generalReplyCancel = document.querySelector("#chatGeneralReplyPreview .chat-reply-preview__cancel");
    if (generalReplyCancel) generalReplyCancel.addEventListener("click", function () {
      generalReplyTo = null;
      var p = document.getElementById("chatGeneralReplyPreview");
      if (p) { p.classList.remove("chat-reply-preview--visible"); p.querySelector(".chat-reply-preview__text").textContent = ""; }
    });
    var personalFileInput = document.getElementById("chatPersonalFileInput");
    var personalAttachBtn = document.getElementById("chatPersonalAttachBtn");
    var personalImagePreview = document.getElementById("chatPersonalImagePreview");
    if (personalAttachBtn && personalFileInput) {
      personalAttachBtn.addEventListener("click", function () { personalFileInput.click(); });
      personalFileInput.addEventListener("change", function () {
        var f = personalFileInput.files && personalFileInput.files[0];
        if (!f || !f.type.startsWith("image/")) return;
        resizeImage(f).then(function (dataUrl) {
          personalImage = dataUrl;
          if (personalImagePreview) {
            personalImagePreview.innerHTML = '<img class="chat-image-preview__thumb" src="' + dataUrl.replace(/"/g, "&quot;") + '" alt="" /><button type="button" class="chat-image-preview__remove">Убрать</button>';
            personalImagePreview.classList.add("chat-image-preview--visible");
            personalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
              personalImage = null; personalFileInput.value = "";
              personalImagePreview.classList.remove("chat-image-preview--visible"); personalImagePreview.innerHTML = "";
            });
          }
        }).catch(function () { if (tg && tg.showAlert) tg.showAlert("Не удалось обработать изображение"); });
        personalFileInput.value = "";
      });
    }
    if (sendBtn) sendBtn.addEventListener("click", sendMessage);
    if (inputEl) {
      inputEl.addEventListener("input", function () { resizeChatTextarea(inputEl); });
      inputEl.addEventListener("focus", function () { resizeChatTextarea(inputEl); });
      resizeChatTextarea(inputEl);
    }
    var personalReplyCancel = document.querySelector("#chatPersonalReplyPreview .chat-reply-preview__cancel");
    if (personalReplyCancel) personalReplyCancel.addEventListener("click", function () {
      personalReplyTo = null;
      var p = document.getElementById("chatPersonalReplyPreview");
      if (p) { p.classList.remove("chat-reply-preview--visible"); p.querySelector(".chat-reply-preview__text").textContent = ""; }
    });
  }

  setTab(chatActiveTab);
  if (chatWithUserId) showConv(chatWithUserId, chatWithUserName);
  else showList();

  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(function () {
    loadGeneral();
    if (chatWithUserId) loadMessages();
    else if (chatActiveTab === "personal") loadContacts();
  }, 60000);
}

function isLocalEnv() {
  if (typeof window === "undefined" || !window.location) return true;
  const hostname = window.location.hostname || "";
  const protocol = window.location.protocol || "";
  if (protocol === "file:") return true;
  if (!hostname) return true;
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") return true;
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname)) return true;
  return false;
}

function getApiBase() {
  const app = document.getElementById("app");
  const dataBase = app && app.getAttribute("data-api-base");
  if (dataBase && dataBase.trim()) return dataBase.trim().replace(/\/$/, "");
  if (typeof window !== "undefined" && window.location && window.location.origin) return window.location.origin;
  return "";
}

function updateVisitorCounter() {
  const elTotal = document.getElementById("visitorTotal");
  const elUnique = document.getElementById("visitorUnique");
  const elReturning = document.getElementById("visitorReturning");
  if (!elUnique || !elReturning) return;

  const setDash = function () {
    if (elTotal) elTotal.textContent = "—";
    elUnique.textContent = "—";
    elReturning.textContent = "—";
  };

  const base = getApiBase();
  const isLocal = isLocalEnv();
  if (isLocal && !(document.getElementById("app") && document.getElementById("app").getAttribute("data-api-base"))) {
    setDash();
    return;
  }

  if (!base) {
    setDash();
    return;
  }

  const visitorId = getVisitorId();
  const apiUrl = base + "/api/visit?visitor_id=" + encodeURIComponent(visitorId);
  const initData = tg && tg.initData ? tg.initData : null;
  const fetchOpts = initData
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData: initData }) }
    : { method: "GET" };

  function doFetch(retryCount) {
    fetch(apiUrl, fetchOpts)
      .then(function (res) {
        if (!res.ok) return Promise.reject(new Error("visit api " + res.status));
        return res.json();
      })
      .then(function (data) {
        applyVisitorCounts(data, elTotal, elUnique, elReturning);
        if (data && data.dtId) sessionStorage.setItem("poker_dt_id", data.dtId);
        if (data && data.ok === false) fetchVisitorStatsOnly();
      })
      .catch(function () {
        setDash();
        if (retryCount > 0) {
          setTimeout(function () { doFetch(retryCount - 1); }, 1500);
        } else {
          fetchVisitorStatsOnly();
          setTimeout(updateVisitorCounter, 5000);
        }
      });
  }
  doFetch(1);
}

function applyVisitorCounts(data, elTotal, elUnique, elReturning) {
  if (data && data.ok === false) {
    if (elTotal) elTotal.textContent = "—";
    elUnique.textContent = "—";
    elReturning.textContent = "—";
    return;
  }
  if (data && typeof data.unique === "number" && typeof data.returning === "number") {
    if (elTotal) elTotal.textContent = typeof data.total === "number" ? data.total : data.unique + data.returning;
    elUnique.textContent = String(data.unique);
    elReturning.textContent = String(data.returning);
  } else {
    if (elTotal) elTotal.textContent = "—";
    elUnique.textContent = "—";
    elReturning.textContent = "—";
  }
}

function fetchVisitorStatsOnly() {
  const elTotal = document.getElementById("visitorTotal");
  const elUnique = document.getElementById("visitorUnique");
  const elReturning = document.getElementById("visitorReturning");
  if (!elUnique || !elReturning) return;
  const setDash = function () {
    if (elTotal) elTotal.textContent = "—";
    elUnique.textContent = "—";
    elReturning.textContent = "—";
  };
  const base = getApiBase();
  const isLocal = isLocalEnv();
  if (isLocal && !(document.getElementById("app") && document.getElementById("app").getAttribute("data-api-base"))) {
    setDash();
    return;
  }
  if (!base) {
    setDash();
    return;
  }
  fetch(base + "/api/visit?stats=1")
    .then(function (res) {
      if (!res.ok) return Promise.reject(new Error("stats " + res.status));
      return res.json();
    })
    .then((data) => applyVisitorCounts(data, elTotal, elUnique, elReturning))
    .catch(function () {
      setDash();
    });
}

updateVisitorCounter();

// Депозит: показывать только менеджера, который сейчас в смене (по МСК)
// Анна: 06:00–18:00 мск, Вика: 18:00–02:00 мск
function getMskHour() {
  const now = new Date();
  const msk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  return msk.getHours();
}

function updateCashoutManager() {
  const hour = getMskHour();
  const isAnna = hour >= 6 && hour < 18;
  const activeManager = isAnna ? "anna" : "vika";

  const blocks = document.querySelectorAll(".cashout-manager-block");
  const subtitle = document.querySelector(".cashout-now-subtitle");

  blocks.forEach((block) => {
    if (block.dataset.manager === activeManager) {
      block.classList.remove("cashout-manager-block--hidden");
    } else {
      block.classList.add("cashout-manager-block--hidden");
    }
  });

  if (subtitle) {
    subtitle.textContent = isAnna
      ? "Сейчас на связи: Анна (06:00–18:00 мск)"
      : "Сейчас на связи: Вика (18:00–02:00 мск)";
  }
}

updateCashoutManager();
setInterval(updateCashoutManager, 60000);
числ
if (typeof initChat === "function") initChat();

(function initUpdatesBlock() {
  var updates = (typeof window !== "undefined" && window.APP_UPDATES) || [];
  var listEl = document.getElementById("updatesList");
  var footerEl = document.getElementById("updatesFooter");
  var ellipsisEl = document.getElementById("updatesEllipsis");
  var toggleBtn = document.getElementById("updatesToggle");
  var blockEl = document.getElementById("updatesBlock");
  if (!listEl || !footerEl || updates.length === 0) {
    if (blockEl) blockEl.style.display = "none";
    return;
  }
  var VISIBLE_COUNT = 2;
  var expanded = false;
  function escapeHtml(s) {
    if (!s) return "";
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function render() {
    var visible = expanded ? updates : updates.slice(0, VISIBLE_COUNT);
    listEl.innerHTML = visible.map(function (u) {
      return '<li class="updates-block__item"><span class="updates-block__date">' + escapeHtml(u.date) + '</span> ' + escapeHtml(u.text) + '</li>';
    }).join("");
    if (updates.length <= VISIBLE_COUNT) {
      footerEl.style.display = "none";
    } else {
      footerEl.style.display = "";
      ellipsisEl.style.display = expanded ? "none" : "";
      toggleBtn.textContent = expanded ? "Свернуть" : "Показать все";
    }
  }
  render();
  if (toggleBtn) {
    toggleBtn.addEventListener("click", function () {
      expanded = !expanded;
      render();
    });
  }
})();

п