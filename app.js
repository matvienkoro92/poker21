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
      userEl.textContent = user.first_name ? "Привет, " + user.first_name + "!" : "Вы вошли";
      userEl.classList.remove("auth-user--hidden");
    }
    if (banner) banner.classList.add("auth-banner--hidden");
  }

  function showUnauthorized() {
    if (userEl) userEl.classList.add("auth-user--hidden");
    if (banner) banner.classList.remove("auth-banner--hidden");
  }

  // Нет Telegram — показываем баннер «Откройте в Telegram»
  if (!tg) {
    showUnauthorized();
    return;
  }

  // Открыто из Telegram: сразу показываем пользователя авторизованным по данным от Telegram
  var userFromTelegram = tg.initDataUnsafe && tg.initDataUnsafe.user;
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
const navItems = document.querySelectorAll("[data-view-target]");
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
    } else {
      footer.classList.add("card__footer--hidden");
    }
  }
  if (viewName === "profile") updateProfileUserName();
  if (viewName === "bonus-game") initBonusGame();
  if (viewName === "cooler-game") initCoolerGame();
  if (viewName === "plasterer-game") initPlastererGame();
}

function updateProfileUserName() {
  var el = document.getElementById("profileUserName");
  if (!el) return;
  var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  el.textContent = user && user.first_name ? user.first_name : "гость";
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

// Турнир дня: развернуть/свернуть
document.addEventListener("click", function (e) {
  var toggle = e.target.closest(".js-tournament-day-toggle");
  if (!toggle) return;
  e.preventDefault();
  var wrap = toggle.closest(".tournament-day-wrap");
  var expanded = document.getElementById("tournamentDayExpanded");
  if (!wrap || !expanded) return;
  var isExpanded = expanded.hidden === false;
  expanded.hidden = isExpanded;
  toggle.setAttribute("aria-expanded", !isExpanded);
  wrap.classList.toggle("tournament-day-wrap--expanded", !isExpanded);
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

var PIKHANINA_DEFAULT_MAX = 5;

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
  fetch(base + "/api/pikhanina-stats", { method: "GET" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      if (data && typeof data.remaining === "number") {
        countEl.textContent = String(data.remaining);
        if (allDoneEl) allDoneEl.style.display = data.remaining === 0 ? "block" : "none";
      } else {
        countEl.textContent = String(PIKHANINA_DEFAULT_MAX);
        if (allDoneEl) allDoneEl.style.display = "none";
      }
    })
    .catch(function () {
      countEl.textContent = String(PIKHANINA_DEFAULT_MAX);
      if (allDoneEl) allDoneEl.style.display = "none";
    });
}

function notifyBonusWon(promoCode) {
  const base = getApiBase();
  if (!base) return;
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const initData = tg && tg.initData ? tg.initData : "";
  if (!initData) return;
  fetch(base + "/api/bonus-won", {
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
      fetch(base + "/api/pikhanina-stats", { method: "GET" })
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

// Счётчик уникальных и повторных посетителей
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
  let id = localStorage.getItem("poker_visitor_id");
  if (!id) {
    id = "w_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
    localStorage.setItem("poker_visitor_id", id);
  }
  return id;
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

  function doFetch(retryCount) {
    fetch(apiUrl)
      .then(function (res) {
        if (!res.ok) return Promise.reject(new Error("visit api " + res.status));
        return res.json();
      })
      .then(function (data) {
        applyVisitorCounts(data, elTotal, elUnique, elReturning);
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
  fetch(base + "/api/visit/stats")
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

// Турнир дня: дата и день недели в скобках
(function initTournamentDayDate() {
  const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  const dayOfWeek = days[d.getDay()];
  const dateStr = day + "." + month + "." + year + " (" + dayOfWeek + ")";
  const isoStr = year + "-" + month + "-" + day;
  const elTournament = document.getElementById("tournamentDayDate");
  if (elTournament) {
    elTournament.textContent = dateStr;
    elTournament.setAttribute("datetime", isoStr);
  }
})();

// Таймер до турнира: понедельник 3:47 по Бали (Asia/Makassar, UTC+8)
(function initTournamentCountdown() {
  var el1 = document.getElementById("tournamentDayTimer");
  var el2 = document.getElementById("tournamentDayTimerExpanded");
  if (!el1 && !el2) return;

  function getNextTournamentMs() {
    var now = new Date();
    var utc = now.getTime() + now.getTimezoneOffset() * 60000;
    var baliOffset = 8 * 60;
    var baliNow = new Date(utc + baliOffset * 60000);
    var baliDow = baliNow.getUTCDay();
    var baliHour = baliNow.getUTCHours();
    var baliMin = baliNow.getUTCMinutes();
    var baliMinOfDay = baliHour * 60 + baliMin;
    var targetMinOfDay = 3 * 60 + 47;
    var daysUntilMonday = baliDow === 1 ? (baliMinOfDay >= targetMinOfDay ? 7 : 0) : (8 - baliDow) % 7;
    if (daysUntilMonday === 0 && baliMinOfDay >= targetMinOfDay) daysUntilMonday = 7;
    var targetBali = new Date(baliNow);
    targetBali.setUTCDate(targetBali.getUTCDate() + daysUntilMonday);
    targetBali.setUTCHours(3, 47, 0, 0);
    var targetUtc = new Date(targetBali.getTime() - baliOffset * 60000);
    return targetUtc.getTime() - now.getTime();
  }

  function format(ms) {
    if (ms <= 0) return "Старт!";
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60), d = Math.floor(h / 24);
    if (d > 0) return d + " д " + (h % 24) + " ч " + (m % 60) + " мин";
    if (h > 0) return h + " ч " + (m % 60) + " мин " + (s % 60) + " сек";
    if (m > 0) return m + " мин " + (s % 60) + " сек";
    return s + " сек";
  }

  var hasTriggered10min = false;
  var hasTriggered1h = false;

  function tick() {
    var ms = getNextTournamentMs();
    var txt = "⏱ " + format(ms) + " до старта";
    if (el1) el1.textContent = txt;
    if (el2) el2.textContent = txt;

    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    var initData = tg && tg.initData ? tg.initData : "";
    var base = typeof getApiBase === "function" ? getApiBase() : "";

    if (!hasTriggered1h && ms > 0 && ms <= 60 * 60 * 1000) {
      hasTriggered1h = true;
      if (initData && base) {
        fetch(base + "/api/freeroll-reminder-send?when=1h", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData }),
        }).catch(function () {});
      }
    }
    if (!hasTriggered10min && ms > 0 && ms <= 10 * 60 * 1000) {
      hasTriggered10min = true;
      if (initData && base) {
        fetch(base + "/api/freeroll-reminder-send?when=10min", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData }),
        }).catch(function () {});
      }
    }
  }

  tick();
  setInterval(tick, 1000);
})();

// Фриролл: время, день недели и дата (по МСК)
(function initFreerollTimeDate() {
  const el = document.getElementById("freerollTimeDate");
  if (!el) return;
  const days = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  const d = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  const dayOfWeek = days[d.getDay()];
  const dateStr = String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear();
  el.textContent = "16:00 мск, " + dayOfWeek + ", " + dateStr;
})();

function subscribeFreerollRemind(btn, remindWhen, successMessage) {
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var initData = tg && tg.initData ? tg.initData : "";
  if (!initData) {
    if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
    return;
  }
  var base = getApiBase();
  if (!base) {
    if (tg && tg.showAlert) tg.showAlert("Не задан адрес API.");
    return;
  }
  btn.disabled = true;
  fetch(base + "/api/freeroll-reminder-subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: initData, remindWhen: remindWhen }),
  })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data.ok && data.subscribed) {
        if (tg && tg.showAlert) tg.showAlert(successMessage);
      } else {
        var msg = data.error && data.error.indexOf("UPSTASH") === -1 ? data.error : "Сервис напоминаний временно недоступен. Попробуйте позже.";
        if (tg && tg.showAlert) tg.showAlert(msg);
        btn.disabled = false;
      }
    })
    .catch(function () {
      if (tg && tg.showAlert) tg.showAlert("Ошибка сети.");
      btn.disabled = false;
    });
}

document.getElementById("freerollRemindBtn")?.addEventListener("click", function () {
  subscribeFreerollRemind(this, "1h", "Вам придёт сообщение за час до начала.");
});

document.getElementById("freerollRemind5minBtn")?.addEventListener("click", function () {
  subscribeFreerollRemind(this, "10min", "Вам придёт сообщение за 10 минут до начала.");
});

document.getElementById("freerollRemindNowBtn")?.addEventListener("click", function () {
  var btn = this;
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  var initData = tg && tg.initData ? tg.initData : "";
  if (!initData) {
    if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
    return;
  }
  var base = getApiBase();
  if (!base) {
    if (tg && tg.showAlert) tg.showAlert("Не задан адрес API.");
    return;
  }
  btn.disabled = true;
  fetch(base + "/api/freeroll-reminder-send?when=5sec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData: initData }),
  })
    .then(function (r) { return r.json(); })
    .then(function (res) {
      if (tg && tg.showAlert) {
        if (res.sent === 1) tg.showAlert("Сообщение отправлено!");
        else tg.showAlert(res.error || res.message || "Не удалось отправить. Напишите боту /start.");
      }
      btn.disabled = false;
    })
    .catch(function () {
      if (tg && tg.showAlert) tg.showAlert("Ошибка сети.");
      btn.disabled = false;
    });
});

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

