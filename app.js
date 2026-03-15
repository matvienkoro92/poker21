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

(function initRadioToggle() {
  var radio = document.getElementById("chillRadio");
  var btn = document.getElementById("radioToggle");
  if (!radio || !btn) return;
  var STATIONS = {
    chill: "https://ice2.somafm.com/groovesalad-128-mp3",
    lounge: "https://ice5.somafm.com/illstreet-128-mp3",
    "90s": "https://nostalgiafm.hostingradio.ru:8014/nostalgiafm.mp3",
    radio7: "https://stream.rcast.net/263744"
  };
  var MODES = ["", "chill", "lounge", "90s", "radio7"];
  function getMode() {
    var m = localStorage.getItem("chill_radio_mode") || "";
    return MODES.indexOf(m) >= 0 ? m : "";
  }
  var shortLabels = { "": "Выкл", chill: "Чил", lounge: "Lounge", "90s": "90е РФ", radio7: "Радио7" };
  function setMode(mode) {
    localStorage.setItem("chill_radio_mode", mode);
    btn.classList.remove("radio-toggle--chill", "radio-toggle--lounge", "radio-toggle--90s", "radio-toggle--radio7");
    if (mode === "chill") btn.classList.add("radio-toggle--chill");
    if (mode === "lounge") btn.classList.add("radio-toggle--lounge");
    if (mode === "90s") btn.classList.add("radio-toggle--90s");
    if (mode === "radio7") btn.classList.add("radio-toggle--radio7");
    var labelEl = btn.querySelector(".radio-toggle__label");
    if (labelEl) labelEl.textContent = shortLabels[mode] !== undefined ? shortLabels[mode] : shortLabels[""];
    var listenEl = document.getElementById("radioToggleListen");
    if (listenEl) {
      listenEl.setAttribute("aria-hidden", mode ? "false" : "true");
    }
    var titles = { "": "Радио: выкл", chill: "Радио: чил", lounge: "Радио: Lounge", "90s": "Радио: русские 90‑е", radio7: "Радио 7 на семи холмах" };
    btn.title = titles[mode] || titles[""];
    btn.setAttribute("aria-label", btn.title);
  }
  function applyAndPlay(mode) {
    setMode(mode);
    if (!mode) {
      radio.pause();
      radio.removeAttribute("src");
      return;
    }
    var url = STATIONS[mode];
    if (url) {
      radio.src = url;
      var p = radio.play();
      if (p && typeof p.then === "function") p.catch(function () {});
    }
  }
  setMode(getMode());
  if (getMode()) {
    radio.src = STATIONS[getMode()];
    var p = radio.play();
    if (p && typeof p.then === "function") p.catch(function () {});
  }
  var firstPlayHintKey = "poker_radio_first_play_hint";
  btn.addEventListener("click", function () {
    var cur = getMode();
    var idx = MODES.indexOf(cur);
    var next = MODES[(idx + 1) % MODES.length];
    applyAndPlay(next);
    if (next && !cur && !localStorage.getItem(firstPlayHintKey)) {
      try {
        localStorage.setItem(firstPlayHintKey, "1");
      } catch (e) {}
      alert("Если радио не играет, подождите немного.");
    }
  });
})();

(function initPwaInstall() {
  var btn = document.getElementById("pwaInstallBtn");
  if (!btn) return;
  var installPrompt = null;
  function isStandalone() {
    return window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      document.referrer.indexOf("android-app://") === 0;
  }
  function isIos() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }
  function getAppUrl() {
    var appEl = document.getElementById("app");
    return ((appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza").replace(/\/$/, "");
  }
  function copyShareLink() {
    var link = getAppUrl();
    if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(link).then(function () { return true; }).catch(function () { return false; });
    }
    return Promise.resolve(false);
  }
  function nativeShare() {
    if (typeof navigator.share !== "function") return Promise.resolve(false);
    if (isIos()) return Promise.resolve(false);
    var link = getAppUrl();
    return navigator.share({
      title: "Клуб Два туза — Poker Club",
      text: "Присоединяйся к покерному клубу «Два туза»",
      url: link
    }).then(function () { return true; }).catch(function () { return false; });
  }
  function showMsg(msg) {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
  }
  if (isStandalone()) return;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    installPrompt = e;
    btn.removeAttribute("hidden");
  });
  if (isIos() || (typeof navigator.share === "function")) btn.removeAttribute("hidden");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(function () {});
  }
  btn.addEventListener("click", function () {
    function doShareAndCopy() {
      return copyShareLink().then(function () { return nativeShare(); });
    }
    if (installPrompt) {
      installPrompt.prompt();
      installPrompt.userChoice.then(function (r) {
        if (r.outcome === "accepted") installPrompt = null;
        doShareAndCopy().then(function (shared) {
          if (shared) showMsg("Поделились!");
          else showMsg("Ссылка скопирована. Отправьте другу.");
        });
      });
      return;
    }
    doShareAndCopy().then(function (shared) {
      if (shared) {
        showMsg("Поделились! Для добавления на экран: Safari → Поделиться → На экран Домой.");
        return;
      }
      copyShareLink().then(function (ok) {
        if (ok) {
          if (isIos()) showMsg("Ссылка скопирована. Добавить на экран: нажмите кнопку «Поделиться» в Safari (внизу экрана) → прокрутите вниз → «На экран Домой».");
          else showMsg("Ссылка скопирована. Отправьте другу. Chrome: меню → Установить.");
        } else {
          if (isIos()) showMsg("Добавить на экран: нажмите кнопку «Поделиться» в Safari (внизу экрана) → прокрутите вниз → «На экран Домой».");
          else showMsg("Chrome или Edge: меню → Установить.");
        }
      });
    });
  });
})();

function getAssetUrl(relativePath) {
  try {
    var base = typeof document !== "undefined" && document.baseURI ? document.baseURI : (typeof location !== "undefined" && location.href) || "";
    if (!base) return "./assets/" + relativePath;
    var href = new URL("assets/" + relativePath, base).href;
    return href || "./assets/" + relativePath;
  } catch (e) {
    return "./assets/" + relativePath;
  }
}

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
    if (t.classList && t.classList.contains("chat-contact__avatar") && t.src && !(t.closest && t.closest(".chat-contact"))) {
      e.preventDefault();
      e.stopPropagation();
      open(t.src);
    }
  });
  document.body.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest(".chat-msg__tg-link, .chat-msg__link") : null;
    if (!link || !link.href) return;
    e.preventDefault();

    // Внутренние ссылки с параметром startapp — не открываем приложение заново,
    // а переключаемся внутри текущего web-app.
    try {
      var urlObj = new URL(link.href, window.location.href);
      var sp = new URLSearchParams(urlObj.search || "");
      var startApp = sp.get("startapp");
      if (startApp === "raffles" && typeof setView === "function") {
        setView("raffles");
        return;
      }
      if (startApp && (startApp === "news" || startApp.indexOf("news_") === 0) && typeof openGazette === "function") {
        var articleNum = startApp === "news" ? undefined : parseInt(startApp.replace("news_", ""), 10);
        if (startApp !== "news" && (Number.isNaN(articleNum) || articleNum < 0)) articleNum = undefined;
        openGazette("news", articleNum);
        return;
      }
      if (startApp && (startApp === "spring_rating_league_1" || startApp === "spring_rating_league_2") && typeof setView === "function") {
        var leagueNum = startApp === "spring_rating_league_1" ? "1" : "2";
        setView("spring-rating");
        setTimeout(function () {
          if (typeof window.switchSpringRatingMainTab === "function") window.switchSpringRatingMainTab(leagueNum);
        }, 400);
        return;
      }
    } catch (ignore) {}

    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (link.classList && link.classList.contains("chat-msg__tg-link") && tg && tg.openTelegramLink) {
      tg.openTelegramLink(link.href);
    } else if (tg && tg.openLink) {
      tg.openLink(link.href);
    } else {
      window.open(link.href, "_blank", "noopener,noreferrer");
    }
  });

  var pdfViewer = document.getElementById("pdfViewer");
  var pdfViewerIframe = document.getElementById("pdfViewerIframe");
  var pdfViewerBackdrop = pdfViewer ? pdfViewer.querySelector(".pdf-viewer__backdrop") : null;
  var pdfViewerClose = pdfViewer ? pdfViewer.querySelector(".pdf-viewer__close") : null;
  function openPdfViewer(url) {
    if (!pdfViewer || !pdfViewerIframe) return;
    pdfViewerIframe.src = url;
    pdfViewer.classList.add("pdf-viewer--open");
    pdfViewer.setAttribute("aria-hidden", "false");
  }
  function closePdfViewer() {
    if (!pdfViewer || !pdfViewerIframe) return;
    pdfViewer.classList.remove("pdf-viewer--open");
    pdfViewer.setAttribute("aria-hidden", "true");
    pdfViewerIframe.removeAttribute("src");
  }
  if (pdfViewer && pdfViewerIframe) {
    if (pdfViewerBackdrop) pdfViewerBackdrop.addEventListener("click", closePdfViewer);
    if (pdfViewerClose) pdfViewerClose.addEventListener("click", closePdfViewer);
    window.closePdfViewer = closePdfViewer;
  }

  document.body.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest("a.chat-msg__document-link") : null;
    if (!link || !link.href) return;
    var href = link.getAttribute("href");
    if (!href || href.indexOf("data:") !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    var fileName = link.getAttribute("download") || "document.pdf";
    var isDownload = link.hasAttribute("download");
    if (isDownload) {
      try {
        var m = href.match(/^data:([^;]+);base64,(.+)$/);
        if (m && m[2]) {
          var binary = atob(m[2]);
          var arr = new Uint8Array(binary.length);
          for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
          var blob = new Blob([arr], { type: (m[1] || "application/pdf").split(";")[0] });
          var url = URL.createObjectURL(blob);
          var a = document.createElement("a");
          a.href = url;
          a.download = fileName || "document.pdf";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      } catch (err) {
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) window.Telegram.WebApp.showAlert("Не удалось скачать. Попробуйте ещё раз.");
      }
    } else {
      if (pdfViewer && pdfViewerIframe) {
        openPdfViewer(href);
      } else {
        var w = window.open(href, "_blank", "noopener,noreferrer");
        if (!w && window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.showAlert) {
          window.Telegram.WebApp.showAlert("Нажмите «Скачать» и откройте файл в приложении для PDF.");
        }
      }
    }
  });
})();

(function initSpringRatingLeagueTabs() {
  document.body.addEventListener("click", function (e) {
    var el = e.target;
    var tab = null;
    while (el && el !== document.body) {
      if (el.classList && el.classList.contains("spring-rating-date-league-tab")) {
        tab = el;
        break;
      }
      el = el.parentElement;
    }
    if (!tab) return;
    var wrap = tab.parentElement;
    while (wrap && wrap !== document.body) {
      if (wrap.classList && wrap.classList.contains("spring-rating-date-leagues")) break;
      wrap = wrap.parentElement;
    }
    if (!wrap || wrap === document.body) return;
    e.preventDefault();
    e.stopPropagation();
    var league = tab.getAttribute("data-league");
    if (!league) return;
    var tabs = wrap.querySelectorAll(".spring-rating-date-league-tab");
    var blocks = wrap.querySelectorAll(".spring-rating-date-league");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("spring-rating-date-league-tab--active", tabs[i].getAttribute("data-league") === league);
    for (var j = 0; j < blocks.length; j++) blocks[j].style.display = blocks[j].getAttribute("data-league") === league ? "" : "none";
  }, true);
})();

// Топы по выигрышу за набор дат (прошлая/текущая неделя)
var GAZETTE_DATES = ["15.02.2026", "16.02.2026", "17.02.2026", "18.02.2026", "19.02.2026", "20.02.2026", "21.02.2026", "22.02.2026"];
var CURRENT_WEEK_DATES = ["23.02.2026", "24.02.2026", "25.02.2026", "26.02.2026", "27.02.2026", "28.02.2026", "29.02.2026"];
/** Рейтинг весны: даты прошлой недели по марту (топ занос прошлой недели) */
var MARCH_PAST_WEEK_DATES = ["02.03.2026", "03.03.2026", "04.03.2026", "05.03.2026", "06.03.2026", "07.03.2026", "08.03.2026"];
/** Рейтинг весны: даты текущей недели по марту (топы этой недели) */
var MARCH_CURRENT_WEEK_DATES = ["09.03.2026", "10.03.2026", "11.03.2026", "12.03.2026", "13.03.2026", "14.03.2026", "15.03.2026"];

function updateSpringRatingPromoDateFromVar() {
  try {
    if (typeof SPRING_RATING_UPDATED === "undefined") return;
    var el = document.querySelector(".feature--rating-spring-promo .feature__title-updated");
    if (!el) return;
    el.textContent = "обновлено " + SPRING_RATING_UPDATED;
  } catch (e) {
    if (typeof console !== "undefined" && console.warn) console.warn("updateSpringRatingPromoDateFromVar", e);
  }
}
// Рейтинг весны: одна база для ссылок топов. Топы текущей недели = BASE?Mart_week_1=1, Топы Марта = BASE?mart=1
// Укажите сюда полный URL (например https://t.me/... или ссылку на пост), параметры допишутся автоматически
var SPRING_TOP_LINK_BASE = "https://t.me/Poker_dvatuza_bot/DvaTuza";

function normalizeWinterNick(n) {
  n = n != null ? String(n).trim() : "";
  if (!n) return n;
  var lower = n.toLowerCase();
  if (lower === "pryanik2la") return "Пряник";
  if (lower === "фокс") return "Фокс";
  if (lower === "waaarr" || lower === "waaar" || lower === "waaaar") return "Waaar";
  return n;
}
function normalizeWinterNickForFinalTable(n) {
  n = normalizeWinterNick(n);
  if (!n) return n;
  if (String(n).toLowerCase() === "andrushamorf") return "FrankL";
  return n;
}
function winterRatingSamePlayer(nickA, nickB) {
  var a = normalizeWinterNick(nickA);
  var b = normalizeWinterNick(nickB);
  if (!a || !b) return a === b;
  if (a === b) return true;
  var aL = String(a).toLowerCase();
  var bL = String(b).toLowerCase();
  return (aL === "frankl" && bL === "andrushamorf") || (aL === "andrushamorf" && bL === "frankl");
}
function getTopByDates(dates) {
  if (!dates || !dates.length) return [];
  var byNick = {};
  dates.forEach(function (dateStr) {
    var list = getRatingByDate()[dateStr];
    if (!list || !list.length) return;
    list.forEach(function (r) {
      var nick = normalizeWinterNick(r.nick);
      var reward = r.reward != null ? Number(r.reward) : 0;
      if (!byNick[nick]) byNick[nick] = 0;
      byNick[nick] += reward;
    });
  });
  return Object.keys(byNick)
    .map(function (nick) { return { nick: nick, totalReward: byNick[nick] }; })
    .filter(function (r) { return r.totalReward > 0; })
    .sort(function (a, b) { return b.totalReward - a.totalReward; })
    .slice(0, 15);
}

// Газета «Вестник Два туза» — только горячие новости (инициализация при DOMContentLoaded для надёжности)
function runGazetteAndTasksInit() {
(function initGazetteModal() {
  var GAZETTE_READ_KEY = "poker_gazette_read";
  var modal = document.getElementById("gazetteModal");
  var pickEl = document.getElementById("gazetteModalPick");
  var newsEl = document.getElementById("gazetteModalNews");
  var gazetteAdminRow = document.getElementById("gazetteAdminRow");
  var gazetteNotifySubsBtn = document.getElementById("gazetteNotifySubsBtn");
  var gazetteNotifySubsHint = document.getElementById("gazetteNotifySubsHint");
  var openBtn = document.getElementById("gazetteOpenBtn");
  var closeBtn = document.getElementById("gazetteModalClose");
  var backdrop = document.getElementById("gazetteModalBackdrop");
  var unreadDot = document.getElementById("gazetteUnreadDot");
  if (modal && pickEl && newsEl) {
  function getGazetteVersion() {
    var articles = document.querySelectorAll("[data-gazette-article]");
    var max = 0;
    for (var i = 0; i < articles.length; i++) {
      var n = parseInt(articles[i].getAttribute("data-gazette-article"), 10);
      if (!isNaN(n) && n > max) max = n;
    }
    return max > 0 ? String(max) : "0";
  }
  function hasUnreadGazette() {
    try {
      var current = getGazetteVersion();
      var read = localStorage.getItem(GAZETTE_READ_KEY) || "0";
      return read !== current;
    } catch (e) {
      return true;
    }
  }
  function updateGazetteUnreadDot() {
    if (!unreadDot) return;
    unreadDot.classList.toggle("welcome-gazette-icon__unread--visible", hasUnreadGazette());
  }
  function markGazetteRead() {
    try {
      localStorage.setItem(GAZETTE_READ_KEY, getGazetteVersion());
    } catch (e) {}
    updateGazetteUnreadDot();
  }
  updateGazetteUnreadDot();
  var paperEl = modal && modal.querySelector(".gazette-modal__paper");
  // Админская рассылка по подписчикам газеты
  window.updateGazetteSubsCount = function () {
    if (!gazetteNotifySubsBtn) return;
    var base = getApiBase && getApiBase();
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) return;
    fetch(
      base +
        "/api/gazette-manual-subscribers?stats=1&initData=" +
        encodeURIComponent(initData)
    )
      .then(function (r) {
        if (!r.ok) return Promise.reject(new Error("http " + r.status));
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || typeof data.total !== "number") return;
        var total = data.total;
        var baseText = "Разослать подписчикам газеты";
        var current = gazetteNotifySubsBtn.textContent || baseText;
        var idx = current.indexOf(" (");
        if (idx !== -1) current = current.slice(0, idx);
        gazetteNotifySubsBtn.textContent = current + " (" + total + ")";
      })
      .catch(function () {});
  };
  function showGazetteView(view) {
    pickEl.hidden = view !== "pick";
    newsEl.hidden = view !== "news";
    if (paperEl) paperEl.scrollTop = 0;
  }

  (function initGazetteAdminNotify() {
    if (!gazetteNotifySubsBtn) return;
    gazetteNotifySubsBtn.addEventListener("click", function () {
      var base = getApiBase && getApiBase();
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      var initData = tg && tg.initData ? tg.initData : "";
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      var btn = gazetteNotifySubsBtn;
      var originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Рассылаем…";
      if (gazetteNotifySubsHint) gazetteNotifySubsHint.textContent = "";
      var payload = { initData: initData };
      if (newsEl) {
        var firstArticle = newsEl.querySelector(".gazette-modal__lead[data-gazette-article]");
        var headlineEl = firstArticle && firstArticle.querySelector(".gazette-modal__headline");
        if (headlineEl) {
          var headlineText = headlineEl.textContent.trim();
          if (headlineText) payload.headline = headlineText;
        }
        if (firstArticle) {
          var articleIdx = firstArticle.getAttribute("data-gazette-article");
          if (articleIdx) payload.articleIndex = parseInt(articleIdx, 10);
        }
      }
      fetch(base + "/api/gazette-manual-subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (r) {
          return r
            .json()
            .catch(function () {
              return { ok: false, error: "Ошибка ответа сервера" };
            });
        })
        .then(function (data) {
          if (data && data.ok) {
            var sent =
              data && typeof data.sent === "number" && data.sent >= 0 ? data.sent : 0;
            var total =
              data && typeof data.total === "number" && data.total >= 0
                ? data.total
                : 0;
            if (gazetteNotifySubsHint) {
              gazetteNotifySubsHint.textContent =
                "Личные сообщения отправлены: " +
                sent +
                " из " +
                total +
                " подписчиков газеты.";
            }
          } else if (gazetteNotifySubsHint) {
            gazetteNotifySubsHint.textContent =
              "Ошибка рассылки: " +
              (data && data.error ? data.error : "не удалось отправить");
          }
        })
        .catch(function () {
          if (gazetteNotifySubsHint) {
            gazetteNotifySubsHint.textContent =
              "Ошибка сети при отправке рассылки.";
          }
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });
  })();
  function openGazette(goToNews, articleIndex) {
    if (goToNews === "news") {
      showGazetteView("news");
      if (typeof articleIndex === "number" && articleIndex >= 0 && newsEl) {
        var article = newsEl.querySelector('.gazette-modal__lead[data-gazette-article="' + articleIndex + '"]');
        if (article) {
          setTimeout(function () {
            article.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }
      }
    } else {
    showGazetteView("pick");
    }
    modal.setAttribute("aria-hidden", "false");
    markGazetteRead();
  }
  function closeGazette() {
    modal.setAttribute("aria-hidden", "true");
    showGazetteView("pick");
  }
  modal.addEventListener("click", function (e) {
    var card = e.target && e.target.closest ? e.target.closest(".gazette-modal__page-card") : null;
    if (card && card.dataset.gazettePage === "news") {
      e.preventDefault();
      showGazetteView("news");
      return;
    }
    if (e.target && e.target.id === "gazetteModalBackToHome") {
      e.preventDefault();
      closeGazette();
      return;
    }
    if (e.target && e.target.id === "gazetteModalBackNews" || (e.target.closest && e.target.closest(".gazette-modal__back"))) {
      e.preventDefault();
      showGazetteView("pick");
    }
  });
  if (openBtn) openBtn.addEventListener("click", openGazette);
  if (closeBtn) closeBtn.addEventListener("click", closeGazette);
  if (backdrop) backdrop.addEventListener("click", closeGazette);

  var appEl = document.getElementById("app");
  var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
  appUrl = appUrl.replace(/\/$/, "");
  modal.addEventListener("click", function (e) {
    var ratingLink = e.target && e.target.closest ? e.target.closest("a[data-close-gazette][data-view-target]") : null;
    if (ratingLink) {
      e.preventDefault();
      e.stopPropagation();
      closeGazette();
      var view = ratingLink.getAttribute("data-view-target");
      if (view && typeof setView === "function") setView(view);
      return;
    }
    var articleLink = e.target && e.target.closest ? e.target.closest("a[data-gazette-article-link]") : null;
    if (articleLink) {
      e.preventDefault();
      showGazetteView("news");
      var idxStr = articleLink.getAttribute("data-gazette-article-link");
      var idxNum = Number(idxStr);
      if (idxStr && newsEl) {
        var target = newsEl.querySelector('.gazette-modal__lead[data-gazette-article="' + idxStr + '"]');
        if (target) {
          setTimeout(function () {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 100);
        }
      }
      return;
    }
    var shareBtn = e.target && e.target.closest ? e.target.closest(".gazette-modal__share-btn") : null;
    if (shareBtn && shareBtn.dataset.gazetteShare !== undefined) {
      e.preventDefault();
      var idx = shareBtn.dataset.gazetteShare;
      var link = idx !== undefined && idx !== "" ? appUrl + "?startapp=news_" + idx : appUrl + "?startapp=news";
      var isTelegramShare = shareBtn.classList && shareBtn.classList.contains("gazette-modal__share-telegram");
      if (isTelegramShare) {
        var article = shareBtn.closest && shareBtn.closest("article");
        var headlineEl = article && article.querySelector(".gazette-modal__headline");
        var headline = headlineEl ? headlineEl.textContent.trim() : "";
        var shareText = headline.length > 0 ? headline : "Новая новость в газете «Вестник Два туза»";
        var shareUrl = "https://t.me/share/url?url=&text=" + encodeURIComponent(shareText + "\n" + link);
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
        else if (tg && tg.openLink) tg.openLink(shareUrl);
        else window.open(shareUrl, "_blank");
        if (typeof recordShareButtonClick === "function") recordShareButtonClick("gazette_article");
      } else {
        if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(link).then(function () {
            var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tg && tg.showAlert) tg.showAlert("Ссылка скопирована. Отправьте её другу — по ней откроется эта новость."); else alert("Ссылка скопирована.");
          }).catch(function () {
            var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
          });
        } else {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        }
      }
    }
  });

  var subscribeBtn = document.getElementById("gazetteSubscribeBtn");
  var subscribeBtnNews = document.getElementById("gazetteSubscribeBtnNews");
  var subscribeWrap = modal && modal.querySelector(".gazette-modal__subscribe-wrap");
  var GAZETTE_SUBSCRIBED_KEY = "poker_gazette_subscribed";
  var inDevHtml = "";
  function setSubscribeButtonState(subscribed) {
    var text = subscribed ? "Отписаться от газеты" : "Подписаться на газету";
    if (subscribeBtn) {
      subscribeBtn.disabled = false;
      subscribeBtn.innerHTML = text + inDevHtml;
      subscribeBtn.dataset.subscribed = subscribed ? "1" : "0";
    }
    if (subscribeBtnNews) {
      subscribeBtnNews.disabled = false;
      subscribeBtnNews.innerHTML = text + inDevHtml;
      subscribeBtnNews.dataset.subscribed = subscribed ? "1" : "0";
    }
    var articleBtns = modal && modal.querySelectorAll(".gazette-modal__subscribe-in-article-btn");
    if (articleBtns) {
      for (var i = 0; i < articleBtns.length; i++) {
        var btn = articleBtns[i];
        var wrap = btn.closest(".gazette-modal__subscribe-in-article");
        btn.disabled = false;
        btn.textContent = text;
        btn.dataset.subscribed = subscribed ? "1" : "0";
        if (wrap) wrap.style.display = subscribed ? "none" : "";
      }
    }
  }
  function updateSubscribeButtonFromStorage() {
    try {
      setSubscribeButtonState(localStorage.getItem(GAZETTE_SUBSCRIBED_KEY) === "1");
    } catch (e) {
      setSubscribeButtonState(false);
    }
  }
  updateSubscribeButtonFromStorage();
  if (subscribeBtn || subscribeBtnNews) {
    var gazetteSubscribeHandledInTouchend = false;
    function runGazetteSubscribe() {
      var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || "";
      if (!initData) {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram, чтобы подписаться."); else alert("Откройте приложение в Telegram, чтобы подписаться.");
        return;
      }
      var activeBtn = subscribeBtn || subscribeBtnNews;
      var articleBtn = modal && modal.querySelector(".gazette-modal__subscribe-in-article-btn");
      var anyBtn = activeBtn || articleBtn;
      var subscribed = (anyBtn && anyBtn.dataset.subscribed === "1") || false;
      var appEl = document.getElementById("app");
      var base = (appEl && appEl.getAttribute("data-api-base")) || (typeof location !== "undefined" && location.origin) || "";
      var apiUrl = (base ? base.replace(/\/$/, "") : "") + "/api/gazette-subscribe";
      if (subscribeBtn) subscribeBtn.disabled = true;
      if (subscribeBtnNews) subscribeBtnNews.disabled = true;
      var allArticleBtns = modal && modal.querySelectorAll(".gazette-modal__subscribe-in-article-btn");
      if (allArticleBtns) for (var j = 0; j < allArticleBtns.length; j++) allArticleBtns[j].disabled = true;
      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, unsubscribe: subscribed }),
      })
        .then(function (r) {
          return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
        })
        .then(function (data) {
          if (data && data.ok) {
            try {
              localStorage.setItem(GAZETTE_SUBSCRIBED_KEY, data.subscribed ? "1" : "0");
            } catch (e) {}
            setSubscribeButtonState(!!data.subscribed);
            var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tg && tg.showAlert) {
              tg.showAlert(data.subscribed ? "Подписка оформлена. Пуши о новых новостях будут приходить в Telegram." : "Вы отписаны от уведомлений газеты.");
            } else {
              alert(data.subscribed ? "Подписка оформлена." : "Вы отписаны.");
            }
          } else {
            var msg = (data && data.error) || "Ошибка. Попробуйте позже.";
            var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
            setSubscribeButtonState(subscribed);
          }
        })
        .catch(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Сервис временно недоступен. Попробуйте позже."); else alert("Сервис временно недоступен.");
          setSubscribeButtonState(subscribed);
        });
    }
    function bindSubscribeClick(btn) {
      if (!btn) return;
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (gazetteSubscribeHandledInTouchend) {
          gazetteSubscribeHandledInTouchend = false;
          return;
        }
        if (window.__touchWasScroll && window.__touchWasScroll()) return;
        runGazetteSubscribe();
      });
      btn.addEventListener("touchend", function (e) {
        if (e.target !== btn && !btn.contains(e.target)) return;
        if (window.__touchWasScroll && window.__touchWasScroll()) return;
        e.preventDefault();
        gazetteSubscribeHandledInTouchend = true;
        runGazetteSubscribe();
      }, { passive: false });
    }
    bindSubscribeClick(subscribeBtn);
    bindSubscribeClick(subscribeBtnNews);
    var articleSubscribeBtns = modal && modal.querySelectorAll(".gazette-modal__subscribe-in-article-btn");
    if (articleSubscribeBtns) {
      for (var k = 0; k < articleSubscribeBtns.length; k++) bindSubscribeClick(articleSubscribeBtns[k]);
    }
  }
  }

  (function initPartnershipModal() {
    var modal = document.getElementById("partnershipModal");
    var backdrop = document.getElementById("partnershipModalBackdrop");
    var closeBtn = document.getElementById("partnershipModalClose");
    var track = document.getElementById("partnershipModalTrack");
    var indicator = document.getElementById("partnershipPageIndicator");
    var openBtn = document.getElementById("partnershipOpenBtn");
    if (!modal || !track || !indicator) return;
    var partnershipAssets = ["partnership-intro.jpg", "partnership-step1.jpg", "partnership-step2.jpg", "partnership-step3.jpg", "partnership-cost.jpg"];
    var imgs = modal.querySelectorAll(".partnership-modal__img");
    for (var i = 0; i < imgs.length && i < partnershipAssets.length; i++) {
      imgs[i].src = getAssetUrl(partnershipAssets[i]);
    }
    var currentIndex = 0;
    var totalSheets = 5;
    function setSlide(index) {
      currentIndex = Math.max(0, Math.min(index, totalSheets - 1));
      track.style.transform = "translateX(-" + currentIndex * 20 + "%)";
      indicator.textContent = (currentIndex + 1) + " / " + totalSheets;
    }
    function openPartnership() {
      setSlide(0);
      modal.setAttribute("aria-hidden", "false");
    }
    function closePartnership() {
      modal.setAttribute("aria-hidden", "true");
    }
    if (openBtn) openBtn.addEventListener("click", function (e) { e.preventDefault(); openPartnership(); });
    if (closeBtn) closeBtn.addEventListener("click", closePartnership);
    if (backdrop) backdrop.addEventListener("click", closePartnership);
    modal.addEventListener("click", function (e) {
      var nextBtn = e.target && e.target.closest ? e.target.closest(".partnership-modal__next") : null;
      var prevBtn = e.target && e.target.closest ? e.target.closest(".partnership-modal__prev") : null;
      if (nextBtn) {
        e.preventDefault();
        if (currentIndex < totalSheets - 1) setSlide(currentIndex + 1);
      }
      if (prevBtn) {
        e.preventDefault();
        if (currentIndex > 0) setSlide(currentIndex - 1);
      }
      var link = e.target && e.target.closest ? e.target.closest("a.partnership-modal__link[href^=\"https://t.me/\"]") : null;
      if (link && link.href) {
        e.preventDefault();
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.openTelegramLink) tg.openTelegramLink(link.href); else window.open(link.href, "_blank");
      }
    });
  })();

  (function initPokerTasksMtt() {
    var startScreen = document.getElementById("pokerTasksStartScreen");
    var startBtn = document.getElementById("pokerTasksStartBtn");
    var leaderboardBody = document.getElementById("pokerTasksLeaderboardBody");
    if (!startScreen || !startBtn) return;
    startBtn.addEventListener("click", function (e) {
      e.preventDefault();
      if (typeof window.startMttChallenge === "function") {
        window.startMttChallenge();
      } else {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Задачи ещё загружаются. Обновите страницу."); else alert("Задачи ещё загружаются. Обновите страницу.");
      }
    });
    function renderMttLeaderboard() {
      if (!leaderboardBody) return;
      var list = (typeof MTT_LEADERBOARD !== "undefined" && Array.isArray(MTT_LEADERBOARD)) ? MTT_LEADERBOARD : [];
      var levels = typeof MTT_LEVELS !== "undefined" ? MTT_LEVELS : [];
      leaderboardBody.innerHTML = list.map(function (r) {
        var lvl = r.level != null ? r.level : 1;
        var lvlName = levels[lvl - 1] ? levels[lvl - 1].name : "Ур." + lvl;
        return "<tr><td>" + (r.place || "") + "</td><td>" + (r.nick || "—") + "</td><td>" + lvlName + "</td><td>" + (r.points != null ? r.points : "—") + "</td></tr>";
      }).join("") || "<tr><td colspan=\"4\">Пока пусто</td></tr>";
    }
    renderMttLeaderboard();
    window.refreshMttStats = function () {
      var levelEl = document.getElementById("mttStatLevel");
      var pointsEl = document.getElementById("mttStatPoints");
      var dailyEl = document.getElementById("mttStatDaily");
      if (!levelEl || !pointsEl || !dailyEl) return;
      var data = { totalPoints: 0, dailyCompleted: 0, dailyDate: "" };
      try {
        var raw = localStorage.getItem("mtt_challenge_progress");
        if (raw) data = JSON.parse(raw);
      } catch (e) {}
      var today = new Date().toDateString();
      if (data.dailyDate !== today) {
        data.dailyCompleted = 0;
        data.dailyDate = today;
        try { localStorage.setItem("mtt_challenge_progress", JSON.stringify(data)); } catch (e) {}
      }
      var level = 1;
      var nextRequired = 100;
      if (typeof MTT_LEVELS !== "undefined" && MTT_LEVELS.length) {
        for (var i = MTT_LEVELS.length - 1; i >= 0; i--) {
          if (data.totalPoints >= MTT_LEVELS[i].requiredPoints) {
            level = MTT_LEVELS[i].level;
            nextRequired = i < MTT_LEVELS.length - 1 ? MTT_LEVELS[i + 1].requiredPoints : MTT_LEVELS[i].requiredPoints;
            break;
          }
        }
      }
      var levelName = "Новичок";
      if (typeof MTT_LEVELS !== "undefined") {
        for (var j = 0; j < MTT_LEVELS.length; j++) {
          if (MTT_LEVELS[j].level === level) { levelName = MTT_LEVELS[j].name; break; }
        }
      }
      levelEl.textContent = level + " — " + levelName;
      pointsEl.textContent = data.totalPoints + " / " + nextRequired;
      dailyEl.textContent = data.dailyCompleted + " / 5";
    };
  })();

  (function initMttChallenge() {
    var streakScreen = document.getElementById("pokerStreakScreen");
    var startScreen = document.getElementById("pokerTasksStartScreen");
    var resultScreen = document.getElementById("pokerStreakResultScreen");
    var view = document.querySelector('[data-view="poker-tasks"]');
    var timerEl = document.getElementById("pokerStreakTimer");
    var streakEl = document.getElementById("pokerStreakStreak");
    var levelEl = document.getElementById("pokerStreakLevel");
    var pointsEl = document.getElementById("pokerStreakPoints");
    var dailyEl = document.getElementById("pokerStreakDaily");
    var multiplierEl = document.getElementById("pokerStreakMultiplier");
    var progressEl = document.getElementById("pokerStreakProgress");
    var situationEl = document.getElementById("pokerStreakSituation");
    var cardsEl = document.getElementById("pokerStreakCards");
    var questionEl = document.getElementById("pokerStreakQuestion");
    var optionsEl = document.getElementById("pokerStreakOptions");
    var feedbackEl = document.getElementById("pokerStreakFeedback");
    var feedbackResultEl = document.getElementById("pokerStreakFeedbackResult");
    var feedbackScoreEl = document.getElementById("pokerStreakFeedbackScore");
    var feedbackExplanationEl = document.getElementById("pokerStreakFeedbackExplanation");
    var nextBtn = document.getElementById("pokerStreakNextBtn");
    var backBtn = document.getElementById("pokerStreakBackBtn");
    var playAgainBtn = document.getElementById("pokerStreakPlayAgainBtn");
    var resultStatsEl = document.getElementById("pokerStreakResultStats");
    if (!streakScreen || !timerEl || !optionsEl) return;
    var tasks = [];
    var taskIndex = 0;
    var sessionScore = 0;
    var streak = 0;
    var correctCount = 0;
    var timerId = null;
    var timeElapsed = 0;
    var answered = false;
    var SPEED_BONUS_REF = 30;
    var DAILY_LIMIT = 5;
    var SUIT_SYMBOLS = { s: "\u2660", h: "\u2665", d: "\u2666", c: "\u2663" };
    var RANK_DISPLAY = { T: "10", J: "J", Q: "Q", K: "K", A: "A" };
    function esc(s) {
      if (s == null) return "";
      return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }
    function parseCard(cardStr) {
      if (!cardStr || cardStr.length < 1) return { rank: cardStr, suit: "", red: false };
      var r = cardStr.charAt(0);
      var s = cardStr.length >= 2 ? cardStr.charAt(1) : "";
      var red = s === "h" || s === "d";
      var rank = RANK_DISPLAY[r] || r;
      var suit = SUIT_SYMBOLS[s] || s;
      return { rank: rank, suit: suit, red: red };
    }
    function renderCard(cardStr) {
      var c = parseCard(String(cardStr));
      var cls = "poker-streak-card";
      if (c.red) cls += " poker-streak-card--red";
      return "<span class=\"" + cls + "\">" + esc(c.rank) + (c.suit ? "<span class=\"poker-streak-card__suit\">" + c.suit + "</span>" : "") + "</span>";
    }
    function shuffle(arr) {
      var a = arr.slice();
      for (var i = a.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var t = a[i]; a[i] = a[j]; a[j] = t;
      }
      return a;
    }
    function clearTimer() {
      if (timerId) { clearInterval(timerId); timerId = null; }
    }
    function getMttProgress() {
      var data = { totalPoints: 0, dailyCompleted: 0, dailyDate: "" };
      try {
        var raw = localStorage.getItem("mtt_challenge_progress");
        if (raw) data = JSON.parse(raw);
      } catch (e) {}
      var today = new Date().toDateString();
      if (data.dailyDate !== today) {
        data.dailyCompleted = 0;
        data.dailyDate = today;
      }
      return data;
    }
    function saveMttProgress(data) {
      try { localStorage.setItem("mtt_challenge_progress", JSON.stringify(data)); } catch (e) {}
    }
    function getLevelForPoints(points) {
      var lvl = 1;
      var nextReq = 100;
      if (typeof MTT_LEVELS !== "undefined" && MTT_LEVELS.length) {
        for (var i = MTT_LEVELS.length - 1; i >= 0; i--) {
          if (points >= MTT_LEVELS[i].requiredPoints) {
            lvl = MTT_LEVELS[i].level;
            nextReq = i < MTT_LEVELS.length - 1 ? MTT_LEVELS[i + 1].requiredPoints : MTT_LEVELS[i].requiredPoints;
            break;
          }
        }
      }
      return { level: lvl, nextRequired: nextReq };
    }
    function getLevelName(level) {
      if (typeof MTT_LEVELS !== "undefined") {
        for (var j = 0; j < MTT_LEVELS.length; j++) {
          if (MTT_LEVELS[j].level === level) return MTT_LEVELS[j].name;
        }
      }
      return "Новичок";
    }
    function calculateMttScore(isCorrect, timeTaken, streakBefore, taskLevel, playerLevel) {
      taskLevel = Math.max(1, taskLevel || 1);
      playerLevel = Math.max(1, playerLevel || 1);
      if (!isCorrect) {
        var penalty = -20 * Math.pow(1.03, playerLevel - 1);
        return Math.round(penalty);
      }
      var basePoints = 50 * Math.pow(1.05, taskLevel - 1);
      var speedBonus = basePoints * 0.5 * Math.max(0, 1 - timeTaken / SPEED_BONUS_REF);
      var streakBonus = Math.min(streakBefore * 0.1 * basePoints, basePoints);
      var diff = taskLevel - playerLevel;
      var difficultyMultiplier = diff <= -5 ? 0.5 : diff <= -2 ? 0.75 : diff <= 2 ? 1.0 : diff <= 5 ? 1.25 : 1.5;
      return Math.round((basePoints + speedBonus + streakBonus) * difficultyMultiplier);
    }
    function updateHeader() {
      var prog = getMttProgress();
      var lvlInfo = getLevelForPoints(prog.totalPoints);
      if (levelEl) levelEl.textContent = "Ур. " + lvlInfo.level + " — " + getLevelName(lvlInfo.level);
      if (pointsEl) pointsEl.textContent = prog.totalPoints + "/" + lvlInfo.nextRequired;
      if (dailyEl) dailyEl.textContent = "Задачи: " + prog.dailyCompleted + "/5";
      if (streakEl) streakEl.textContent = "Стрик: " + streak;
      if (multiplierEl) multiplierEl.textContent = "\u00D7" + (1 + streak * 0.1).toFixed(1);
    }
    function showTask() {
      if (taskIndex >= tasks.length) {
        endGame();
        return;
      }
      answered = false;
      clearTimer();
      var task = tasks[taskIndex];
      timeElapsed = 0;
      if (situationEl) situationEl.textContent = task.situation || "";
      if (questionEl) questionEl.textContent = task.question || "";
      if (progressEl) progressEl.textContent = "Задача " + (taskIndex + 1) + " из " + tasks.length;
      if (cardsEl) {
        var cardsHtml = "<div class=\"poker-streak-cards__player\">Ваши карты: ";
        if (task.player_cards && task.player_cards.length) {
          for (var i = 0; i < task.player_cards.length; i++) {
            cardsHtml += renderCard(task.player_cards[i]);
          }
        } else {
          cardsHtml += "—";
        }
        cardsHtml += "</div>";
        if (task.board_cards && task.board_cards.length) {
          cardsHtml += "<div class=\"poker-streak-cards__board\">Стол: ";
          for (var j = 0; j < task.board_cards.length; j++) {
            cardsHtml += renderCard(task.board_cards[j]);
          }
          cardsHtml += "</div>";
        }
        cardsEl.innerHTML = cardsHtml;
      }
      if (optionsEl) {
        optionsEl.innerHTML = "";
        optionsEl.classList.remove("poker-streak-options--disabled");
        if (task.options && task.options.length) {
          for (var k = 0; k < task.options.length; k++) {
            var opt = task.options[k];
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "poker-streak-option";
            btn.textContent = opt.text || "";
            btn.dataset.answerId = opt.id || "";
            btn.dataset.correct = (opt.id === task.correct_answer) ? "1" : "0";
            optionsEl.appendChild(btn);
          }
        }
      }
      if (feedbackEl) feedbackEl.classList.add("poker-streak-feedback--hidden");
      if (timerEl) timerEl.textContent = "0.0";
      var startTime = Date.now();
      timerId = setInterval(function () {
        timeElapsed = (Date.now() - startTime) / 1000;
        if (timerEl) timerEl.textContent = timeElapsed.toFixed(1);
      }, 100);
    }
    function handleAnswer(answerId, isCorrect) {
      if (answered) return;
      answered = true;
      clearTimer();
      if (optionsEl) optionsEl.classList.add("poker-streak-options--disabled");
      var task = tasks[taskIndex];
      var timeTaken = timeElapsed;
      var streakBefore = streak;
      var progCur = getMttProgress();
      var lvlCur = getLevelForPoints(progCur.totalPoints);
      var pts = calculateMttScore(isCorrect, timeTaken, streakBefore, task.level || 1, lvlCur.level);
      if (isCorrect) {
        streak++;
        correctCount++;
        sessionScore += pts;
      } else {
        streak = 0;
      }
      var prog = getMttProgress();
      prog.totalPoints = Math.max(0, prog.totalPoints + pts);
      prog.dailyCompleted++;
      saveMttProgress(prog);
      updateHeader();
      if (feedbackEl) {
        feedbackEl.classList.remove("poker-streak-feedback--hidden");
        if (feedbackResultEl) {
          feedbackResultEl.textContent = isCorrect ? "Правильно!" : "Неправильно";
          feedbackResultEl.className = "poker-streak-feedback__result " + (isCorrect ? "poker-streak-feedback__result--correct" : "poker-streak-feedback__result--wrong");
        }
        if (feedbackScoreEl) feedbackScoreEl.textContent = isCorrect ? "+" + pts + " баллов" : pts + " баллов";
        if (feedbackExplanationEl) feedbackExplanationEl.textContent = task.explanation || "";
      }
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred(isCorrect ? "success" : "error");
    }
    function nextTask() {
      taskIndex++;
      showTask();
    }
    function endGame() {
      if (streakScreen) streakScreen.classList.add("poker-streak-screen--hidden");
      if (resultScreen) {
        resultScreen.classList.remove("poker-streak-result-screen--hidden");
        resultScreen.style.display = "";
        var prog = getMttProgress();
        var lvlInfo = getLevelForPoints(prog.totalPoints);
        if (resultStatsEl) {
          resultStatsEl.innerHTML = "<p><strong>Баллов за сессию:</strong> " + sessionScore + "</p><p><strong>Правильно:</strong> " + correctCount + " / " + tasks.length + "</p><p><strong>Всего баллов:</strong> " + prog.totalPoints + "</p><p><strong>Уровень:</strong> " + lvlInfo.level + " — " + getLevelName(lvlInfo.level) + "</p>";
        }
      }
      if (typeof window.refreshMttStats === "function") window.refreshMttStats();
    }
    function bindOptions() {
      if (!optionsEl) return;
      optionsEl.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest ? e.target.closest(".poker-streak-option") : null;
        if (!btn || answered) return;
        var correct = btn.dataset.correct === "1";
        handleAnswer(btn.dataset.answerId, correct);
      });
    }
    window.startMttChallenge = function () {
      if (typeof MTT_TASKS === "undefined" || !MTT_TASKS.length) {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Задачи не загружены."); else alert("Задачи не загружены.");
        return;
      }
      var prog = getMttProgress();
      if (prog.dailyCompleted >= DAILY_LIMIT) {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Сегодня вы уже выполнили 5 задач. Завтра лимит обновится."); else alert("Сегодня вы уже выполнили 5 задач. Завтра лимит обновится.");
        return;
      }
      var lvlInfo = getLevelForPoints(prog.totalPoints);
      var filtered = MTT_TASKS.filter(function (t) { return t.level <= lvlInfo.level + 1; });
      if (!filtered.length) filtered = MTT_TASKS;
      var toTake = Math.min(DAILY_LIMIT - prog.dailyCompleted, 5, filtered.length);
      tasks = shuffle(filtered).slice(0, toTake);
      taskIndex = 0;
      sessionScore = 0;
      streak = 0;
      correctCount = 0;
      if (startScreen) startScreen.style.display = "none";
      if (resultScreen) { resultScreen.classList.add("poker-streak-result-screen--hidden"); resultScreen.style.display = "none"; }
      streakScreen.classList.remove("poker-streak-screen--hidden");
      streakScreen.style.display = "flex";
      if (view) view.classList.add("poker-tasks--task-visible");
      updateHeader();
      showTask();
    };
    if (nextBtn) nextBtn.addEventListener("click", function (e) { e.preventDefault(); nextTask(); });
    if (backBtn) {
      backBtn.addEventListener("click", function (e) {
        e.preventDefault();
        clearTimer();
        streakScreen.classList.add("poker-streak-screen--hidden");
        if (startScreen) startScreen.style.display = "";
        if (view) view.classList.remove("poker-tasks--task-visible");
        if (typeof window.refreshMttStats === "function") window.refreshMttStats();
      });
    }
    if (playAgainBtn && resultScreen) {
      playAgainBtn.addEventListener("click", function (e) {
        e.preventDefault();
        resultScreen.classList.add("poker-streak-result-screen--hidden");
        resultScreen.style.display = "none";
        window.startMttChallenge();
      });
    }
    bindOptions();
  })();

  (function initRatingSubscribe() {
    var ratingSubscribeBtns = Array.prototype.slice.call(document.querySelectorAll(".rating-subscribe-btn"));
    var RATING_SUBSCRIBED_KEY = "poker_rating_subscribed";
    var ratingInDevHtml = "";
    function setRatingSubscribeButtonState(subscribed) {
      if (!ratingSubscribeBtns.length) return;
      ratingSubscribeBtns.forEach(function (btn) {
        var league = btn.getAttribute("data-spring-league") || "";
        var label;
        if (league === "1") {
          label = subscribed ? "Отписаться от Лиги 1" : "Подписаться на Лигу 1";
        } else if (league === "2") {
          label = subscribed ? "Отписаться от Лиги 2" : "Подписаться на Лигу 2";
        } else {
          label = subscribed ? "Отписаться" : "Подписаться";
        }
        btn.disabled = false;
        btn.innerHTML = "<span>" + label + "</span>" + ratingInDevHtml;
        btn.dataset.subscribed = subscribed ? "1" : "0";
      });
    }
    function updateRatingSubscribeFromStorage() {
      try {
        setRatingSubscribeButtonState(localStorage.getItem(RATING_SUBSCRIBED_KEY) === "1");
      } catch (e) {
        setRatingSubscribeButtonState(false);
      }
    }
    updateRatingSubscribeFromStorage();
    if (ratingSubscribeBtns.length) {
      ratingSubscribeBtns.forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (window.__touchWasScroll && window.__touchWasScroll()) return;
          var initData = (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData) || "";
          if (!initData) {
            var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram, чтобы подписаться."); else alert("Откройте приложение в Telegram, чтобы подписаться.");
            return;
          }
          var subscribed = btn.dataset.subscribed === "1";
          var appEl = document.getElementById("app");
          var base = (appEl && appEl.getAttribute("data-api-base")) || (typeof location !== "undefined" && location.origin) || "";
          var apiUrl = (base ? base.replace(/\/$/, "") : "") + "/api/rating-subscribe";
          ratingSubscribeBtns.forEach(function (b) { b.disabled = true; });
          fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData: initData, unsubscribe: subscribed }),
          })
            .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; }); })
            .then(function (data) {
              if (data && data.ok) {
                try {
                  localStorage.setItem(RATING_SUBSCRIBED_KEY, data.subscribed ? "1" : "0");
                } catch (e) {}
                setRatingSubscribeButtonState(!!data.subscribed);
                var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
                if (tg && tg.showAlert) {
                  tg.showAlert(data.subscribed ? "Подписка оформлена. Уведомления об обновлении рейтинга будут приходить в Telegram." : "Вы отписаны от уведомлений рейтинга.");
                } else {
                  alert(data.subscribed ? "Подписка оформлена." : "Вы отписаны.");
                }
              } else {
                var msg = (data && data.error) || "Ошибка. Попробуйте позже.";
                var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
                if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
                setRatingSubscribeButtonState(subscribed);
              }
            })
            .catch(function () {
              var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
              if (tg && tg.showAlert) tg.showAlert("Сервис временно недоступен. Попробуйте позже."); else alert("Сервис временно недоступен.");
              setRatingSubscribeButtonState(subscribed);
            })
            .finally(function () {
              ratingSubscribeBtns.forEach(function (b) { b.disabled = false; });
            });
        });
      });
    }
  })();

  var tg = window.Telegram && window.Telegram.WebApp;
  var startParam = tg && (tg.initDataUnsafe && tg.initDataUnsafe.start_param || tg.startParam || "");
  if (!startParam && typeof tg === "object" && tg.initData) {
    try {
      var params = new URLSearchParams(tg.initData);
      startParam = params.get("start_param") || "";
    } catch (e) {}
  }
  if (startParam && (startParam === "news" || startParam.indexOf("news_") === 0)) {
    var articleNum = startParam === "news" ? undefined : parseInt(startParam.replace("news_", ""), 10);
    if (startParam !== "news" && (Number.isNaN(articleNum) || articleNum < 0)) articleNum = undefined;
    setTimeout(function () { if (typeof openGazette === "function") openGazette("news", articleNum); }, 300);
  }
  if (startParam === "winter_rating") {
    setTimeout(function () { if (typeof setView === "function") setView("winter-rating"); }, 0);
  }
  if (startParam === "spring_rating") {
    setTimeout(function () { if (typeof setView === "function") setView("spring-rating"); }, 0);
  }
  if (startParam === "spring_rating_league_1" || startParam === "spring_rating_league_2") {
    var leagueNum = startParam === "spring_rating_league_1" ? "1" : "2";
    setTimeout(function () {
      if (typeof setView === "function") setView("spring-rating");
      setTimeout(function () {
        if (typeof window.switchSpringRatingMainTab === "function") window.switchSpringRatingMainTab(leagueNum);
      }, 400);
    }, 0);
  }
  if (startParam && startParam.indexOf("winter_rating_player_") === 0) {
    var playerNick = decodeURIComponent(startParam.replace("winter_rating_player_", "").replace(/\+/g, " "));
    if (playerNick) {
      setTimeout(function () {
        if (typeof setView === "function") setView("winter-rating");
        setTimeout(function () {
          if (typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(playerNick);
        }, 400);
      }, 0);
    }
  }
  if (startParam && startParam.indexOf("spring_rating_player_") === 0) {
    var playerNick = decodeURIComponent(startParam.replace("spring_rating_player_", "").replace(/\+/g, " "));
    if (playerNick) {
      setTimeout(function () {
        if (typeof setView === "function") setView("spring-rating");
        setTimeout(function () {
          if (typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(playerNick);
        }, 400);
      }, 0);
    }
  }
  if (startParam && startParam.indexOf("rating_") === 0 && startParam.indexOf("spring_rating_date_") !== 0) {
    var dateParam = startParam.replace("rating_", "").replace(/_/g, ".");
    setTimeout(function () {
      if (typeof setView === "function") setView("winter-rating");
      setTimeout(function () {
        if (typeof window.openWinterRatingDatePanel === "function") window.openWinterRatingDatePanel(dateParam);
      }, 400);
    }, 0);
  }
  if (startParam && startParam.indexOf("spring_rating_date_") === 0) {
    var dateParam = startParam.replace("spring_rating_date_", "").replace(/_/g, ".");
    setTimeout(function () {
      if (typeof setView === "function") setView("spring-rating");
      setTimeout(function () {
        if (typeof window.openWinterRatingDatePanel === "function") window.openWinterRatingDatePanel(dateParam);
      }, 400);
    }, 0);
  }
  if (startParam === "rating_top_past" || startParam === "rating_top_current" || startParam === "rating_top_february" || startParam === "rating_top_mar") {
    var ratingTopKind = startParam === "rating_top_current" ? "current" : startParam === "rating_top_february" ? "feb" : startParam === "rating_top_mar" ? "feb" : "past";
    var viewForTop = startParam === "rating_top_mar" ? "spring-rating" : "winter-rating";
    setTimeout(function () {
      if (typeof setView === "function") setView(viewForTop);
      setTimeout(function () {
        if (typeof window.openWinterRatingWeekTopModal === "function") window.openWinterRatingWeekTopModal(ratingTopKind);
      }, 350);
    }, 0);
  }
  if (startParam === "daily_prediction") {
    setTimeout(function () {
      if (typeof setView === "function") setView("home");
      setTimeout(function () {
        if (typeof openDailyPredictionModal === "function") openDailyPredictionModal();
      }, 400);
    }, 0);
  }
  if (startParam === "raffles") {
    setTimeout(function () { if (typeof setView === "function") setView("raffles"); }, 0);
  }
  if (startParam === "stream") {
    setTimeout(function () { if (typeof setView === "function") setView("home"); }, 0);
  }
  if (startParam && startParam.indexOf("streams_") === 0) {
    var streamsRoomId = startParam.replace("streams_", "");
    setTimeout(function () {
      if (typeof setView === "function") setView("streams");
      setTimeout(function () {
        var roomInput = document.getElementById("streamsRoomInput");
        if (roomInput && streamsRoomId) roomInput.value = streamsRoomId;
        var watchBtn = document.getElementById("streamsWatchBtn");
        if (watchBtn) watchBtn.click();
      }, 300);
    }, 0);
  }
  if (window.location.hash === "#streams") {
    setTimeout(function () {
      if (typeof setView === "function") setView("streams");
    }, 0);
  }
  if (window.location.hash === "#stream") {
    setTimeout(function () { if (typeof setView === "function") setView("home"); }, 0);
  }
  try {
    var urlStart = typeof location !== "undefined" && location.search ? new URLSearchParams(location.search).get("startapp") : null;
    if (urlStart === "stream") {
      setTimeout(function () { if (typeof setView === "function") setView("home"); }, 0);
    }
  } catch (e) {}
  if (startParam && startParam.indexOf("poker_task_") === 0) {
    setTimeout(function () {
      if (typeof setView === "function") setView("poker-tasks");
      setTimeout(function () {
        if (typeof window.startMttChallenge === "function") window.startMttChallenge();
      }, 400);
    }, 0);
  }
  if (window.location.hash && window.location.hash.indexOf("#poker_task_") === 0) {
    setTimeout(function () {
      if (typeof setView === "function") setView("poker-tasks");
      setTimeout(function () {
        if (typeof window.startMttChallenge === "function") window.startMttChallenge();
      }, 400);
    }, 0);
  }
})();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    runGazetteAndTasksInit();
    updateSpringRatingPromoDateFromVar();
  });
} else {
  runGazetteAndTasksInit();
  updateSpringRatingPromoDateFromVar();
}

setTimeout(function () {
  if (typeof fetchRaffleBadge === "function") fetchRaffleBadge();
}, 300);

// Рейтинг: кнопки «Топы прошлой недели» и «Топы текущей недели» (в кнопке — топ-3, по клику — модалка с полным списком)
(function initWinterRatingWeekTops() {
  var pastBtn = document.getElementById("winterRatingTopPastWeekBtn");
  var currentBtn = document.getElementById("winterRatingTopCurrentWeekBtn");
  var febBtn = document.getElementById("winterRatingTopFebruaryBtn");
  var pastPreview = document.getElementById("winterRatingTopPastWeekPreview");
  var currentPreview = document.getElementById("winterRatingTopCurrentWeekPreview");
  var febPreview = document.getElementById("winterRatingTopFebruaryPreview");
  var singleTopSummary = document.getElementById("winterRatingSingleTopSummary");
  var singleTopList = document.getElementById("winterRatingSingleTopList");
  var modal = document.getElementById("winterRatingWeekTopModal");
  var modalTitle = document.getElementById("winterRatingWeekTopModalTitle");
  var listEl = document.getElementById("winterRatingWeekTopList");
  var modalClose = document.getElementById("winterRatingWeekTopModalClose");
  var modalBackdrop = document.getElementById("winterRatingWeekTopModalBackdrop");
  var shareBtn = document.getElementById("winterRatingWeekTopShareBtn");
  var prizeInfo = document.getElementById("winterRatingWeekTopPrizeInfo");
  if (!pastBtn || !currentBtn || !pastPreview || !currentPreview || !modal || !modalTitle || !listEl) return;
  var currentModalDates = null;
  var currentModalLinkType = null;
  var februaryDatesCache = null;
  function escapePreview(s) {
    return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function previewHtml(top, max) {
    max = max || 3;
    if (!top || !top.length) return "";
    var lines = top.slice(0, max).map(function (r, i) {
      var sum = formatRewardRound(r.totalReward);
      return "<span class=\"winter-rating__week-top-preview-line\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</span>";
    }).join("");
    var ellipsis = top.length > max ? "<span class=\"winter-rating__week-top-preview-ellipsis\">…</span>" : "";
    return lines + ellipsis;
  }
  function getFebruaryDatesFromData() {
    if (februaryDatesCache) return februaryDatesCache;
    var byDate = getRatingByDate();
    if (typeof byDate !== "object" || !Object.keys(byDate).length) return [];
    februaryDatesCache = Object.keys(byDate).filter(function (d) {
      return /\.02\.2026$/.test(d);
    });
    return februaryDatesCache;
  }
  function getMarchDatesFromData() {
    var byDate = getRatingByDate();
    if (typeof byDate !== "object" || !Object.keys(byDate).length) return [];
    return Object.keys(byDate).filter(function (d) { return /\.03\.2026$/.test(d); });
  }
  function getSingleTopWins(allowedDates, limit) {
    var tournamentsByDate = getRatingTournamentsByDate();
    if (typeof tournamentsByDate !== "object" || !Object.keys(tournamentsByDate).length) return [];
    var maxByNick = {};
    Object.keys(tournamentsByDate).forEach(function (dateStr) {
      if (allowedDates && allowedDates.length && allowedDates.indexOf(dateStr) === -1) return;
      var tournaments = tournamentsByDate[dateStr];
      if (!tournaments || !tournaments.length) return;
      tournaments.forEach(function (t) {
        var players = t.players || [];
        players.forEach(function (p) {
          var reward = p.reward != null ? Number(p.reward) : 0;
          if (!reward) return;
          var nick = normalizeWinterNick(p.nick);
          var prev = maxByNick[nick];
          if (!prev || reward > prev.reward) {
            maxByNick[nick] = {
              nick: nick,
              reward: reward,
              date: dateStr,
              tournament: t.name || t.time || ""
            };
          }
        });
      });
    });
    return Object.keys(maxByNick).map(function (nick) { return maxByNick[nick]; })
      .sort(function (a, b) { return b.reward - a.reward; })
      .slice(0, limit || 3);
  }
  function updateButtonPreviews() {
    var pastTop = getTopByDates(GAZETTE_DATES);
    var currentTop = getTopByDates(CURRENT_WEEK_DATES);
    var febDates = isSpringRatingMode() ? getMarchDatesFromData() : getFebruaryDatesFromData();
    var febTop = febDates.length ? getTopByDates(febDates) : [];
    currentPreview.innerHTML = currentTop.length ? previewHtml(currentTop) : "";
    pastPreview.innerHTML = pastTop.length ? previewHtml(pastTop) : "";
    if (febPreview) {
      febPreview.innerHTML = febTop.length ? previewHtml(febTop, 3) : "";
    }
    if (singleTopSummary && singleTopList) {
      var singleTop = getSingleTopWins(null, 3);
      if (singleTop.length) {
        singleTopSummary.textContent = "Самый большой выигрыш за один турнир за 2026: ";
        singleTopList.innerHTML = singleTop.map(function (r, i) {
          var sum = formatRewardRound(r.reward);
          return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " +
            escapePreview(r.nick) + " — " + sum + " ₽</li>";
        }).join("");
      } else {
        singleTopSummary.textContent = "";
        singleTopList.innerHTML = "";
      }
    }
    var marchWrap = document.getElementById("winterRatingMarchWinsWrap");
    var marchSummary = document.getElementById("winterRatingMarchWinsSummary");
    var marchTop3Caption = document.getElementById("winterRatingMarchWinsTop3Caption");
    var marchList = document.getElementById("winterRatingMarchWinsList");
    if (marchWrap && marchSummary && marchList) {
      if (isSpringRatingMode()) {
        var marchData = getSpringRatingMarchTopWins();
        marchWrap.removeAttribute("hidden");
        marchWrap.style.display = "";
        if (marchData.max) {
          marchSummary.textContent = "Самый большой выигрыш за март: " + escapePreview(marchData.max.nick) + " — " + formatRewardRound(marchData.max.reward) + " ₽";
        } else {
          marchSummary.textContent = "Самый большой выигрыш за март: —";
        }
        if (marchTop3Caption) marchTop3Caption.textContent = marchData.top3 && marchData.top3.length ? "Топ-3 выигрыша за март:" : "";
        if (marchData.top3 && marchData.top3.length) {
          marchList.innerHTML = marchData.top3.map(function (r, i) {
            var sum = formatRewardRound(r.reward);
            return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</li>";
          }).join("");
        } else {
          marchList.innerHTML = "";
        }
      } else {
        marchWrap.setAttribute("hidden", "");
        marchWrap.style.display = "none";
      }
    }
    var currentWeekSection = document.getElementById("winterRatingCurrentWeekSection");
    var currentWeekSumWrap = document.getElementById("winterRatingCurrentWeekSumWrap");
    var currentWeekSumList = document.getElementById("winterRatingCurrentWeekSumList");
    var currentWeekTotalBelow = document.getElementById("winterRatingCurrentWeekTotalBelow");
    if (currentWeekSumWrap && currentWeekSumList) {
      if (isSpringRatingMode() && typeof getSpringRatingCurrentWeekTopSum === "function") {
        if (currentWeekSection) {
          currentWeekSection.removeAttribute("hidden");
          currentWeekSection.style.display = "";
        }
        var currentWeekSumData = getSpringRatingCurrentWeekTopSum();
        currentWeekSumWrap.removeAttribute("hidden");
        currentWeekSumWrap.style.display = "";
        if (currentWeekSumData.top3 && currentWeekSumData.top3.length) {
          currentWeekSumList.innerHTML = currentWeekSumData.top3.map(function (r, i) {
            var sum = formatRewardRound(r.reward);
            return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</li>";
          }).join("");
        } else {
          currentWeekSumList.innerHTML = "";
        }
        if (currentWeekTotalBelow) currentWeekTotalBelow.textContent = "Всего выиграно игроками: " + (currentWeekSumData.totalWeek > 0 ? formatRewardRound(currentWeekSumData.totalWeek) + " ₽" : "—");
      } else {
        if (currentWeekSection) {
          currentWeekSection.setAttribute("hidden", "");
          currentWeekSection.style.display = "none";
        }
        currentWeekSumWrap.setAttribute("hidden", "");
        currentWeekSumWrap.style.display = "none";
        if (currentWeekTotalBelow) currentWeekTotalBelow.textContent = "";
      }
    }
    var currentWeekWrap = document.getElementById("winterRatingCurrentWeekWrap");
    var currentWeekList = document.getElementById("winterRatingCurrentWeekList");
    if (currentWeekWrap && currentWeekList) {
      if (isSpringRatingMode() && typeof getSpringRatingCurrentWeekTopWins === "function") {
        var currentWeekData = getSpringRatingCurrentWeekTopWins();
        currentWeekWrap.removeAttribute("hidden");
        currentWeekWrap.style.display = "";
        if (currentWeekData.top3 && currentWeekData.top3.length) {
          currentWeekList.innerHTML = currentWeekData.top3.map(function (r, i) {
            var sum = formatRewardRound(r.reward);
            return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</li>";
          }).join("");
        } else {
          currentWeekList.innerHTML = "";
        }
      } else {
        currentWeekWrap.setAttribute("hidden", "");
        currentWeekWrap.style.display = "none";
      }
    }
    var pastWeekSection = document.getElementById("winterRatingPastWeekSection");
    var pastWeekSumWrap = document.getElementById("winterRatingPastWeekSumWrap");
    var pastWeekSumList = document.getElementById("winterRatingPastWeekSumList");
    var pastWeekTotalBelow = document.getElementById("winterRatingPastWeekTotalBelow");
    if (pastWeekSumWrap && pastWeekSumList) {
      if (isSpringRatingMode() && typeof getSpringRatingPastWeekTopSum === "function") {
        if (pastWeekSection) {
          pastWeekSection.removeAttribute("hidden");
          pastWeekSection.style.display = "";
        }
        var pastWeekSumData = getSpringRatingPastWeekTopSum();
        pastWeekSumWrap.removeAttribute("hidden");
        pastWeekSumWrap.style.display = "";
        if (pastWeekSumData.top3 && pastWeekSumData.top3.length) {
          pastWeekSumList.innerHTML = pastWeekSumData.top3.map(function (r, i) {
            var sum = formatRewardRound(r.reward);
            return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</li>";
          }).join("");
        } else {
          pastWeekSumList.innerHTML = "";
        }
        if (pastWeekTotalBelow) pastWeekTotalBelow.textContent = "Всего выиграно игроками: " + (pastWeekSumData.totalWeek > 0 ? formatRewardRound(pastWeekSumData.totalWeek) + " ₽" : "—");
      } else {
        if (pastWeekSection) {
          pastWeekSection.setAttribute("hidden", "");
          pastWeekSection.style.display = "none";
        }
        pastWeekSumWrap.setAttribute("hidden", "");
        pastWeekSumWrap.style.display = "none";
        if (pastWeekTotalBelow) pastWeekTotalBelow.textContent = "";
      }
    }
    var pastWeekWrap = document.getElementById("winterRatingPastWeekWrap");
    var pastWeekList = document.getElementById("winterRatingPastWeekList");
    if (pastWeekWrap && pastWeekList) {
      if (isSpringRatingMode() && typeof getSpringRatingPastWeekTopWins === "function") {
        var pastWeekData = getSpringRatingPastWeekTopWins();
        pastWeekWrap.removeAttribute("hidden");
        pastWeekWrap.style.display = "";
        if (pastWeekData.top3 && pastWeekData.top3.length) {
          pastWeekList.innerHTML = pastWeekData.top3.map(function (r, i) {
            var sum = formatRewardRound(r.reward);
            return "<li class=\"winter-rating__single-top-item\">" + (i + 1) + ". " + escapePreview(r.nick) + " — " + sum + " ₽</li>";
          }).join("");
        } else {
          pastWeekList.innerHTML = "";
        }
      } else {
        pastWeekWrap.setAttribute("hidden", "");
        pastWeekWrap.style.display = "none";
      }
    }
  }
  window.updateWinterRatingWeekTopPreviews = updateButtonPreviews;
  setTimeout(function () {
    if (window.updateWinterRatingWeekTopPreviews) window.updateWinterRatingWeekTopPreviews();
  }, 0);

  // Админская кнопка «Сообщить в чат об обновлении рейтинга»
  (function initWinterRatingAdminNotify() {
    var btn = document.getElementById("winterRatingNotifyBtn");
    var subsBtn = document.getElementById("winterRatingNotifySubsBtn");
    var hint = document.getElementById("winterRatingNotifyHint");
    if (!btn && !subsBtn) return;
    function updateSpringRatingPromoDateToToday() {
      var el = document.querySelector(".feature--rating-spring-promo .feature__title-updated");
      if (!el) return;
      var now = new Date();
      var dd = String(now.getDate()).padStart(2, "0");
      var mm = String(now.getMonth() + 1).padStart(2, "0");
      var yyyy = now.getFullYear();
      var dateStr = dd + "." + mm + "." + yyyy;
      el.textContent = "обновлено " + dateStr;
      if (typeof SPRING_RATING_UPDATED !== "undefined") {
        SPRING_RATING_UPDATED = dateStr;
      }
    }
    function sendRequest(button, url, body, pendingText, successText, errorPrefix, onSuccess) {
      var base = getApiBase();
      var initData = tg && tg.initData ? tg.initData : "";
      if (!base || !initData) {
        if (hint) hint.textContent = "Нет соединения с сервером или Telegram initData.";
        return;
      }
      var originalText = button.textContent;
      button.disabled = true;
      button.textContent = pendingText;
      if (hint) hint.textContent = "";
      fetch(base + url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.assign({}, body, { initData: initData })),
      })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          if (data && data.ok) {
            if (typeof onSuccess === "function") {
              onSuccess(data);
            } else if (hint) {
              hint.textContent = successText;
            }
          } else {
            if (hint)
              hint.textContent =
                (errorPrefix || "Ошибка") +
                ": " +
                (data && data.error ? data.error : "не удалось отправить");
          }
        })
        .catch(function () {
          if (hint) hint.textContent = (errorPrefix || "Ошибка") + " сети при отправке.";
        })
        .finally(function () {
          button.disabled = false;
          button.textContent = originalText;
        });
    }
    // Обновление текста кнопки подписчиков количеством — вызывается только после проверки админа
    window.updateRatingSubsCount = function () {
      if (!subsBtn) return;
      var base = getApiBase();
      var initData = tg && tg.initData ? tg.initData : "";
      if (!base || !initData) return;
      fetch(
        base +
          "/api/rating-manual-subscribers?stats=1&initData=" +
          encodeURIComponent(initData)
      )
        .then(function (r) {
          if (!r.ok) return Promise.reject(new Error("http " + r.status));
          return r.json();
        })
        .then(function (data) {
          if (!data || !data.ok || typeof data.total !== "number") return;
          var total = data.total;
          var baseText = "Разослать подписчикам рейтинга";
          var current = subsBtn.textContent || baseText;
          var idx = current.indexOf(" (");
          if (idx !== -1) current = current.slice(0, idx);
          subsBtn.textContent = current + " (" + total + ")";
        })
        .catch(function () {});
    };

    if (btn) {
      btn.addEventListener("click", function () {
        sendRequest(
          btn,
          "/api/rating-manual",
          { action: "spring_rating_notify" },
          "Отправляем…",
          "Сообщение отправлено в общий чат.",
          "Ошибка",
          function (data) {
            if (hint) {
              hint.textContent = "Сообщение отправлено в общий чат.";
            }
            updateSpringRatingPromoDateToToday();
          }
        );
      });
    }
    if (subsBtn) {
      subsBtn.addEventListener("click", function () {
        sendRequest(
          subsBtn,
          "/api/rating-manual-subscribers",
          {},
          "Рассылаем…",
          "",
          "Ошибка рассылки",
          function (data) {
            if (!hint) return;
            var sent =
              data && typeof data.sent === "number" && data.sent >= 0 ? data.sent : 0;
            var total =
              data && typeof data.total === "number" && data.total >= 0 ? data.total : 0;
            hint.textContent =
              "Личные сообщения отправлены: " + sent + " из " + total + " подписчиков.";
          }
        );
      });
    }
  })();

  function prizeForPlace(place) {
    if (place === 1) return "5 000 ₽";
    if (place === 2) return "3 000 ₽";
    if (place === 3) return "1 000 ₽";
    return "—";
  }
  function renderTopList(top, dates) {
    currentModalDates = dates;
    var isCurrentWeek = dates === CURRENT_WEEK_DATES;
    if (!top.length) {
      listEl.innerHTML = "<p class=\"winter-rating__week-top-empty\">Нет данных за выбранный период.</p>";
      listEl.classList.remove("winter-rating-week-top-modal__list--with-prize");
      return;
    }
    if (isCurrentWeek) {
      listEl.classList.add("winter-rating-week-top-modal__list--with-prize");
      listEl.innerHTML = "<div class=\"winter-rating__week-top-header\"><span class=\"winter-rating__week-top-num\">№</span><span class=\"winter-rating__week-top-header-nick\">Ник</span><span class=\"winter-rating__week-top-header-reward\">Выигрыш</span><span class=\"winter-rating__week-top-header-prize\">Приз</span></div>" + top.map(function (r, i) {
        var nickEsc = String(r.nick).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
        var nickAttr = String(r.nick).replace(/"/g, "&quot;");
        var sum = formatRewardRound(r.totalReward);
        var prize = prizeForPlace(i + 1);
        return "<div class=\"winter-rating__week-top-item\"><span class=\"winter-rating__week-top-num\">" + (i + 1) + ".</span><button type=\"button\" class=\"winter-rating__nick-btn\" data-nick=\"" + nickAttr + "\">" + nickEsc + "</button><span class=\"winter-rating__week-top-reward\">" + sum + " ₽</span><span class=\"winter-rating__week-top-prize\">" + prize + "</span></div>";
      }).join("");
    } else {
      listEl.classList.remove("winter-rating-week-top-modal__list--with-prize");
      listEl.innerHTML = top.map(function (r, i) {
      var nickEsc = String(r.nick).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      var nickAttr = String(r.nick).replace(/"/g, "&quot;");
      var sum = formatRewardRound(r.totalReward);
      return "<div class=\"winter-rating__week-top-item\"><span class=\"winter-rating__week-top-num\">" + (i + 1) + ".</span><button type=\"button\" class=\"winter-rating__nick-btn\" data-nick=\"" + nickAttr + "\">" + nickEsc + "</button><span class=\"winter-rating__week-top-reward\">" + sum + " ₽</span></div>";
      }).join("");
  }
  }
  function openModal(panelTitle, dates, linkType) {
    var top = getTopByDates(dates);
    modalTitle.textContent = panelTitle;
    renderTopList(top, dates);
    if (linkType) {
      currentModalLinkType = linkType;
    } else {
      currentModalLinkType = dates === CURRENT_WEEK_DATES ? "current" : "past";
    }
    if (prizeInfo) {
      var isCurrent = currentModalLinkType === "current";
      prizeInfo.style.display = isCurrent ? "" : "none";
      prizeInfo.setAttribute("aria-hidden", isCurrent ? "false" : "true");
    }
    var shareRow = shareBtn ? shareBtn.closest(".winter-rating-week-top-modal__share-row") : null;
    if (shareRow) {
      shareRow.style.display = (typeof isSpringRatingMode === "function" && isSpringRatingMode() && linkType === "past") ? "none" : "";
    }
    modal.setAttribute("aria-hidden", "false");
    if (document.body) document.body.style.overflow = "hidden";
  }
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var type = currentModalLinkType === "current"
        ? "rating_top_current"
        : currentModalLinkType === "mar"
          ? "rating_top_mar"
          : currentModalLinkType === "feb"
            ? "rating_top_february"
            : "rating_top_past";
      var link = appUrl + "?startapp=" + type;
      var msg = type === "rating_top_current"
        ? "Ссылка скопирована. Отправьте другу — откроется блок «Топы текущей недели»."
        : "Ссылка скопирована. Отправьте другу — откроется этот топ.";
      if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert(msg); else alert("Ссылка скопирована.");
        }).catch(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        });
      } else {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
      }
    });
  }
  // Кнопки «Поделиться» для весенних лиг находятся внутри блоков лиг (winter-rating__spring-league-share),
  // отдельная общая кнопка под итоговой таблицей отключена.
  window.openWinterRatingWeekTopModal = function (kind) {
    if (kind === "current") openModal("Топы текущей недели", CURRENT_WEEK_DATES, "current");
    else if (kind === "past") openModal("Топы прошлой недели", GAZETTE_DATES, "past");
    else if (kind === "feb") {
      if (isSpringRatingMode()) openModal("Топы Марта", getMarchDatesFromData(), "mar");
      else openModal("Топы Февраля", getFebruaryDatesFromData(), "feb");
    }
  };
  function closeModal() {
    modal.setAttribute("aria-hidden", "true");
    if (document.body) document.body.style.overflow = "";
  }
  currentBtn.addEventListener("click", function () {
    if (isSpringRatingMode() && SPRING_TOP_LINK_BASE) {
      var sep = SPRING_TOP_LINK_BASE.indexOf("?") >= 0 ? "&" : "?";
      var link = SPRING_TOP_LINK_BASE + sep + "Mart_week_1=1";
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(link);
      else window.open(link, "_blank");
      return;
    }
    openModal("Топы текущей недели", CURRENT_WEEK_DATES, "current");
  });
  pastBtn.addEventListener("click", function () {
    openModal("Топы прошлой недели", GAZETTE_DATES, "past");
  });
  if (febBtn) {
    febBtn.addEventListener("click", function () {
      if (isSpringRatingMode() && SPRING_TOP_LINK_BASE) {
        var sep = SPRING_TOP_LINK_BASE.indexOf("?") >= 0 ? "&" : "?";
        var link = SPRING_TOP_LINK_BASE + sep + "mart=1";
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.openTelegramLink) tg.openTelegramLink(link);
        else window.open(link, "_blank");
        return;
      }
      if (isSpringRatingMode()) openModal("Топы Марта", getMarchDatesFromData(), "mar");
      else openModal("Топы Февраля", getFebruaryDatesFromData(), "feb");
    });
  }
  if (modalClose) modalClose.addEventListener("click", closeModal);
  if (modalBackdrop) modalBackdrop.addEventListener("click", closeModal);
  listEl.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest(".winter-rating__nick-btn") : null;
    if (!btn || !btn.dataset.nick) return;
    e.preventDefault();
    if (typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(btn.dataset.nick, { onlyDates: currentModalDates || GAZETTE_DATES, skipGazetteStyle: true });
  });
})();

// Восстановление скролла при «Назад» (чтобы body не оставался overflow: hidden после модалок)
window.addEventListener("popstate", function () {
  if (document.body) {
    document.body.style.overflow = "";
    document.body.style.position = "";
  }
});

// Инициализация Telegram WebApp (если открыто внутри Telegram)
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

if (tg) {
  tg.ready();
  if (tg.expand) tg.expand();
  if (typeof tg.disableVerticalSwipes === "function") tg.disableVerticalSwipes();
  // По ссылке t.me/Poker_dvatuza_bot/DvaTuza всегда открываем в полный экран.
  // Повторные вызовы expand() с задержкой и при событиях помогают развернуть на части устройств.
  function tryExpand() {
    if (tg.expand) tg.expand();
  }
  setTimeout(tryExpand, 100);
  setTimeout(tryExpand, 400);
  setTimeout(tryExpand, 800);
  setTimeout(tryExpand, 1500);
  if (tg.onEvent && typeof tg.onEvent === "function") {
    tg.onEvent("viewportChanged", function (e) {
      if (e && e.isStateStable) tryExpand();
    });
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") tryExpand();
  });
  window.addEventListener("pageshow", function (e) {
    if (e.persisted) tryExpand();
  });
  document.addEventListener("click", function expandOnFirstClick() {
    tryExpand();
    document.removeEventListener("click", expandOnFirstClick);
  }, { once: true, capture: true });
  document.addEventListener("touchstart", function expandOnFirstTouch() {
    tryExpand();
    document.removeEventListener("touchstart", expandOnFirstTouch);
  }, { once: true, passive: true, capture: true });
  // requestFullscreen() не вызываем: после него на части устройств (iOS) перестают работать клики по кнопкам
  // Адаптация под тему Telegram
  const themeParams = tg.themeParams || {};
  if (themeParams.bg_color) {
    document.documentElement.style.setProperty(
      "--bg-color",
      themeParams.bg_color
    );
  }
  // Не перенаправляем в чат бота при открытии — приложение должно запускаться с первого нажатия
}

(function setRandomListenersCount() {
  var el = document.getElementById("headerRadioListenersCount");
  if (el) el.textContent = Math.floor(Math.random() * (15 - 7 + 1)) + 7;
})();

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
    if (el) {
      var u = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      el.textContent = u && u.first_name ? "Привет, " + u.first_name + "!" : "Привет, Роман";
    }
    var idEl = document.getElementById("headerUserId");
    if (idEl) {
      var cached = sessionStorage.getItem("poker_dt_id") || (typeof localStorage !== "undefined" && localStorage.getItem("poker_dt_id"));
      idEl.textContent = cached || "\u2014";
    }
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

// На главной при загрузке — класс для layout без :has() (устройства без поддержки, убирает отступ внизу)
(function () {
  var initialView = document.querySelector(".view--active[data-view]");
  var viewName = initialView ? initialView.getAttribute("data-view") : "";
  if (viewName === "home") {
    document.documentElement.classList.add("app-view-home");
  }
})();

function scrollHomeToTop() {
  if (!document.body || (document.body.getAttribute && document.body.getAttribute("data-view") !== "home")) return;
  try {
    window.scrollTo(0, 0);
    if (document.documentElement && document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    var el = document.scrollingElement;
    if (el && el.scrollTop !== 0) el.scrollTop = 0;
  } catch (e) {}
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    scrollHomeToTop();
    setTimeout(scrollHomeToTop, 50);
    setTimeout(scrollHomeToTop, 300);
  });
} else {
  scrollHomeToTop();
  setTimeout(scrollHomeToTop, 50);
  setTimeout(scrollHomeToTop, 300);
}
window.addEventListener("pageshow", function (e) {
  if (e && e.persisted) scrollHomeToTop();
});

// Предсказание на день: тексты (расширенный список), без префиксов «День N»
var POKER_DAILY_PREDICTIONS = [
  "Сегодня твои тузы будут вести себя как короли на балу — все им кланяются, но помни: даже короли иногда проигрывают революцию.",
  "Твои JJ сегодня — как два надежных друга: они всегда рядом, но иногда предают в самый неподходящий момент.",
  "Сегодня ты на кнопке — как шеф-повар на кухне: все ингредиенты под рукой, но не пересоли с агрессией.",
  "Твой стил сегодня — как грабитель в бархатных перчатках: тихо, элегантно, но иногда попадаешь на сигнализацию.",
  "Твои блайнды сегодня — как крепостные стены: иногда их нужно защищать, даже если внутри только мыши и паутина.",
  "Малый блайнд сегодня — как младший брат: всегда первый в драке, но редко выходит победителем.",
  "Большой блайнд сегодня — как старый дуб: крепко стоит на своем, но молния может ударить в любую минуту.",
  "Сегодня твой колл против кнопки — как танго с незнакомцем: страшно, но интригующе.",
  "Твой большой блайнд против кат-оффа — как медведь в берлоге: кажется, спит, но проснется в самый неожиданный момент.",
  "Твой 3-бет сегодня — как дорогое вино: чем старше, тем лучше, но не всем по вкусу.",
  "Сегодня твой блефовый 3-бет — как фокусник: все видят, но никто не верит своим глазам.",
  "Когда тебе делают 3-бет — как на экзамене: знаешь ответ, но боишься ошибиться.",
  "Сегодня твой 3-бет/фолд — как романтическое свидание: идешь с надеждой, но готов уйти при первых признаках проблем.",
  "Твой 4-бет сегодня — как ядерная кнопка: мощно, эффектно, но использовать можно только раз.",
  "Сегодня твой блефовый 4-бет — как прыжок с парашютом: страшно, но адреналин того стоит.",
  "Когда тебе делают 4-бет — как встреча с призраком: не веришь, но дрожь по спине пробегает.",
  "Сегодня твоя префлоп-война — как шахматная партия: каждый ход просчитан, но соперник может сделать неожиданный.",
  "Твой стил сегодня — как искусный вор: не просто берет, а оставляет визитную карточку.",
  "Сегодня война блайндов — как соседские склоки: много шума, но мало смысла.",
  "Твой сквиз сегодня — как бутерброд с колбасой: чем больше слоев, тем вкуснее.",
  "Сегодня твой стил против лимперов — как сбор грибов в лесу: много мусора, но иногда находишь белый.",
  "Война блайндов сегодня — как детская драка: много крика, но никто не пострадает.",
  "Твой позиционный 3-бет — как удар с правого фланга: неожиданно, точно, болезненно.",
  "3-бет с кнопки сегодня — как домашнее задание: делать лень, но надо.",
  "3-бет с кат-оффа — как утренний кофе: бодрит, но может обжечь.",
  "Сегодня твой 3-бет против кат-оффа — как спор двух профессоров: умно, но непонятно.",
  "Твой чек-рейз сегодня — как засада в лесу: тихо ждешь, потом БАЦ!",
  "Чек-рейз на флопе — как сюрприз на день рождения: все ждут, но всё равно удивляются.",
  "На сухом флопе твой чек-рейз — как дождь в пустыне: редкий, но жизненно важный.",
  "3-бет из малого блайнда — как вызов на дуэль: благородно, но опасно.",
  "Сквиз из малого блайнда — как выход из запасного выхода: неожиданно, но эффективно.",
  "Когда у тебя AA, а на флопе 7-8-9 — твои тузы как котик в коробке: милые, но совершенно беспомощные. Расслабься, это просто раздача.",
  "JJ в ранней позиции — как крючки на тонкой леске: выглядят крепко, но могут оборваться в самый важный момент.",
  "Сидеть на кнопке с 7-2o и думать «ну я же в позиции» — как выйти на балкон без парапета: формально вид красивый, но шаг в сторону и всё.",
  "Стил с CO и украденные блайнды — как ограбление века в микроскопе: ощущаешь себя Оушеном, хотя забрал всего пару фишек.",
  "Защищать BB с 9-3o в надежде увидеть флоп 9-9-3 — как ждать единорога в метро: теория не запрещает, но практика смеётся.",
  "Малый блайнд — как младший брат в драке: первый вписывается, первый получает по шапке. Иногда лучше просто отойти в сторону.",
  "Защищать большой блайнд как мать-одиночка — благородно, но помни: банк не даёт алименты за каждый колл.",
  "Колл с 6-4s против кнопки «ну это же дро» — как вера в предвыборные обещания: звучит красиво, но редко доезжает.",
  "Колл с любыми двумя против поздней позиции — как игра в угадайку: кажется, что он блефует, но чаще всего это просто вэлью.",
  "3-бет с QQ и ощущение супергероя — классика жанра, но где-то рядом уже поджидают злодеи с KK и AA.",
  "3-бет блеф с 7-2o «я читаю его как книгу» — как перепутать роман с инструкцией к микроволновке: буквы те же, смысл другой.",
  "Когда тебе прилетает 3-бет и начинается внутренняя паника — просто дыши глубже: иногда лучший мув — честный фолд.",
  "Сделал 3-бет и получил 4-бет — это как выйти в центр сцены и забыть текст: хочется продолжить, но иногда лучше поклониться и уйти.",
  "4-бет с AA — как молитва о колле: половину раз срабатывает, а вторую половину тебе просто уважаемо скидывают.",
  "4-бет блеф — как прыжок без проверки парашюта: если раскроется — легенда, если нет — учебный спот для разбора.",
  "Получить 4-бет и думать «ну теперь-то точно AA» — как смотреть ужастик в десятый раз: знаешь концовку, но все равно страшно.",
  "Префлопная война 3-бет/4-бет — как дуэль на рассвете: красиво со стороны, но кому-то всё равно придётся упасть.",
  "Стилить как профессионал «тихо и незаметно» — это идеал, но в реальности тебя выдают звук фишек и лишний таймбанк.",
  "Война блайндов — как ссора соседей: много шума, царапин и эмоций, а в итоге оба остаются немного в минусе."
];

function getDailyPredictionStorage() {
  try {
    var raw = localStorage.getItem("poker_daily_prediction_state");
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveDailyPredictionStorage(state) {
  try {
    localStorage.setItem("poker_daily_prediction_state", JSON.stringify(state));
  } catch (e) {}
}

function getTodayKey() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function ensureTodayPredictionState() {
  var key = getTodayKey();
  var state = getDailyPredictionStorage();
  var index;
  if (state && state.date === key && typeof state.index === "number") {
    index = state.index;
  } else {
    var prevIndex = state && typeof state.index === "number" ? state.index : null;
    if (!POKER_DAILY_PREDICTIONS.length) {
      index = 0;
    } else {
      index = Math.floor(Math.random() * POKER_DAILY_PREDICTIONS.length);
      if (POKER_DAILY_PREDICTIONS.length > 1 && prevIndex != null && index === prevIndex) {
        index = (index + 1) % POKER_DAILY_PREDICTIONS.length;
      }
    }
    state = { date: key, index: index, read: false };
    saveDailyPredictionStorage(state);
  }
  return state;
}

function getPokerDailyPredictionForToday() {
  var state = ensureTodayPredictionState();
  return POKER_DAILY_PREDICTIONS[state.index] || "";
}

function markDailyPredictionRead() {
  var state = ensureTodayPredictionState();
  if (!state.read) {
    state.read = true;
    saveDailyPredictionStorage(state);
  }
}

function updateDailyPredictionBadge() {
  var badge = document.getElementById("dailyPredictionBadge");
  var preview = document.getElementById("dailyPredictionPreview");
  if (!badge) return;
  var state = ensureTodayPredictionState();
  var unread = !state.read;
  badge.classList.toggle("feature__badge--hidden", !unread);
  badge.setAttribute("aria-hidden", unread ? "false" : "true");
  if (preview && !unread) {
    preview.textContent = "Совет на сегодня уже открыт";
  }
}

var dailyPredictionTimerId = null;

function formatMsToHms(ms) {
  if (ms < 0) ms = 0;
  var totalSec = Math.floor(ms / 1000);
  var h = Math.floor(totalSec / 3600);
  var m = Math.floor((totalSec % 3600) / 60);
  var s = totalSec % 60;
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  return pad(h) + ":" + pad(m) + ":" + pad(s);
}

function updateDailyPredictionTimer() {
  var el = document.getElementById("dailyPredictionTimer");
  if (!el) return;
  var now = new Date();
  var tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  var diff = tomorrow - now;
  el.textContent = "Следующее через " + formatMsToHms(diff);
}

function startDailyPredictionTimer() {
  updateDailyPredictionTimer();
  if (dailyPredictionTimerId) clearInterval(dailyPredictionTimerId);
  dailyPredictionTimerId = setInterval(updateDailyPredictionTimer, 1000);
}

function stopDailyPredictionTimer() {
  if (dailyPredictionTimerId) {
    clearInterval(dailyPredictionTimerId);
    dailyPredictionTimerId = null;
  }
}

function scrollHomeToTop() {
  if (!document.body || (document.body.getAttribute && document.body.getAttribute("data-view") !== "home")) return;
  try {
    window.scrollTo(0, 0);
    if (document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
    if (document.body.scrollTop !== 0) document.body.scrollTop = 0;
    var el = document.scrollingElement;
    if (el && el.scrollTop !== 0) el.scrollTop = 0;
  } catch (e) {}
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", function () {
    scrollHomeToTop();
    setTimeout(scrollHomeToTop, 50);
    setTimeout(scrollHomeToTop, 300);
  });
} else {
  scrollHomeToTop();
  setTimeout(scrollHomeToTop, 50);
  setTimeout(scrollHomeToTop, 300);
}
window.addEventListener("pageshow", function (e) {
  if (e.persisted) scrollHomeToTop();
});

function playClickSound() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = window.__clickAudioCtx;
    if (!ctx) ctx = window.__clickAudioCtx = new Ctx();
    if (ctx.state === "suspended") ctx.resume();
    var now = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(80, now + 0.03);
    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch (err) {}
}

function tryChillRadioPlay() {
  var mode = localStorage.getItem("chill_radio_mode") || "";
  if (mode !== "chill" && mode !== "lounge" && mode !== "90s" && mode !== "radio7") return;
  var radio = document.getElementById("chillRadio");
  if (!radio) return;
  var urls = { chill: "https://ice2.somafm.com/groovesalad-128-mp3", lounge: "https://ice5.somafm.com/illstreet-128-mp3", "90s": "https://nostalgiafm.hostingradio.ru:8014/nostalgiafm.mp3", radio7: "https://stream.rcast.net/263744" };
  if (urls[mode]) radio.src = urls[mode];
  var p = radio.play();
  if (p && typeof p.then === "function") p.catch(function () {});
}

function setView(viewName) {
  if (document.body) {
    document.body.style.overflow = "";
    document.body.style.position = "";
    document.body.setAttribute("data-view", viewName || "");
  }
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
      tryChillRadioPlay();
    } else {
      footer.classList.add("card__footer--hidden");
    }
  }
  if (viewName === "home") {
    initPokerShowsPlayer();
    if (typeof updateTournamentDayBlock === "function") updateTournamentDayBlock();
    if (!window.chatListenersAttached && typeof initChat === "function") {
      var idle = window.requestIdleCallback || function (cb) { setTimeout(cb, 100); };
      idle(function () { initChat(); });
    }
  }
  if (viewName === "chat") {
    if (!window.chatListenersAttached && typeof initChat === "function") {
      var idleChat = window.requestIdleCallback || function (cb) { setTimeout(cb, 100); };
      idleChat(function () { initChat(); });
    } else if (window.chatListenersAttached && typeof window.chatShowDialogs === "function") {
      window.chatShowDialogs();
    }
  }
  if (viewName === "winter-rating") {
    var winterView = document.querySelector('[data-view="winter-rating"]');
    var springView = document.querySelector('[data-view="spring-rating"]');
    var ratingSection = document.getElementById("winterRatingSection");
    var springPlaceholder = document.getElementById("springRatingSectionPlaceholder");
    if (ratingSection && springPlaceholder && ratingSection.classList.contains("spring-rating")) {
      ratingSection.classList.remove("spring-rating");
      if (winterView) winterView.appendChild(ratingSection);
    }
    try {
      initWinterRating();
    } catch (err) {
      if (typeof console !== "undefined" && console.error) console.error("initWinterRating", err);
    }
  }
  if (viewName === "spring-rating") {
    var winterView = document.querySelector('[data-view="winter-rating"]');
    var ratingSection = document.getElementById("winterRatingSection");
    var springPlaceholder = document.getElementById("springRatingSectionPlaceholder");
    if (ratingSection && springPlaceholder && winterView && ratingSection.parentNode === winterView) {
      winterView.removeChild(ratingSection);
      ratingSection.classList.add("spring-rating");
      springPlaceholder.appendChild(ratingSection);
    } else if (ratingSection && !ratingSection.classList.contains("spring-rating")) {
      ratingSection.classList.add("spring-rating");
    }
    try {
      initWinterRating();
    } catch (err) {
      if (typeof console !== "undefined" && console.error) console.error("initWinterRating", err);
    }
  }
  if (viewName === "profile") {
    updateProfileUserName();
    updateProfileDtId();
    initProfileP21Id();
    initProfilePersonal();
    initProfileAvatar();
    syncProfileStatusVisual();
    loadProfileRespect();
    initProfileFriends();
  }
  if (viewName === "streams") {
    initStreams();
  } else {
    if (typeof streamsCleanup === "function") streamsCleanup();
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
  if (viewName === "equilator") initEquilator();
  if (viewName === "video-lessons") initVideoLessons();
  if (viewName === "poker-tasks") {
    var startScreen = document.getElementById("pokerTasksStartScreen");
    var streakScreen = document.getElementById("pokerStreakScreen");
    var resultScreen = document.getElementById("pokerStreakResultScreen");
    var pokerTasksView = document.querySelector('[data-view="poker-tasks"]');
    if (startScreen) startScreen.style.display = "";
    if (streakScreen) {
      streakScreen.classList.add("poker-streak-screen--hidden");
      streakScreen.style.display = "none";
    }
    if (resultScreen) {
      resultScreen.classList.add("poker-streak-result-screen--hidden");
      resultScreen.style.display = "none";
    }
    if (pokerTasksView) pokerTasksView.classList.remove("poker-tasks--task-visible");
    if (typeof window.refreshMttStats === "function") window.refreshMttStats();
  }
  var headerGreeting = document.getElementById("headerGreeting");
  var headerSwitcherWrap = document.getElementById("headerChatSwitcherWrap");
  var greetingWrap = headerGreeting && headerGreeting.closest(".header-greeting-wrap");
  if (greetingWrap) greetingWrap.classList.toggle("header-greeting--hidden", viewName === "chat");
  if (headerSwitcherWrap) headerSwitcherWrap.classList.toggle("header-chat-switcher--hidden", viewName !== "chat");
  if (viewName === "chat") {
    document.documentElement.classList.add("app-view-chat");
    document.documentElement.classList.remove("app-view-winter-rating", "app-view-home");
    updateChatNavDot();
    if (window.chatListenersAttached && typeof window.chatRefresh === "function") {
      window.chatRefresh();
    } else {
      initChat();
    }
  } else if (viewName === "winter-rating") {
    document.documentElement.classList.remove("app-view-chat", "app-view-home", "app-view-spring-rating");
    document.documentElement.classList.add("app-view-winter-rating");
  } else if (viewName === "spring-rating") {
    document.documentElement.classList.remove("app-view-chat", "app-view-home", "app-view-winter-rating");
    document.documentElement.classList.add("app-view-spring-rating");
  } else if (viewName === "home") {
    document.documentElement.classList.remove("app-view-chat", "app-view-winter-rating", "app-view-spring-rating");
    document.documentElement.classList.add("app-view-home");
    var ratingSection = document.getElementById("winterRatingSection");
    var winterView = document.querySelector('[data-view="winter-rating"]');
    var springPlaceholder = document.getElementById("springRatingSectionPlaceholder");
    if (ratingSection && ratingSection.classList.contains("spring-rating") && winterView && springPlaceholder && ratingSection.parentNode === springPlaceholder) {
      ratingSection.classList.remove("spring-rating");
      springPlaceholder.removeChild(ratingSection);
      winterView.appendChild(ratingSection);
    }
  } else {
    document.documentElement.classList.remove("app-view-chat", "app-view-winter-rating", "app-view-spring-rating", "app-view-home");
    var ratingSection = document.getElementById("winterRatingSection");
    var winterView = document.querySelector('[data-view="winter-rating"]');
    var springPlaceholder = document.getElementById("springRatingSectionPlaceholder");
    if (ratingSection && ratingSection.classList.contains("spring-rating") && winterView && springPlaceholder && ratingSection.parentNode === springPlaceholder) {
      ratingSection.classList.remove("spring-rating");
      springPlaceholder.removeChild(ratingSection);
      winterView.appendChild(ratingSection);
    }
  }
  var appEl = document.getElementById("app");
  if (appEl) appEl.classList.toggle("app--view-home", viewName === "home");
}
function updateChatNavDot() {
  var raw = (window.chatGeneralUnreadCount || 0) + (window.chatPersonalUnreadCount || 0);
  if (raw === 0 && (window.chatGeneralUnread || window.chatPersonalUnread)) raw = 1;
  var count = raw > 0 ? Math.max(1, Math.floor(raw / 2)) : 0;
  var badge = document.getElementById("chatNavBadge");
  if (badge) {
    var display = count > 99 ? "99+" : (count > 0 ? String(count) : "0");
    badge.textContent = display;
    badge.classList.toggle("bottom-nav__badge--on", count > 0);
    badge.setAttribute("aria-label", count > 0 ? "Непрочитанных: " + count : "Нет непрочитанных");
  }
}

function updateRaffleBadge(hasActive) {
  var badge = document.getElementById("raffleActiveBadge");
  if (badge) badge.classList.toggle("feature__badge--hidden", !hasActive);
}

var MAIN_VIEW_ORDER = ["home", "chat", "download", "cashout", "profile"];
var SWIPE_MIN_DIST = 60;
var SWIPE_MAX_VERTICAL_RATIO = 0.6;

(function initSwipeNav() {
  var startX = 0;
  var startY = 0;
  function getCurrentView() {
    var active = document.querySelector(".view--active[data-view]");
    return active ? active.getAttribute("data-view") : null;
  }
  function goToAdjacent(direction) {
    var current = getCurrentView();
    var idx = MAIN_VIEW_ORDER.indexOf(current);
    if (idx < 0) return;
    if (direction === 1 && idx < MAIN_VIEW_ORDER.length - 1) {
      setView(MAIN_VIEW_ORDER[idx + 1]);
    } else if (direction === -1 && idx > 0) {
      setView(MAIN_VIEW_ORDER[idx - 1]);
    }
  }
  function onTouchStart(e) {
    if (e.touches.length !== 1) return;
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }
  function onTouchEnd(e) {
    if (e.changedTouches.length !== 1) return;
    var current = getCurrentView();
    if (MAIN_VIEW_ORDER.indexOf(current) < 0) return;
    var endX = e.changedTouches[0].clientX;
    var endY = e.changedTouches[0].clientY;
    var dx = endX - startX;
    var dy = endY - startY;
    var absDx = Math.abs(dx);
    var absDy = Math.abs(dy);
    if (absDx < SWIPE_MIN_DIST) return;
    if (absDy > absDx * SWIPE_MAX_VERTICAL_RATIO) return;
    e.preventDefault();
    if (dx < 0) goToAdjacent(1);
    else goToAdjacent(-1);
  }
  var card = document.querySelector(".card");
  if (card) {
    card.addEventListener("touchstart", onTouchStart, { passive: true });
    card.addEventListener("touchend", onTouchEnd, { passive: false });
  }
})();

// Рейтинг Турнирщиков зимы — 01.12 по конец февраля. Логика баллов: см. «Хпокер баллы» (XPOKER_BALLS / winterRatingPointsForPlace).
// Учитывать данные и с синих, и с красных скринов. Синий скрин («Игровые данные»): призовые в наших единицах = выигрыш из скрина × 100. Красный скрин: призовые так же (выигрыш × 100), места и игроки — как на скрине.
var WINTER_RATING_START = new Date(2025, 11, 1);  // 01.12.2025
var WINTER_RATING_END = new Date(2026, 1, 28);    // последний день февраля 2026

function getWinterRatingCounters() {
  var startMs, endMs;
  if (isSpringRatingMode()) {
    startMs = new Date(2026, 2, 1).getTime();
    endMs = new Date(2026, 4, 31).getTime();
  } else {
    startMs = WINTER_RATING_START.getTime();
    endMs = WINTER_RATING_END.getTime();
  }
  var oneDay = 24 * 3600 * 1000;
  var totalDays = Math.round((endMs - startMs) / oneDay) + 1;
  var today;
  try {
    var moscowDateStr = new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" }).slice(0, 10);
    var parts = moscowDateStr.split("-");
    today = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  } catch (e) {
    today = new Date();
  }
  var todayMs = today.getTime();
  var daysPassed, daysLeft;
  if (todayMs < startMs) {
    daysPassed = 0;
    daysLeft = totalDays;
  } else if (todayMs > endMs) {
    daysPassed = totalDays;
    daysLeft = 0;
  } else {
    daysPassed = Math.round((todayMs - startMs) / oneDay) + 1;
    daysLeft = Math.round((endMs - todayMs) / oneDay);
  }
  return { daysPassed: daysPassed, daysLeft: daysLeft, totalDays: totalDays };
}
var WINTER_RATING_BY_DATE = {
  "31.01.2026": [
    { nick: "ПокерМанки", points: 135, reward: 24528 },
    { nick: "Prokopenya", points: 110, reward: 13063 },
    { nick: "Фокс", points: 135, reward: 25553 },
    { nick: "Shkarubo", points: 90, reward: 7917 },
    { nick: "Аспирин", points: 70, reward: 4914 },
    { nick: "vnukshtukatura", points: 70, reward: 77911 },
    { nick: "Playerx6a7nB", points: 60, reward: 4930 },
    { nick: "WiNifly", points: 90, reward: 11200 },
    { nick: "DimassikFiskk", points: 180, reward: 25100 },
    { nick: "m014yH", points: 135, reward: 27000 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "MTTwnik", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
  ],
  "30.01.2026": [
    { nick: "Waaar", points: 270, reward: 103320 },
    { nick: "Salamandr", points: 135, reward: 17300 },
    { nick: "KOL1103", points: 180, reward: 28700 },
    { nick: "Coo1er91", points: 180, reward: 18625 },
    { nick: "Бабник", points: 90, reward: 7695 },
    { nick: "ПокерМанки", points: 50, reward: 1041 },
    { nick: "бурят", points: 0, reward: 731 },
    { nick: "Nuts", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
  ],
  "29.01.2026": [
    { nick: "ПокерМанки", points: 245, reward: 44040 },
    { nick: "FrankL", points: 245, reward: 36200 },
    { nick: "MEVRIK", points: 110, reward: 21699 },
    { nick: "FrankL", points: 110, reward: 14425 },
    { nick: "Waaar", points: 90, reward: 14000 },
    { nick: "Coo1er91", points: 90, reward: 6000 },
    { nick: "comotd", points: 70, reward: 5884 },
    { nick: "Sarmat1305", points: 60, reward: 5227 },
    { nick: "Mike Tyson", points: 50, reward: 1147 },
    { nick: "Milan", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "ВИВА", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
  ],
  "28.01.2026": [
    { nick: "FrankL", points: 135, reward: 19500 },
    { nick: "ПокерМанки", points: 110, reward: 11680 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 0 },
  ],
  "27.01.2026": [
    { nick: "Waaar", points: 200, reward: 21463 },
    { nick: "ПокерМанки", points: 195, reward: 28356 },
    { nick: "Бабник", points: 135, reward: 52516 },
    { nick: "Nuts", points: 135, reward: 25900 },
    { nick: "WiNifly", points: 90, reward: 10500 },
    { nick: "KOL1103", points: 0, reward: 338 },
    { nick: "@Felix", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 1688 },
    { nick: "Hakas", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
    { nick: "Nitrino", points: 0, reward: 0 },
    { nick: "Salamander", points: 0, reward: 0 },
    { nick: "Марико", points: 0, reward: 0 },
  ],
  "26.01.2026": [
    { nick: "ПокерМанки", points: 135, reward: 57163 },
    { nick: "MilkyWay77", points: 110, reward: 17884 },
    { nick: "Фокс", points: 110, reward: 34857 },
    { nick: "Waaar", points: 60, reward: 12347 },
    { nick: "Рамиль01", points: 50, reward: 10631 },
    { nick: "Rifa", points: 0, reward: 2138 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
    { nick: "Марико", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
  ],
  "25.01.2026": [
    { nick: "ВИВА", points: 135, reward: 25900 },
    { nick: "m0l4yH", points: 110, reward: 17500 },
    { nick: "Coo1er91", points: 120, reward: 10681 },
    { nick: "Фокс", points: 110, reward: 130072 },
    { nick: "comotd", points: 110, reward: 16423 },
    { nick: "Prushnik", points: 90, reward: 10500 },
    { nick: "KOL1103", points: 90, reward: 14533 },
    { nick: "Бабник", points: 60, reward: 55903 },
    { nick: "Аспирин", points: 50, reward: 1350 },
    { nick: "Ksuha", points: 0, reward: 2166 },
    { nick: "Waaar", points: 0, reward: 338 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Madmax13", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "Xays..", points: 0, reward: 0 },
    { nick: "Sarmat1305", points: 0, reward: 14761 },
    { nick: "Тритоныч", points: 0, reward: 10884 },
    { nick: "kriaks", points: 0, reward: 0 },
  ],
  "24.01.2026": [
    { nick: "Waaar", points: 135, reward: 16300 },
    { nick: "Sarmat1305", points: 60, reward: 5029 },
    { nick: "This.Way", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Player180431", points: 0, reward: 0 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
  ],
  "23.01.2026": [
    { nick: "Prushnik", points: 135, reward: 35000 },
    { nick: "Rifa", points: 135, reward: 50659 },
    { nick: "Em13!!", points: 135, reward: 52567 },
    { nick: "Nuts", points: 110, reward: 21000 },
    { nick: "ПокерМанки", points: 110, reward: 17038 },
    { nick: "WiNifly", points: 90, reward: 16081 },
    { nick: "Waaar", points: 60, reward: 8875 },
    { nick: "Poker_poher", points: 0, reward: 4781 },
    { nick: "Чеб43", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
    { nick: "nachyn", points: 0, reward: 0 },
  ],
  "22.01.2026": [
    { nick: "Waaar", points: 135, reward: 38067 },
    { nick: "nachyn", points: 135, reward: 27685 },
    { nick: "Coo1er91", points: 110, reward: 10156 },
    { nick: "Prushnik", points: 90, reward: 9066 },
    { nick: "WiNifly", points: 70, reward: 7875 },
    { nick: "ПокерМанки", points: 60, reward: 900 },
    { nick: "comotd", points: 60, reward: 6449 },
    { nick: "n1kk1ex", points: 0, reward: 2781 },
    { nick: "outsider", points: 0, reward: 350 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "petroochoo", points: 0, reward: 0 },
    { nick: "kream89", points: 0, reward: 0 },
  ],
  "21.01.2026": [
    { nick: "RS888", points: 135, reward: 71681 },
    { nick: "WiNifly", points: 0, reward: 338 },
    { nick: "Waaar", points: 0, reward: 2700 },
    { nick: "Рамиль01", points: 0, reward: 338 },
    { nick: "IRIHKA", points: 0, reward: 338 },
  ],
  "20.01.2026": [
    { nick: "Waaar", points: 110, reward: 20561 },
    { nick: "Coo1er91", points: 160, reward: 16216 },
    { nick: "m014yH", points: 135, reward: 15500 },
    { nick: "Em13!!", points: 110, reward: 17284 },
    { nick: "comotd", points: 90, reward: 27292 },
    { nick: "@Felix", points: 0, reward: 731 },
    { nick: "WiNifly", points: 0, reward: 1013 },
    { nick: "igor83", points: 0, reward: 450 },
    { nick: "This.Way", points: 0, reward: 0 },
    { nick: "Vaduxa_tiran", points: 0, reward: 0 },
    { nick: "Andrei350", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Зараза", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 7423 },
    { nick: "ArsenalFan", points: 0, reward: 5256 },
    { nick: "Natali", points: 0, reward: 350 },
    { nick: "Sergeant", points: 0, reward: 0 },
  ],
  "19.01.2026": [
    { nick: "Coo1er91", points: 90, reward: 24884 },
    { nick: "Sarmat1305", points: 90, reward: 9943 },
    { nick: "Waaar", points: 50, reward: 1688 },
    { nick: "Milan", points: 0, reward: 3206 },
    { nick: "m014yH", points: 0, reward: 0 },
    { nick: "igor83", points: 0, reward: 338 },
    { nick: "Егор", points: 0, reward: 0 },
  ],
  "18.01.2026": [
    { nick: "Em13!!", points: 135, reward: 35356 },
    { nick: "Coo1er91", points: 110, reward: 14781 },
    { nick: "pryanik2la", points: 70, reward: 15084 },
    { nick: "ПокерМанки", points: 0, reward: 1350 },
    { nick: "4hs.", points: 0, reward: 0 },
    { nick: "IRIHKA", points: 0, reward: 3038 },
    { nick: "MilkyWay77", points: 0, reward: 225 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
    { nick: "Alladin", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
    { nick: "comotd", points: 0, reward: 150 },
    { nick: "EnotSimuran", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "Homkaa", points: 0, reward: 0 },
  ],
  "17.01.2026": [
    { nick: "Coo1er91", points: 295, reward: 57172 },
    { nick: "Mr.V", points: 135, reward: 20900 },
    { nick: "Фокс", points: 135, reward: 182142 },
    { nick: "IRIHKA", points: 70, reward: 8275 },
    { nick: "Pentagrammall", points: 60, reward: 4875 },
    { nick: "FishKopcheny", points: 0, reward: 5547 },
    { nick: "ArsanaBoss", points: 0, reward: 2250 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "Rom4ik", points: 0, reward: 0 },
    { nick: "m014yH", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 3696 },
    { nick: "DzhalaLove", points: 0, reward: 0 },
    { nick: "Naparnik", points: 0, reward: 0 },
    { nick: "FART777", points: 0, reward: 0 },
  ],
  "16.01.2026": [
    { nick: "FrankL", points: 135, reward: 57289 },
    { nick: "Рыбнадзор", points: 135, reward: 22257 },
    { nick: "Феникс", points: 110, reward: 4368 },
    { nick: "maksim16rus", points: 0, reward: 1987 },
    { nick: "Madmax13", points: 0, reward: 0 },
    { nick: "nachyn", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
    { nick: "Lorenco", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
  ],
  "15.01.2026": [
    { nick: "Waaar", points: 160, reward: 28918 },
    { nick: "Coo1er91", points: 135, reward: 32822 },
    { nick: "Фокс", points: 110, reward: 25500 },
    { nick: "Рыбнадзор", points: 70, reward: 13594 },
    { nick: "Em13!!", points: 60, reward: 2016 },
    { nick: "Mr.V", points: 50, reward: 1350 },
    { nick: "WiNifly", points: 0, reward: 0 },
    { nick: "asd-39", points: 0, reward: 225 },
    { nick: "pryanik2la", points: 0, reward: 0 },
    { nick: "qoqoEpta", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "maksim16rus", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "WhiskeyClub", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
    { nick: "kabanchik", points: 0, reward: 0 },
  ],
  "14.01.2026": [
    { nick: "Фокс", points: 110, reward: 19931 },
    { nick: "Waaar", points: 110, reward: 18030 },
    { nick: "Coo1er91", points: 90, reward: 21981 },
    { nick: "WiNifly", points: 90, reward: 10688 },
    { nick: "RS888", points: 70, reward: 10534 },
    { nick: "FrankL", points: 60, reward: 5532 },
    { nick: "Darkstorn", points: 0, reward: 1519 },
    { nick: "Рамиль01", points: 0, reward: 450 },
    { nick: "electrocomvpk", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "rrromarrrio", points: 0, reward: 0 },
    { nick: "Smile", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 0 },
  ],
  "13.01.2026": [
    { nick: "Coo1er91", points: 270, reward: 63541 },
    { nick: "ПокерМанки", points: 200, reward: 19125 },
    { nick: "Waaar", points: 180, reward: 60771 },
    { nick: "FrankL", points: 170, reward: 27291 },
    { nick: "kabanchik", points: 135, reward: 41075 },
    { nick: "Prushnik", points: 50, reward: 6513 },
    { nick: "QQQ777", points: 0, reward: 1013 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "Hakas", points: 0, reward: 0 },
    { nick: "izh18rus", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "FART777", points: 0, reward: 0 },
    { nick: "kriaks", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
    { nick: "MEVRIK", points: 0, reward: 0 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "Smile", points: 0, reward: 0 },
    { nick: "ArsenalFan", points: 0, reward: 0 },
  ],
  "12.01.2026": [
    { nick: "hakasik", points: 110, reward: 14000 },
    { nick: "Waaar", points: 160, reward: 49690 },
    { nick: "ПокерМанки", points: 90, reward: 9300 },
    { nick: "Фокс", points: 60, reward: 4680 },
    { nick: "FART777", points: 50, reward: 9918 },
    { nick: "WiNifly", points: 50, reward: 338 },
    { nick: "Coo1er91", points: 0, reward: 4809 },
    { nick: "Em13!!", points: 0, reward: 3672 },
    { nick: "@Felix", points: 0, reward: 5316 },
    { nick: "DiagPro161", points: 0, reward: 8222 },
    { nick: "kriaks", points: 0, reward: 3191 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 0, reward: 0 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "ArsenalFan", points: 0, reward: 0 },
    { nick: "outsider", points: 0, reward: 0 },
  ],
  "11.01.2026": [
    { nick: "ПокерМанки", points: 110, reward: 20525 },
    { nick: "Феникс", points: 110, reward: 18495 },
    { nick: "Waaar", points: 90, reward: 414575 },
    { nick: "WiNifly", points: 70, reward: 10313 },
    { nick: "ArsenalFan", points: 70, reward: 12731 },
    { nick: "Em13!!", points: 60, reward: 2343 },
    { nick: "Coo1er91", points: 50, reward: 1800 },
    { nick: "Baldendi", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 0, reward: 900 },
    { nick: "cap888881", points: 0, reward: 1425 },
    { nick: "Mike Tyson", points: 0, reward: 858 },
    { nick: "Co4Hblu", points: 0, reward: 0 },
    { nick: "Зараза", points: 0, reward: 0 },
    { nick: "kriaks", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
  ],
  "10.01.2026": [
    { nick: "Rom4ik", points: 180, reward: 17200 },
    { nick: "vnukshtukatura", points: 180, reward: 83218 },
    { nick: "Coo1er91", points: 135, reward: 64346 },
    { nick: "Waaar", points: 135, reward: 15000 },
    { nick: "Фокс", points: 135, reward: 48276 },
    { nick: "Co4Hblu", points: 110, reward: 23960 },
    { nick: "Sarmat1305", points: 90, reward: 491248 },
    { nick: "Зараза", points: 90, reward: 19211 },
    { nick: "Em13!!", points: 70, reward: 16698 },
    { nick: "Prushnik", points: 50, reward: 9590 },
    { nick: "Pentagrammall", points: 0, reward: 844 },
    { nick: "nerrielle", points: 0, reward: 2700 },
    { nick: "Salamandr", points: 0, reward: 1181 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "hakasik", points: 0, reward: 0 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "Mike Tyson", points: 0, reward: 3313 },
    { nick: "Феникс", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
    { nick: "Art555", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
    { nick: "outsider", points: 0, reward: 0 },
    { nick: "kriaks", points: 0, reward: 0 },
    { nick: "Simba33", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
  ],
  "09.01.2026": [
    { nick: "Coo1er91", points: 160, reward: 32919 },
    { nick: "vnukshtukatura", points: 135, reward: 67560 },
    { nick: "ПокерМанки", points: 135, reward: 60841 },
    { nick: "WiNifly", points: 90, reward: 26159 },
    { nick: "FrankL", points: 90, reward: 21789 },
    { nick: "Prushnik", points: 90, reward: 11500 },
    { nick: "<Amaliya>", points: 70, reward: 10000 },
    { nick: "Em13!!", points: 70, reward: 3590 },
    { nick: "Лудоман", points: 60, reward: 9319 },
    { nick: "Рыбнадзор", points: 60, reward: 3190 },
    { nick: "Nuts", points: 0, reward: 0 },
    { nick: "VICTORINOX", points: 0, reward: 0 },
    { nick: "Чеб43", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Переездыч", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "Бэха", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
    { nick: "Фартовый", points: 0, reward: 0 },
  ],
  "08.01.2026": [
    { nick: "hakasik", points: 135, reward: 37140 },
    { nick: "MilkyWay77", points: 110, reward: 14384 },
    { nick: "ПокерМанки", points: 90, reward: 10649 },
    { nick: "Waaar", points: 130, reward: 24234 },
    { nick: "Coo1er91", points: 260, reward: 51972 },
    { nick: "vnukshtukatura", points: 135, reward: 64000 },
    { nick: "Nuts", points: 50, reward: 14600 },
    { nick: "DIVGO", points: 110, reward: 11680 },
    { nick: "king00001", points: 0, reward: 0 },
  ],
  "07.01.2026": [
    { nick: "Em13!!", points: 185, reward: 27828 },
    { nick: "WiNifly", points: 135, reward: 73772 },
    { nick: "Coo1er91", points: 110, reward: 31250 },
    { nick: "Rifa", points: 60, reward: 5850 },
    { nick: "ПокерМанки", points: 60, reward: 8300 },
    { nick: "electrocomvpk", points: 60, reward: 7834 },
    { nick: "Waaar", points: 50, reward: 1800 },
    { nick: "Рыбнадзор", points: 50, reward: 48910 },
    { nick: "Алеша™", points: 0, reward: 3938 },
    { nick: "Kotik", points: 0, reward: 0 },
    { nick: "Nuts", points: 0, reward: 0 },
    { nick: "Mougli", points: 0, reward: 19182 },
    { nick: "isildur", points: 0, reward: 11864 },
    { nick: "Monfokon", points: 0, reward: 3438 },
    { nick: "Бабник", points: 0, reward: 4082 },
    { nick: "outsider", points: 0, reward: 720 },
    { nick: "FART777", points: 0, reward: 0 },
    { nick: "vvllaadd", points: 0, reward: 0 },
    { nick: "WhiskeyClub", points: 0, reward: 0 },
  ],
  "06.01.2026": [
    { nick: "Coo1er91", points: 140, reward: 5130 },
    { nick: "ПокерМанки", points: 135, reward: 19580 },
    { nick: "Sarmat1305", points: 110, reward: 10000 },
    { nick: "WiNifly", points: 90, reward: 11669 },
    { nick: "Waaar", points: 70, reward: 900 },
    { nick: "Mr.V", points: 60, reward: 1125 },
    { nick: "MORPEH", points: 0, reward: 788 },
    { nick: "Sokol", points: 0, reward: 1238 },
    { nick: "<Amaliya>", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
  ],
  "05.01.2026": [
    { nick: "Em13!!", points: 245, reward: 70985 },
    { nick: "Waaar", points: 195, reward: 38734 },
    { nick: "ПокерМанки", points: 135, reward: 40331 },
    { nick: "Salamandr", points: 135, reward: 18200 },
    { nick: "PodayPereap", points: 110, reward: 26609 },
    { nick: "Simba33", points: 110, reward: 965 },
    { nick: "Coo1er91", points: 90, reward: 12063 },
    { nick: "FanatCoo1era", points: 70, reward: 7625 },
    { nick: "DIVGO", points: 70, reward: 4894 },
    { nick: "Milan", points: 60, reward: 7150 },
    { nick: "shockin", points: 60, reward: 5300 },
    { nick: "RS888", points: 50, reward: 675 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 0, reward: 0 },
    { nick: "FART777", points: 0, reward: 0 },
    { nick: "outsider", points: 0, reward: 0 },
    { nick: "MEVRIK", points: 0, reward: 0 },
  ],
  "04.01.2026": [
    { nick: "Coo1er91", points: 170, reward: 26066 },
    { nick: "doss93", points: 135, reward: 32300 },
    { nick: "DIVGO", points: 135, reward: 17000 },
    { nick: "WhiskeyClub", points: 135, reward: 31556 },
    { nick: "ПокерМанки", points: 110, reward: 20300 },
    { nick: "cap888881", points: 110, reward: 350 },
    { nick: "FrankL", points: 90, reward: 13900 },
    { nick: "Em13!!", points: 90, reward: 6925 },
    { nick: "Poker_poher", points: 70, reward: 43400 },
    { nick: "Ronn", points: 0, reward: 26600 },
    { nick: "AliPetuhov", points: 0, reward: 20600 },
    { nick: "Ksuha", points: 0, reward: 14700 },
    { nick: "mamalena", points: 0, reward: 11300 },
    { nick: "MilkyWay77", points: 0, reward: 1012 },
    { nick: "kriak", points: 0, reward: 1406 },
    { nick: "Salamandr", points: 0, reward: 0 },
    { nick: "PodayPereap", points: 0, reward: 0 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
    { nick: "Prushnik", points: 0, reward: 0 },
    { nick: "AlenaSt", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
    { nick: "Руслан4ик", points: 0, reward: 0 },
  ],
  "03.01.2026": [
    { nick: "outsider", points: 110, reward: 20278 },
    { nick: "MilkyWay77", points: 135, reward: 21400 },
    { nick: "cap888881", points: 90, reward: 15224 },
    { nick: "Em13!!", points: 110, reward: 14400 },
    { nick: "VoRoNoFF", points: 60, reward: 9035 },
    { nick: "NINT3NDO", points: 0, reward: 2581 },
    { nick: "DIVGO", points: 70, reward: 20400 },
    { nick: "Рамиль01fan", points: 90, reward: 8600 },
    { nick: "PodayPereap", points: 70, reward: 6900 },
    { nick: "Smile", points: 0, reward: 0 },
    { nick: "Waaar", points: 60, reward: 16200 },
    { nick: "VICTORINOX", points: 0, reward: 7400 },
    { nick: "WhiskeyClub", points: 0, reward: 0 },
    { nick: "Simba33", points: 0, reward: 0 },
    { nick: "Sarmat1305", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Алеша™", points: 0, reward: 0 },
    { nick: "Adam1993", points: 0, reward: 0 },
    { nick: "Loki", points: 0, reward: 0 },
  ],
  "02.01.2026": [
    { nick: "Em13!!", points: 315, reward: 71346 },
    { nick: "ПокерМанки", points: 185, reward: 36931 },
    { nick: "Coo1er91", points: 135, reward: 45494 },
    { nick: "Waaar", points: 110, reward: 13238 },
    { nick: "Бабник", points: 60, reward: 7900 },
    { nick: "Adam1993", points: 60, reward: 8075 },
    { nick: "<Amaliya>", points: 0, reward: 1125 },
    { nick: "FrankL", points: 0, reward: 1981 },
    { nick: "RikAnrak", points: 0, reward: 1334 },
    { nick: "LuckyBoom", points: 0, reward: 0 },
    { nick: "Guldanco", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
    { nick: "godzi888", points: 0, reward: 0 },
    { nick: "Madmax13", points: 0, reward: 0 },
  ],
  "01.01.2026": [
    { nick: "AuraAA", points: 135, reward: 46306 },
    { nick: "Loki", points: 60, reward: 9641 },
    { nick: "Coo1er91", points: 50, reward: 5681 },
    { nick: "BOTEZGAMBIT", points: 110, reward: 18100 },
    { nick: "king00001", points: 90, reward: 12380 },
    { nick: "ПокерМанки", points: 70, reward: 9000 },
    { nick: "myhomor4ik", points: 60, reward: 7300 },
    { nick: "Sarmat1305", points: 0, reward: 338 },
    { nick: "RS888", points: 0, reward: 1125 },
    { nick: "PlayerFD6762", points: 0, reward: 0 },
  ],
  "25.12.2025": [
    { nick: "AliPetuhov", points: 135, reward: 25900 },
    { nick: "Waaar", points: 130, reward: 14998 },
    { nick: "ПокерМанки", points: 90, reward: 8375 },
    { nick: "Simba33", points: 110, reward: 105700 },
    { nick: "Coo1er91", points: 70, reward: 5800 },
    { nick: "FrankL", points: 0, reward: 1500 },
    { nick: "@Felix", points: 0, reward: 1500 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "doss93", points: 0, reward: 0 },
    { nick: "COBRA", points: 0, reward: 0 },
    { nick: "Danger", points: 0, reward: 1547 },
    { nick: "Палач", points: 0, reward: 338 },
    { nick: "Rom4ik", points: 0, reward: 0 },
    { nick: "PONOCHKA", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 0 },
    { nick: "PokerMonkeyX", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
    { nick: "SPARTAK", points: 0, reward: 0 },
    { nick: "tashovvv", points: 0, reward: 0 },
  ],
  "31.12.2025": [
    { nick: "Бабник", points: 110, reward: 27409 },
    { nick: "WhiskeyClub", points: 135, reward: 552 },
    { nick: "king00001", points: 90, reward: 6400 },
    { nick: "Em13!!", points: 0, reward: 3107 },
    { nick: "АршакМкртчян", points: 0, reward: 750 },
    { nick: "yebanfan", points: 0, reward: 0 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "This.Way", points: 0, reward: 0 },
    { nick: "Рамиль01", points: 0, reward: 0 },
  ],
  "30.12.2025": [
    { nick: "VICTORINOX", points: 110, reward: 204300 },
    { nick: "yebanfan", points: 110, reward: 12780 },
    { nick: "PodayPereap", points: 90, reward: 104100 },
    { nick: "DIVGO", points: 90, reward: 8400 },
    { nick: "FrankL", points: 70, reward: 91000 },
    { nick: "Coo1er91", points: 70, reward: 7084 },
    { nick: "ЗараЗа", points: 60, reward: 7624 },
    { nick: "PlayerFE634D", points: 60, reward: 9091 },
    { nick: "<Amaliya>", points: 50, reward: 1828 },
    { nick: "Waaar", points: 0, reward: 48800 },
    { nick: "AliPetuhov", points: 0, reward: 16500 },
    { nick: "Natali", points: 0, reward: 1859 },
    { nick: "@Felix", points: 0, reward: 225 },
    { nick: "No.mercy", points: 0, reward: 900 },
    { nick: "Рамиль01", points: 0, reward: 0 },
    { nick: "vnukshtukatura", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "XP3723391", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
    { nick: "kriaks", points: 0, reward: 0 },
    { nick: "Фокс", points: 0, reward: 0 },
  ],
  "29.12.2025": [
    { nick: "Coo1er91", points: 160, reward: 20220 },
    { nick: "Pentagrammall", points: 110, reward: 22900 },
    { nick: "yebanfan", points: 90, reward: 15580 },
    { nick: "IRIHKA", points: 70, reward: 11400 },
    { nick: "Зараза", points: 0, reward: 1893 },
    { nick: "Natali", points: 0, reward: 1893 },
    { nick: "Палач", points: 0, reward: 0 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Рамиль01", points: 0, reward: 0 },
    { nick: "VICTORINOX", points: 0, reward: 0 },
    { nick: "Simba33", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
  ],
  "28.12.2025": [
    { nick: "Зараза", points: 110, reward: 18091 },
    { nick: "DIVGO", points: 110, reward: 11800 },
    { nick: "Waaar", points: 160, reward: 21256 },
    { nick: "Playergv1L2b", points: 70, reward: 10583 },
    { nick: "Coo1er91", points: 60, reward: 5769 },
    { nick: "Shkarubo", points: 50, reward: 4100 },
    { nick: "ПокерМанки", points: 50, reward: 6600 },
    { nick: "yebanfan", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Mapc", points: 0, reward: 0 },
    { nick: "Рамиль01", points: 0, reward: 0 },
  ],
  "27.12.2025": [
    { nick: "yebanfan", points: 135, reward: 20900 },
    { nick: "siropchik", points: 180, reward: 28077 },
    { nick: "cap888881", points: 180, reward: 15906 },
    { nick: "doss93", points: 110, reward: 18200 },
    { nick: "bugsergo", points: 90, reward: 11425 },
    { nick: "Sergeant", points: 90, reward: 674 },
    { nick: "ArsanaKhalbad", points: 70, reward: 624 },
    { nick: "king00001", points: 70, reward: 8700 },
    { nick: "n1kk1ex", points: 60, reward: 7307 },
    { nick: "@Felix", points: 50, reward: 2925 },
    { nick: "Бабник", points: 0, reward: 4524 },
    { nick: "Salamander", points: 0, reward: 750 },
    { nick: "Coo1er91", points: 0, reward: 0 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "Rolexx", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "cadillac", points: 0, reward: 0 },
    { nick: "АршакМкртчян", points: 0, reward: 57 },
    { nick: "kriaks", points: 0, reward: 94 },
    { nick: "MilkyWay77", points: 0, reward: 225 },
    { nick: "CRUNCHx2", points: 0, reward: 0 },
  ],
  "26.12.2025": [
    { nick: "WiNifly", points: 135, reward: 44627 },
    { nick: "Waaar", points: 135, reward: 25900 },
    { nick: "mamalena", points: 110, reward: 17500 },
    { nick: "SAIDEL", points: 90, reward: 13013 },
    { nick: "Em13!!", points: 50, reward: 10079 },
    { nick: "Coo1er91", points: 50, reward: 4433 },
    { nick: "bartender303", points: 0, reward: 3488 },
    { nick: "Бабник", points: 0, reward: 3667 },
    { nick: "Sergeant", points: 0, reward: 3056 },
    { nick: "COBRA", points: 0, reward: 450 },
    { nick: "Salamander", points: 0, reward: 0 },
    { nick: "Анубис", points: 0, reward: 0 },
    { nick: "Лудоман", points: 0, reward: 0 },
    { nick: "cadillac", points: 0, reward: 0 },
  ],
  "24.12.2025": [
    { nick: "Em13!!", points: 270, reward: 79300 },
    { nick: "FrankL", points: 135, reward: 22400 },
    { nick: "@Felix", points: 180, reward: 20590 },
    { nick: "Waaar", points: 120, reward: 17925 },
    { nick: "Рамиль01", points: 110, reward: 22863 },
    { nick: "Mr.V", points: 90, reward: 8900 },
    { nick: "Coo1er91", points: 90, reward: 17113 },
    { nick: "AliPetuhov", points: 90, reward: 10800 },
    { nick: "FrankL", points: 110, reward: 8200 },
    { nick: "GetHigh", points: 60, reward: 178000 },
    { nick: "Waaarr", points: 50, reward: 8000 },
    { nick: "Amaliya", points: 50, reward: 1181 },
    { nick: "Simba33", points: 0, reward: 21100 },
    { nick: "siropchik", points: 0, reward: 13700 },
    { nick: "Mougli", points: 0, reward: 1700 },
    { nick: "абырвалГ", points: 0, reward: 0 },
    { nick: "Rom4ik", points: 0, reward: 0 },
    { nick: "doss93", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 0 },
    { nick: "niklaussssss", points: 0, reward: 9200 },
    { nick: "arxitektor", points: 0, reward: 6800 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "Proxor", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "АршакМкртчян", points: 0, reward: 0 },
  ],
  "21.12.2025": [
    { nick: "hhohoo", points: 135, reward: 334518 },
    { nick: "FrankL", points: 110, reward: 12100 },
    { nick: "AliPetuhov", points: 110, reward: 20826 },
    { nick: "Waaar", points: 90, reward: 12225 },
    { nick: "vnukshtukatura", points: 0, reward: 4887 },
    { nick: "VICTORINOX", points: 0, reward: 5819 },
    { nick: "MilkyWay77", points: 0, reward: 1575 },
    { nick: "TiltlProof", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Player", points: 0, reward: 0 },
    { nick: "bymep7", points: 0, reward: 0 },
    { nick: "Baruum", points: 0, reward: 0 },
    { nick: "baldand", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
  ],
  "23.12.2025": [
    { nick: "абырвалГ", points: 135, reward: 15000 },
    { nick: "Waaar", points: 110, reward: 9000 },
    { nick: "VICTORINOX", points: 110, reward: 16800 },
    { nick: "Рамиль01", points: 90, reward: 6000 },
    { nick: "@Felix", points: 90, reward: 10875 },
    { nick: "Coo1er91", points: 60, reward: 6800 },
    { nick: "tatarin_1", points: 0, reward: 1688 },
    { nick: "WiNifly", points: 0, reward: 225 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "Amaliya", points: 0, reward: 0 },
    { nick: "Smorodina", points: 0, reward: 0 },
    { nick: "Baldendi", points: 0, reward: 0 },
  ],
  "22.12.2025": [
    { nick: "WiNifly", points: 110, reward: 15649 },
    { nick: "Em13!!", points: 110, reward: 11800 },
    { nick: "Coo1er91", points: 70, reward: 7475 },
    { nick: "VICTORINOX", points: 60, reward: 4825 },
    { nick: "Amaliya", points: 50, reward: 4325 },
    { nick: "Бабник", points: 50, reward: 8400 },
    { nick: "Mougli", points: 60, reward: 10200 },
    { nick: "Рамиль01", points: 0, reward: 8505 },
    { nick: "Salamander", points: 0, reward: 2500 },
    { nick: "Natali", points: 0, reward: 600 },
    { nick: "comotd", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "bbvc777", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Марико", points: 0, reward: 0 },
  ],
  "20.12.2025": [
    { nick: "Waaar", points: 110, reward: 9500 },
    { nick: "ПокерМанки", points: 90, reward: 10500 },
    { nick: "Em13!!", points: 70, reward: 20620 },
    { nick: "electrocomvpk", points: 70, reward: 16807 },
    { nick: "MOJO", points: 70, reward: 8400 },
    { nick: "pryanik2la", points: 60, reward: 147101 },
    { nick: "Amaliya", points: 0, reward: 0 },
    { nick: "mamalena", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
    { nick: "vnukshtukatura", points: 0, reward: 4212 },
    { nick: "baldand", points: 0, reward: 0 },
    { nick: "Kvits010", points: 0, reward: 0 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "kabanchik", points: 0, reward: 0 },
    { nick: "Марико", points: 0, reward: 0 },
    { nick: "ШЛЯПАУСАТ", points: 0, reward: 0 },
    { nick: "JinDaniels", points: 0, reward: 0 },
  ],
  "19.12.2025": [
    { nick: "Coo1er91", points: 135, reward: 15000 },
    { nick: "COBRA", points: 110, reward: 9000 },
    { nick: "Amaliya", points: 110, reward: 12612 },
    { nick: "FrankL", points: 110, reward: 33327 },
    { nick: "Waaar", points: 90, reward: 6000 },
    { nick: "doss93", points: 70, reward: 9000 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "DIVGO", points: 0, reward: 0 },
    { nick: "Пряник", points: 0, reward: 1687 },
    { nick: "WiNifly", points: 0, reward: 225 },
    { nick: "Proxor", points: 0, reward: 450 },
    { nick: "Player", points: 0, reward: 450 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Twisted-fate_08", points: 0, reward: 0 },
    { nick: "baldand", points: 0, reward: 3742 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
  ],
  "18.12.2025": [
    { nick: "Coo1er91", points: 110, reward: 17700 },
    { nick: "king00001", points: 90, reward: 8000 },
    { nick: "ПокерМанки", points: 70, reward: 18450 },
    { nick: "mamalena", points: 60, reward: 7700 },
    { nick: "RS888", points: 60, reward: 1350 },
    { nick: "Waaar", points: 50, reward: 4950 },
    { nick: "Mougli", points: 50, reward: 3867 },
    { nick: "doss93", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "PlayerFD6762", points: 0, reward: 0 },
    { nick: "VadiM", points: 0, reward: 0 },
    { nick: "Tokio90", points: 0, reward: 0 },
    { nick: "mr.Freeman", points: 0, reward: 0 },
    { nick: "MORPEH", points: 0, reward: 450 },
    { nick: "Пряник", points: 0, reward: 900 },
    { nick: "FrankL", points: 0, reward: 6211 },
    { nick: "Бэха", points: 0, reward: 0 },
    { nick: "comotd", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
  ],
  "17.12.2025": [
    { nick: "Бабник", points: 270, reward: 270215 },
    { nick: "ПокерМанки", points: 135, reward: 43820 },
    { nick: "GetHigh", points: 110, reward: 12000 },
    { nick: "kriak", points: 110, reward: 27951 },
    { nick: "Анубис", points: 110, reward: 12997 },
    { nick: "FrankL", points: 90, reward: 8000 },
    { nick: "Amaliya", points: 90, reward: 12193 },
    { nick: "siropchik", points: 90, reward: 10497 },
    { nick: "n1kk1ex", points: 70, reward: 8521 },
    { nick: "mamalena", points: 60, reward: 7500 },
    { nick: "chemical", points: 60, reward: 7550 },
    { nick: "γύψος", points: 60, reward: 6900 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "Salamandr", points: 0, reward: 0 },
    { nick: "Twisted-fate_08", points: 0, reward: 0 },
    { nick: "lenivyi", points: 0, reward: 225 },
    { nick: "comotd", points: 0, reward: 2800 },
    { nick: "Lorenco", points: 0, reward: 2200 },
    { nick: "Аршак Мкртчян", points: 0, reward: 400 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
  ],
  "16.12.2025": [
    { nick: "Em13!!", points: 110, reward: 87364 },
    { nick: "doss93", points: 110, reward: 18300 },
    { nick: "Waaar", points: 90, reward: 8000 },
    { nick: "Mike Tyson", points: 90, reward: 4543 },
    { nick: "Пряник", points: 90, reward: 0 },
    { nick: "comotd", points: 70, reward: 30981 },
    { nick: "Amaliya", points: 70, reward: 9100 },
    { nick: "Чебурашка", points: 60, reward: 7400 },
    { nick: "MORPEH", points: 60, reward: 0 },
    { nick: "WiNifly", points: 50, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 8093 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Salamandr", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Pacific", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "qoqoEpta", points: 0, reward: 0 },
    { nick: "bymep7", points: 0, reward: 0 },
    { nick: "Переездыч", points: 0, reward: 0 },
    { nick: "shockin", points: 0, reward: 0 },
    { nick: "Бэха", points: 0, reward: 0 },
  ],
  "15.12.2025": [
    { nick: "ПокерМанки", points: 135, reward: 33097 },
    { nick: "Фокс", points: 135, reward: 40500 },
    { nick: "Палач", points: 135, reward: 20000 },
    { nick: "IRIHKA", points: 110, reward: 22672 },
    { nick: "Salamandr", points: 110, reward: 12000 },
    { nick: "Em13!!", points: 130, reward: 13053 },
    { nick: "eroha", points: 60, reward: 7350 },
    { nick: "Waaar", points: 50, reward: 8010 },
    { nick: "@Felix", points: 0, reward: 2264 },
    { nick: "FrankL", points: 0, reward: 1391 },
    { nick: "Tanechka", points: 0, reward: 0 },
    { nick: "Rom4ik", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
  ],
  "14.12.2025": [
    { nick: "Amaliya", points: 225, reward: 39700 },
    { nick: "Coo1er91", points: 220, reward: 99791 },
    { nick: "Waaar", points: 180, reward: 20100 },
    { nick: "ПокерМанки", points: 110, reward: 30700 },
    { nick: "Em13!!", points: 205, reward: 34430 },
    { nick: "Player", points: 135, reward: 20000 },
    { nick: "Зараза", points: 90, reward: 6583 },
    { nick: "mamalena", points: 70, reward: 40000 },
    { nick: "PONOCHKA", points: 70, reward: 9640 },
    { nick: "@Felix", points: 60, reward: 8525 },
    { nick: "Лудоман", points: 0, reward: 24500 },
    { nick: "WiNifly", points: 0, reward: 0 },
    { nick: "Евгений", points: 0, reward: 0 },
  ],
  "13.12.2025": [
    { nick: "ПокерМанки", points: 185, reward: 31563 },
    { nick: "Em13!!", points: 135, reward: 40227 },
    { nick: "mamalena", points: 110, reward: 17500 },
    { nick: "Waaar", points: 110, reward: 12900 },
    { nick: "kriak", points: 90, reward: 11964 },
    { nick: "Zewzzz", points: 90, reward: 8600 },
    { nick: "petroochoo", points: 70, reward: 9013 },
    { nick: "PONOCHKA", points: 60, reward: 7700 },
    { nick: "Бабник", points: 50, reward: 4284 },
    { nick: "лисс", points: 0, reward: 3544 },
  ],
  "12.12.2025": [
    { nick: "Felix", points: 135, reward: 45571 },
    { nick: "Kosik", points: 135, reward: 25900 },
    { nick: "petroochoo", points: 110, reward: 16976 },
    { nick: "Coo1er91", points: 110, reward: 12000 },
    { nick: "RS888", points: 90, reward: 14291 },
    { nick: "Waaar", points: 90, reward: 10580 },
    { nick: "king00001", points: 90, reward: 8000 },
    { nick: "doss93", points: 70, reward: 8400 },
    { nick: "WhiskeyClub", points: 50, reward: 16906 },
    { nick: "kriak", points: 50, reward: 6756 },
    { nick: "ПокерМанки", points: 0, reward: 5291 },
    { nick: "SPARTAK", points: 0, reward: 5100 },
    { nick: "Фокс", points: 0, reward: 2500 },
  ],
  "11.12.2025": [
    { nick: "vnukshtukatura", points: 225, reward: 71904 },
    { nick: "ФОКС", points: 135, reward: 48409 },
    { nick: "WiNifly", points: 135, reward: 34060 },
    { nick: "Waaar", points: 295, reward: 33182 },
    { nick: "Waaar", points: 90, reward: 6095 },
    { nick: "AliPetuhov", points: 135, reward: 26400 },
    { nick: "Coo1er91", points: 180, reward: 20373 },
    { nick: "ParabeLLum", points: 70, reward: 8500 },
    { nick: "ПокерМанки", points: 0, reward: 1800 },
    { nick: "Бабник", points: 0, reward: 1800 },
    { nick: "Felix", points: 0, reward: 900 },
    { nick: "Em13!!", points: 0, reward: 508 },
  ],
  "09.12.2025": [
    { nick: "Waaar", points: 200, reward: 0 },
    { nick: "King", points: 110, reward: 0 },
    { nick: "WiNifly", points: 90, reward: 0 },
    { nick: "ViktoryNox", points: 70, reward: 0 },
    { nick: "Twisted", points: 50, reward: 0 },
  ],
  "10.12.2025": [
    { nick: "FishKopcheny", points: 135, reward: 26500 },
    { nick: "ПокерМанки", points: 135, reward: 21800 },
    { nick: "Аспирин", points: 110, reward: 38234 },
    { nick: "Пряник", points: 110, reward: 16925 },
    { nick: "FrankL", points: 110, reward: 12000 },
    { nick: "Kosik", points: 70, reward: 8300 },
    { nick: "petroochoo", points: 50, reward: 5775 },
    { nick: "Waaar", points: 0, reward: 2756 },
    { nick: "Бабник", points: 0, reward: 2250 },
    { nick: "Felix", points: 0, reward: 1520 },
    { nick: "Baldendi", points: 0, reward: 900 },
    { nick: "KOL1103", points: 0, reward: 450 },
  ],
  "08.12.2025": [
    { nick: "Coo1er91", points: 135, reward: 43222 },
    { nick: "BOTEZGAMBIT", points: 135, reward: 20000 },
    { nick: "DIVGO", points: 110, reward: 22000 },
    { nick: "Лудоман", points: 110, reward: 13753 },
    { nick: "Бабник", points: 90, reward: 8000 },
    { nick: "Пряник", points: 90, reward: 9038 },
    { nick: "Twisted-fate_08", points: 70, reward: 11000 },
    { nick: "ПокерМанки", points: 60, reward: 9000 },
    { nick: "doss93", points: 50, reward: 8000 },
    { nick: "Kosik", points: 50, reward: 4225 },
    { nick: "Baldendi", points: 0, reward: 4638 },
  ],
  "07.12.2025": [
    { nick: "pinch904", points: 135, reward: 142500 },
    { nick: "Waaar", points: 245, reward: 56900 },
    { nick: "Бабник", points: 135, reward: 28247 },
    { nick: "Em13!!", points: 130, reward: 43659 },
    { nick: "AliPetuhov", points: 110, reward: 17500 },
    { nick: "ПокерМанки", points: 110, reward: 19245 },
    { nick: "WiNifly", points: 70, reward: 40000 },
    { nick: "Coo1er91", points: 70, reward: 8400 },
    { nick: "FishKopcheny", points: 90, reward: 8000 },
    { nick: "АршакМкртчян", points: 50, reward: 11395 },
    { nick: "Пряник", points: 50, reward: 1519 },
    { nick: "MilkyWay77", points: 0, reward: 24500 },
    { nick: "Baldendi", points: 0, reward: 1125 },
  ],
  "01.02.2026": [
    { nick: "ПокерМанки", points: 180, reward: 42800 },
    { nick: "DimassikFiskk", points: 135, reward: 25900 },
    { nick: "Prushnik", points: 110, reward: 17500 },
    { nick: "MTTwnik", points: 90, reward: 10500 },
    { nick: "DIVGO", points: 70, reward: 6920 },
    { nick: "WiNifly", points: 60, reward: 7700 },
    { nick: "KOL1103", points: 0, reward: 0 },
    { nick: "aRbyZ", points: 0, reward: 0 },
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
    { nick: "Salamandr", points: 0, reward: 0 },
    { nick: "MTTwnik", points: 0, reward: 0 },
    { nick: "Rom4ik", points: 0, reward: 0 },
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
  "04.02.2026": [
    { nick: "Waaar", points: 110, reward: 15000 },
    { nick: "Sarmat1305", points: 90, reward: 10500 },
    { nick: "ПокерМанки", points: 90, reward: 9000 },
    { nick: "Артем Мулеров", points: 90, reward: 17067 },
    { nick: "MilkyWay77", points: 70, reward: 8400 },
    { nick: "Smile", points: 70, reward: 7200 },
    { nick: "Em13!!", points: 70, reward: 14052 },
    { nick: "MTTwnik", points: 60, reward: 7700 },
    { nick: "WiNifly", points: 60, reward: 6600 },
    { nick: "RS888", points: 0, reward: 0 },
    { nick: "BOTEZGAMBIT", points: 0, reward: 0 },
    { nick: "outsider", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "AndreiBurmako", points: 0, reward: 0 },
  ],
  "05.02.2026": [
    { nick: "Waaar", points: 135, reward: 25900 },
    { nick: "comotd", points: 135, reward: 38200 },
    { nick: "WiNifly", points: 110, reward: 17500 },
    { nick: "Em13!!", points: 110, reward: 24400 },
    { nick: "ПокерМанки", points: 90, reward: 22500 },
    { nick: "Coo1er91", points: 70, reward: 18000 },
    { nick: "king00001", points: 60, reward: 7700 },
    { nick: "MTTwnik", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "MORPEH", points: 0, reward: 0 },
    { nick: "Артем Мулеров", points: 0, reward: 5670 },
    { nick: "XP3838084", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
  ],
  "17.02.2026": [
    { nick: "ПокерМанки", points: 135, reward: 33200 },
    { nick: "BOTEZGAMBIT", points: 135, reward: 27800 },
    { nick: "Waaar", points: 110, reward: 14400 },
    { nick: "MilkyWay77", points: 90, reward: 8500 },
    { nick: "WiNifly", points: 160, reward: 14400 },
    { nick: "pryanik2la", points: 60, reward: 10519 },
    { nick: "Borsoi", points: 70, reward: 6800 },
    { nick: "Amaliya", points: 70, reward: 4300 },
    { nick: "Prushnik", points: 50, reward: 6300 },
    { nick: "Coo1er91", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "comotd", points: 0, reward: 0 },
    { nick: "cap888881", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
  ],
  "18.02.2026": [
    { nick: "Em13!!", points: 135, reward: 59536 },
    { nick: "shockin", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
  ],
  "19.02.2026": [
    { nick: "ПокерМанки", points: 245, reward: 53000 },
    { nick: "shnshn", points: 110, reward: 35300 },
    { nick: "Бабник", points: 70, reward: 16700 },
    { nick: "king00001", points: 60, reward: 6600 },
    { nick: "Vaduxa_tiran", points: 60, reward: 6600 },
    { nick: "Rifa", points: 50, reward: 5700 },
    { nick: "WiNifly", points: 0, reward: 0 },
    { nick: "Waaar", points: 0, reward: 0 },
  ],
  "20.02.2026": [
    { nick: "Waaar", points: 220, reward: 25800 },
    { nick: "|---777---|", points: 90, reward: 7200 },
    { nick: "ПокерМанки", points: 90, reward: 9000 },
    { nick: "Smile", points: 70, reward: 7200 },
    { nick: "WiNifly", points: 60, reward: 6600 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "BOTEZGAMBIT", points: 0, reward: 0 },
  ],
  "21.02.2026": [
    { nick: "Бабник", points: 135, reward: 33543 },
    { nick: "|---777---|", points: 90, reward: 12000 },
    { nick: "pryanik2la", points: 60, reward: 3935 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "Borsoi", points: 0, reward: 0 },
    { nick: "petroochoo", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
  ],
  "22.02.2026": [
    { nick: "Бабник", points: 135, reward: 52147 },
    { nick: "FrankL", points: 135, reward: 17400 },
    { nick: "FrankL", points: 90, reward: 243825 },
    { nick: "Rifa", points: 100, reward: 18600 },
    { nick: "ПокерМанки", points: 70, reward: 16900 },
    { nick: "Konsy", points: 70, reward: 7200 },
    { nick: "baldand", points: 110, reward: 0 },
    { nick: "Mr.V", points: 50, reward: 0 },
    { nick: "NINT3NDO", points: 90, reward: 0 },
    { nick: "Waaar", points: 0, reward: 8200 },
    { nick: "bugsergo", points: 0, reward: 3100 },
    { nick: "|---777---|", points: 0, reward: 3100 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
    { nick: "Asta la Vista", points: 0, reward: 0 },
    { nick: "Simba33", points: 0, reward: 0 },
  ],
  "23.02.2026": [
    { nick: "Mr.V", points: 60, reward: 4300 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 135, reward: 40300 },
    { nick: "Аспирин", points: 110, reward: 7200 },
    { nick: "Waaar", points: 70, reward: 3500 },
    { nick: "Pentagrammall", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 90, reward: 19568 },
    { nick: "Monfokon", points: 0, reward: 0 },
    { nick: "NINT3NDO", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 3774 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
    { nick: "AndrushaMorf", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 0, reward: 5710 },
    { nick: "Анубис", points: 0, reward: 1300 },
    { nick: "mr.Fox", points: 0, reward: 0 },
    { nick: "Prushnik", points: 0, reward: 0 },
    { nick: "cadillac", points: 0, reward: 0 },
    { nick: "kabanchik", points: 0, reward: 18505 },
    { nick: "Sarmat1305", points: 0, reward: 0 },
    { nick: "kriak", points: 0, reward: 30390 },
    { nick: "WiNifly", points: 0, reward: 10000 },
    { nick: "ПаПа_Мо}|{еТ", points: 0, reward: 5250 },
    { nick: "ПокерМанки", points: 0, reward: 6490 },
    { nick: "Prushnik", points: 0, reward: 3800 },
    { nick: "Sarmat1305", points: 0, reward: 12322 },
    { nick: "undertaker", points: 0, reward: 0 },
    { nick: "allex 1983", points: 0, reward: 0 },
    { nick: "XP3864042", points: 0, reward: 0 },
    { nick: "Игрок", points: 0, reward: 7659 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "TIT163RUS", points: 0, reward: 0 },
    { nick: "МЕТ|$", points: 0, reward: 0 },
    { nick: "kabanchik", points: 0, reward: 0 },
  ],
  "25.02.2026": [
    { nick: "ПокерМанки", points: 135, reward: 29500 },
    { nick: "Waaar", points: 110, reward: 18600 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "ЧУРменя", points: 0, reward: 0 },
    { nick: "FishKopcheny", points: 0, reward: 0 },
    { nick: "Waaar", points: 135, reward: 20900 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Borsoi", points: 0, reward: 0 },
    { nick: "БЕЛЫЙ", points: 0, reward: 0 },
    { nick: "Em13!!", points: 135, reward: 29278 },
    { nick: "nikola233", points: 50, reward: 2102 },
    { nick: "Рыбнадзор", points: 0, reward: 1724 },
    { nick: "shockin", points: 0, reward: 0 },
    { nick: "АршакМкртчян", points: 110, reward: 28974 },
    { nick: "kriaks", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "nikola233", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 70, reward: 10182 },
    { nick: "АршакМкртчян", points: 0, reward: 1250 },
    { nick: "Em13!!", points: 0, reward: 283 },
    { nick: "machete", points: 0, reward: 0 },
    { nick: "n1kk1ex", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 5254 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 0 },
    { nick: "Prushnik", points: 0, reward: 1780 },
    { nick: "Player2EBBB6", points: 0, reward: 195 },
    { nick: "Boba7575", points: 0, reward: 159 },
    { nick: "cadillac", points: 0, reward: 142 },
    { nick: "Azza43ru", points: 0, reward: 0 },
    { nick: "АршакМкртчян", points: 0, reward: 11438 },
    { nick: "Superden", points: 0, reward: 0 },
    { nick: "Xpoper", points: 0, reward: 0 },
    { nick: "НиLLIтяк", points: 0, reward: 0 },
    { nick: "AliPetuhov", points: 0, reward: 10330 },
    { nick: "TonniHalf", points: 0, reward: 5880 },
    { nick: "Rom4ik", points: 0, reward: 3940 },
    { nick: "Че643", points: 0, reward: 3300 },
    { nick: "ЧУРменя", points: 0, reward: 2520 },
    { nick: "Psyho44", points: 0, reward: 7430 },
    { nick: "ПаПа_Мо}|{еТ", points: 0, reward: 0 },
    { nick: "XORTYRETSKOGO", points: 0, reward: 0 },
    { nick: "DemonDen", points: 0, reward: 0 },
    { nick: "WiNifly", points: 0, reward: 0 },
    { nick: "cadillac", points: 0, reward: 2660 },
    { nick: "Baal", points: 0, reward: 0 },
    { nick: "tatarin_1", points: 0, reward: 0 },
    { nick: "Ksuha", points: 0, reward: 0 },
    { nick: "Tanechka", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 8408 },
    { nick: "K-700", points: 0, reward: 0 },
    { nick: "Olegggaaa", points: 0, reward: 0 },
  ],
  "26.02.2026": [
    { nick: "ПокерМанки", points: 270, reward: 289950 },
    { nick: "FishKopcheny", points: 110, reward: 15000 },
    { nick: "BOTEZGAMBIT", points: 90, reward: 9000 },
    { nick: "WiNifly", points: 70, reward: 7200 },
    { nick: "king00001", points: 60, reward: 6600 },
    { nick: "Waaar", points: 135, reward: 19100 },
    { nick: "MilkyWay77", points: 110, reward: 11460 },
    { nick: "<Amaliya>", points: 135, reward: 70400 },
    { nick: "Аспирин", points: 110, reward: 30300 },
    { nick: "Player1BD20C", points: 90, reward: 8600 },
    { nick: "ЧУРменя", points: 70, reward: 2520 },
    { nick: "GetHigh", points: 60, reward: 2200 },
    { nick: "Рыбнадзор", points: 50, reward: 8249 },
    { nick: "PapaRabotayet", points: 50, reward: 8620 },
    { nick: "Фокс", points: 110, reward: 24526 },
  ],
  "27.02.2026": [
    { nick: "Mr.V", points: 110, reward: 15000 },
    { nick: "FishKopcheny", points: 60, reward: 6600 },
    { nick: "Палач", points: 60, reward: 4400 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "WB@._", points: 0, reward: 0 },
    { nick: "Volga21", points: 0, reward: 0 },
    { nick: "PapaRabotaet", points: 60, reward: 8499 },
    { nick: "АршакМкртчян", points: 0, reward: 0 },
    { nick: "Leokampus", points: 0, reward: 0 },
    { nick: "БомжВасили", points: 0, reward: 0 },
    { nick: "Proxor", points: 50, reward: 21352 },
    { nick: "Asta la Vista", points: 0, reward: 11792 },
    { nick: "Фокс", points: 90, reward: 2571 },
    { nick: "хасан ибн С", points: 0, reward: 0 },
    { nick: "Lorenco", points: 0, reward: 0 },
    { nick: "PROFESSOR", points: 0, reward: 7344 },
    { nick: "Ksuha", points: 0, reward: 16201 },
    { nick: "FishKopcheny", points: 0, reward: 8763 },
    { nick: "Poker2912", points: 0, reward: 6023 },
    { nick: "Рамаха", points: 0, reward: 4389 },
    { nick: "YOUAREMYDONKEY", points: 0, reward: 4838 },
    { nick: "mr.Fox", points: 0, reward: 1330 },
    { nick: "Фокс", points: 0, reward: 21175 },
  ],
  "28.02.2026": [
    { nick: "Waaar", points: 0, reward: 105559 },
    { nick: "Player1BD20C", points: 0, reward: 30000 },
    { nick: "Mr.V", points: 0, reward: 12000 },
    { nick: "|---777---|", points: 0, reward: 11680 },
    { nick: "Фокс", points: 0, reward: 12143 },
    { nick: "<Amaliya>", points: 0, reward: 7100 },
    { nick: "Резвый", points: 0, reward: 7000 },
    { nick: "Borsoi", points: 0, reward: 6000 },
    { nick: "WiNifly", points: 0, reward: 5312 },
    { nick: "AndrushaMorf", points: 0, reward: 5310 },
    { nick: "Откотика_Я", points: 0, reward: 4426 },
    { nick: "konfesta", points: 0, reward: 3200 },
    { nick: "Em13!!", points: 0, reward: 120000 },
    { nick: "WildBoar", points: 0, reward: 2200 },
    { nick: "MiracleDivice", points: 0, reward: 1250 },
    { nick: "Psyho44", points: 0, reward: 1340 },
    { nick: "Surgut", points: 0, reward: 1406 },
    { nick: "PapaRabotaet", points: 0, reward: 4655 },
    { nick: "m014yH", points: 0, reward: 980 },
    { nick: "Asta la Vista", points: 0, reward: 1741 },
    { nick: "shockin", points: 0, reward: 225 },
    { nick: "Malek3084", points: 0, reward: 225 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Рамаха", points: 0, reward: 0 },
    { nick: "VOSOvec", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
    { nick: "brabus011", points: 0, reward: 0 },
    { nick: "Lorenco", points: 0, reward: 0 },
    { nick: "Proxor", points: 0, reward: 0 },
    { nick: "Port1928", points: 0, reward: 0 },
    { nick: "Ronn", points: 0, reward: 0 },
  ],
  "24.02.2026": [
    { nick: "Mr.V", points: 110, reward: 12700 },
    { nick: "Waaar", points: 70, reward: 6000 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "|---777---|", points: 0, reward: 0 },
    { nick: "WiNifly", points: 110, reward: 15000 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "Rifa", points: 0, reward: 0 },
    { nick: "Бабник", points: 90, reward: 12983 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "пупсик", points: 0, reward: 0 },
    { nick: "ArsenalFan", points: 0, reward: 0 },
    { nick: "nikola233", points: 0, reward: 0 },
    { nick: "Malek3084", points: 0, reward: 7612 },
    { nick: "Miracle Divice", points: 0, reward: 0 },
    { nick: "Sarmat1305", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "Фокс", points: 0, reward: 0 },
    { nick: "<Amaliya>", points: 0, reward: 8700 },
    { nick: "Аспирин", points: 0, reward: 6400 },
    { nick: "FishKopcheny", points: 0, reward: 5400 },
    { nick: "WiNifly", points: 0, reward: 2200 },
    { nick: "petroochoo", points: 0, reward: 0 },
  ],
  "15.02.2026": [
    { nick: "Waaar", points: 185, reward: 25000 },
    { nick: "Rifa", points: 135, reward: 29300 },
    { nick: "ПокерМанки", points: 135, reward: 15800 },
    { nick: "Malek3084", points: 160, reward: 13200 },
    { nick: "Borsoi", points: 110, reward: 15000 },
    { nick: "Em13!!", points: 90, reward: 9119 },
    { nick: "WiNifly", points: 70, reward: 9300 },
    { nick: "FishKopcheny", points: 70, reward: 7200 },
    { nick: "Sarmat1305", points: 70, reward: 4993 },
    { nick: "FrankL", points: 60, reward: 4600 },
    { nick: "Prushnik", points: 0, reward: 0 },
    { nick: "$Pokerist$", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "МужНаЧас", points: 0, reward: 0 },
    { nick: "ИринаЗорина", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 0 },
  ],
  "16.02.2026": [
    { nick: "MTTwnik", points: 135, reward: 25100 },
    { nick: "Em13!!", points: 135, reward: 27082 },
    { nick: "MilkyWay77", points: 110, reward: 16980 },
    { nick: "Borsoi", points: 110, reward: 11580 },
    { nick: "Рамиль01fan", points: 90, reward: 10100 },
    { nick: "Rom4ik", points: 70, reward: 5500 },
    { nick: "Waaar", points: 60, reward: 5000 },
    { nick: "AndreiBurmako", points: 50, reward: 5401 },
    { nick: "МужНаЧас", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
  ],
  "13.02.2026": [
    { nick: "WiNifly", points: 135, reward: 22200 },
    { nick: "nachyn", points: 135, reward: 62072 },
    { nick: "pryanik2la", points: 135, reward: 18691 },
    { nick: "Player2EBBB6", points: 110, reward: 15000 },
    { nick: "Em13!!", points: 70, reward: 5329 },
    { nick: "Waaar", points: 60, reward: 6600 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Чеб43", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
  ],
  "14.02.2026": [
    { nick: "Waaar", points: 135, reward: 15000 },
    { nick: "Rifa", points: 135, reward: 25900 },
    { nick: "Prushnik", points: 110, reward: 18000 },
    { nick: "Пряник", points: 90, reward: 12000 },
    { nick: "Malek3084", points: 90, reward: 12400 },
    { nick: "MEVRIK", points: 70, reward: 5236 },
    { nick: "Бабник", points: 60, reward: 9770 },
    { nick: "RS888", points: 0, reward: 0 },
    { nick: "ArtStyle43", points: 0, reward: 0 },
    { nick: "stafart", points: 0, reward: 0 },
    { nick: "izh18rus", points: 0, reward: 0 },
    { nick: "Чеб43", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Hakas", points: 0, reward: 0 },
    { nick: "Аспирин", points: 0, reward: 0 },
    { nick: "Waaarr", points: 0, reward: 0 },
    { nick: "Natali", points: 0, reward: 0 },
    { nick: "@Felix", points: 0, reward: 0 },
  ],
  "12.02.2026": [
    { nick: "WiNifly", points: 135, reward: 63750 },
    { nick: "Waaar", points: 220, reward: 23900 },
    { nick: "Coo1er91", points: 90, reward: 26300 },
    { nick: "МужНаЧас", points: 90, reward: 5280 },
    { nick: "YOUAREMYDONKEY", points: 90, reward: 10800 },
    { nick: "Em13!!", points: 90, reward: 9432 },
    { nick: "Пряник", points: 70, reward: 12700 },
    { nick: "Тритоныч", points: 60, reward: 63464 },
    { nick: "Зараза", points: 50, reward: 6050 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "igor83", points: 0, reward: 0 },
  ],
  "11.02.2026": [
    { nick: "МужНаЧас", points: 135, reward: 31300 },
    { nick: "Тритоныч", points: 135, reward: 9136 },
    { nick: "ArsenalFan", points: 110, reward: 10382 },
    { nick: "FrankL", points: 110, reward: 3048 },
    { nick: "Mougli", points: 110, reward: 18180 },
    { nick: "FrankL", points: 90, reward: 7000 },
    { nick: "Proxor", points: 90, reward: 661 },
    { nick: "ПокерМанки", points: 70, reward: 6200 },
    { nick: "king00001", points: 60, reward: 7700 },
    { nick: "WiNifly", points: 60, reward: 5700 },
    { nick: "Waaar", points: 0, reward: 0 },
    { nick: "Пряник", points: 0, reward: 0 },
    { nick: "FishKopcheny", points: 0, reward: 0 },
    { nick: "Adam1993", points: 0, reward: 0 },
    { nick: "ZVIGENI", points: 0, reward: 0 },
    { nick: "DmQa", points: 0, reward: 0 },
    { nick: "Ksuha", points: 0, reward: 0 },
    { nick: "Алеша ™", points: 0, reward: 0 },
    { nick: "пупсик", points: 0, reward: 0 },
    { nick: "Smile", points: 0, reward: 0 },
    { nick: "Syndicate", points: 0, reward: 0 },
    { nick: "Pe4enkΔ", points: 0, reward: 0 },
    { nick: "Em13!!", points: 0, reward: 0 },
    { nick: "Рыбнадзор", points: 0, reward: 0 },
  ],
  "10.02.2026": [
    { nick: "Фокс", points: 135, reward: 182268 },
    { nick: "Waaar", points: 135, reward: 22200 },
    { nick: "Coo1er91", points: 110, reward: 8000 },
    { nick: "Tokyo108", points: 110, reward: 30642 },
    { nick: "machete", points: 110, reward: 8740 },
    { nick: "Em13!!", points: 90, reward: 13300 },
    { nick: "king00001", points: 90, reward: 9000 },
    { nick: "ZVIGENI", points: 60, reward: 6600 },
    { nick: "Пряник", points: 60, reward: 3500 },
    { nick: "пупсик", points: 60, reward: 8763 },
    { nick: "ссаныекоты", points: 50, reward: 1019 },
    { nick: "XORTYRETSKOGO", points: 0, reward: 0 },
    { nick: "FishKopcheny", points: 0, reward: 0 },
    { nick: "FrankL", points: 0, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Simba33", points: 0, reward: 0 },
    { nick: "АршакМкртчян", points: 0, reward: 0 },
    { nick: "siropchik", points: 0, reward: 0 },
  ],
  "09.02.2026": [
    { nick: "Палач", points: 70, reward: 8400 },
    { nick: "FishKopcheny", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "MilkyWay77", points: 0, reward: 0 },
    { nick: "Tanechka", points: 0, reward: 0 },
  ],
  "06.02.2026": [
    { nick: "Бабник", points: 135, reward: 35612 },
    { nick: "Waaar", points: 110, reward: 9000 },
    { nick: "MTTwnik", points: 110, reward: 21000 },
    { nick: "Em13!!", points: 90, reward: 13473 },
    { nick: "Borsoi", points: 90, reward: 6000 },
    { nick: "Артем Мулеров", points: 0, reward: 0 },
    { nick: "machete", points: 0, reward: 0 },
    { nick: "АндрейБогато", points: 0, reward: 0 },
    { nick: "Player", points: 0, reward: 0 },
    { nick: "Mougli", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
    { nick: "Coo1er91", points: 0, reward: 0 },
    { nick: "Smorodina", points: 0, reward: 0 },
    { nick: "WiNifly", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "Smile", points: 0, reward: 0 },
  ],
  "07.02.2026": [
    { nick: "NINT3NDO", points: 135, reward: 59600 },
    { nick: "mromarrrio", points: 110, reward: 1250 },
    { nick: "Asta002", points: 90, reward: 1249 },
    { nick: "Em13!!", points: 60, reward: 1355 },
    { nick: "comotd", points: 50, reward: 0 },
    { nick: "Бабник", points: 0, reward: 0 },
    { nick: "Откотика_Я", points: 0, reward: 0 },
    { nick: "DonTerrion", points: 0, reward: 0 },
    { nick: "pryanik2la", points: 0, reward: 0 },
  ],
  "08.02.2026": [
    { nick: "WiNifly", points: 60, reward: 20700 },
    { nick: "vnukshtukatura", points: 0, reward: 15500 },
    { nick: "Аспирин", points: 0, reward: 0 },
    { nick: "ПокерМанки", points: 0, reward: 0 },
    { nick: "king00001", points: 0, reward: 0 },
  ],
};
var WINTER_RATING_IMAGES = {
  "17.02.2026": ["rating-17-02-2026.png", "rating-17-02-2026-2.png", "rating-17-02-2026-3.png", "rating-17-02-2026-4.png"],
  "18.02.2026": ["rating-18-02-2026.png"],
  "19.02.2026": ["rating-19-02-2026.png", "rating-19-02-2026-2.png"],
  "20.02.2026": ["rating-20-02-2026.png", "rating-20-02-2026-2.png"],
  "21.02.2026": ["rating-21-02-2026.png", "rating-21-02-2026-2.png"],
  "22.02.2026": ["rating-22-02-2026.png", "rating-22-02-2026-2.png", "rating-22-02-2026-3.png", "rating-22-02-2026-4.png", "rating-22-02-2026-5.png"],
  "23.02.2026": ["rating-23-02-2026.png", "rating-23-02-2026-2.png", "rating-23-02-2026-3.png", "rating-23-02-2026-4.png", "rating-23-02-2026-5.png", "rating-23-02-2026-6.png", "rating-23-02-2026-7.png", "rating-23-02-2026-8.png", "rating-23-02-2026-9.png"],
  "24.02.2026": ["rating-24-02-2026.png", "rating-24-02-2026-2.png", "rating-24-02-2026-3.png", "rating-24-02-2026-4.png", "rating-24-02-2026-5.png"],
  "25.02.2026": ["rating-25-02-2026.png", "rating-25-02-2026-2.png", "rating-25-02-2026-3.png", "rating-25-02-2026-4.png", "rating-25-02-2026-5.png", "rating-25-02-2026-6.png", "rating-25-02-2026-7.png", "rating-25-02-2026-8.png", "rating-25-02-2026-9.png", "rating-25-02-2026-10.png", "rating-25-02-2026-11.png", "rating-25-02-2026-12.png"],
  "26.02.2026": ["rating-26-02-2026.png", "rating-26-02-2026-2.png", "rating-26-02-2026-3.png", "rating-26-02-2026-4.png", "rating-26-02-2026-5.png", "rating-26-02-2026-6.png", "rating-26-02-2026-7.png"],
  "27.02.2026": ["rating-27-02-2026.png", "rating-27-02-2026-2.png", "rating-27-02-2026-3.png", "rating-27-02-2026-4.png", "rating-27-02-2026-5.png", "rating-27-02-2026-6.png", "rating-27-02-2026-7.png", "rating-27-02-2026-8.png"],
  "28.02.2026": ["rating-28-02-2026.png", "rating-28-02-2026-2.png", "rating-28-02-2026-3.png", "rating-28-02-2026-4.png", "rating-28-02-2026-5.png", "rating-28-02-2026-6.png", "rating-28-02-2026-7.png", "rating-28-02-2026-8.png", "rating-28-02-2026-9.png"],
  "15.02.2026": ["rating-15-02-2026.png", "rating-15-02-2026-2.png", "rating-15-02-2026-3.png", "rating-15-02-2026-4.png"],
  "16.02.2026": ["rating-16-02-2026.png", "rating-16-02-2026-2.png", "rating-16-02-2026-3.png"],
  "13.02.2026": ["rating-13-02-2026.png", "rating-13-02-2026-2.png", "rating-13-02-2026-3.png"],
  "14.02.2026": ["rating-14-02-2026.png", "rating-14-02-2026-2.png", "rating-14-02-2026-3.png", "rating-14-02-2026-4.png"],
  "12.02.2026": ["rating-12-02-2026.png", "rating-12-02-2026-2.png", "rating-12-02-2026-3.png", "rating-12-02-2026-4.png", "rating-12-02-2026-5.png"],
  "11.02.2026": ["rating-11-02-2026.png", "rating-11-02-2026-2.png", "rating-11-02-2026-3.png", "rating-11-02-2026-4.png", "rating-11-02-2026-5.png", "rating-11-02-2026-6.png"],
  "10.02.2026": ["rating-10-02-2026.png", "rating-10-02-2026-2.png", "rating-10-02-2026-3.png", "rating-10-02-2026-4.png"],
  "09.02.2026": ["rating-09-02-2026.png"],
  "08.02.2026": ["rating-08-02-2026.png"],
  "06.02.2026": ["rating-06-02-2026.png", "rating-06-02-2026-2.png"],
  "07.02.2026": ["rating-07-02-2026.png", "rating-07-02-2026-2.png", "rating-07-02-2026-3.png"],
  "05.02.2026": ["rating-05-02-2026.png", "rating-05-02-2026-2.png", "rating-05-02-2026-3.png"],
  "04.02.2026": ["rating-04-02-2026.png", "rating-04-02-2026-2.png", "rating-04-02-2026-3.png"],
  "03.02.2026": ["rating-03-02-2026.png", "rating-03-02-2026-2.png"],
  "02.02.2026": ["rating-02-02-2026.png", "rating-02-02-2026-2.png", "rating-02-02-2026-3.png"],
  "01.02.2026": ["rating-01-02-2026.png", "rating-01-02-2026-2.png", "rating-01-02-2026-3.png", "rating-01-02-2026-4.png", "rating-01-02-2026-5.png", "rating-01-02-2026-6.png", "rating-01-02-2026-7.png"],
  "31.01.2026": ["rating-31-01-2026.png", "rating-31-01-2026-2.png", "rating-31-01-2026-3.png"],
  "30.01.2026": ["rating-30-01-2026.png", "rating-30-01-2026-2.png", "rating-30-01-2026-3.png", "rating-30-01-2026-4.png"],
  "29.01.2026": ["rating-29-01-2026.png", "rating-29-01-2026-2.png", "rating-29-01-2026-3.png", "rating-29-01-2026-4.png"],
  "28.01.2026": ["rating-28-01-2026.png"],
  "27.01.2026": ["rating-27-01-2026.png", "rating-27-01-2026-2.png", "rating-27-01-2026-3.png", "rating-27-01-2026-4.png"],
  "26.01.2026": ["rating-26-01-2026.png", "rating-26-01-2026-2.png"],
  "25.01.2026": ["rating-25-01-2026.png", "rating-25-01-2026-2.png", "rating-25-01-2026-3.png", "rating-25-01-2026-4.png"],
  "24.01.2026": ["rating-24-01-2026.png", "rating-24-01-2026-2.png"],
  "23.01.2026": ["rating-23-01-2026.png", "rating-23-01-2026-2.png", "rating-23-01-2026-3.png"],
  "22.01.2026": ["rating-22-01-2026.png", "rating-22-01-2026-2.png", "rating-22-01-2026-3.png"],
  "21.01.2026": ["rating-21-01-2026.png"],
  "20.01.2026": ["rating-20-01-2026.png", "rating-20-01-2026-2.png", "rating-20-01-2026-3.png", "rating-20-01-2026-4.png"],
  "19.01.2026": ["rating-19-01-2026.png", "rating-19-01-2026-2.png"],
  "18.01.2026": ["rating-18-01-2026.png", "rating-18-01-2026-2.png", "rating-18-01-2026-3.png"],
  "17.01.2026": ["rating-17-01-2026.png", "rating-17-01-2026-2.png", "rating-17-01-2026-3.png", "rating-17-01-2026-4.png"],
  "16.01.2026": ["rating-16-01-2026-1.png"],
  "15.01.2026": ["rating-15-01-2026.png", "rating-15-01-2026-2.png", "rating-15-01-2026-3.png", "rating-15-01-2026-4.png"],
  "14.01.2026": ["rating-14-01-2026.png", "rating-14-01-2026-2.png", "rating-14-01-2026-3.png"],
  "13.01.2026": ["rating-13-01-2026.png", "rating-13-01-2026-2.png", "rating-13-01-2026-3.png", "rating-13-01-2026-4.png", "rating-13-01-2026-5.png", "rating-13-01-2026-6.png"],
  "12.01.2026": ["rating-12-01-2026.png", "rating-12-01-2026-2.png", "rating-12-01-2026-3.png", "rating-12-01-2026-4.png", "rating-12-01-2026-5.png"],
  "11.01.2026": ["rating-11-01-2026.png", "rating-11-01-2026-2.png", "rating-11-01-2026-3.png", "rating-11-01-2026-4.png"],
  "10.01.2026": ["rating-10-01-2026.png", "rating-10-01-2026-2.png", "rating-10-01-2026-3.png", "rating-10-01-2026-4.png", "rating-10-01-2026-5.png", "rating-10-01-2026-6.png", "rating-10-01-2026-7.png"],
  "09.01.2026": ["rating-09-01-2026.png", "rating-09-01-2026-2.png", "rating-09-01-2026-3.png", "rating-09-01-2026-4.png", "rating-09-01-2026-5.png"],
  "08.01.2026": ["rating-08-01-2026.png", "rating-08-01-2026-2.png", "rating-08-01-2026-3.png"],
  "07.01.2026": ["rating-07-01-2026.png", "rating-07-01-2026-2.png", "rating-07-01-2026-3.png", "rating-07-01-2026-4.png", "rating-07-01-2026-5.png"],
  "06.01.2026": ["rating-06-01-2026.png", "rating-06-01-2026-2.png", "rating-06-01-2026-3.png"],
  "05.01.2026": ["rating-05-01-2026.png", "rating-05-01-2026-2.png", "rating-05-01-2026-3.png", "rating-05-01-2026-4.png"],
  "04.01.2026": ["rating-04-01-2026.png", "rating-04-01-2026-2.png", "rating-04-01-2026-3.png", "rating-04-01-2026-4.png", "rating-04-01-2026-5.png"],
  "03.01.2026": ["rating-03-01-2026.png", "rating-03-01-2026-2.png", "rating-03-01-2026-3.png", "rating-03-01-2026-4.png"],
  "02.01.2026": ["rating-02-01-2026.png", "rating-02-01-2026-2.png", "rating-02-01-2026-3.png", "rating-02-01-2026-4.png"],
  "01.01.2026": ["rating-01-01-2026.png", "rating-01-01-2026-2.png"],
  "31.12.2025": ["rating-31-12-2025.png", "rating-31-12-2025-2.png", "rating-31-12-2025-3.png"],
  "30.12.2025": ["rating-30-12-2025.png", "rating-30-12-2025-2.png", "rating-30-12-2025-3.png", "rating-30-12-2025-4.png", "rating-30-12-2025-5.png"],
  "29.12.2025": ["rating-29-12-2025.png", "rating-29-12-2025-2.png", "rating-29-12-2025-3.png"],
  "28.12.2025": ["rating-28-12-2025.png", "rating-28-12-2025-2.png", "rating-28-12-2025-3.png"],
  "27.12.2025": ["rating-27-12-2025.png", "rating-27-12-2025-2.png", "rating-27-12-2025-3.png", "rating-27-12-2025-4.png", "rating-27-12-2025-5.png", "rating-27-12-2025-6.png"],
  "26.12.2025": ["rating-26-12-2025.png", "rating-26-12-2025-2.png", "rating-26-12-2025-3.png", "rating-26-12-2025-4.png"],
  "25.12.2025": ["rating-25-12-2025.png", "rating-25-12-2025-2.png", "rating-25-12-2025-3.png", "rating-25-12-2025-4.png", "rating-25-12-2025-5.png"],
  "24.12.2025": ["rating-24-12-2025.png", "rating-24-12-2025-2.png", "rating-24-12-2025-3.png", "rating-24-12-2025-4.png", "rating-24-12-2025-5.png", "rating-24-12-2025-6.png", "rating-24-12-2025-7.png"],
  "23.12.2025": ["rating-23-12-2025.png", "rating-23-12-2025-2.png", "rating-23-12-2025-3.png"],
  "22.12.2025": ["rating-22-12-2025.png", "rating-22-12-2025-2.png", "rating-22-12-2025-3.png"],
  "21.12.2025": ["rating-21-12-2025.png", "rating-21-12-2025-2.png", "rating-21-12-2025-3.png"],
  "20.12.2025": ["rating-20-12-2025.png", "rating-20-12-2025-2.png", "rating-20-12-2025-3.png", "rating-20-12-2025-4.png", "rating-20-12-2025-5.png"],
  "19.12.2025": ["rating-19-12-2025.png", "rating-19-12-2025-2.png", "rating-19-12-2025-3.png", "rating-19-12-2025-4.png"],
  "18.12.2025": ["rating-18-12-2025.png", "rating-18-12-2025-2.png", "rating-18-12-2025-3.png", "rating-18-12-2025-4.png"],
  "17.12.2025": ["rating-17-12-2025.png", "rating-17-12-2025-2.png", "rating-17-12-2025-3.png", "rating-17-12-2025-4.png", "rating-17-12-2025-5.png"],
  "16.12.2025": ["rating-16-12-2025.png", "rating-16-12-2025-2.png", "rating-16-12-2025-3.png", "rating-16-12-2025-4.png", "rating-16-12-2025-5.png"],
  "15.12.2025": ["rating-15-12-2025.png", "rating-15-12-2025-2.png", "rating-15-12-2025-3.png", "rating-15-12-2025-4.png"],
  "14.12.2025": ["rating-14-12-2025.png", "rating-14-12-2025-2.png", "rating-14-12-2025-3.png", "rating-14-12-2025-4.png", "rating-14-12-2025-5.png"],
  "13.12.2025": ["rating-13-12-2025.png", "rating-13-12-2025-2.png", "rating-13-12-2025-3.png", "rating-13-12-2025-4.png"],
  "12.12.2025": ["rating-12-12-2025.png", "rating-12-12-2025-2.png", "rating-12-12-2025-3.png", "rating-12-12-2025-4.png", "rating-12-12-2025-5.png"],
  "11.12.2025": ["rating-11-12-2025.png", "rating-11-12-2025-2.png", "rating-11-12-2025-3.png", "rating-11-12-2025-4.png", "rating-11-12-2025-5.png", "rating-11-12-2025-6.png"],
  "10.12.2025": ["rating-10-12-2025.png", "rating-10-12-2025-2.png", "rating-10-12-2025-3.png", "rating-10-12-2025-4.png"],
  "08.12.2025": ["rating-08-12-2025.png", "rating-08-12-2025-2.png", "rating-08-12-2025-3.png"],
  "07.12.2025": ["rating-07-12-2025.png", "rating-07-12-2025-2.png", "rating-07-12-2025-3.png", "rating-07-12-2025-4.png", "rating-07-12-2025-5.png"]
};
// По дате — массив турниров (время + игроки). Для модалки «все турниры дня» по игроку. Учитывать турниры и с синих, и с красных скринов. Синий/красный: призовые = выигрыш × 100.
var WINTER_RATING_TOURNAMENTS_BY_DATE = {
  "31.01.2026": [
    { time: "19:30", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 24528 }, { nick: "Prokopenya", place: 2, points: 110, reward: 13063 }, { nick: "Shkarubo", place: 3, points: 90, reward: 7917 }, { nick: "Аспирин", place: 4, points: 70, reward: 4914 }, { nick: "Playerx6a7nB", place: 5, points: 60, reward: 4930 }] },
    { time: "18:00", players: [{ nick: "WiNifly", place: 3, points: 90, reward: 11200 }, { nick: "DimassikFiskk", place: 4, points: 70, reward: 8900 }, { nick: "king00001", place: 7, points: 0, reward: 0 }, { nick: "MTTwnik", place: 8, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 9, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "m014yH", place: 1, points: 135, reward: 27000 }, { nick: "DimassikFiskk", place: 2, points: 110, reward: 16200 }, { nick: "MilkyWay77", place: 5, points: 0, reward: 0 }, { nick: "FrankL", place: 12, points: 0, reward: 0 }, { nick: "Coo1er91", place: 13, points: 0, reward: 0 }] },
    { time: "00:00", players: [{ nick: "Фокс", place: 1, points: 135, reward: 25553 }, { nick: "vnukshtukatura", place: 4, points: 70, reward: 77911 }] },
  ],
  "30.01.2026": [
    { time: "08:00", name: "CRAZY", players: [{ nick: "Waaar", place: 1, points: 135, reward: 53475 }] },
    { time: "00:00", players: [{ nick: "Бабник", place: 3, points: 90, reward: 7695 }] },
    { time: "20:30", players: [{ nick: "Waaar", place: 1, points: 135, reward: 49845 }, { nick: "KOL1103", place: 3, points: 90, reward: 18200 }, { nick: "Coo1er91", place: 4, points: 70, reward: 1125 }, { nick: "ПокерМанки", place: 6, points: 50, reward: 1041 }, { nick: "бурят", place: 7, points: 0, reward: 731 }] },
    { time: "17:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 17500 }, { nick: "KOL1103", place: 3, points: 90, reward: 10500 }, { nick: "Nuts", place: 8, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 11, points: 0, reward: 0 }, { nick: "king00001", place: 13, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Salamandr", place: 1, points: 135, reward: 17300 }, { nick: "Waaar", place: 5, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 10, points: 0, reward: 0 }, { nick: "Nuts", place: 11, points: 0, reward: 0 }, { nick: "FrankL", place: 12, points: 0, reward: 0 }] },
  ],
  "29.01.2026": [
    { time: "16:00", players: [{ nick: "FrankL", place: 2, points: 110, reward: 14425 }, { nick: "comotd", place: 4, points: 70, reward: 5884 }, { nick: "Sarmat1305", place: 5, points: 60, reward: 5227 }] },
    { time: "23:00", players: [{ nick: "MEVRIK", place: 2, points: 110, reward: 21699 }, { nick: "Mike Tyson", place: 6, points: 50, reward: 1147 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }, { nick: "Waaar", place: 0, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 35000 }, { nick: "FrankL", place: 2, points: 110, reward: 21000 }, { nick: "Waaar", place: 3, points: 90, reward: 14000 }, { nick: "Milan", place: 4, points: 0, reward: 0 }, { nick: "Rifa", place: 7, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "FrankL", place: 1, points: 135, reward: 15200 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 9040 }, { nick: "Coo1er91", place: 3, points: 90, reward: 6000 }, { nick: "ВИВА", place: 5, points: 0, reward: 0 }, { nick: "Malek3084", place: 11, points: 0, reward: 0 }] },
  ],
  "28.01.2026": [
    { time: "12:00", players: [{ nick: "FrankL", place: 1, points: 135, reward: 19500 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 11680 }, { nick: "Waaar", place: 5, points: 0, reward: 0 }, { nick: "king00001", place: 11, points: 0, reward: 0 }, { nick: "Malek3084", place: 12, points: 0, reward: 0 }] },
  ],
  "27.01.2026": [
    { time: "20:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 14063 }, { nick: "ПокерМанки", place: 7, points: 0, reward: 1856 }, { nick: "KOL1103", place: 10, points: 0, reward: 338 }, { nick: "Coo1er91", place: 12, points: 0, reward: 1688 }] },
    { time: "17:00", players: [{ nick: "Nuts", place: 1, points: 135, reward: 25900 }, { nick: "WiNifly", place: 3, points: 90, reward: 10500 }, { nick: "ПокерМанки", place: 5, points: 60, reward: 7700 }, { nick: "Coo1er91", place: 7, points: 0, reward: 0 }, { nick: "Hakas", place: 9, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 18800 }, { nick: "Waaar", place: 3, points: 90, reward: 7400 }, { nick: "KOL1103", place: 7, points: 0, reward: 0 }, { nick: "FrankL", place: 9, points: 0, reward: 0 }, { nick: "DIVGO", place: 11, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 52516 }, { nick: "NINT3NDO", place: 0, points: 0, reward: 0 }, { nick: "Nitrino", place: 0, points: 0, reward: 0 }, { nick: "Salamander", place: 0, points: 0, reward: 0 }, { nick: "Марико", place: 0, points: 0, reward: 0 }] },
  ],
  "26.01.2026": [
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 57163 }, { nick: "MilkyWay77", place: 2, points: 110, reward: 17884 }, { nick: "Waaar", place: 5, points: 60, reward: 12347 }, { nick: "Рамиль01", place: 6, points: 50, reward: 10631 }, { nick: "Rifa", place: 11, points: 0, reward: 2138 }] },
    { time: "23:00", players: [{ nick: "Фокс", place: 2, points: 110, reward: 34857 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }, { nick: "Марико", place: 0, points: 0, reward: 0 }, { nick: "Coo1er91", place: 0, points: 0, reward: 0 }] },
  ],
  "25.01.2026": [
    { time: "00:00", players: [{ nick: "comotd", place: 2, points: 110, reward: 16423 }, { nick: "Madmax13", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }, { nick: "Xays..", place: 0, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "Фокс", place: 2, points: 110, reward: 130072 }, { nick: "Бабник", place: 5, points: 60, reward: 55903 }, { nick: "Sarmat1305", place: 15, points: 0, reward: 14761 }, { nick: "Тритоныч", place: 16, points: 0, reward: 10884 }, { nick: "kriaks", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "ВИВА", place: 1, points: 135, reward: 25900 }, { nick: "m0l4yH", place: 2, points: 110, reward: 17500 }, { nick: "Prushnik", place: 3, points: 90, reward: 10500 }, { nick: "Coo1er91", place: 5, points: 60, reward: 7700 }, { nick: "ПокерМанки", place: 7, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "KOL1103", place: 3, points: 90, reward: 14533 }, { nick: "Coo1er91", place: 5, points: 60, reward: 2981 }, { nick: "Аспирин", place: 6, points: 50, reward: 1350 }, { nick: "Ksuha", place: 7, points: 0, reward: 2166 }, { nick: "Waaar", place: 8, points: 0, reward: 338 }] },
  ],
  "24.01.2026": [
    { time: "12:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 16300 }, { nick: "This.Way", place: 4, points: 0, reward: 0 }, { nick: "king00001", place: 9, points: 0, reward: 0 }, { nick: "Player180431", place: 13, points: 0, reward: 0 }] },
    { time: "16:00", players: [{ nick: "Sarmat1305", place: 5, points: 60, reward: 5029 }, { nick: "vnukshtukatura", place: 14, points: 0, reward: 0 }] },
  ],
  "23.01.2026": [
    { time: "17:00", players: [{ nick: "Prushnik", place: 1, points: 135, reward: 35000 }, { nick: "Nuts", place: 2, points: 110, reward: 21000 }, { nick: "WiNifly", place: 3, points: 90, reward: 14000 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "Чеб43", place: 7, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Rifa", place: 1, points: 135, reward: 50659 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 17038 }, { nick: "Waaar", place: 5, points: 60, reward: 8875 }, { nick: "Poker_poher", place: 8, points: 0, reward: 4781 }, { nick: "WiNifly", place: 9, points: 0, reward: 2081 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 52567 }, { nick: "Coo1er91", place: 0, points: 0, reward: 0 }, { nick: "Waaar", place: 0, points: 0, reward: 0 }, { nick: "cap888881", place: 0, points: 0, reward: 0 }, { nick: "nachyn", place: 0, points: 0, reward: 0 }] },
  ],
  "22.01.2026": [
    { time: "15:00", players: [{ nick: "nachyn", place: 1, points: 135, reward: 27685 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 38067 }, { nick: "Coo1er91", place: 2, points: 110, reward: 10156 }, { nick: "Prushnik", place: 3, points: 90, reward: 9066 }, { nick: "WiNifly", place: 4, points: 70, reward: 7875 }, { nick: "ПокерМанки", place: 5, points: 60, reward: 900 }] },
    { time: "21:00", players: [{ nick: "comotd", place: 5, points: 60, reward: 6449 }, { nick: "n1kk1ex", place: 10, points: 0, reward: 2781 }, { nick: "outsider", place: 37, points: 0, reward: 350 }, { nick: "petroochoo", place: 0, points: 0, reward: 0 }, { nick: "kream89", place: 0, points: 0, reward: 0 }] },
  ],
  "21.01.2026": [
    { time: "20:00", players: [{ nick: "RS888", place: 1, points: 135, reward: 71681 }, { nick: "WiNifly", place: 8, points: 0, reward: 338 }, { nick: "Waaar", place: 9, points: 0, reward: 2700 }, { nick: "Рамиль01", place: 13, points: 0, reward: 338 }, { nick: "IRIHKA", place: 14, points: 0, reward: 338 }] },
  ],
  "20.01.2026": [
    { time: "00:00", players: [{ nick: "Em13!!", place: 2, points: 110, reward: 17284 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Зараза", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "comotd", place: 3, points: 90, reward: 27292 }, { nick: "Феникс", place: 9, points: 0, reward: 7423 }, { nick: "ArsenalFan", place: 15, points: 0, reward: 5256 }, { nick: "Natali", place: 0, points: 0, reward: 350 }, { nick: "Sergeant", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 20561 }, { nick: "Coo1er91", place: 4, points: 70, reward: 10056 }, { nick: "@Felix", place: 13, points: 0, reward: 731 }, { nick: "WiNifly", place: 14, points: 0, reward: 1013 }, { nick: "igor83", place: 16, points: 0, reward: 450 }] },
    { time: "12:00", players: [{ nick: "m014yH", place: 1, points: 135, reward: 15500 }, { nick: "Coo1er91", place: 3, points: 90, reward: 6160 }, { nick: "This.Way", place: 7, points: 0, reward: 0 }, { nick: "Vaduxa_tiran", place: 9, points: 0, reward: 0 }, { nick: "Andrei350", place: 10, points: 0, reward: 0 }] },
  ],
  "19.01.2026": [
    { time: "16:00", players: [{ nick: "Sarmat1305", place: 3, points: 90, reward: 9943 }, { nick: "Егор", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 3, points: 90, reward: 24884 }, { nick: "Waaar", place: 6, points: 50, reward: 1688 }, { nick: "Milan", place: 8, points: 0, reward: 3206 }, { nick: "m014yH", place: 10, points: 0, reward: 0 }, { nick: "igor83", place: 12, points: 0, reward: 338 }] },
  ],
  "18.01.2026": [
    { time: "15:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 35356 }, { nick: "Рыбнадзор", place: 6, points: 0, reward: 0 }, { nick: "Alladin", place: 0, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 0, points: 0, reward: 0 }, { nick: "Natali", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "pryanik2la", place: 4, points: 70, reward: 15084 }, { nick: "comotd", place: 39, points: 0, reward: 150 }, { nick: "EnotSimuran", place: 0, points: 0, reward: 0 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }, { nick: "Homkaa", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 14781 }, { nick: "ПокерМанки", place: 9, points: 0, reward: 1350 }, { nick: "4hs.", place: 10, points: 0, reward: 0 }, { nick: "IRIHKA", place: 11, points: 0, reward: 3038 }, { nick: "MilkyWay77", place: 12, points: 0, reward: 225 }] },
  ],
  "17.01.2026": [
    { time: "18:00", players: [{ nick: "Фокс", place: 1, points: 135, reward: 182142 }, { nick: "NINT3NDO", place: 38, points: 0, reward: 3696 }, { nick: "DzhalaLove", place: 0, points: 0, reward: 0 }, { nick: "Naparnik", place: 0, points: 0, reward: 0 }, { nick: "FART777", place: 0, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 38043 }, { nick: "Natali", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "IRIHKA", place: 4, points: 70, reward: 8275 }, { nick: "Pentagrammall", place: 5, points: 60, reward: 4875 }, { nick: "Coo1er91", place: 6, points: 50, reward: 6569 }, { nick: "FishKopcheny", place: 7, points: 0, reward: 5547 }, { nick: "ArsanaBoss", place: 10, points: 0, reward: 2250 }] },
    { time: "12:00", players: [{ nick: "Mr.V", place: 1, points: 135, reward: 20900 }, { nick: "Coo1er91", place: 2, points: 110, reward: 12560 }, { nick: "Waaar", place: 4, points: 0, reward: 0 }, { nick: "Rom4ik", place: 7, points: 0, reward: 0 }, { nick: "m014yH", place: 12, points: 0, reward: 0 }] },
  ],
  "16.01.2026": [
    { time: "00:00", players: [{ nick: "FrankL", place: 1, points: 135, reward: 57289 }, { nick: "maksim16rus", place: 19, points: 0, reward: 1987 }, { nick: "Madmax13", place: 0, points: 0, reward: 0 }, { nick: "vnukshtukatura", place: 0, points: 0, reward: 0 }, { nick: "nachyn", place: 0, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Рыбнадзор", place: 1, points: 135, reward: 22257 }, { nick: "Феникс", place: 2, points: 110, reward: 4368 }, { nick: "Natali", place: 0, points: 0, reward: 0 }, { nick: "Lorenco", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }] },
  ],
  "15.01.2026": [
    { time: "20:00", players: [{ nick: "Waaar", place: 4, points: 70, reward: 20193 }, { nick: "pryanik2la", place: 20, points: 0, reward: 0 }, { nick: "qoqoEpta", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "Рыбнадзор", place: 4, points: 70, reward: 13594 }, { nick: "n1kk1ex", place: 41, points: 0, reward: 1700 }, { nick: "maksim16rus", place: 0, points: 0, reward: 0 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }, { nick: "WhiskeyClub", place: 0, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 29363 }, { nick: "Фокс", place: 2, points: 110, reward: 25500 }, { nick: "Em13!!", place: 5, points: 60, reward: 2016 }, { nick: "Natali", place: 0, points: 0, reward: 0 }, { nick: "kabanchik", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 3, points: 90, reward: 8725 }, { nick: "Mr.V", place: 6, points: 50, reward: 1350 }, { nick: "Coo1er91", place: 7, points: 0, reward: 3459 }, { nick: "WiNifly", place: 8, points: 0, reward: 0 }, { nick: "asd-39", place: 9, points: 0, reward: 225 }] },
  ],
  "14.01.2026": [
    { time: "13:00", players: [{ nick: "FrankL", place: 5, points: 60, reward: 5532 }, { nick: "electrocomvpk", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "rrromarrrio", place: 0, points: 0, reward: 0 }, { nick: "Smile", place: 0, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Coo1er91", place: 3, points: 90, reward: 21981 }, { nick: "Фокс", place: 2, points: 110, reward: 19931 }, { nick: "FrankL", place: 11, points: 0, reward: 0 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 18030 }, { nick: "WiNifly", place: 3, points: 90, reward: 10688 }, { nick: "RS888", place: 4, points: 70, reward: 10534 }, { nick: "Darkstorn", place: 10, points: 0, reward: 1519 }, { nick: "Рамиль01", place: 11, points: 0, reward: 450 }] },
  ],
  "13.01.2026": [
    { time: "13:00", players: [{ nick: "FrankL", place: 2, points: 110, reward: 23984 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "kriaks", place: 31, points: 0, reward: 0 }, { nick: "Smile", place: 39, points: 0, reward: 0 }, { nick: "ArsenalFan", place: 0, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "FrankL", place: 5, points: 60, reward: 3307 }, { nick: "Em13!!", place: 10, points: 0, reward: 0 }, { nick: "FART777", place: 0, points: 0, reward: 0 }, { nick: "kriaks", place: 0, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 48309 }] },
    { time: "23:00", players: [{ nick: "kabanchik", place: 1, points: 135, reward: 41075 }, { nick: "Рыбнадзор", place: 15, points: 0, reward: 0 }, { nick: "MEVRIK", place: 0, points: 0, reward: 0 }, { nick: "Фокс", place: 20, points: 0, reward: 0 }, { nick: "Феникс", place: 23, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 48541 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 13125 }, { nick: "Waaar", place: 4, points: 70, reward: 12462 }, { nick: "Prushnik", place: 6, points: 50, reward: 6513 }, { nick: "QQQ777", place: 7, points: 0, reward: 1013 }] },
    { time: "12:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 15000 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 6000 }, { nick: "DIVGO", place: 6, points: 0, reward: 0 }, { nick: "Hakas", place: 7, points: 0, reward: 0 }, { nick: "izh18rus", place: 8, points: 0, reward: 0 }] },
  ],
  "12.01.2026": [
    { time: "23:00", players: [{ nick: "Фокс", place: 5, points: 60, reward: 4680 }, { nick: "Em13!!", place: 9, points: 0, reward: 2137 }, { nick: "Coo1er91", place: 15, points: 0, reward: 0 }, { nick: "FrankL", place: 24, points: 0, reward: 0 }, { nick: "ArsenalFan", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 4, points: 70, reward: 36852 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }, { nick: "vnukshtukatura", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "FART777", place: 6, points: 50, reward: 9918 }, { nick: "DiagPro161", place: 7, points: 0, reward: 8222 }, { nick: "kriaks", place: 10, points: 0, reward: 3191 }, { nick: "Em13!!", place: 30, points: 0, reward: 1535 }, { nick: "outsider", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 3, points: 90, reward: 12838 }, { nick: "WiNifly", place: 6, points: 50, reward: 338 }, { nick: "Coo1er91", place: 7, points: 0, reward: 4809 }, { nick: "@Felix", place: 8, points: 0, reward: 5316 }, { nick: "vnukshtukatura", place: 12, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "hakasik", place: 2, points: 110, reward: 14000 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 9300 }, { nick: "<Amaliya>", place: 5, points: 0, reward: 0 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "DIVGO", place: 11, points: 0, reward: 0 }] },
  ],
  "11.01.2026": [
    { time: "10:00", name: "CRAZY MAIN EVENT", players: [{ nick: "Waaar", place: 1, points: 90, reward: 414575 }] },
    { time: "00:00", players: [{ nick: "Феникс", place: 2, points: 110, reward: 18495 }, { nick: "ArsenalFan", place: 4, points: 70, reward: 12731 }, { nick: "cap888881", place: 39, points: 0, reward: 1425 }, { nick: "Mike Tyson", place: 15, points: 0, reward: 858 }, { nick: "Co4Hblu", place: 0, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 5, points: 60, reward: 2343 }, { nick: "Зараза", place: 8, points: 0, reward: 0 }, { nick: "kriaks", place: 14, points: 0, reward: 0 }, { nick: "Mike Tyson", place: 18, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 2, points: 110, reward: 20525 }, { nick: "WiNifly", place: 4, points: 70, reward: 10313 }, { nick: "Coo1er91", place: 6, points: 50, reward: 1800 }, { nick: "Baldendi", place: 8, points: 0, reward: 0 }, { nick: "<Amaliya>", place: 11, points: 0, reward: 900 }] },
  ],
  "10.01.2026": [
    { time: "19:00", players: [{ nick: "Sarmat1305", place: 3, points: 90, reward: 491248 }, { nick: "Simba33", place: 0, points: 0, reward: 0 }, { nick: "cap888881", place: 0, points: 0, reward: 0 }, { nick: "Mike Tyson", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "vnukshtukatura", place: 4, points: 70, reward: 64538 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }, { nick: "Art555", place: 0, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 0, points: 0, reward: 0 }, { nick: "outsider", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "Co4Hblu", place: 2, points: 110, reward: 23960 }, { nick: "Зараза", place: 3, points: 90, reward: 19211 }, { nick: "Em13!!", place: 4, points: 70, reward: 16698 }, { nick: "Mike Tyson", place: 24, points: 0, reward: 1418 }, { nick: "kriaks", place: 61, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Фокс", place: 1, points: 135, reward: 48276 }, { nick: "Mike Tyson", place: 8, points: 0, reward: 1895 }, { nick: "vnukshtukatura", place: 0, points: 0, reward: 0 }, { nick: "Феникс", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 64346 }, { nick: "Prushnik", place: 6, points: 50, reward: 9590 }, { nick: "Pentagrammall", place: 10, points: 0, reward: 844 }, { nick: "nerrielle", place: 11, points: 0, reward: 2700 }, { nick: "Salamandr", place: 13, points: 0, reward: 1181 }] },
    { time: "17:00", players: [{ nick: "vnukshtukatura", place: 2, points: 110, reward: 18780 }, { nick: "Rom4ik", place: 3, points: 90, reward: 11200 }, { nick: "Coo1er91", place: 9, points: 0, reward: 0 }, { nick: "DIVGO", place: 10, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 15, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 15000 }, { nick: "Rom4ik", place: 3, points: 90, reward: 6000 }, { nick: "king00001", place: 4, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 5, points: 0, reward: 0 }, { nick: "hakasik", place: 6, points: 0, reward: 0 }] },
  ],
  "09.01.2026": [
    { time: "00:00", players: [{ nick: "vnukshtukatura", place: 1, points: 135, reward: 67560 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "Переездыч", place: 0, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "FrankL", place: 3, points: 90, reward: 21789 }, { nick: "Em13!!", place: 10, points: 0, reward: 794 }, { nick: "NINT3NDO", place: 31, points: 0, reward: 0 }, { nick: "Фартовый", place: 22, points: 0, reward: 0 }, { nick: "cap888881", place: 21, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Рыбнадзор", place: 5, points: 60, reward: 3190 }, { nick: "Em13!!", place: 4, points: 70, reward: 2796 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Бэха", place: 27, points: 0, reward: 0 }, { nick: "cap888881", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 60841 }, { nick: "WiNifly", place: 3, points: 90, reward: 26159 }, { nick: "<Amaliya>", place: 4, points: 70, reward: 10000 }, { nick: "Лудоман", place: 5, points: 60, reward: 9319 }, { nick: "Coo1er91", place: 6, points: 50, reward: 13819 }] },
    { time: "17:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 19100 }, { nick: "Prushnik", place: 3, points: 90, reward: 11500 }, { nick: "Nuts", place: 6, points: 0, reward: 0 }, { nick: "VICTORINOX", place: 9, points: 0, reward: 0 }, { nick: "Чеб43", place: 13, points: 0, reward: 0 }] },
  ],
  "08.01.2026": [
    { time: "20:00", players: [{ nick: "hakasik", place: 1, points: 135, reward: 37140 }, { nick: "MilkyWay77", place: 2, points: 110, reward: 14384 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 10649 }, { nick: "Waaar", place: 4, points: 70, reward: 7634 }, { nick: "Coo1er91", place: 5, points: 60, reward: 8272 }] },
    { time: "18:00", players: [{ nick: "vnukshtukatura", place: 1, points: 135, reward: 64000 }, { nick: "Coo1er91", place: 2, points: 110, reward: 36000 }, { nick: "Waaar", place: 5, points: 60, reward: 16600 }, { nick: "Nuts", place: 6, points: 50, reward: 14600 }, { nick: "ПокерМанки", place: 12, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "DIVGO", place: 2, points: 110, reward: 11680 }, { nick: "Coo1er91", place: 3, points: 90, reward: 7700 }, { nick: "Nuts", place: 4, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 7, points: 0, reward: 0 }, { nick: "king00001", place: 8, points: 0, reward: 0 }] },
  ],
  "07.01.2026": [
    { time: "15:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 20983 }, { nick: "vvllaadd", place: 0, points: 0, reward: 0 }, { nick: "WhiskeyClub", place: 0, points: 0, reward: 0 }] },
    { time: "00:00", players: [{ nick: "electrocomvpk", place: 5, points: 60, reward: 7834 }, { nick: "Em13!!", place: 6, points: 50, reward: 6845 }, { nick: "Бабник", place: 10, points: 0, reward: 1090 }, { nick: "outsider", place: 15, points: 0, reward: 720 }, { nick: "FART777", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Рыбнадзор", place: 6, points: 50, reward: 48910 }, { nick: "Mougli", place: 8, points: 0, reward: 19182 }, { nick: "isildur", place: 10, points: 0, reward: 11864 }, { nick: "Monfokon", place: 42, points: 0, reward: 3438 }, { nick: "Бабник", place: 40, points: 0, reward: 2992 }] },
    { time: "20:00", players: [{ nick: "WiNifly", place: 1, points: 135, reward: 73772 }, { nick: "Coo1er91", place: 2, points: 110, reward: 31250 }, { nick: "Rifa", place: 5, points: 60, reward: 5850 }, { nick: "Waaar", place: 6, points: 50, reward: 1800 }, { nick: "Алеша™", place: 8, points: 0, reward: 3938 }] },
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 5, points: 60, reward: 8300 }, { nick: "Kotik", place: 9, points: 0, reward: 0 }, { nick: "Waaar", place: 10, points: 0, reward: 0 }, { nick: "Nuts", place: 11, points: 0, reward: 0 }, { nick: "WiNifly", place: 12, points: 0, reward: 0 }] },
  ],
  "06.01.2026": [
    { time: "16:00", players: [{ nick: "Sarmat1305", place: 2, points: 110, reward: 10000 }, { nick: "FrankL", place: 9, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "WiNifly", place: 3, points: 90, reward: 11669 }, { nick: "Coo1er91", place: 6, points: 50, reward: 1125 }, { nick: "MORPEH", place: 7, points: 0, reward: 788 }, { nick: "Sokol", place: 8, points: 0, reward: 1238 }, { nick: "<Amaliya>", place: 9, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 19580 }, { nick: "Coo1er91", place: 3, points: 90, reward: 4005 }, { nick: "Waaar", place: 4, points: 70, reward: 900 }, { nick: "Mr.V", place: 5, points: 60, reward: 1125 }, { nick: "Em13!!", place: 7, points: 0, reward: 0 }] },
  ],
  "05.01.2026": [
    { time: "12:00", players: [{ nick: "Salamandr", place: 1, points: 135, reward: 18200 }, { nick: "shockin", place: 5, points: 60, reward: 5300 }, { nick: "PodayPereap", place: 6, points: 0, reward: 0 }, { nick: "vnukshtukatura", place: 8, points: 0, reward: 0 }, { nick: "<Amaliya>", place: 9, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 38059 }, { nick: "PodayPereap", place: 2, points: 110, reward: 26609 }, { nick: "Coo1er91", place: 3, points: 90, reward: 12063 }, { nick: "FanatCoo1era", place: 4, points: 70, reward: 7625 }, { nick: "Milan", place: 5, points: 60, reward: 7150 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 40331 }, { nick: "Em13!!", place: 2, points: 110, reward: 7594 }, { nick: "DIVGO", place: 4, points: 70, reward: 4894 }, { nick: "Waaar", place: 5, points: 60, reward: 675 }, { nick: "RS888", place: 6, points: 50, reward: 675 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 63391 }, { nick: "Simba33", place: 2, points: 110, reward: 965 }, { nick: "FART777", place: 3, points: 0, reward: 0 }, { nick: "outsider", place: 4, points: 0, reward: 0 }, { nick: "MEVRIK", place: 5, points: 0, reward: 0 }] },
  ],
  "04.01.2026": [
    { time: "12:00", players: [{ nick: "DIVGO", place: 1, points: 135, reward: 17000 }, { nick: "Em13!!", place: 3, points: 90, reward: 6700 }, { nick: "Salamandr", place: 6, points: 0, reward: 0 }, { nick: "PodayPereap", place: 7, points: 0, reward: 0 }, { nick: "vnukshtukatura", place: 8, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "doss93", place: 1, points: 135, reward: 32300 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 20300 }, { nick: "FrankL", place: 3, points: 90, reward: 13900 }, { nick: "Coo1er91", place: 5, points: 60, reward: 8200 }, { nick: "Prushnik", place: 8, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Poker_poher", place: 4, points: 70, reward: 43400 }, { nick: "Ronn", place: 7, points: 0, reward: 26600 }, { nick: "AliPetuhov", place: 8, points: 0, reward: 20600 }, { nick: "Ksuha", place: 9, points: 0, reward: 14700 }, { nick: "mamalena", place: 14, points: 0, reward: 11300 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 17866 }, { nick: "Em13!!", place: 9, points: 0, reward: 225 }, { nick: "FrankL", place: 13, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 14, points: 0, reward: 1012 }, { nick: "kriak", place: 15, points: 0, reward: 1406 }] },
    { time: "21:00", players: [{ nick: "WhiskeyClub", place: 1, points: 135, reward: 31556 }, { nick: "cap888881", place: 2, points: 110, reward: 350 }, { nick: "AlenaSt", place: 3, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 4, points: 0, reward: 0 }, { nick: "Руслан4ик", place: 5, points: 0, reward: 0 }] },
  ],
  "03.01.2026": [
    { time: "13:00", players: [{ nick: "outsider", place: 0, points: 0, reward: 0 }, { nick: "cap888881", place: 0, points: 0, reward: 0 }, { nick: "VoRoNoFF", place: 0, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 0, points: 0, reward: 0 }, { nick: "Smile", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "Simba33", place: 0, points: 0, reward: 0 }, { nick: "Sarmat1305", place: 0, points: 0, reward: 0 }, { nick: "FrankL", place: 0, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "outsider", place: 2, points: 110, reward: 20278 }, { nick: "cap888881", place: 3, points: 90, reward: 15224 }, { nick: "VoRoNoFF", place: 5, points: 60, reward: 9035 }, { nick: "NINT3NDO", place: 13, points: 0, reward: 2581 }, { nick: "Smile", place: 39, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "DIVGO", place: 4, points: 70, reward: 20400 }, { nick: "Waaar", place: 5, points: 60, reward: 16200 }, { nick: "VICTORINOX", place: 9, points: 0, reward: 7400 }, { nick: "Алеша™", place: 10, points: 0, reward: 0 }, { nick: "Adam1993", place: 11, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "MilkyWay77", place: 1, points: 135, reward: 21400 }, { nick: "Em13!!", place: 2, points: 110, reward: 14400 }, { nick: "Рамиль01fan", place: 3, points: 90, reward: 8600 }, { nick: "PodayPereap", place: 4, points: 70, reward: 6900 }, { nick: "Loki", place: 6, points: 0, reward: 0 }] },
  ],
  "02.01.2026": [
    { time: "13:00", players: [{ nick: "Em13!!", place: 2, points: 110, reward: 29012 }, { nick: "FrankL", place: 47, points: 0, reward: 1981 }, { nick: "RikAnrak", place: 18, points: 0, reward: 1334 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 45494 }, { nick: "Waaar", place: 2, points: 110, reward: 13238 }, { nick: "Adam1993", place: 5, points: 60, reward: 8075 }, { nick: "ПокерМанки", place: 6, points: 50, reward: 6131 }, { nick: "<Amaliya>", place: 9, points: 0, reward: 1125 }] },
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 30800 }, { nick: "Em13!!", place: 4, points: 70, reward: 9600 }, { nick: "Бабник", place: 5, points: 60, reward: 7900 }, { nick: "LuckyBoom", place: 7, points: 0, reward: 0 }, { nick: "Adam1993", place: 8, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 32734 }, { nick: "Guldanco", place: 19, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }, { nick: "godzi888", place: 0, points: 0, reward: 0 }, { nick: "Madmax13", place: 68, points: 0, reward: 0 }] },
  ],
  "01.01.2026": [
    { time: "20:00", players: [{ nick: "AuraAA", place: 1, points: 135, reward: 46306 }, { nick: "Loki", place: 5, points: 60, reward: 9641 }, { nick: "Coo1er91", place: 6, points: 50, reward: 5681 }, { nick: "Sarmat1305", place: 9, points: 0, reward: 338 }, { nick: "RS888", place: 11, points: 0, reward: 1125 }] },
    { time: "17:00", players: [{ nick: "BOTEZGAMBIT", place: 2, points: 110, reward: 18100 }, { nick: "king00001", place: 3, points: 90, reward: 12380 }, { nick: "ПокерМанки", place: 4, points: 70, reward: 9000 }, { nick: "myhomor4ik", place: 5, points: 60, reward: 7300 }, { nick: "PlayerFD6762", place: 13, points: 0, reward: 0 }] },
  ],
  "25.12.2025": [
    { time: "00:00", players: [{ nick: "Coo1er91", place: 4, points: 70, reward: 5800 }, { nick: "FrankL", place: 13, points: 0, reward: 1500 }, { nick: "@Felix", place: 14, points: 0, reward: 1500 }, { nick: "SPARTAK", place: 16, points: 0, reward: 0 }, { nick: "tashovvv", place: 24, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Waaar", place: 5, points: 60, reward: 5700 }, { nick: "king00001", place: 12, points: 0, reward: 0 }, { nick: "FrankL", place: 13, points: 0, reward: 0 }, { nick: "Rom4ik", place: 15, points: 0, reward: 0 }, { nick: "PONOCHKA", place: 16, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "AliPetuhov", place: 1, points: 135, reward: 25900 }, { nick: "doss93", place: 7, points: 0, reward: 0 }, { nick: "Waaar", place: 10, points: 0, reward: 0 }, { nick: "king00001", place: 13, points: 0, reward: 0 }, { nick: "COBRA", place: 14, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Simba33", place: 2, points: 110, reward: 105700 }, { nick: "pryanik2la", place: 0, points: 0, reward: 0 }, { nick: "PokerMonkeyX", place: 0, points: 0, reward: 0 }, { nick: "Waaarr", place: 0, points: 0, reward: 0 }, { nick: "cap888881", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 3, points: 90, reward: 8375 }, { nick: "Waaar", place: 4, points: 70, reward: 9298 }, { nick: "Coo1er91", place: 7, points: 0, reward: 0 }, { nick: "Danger", place: 8, points: 0, reward: 1547 }, { nick: "Палач", place: 10, points: 0, reward: 338 }] },
  ],
  "31.12.2025": [
    { time: "00:00", players: [{ nick: "Бабник", place: 2, points: 110, reward: 27409 }, { nick: "Em13!!", place: 13, points: 0, reward: 3107 }, { nick: "АршакМкртчян", place: 0, points: 0, reward: 750 }] },
    { time: "12:00", players: [{ nick: "king00001", place: 3, points: 90, reward: 6400 }, { nick: "yebanfan", place: 5, points: 0, reward: 0 }, { nick: "Waaar", place: 7, points: 0, reward: 0 }, { nick: "This.Way", place: 8, points: 0, reward: 0 }, { nick: "Рамиль01", place: 9, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "WhiskeyClub", place: 1, points: 135, reward: 552 }, { nick: "adiga666", place: 2, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Smile 😎🤩😻", place: 3, points: 0, reward: 0 }, { nick: "XP3723391", place: 0, points: 0, reward: 0 }] },
  ],
  "30.12.2025": [
    { time: "12:00", players: [{ nick: "yebanfan", place: 2, points: 110, reward: 12780 }, { nick: "DIVGO", place: 3, points: 90, reward: 8400 }, { nick: "Waaar", place: 8, points: 0, reward: 0 }, { nick: "PodayPereap", place: 10, points: 0, reward: 0 }, { nick: "Рамиль01", place: 11, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "ЗараЗа", place: 5, points: 60, reward: 7624 }, { nick: "vnukshtukatura", place: 31, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "XP3723391", place: 0, points: 0, reward: 0 }, { nick: "Natali", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "VICTORINOX", place: 2, points: 110, reward: 204300 }, { nick: "PodayPereap", place: 3, points: 90, reward: 104100 }, { nick: "FrankL", place: 4, points: 70, reward: 91000 }, { nick: "Waaar", place: 7, points: 0, reward: 48800 }, { nick: "AliPetuhov", place: 11, points: 0, reward: 16500 }] },
    { time: "20:00", players: [{ nick: "PlayerFE634D", place: 5, points: 60, reward: 9091 }, { nick: "<Amaliya>", place: 6, points: 50, reward: 1828 }, { nick: "yebanfan", place: 10, points: 0, reward: 0 }, { nick: "@Felix", place: 11, points: 0, reward: 225 }, { nick: "No.mercy", place: 12, points: 0, reward: 900 }] },
    { time: "23:00", players: [{ nick: "Coo1er91", place: 4, points: 70, reward: 7084 }, { nick: "Natali", place: 12, points: 0, reward: 1859 }, { nick: "cap888881", place: 25, points: 0, reward: 0 }, { nick: "kriaks", place: 35, points: 0, reward: 0 }, { nick: "Фокс", place: 40, points: 0, reward: 0 }] },
  ],
  "29.12.2025": [
    { time: "12:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 14900 }, { nick: "Палач", place: 4, points: 0, reward: 0 }, { nick: "Waaar", place: 5, points: 0, reward: 0 }, { nick: "king00001", place: 8, points: 0, reward: 0 }, { nick: "Рамиль01", place: 10, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Pentagrammall", place: 2, points: 110, reward: 22900 }, { nick: "yebanfan", place: 3, points: 90, reward: 15580 }, { nick: "IRIHKA", place: 4, points: 70, reward: 11400 }, { nick: "Coo1er91", place: 11, points: 0, reward: 0 }, { nick: "VICTORINOX", place: 16, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Coo1er91", place: 6, points: 50, reward: 5320 }, { nick: "Зараза", place: 12, points: 0, reward: 1893 }, { nick: "Natali", place: 14, points: 0, reward: 1893 }, { nick: "Simba33", place: 19, points: 0, reward: 0 }, { nick: "Бабник", place: 43, points: 0, reward: 0 }] },
  ],
  "28.12.2025": [
    { time: "12:00", players: [{ nick: "DIVGO", place: 2, points: 110, reward: 11800 }, { nick: "Waaar", place: 4, points: 0, reward: 0 }, { nick: "yebanfan", place: 8, points: 0, reward: 0 }, { nick: "king00001", place: 12, points: 0, reward: 0 }, { nick: "Mapc", place: 13, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 3, points: 90, reward: 12600 }, { nick: "Playergv1L2b", place: 4, points: 70, reward: 9120 }, { nick: "ПокерМанки", place: 6, points: 50, reward: 6600 }, { nick: "Рамиль01", place: 7, points: 0, reward: 0 }, { nick: "yebanfan", place: 8, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Зараза", place: 2, points: 110, reward: 18091 }, { nick: "Waaar", place: 4, points: 70, reward: 8656 }, { nick: "Coo1er91", place: 5, points: 60, reward: 5769 }, { nick: "Shkarubo", place: 6, points: 50, reward: 4100 }, { nick: "Playergv1L2b", place: 10, points: 0, reward: 1463 }] },
  ],
  "27.12.2025": [
    { time: "00:00", players: [{ nick: "siropchik", place: 2, points: 110, reward: 27619 }, { nick: "n1kk1ex", place: 5, points: 60, reward: 7307 }, { nick: "Бабник", place: 9, points: 0, reward: 4524 }, { nick: "Salamander", place: 25, points: 0, reward: 750 }, { nick: "Coo1er91", place: 0, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "yebanfan", place: 1, points: 135, reward: 20900 }, { nick: "DIVGO", place: 5, points: 0, reward: 0 }, { nick: "Rolexx", place: 8, points: 0, reward: 0 }, { nick: "Malek3084", place: 9, points: 0, reward: 0 }, { nick: "FrankL", place: 11, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "cap888881", place: 3, points: 90, reward: 15882 }, { nick: "ArsanaKhalbad", place: 4, points: 70, reward: 624 }, { nick: "Sergeant", place: 37, points: 0, reward: 0 }, { nick: "Аршак Мкртчян", place: 0, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "doss93", place: 2, points: 110, reward: 18200 }, { nick: "king00001", place: 4, points: 70, reward: 8700 }, { nick: "Malek3084", place: 7, points: 0, reward: 0 }, { nick: "cadillac", place: 11, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 14, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Sergeant", place: 3, points: 90, reward: 674 }, { nick: "siropchik", place: 4, points: 70, reward: 458 }, { nick: "kriaks", place: 16, points: 0, reward: 94 }, { nick: "АршакМкртчян", place: 48, points: 0, reward: 57 }, { nick: "cap888881", place: 94, points: 0, reward: 24 }] },
    { time: "20:00", players: [{ nick: "bugsergo", place: 3, points: 90, reward: 11425 }, { nick: "@Felix", place: 6, points: 50, reward: 2925 }, { nick: "ПокерМанки", place: 8, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 14, points: 0, reward: 225 }, { nick: "CRUNCHx2", place: 15, points: 0, reward: 0 }] },
  ],
  "26.12.2025": [
    { time: "00:00", players: [{ nick: "Coo1er91", place: 6, points: 50, reward: 4433 }] },
    { time: "14:00", players: [{ nick: "Em13!!", place: 6, points: 50, reward: 10079 }, { nick: "Бабник", place: 12, points: 0, reward: 3667 }, { nick: "Sergeant", place: 20, points: 0, reward: 3056 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 25900 }, { nick: "mamalena", place: 2, points: 110, reward: 17500 }, { nick: "Анубис", place: 12, points: 0, reward: 0 }, { nick: "Лудоман", place: 13, points: 0, reward: 0 }, { nick: "cadillac", place: 18, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "WiNifly", place: 1, points: 135, reward: 44627 }, { nick: "SAIDEL", place: 3, points: 90, reward: 13013 }, { nick: "bartender303", place: 8, points: 0, reward: 3488 }, { nick: "COBRA", place: 11, points: 0, reward: 450 }, { nick: "Waaar", place: 13, points: 0, reward: 450 }] },
  ],
  "24.12.2025": [
    { time: "00:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 60400 }, { nick: "Coo1er91", place: 18, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }, { nick: "Proxor", place: 0, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "FrankL", place: 1, points: 135, reward: 22400 }, { nick: "@Felix", place: 2, points: 110, reward: 13340 }, { nick: "Mr.V", place: 3, points: 90, reward: 8900 }, { nick: "абырвалГ", place: 5, points: 0, reward: 0 }, { nick: "Rom4ik", place: 8, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "Waaarr", place: 6, points: 50, reward: 8000 }, { nick: "Coo1er91", place: 7, points: 0, reward: 6700 }, { nick: "АршакМкртчян", place: 0, points: 0, reward: 0 }, { nick: "Mougli", place: 0, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 18900 }, { nick: "FrankL", place: 2, points: 110, reward: 8200 }, { nick: "Mougli", place: 0, points: 0, reward: 1700 }, { nick: "Malek3084", place: 7, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "AliPetuhov", place: 3, points: 90, reward: 10800 }, { nick: "Waaar", place: 5, points: 60, reward: 7900 }, { nick: "Mr.V", place: 8, points: 0, reward: 0 }, { nick: "doss93", place: 10, points: 0, reward: 0 }, { nick: "FrankL", place: 20, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "GetHigh", place: 5, points: 60, reward: 178000 }, { nick: "Simba33", place: 16, points: 0, reward: 21100 }, { nick: "siropchik", place: 30, points: 0, reward: 13700 }, { nick: "niklaussssss", place: 38, points: 0, reward: 9200 }, { nick: "arxitektor", place: 107, points: 0, reward: 6800 }] },
    { time: "20:00", players: [{ nick: "Рамиль01", place: 2, points: 110, reward: 22863 }, { nick: "Coo1er91", place: 3, points: 90, reward: 10413 }, { nick: "@Felix", place: 4, points: 70, reward: 7250 }, { nick: "Waaar", place: 5, points: 60, reward: 10025 }, { nick: "Amaliya", place: 6, points: 50, reward: 1181 }] },
  ],
  "21.12.2025": [
    { time: "12:00", players: [{ nick: "FrankL", place: 2, points: 110, reward: 12100 }, { nick: "TiltlProof", place: 5, points: 0, reward: 0 }, { nick: "Waaar", place: 10, points: 0, reward: 0 }, { nick: "king00001", place: 11, points: 0, reward: 0 }, { nick: "Player", place: 13, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "hhohoo", place: 1, points: 135, reward: 334518 }, { nick: "bymep7", place: 94, points: 0, reward: 0 }, { nick: "Baruum", place: 308, points: 0, reward: 0 }, { nick: "baldand", place: 0, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "AliPetuhov", place: 2, points: 110, reward: 20826 }, { nick: "Waaar", place: 3, points: 90, reward: 12225 }, { nick: "vnukshtukatura", place: 7, points: 0, reward: 4887 }, { nick: "VICTORINOX", place: 8, points: 0, reward: 5819 }, { nick: "MilkyWay77", place: 9, points: 0, reward: 1575 }] },
  ],
  "23.12.2025": [
    { time: "12:00", players: [{ nick: "абырвалГ", place: 1, points: 135, reward: 15000 }, { nick: "Waaar", place: 2, points: 110, reward: 9000 }, { nick: "Рамиль01", place: 3, points: 90, reward: 6000 }, { nick: "MilkyWay77", place: 4, points: 0, reward: 0 }, { nick: "Amaliya", place: 6, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "VICTORINOX", place: 2, points: 110, reward: 16800 }, { nick: "Coo1er91", place: 5, points: 60, reward: 6800 }, { nick: "Waaar", place: 10, points: 0, reward: 0 }, { nick: "Amaliya", place: 12, points: 0, reward: 0 }, { nick: "Smorodina", place: 14, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "@Felix", place: 3, points: 90, reward: 10875 }, { nick: "tatarin_1", place: 7, points: 0, reward: 1688 }, { nick: "WiNifly", place: 8, points: 0, reward: 225 }, { nick: "Coo1er91", place: 9, points: 0, reward: 0 }, { nick: "Baldendi", place: 10, points: 0, reward: 0 }] },
  ],
  "22.12.2025": [
    { time: "20:00", players: [{ nick: "WiNifly", place: 2, points: 110, reward: 15649 }, { nick: "Coo1er91", place: 4, points: 70, reward: 7475 }, { nick: "VICTORINOX", place: 5, points: 60, reward: 4825 }, { nick: "Amaliya", place: 6, points: 50, reward: 4325 }, { nick: "Рамиль01", place: 7, points: 0, reward: 8505 }] },
    { time: "21:00", players: [{ nick: "Бабник", place: 6, points: 50, reward: 8400 }, { nick: "Salamander", place: 16, points: 0, reward: 2500 }, { nick: "comotd", place: 0, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }, { nick: "bbvc777", place: 0, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 2, points: 110, reward: 11800 }, { nick: "Mougli", place: 5, points: 60, reward: 10200 }, { nick: "Natali", place: 10, points: 0, reward: 600 }, { nick: "FrankL", place: 44, points: 0, reward: 0 }, { nick: "Марико", place: 0, points: 0, reward: 0 }] },
  ],
  "20.12.2025": [
    { time: "00:00", players: [{ nick: "electrocomvpk", place: 4, points: 70, reward: 16807 }, { nick: "vnukshtukatura", place: 13, points: 0, reward: 4212 }, { nick: "Em13!!", place: 14, points: 0, reward: 0 }, { nick: "baldand", place: 0, points: 0, reward: 0 }, { nick: "Kvits010", place: 29, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 9500 }, { nick: "Amaliya", place: 5, points: 0, reward: 0 }, { nick: "MOJO", place: 6, points: 0, reward: 0 }, { nick: "ШЛЯПАУСАТ", place: 8, points: 0, reward: 0 }, { nick: "JinDaniels", place: 9, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 3, points: 90, reward: 10500 }, { nick: "MOJO", place: 4, points: 70, reward: 8400 }, { nick: "Amaliya", place: 10, points: 0, reward: 0 }, { nick: "mamalena", place: 11, points: 0, reward: 0 }, { nick: "Waaar", place: 14, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "pryanik2la", place: 5, points: 60, reward: 147101 }, { nick: "Waaarr", place: 12, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 4, points: 70, reward: 20620 }, { nick: "electrocomvpk", place: 23, points: 0, reward: 0 }, { nick: "kabanchik", place: 66, points: 0, reward: 0 }, { nick: "Фокс", place: 18, points: 0, reward: 0 }, { nick: "Марико", place: 0, points: 0, reward: 0 }] },
  ],
  "19.12.2025": [
    { time: "00:00", players: [{ nick: "FrankL", place: 2, points: 110, reward: 33327 }, { nick: "baldand", place: 13, points: 0, reward: 3742 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 15000 }, { nick: "COBRA", place: 2, points: 110, reward: 9000 }, { nick: "Waaar", place: 3, points: 90, reward: 6000 }, { nick: "king00001", place: 5, points: 0, reward: 0 }, { nick: "DIVGO", place: 6, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "doss93", place: 4, points: 70, reward: 9000 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 10, points: 0, reward: 0 }, { nick: "Amaliya", place: 15, points: 0, reward: 0 }, { nick: "Twisted-fate_08", place: 19, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Amaliya", place: 2, points: 110, reward: 12612 }, { nick: "Пряник", place: 7, points: 0, reward: 1687 }, { nick: "WiNifly", place: 8, points: 0, reward: 225 }, { nick: "Proxor", place: 9, points: 0, reward: 450 }, { nick: "Player", place: 10, points: 0, reward: 450 }] },
  ],
  "18.12.2025": [
    { time: "12:00", players: [{ nick: "king00001", place: 3, points: 90, reward: 8000 }, { nick: "PlayerFD6762", place: 4, points: 0, reward: 0 }, { nick: "VadiM", place: 8, points: 0, reward: 0 }, { nick: "Tokio90", place: 9, points: 0, reward: 0 }, { nick: "mr.Freeman", place: 10, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 17700 }, { nick: "mamalena", place: 5, points: 60, reward: 7700 }, { nick: "doss93", place: 11, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 13, points: 0, reward: 0 }, { nick: "Em13!!", place: 18, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 4, points: 70, reward: 18450 }, { nick: "RS888", place: 5, points: 60, reward: 1350 }, { nick: "Waaar", place: 6, points: 50, reward: 4950 }, { nick: "MORPEH", place: 8, points: 0, reward: 450 }, { nick: "Пряник", place: 13, points: 0, reward: 900 }] },
    { time: "23:00", players: [{ nick: "Mougli", place: 6, points: 50, reward: 3867 }, { nick: "FrankL", place: 9, points: 0, reward: 6211 }, { nick: "Бэха", place: 20, points: 0, reward: 0 }, { nick: "comotd", place: 28, points: 0, reward: 0 }, { nick: "Natali", place: 0, points: 0, reward: 0 }] },
  ],
  "17.12.2025": [
    { time: "12:00", players: [{ nick: "GetHigh", place: 2, points: 110, reward: 12000 }, { nick: "FrankL", place: 3, points: 90, reward: 8000 }, { nick: "Waaar", place: 5, points: 0, reward: 0 }, { nick: "Amaliya", place: 7, points: 0, reward: 0 }, { nick: "Salamandr", place: 8, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "mamalena", place: 5, points: 60, reward: 7500 }, { nick: "ПокерМанки", place: 7, points: 0, reward: 0 }, { nick: "GetHigh", place: 8, points: 0, reward: 0 }, { nick: "Twisted-fate_08", place: 9, points: 0, reward: 0 }, { nick: "Waaar", place: 10, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 269872 }, { nick: "Анубис", place: 2, points: 110, reward: 12997 }, { nick: "siropchik", place: 3, points: 90, reward: 10497 }, { nick: "n1kk1ex", place: 4, points: 70, reward: 8521 }, { nick: "chemical", place: 5, points: 60, reward: 7550 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 43820 }, { nick: "kriak", place: 2, points: 110, reward: 27951 }, { nick: "Amaliya", place: 3, points: 90, reward: 12193 }, { nick: "γύψος", place: 5, points: 60, reward: 6900 }, { nick: "lenivyi", place: 7, points: 0, reward: 225 }] },
    { time: "21:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 34300 }, { nick: "comotd", place: 8, points: 0, reward: 2800 }, { nick: "Lorenco", place: 0, points: 0, reward: 2200 }, { nick: "Аршак Мкртчян", place: 0, points: 0, reward: 400 }, { nick: "Рыбнадзор", place: 0, points: 0, reward: 0 }] },
  ],
  "16.12.2025": [
    { time: "12:00", players: [{ nick: "Waaar", place: 3, points: 90, reward: 8000 }, { nick: "king00001", place: 4, points: 0, reward: 0 }, { nick: "Salamandr", place: 6, points: 0, reward: 0 }, { nick: "FrankL", place: 7, points: 0, reward: 0 }, { nick: "Pacific", place: 9, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Mike Tyson", place: 3, points: 90, reward: 4543 }, { nick: "Бабник", place: 15, points: 0, reward: 0 }, { nick: "Waaarr", place: 7, points: 0, reward: 0 }, { nick: "Em13!!", place: 8, points: 0, reward: 0 }, { nick: "comotd", place: 16, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "doss93", place: 2, points: 110, reward: 18300 }, { nick: "Amaliya", place: 4, points: 70, reward: 9100 }, { nick: "Чебурашка", place: 5, points: 60, reward: 7400 }, { nick: "Coo1er91", place: 7, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 11, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Em13!!", place: 2, points: 110, reward: 87364 }, { nick: "Waaarr", place: 16, points: 0, reward: 8093 }, { nick: "qoqoEpta", place: 0, points: 0, reward: 0 }, { nick: "bymep7", place: 0, points: 0, reward: 0 }, { nick: "Переездыч", place: 0, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "comotd", place: 4, points: 70, reward: 30981 }, { nick: "shockin", place: 0, points: 0, reward: 0 }, { nick: "FrankL", place: 41, points: 0, reward: 0 }, { nick: "Waaarr", place: 0, points: 0, reward: 0 }, { nick: "Бэха", place: 26, points: 0, reward: 0 }] },
  ],
  "15.12.2025": [
    { time: "12:00", players: [{ nick: "Палач", place: 1, points: 135, reward: 20000 }, { nick: "Salamandr", place: 2, points: 110, reward: 12000 }, { nick: "Tanechka", place: 5, points: 0, reward: 0 }, { nick: "Rom4ik", place: 6, points: 0, reward: 0 }, { nick: "Coo1er91", place: 7, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "Em13!!", place: 5, points: 60, reward: 10227 }, { nick: "kriaks", place: 0, points: 0, reward: 0 }, { nick: "outsider", place: 38, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Зараза", place: 0, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 33097 }, { nick: "IRIHKA", place: 2, points: 110, reward: 22672 }, { nick: "eroha", place: 5, points: 60, reward: 7350 }, { nick: "Waaar", place: 6, points: 50, reward: 8010 }, { nick: "@Felix", place: 23, points: 0, reward: 2264 }] },
    { time: "23:00", players: [{ nick: "Фокс", place: 1, points: 135, reward: 40500 }, { nick: "Em13!!", place: 4, points: 70, reward: 2826 }, { nick: "FrankL", place: 7, points: 0, reward: 1391 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "Бэха", place: 25, points: 0, reward: 0 }] },
  ],
  "14.12.2025": [
    { time: "12:00", players: [{ nick: "Player", place: 1, points: 135, reward: 20000 }, { nick: "Waaar", place: 3, points: 90, reward: 8000 }, { nick: "Em13!!", place: 4, points: 0, reward: 0 }, { nick: "Amaliya", place: 6, points: 0, reward: 0 }, { nick: "Евгений", place: 12, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 25530 }, { nick: "Зараза", place: 3, points: 90, reward: 6583 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "FrankL", place: 19, points: 0, reward: 0 }, { nick: "XP3795124", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Amaliya", place: 1, points: 135, reward: 29900 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 20200 }, { nick: "Waaar", place: 3, points: 90, reward: 12100 }, { nick: "PONOCHKA", place: 4, points: 70, reward: 9640 }, { nick: "Em13!!", place: 7, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 82500 }, { nick: "mamalena", place: 4, points: 70, reward: 40000 }, { nick: "Лудоман", place: 7, points: 0, reward: 24500 }, { nick: "ПокерМанки", place: 11, points: 0, reward: 10500 }, { nick: "Waaar", place: 17, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 17291 }, { nick: "Amaliya", place: 3, points: 90, reward: 9800 }, { nick: "Em13!!", place: 4, points: 70, reward: 8900 }, { nick: "@Felix", place: 5, points: 60, reward: 8525 }, { nick: "WiNifly", place: 9, points: 0, reward: 0 }] },
  ],
  "13.12.2025": [
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 12900 }, { nick: "Zewzzz", place: 3, points: 90, reward: 8600 }] },
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 25900 }, { nick: "mamalena", place: 2, points: 110, reward: 17500 }, { nick: "PONOCHKA", place: 5, points: 60, reward: 7700 }] },
    { time: "20:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 40227 }, { nick: "kriak", place: 3, points: 90, reward: 11964 }, { nick: "petroochoo", place: 4, points: 70, reward: 9013 }, { nick: "ПокерМанки", place: 6, points: 50, reward: 5663 }, { nick: "лисс", place: 7, points: 0, reward: 3544 }] },
    { time: "23:00", players: [{ nick: "Бабник", place: 6, points: 50, reward: 4284 }] },
  ],
  "12.12.2025": [
    { time: "12:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 12000 }, { nick: "king00001", place: 3, points: 90, reward: 8000 }] },
    { time: "17:00", players: [{ nick: "Kosik", place: 1, points: 135, reward: 25900 }, { nick: "doss93", place: 4, points: 70, reward: 8400 }] },
    { time: "18:00", players: [{ nick: "WhiskeyClub", place: 6, points: 50, reward: 16906 }, { nick: "SPARTAK", place: 11, points: 0, reward: 5100 }, { nick: "Фокс", place: 86, points: 0, reward: 2500 }] },
    { time: "20:00", players: [{ nick: "Felix", place: 1, points: 135, reward: 45571 }, { nick: "petroochoo", place: 2, points: 110, reward: 16976 }, { nick: "RS888", place: 3, points: 90, reward: 14291 }, { nick: "kriak", place: 6, points: 50, reward: 6756 }, { nick: "ПокерМанки", place: 8, points: 0, reward: 5291 }] },
    { time: "23:00", players: [{ nick: "Waaar", place: 3, points: 90, reward: 10580 }] },
  ],
  "11.12.2025": [
    { time: "12:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 20000 }, { nick: "Coo1er91", place: 2, points: 110, reward: 12000 }, { nick: "vnukshtukatura", place: 3, points: 90, reward: 8000 }] },
    { time: "17:00", players: [{ nick: "AliPetuhov", place: 1, points: 135, reward: 26400 }, { nick: "Waaar", place: 3, points: 90, reward: 10680 }, { nick: "ParabeLLum", place: 4, points: 70, reward: 8500 }] },
    { time: "18:00", players: [{ nick: "vnukshtukatura", place: 1, points: 135, reward: 63904 }] },
    { time: "20:00", players: [{ nick: "WiNifly", place: 1, points: 135, reward: 34060 }, { nick: "Coo1er91", place: 4, points: 70, reward: 8373 }, { nick: "Felix", place: 7, points: 0, reward: 900 }, { nick: "ПокерМанки", place: 9, points: 0, reward: 1800 }, { nick: "Бабник", place: 11, points: 0, reward: 1800 }] },
    { time: "23:00", players: [{ nick: "ФОКС", place: 1, points: 135, reward: 48409 }, { nick: "Waaar", place: 4, points: 70, reward: 2502 }, { nick: "Em13!!", place: 10, points: 0, reward: 508 }] },
    { time: "MTT", name: "WOW MYSTERY", players: [{ nick: "Waaar", place: 3, points: 90, reward: 6095 }] },
  ],
  "09.12.2025": [
    { time: "", players: [{ nick: "Waaar", place: 1, points: 200, reward: 0 }, { nick: "King", place: 2, points: 110, reward: 0 }, { nick: "WiNifly", place: 3, points: 90, reward: 0 }, { nick: "ViktoryNox", place: 4, points: 70, reward: 0 }, { nick: "Twisted", place: 5, points: 50, reward: 0 }] },
  ],
  "10.12.2025": [
    { time: "12:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 20000 }, { nick: "FrankL", place: 2, points: 110, reward: 12000 }] },
    { time: "17:00", players: [{ nick: "FishKopcheny", place: 1, points: 135, reward: 26500 }, { nick: "Пряник", place: 2, points: 110, reward: 16700 }, { nick: "Kosik", place: 4, points: 70, reward: 8300 }] },
    { time: "18:00", players: [{ nick: "Аспирин", place: 2, points: 110, reward: 38234 }, { nick: "ПокерМанки", place: 7, points: 0, reward: 1800 }, { nick: "Waaar", place: 14, points: 0, reward: 2756 }, { nick: "Baldendi", place: 18, points: 0, reward: 900 }, { nick: "KOL1103", place: 20, points: 0, reward: 450 }] },
    { time: "20:00", players: [{ nick: "petroochoo", place: 6, points: 50, reward: 5775 }, { nick: "Пряник", place: 7, points: 0, reward: 225 }, { nick: "Бабник", place: 9, points: 0, reward: 2250 }, { nick: "Felix", place: 11, points: 0, reward: 1520 }, { nick: "Coo1er91", place: 12, points: 0, reward: 0 }] },
  ],
  "08.12.2025": [
    { time: "12:00", players: [{ nick: "BOTEZGAMBIT", place: 1, points: 135, reward: 20000 }, { nick: "Бабник", place: 3, points: 90, reward: 8000 }] },
    { time: "17:00", players: [{ nick: "DIVGO", place: 2, points: 110, reward: 22000 }, { nick: "Twisted-fate_08", place: 4, points: 70, reward: 11000 }, { nick: "ПокерМанки", place: 5, points: 60, reward: 9000 }, { nick: "doss93", place: 6, points: 50, reward: 8000 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 43222 }, { nick: "Лудоман", place: 2, points: 110, reward: 13753 }, { nick: "Пряник", place: 3, points: 90, reward: 9038 }, { nick: "Kosik", place: 6, points: 50, reward: 4225 }, { nick: "Baldendi", place: 7, points: 0, reward: 4638 }] },
  ],
  "07.12.2025": [
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 12000 }, { nick: "FishKopcheny", place: 3, points: 90, reward: 8000 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 25900 }, { nick: "AliPetuhov", place: 2, points: 110, reward: 17500 }, { nick: "Coo1er91", place: 4, points: 70, reward: 8400 }] },
    { time: "18:00", players: [{ nick: "pinch904", place: 1, points: 135, reward: 142500 }, { nick: "WiNifly", place: 4, points: 70, reward: 40000 }, { nick: "Em13!!", place: 5, points: 60, reward: 34500 }, { nick: "MilkyWay77", place: 7, points: 0, reward: 24500 }, { nick: "Waaar", place: 8, points: 0, reward: 19000 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 2, points: 110, reward: 19245 }, { nick: "Em13!!", place: 4, points: 70, reward: 9159 }, { nick: "Пряник", place: 6, points: 50, reward: 1519 }, { nick: "Baldendi", place: 7, points: 0, reward: 1125 }] },
    { time: "21:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 28247 }, { nick: "АршакМкртчян", place: 6, points: 50, reward: 11395 }] },
  ],
  "01.02.2026": [
    { time: "18:00", players: [{ nick: "ПокерМанки", place: 3, points: 90, reward: 34000 }, { nick: "Waaar", place: 7, points: 0, reward: 16800 }, { nick: "Rifa", place: 15, points: 0, reward: 0 }, { nick: "KOL1103", place: 25, points: 0, reward: 0 }, { nick: "m014yH", place: 22, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "DimassikFiskk", place: 1, points: 135, reward: 25900 }, { nick: "Prushnik", place: 2, points: 110, reward: 17500 }, { nick: "MTTwnik", place: 3, points: 90, reward: 10500 }, { nick: "WiNifly", place: 5, points: 60, reward: 7700 }, { nick: "aRbyZ", place: 6, points: 50, reward: 0 }] },
    { time: "12:00", players: [{ nick: "ПокерМанки", place: 3, points: 90, reward: 8800 }, { nick: "DIVGO", place: 4, points: 70, reward: 6920 }, { nick: "KOL1103", place: 6, points: 0, reward: 0 }, { nick: "m014yH", place: 7, points: 0, reward: 0 }, { nick: "Nuts", place: 8, points: 0, reward: 0 }] },
  ],
  "02.02.2026": [
    { time: "18:00", players: [{ nick: "prozharka", place: 4, points: 70, reward: 18500 }, { nick: "FishKopcheny", place: 5, points: 60, reward: 17000 }, { nick: "Waaar", place: 8, points: 0, reward: 0 }, { nick: "RS888", place: 10, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 11, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "FishKopcheny", place: 1, points: 135, reward: 27200 }, { nick: "Waaar", place: 3, points: 90, reward: 11040 }, { nick: "ПокерМанки", place: 4, points: 70, reward: 8800 }, { nick: "MTTwnik", place: 6, points: 50, reward: 0 }, { nick: "Prokopenya", place: 10, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "king00001", place: 2, points: 110, reward: 9000 }, { nick: "Waaar", place: 3, points: 90, reward: 6000 }, { nick: "Salamandr", place: 5, points: 0, reward: 0 }, { nick: "Rom4ik", place: 6, points: 0, reward: 0 }, { nick: "MiracleDivice", place: 7, points: 0, reward: 0 }] },
  ],
  "03.02.2026": [
    { time: "17:00", players: [{ nick: "Coo1er91", place: 1, points: 135, reward: 10000 }, { nick: "ПокерМанки", place: 2, points: 110, reward: 15000 }, { nick: "Prushnik", place: 3, points: 90, reward: 10500 }, { nick: "WiNifly", place: 5, points: 60, reward: 7700 }, { nick: "MTTwnik", place: 6, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 7, points: 0, reward: 0 }, { nick: "mr.Fox", place: 8, points: 0, reward: 0 }, { nick: "Waaar", place: 9, points: 0, reward: 0 }, { nick: "Рамиль01", place: 10, points: 0, reward: 0 }] },
    { time: "12:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 6000 }, { nick: "ПокерМанки", place: 1, points: 135, reward: 10900 }] },
  ],
  "04.02.2026": [
    { time: "15:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 15000 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 9000 }, { nick: "Smile", place: 4, points: 70, reward: 7200 }, { nick: "WiNifly", place: 5, points: 60, reward: 6600 }, { nick: "BOTEZGAMBIT", place: 7, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Sarmat1305", place: 1, points: 90, reward: 10500 }, { nick: "MilkyWay77", place: 2, points: 70, reward: 8400 }, { nick: "MTTwnik", place: 3, points: 60, reward: 7700 }, { nick: "WiNifly", place: 4, points: 0, reward: 0 }, { nick: "RS888", place: 5, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "Артем Мулеров", place: 3, points: 90, reward: 17067 }, { nick: "Em13!!", place: 4, points: 70, reward: 14052 }, { nick: "outsider", place: 6, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 7, points: 0, reward: 0 }, { nick: "AndreiBurmako", place: 9, points: 0, reward: 0 }] },
  ],
  "05.02.2026": [
    { time: "17:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 25900 }, { nick: "WiNifly", place: 2, points: 110, reward: 17500 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 22500 }, { nick: "Coo1er91", place: 4, points: 70, reward: 18000 }, { nick: "king00001", place: 5, points: 60, reward: 7700 }, { nick: "MTTwnik", place: 6, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 7, points: 0, reward: 0 }, { nick: "MORPEH", place: 8, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "comotd", place: 1, points: 135, reward: 38200 }, { nick: "Em13!!", place: 2, points: 110, reward: 24400 }, { nick: "Артем Мулеров", place: 8, points: 0, reward: 5670 }, { nick: "XP3838084", place: 9, points: 0, reward: 0 }, { nick: "Бабник", place: 11, points: 0, reward: 0 }] },
  ],
  "17.02.2026": [
    { time: "12:00", players: [{ nick: "MilkyWay77", place: 3, points: 90, reward: 8500 }, { nick: "Borsoi", place: 4, points: 70, reward: 6800 }, { nick: "Coo1er91", place: 7, points: 0, reward: 0 }, { nick: "Waaar", place: 8, points: 0, reward: 0 }, { nick: "king00001", place: 9, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "BOTEZGAMBIT", place: 1, points: 135, reward: 27800 }, { nick: "WiNifly", place: 4, points: 70, reward: 8700 }, { nick: "Prushnik", place: 6, points: 50, reward: 6300 }, { nick: "Waaar", place: 7, points: 0, reward: 0 }, { nick: "Borsoi", place: 8, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 33200 }, { nick: "Waaar", place: 2, points: 110, reward: 14400 }, { nick: "WiNifly", place: 3, points: 90, reward: 5700 }, { nick: "Amaliya", place: 4, points: 70, reward: 4300 }, { nick: "Rifa", place: 6, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "pryanik2la", place: 5, points: 60, reward: 10519 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "comotd", place: 45, points: 0, reward: 0 }, { nick: "cap888881", place: 61, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }] },
  ],
  "18.02.2026": [
    { time: "00:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 59536 }, { nick: "shockin", place: 13, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 24, points: 0, reward: 0 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }] },
  ],
  "19.02.2026": [
    { time: "17:00", players: [{ nick: "ПокерМанки", place: 2, points: 110, reward: 15000 }, { nick: "king00001", place: 5, points: 60, reward: 6600 }, { nick: "WiNifly", place: 9, points: 0, reward: 0 }, { nick: "Rifa", place: 12, points: 0, reward: 0 }, { nick: "Waaar", place: 14, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 38000 }, { nick: "shnshn", place: 2, points: 110, reward: 35300 }, { nick: "Бабник", place: 4, points: 70, reward: 16700 }, { nick: "Vaduxa_tiran", place: 5, points: 60, reward: 6600 }, { nick: "Rifa", place: 6, points: 50, reward: 5700 }] },
  ],
  "20.02.2026": [
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 10800 }, { nick: "|---777---|", place: 3, points: 90, reward: 7200 }, { nick: "king00001", place: 5, points: 0, reward: 0 }, { nick: "FrankL", place: 7, points: 0, reward: 0 }, { nick: "Rifa", place: 8, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 15000 }, { nick: "ПокерМанки", place: 3, points: 90, reward: 9000 }, { nick: "Smile", place: 4, points: 70, reward: 7200 }, { nick: "WiNifly", place: 5, points: 60, reward: 6600 }, { nick: "BOTEZGAMBIT", place: 7, points: 0, reward: 0 }] },
  ],
  "21.02.2026": [
    { time: "15:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 33543 }, { nick: "pryanik2la", place: 5, points: 60, reward: 3935 }, { nick: "Em13!!", place: 8, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "|---777---|", place: 3, points: 90, reward: 12000 }, { nick: "Waaar", place: 4, points: 0, reward: 0 }, { nick: "Rifa", place: 5, points: 0, reward: 0 }, { nick: "Borsoi", place: 9, points: 0, reward: 0 }, { nick: "petroochoo", place: 13, points: 0, reward: 0 }] },
  ],
  "22.02.2026": [
    { time: "00:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 52147 }, { nick: "baldand", place: 2, points: 110, reward: 0 }, { nick: "NINT3NDO", place: 3, points: 90, reward: 0 }] },
    { time: "12:00", players: [{ nick: "FrankL", place: 1, points: 135, reward: 17400 }, { nick: "Mr.V", place: 6, points: 50, reward: 0 }, { nick: "Waaar", place: 7, points: 0, reward: 0 }, { nick: "king00001", place: 11, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 12, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Konsy", place: 4, points: 70, reward: 7200 }, { nick: "Rifa", place: 6, points: 50, reward: 0 }, { nick: "king00001", place: 7, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 8, points: 0, reward: 0 }, { nick: "FrankL", place: 11, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "FrankL", place: 3, points: 90, reward: 243825 }, { nick: "pryanik2la", place: 0, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }, { nick: "Asta la Vista", place: 0, points: 0, reward: 0 }, { nick: "Simba33", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "ПокерМанки", place: 4, points: 70, reward: 16900 }, { nick: "Rifa", place: 6, points: 50, reward: 18600 }, { nick: "Waaar", place: 7, points: 0, reward: 8200 }, { nick: "bugsergo", place: 12, points: 0, reward: 3100 }, { nick: "|---777---|", place: 14, points: 0, reward: 3100 }] },
  ],
  "23.02.2026": [
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "Mr.V", place: 5, points: 60, reward: 4300 }, { nick: "Waaar", place: 7, points: 0, reward: 0 }, { nick: "king00001", place: 9, points: 0, reward: 0 }, { nick: "Rifa", place: 14, points: 0, reward: 0 }, { nick: "FrankL", place: 16, points: 0, reward: 0 }] },
    { time: "20:00", name: "HOK Magic MKO 7MAX MTT-NLH", players: [{ nick: "<Amaliya>", place: 1, points: 135, reward: 40300 }, { nick: "Аспирин", place: 2, points: 110, reward: 7200 }, { nick: "Waaar", place: 4, points: 70, reward: 3500 }, { nick: "Pentagrammall", place: 9, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 10, points: 0, reward: 0 }] },
    { time: "13:00", name: "DV Bounty 150k", players: [{ nick: "Рыбнадзор", place: 3, points: 90, reward: 19568 }, { nick: "Monfokon", place: 4, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 5, points: 0, reward: 0 }, { nick: "Бабник", place: 6, points: 0, reward: 0 }, { nick: "Em13!!", place: 7, points: 0, reward: 0 }] },
    { time: "23:00", name: "Night magic 100K", players: [{ nick: "Em13!!", place: 7, points: 0, reward: 3774 }, { nick: "Фокс", place: 22, points: 0, reward: 0 }, { nick: "Waaarr", place: 33, points: 0, reward: 0 }, { nick: "Бабник", place: 35, points: 0, reward: 0 }, { nick: "AndrushaMorf", place: 0, points: 0, reward: 0 }] },
    { time: "14:00", name: "Tournament Rebuy", players: [{ nick: "<Amaliya>", place: 1, points: 0, reward: 5710 }, { nick: "Анубис", place: 6, points: 0, reward: 1300 }, { nick: "mr.Fox", place: 9, points: 0, reward: 0 }, { nick: "Prushnik", place: 10, points: 0, reward: 0 }, { nick: "cadillac", place: 11, points: 0, reward: 0 }] },
    { time: "15:00", name: "6+ HOLD'EM 500", players: [{ nick: "kabanchik", place: 1, points: 0, reward: 18505 }, { nick: "Sarmat1305", place: 13, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Понедельника", players: [{ nick: "kriak", place: 1, points: 0, reward: 30390 }, { nick: "WiNifly", place: 3, points: 0, reward: 10000 }, { nick: "ПаПа_Мо}|{еТ", place: 4, points: 0, reward: 5250 }, { nick: "ПокерМанки", place: 5, points: 0, reward: 6490 }, { nick: "Prushnik", place: 6, points: 0, reward: 3800 }] },
    { time: "19:00", name: "MTT-PLO5 300", players: [{ nick: "Sarmat1305", place: 1, points: 0, reward: 12322 }, { nick: "undertaker", place: 0, points: 0, reward: 0 }, { nick: "allex 1983", place: 0, points: 0, reward: 0 }, { nick: "XP3864042", place: 29, points: 0, reward: 0 }] },
    { time: "22:00", name: "Magic 500 * 150K", players: [{ nick: "Игрок", place: 3, points: 0, reward: 7659 }, { nick: "Фокс", place: 17, points: 0, reward: 0 }, { nick: "TIT163RUS", place: 25, points: 0, reward: 0 }, { nick: "МЕТ|$", place: 34, points: 0, reward: 0 }, { nick: "kabanchik", place: 0, points: 0, reward: 0 }] },
  ],
  "25.02.2026": [
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "Waaar", place: 1, points: 135, reward: 20900 }, { nick: "king00001", place: 9, points: 0, reward: 0 }, { nick: "Borsoi", place: 16, points: 0, reward: 0 }, { nick: "БЕЛЫЙ", place: 17, points: 0, reward: 0 }] },
    { time: "13:00", name: "DV Bounty 150k", players: [{ nick: "АршакМкртчян", place: 2, points: 110, reward: 28974 }, { nick: "kriaks", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "nikola233", place: 0, points: 0, reward: 0 }] },
    { time: "15:00", name: "New - Hot PKO 2/3", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 29278 }, { nick: "nikola233", place: 6, points: 50, reward: 2102 }, { nick: "Рыбнадзор", place: 9, points: 0, reward: 1724 }, { nick: "shockin", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", name: "Rebuy MTT 7MAX MTT-NLH", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 29500 }, { nick: "Waaar", place: 2, points: 110, reward: 18600 }, { nick: "king00001", place: 7, points: 0, reward: 0 }, { nick: "ЧУРменя", place: 11, points: 0, reward: 0 }, { nick: "FishKopcheny", place: 0, points: 0, reward: 0 }] },
    { time: "21:00", name: "NLH KNOCKOUT 250k", players: [{ nick: "Рыбнадзор", place: 4, points: 70, reward: 10182 }, { nick: "АршакМкртчян", place: 0, points: 0, reward: 1250 }, { nick: "Em13!!", place: 14, points: 0, reward: 283 }, { nick: "machete", place: 0, points: 0, reward: 0 }, { nick: "n1kk1ex", place: 0, points: 0, reward: 0 }] },
    { time: "10:00", name: "DV Turbo 500 90K", players: [{ nick: "Рыбнадзор", place: 7, points: 0, reward: 5254 }, { nick: "Фокс", place: 23, points: 0, reward: 0 }, { nick: "Em13!!", place: 96, points: 0, reward: 0 }, { nick: "pryanik2la", place: 100, points: 0, reward: 0 }, { nick: "Malek3084", place: 53, points: 0, reward: 0 }] },
    { time: "16:00", name: "Magic Chest", players: [{ nick: "Prushnik", place: 1, points: 0, reward: 1780 }, { nick: "Player2EBBB6", place: 4, points: 0, reward: 195 }, { nick: "Boba7575", place: 5, points: 0, reward: 159 }, { nick: "cadillac", place: 6, points: 0, reward: 142 }, { nick: "Azza43ru", place: 10, points: 0, reward: 0 }] },
    { time: "18:00", name: "Freeroll 1 MLN", players: [{ nick: "АршакМкртчян", place: 12, points: 0, reward: 11438 }, { nick: "Superden", place: 113, points: 0, reward: 0 }, { nick: "Xpoper", place: 237, points: 0, reward: 0 }, { nick: "НиLLIтяк", place: 280, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Среды", players: [{ nick: "AliPetuhov", place: 2, points: 0, reward: 10330 }, { nick: "TonniHalf", place: 3, points: 0, reward: 5880 }, { nick: "Rom4ik", place: 5, points: 0, reward: 3940 }, { nick: "Че643", place: 6, points: 0, reward: 3300 }, { nick: "ЧУРменя", place: 7, points: 0, reward: 2520 }] },
    { time: "21:00", name: "MOK MKO 7MAX MTT-NLH", players: [{ nick: "Psyho44", place: 1, points: 0, reward: 7430 }, { nick: "ПаПа_Мо}|{еТ", place: 8, points: 0, reward: 0 }, { nick: "XORTYRETSKOGO", place: 9, points: 0, reward: 0 }, { nick: "DemonDen", place: 10, points: 0, reward: 0 }, { nick: "WiNifly", place: 11, points: 0, reward: 0 }] },
    { time: "22:00", name: "Energetik Tournament", players: [{ nick: "cadillac", place: 3, points: 0, reward: 2660 }, { nick: "Baal", place: 5, points: 0, reward: 0 }, { nick: "tatarin_1", place: 6, points: 0, reward: 0 }, { nick: "Ksuha", place: 7, points: 0, reward: 0 }, { nick: "Tanechka", place: 8, points: 0, reward: 0 }] },
    { time: "22:00", name: "Magic 500 * 150K", players: [{ nick: "pryanik2la", place: 3, points: 0, reward: 8408 }, { nick: "K-700", place: 39, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 0, points: 0, reward: 0 }, { nick: "Olegggaaa", place: 0, points: 0, reward: 0 }, { nick: "Malek3084", place: 52, points: 0, reward: 0 }] },
  ],
  "26.02.2026": [
    { time: "11:00", name: "Magic Bounty 60K", players: [{ nick: "frukt58", place: 1, points: 0, reward: 20080 }, { nick: "tromarrio", place: 2, points: 0, reward: 0 }, { nick: "Syndicate", place: 3, points: 0, reward: 0 }, { nick: "Фокс", place: 4, points: 0, reward: 0 }, { nick: "Miracle Divice", place: 5, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Месяца", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 267750 }, { nick: "Waaar", place: 2, points: 0, reward: 0 }, { nick: "FishKopcheny", place: 3, points: 0, reward: 0 }, { nick: "Mr.V", place: 4, points: 0, reward: 0 }, { nick: "Rifa", place: 5, points: 0, reward: 0 }] },
    { time: "17:00", name: "Rebuy", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 22200 }, { nick: "FishKopcheny", place: 2, points: 110, reward: 15000 }, { nick: "BOTEZGAMBIT", place: 3, points: 90, reward: 9000 }, { nick: "WiNifly", place: 4, points: 70, reward: 7200 }, { nick: "king00001", place: 5, points: 60, reward: 6600 }] },
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "Waaar", place: 1, points: 135, reward: 19100 }, { nick: "MilkyWay77", place: 2, points: 110, reward: 11460 }, { nick: "king00001", place: 4, points: 0, reward: 0 }, { nick: "Vaduxa_tiran", place: 13, points: 0, reward: 0 }, { nick: "Rifa", place: 14, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Четверга", players: [{ nick: "<Amaliya>", place: 1, points: 135, reward: 70400 }, { nick: "Аспирин", place: 2, points: 110, reward: 30300 }, { nick: "Player1BD20C", place: 3, points: 90, reward: 8600 }, { nick: "ЧУРменя", place: 4, points: 70, reward: 2520 }, { nick: "GetHigh", place: 5, points: 60, reward: 2200 }] },
    { time: "15:00", name: "New - Hot PKO 2/3", players: [{ nick: "Рыбнадзор", place: 7, points: 0, reward: 2886 }] },
    { time: "21:00", name: "NLH KNOCKOUT 250k", players: [{ nick: "PapaRabotayet", place: 6, points: 50, reward: 8620 }, { nick: "Рыбнадзор", place: 7, points: 0, reward: 2294 }] },
    { time: "21:00", name: "MOK 7MAX", players: [{ nick: "Psyho44", place: 1, points: 0, reward: 217000 }, { nick: "JinDaniels", place: 2, points: 0, reward: 0 }, { nick: "WiNifly", place: 3, points: 0, reward: 0 }, { nick: "TonniHalf", place: 4, points: 0, reward: 0 }, { nick: "cadillac", place: 5, points: 0, reward: 0 }] },
    { time: "23:00", name: "Night magic 100K", players: [{ nick: "Фокс", place: 2, points: 110, reward: 24526 }, { nick: "Рыбнадзор", place: 6, points: 50, reward: 3069 }] },
  ],
  "26.02.2026": [
    { time: "18:00", name: "Турнир Месяца", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 267750 }, { nick: "Waaar", place: 2, points: 0, reward: 0 }, { nick: "FishKopcheny", place: 3, points: 0, reward: 0 }, { nick: "Mr.V", place: 4, points: 0, reward: 0 }, { nick: "Rifa", place: 5, points: 0, reward: 0 }] },
    { time: "17:00", name: "Rebuy", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 22200 }, { nick: "FishKopcheny", place: 2, points: 110, reward: 15000 }, { nick: "BOTEZGAMBIT", place: 3, points: 90, reward: 9000 }, { nick: "WiNifly", place: 4, points: 70, reward: 7200 }, { nick: "king00001", place: 5, points: 60, reward: 6600 }] },
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "Waaar", place: 1, points: 135, reward: 19100 }, { nick: "MilkyWay77", place: 2, points: 110, reward: 11460 }, { nick: "king00001", place: 4, points: 0, reward: 0 }, { nick: "Vaduxa_tiran", place: 13, points: 0, reward: 0 }, { nick: "Rifa", place: 14, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Четверга", players: [{ nick: "<Amaliya>", place: 1, points: 135, reward: 70400 }, { nick: "Аспирин", place: 2, points: 110, reward: 30300 }, { nick: "Player1BD20C", place: 3, points: 90, reward: 8600 }, { nick: "ЧУРменя", place: 4, points: 70, reward: 2520 }, { nick: "GetHigh", place: 5, points: 60, reward: 2200 }] },
    { time: "15:00", name: "New - Hot PKO 2/3", players: [{ nick: "Рыбнадзор", place: 7, points: 0, reward: 2886 }] },
    { time: "21:00", name: "NLH KNOCKOUT 250k", players: [{ nick: "PapaRabotayet", place: 6, points: 50, reward: 8620 }, { nick: "Рыбнадзор", place: 7, points: 0, reward: 2294 }] },
    { time: "23:00", name: "Night magic 100K", players: [{ nick: "Фокс", place: 2, points: 110, reward: 24526 }, { nick: "Рыбнадзор", place: 6, points: 50, reward: 3069 }] },
  ],
  "27.02.2026": [
    { time: "10:00", name: "DV Turbo 500 90K", players: [{ nick: "Фокс", place: 3, points: 0, reward: 21175 }, { nick: "XP3952131", place: 47, points: 0, reward: 0 }, { nick: "Откотика_Я", place: 81, points: 0, reward: 0 }, { nick: "Рыбнадзор", place: 82, points: 0, reward: 0 }, { nick: "NINT3NDO", place: 41, points: 0, reward: 0 }] },
    { time: "16:00", name: "PLO4 25K", players: [{ nick: "PROFESSOR", place: 2, points: 0, reward: 7344 }, { nick: "SamyJeembo", place: 0, points: 0, reward: 0 }, { nick: "Player", place: 0, points: 0, reward: 0 }, { nick: "Sarmat1305", place: 0, points: 0, reward: 0 }, { nick: "XP3935192", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", name: "Норм", players: [{ nick: "Ksuha", place: 2, points: 0, reward: 16201 }, { nick: "FishKopcheny", place: 3, points: 0, reward: 8763 }, { nick: "Poker2912", place: 4, points: 0, reward: 6023 }, { nick: "Рамаха", place: 6, points: 0, reward: 4389 }, { nick: "YOUAREMYDONKEY", place: 7, points: 0, reward: 4838 }] },
    { time: "21:00", name: "Норм", players: [{ nick: "mr.Fox", place: 5, points: 0, reward: 1330 }, { nick: "Аспирин", place: 6, points: 0, reward: 0 }, { nick: "tatarin_1", place: 8, points: 0, reward: 0 }, { nick: "XORTYRETSKOGO", place: 13, points: 0, reward: 0 }, { nick: "kriak", place: 14, points: 0, reward: 0 }] },
  ],
  "28.02.2026": [
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "|---777---|", place: 2, points: 0, reward: 11680 }, { nick: "Waaar", place: 14, points: 0, reward: 0 }, { nick: "Рамаха", place: 15, points: 0, reward: 0 }] },
    { time: "13:00", name: "DV Bounty 150k", players: [{ nick: "AndrushaMorf", place: 0, points: 0, reward: 5310 }, { nick: "Откотика_Я", place: 0, points: 0, reward: 4426 }, { nick: "Asta la Vista", place: 0, points: 0, reward: 1741 }, { nick: "Proxor", place: 0, points: 0, reward: 0 }, { nick: "Port1928", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", name: "AMBER RUSH", players: [{ nick: "Em13!!", place: 2, points: 0, reward: 120000 }] },
    { time: "17:00", name: "Rebuy MTT", players: [{ nick: "Player1BD20C", place: 1, points: 0, reward: 30000 }, { nick: "Mr.V", place: 3, points: 0, reward: 12000 }, { nick: "VOSOvec", place: 8, points: 0, reward: 0 }, { nick: "king00001", place: 9, points: 0, reward: 0 }, { nick: "|---777---|", place: 11, points: 0, reward: 0 }] },
    { time: "18:00", name: "LUCKY 777 GTD", players: [{ nick: "Фокс", place: 10, points: 0, reward: 12143 }, { nick: "PapaRabotaet", place: 44, points: 0, reward: 4655 }, { nick: "Waaarr", place: 71, points: 0, reward: 0 }, { nick: "brabus011", place: 88, points: 0, reward: 0 }, { nick: "Lorenco", place: 94, points: 0, reward: 0 }] },
    { time: "18:00", name: "Субботний Прогрессив", players: [{ nick: "Waaar", place: 1, points: 0, reward: 105559 }, { nick: "ПокерМанки", place: 11, points: 0, reward: 0 }, { nick: "|---777---|", place: 16, points: 0, reward: 0 }] },
    { time: "18:00", name: "Субботний Фриролл", players: [{ nick: "Резвый", place: 4, points: 0, reward: 7000 }, { nick: "Borsoi", place: 5, points: 0, reward: 6000 }, { nick: "konfesta", place: 7, points: 0, reward: 3200 }, { nick: "WildBoar", place: 8, points: 0, reward: 2200 }, { nick: "MiracleDivice", place: 10, points: 0, reward: 1250 }] },
    { time: "20:00", name: "HOK", players: [{ nick: "<Amaliya>", place: 2, points: 0, reward: 7100 }, { nick: "WiNifly", place: 4, points: 0, reward: 5312 }, { nick: "shockin", place: 8, points: 0, reward: 225 }, { nick: "Surgut", place: 9, points: 0, reward: 1406 }, { nick: "Malek3084", place: 12, points: 0, reward: 225 }] },
    { time: "21:00", name: "MOK", players: [{ nick: "Psyho44", place: 3, points: 0, reward: 1340 }, { nick: "m014yH", place: 5, points: 0, reward: 980 }, { nick: "Malek3084", place: 6, points: 0, reward: 0 }, { nick: "WiNifly", place: 12, points: 0, reward: 0 }, { nick: "Ronn", place: 13, points: 0, reward: 0 }] },
  ],
  "24.02.2026": [
    { time: "12:00", name: "DV Rebuy", players: [{ nick: "Mr.V", place: 2, points: 110, reward: 12700 }, { nick: "Waaar", place: 4, points: 70, reward: 6000 }, { nick: "MilkyWay77", place: 12, points: 0, reward: 0 }, { nick: "king00001", place: 13, points: 0, reward: 0 }, { nick: "|---777---|", place: 17, points: 0, reward: 0 }] },
    { time: "15:00", name: "New - Hot PKO 2/3", players: [{ nick: "Бабник", place: 3, points: 90, reward: 12983 }, { nick: "Em13!!", place: 22, points: 0, reward: 0 }, { nick: "пупсик", place: 0, points: 0, reward: 0 }, { nick: "ArsenalFan", place: 0, points: 0, reward: 0 }, { nick: "nikola233", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", name: "Rebuy MTT 7MAX MTT-NLH", players: [{ nick: "WiNifly", place: 2, points: 110, reward: 15000 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "king00001", place: 11, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 13, points: 0, reward: 0 }, { nick: "Rifa", place: 17, points: 0, reward: 0 }] },
    { time: "10:00", name: "DV Turbo 500 90K", players: [{ nick: "Malek3084", place: 5, points: 0, reward: 7612 }, { nick: "Miracle Divice", place: 13, points: 0, reward: 0 }, { nick: "Sarmat1305", place: 29, points: 0, reward: 0 }, { nick: "Em13!!", place: 66, points: 0, reward: 0 }, { nick: "Фокс", place: 89, points: 0, reward: 0 }] },
    { time: "18:00", name: "Турнир Вторника", players: [{ nick: "<Amaliya>", place: 4, points: 0, reward: 8700 }, { nick: "Аспирин", place: 6, points: 0, reward: 6400 }, { nick: "FishKopcheny", place: 7, points: 0, reward: 5400 }, { nick: "WiNifly", place: 15, points: 0, reward: 2200 }, { nick: "petroochoo", place: 17, points: 0, reward: 0 }] },
  ],
  "15.02.2026": [
    { time: "12:00", players: [{ nick: "ПокерМанки", place: 1, points: 135, reward: 15800 }, { nick: "Malek3084", place: 4, points: 70, reward: 5000 }, { nick: "FrankL", place: 5, points: 60, reward: 4600 }, { nick: "Waaar", place: 7, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 9, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 3, points: 90, reward: 9119 }, { nick: "Sarmat1305", place: 4, points: 70, reward: 4993 }, { nick: "ИринаЗорина", place: 0, points: 0, reward: 0 }, { nick: "pryanik2la", place: 26, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 22200 }, { nick: "Borsoi", place: 2, points: 110, reward: 15000 }, { nick: "FishKopcheny", place: 4, points: 70, reward: 7200 }, { nick: "Prushnik", place: 7, points: 0, reward: 0 }, { nick: "$Pokerist$", place: 10, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Rifa", place: 1, points: 135, reward: 29300 }, { nick: "Malek3084", place: 3, points: 90, reward: 8200 }, { nick: "WiNifly", place: 4, points: 70, reward: 9300 }, { nick: "Waaar", place: 6, points: 50, reward: 2800 }, { nick: "МужНаЧас", place: 9, points: 0, reward: 0 }] },
  ],
  "16.02.2026": [
    { time: "12:00", players: [{ nick: "Borsoi", place: 2, points: 110, reward: 11580 }, { nick: "Rom4ik", place: 4, points: 70, reward: 5500 }, { nick: "Waaar", place: 5, points: 60, reward: 5000 }, { nick: "МужНаЧас", place: 14, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 17, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 1, points: 135, reward: 27082 }, { nick: "AndreiBurmako", place: 6, points: 50, reward: 5401 }, { nick: "Бабник", place: 0, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "MTTwnik", place: 1, points: 135, reward: 25100 }, { nick: "MilkyWay77", place: 2, points: 110, reward: 16980 }, { nick: "Рамиль01fan", place: 3, points: 90, reward: 10100 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "Rom4ik", place: 9, points: 0, reward: 0 }] },
  ],
  "13.02.2026": [
    { time: "15:00", players: [{ nick: "pryanik2la", place: 1, points: 135, reward: 18691 }, { nick: "Em13!!", place: 4, points: 70, reward: 5329 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "WiNifly", place: 1, points: 135, reward: 22200 }, { nick: "Player2EBBB6", place: 2, points: 110, reward: 15000 }, { nick: "Waaar", place: 5, points: 60, reward: 6600 }, { nick: "ПокерМанки", place: 6, points: 0, reward: 0 }, { nick: "Чеб43", place: 13, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "nachyn", place: 1, points: 135, reward: 62072 }, { nick: "Em13!!", place: 29, points: 0, reward: 0 }, { nick: "siropchik", place: 0, points: 0, reward: 0 }, { nick: "Waaarr", place: 26, points: 0, reward: 0 }] },
  ],
  "14.02.2026": [
    { time: "12:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 15000 }, { nick: "RS888", place: 6, points: 0, reward: 0 }, { nick: "ArtStyle43", place: 7, points: 0, reward: 0 }, { nick: "stafart", place: 9, points: 0, reward: 0 }, { nick: "izh18rus", place: 10, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Prushnik", place: 2, points: 110, reward: 18000 }, { nick: "Пряник", place: 3, points: 90, reward: 12000 }, { nick: "Waaar", place: 4, points: 0, reward: 0 }, { nick: "Чеб43", place: 5, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 11, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Rifa", place: 1, points: 135, reward: 25900 }, { nick: "Malek3084", place: 3, points: 90, reward: 12400 }, { nick: "Пряник", place: 7, points: 0, reward: 0 }, { nick: "Hakas", place: 8, points: 0, reward: 0 }, { nick: "Аспирин", place: 10, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Бабник", place: 5, points: 60, reward: 9770 }, { nick: "MEVRIK", place: 4, points: 70, reward: 5236 }, { nick: "Waaarr", place: 24, points: 0, reward: 0 }, { nick: "Natali", place: 0, points: 0, reward: 0 }, { nick: "@Felix", place: 10, points: 0, reward: 0 }] },
  ],
  "12.02.2026": [
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 8900 }, { nick: "МужНаЧас", place: 3, points: 90, reward: 5280 }, { nick: "YOUAREMYDONKEY", place: 6, points: 0, reward: 0 }, { nick: "FrankL", place: 7, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 8, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "Em13!!", place: 3, points: 90, reward: 9432 }] },
    { time: "17:00", players: [{ nick: "YOUAREMYDONKEY", place: 3, points: 90, reward: 10800 }, { nick: "WiNifly", place: 0, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 0, points: 0, reward: 0 }, { nick: "Em13!!", place: 0, points: 0, reward: 0 }, { nick: "igor83", place: 0, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Тритоныч", place: 5, points: 60, reward: 63464 }] },
    { time: "19:00", players: [{ nick: "WiNifly", place: 1, points: 135, reward: 63750 }, { nick: "Waaar", place: 2, points: 110, reward: 15000 }, { nick: "Coo1er91", place: 3, points: 90, reward: 26300 }, { nick: "Пряник", place: 4, points: 70, reward: 12700 }, { nick: "Зараза", place: 6, points: 50, reward: 6050 }] },
  ],
  "11.02.2026": [
    { time: "12:00", players: [{ nick: "FrankL", place: 3, points: 90, reward: 7000 }, { nick: "Waaar", place: 4, points: 0, reward: 0 }, { nick: "DmQa", place: 9, points: 0, reward: 0 }, { nick: "Ksuha", place: 10, points: 0, reward: 0 }, { nick: "Алеша ™", place: 14, points: 0, reward: 0 }] },
    { time: "13:00", players: [{ nick: "Тритоныч", place: 1, points: 135, reward: 9136 }, { nick: "FrankL", place: 2, points: 110, reward: 3048 }, { nick: "ArsenalFan", place: 19, points: 0, reward: 0 }, { nick: "пупсик", place: 4, points: 0, reward: 0 }, { nick: "Smile", place: 5, points: 0, reward: 0 }] },
    { time: "15:00", players: [{ nick: "ArsenalFan", place: 2, points: 110, reward: 10382 }, { nick: "FrankL", place: 3, points: 0, reward: 0 }, { nick: "Syndicate", place: 4, points: 0, reward: 0 }, { nick: "Pe4enkΔ", place: 5, points: 0, reward: 0 }, { nick: "Em13!!", place: 6, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "king00001", place: 5, points: 60, reward: 7700 }, { nick: "WiNifly", place: 6, points: 0, reward: 0 }, { nick: "FishKopcheny", place: 9, points: 0, reward: 0 }, { nick: "Adam1993", place: 10, points: 0, reward: 0 }, { nick: "ZVIGENI", place: 11, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "МужНаЧас", place: 1, points: 135, reward: 31300 }, { nick: "ПокерМанки", place: 4, points: 70, reward: 6200 }, { nick: "WiNifly", place: 5, points: 60, reward: 5700 }, { nick: "Waaar", place: 6, points: 0, reward: 0 }, { nick: "Пряник", place: 9, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Mougli", place: 2, points: 110, reward: 18180 }, { nick: "Proxor", place: 3, points: 90, reward: 661 }, { nick: "Рыбнадзор", place: 4, points: 0, reward: 0 }, { nick: "FrankL", place: 5, points: 0, reward: 0 }, { nick: "Em13!!", place: 6, points: 0, reward: 0 }] },
  ],
  "10.02.2026": [
    { time: "13:00", players: [{ nick: "Tokyo108", place: 2, points: 110, reward: 30642 }, { nick: "пупсик", place: 5, points: 60, reward: 8763 }, { nick: "ссаныекоты", place: 6, points: 50, reward: 1019 }, { nick: "Бабник", place: 7, points: 0, reward: 0 }, { nick: "AndreiBurmako", place: 8, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "Waaar", place: 1, points: 135, reward: 22200 }, { nick: "king00001", place: 3, points: 90, reward: 9000 }, { nick: "ZVIGENI", place: 5, points: 60, reward: 6600 }, { nick: "XORTYRETSKOGO", place: 6, points: 0, reward: 0 }, { nick: "FishKopcheny", place: 8, points: 0, reward: 0 }] },
    { time: "18:00", players: [{ nick: "Фокс", place: 1, points: 135, reward: 182268 }, { nick: "machete", place: 2, points: 110, reward: 8740 }, { nick: "Simba33", place: 3, points: 0, reward: 0 }, { nick: "АршакМкртчян", place: 4, points: 0, reward: 0 }, { nick: "siropchik", place: 5, points: 0, reward: 0 }] },
    { time: "20:00", players: [{ nick: "Coo1er91", place: 2, points: 110, reward: 8000 }, { nick: "Em13!!", place: 3, points: 90, reward: 13300 }, { nick: "Пряник", place: 5, points: 60, reward: 3500 }, { nick: "ZVIGENI", place: 7, points: 0, reward: 0 }, { nick: "FrankL", place: 9, points: 0, reward: 0 }] },
  ],
  "06.02.2026": [
    { time: "12:00", players: [{ nick: "Waaar", place: 2, points: 110, reward: 9000 }, { nick: "Borsoi", place: 3, points: 90, reward: 6000 }, { nick: "king00001", place: 4, points: 0, reward: 0 }, { nick: "Coo1er91", place: 11, points: 0, reward: 0 }, { nick: "Smorodina", place: 12, points: 0, reward: 0 }] },
    { time: "17:00", players: [{ nick: "MTTwnik", place: 2, points: 110, reward: 21000 }, { nick: "WiNifly", place: 4, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 5, points: 0, reward: 0 }, { nick: "Smile", place: 8, points: 0, reward: 0 }, { nick: "Waaar", place: 9, points: 0, reward: 0 }] },
    { time: "21:00", players: [{ nick: "Бабник", place: 1, points: 135, reward: 35612 }, { nick: "Артем Мулеров", place: 2, points: 0, reward: 0 }, { nick: "machete", place: 3, points: 0, reward: 0 }, { nick: "АндрейБогато", place: 4, points: 0, reward: 0 }, { nick: "Player", place: 5, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 3, points: 90, reward: 13473 }, { nick: "Бабник", place: 4, points: 0, reward: 0 }, { nick: "Mougli", place: 5, points: 0, reward: 0 }] },
  ],
  "07.02.2026": [
    { time: "13:00", players: [{ nick: "NINT3NDO", place: 1, points: 135, reward: 59600 }, { nick: "Asta002", place: 2, points: 110, reward: 1249 }, { nick: "Бабник", place: 3, points: 90, reward: 0 }, { nick: "comotd", place: 6, points: 50, reward: 0 }] },
    { time: "21:00", players: [{ nick: "mromarrrio", place: 1, points: 135, reward: 1250 }, { nick: "Откотика_Я", place: 2, points: 110, reward: 0 }, { nick: "DonTerrion", place: 3, points: 0, reward: 0 }, { nick: "pryanik2la", place: 4, points: 0, reward: 0 }, { nick: "comotd", place: 8, points: 0, reward: 0 }] },
    { time: "23:00", players: [{ nick: "Em13!!", place: 5, points: 60, reward: 1355 }, { nick: "Бабник", place: 6, points: 0, reward: 0 }] },
  ],
  "09.02.2026": [
    { time: "17:00", players: [{ nick: "Палач", place: 4, points: 70, reward: 8400 }, { nick: "FishKopcheny", place: 8, points: 0, reward: 0 }, { nick: "king00001", place: 9, points: 0, reward: 0 }, { nick: "MilkyWay77", place: 11, points: 0, reward: 0 }, { nick: "Tanechka", place: 12, points: 0, reward: 0 }] },
  ],
  "08.02.2026": [
    { time: "18:00", players: [{ nick: "WiNifly", place: 1, points: 60, reward: 20700 }, { nick: "vnukshtukatura", place: 2, points: 0, reward: 15500 }, { nick: "Аспирин", place: 0, points: 0, reward: 0 }, { nick: "ПокерМанки", place: 0, points: 0, reward: 0 }, { nick: "king00001", place: 0, points: 0, reward: 0 }] },
  ],
};

function isSpringRatingMode() {
  return document.body && document.body.getAttribute("data-view") === "spring-rating";
}
function getRatingByDate() {
  if (isSpringRatingMode() && typeof SPRING_RATING_TOURNAMENTS_BY_DATE !== "undefined" && SPRING_RATING_TOURNAMENTS_BY_DATE && Object.keys(SPRING_RATING_TOURNAMENTS_BY_DATE).length) {
    var byDate = {};
    var dates = Object.keys(SPRING_RATING_TOURNAMENTS_BY_DATE);
    for (var di = 0; di < dates.length; di++) {
      var dateStr = dates[di];
      var byNick = {};
      var list = SPRING_RATING_TOURNAMENTS_BY_DATE[dateStr];
      if (!Array.isArray(list)) continue;
      for (var ti = 0; ti < list.length; ti++) {
        var t = list[ti];
        var players = t.players || [];
        for (var pi = 0; pi < players.length; pi++) {
          var p = players[pi];
          var n = normalizeWinterNick(p && p.nick);
          if (!n) continue;
          var pts = winterRatingPointsForPlace(p.place, p.reward);
          var rew = p.reward != null ? Number(p.reward) : 0;
          if (rew !== rew) rew = 0;
          if (!byNick[n]) byNick[n] = { nick: n, points: 0, reward: 0 };
          byNick[n].points += pts;
          byNick[n].reward += rew;
        }
      }
      byDate[dateStr] = Object.keys(byNick).map(function (k) { return byNick[k]; }).filter(function (r) { return (r.points || 0) !== 0 || (r.reward || 0) !== 0; }).sort(function (a, b) { return (b.points - a.points) || (b.reward - a.reward); });
    }
    return byDate;
  }
  return typeof WINTER_RATING_BY_DATE !== "undefined" ? WINTER_RATING_BY_DATE : {};
}
function getRatingTournamentsByDate() {
  return typeof WINTER_RATING_TOURNAMENTS_BY_DATE !== "undefined" ? WINTER_RATING_TOURNAMENTS_BY_DATE : {};
}
function getSpringRatingTournamentsByDate() {
  return typeof SPRING_RATING_TOURNAMENTS_BY_DATE !== "undefined" ? SPRING_RATING_TOURNAMENTS_BY_DATE : {};
}
function getSpringRatingMarchTopWins() {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var allWins = [];
  Object.keys(tournamentsByDate).forEach(function (dateStr) {
    if (!/\.03\./.test(dateStr)) return;
    var list = tournamentsByDate[dateStr];
    if (!Array.isArray(list)) return;
    list.forEach(function (t) {
      var players = t.players || [];
      players.forEach(function (p) {
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew || rew <= 0) return;
        var nick = normalizeWinterNick(p && p.nick);
        if (!nick) return;
        allWins.push({ nick: nick, reward: rew });
      });
    });
  });
  allWins.sort(function (a, b) { return b.reward - a.reward; });
  var max = allWins.length ? allWins[0] : null;
  var top3 = allWins.slice(0, 3);
  return { max: max, top3: top3 };
}
/** Топ-3 по сумме выигрышей за прошлую неделю (март) и общая сумма за неделю */
function getSpringRatingPastWeekTopSum() {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var allowedDates = typeof MARCH_PAST_WEEK_DATES !== "undefined" && MARCH_PAST_WEEK_DATES.length ? MARCH_PAST_WEEK_DATES : [];
  var byNick = {};
  var totalWeek = 0;
  allowedDates.forEach(function (dateStr) {
    var list = tournamentsByDate[dateStr];
    if (!Array.isArray(list)) return;
    list.forEach(function (t) {
      var players = t.players || [];
      players.forEach(function (p) {
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew || rew <= 0) return;
        var nick = normalizeWinterNick(p && p.nick);
        if (!nick) return;
        if (!byNick[nick]) byNick[nick] = 0;
        byNick[nick] += rew;
        totalWeek += rew;
      });
    });
  });
  var sorted = Object.keys(byNick).map(function (n) { return { nick: n, reward: byNick[n] }; }).sort(function (a, b) { return b.reward - a.reward; });
  return { top3: sorted.slice(0, 3), totalWeek: totalWeek };
}
/** Топ-3 занос за 1 турнир за прошлую неделю (март) — один выигрыш на игрока, сортировка по убыванию */
function getSpringRatingPastWeekTopWins() {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var allowedDates = typeof MARCH_PAST_WEEK_DATES !== "undefined" && MARCH_PAST_WEEK_DATES.length ? MARCH_PAST_WEEK_DATES : [];
  var allWins = [];
  var totalWeek = 0;
  allowedDates.forEach(function (dateStr) {
    var list = tournamentsByDate[dateStr];
    if (!Array.isArray(list)) return;
    list.forEach(function (t) {
      var players = t.players || [];
      players.forEach(function (p) {
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew || rew <= 0) return;
        var nick = normalizeWinterNick(p && p.nick);
        if (!nick) return;
        allWins.push({ nick: nick, reward: rew });
        totalWeek += rew;
      });
    });
  });
  allWins.sort(function (a, b) { return b.reward - a.reward; });
  var top3 = allWins.slice(0, 3);
  return { top3: top3, totalWeek: totalWeek };
}
/** Топ-3 по сумме выигрышей за текущую неделю (март) и общая сумма за неделю */
function getSpringRatingCurrentWeekTopSum() {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var allowedDates = typeof MARCH_CURRENT_WEEK_DATES !== "undefined" && MARCH_CURRENT_WEEK_DATES.length ? MARCH_CURRENT_WEEK_DATES : [];
  var byNick = {};
  var totalWeek = 0;
  allowedDates.forEach(function (dateStr) {
    var list = tournamentsByDate[dateStr];
    if (!Array.isArray(list)) return;
    list.forEach(function (t) {
      var players = t.players || [];
      players.forEach(function (p) {
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew || rew <= 0) return;
        var nick = normalizeWinterNick(p && p.nick);
        if (!nick) return;
        if (!byNick[nick]) byNick[nick] = 0;
        byNick[nick] += rew;
        totalWeek += rew;
      });
    });
  });
  var sorted = Object.keys(byNick).map(function (n) { return { nick: n, reward: byNick[n] }; }).sort(function (a, b) { return b.reward - a.reward; });
  return { top3: sorted.slice(0, 3), totalWeek: totalWeek };
}
/** Топ-3 занос за 1 турнир за текущую неделю (март) */
function getSpringRatingCurrentWeekTopWins() {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var allowedDates = typeof MARCH_CURRENT_WEEK_DATES !== "undefined" && MARCH_CURRENT_WEEK_DATES.length ? MARCH_CURRENT_WEEK_DATES : [];
  var allWins = [];
  var totalWeek = 0;
  allowedDates.forEach(function (dateStr) {
    var list = tournamentsByDate[dateStr];
    if (!Array.isArray(list)) return;
    list.forEach(function (t) {
      var players = t.players || [];
      players.forEach(function (p) {
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew || rew <= 0) return;
        var nick = normalizeWinterNick(p && p.nick);
        if (!nick) return;
        allWins.push({ nick: nick, reward: rew });
        totalWeek += rew;
      });
    });
  });
  allWins.sort(function (a, b) { return b.reward - a.reward; });
  var top3 = allWins.slice(0, 3);
  return { top3: top3, totalWeek: totalWeek };
}
function getRatingImages() {
  if (isSpringRatingMode() && typeof SPRING_RATING_IMAGES_LEAGUE1 !== "undefined" && SPRING_RATING_IMAGES_LEAGUE1) return SPRING_RATING_IMAGES_LEAGUE1;
  return typeof WINTER_RATING_IMAGES !== "undefined" ? WINTER_RATING_IMAGES : {};
}
function getSpringRatingImagesByLeague(leagueNum) {
  if (leagueNum === 1 && typeof SPRING_RATING_IMAGES_LEAGUE1 !== "undefined") return SPRING_RATING_IMAGES_LEAGUE1 || {};
  if (leagueNum === 2 && typeof SPRING_RATING_IMAGES_LEAGUE2 !== "undefined") return SPRING_RATING_IMAGES_LEAGUE2 || {};
  return {};
}
function getSpringRatingRowsForDateLeague(dateStr, leagueNum) {
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var list = tournamentsByDate[dateStr];
  if (!Array.isArray(list) || !list.length) return [];
  var byNick = {};
  for (var j = 0; j < list.length; j++) {
    var t = list[j];
    var forcedLeague = t.league != null ? Number(t.league) : NaN;
    var buyin = t.buyin != null ? Number(t.buyin) : NaN;
    var inLeague1 = forcedLeague === 1 || (forcedLeague !== forcedLeague && (buyin >= 500 || (buyin !== buyin)));
    var inLeague2 = forcedLeague === 2 || (forcedLeague !== forcedLeague && buyin >= 100 && buyin < 500);
    var include = (leagueNum === 1 && inLeague1) || (leagueNum === 2 && inLeague2);
    if (!include) continue;
    var players = t.players || [];
    for (var k = 0; k < players.length; k++) {
      var p = players[k];
      var n = normalizeWinterNick(p && p.nick);
      if (!n) continue;
      var pts = winterRatingPointsForPlace(p.place, p.reward);
      var rew = p.reward != null ? Number(p.reward) : 0;
      if (rew !== rew) rew = 0;
      if (!byNick[n]) byNick[n] = { nick: n, points: 0, reward: 0 };
      byNick[n].points += pts;
      byNick[n].reward += rew;
    }
  }
  return Object.keys(byNick).map(function (n) { return byNick[n]; });
}
function openWinterRatingLightbox(dateStr, index, leagueNum) {
  var box = document.getElementById("winterRatingLightbox");
  var img = box && box.querySelector(".winter-rating-lightbox__img");
  var files = dateStr && (leagueNum != null && isSpringRatingMode()
    ? (getSpringRatingImagesByLeague(leagueNum)[dateStr] || [])
    : getRatingImages()[dateStr]);
  if (!box || !img || !files || !files.length || index < 0 || index >= files.length) return;
  box.dataset.lightboxDate = dateStr;
  box.dataset.lightboxIndex = String(index);
  box.dataset.lightboxLeague = leagueNum != null ? String(leagueNum) : "";
  img.src = getAssetUrl(files[index]);
  img.alt = "Скрин рейтинга " + dateStr + " (" + (index + 1) + ")";
  box.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  updateWinterRatingLightboxArrows();
}

function getWinterRatingLightboxFiles(box) {
  if (!box || !box.dataset.lightboxDate) return null;
  var dateStr = box.dataset.lightboxDate;
  var leagueStr = box.dataset.lightboxLeague;
  var leagueNum = leagueStr === "1" || leagueStr === "2" ? parseInt(leagueStr, 10) : null;
  return leagueNum != null && isSpringRatingMode()
    ? (getSpringRatingImagesByLeague(leagueNum)[dateStr] || [])
    : getRatingImages()[dateStr];
}
function updateWinterRatingLightboxArrows() {
  var box = document.getElementById("winterRatingLightbox");
  if (!box || box.getAttribute("aria-hidden") === "true") return;
  var dateStr = box.dataset.lightboxDate;
  var index = parseInt(box.dataset.lightboxIndex, 10) || 0;
  var files = getWinterRatingLightboxFiles(box);
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
    var leagueStr = box.dataset.lightboxLeague;
    var leagueNum = leagueStr === "1" || leagueStr === "2" ? parseInt(leagueStr, 10) : undefined;
    if (index > 0) openWinterRatingLightbox(dateStr, index - 1, leagueNum);
  });
  if (nextBtn) nextBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var dateStr = box.dataset.lightboxDate;
    var index = parseInt(box.dataset.lightboxIndex, 10) || 0;
    var leagueStr = box.dataset.lightboxLeague;
    var leagueNum = leagueStr === "1" || leagueStr === "2" ? parseInt(leagueStr, 10) : undefined;
    var files = getWinterRatingLightboxFiles(box);
    if (files && index < files.length - 1) openWinterRatingLightbox(dateStr, index + 1, leagueNum);
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
      var leagueStr = box.dataset.lightboxLeague;
      var leagueNum = leagueStr === "1" || leagueStr === "2" ? parseInt(leagueStr, 10) : undefined;
      if (idx > 0) openWinterRatingLightbox(dateStr, idx - 1, leagueNum);
    } else if (e.key === "ArrowRight") {
      var dateStr = box.dataset.lightboxDate;
      var idx = parseInt(box.dataset.lightboxIndex, 10) || 0;
      var leagueStr = box.dataset.lightboxLeague;
      var leagueNum = leagueStr === "1" || leagueStr === "2" ? parseInt(leagueStr, 10) : undefined;
      var files = getWinterRatingLightboxFiles(box);
      if (files && idx < files.length - 1) openWinterRatingLightbox(dateStr, idx + 1, leagueNum);
    }
  });
}

function winterRatingRowClass(place) {
  if (place === 1) return "winter-rating__row--gold";
  if (place === 2) return "winter-rating__row--silver";
  if (place === 3) return "winter-rating__row--bronze";
  return "";
}
/** Форматирует сумму без копеек (округление до целого) */
function formatRewardRound(val) {
  return Math.round(Number(val) || 0).toLocaleString("ru-RU");
}
function winterRatingPrizeByPlace(place) {
  var prizes = { 1: 110000, 2: 60000, 3: 30000, 4: 20000, 5: 10000, 6: 10000, 7: 10000 };
  var amount = prizes[place];
  return amount != null ? formatRewardRound(amount) + " ₽" : "<span class=\"winter-rating__prize-respect\">уважение</span>";
}

function winterRatingPlaceCell(place) {
  if (place === 1) return "🥇 1";
  if (place === 2) return "🥈 2";
  if (place === 3) return "🥉 3";
  return String(place);
}
/** Хпокер баллы: логика подсчёта баллов рейтинга. Баллы за места 1–8 только при ненулевой награде (reward > 0). Место → баллы: 1=135, 2=110, 3=90, 4=70, 5=60, 6=50, 7=40, 8=30. */
var XPOKER_BALLS = { 1: 135, 2: 110, 3: 90, 4: 70, 5: 60, 6: 50, 7: 40, 8: 30 };
function winterRatingPointsForPlace(place, reward) {
  if (reward == null || reward <= 0) return 0;
  var pts = XPOKER_BALLS[place];
  return pts != null ? pts : 0;
}
function mergeWinterRatingRowsByNick(rows) {
  if (!rows || !rows.length) return [];
  var byNick = {};
  rows.forEach(function (r) {
    var n = normalizeWinterNick(r && r.nick);
    var pts = Number(r.points);
    var rew = Number(r.reward);
    if (!byNick[n]) byNick[n] = { nick: n, points: 0, reward: 0 };
    byNick[n].points += (pts === pts ? pts : 0);
    byNick[n].reward += (rew === rew ? rew : 0);
  });
  return Object.keys(byNick).map(function (n) { return byNick[n]; });
}
function renderWinterRatingTable(rows) {
  if (!rows || !rows.length) return "";
  rows = mergeWinterRatingRowsByNick(rows);
  var filtered = rows.filter(function (r) { return r.points !== 0 || r.reward !== 0; });
  var sorted = filtered.slice().sort(function (a, b) { return (b.points - a.points) || (b.reward - a.reward); });
  var place = 0;
  var totalReward = sorted.reduce(function (sum, r) { return sum + (Number(r.reward) || 0); }, 0);
  var tfoot = "<tfoot><tr class=\"winter-rating__table-total-row\"><td colspan=\"3\">Сумма призовых за день</td><td>" + (totalReward ? formatRewardRound(totalReward) : "0") + "</td></tr></tfoot>";
  return "<table class=\"winter-rating__table\"><thead><tr><th>Место</th><th>Ник</th><th>Баллы</th><th>Выигрыш в<br>турнирах</th></tr></thead><tbody>" +
    sorted.map(function (r) {
      place++;
      var trClass = winterRatingRowClass(place);
      var rewardNum = Number(String(r.reward || 0).replace(/\s/g, "")) || 0;
      if (rewardNum > 100000) trClass = (trClass ? trClass + " " : "") + "winter-rating__tr--reward-high";
      else if (rewardNum > 50000) trClass = (trClass ? trClass + " " : "") + "winter-rating__tr--reward-mid";
      var placeCell = winterRatingPlaceCell(place);
      return "<tr" + (trClass ? " class=\"" + trClass + "\"" : "") + "><td>" + placeCell + "</td><td>" + String(r.nick).replace(/</g, "&lt;") + "</td><td>" + r.points + "</td><td>" + (r.reward ? formatRewardRound(r.reward) : "0") + "</td></tr>";
    }).join("") + "</tbody>" + tfoot + "</table>";
}

function escapeHtmlRating(s) {
  if (s == null) return "";
  return String(s).replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;");
}

function winterRatingDateKeyToStamp(dateStr) {
  var parts = dateStr.split(".");
  if (parts.length !== 3) return 0;
  var d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
  return (y * 10000 + m * 100 + d) || 0;
}

function getWinterRatingPlayerSummary(nick) {
  nick = normalizeWinterNick(nick);
  var dateSet = {};
  var tournamentsByDate;
  if (isSpringRatingMode()) {
    tournamentsByDate = {};
    var winterT = typeof WINTER_RATING_TOURNAMENTS_BY_DATE !== "undefined" ? WINTER_RATING_TOURNAMENTS_BY_DATE : {};
    var springT = getSpringRatingTournamentsByDate() || {};
    Object.keys(winterT).forEach(function (k) { tournamentsByDate[k] = winterT[k]; });
    Object.keys(springT).forEach(function (k) { tournamentsByDate[k] = springT[k]; });
  } else {
    tournamentsByDate = getRatingTournamentsByDate();
  }
  var byDate = getRatingByDate();
  if (isSpringRatingMode() && typeof WINTER_RATING_BY_DATE !== "undefined") {
    var mergedByDate = {};
    Object.keys(WINTER_RATING_BY_DATE || {}).forEach(function (k) { mergedByDate[k] = WINTER_RATING_BY_DATE[k]; });
    Object.keys(byDate || {}).forEach(function (k) { mergedByDate[k] = byDate[k]; });
    byDate = mergedByDate;
  }
  if (typeof tournamentsByDate === "object") {
    Object.keys(tournamentsByDate).forEach(function (k) { dateSet[k] = true; });
  }
  if (typeof byDate === "object") {
    Object.keys(byDate).forEach(function (k) { dateSet[k] = true; });
  }
  var dates = Object.keys(dateSet).sort(function (a, b) {
    return winterRatingDateKeyToStamp(b) - winterRatingDateKeyToStamp(a);
  });
  var out = [];
  dates.forEach(function (dateStr) {
    var tournaments = tournamentsByDate && tournamentsByDate[dateStr];
    if (tournaments && tournaments.length) {
      tournaments.forEach(function (t) {
        var p = t.players && t.players.find(function (r) { return winterRatingSamePlayer(r.nick, nick); });
        if (p) {
          var reward = p.reward != null ? p.reward : 0;
          var league = t.league != null ? Number(t.league) : null;
          if (league == null && isSpringRatingMode() && String(dateStr).indexOf(".03.") !== -1 && t.buyin != null) {
            var buyin = Number(t.buyin);
            if (buyin === buyin) {
              league = buyin >= 500 ? 1 : (buyin >= 100 ? 2 : 1);
            }
          }
          out.push({
            date: dateStr,
            time: t.time || "",
            tournamentLabel: t.name || t.time || "",
            place: p.place,
            points: winterRatingPointsForPlace(p.place, reward),
            reward: reward,
            league: league,
          });
        }
      });
      return;
    }
    var list = byDate && byDate[dateStr];
    if (!list || !list.length) return;
    var filtered = list.filter(function (r) { return r.points !== 0 || r.reward !== 0; });
    var sorted = filtered.slice().sort(function (a, b) { return (b.points - a.points) || (b.reward - a.reward); });
    var idx = sorted.findIndex(function (r) { return winterRatingSamePlayer(r.nick, nick); });
    if (idx === -1) return;
    var row = sorted[idx];
    out.push({
      date: dateStr,
      time: "",
      tournamentLabel: "",
      place: idx + 1,
      points: row.points,
      reward: row.reward != null ? row.reward : 0,
    });
  });
  return out.filter(function (s) {
    var p = Number(s.points);
    var w = Number(s.reward);
    return (p === p && p !== 0) || (w === w && w !== 0);
  });
}

function applyWinterRatingPlayerModalFilterAndRender(modal) {
  var fullSummary = modal._winterPlayerModalFullSummary;
  var showPoints = modal._winterPlayerModalShowPoints;
  var tableWrap = modal.querySelector(".winter-rating-player-modal__table-wrap");
  var summaryBlock = document.getElementById("winterRatingPlayerModalSummary");
  var monthSelect = document.getElementById("winterRatingPlayerModalMonth");
  var sortByBtn = document.getElementById("winterRatingPlayerModalSortBy");
  var sortDirBtn = document.getElementById("winterRatingPlayerModalSortDir");
  if (!fullSummary || !tableWrap) return;
  var monthVal = monthSelect && monthSelect.value ? monthSelect.value : "all";
  var leagueSelect = document.getElementById("winterRatingPlayerModalLeague");
  var leagueVal = leagueSelect && leagueSelect.value ? leagueSelect.value : "all";
  var sortBy = (sortByBtn && sortByBtn.textContent.indexOf("выигрыш") !== -1) ? "reward" : "date";
  var sortDesc = (sortDirBtn && sortDirBtn.textContent.indexOf("↑") === -1);
  var list = monthVal === "all" ? fullSummary.slice() : fullSummary.filter(function (s) {
    var parts = String(s.date).split(".");
    return parts.length === 3 && parts[1] + "." + parts[2] === monthVal;
  });
  if (leagueVal === "1" || leagueVal === "2") {
    var leagueNum = parseInt(leagueVal, 10);
    list = list.filter(function (s) { return s.league === leagueNum; });
  }
  list.sort(function (a, b) {
    var cmp = 0;
    if (sortBy === "date") {
      cmp = winterRatingDateKeyToStamp(a.date) - winterRatingDateKeyToStamp(b.date);
    } else {
      cmp = (Number(a.reward) || 0) - (Number(b.reward) || 0);
    }
    return sortDesc ? -cmp : cmp;
  });
  if (list.length) {
    var PLAYER_MODAL_TOURNAMENTS_LIMIT = 15;
    var expanded = !!modal._winterPlayerModalTableExpanded;
    var displayList = list.length > PLAYER_MODAL_TOURNAMENTS_LIMIT && !expanded
      ? list.slice(0, PLAYER_MODAL_TOURNAMENTS_LIMIT)
      : list;
    var totalPointsFiltered = 0;
    for (var pi = 0; pi < list.length; pi++) { totalPointsFiltered += Number(list[pi].points) || 0; }
    var totalRewardFiltered = 0;
    for (var ri = 0; ri < list.length; ri++) { totalRewardFiltered += Number(list[ri].reward) || 0; }
    if (monthVal === "all" && modal._winterPlayerModalNick === "Waaar" && !isSpringRatingMode()) totalRewardFiltered += 588225;
    var totalRewardFilteredStr = totalRewardFiltered ? formatRewardRound(totalRewardFiltered) : "0";
    var headers = "<th>Дата</th><th class=\"winter-rating-player-modal__th-tournament\">Турнир</th><th>Место</th>";
    if (showPoints) headers += "<th>Баллы</th>";
    headers += "<th>Выигрыш</th>";
    var footerCells = "<td colspan=\"3\" class=\"winter-rating-player-modal__total-label\">Итого</td>";
    if (showPoints) footerCells += "<td class=\"winter-rating-player-modal__total-value\">" + totalPointsFiltered + "</td>";
    footerCells += "<td class=\"winter-rating-player-modal__total-value\">" + totalRewardFilteredStr + "</td>";
    var tableHtml = "<table class=\"winter-rating__table winter-rating-player-modal__table\"><thead><tr>" + headers + "</tr></thead><tbody>" +
      displayList.map(function (s, i) {
        var placeStr = winterRatingPlaceCell(s.place);
        var rewardStr = s.reward ? formatRewardRound(s.reward) : "0";
        var showDate = (i === 0 || displayList[i - 1].date !== s.date);
        var dateCell = showDate ? escapeHtmlRating(s.date) : "";
        var tourCell = escapeHtmlRating(s.tournamentLabel || s.time || "—");
        var ptsCell = showPoints ? "<td>" + (s.points || 0) + "</td>" : "";
        var dateParts = String(s.date || "").split(".");
        var monthKey = dateParts.length >= 3 ? dateParts[1] + "." + dateParts[2] : "";
        var prevParts = i > 0 ? String(displayList[i - 1].date || "").split(".") : [];
        var prevMonthKey = prevParts.length >= 3 ? prevParts[1] + "." + prevParts[2] : "";
        var isNewMonth = i > 0 && monthKey && monthKey !== prevMonthKey;
        var rewardNum = Number(String(s.reward || 0).replace(/\s/g, "")) || 0;
        var rewardClass = rewardNum > 100000 ? " winter-rating-player-modal__tr--reward-high" : (rewardNum > 50000 ? " winter-rating-player-modal__tr--reward-mid" : "");
        var trClass = (isNewMonth ? " winter-rating-player-modal__tr--month-start" : "") + rewardClass;
        return "<tr class=\"" + trClass.replace(/^ /, "") + "\"><td>" + dateCell + "</td><td class=\"winter-rating-player-modal__td-tournament\">" + tourCell + "</td><td>" + placeStr + "</td>" + ptsCell + "<td>" + rewardStr + "</td></tr>";
      }).join("") + "</tbody><tfoot><tr class=\"winter-rating-player-modal__total-row\">" + footerCells + "</tr></tfoot></table>";
    var showAllHtml = list.length > PLAYER_MODAL_TOURNAMENTS_LIMIT
      ? "<div class=\"winter-rating-player-modal__show-all-wrap\"><button type=\"button\" class=\"winter-rating-player-modal__show-all-btn\" aria-label=\"Раскрыть или свернуть список\">" + (expanded ? "Свернуть" : "Показать все (" + list.length + ")") + "</button></div>"
      : "";
    tableWrap.innerHTML = tableHtml + showAllHtml;
    var firstsList = list.filter(function (s) { return Number(s.place) === 1; });
    var firsts = firstsList.length;
    var firstsReward = 0;
    for (var fi = 0; fi < firstsList.length; fi++) { firstsReward += Number(firstsList[fi].reward) || 0; }
    var firstsRewardStr = firstsReward ? formatRewardRound(firstsReward) : "0";
    var secondsList = list.filter(function (s) { return Number(s.place) === 2; });
    var seconds = secondsList.length;
    var secondsReward = 0;
    for (var si = 0; si < secondsList.length; si++) { secondsReward += Number(secondsList[si].reward) || 0; }
    var secondsRewardStr = secondsReward ? formatRewardRound(secondsReward) : "0";
    var thirdsList = list.filter(function (s) { return Number(s.place) === 3; });
    var thirds = thirdsList.length;
    var thirdsReward = 0;
    for (var ti = 0; ti < thirdsList.length; ti++) { thirdsReward += Number(thirdsList[ti].reward) || 0; }
    var thirdsRewardStr = thirdsReward ? formatRewardRound(thirdsReward) : "0";
    var totalReward = 0;
    for (var i = 0; i < list.length; i++) { totalReward += Number(list[i].reward) || 0; }
    if (monthVal === "all" && modal._winterPlayerModalNick === "Waaar" && !isSpringRatingMode()) totalReward += 588225;
    var totalStr = totalReward ? formatRewardRound(totalReward) : "0";
    var topReward = 0;
    for (var ri = 0; ri < list.length; ri++) {
      var r = Number(list[ri].reward) || 0;
      if (r > topReward) topReward = r;
    }
    var topRewardStr = topReward ? formatRewardRound(topReward) : "0";
    var monthNames = { "12": "Декабрь", "01": "Январь", "02": "Февраль", "03": "Март", "04": "Апрель", "05": "Май", "06": "Июнь", "07": "Июль", "08": "Август", "09": "Сентябрь", "10": "Октябрь", "11": "Ноябрь" };
    var fullSummaryForMonths = modal._winterPlayerModalFullSummary || [];
    var byMonth = {};
    for (var mi = 0; mi < fullSummaryForMonths.length; mi++) {
      var parts = String(fullSummaryForMonths[mi].date).split(".");
      if (parts.length === 3) {
        var monthKey = parts[1] + "." + parts[2];
        if (!byMonth[monthKey]) byMonth[monthKey] = { key: monthKey, sum: 0 };
        byMonth[monthKey].sum += Number(fullSummaryForMonths[mi].reward) || 0;
      }
    }
    var monthOrder = ["12.2025", "01.2026", "02.2026", "03.2026", "04.2026", "05.2026", "06.2026", "07.2026", "08.2026", "09.2026", "10.2026", "11.2026"];
    var monthRows = "";
    monthOrder.forEach(function (monthKey) {
      if (byMonth[monthKey] && byMonth[monthKey].sum) {
        var p = monthKey.split(".");
        var monthLabel = (monthNames[p[0]] || p[0]) + " " + p[1];
        monthRows += "<tr><td class=\"winter-rating-player-modal__summary-label\">" + escapeHtmlRating(monthLabel) + "</td><td class=\"winter-rating-player-modal__summary-value\">" + formatRewardRound(byMonth[monthKey].sum) + "</td></tr>";
      }
    });
    modal._winterPlayerModalTotalStr = totalStr;
    if (summaryBlock) {
      summaryBlock.innerHTML = "<table class=\"winter-rating-player-modal__summary-table\"><tbody>" +
        "<tr class=\"winter-rating-player-modal__summary-total-row\"><td class=\"winter-rating-player-modal__summary-label\">Общие призовые</td><td class=\"winter-rating-player-modal__summary-value\">" + totalStr + "</td></tr>" +
        "<tr><td class=\"winter-rating-player-modal__summary-label\">Топ выигрыш</td><td class=\"winter-rating-player-modal__summary-value\">" + topRewardStr + "</td></tr>" +
        "<tr><td class=\"winter-rating-player-modal__summary-label\">Первых мест</td><td class=\"winter-rating-player-modal__summary-value\">" + firsts + " (призовые — " + firstsRewardStr + ")</td></tr>" +
        "<tr><td class=\"winter-rating-player-modal__summary-label\">Вторых мест</td><td class=\"winter-rating-player-modal__summary-value\">" + seconds + " (призовые — " + secondsRewardStr + ")</td></tr>" +
        "<tr><td class=\"winter-rating-player-modal__summary-label\">Третьих мест</td><td class=\"winter-rating-player-modal__summary-value\">" + thirds + " (призовые — " + thirdsRewardStr + ")</td></tr>" +
        (monthRows ? "<tr class=\"winter-rating-player-modal__summary-months-sep\"><td colspan=\"2\">Выигрыши по месяцам</td></tr>" + monthRows : "") +
        "</tbody></table>";
      summaryBlock.style.display = "";
    }
  } else {
    modal._winterPlayerModalTotalStr = "0";
    tableWrap.innerHTML = "<p class=\"winter-rating-player-modal__empty\">Нет данных за выбранный период</p>";
    if (summaryBlock) { summaryBlock.innerHTML = ""; summaryBlock.style.display = "none"; }
  }
}

function openWinterRatingPlayerModal(nick, options) {
  options = options || {};
  var modal = document.getElementById("winterRatingPlayerModal");
  if (modal) initWinterRatingPlayerModal();
  var titleEl = modal && modal.querySelector(".winter-rating-player-modal__title");
  var tableWrap = modal && modal.querySelector(".winter-rating-player-modal__table-wrap");
  var summaryBlock = modal && document.getElementById("winterRatingPlayerModalSummary");
  var monthSelect = document.getElementById("winterRatingPlayerModalMonth");
  var sortByBtn = document.getElementById("winterRatingPlayerModalSortBy");
  var sortDirBtn = document.getElementById("winterRatingPlayerModalSortDir");
  if (!modal || !titleEl || !tableWrap) return;
  var summary = getWinterRatingPlayerSummary(nick);
  var fromGazette = options.onlyDates && Array.isArray(options.onlyDates) && options.onlyDates.length;
  if (fromGazette) {
    var allowedSet = {};
    options.onlyDates.forEach(function (d) { allowedSet[d] = true; });
    summary = summary.filter(function (s) { return allowedSet[s.date]; });
  }
  var useGazetteStyle = fromGazette && !options.skipGazetteStyle;
  modal.classList.toggle("winter-rating-player-modal--gazette", !!useGazetteStyle);
  titleEl.textContent = nick;
  modal._winterPlayerModalFullSummary = summary;
  modal._winterPlayerModalTableExpanded = false;
  modal._winterPlayerModalShowPoints = !useGazetteStyle;
  modal._winterPlayerModalNick = normalizeWinterNick(nick);
  if (monthSelect) monthSelect.value = "all";
  var leagueWrap = document.getElementById("winterRatingPlayerModalLeagueWrap");
  var leagueSelect = document.getElementById("winterRatingPlayerModalLeague");
  if (leagueWrap) leagueWrap.style.display = (isSpringRatingMode() && summary.length) ? "" : "none";
  if (leagueSelect) leagueSelect.value = "all";
  if (sortByBtn) sortByBtn.textContent = "Сортировать: По дате";
  if (sortDirBtn) { sortDirBtn.textContent = "↓"; sortDirBtn.title = "По убыванию"; }
  var toolbar = modal.querySelector(".winter-rating-player-modal__toolbar");
  var tableLabel = document.getElementById("winterRatingPlayerModalTableLabel");
  if (toolbar) toolbar.style.display = summary.length ? "" : "none";
  if (tableLabel) tableLabel.style.display = summary.length ? "" : "none";
  if (summary.length) {
    applyWinterRatingPlayerModalFilterAndRender(modal);
    var shareWrap = modal.querySelector(".winter-rating-player-modal__share-wrap");
    if (shareWrap) shareWrap.style.display = "";
  } else {
    tableWrap.innerHTML = "<p class=\"winter-rating-player-modal__empty\">Нет данных по датам</p>";
    if (summaryBlock) { summaryBlock.innerHTML = ""; summaryBlock.style.display = "none"; }
    var shareWrap = modal.querySelector(".winter-rating-player-modal__share-wrap");
    if (shareWrap) shareWrap.style.display = "none";
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

function openSpringRatingInfoModal() {
  var modal = document.getElementById("springRatingInfoModal");
  if (!modal) return;
  initSpringRatingInfoModal();
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("spring-rating-info-modal--open");
  document.body.style.overflow = "hidden";
}

function closeSpringRatingInfoModal() {
  var modal = document.getElementById("springRatingInfoModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("spring-rating-info-modal--open");
  document.body.style.overflow = "";
}

function initSpringRatingInfoModal() {
  var modal = document.getElementById("springRatingInfoModal");
  if (!modal || modal.getAttribute("data-inited") === "1") return;
  modal.setAttribute("data-inited", "1");
  var closeBtn = modal.querySelector(".spring-rating-info-modal__close");
  var backdrop = modal.querySelector(".spring-rating-info-modal__backdrop");
  if (closeBtn) closeBtn.addEventListener("click", closeSpringRatingInfoModal);
  if (backdrop) backdrop.addEventListener("click", closeSpringRatingInfoModal);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeSpringRatingInfoModal();
  });
}

function initWinterRatingPlayerModal() {
  var modal = document.getElementById("winterRatingPlayerModal");
  if (!modal || modal.getAttribute("data-inited") === "1") return;
  modal.setAttribute("data-inited", "1");
  var closeBtn = modal.querySelector(".winter-rating-player-modal__close");
  var backBtn = document.getElementById("winterRatingPlayerModalBack") || modal.querySelector(".winter-rating-player-modal__back");
  if (closeBtn) closeBtn.addEventListener("click", closeWinterRatingPlayerModal);
  if (backBtn) backBtn.addEventListener("click", closeWinterRatingPlayerModal);
  modal.addEventListener("click", function (e) {
    if (e.target === modal) closeWinterRatingPlayerModal();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeWinterRatingPlayerModal();
  });
  var monthSelect = document.getElementById("winterRatingPlayerModalMonth");
  var sortByBtn = document.getElementById("winterRatingPlayerModalSortBy");
  var sortDirBtn = document.getElementById("winterRatingPlayerModalSortDir");
  if (monthSelect) {
    monthSelect.addEventListener("change", function () {
      if (modal._winterPlayerModalFullSummary) applyWinterRatingPlayerModalFilterAndRender(modal);
    });
  }
  var leagueSelect = document.getElementById("winterRatingPlayerModalLeague");
  if (leagueSelect) {
    leagueSelect.addEventListener("change", function () {
      if (modal._winterPlayerModalFullSummary) applyWinterRatingPlayerModalFilterAndRender(modal);
    });
  }
  if (sortByBtn) {
    sortByBtn.addEventListener("click", function () {
      if (sortByBtn.textContent.indexOf("дате") !== -1) {
        sortByBtn.textContent = "Сортировать: По выигрышам";
      } else {
        sortByBtn.textContent = "Сортировать: По дате";
      }
      if (modal._winterPlayerModalFullSummary) applyWinterRatingPlayerModalFilterAndRender(modal);
    });
  }
  if (sortDirBtn) {
    sortDirBtn.addEventListener("click", function () {
      if (sortDirBtn.textContent.indexOf("↑") !== -1) {
        sortDirBtn.textContent = "↓";
        sortDirBtn.title = "По убыванию";
      } else {
        sortDirBtn.textContent = "↑";
        sortDirBtn.title = "По возрастанию";
      }
      if (modal._winterPlayerModalFullSummary) applyWinterRatingPlayerModalFilterAndRender(modal);
    });
  }
  modal.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest && e.target.closest(".winter-rating-player-modal__show-all-btn");
    if (btn && modal._winterPlayerModalFullSummary) {
      modal._winterPlayerModalTableExpanded = !modal._winterPlayerModalTableExpanded;
      applyWinterRatingPlayerModalFilterAndRender(modal);
    }
  });
  var shareBtn = document.getElementById("winterRatingPlayerModalShareBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", function () {
      var titleEl = modal.querySelector(".winter-rating-player-modal__title");
      var nick = modal._winterPlayerModalNick || (titleEl && titleEl.textContent) || "";
      if (!nick) return;
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var isSpring = typeof isSpringRatingMode === "function" && isSpringRatingMode();
      var startApp = isSpring ? "spring_rating_player_" : "winter_rating_player_";
      var link = appUrl + "?startapp=" + startApp + encodeURIComponent(nick);
      if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка скопирована. Отправьте другу — откроется сводка по игроку " + nick + "."); else alert("Ссылка скопирована.");
        }).catch(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        });
      } else {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
      }
    });
  }
  var shareTelegramBtn = document.getElementById("winterRatingPlayerModalShareTelegramBtn");
  if (shareTelegramBtn) {
    shareTelegramBtn.addEventListener("click", function () {
      var titleEl = modal.querySelector(".winter-rating-player-modal__title");
      var nick = modal._winterPlayerModalNick || (titleEl && titleEl.textContent) || "";
      if (!nick) return;
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var isSpring = typeof isSpringRatingMode === "function" && isSpringRatingMode();
      var startApp = isSpring ? "spring_rating_player_" : "winter_rating_player_";
      var link = appUrl + "?startapp=" + startApp + encodeURIComponent(nick);
      var totalStr = modal._winterPlayerModalTotalStr || "0";
      var shareText = "Игрок " + nick + " уже выиграл " + totalStr + ". Посмотрите отчет по турнирам - " + link;
      var shareUrl = "https://t.me/share/url?url=&text=" + encodeURIComponent(shareText);
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
      else if (tg && tg.openLink) tg.openLink(shareUrl);
      else window.open(shareUrl, "_blank");
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("winter_rating_player_share");
    });
  }
}

// Зал славы: клик по легенде открывает профиль игрока в рейтинге
(function () {
  document.addEventListener("click", function (e) {
    var link = e.target && e.target.closest ? e.target.closest(".hall-of-fame__legend-link") : null;
    if (!link || !link.dataset.nick) return;
    e.preventDefault();
    if (typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(link.dataset.nick);
  });
})();

// Итоговая таблица рейтинга (декабрь, январь, февраль).
// Бонусы к итогу: Coo1er91 +55, Waaar +325 (ручные доп. очки). Доп. в итог (не по датам): Waaar +765 очков, +588225 призы; EM13!! +135 очков.
function getWinterRatingOverall() {
  if (isSpringRatingMode()) return [];
  var byNick = {};
  var data = getRatingByDate() || {};
  var dateStrs = Object.keys(data);
  for (var i = 0; i < dateStrs.length; i++) {
    var dateStr = dateStrs[i];
    var list = data[dateStr];
    if (!Array.isArray(list) || !list.length) continue;
    for (var j = 0; j < list.length; j++) {
      var r = list[j];
      var n = normalizeWinterNick(r && r.nick);
      if (!n) continue;
      var pts = Number(r.points);
      var rew = Number(r.reward);
      if (pts !== pts) pts = 0;
      if (rew !== rew) rew = 0;
      if (!byNick[n]) byNick[n] = { nick: n, points: 0, reward: 0 };
      byNick[n].points += pts;
      byNick[n].reward += rew;
    }
  }
  if (!isSpringRatingMode()) {
  if (byNick["Coo1er91"]) byNick["Coo1er91"].points += 55; else byNick["Coo1er91"] = { nick: "Coo1er91", points: 55, reward: 0 };
  if (byNick["Waaar"]) byNick["Waaar"].points += 325; else byNick["Waaar"] = { nick: "Waaar", points: 325, reward: 0 };
  if (byNick["Waaar"]) { byNick["Waaar"].points += 765; byNick["Waaar"].reward += 588225; } else { byNick["Waaar"] = { nick: "Waaar", points: 765, reward: 588225 }; }
  if (byNick["Waaar"]) { byNick["Waaar"].points -= 405; byNick["Waaar"].reward -= 475000; }
  if (byNick["Em13!!"]) byNick["Em13!!"].points += 135; else byNick["Em13!!"] = { nick: "Em13!!", points: 135, reward: 0 };
  }
  var arr = Object.keys(byNick).map(function (n) { return byNick[n]; });
  arr = arr.filter(function (r) {
    var p = Number(r.points);
    var w = Number(r.reward);
    return (p === p && p !== 0) || (w === w && w !== 0);
  });
  arr.sort(function (a, b) {
    var ap = Number(a.points);
    var bp = Number(b.points);
    var aw = Number(a.reward);
    var bw = Number(b.reward);
    if (ap !== ap) ap = 0;
    if (bp !== bp) bp = 0;
    if (aw !== aw) aw = 0;
    if (bw !== bw) bw = 0;
    return (bp - ap) || (bw - aw);
  });
  return arr;
}

function getSpringRatingOverallByLeague(leagueNum) {
  if (!isSpringRatingMode()) return [];
  var tournamentsByDate = getSpringRatingTournamentsByDate() || {};
  var byNick = {};
  var marchRegex = /\.03\.2026$/;
  var dateStrs = Object.keys(tournamentsByDate).filter(function (d) { return marchRegex.test(d); });
  for (var i = 0; i < dateStrs.length; i++) {
    var list = tournamentsByDate[dateStrs[i]];
    if (!Array.isArray(list) || !list.length) continue;
    for (var j = 0; j < list.length; j++) {
      var t = list[j];
      var forcedLeague = t.league != null ? Number(t.league) : NaN;
      var buyin = t.buyin != null ? Number(t.buyin) : NaN;
      var inLeague1 = forcedLeague === 1 || (forcedLeague !== forcedLeague && (buyin >= 500 || (buyin !== buyin)));
      var inLeague2 = forcedLeague === 2 || (forcedLeague !== forcedLeague && buyin >= 100 && buyin < 500);
      var include = (leagueNum === 1 && inLeague1) || (leagueNum === 2 && inLeague2);
      if (!include) continue;
      var players = t.players || [];
      for (var k = 0; k < players.length; k++) {
        var p = players[k];
        var n = normalizeWinterNickForFinalTable(p && p.nick);
        if (!n) continue;
        var pts = winterRatingPointsForPlace(p.place, p.reward);
        var rew = p.reward != null ? Number(p.reward) : 0;
        if (rew !== rew) rew = 0;
        if (!byNick[n]) byNick[n] = { nick: n, points: 0, reward: 0 };
        byNick[n].points += pts;
        byNick[n].reward += rew;
      }
    }
  }
  var arr = Object.keys(byNick).map(function (n) { return byNick[n]; });
  arr = arr.filter(function (r) {
    var p = Number(r.points);
    var w = Number(r.reward);
    return (p === p && p !== 0) || (w === w && w !== 0);
  });
  arr.sort(function (a, b) {
    var ap = Number(a.points);
    var bp = Number(b.points);
    var aw = Number(a.reward);
    var bw = Number(b.reward);
    if (ap !== ap) ap = 0;
    if (bp !== bp) bp = 0;
    if (aw !== aw) aw = 0;
    if (bw !== bw) bw = 0;
    return (bp - ap) || (bw - aw);
  });
  return arr;
}

function initWinterRating() {
  try {
    if (typeof window.updateWinterRatingWeekTopPreviews === "function") window.updateWinterRatingWeekTopPreviews();
  } catch (e) {}
  try {
    initWinterRatingLightbox();
    initWinterRatingPlayerModal();
  } catch (e) {
    if (typeof console !== "undefined" && console.error) console.error("initWinterRating lightbox/modal", e);
  }
  var conditionsBtn = document.getElementById("springRatingConditionsBtn");
  if (conditionsBtn && conditionsBtn.getAttribute("data-inited") !== "1") {
    conditionsBtn.setAttribute("data-inited", "1");
    conditionsBtn.addEventListener("click", function () { openSpringRatingInfoModal(); });
  }
  var febBtnLabel = document.querySelector("#winterRatingTopFebruaryBtn .winter-rating__week-top-btn-label");
  if (febBtnLabel) febBtnLabel.textContent = isSpringRatingMode() ? "Топы Марта" : "Топы Февраля";
  var titleTextEl = document.querySelector("#winterRatingSection .winter-rating__title-text");
  if (titleTextEl) {
    titleTextEl.innerHTML = isSpringRatingMode()
      ? "Рейтинг Турнирщиков весны<br /><span class=\"winter-rating__title-accent\">На 250 000р</span>"
      : "Рейтинг Турнирщиков зимы<br /><span class=\"winter-rating__title-accent\">на 250 000₽</span>";
  }
  window.openWinterRatingDatePanel = function (dateStr) {
    var container = document.getElementById("winterRatingDates");
    if (!container) return;
    var item = container.querySelector(".winter-rating__date-item[data-rating-date=\"" + (dateStr || "") + "\"]");
    if (!item) return;
    var panel = item.querySelector(".winter-rating__date-panel");
    var btn = item.querySelector(".winter-rating__date-btn");
    if (panel) panel.classList.remove("winter-rating__date-panel--hidden");
    if (btn) btn.setAttribute("aria-expanded", "true");
    try { item.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (e) {}
  };
  var countersEl = document.getElementById("winterRatingCounters");
  var tbody = document.getElementById("winterRatingTableBody");
  var tableCaption = document.querySelector("#winterRatingSection .winter-rating__table-caption");
  if (countersEl) {
    if (isSpringRatingMode()) {
      countersEl.innerHTML = "";
    } else {
      try {
        var c = getWinterRatingCounters();
        countersEl.innerHTML = "Сыграно дней <strong>" + c.daysPassed + "/" + c.totalDays + "</strong>";
      } catch (e) {
        if (typeof console !== "undefined" && console.error) console.error("getWinterRatingCounters", e);
        countersEl.innerHTML = "Сыграно дней <strong>—</strong>";
      }
    }
  }
  if (tableCaption) {
    tableCaption.innerHTML = isSpringRatingMode()
      ? "<span class=\"winter-rating__caption-icon\" aria-hidden=\"true\">🌿</span> Весна 2026"
      : "<span class=\"winter-rating__caption-icon\" aria-hidden=\"true\">❄</span> Итоговая таблица";
  }
  var tableCaptionRow = document.querySelector("#winterRatingSection .winter-rating__table-caption-row");
  var springLeaguesEl = document.getElementById("winterRatingSpringLeagues");
  var springMainTabsEl = document.getElementById("winterRatingSpringMainTabs");
  var winterRatingShareBtn = document.getElementById("winterRatingShareBtn");
  function filterTableByNick(tbody, searchStr, tableWrap, showAllBtn) {
    if (!tbody) return;
    var q = (searchStr || "").trim().toLowerCase();
    var trs = tbody.querySelectorAll("tr");
    var hadCollapsed = tableWrap && tableWrap.classList.contains("winter-rating__table-wrap--collapsed");
    var scrollTop = tableWrap && tableWrap.scrollTop != null ? tableWrap.scrollTop : 0;
    var docScrollTop = (document.scrollingElement && document.scrollingElement.scrollTop) || document.documentElement.scrollTop || 0;
    if (q) {
      if (tableWrap) tableWrap.classList.remove("winter-rating__table-wrap--collapsed");
      if (showAllBtn) showAllBtn.textContent = "Свернуть";
    } else if (hadCollapsed && tableWrap) {
      tableWrap.classList.add("winter-rating__table-wrap--collapsed");
      if (showAllBtn) showAllBtn.textContent = "Ещё";
    }
    for (var i = 0; i < trs.length; i++) {
      var tr = trs[i];
      var nickBtn = tr.querySelector(".winter-rating__nick-btn");
      var nick = (nickBtn && nickBtn.dataset.nick ? nickBtn.dataset.nick : (nickBtn ? nickBtn.textContent : "")).toLowerCase();
      var match = !q || (nick && nick.indexOf(q) >= 0);
      tr.style.display = match ? "" : "none";
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (tableWrap && tableWrap.scrollTop !== scrollTop) tableWrap.scrollTop = scrollTop;
        var el = document.scrollingElement || document.documentElement;
        if (el && el.scrollTop !== docScrollTop) el.scrollTop = docScrollTop;
      });
    });
  }
  function debounceRatingSearch(fn, ms) {
    var t;
    return function () {
      var args = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(null, args); }, ms);
    };
  }
  if (isSpringRatingMode()) {
    if (tableCaptionRow) tableCaptionRow.style.display = "none";
    if (document.getElementById("winterRatingTableWrap")) document.getElementById("winterRatingTableWrap").style.display = "none";
    var winterShowAllWrap = document.getElementById("winterRatingShowAllWrap");
    if (winterShowAllWrap) winterShowAllWrap.style.display = "none";
    var winterSearchWrap = document.getElementById("winterRatingSearchWrap");
    if (winterSearchWrap) winterSearchWrap.style.display = "none";
    if (springLeaguesEl) { springLeaguesEl.removeAttribute("hidden"); springLeaguesEl.style.display = ""; }
    if (springMainTabsEl) { springMainTabsEl.removeAttribute("hidden"); springMainTabsEl.style.display = ""; }
  } else {
    if (tableCaptionRow) tableCaptionRow.style.display = "";
    if (document.getElementById("winterRatingTableWrap")) document.getElementById("winterRatingTableWrap").style.display = "";
    if (springLeaguesEl) { springLeaguesEl.setAttribute("hidden", ""); springLeaguesEl.style.display = "none"; }
    if (springMainTabsEl) { springMainTabsEl.setAttribute("hidden", ""); springMainTabsEl.style.display = "none"; }
    if (winterRatingShareBtn) { winterRatingShareBtn.style.display = ""; }
    var winterSearchWrapEl = document.getElementById("winterRatingSearchWrap");
    if (winterSearchWrapEl) winterSearchWrapEl.style.display = "";
  }
  function switchSpringRatingMainTab(league) {
    if (!springMainTabsEl || !springLeaguesEl) return;
    var tabs = springMainTabsEl.querySelectorAll(".winter-rating__spring-main-tab");
    var leagues = springLeaguesEl.querySelectorAll(".winter-rating__spring-league--main");
    for (var i = 0; i < tabs.length; i++) tabs[i].classList.toggle("winter-rating__spring-main-tab--active", tabs[i].dataset.springMainLeague === league);
    for (var j = 0; j < leagues.length; j++) leagues[j].style.display = leagues[j].getAttribute("data-spring-league") === league ? "" : "none";
  }
  window.switchSpringRatingMainTab = switchSpringRatingMainTab;
  if (springMainTabsEl && springMainTabsEl.getAttribute("data-inited") !== "1") {
    springMainTabsEl.setAttribute("data-inited", "1");
    springMainTabsEl.addEventListener("click", function (e) {
      var tab = e.target && e.target.closest ? e.target.closest(".winter-rating__spring-main-tab") : null;
      if (!tab || !tab.dataset.springMainLeague) return;
      var league = tab.dataset.springMainLeague;
      switchSpringRatingMainTab(league);
    });
  }
  if (document.body.getAttribute("data-rating-date-share-bound") !== "1") {
    document.body.setAttribute("data-rating-date-share-bound", "1");
    document.body.addEventListener("click", function (e) {
      var shareBtn = e.target && e.target.closest ? e.target.closest(".winter-rating__date-share-btn") : null;
      if (!shareBtn) return;
      var wrap = shareBtn.closest(".winter-rating__date-share");
      var dateStr = wrap && wrap.getAttribute("data-rating-date");
      if (!dateStr) return;
      e.preventDefault();
      e.stopPropagation();
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var isSpring = typeof isSpringRatingMode === "function" && isSpringRatingMode();
      var startApp = isSpring ? "spring_rating_date_" + String(dateStr).replace(/\./g, "_") : "rating_" + String(dateStr).replace(/\./g, "_");
      var link = appUrl + "?startapp=" + startApp;
      var msg = "Ссылка скопирована. Отправьте другу — откроется рейтинг за " + dateStr + ".";
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          if (tg && tg.showAlert) tg.showAlert(msg); else alert("Ссылка скопирована.");
        }).catch(function () {
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        });
      } else {
        if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
      }
    }, true);
  }
  if (document.body.getAttribute("data-spring-league-share-bound") !== "1") {
    document.body.setAttribute("data-spring-league-share-bound", "1");
    document.body.addEventListener("click", function (e) {
      var shareBtn = e.target && e.target.closest ? e.target.closest(".winter-rating__spring-league-share") : null;
      if (!shareBtn || !shareBtn.dataset.springLeague) return;
      e.preventDefault();
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var link = appUrl + "?startapp=spring_rating_league_" + shareBtn.dataset.springLeague;
      var msg = shareBtn.dataset.springLeague === "1" ? "Ссылка скопирована. Отправьте другу — откроется рейтинг Лиги 1." : "Ссылка скопирована. Отправьте другу — откроется рейтинг Лиги 2.";
      if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert(msg); else alert("Ссылка скопирована.");
        }).catch(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        });
      } else {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
      }
    });
  }
  var allRows = [];
  try {
    allRows = getWinterRatingOverall();
  } catch (e) {
    if (typeof console !== "undefined" && console.error) console.error("getWinterRatingOverall", e);
  }
  if (!Array.isArray(allRows)) allRows = [];
  allRows = allRows.filter(function (r) {
    var p = r && r.points != null ? Number(r.points) : 0;
    var w = r && r.reward != null ? Number(r.reward) : 0;
    if (p !== p || !isFinite(p)) p = 0;
    if (w !== w || !isFinite(w)) w = 0;
    return p !== 0 || w !== 0;
  });
  var rows = [];
  try {
    for (var ri = 0; ri < allRows.length; ri++) {
      var r = allRows[ri];
      var rewardVal = r && r.reward != null ? Number(r.reward) : 0;
      if (rewardVal !== rewardVal || !isFinite(rewardVal)) rewardVal = 0;
      var rewardStr = formatRewardRound(rewardVal);
      var pointsVal = r && r.points != null ? Number(r.points) : 0;
      if (pointsVal !== pointsVal || !isFinite(pointsVal)) pointsVal = 0;
      if (pointsVal === 0 && rewardVal === 0) continue;
      rows.push({
        place: rows.length + 1,
        nick: r && r.nick != null ? String(r.nick) : "",
        points: pointsVal,
        reward: rewardStr
      });
    }
  } catch (e) {
    if (typeof console !== "undefined" && console.error) console.error("winter rating rows map", e);
  }
  if (isSpringRatingMode()) {
    var league1Body = document.getElementById("winterRatingLeague1Body");
    var league2Body = document.getElementById("winterRatingLeague2Body");
    var league1PrizesByPlace = { 1: 100000, 2: 50000, 3: 25000, 4: 10000, 5: 5000 };
    var league2PrizesByPlace = { 1: 30000, 2: 15000, 3: 7500, 4: 5000, 5: 2500 };
    function renderLeagueRows(leagueNum, bodyEl) {
      if (!bodyEl) return;
      var raw = [];
      try { raw = getSpringRatingOverallByLeague(leagueNum); } catch (e) {}
      if (!Array.isArray(raw)) raw = [];
      var leagueRows = [];
      for (var ri = 0; ri < raw.length; ri++) {
        var r = raw[ri];
        var rewardVal = r && r.reward != null ? Number(r.reward) : 0;
        if (rewardVal !== rewardVal || !isFinite(rewardVal)) rewardVal = 0;
        var rewardStr = formatRewardRound(rewardVal);
        var pointsVal = r && r.points != null ? Number(r.points) : 0;
        if (pointsVal !== pointsVal || !isFinite(pointsVal)) pointsVal = 0;
        if (pointsVal === 0 && rewardVal === 0) continue;
        leagueRows.push({ place: leagueRows.length + 1, nick: r && r.nick != null ? String(r.nick) : "", points: pointsVal, reward: rewardStr });
      }
      var hasPrizeColumn = leagueNum === 1 || leagueNum === 2;
      var colspan = hasPrizeColumn ? 5 : 4;
      var prizesByPlace = leagueNum === 1 ? league1PrizesByPlace : leagueNum === 2 ? league2PrizesByPlace : null;
      var parts = [];
      for (var wi = 0; wi < leagueRows.length; wi++) {
        var row = leagueRows[wi];
        var place = row.place != null ? parseInt(row.place, 10) : wi + 1;
        if (place !== place) place = wi + 1;
        var trClass = winterRatingRowClass(place);
        var placeCell = winterRatingPlaceCell(place);
        var nickStr = row.nick != null ? String(row.nick) : "";
        var nickEsc = escapeHtmlRating(nickStr);
        var nickAttr = nickStr.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        var prizeCell = "";
        if (hasPrizeColumn) {
          var prizeVal = prizesByPlace && prizesByPlace[place] != null ? prizesByPlace[place] : null;
          var prizeStr = prizeVal != null && prizeVal >= 1000 ? (prizeVal / 1000) + "К₽" : (prizeVal != null && prizeVal > 0 ? prizeVal + "₽" : "—");
          prizeCell = "<td class=\"winter-rating__td-prize\" title=\"" + (prizeVal ? formatRewardRound(prizeVal) + " ₽" : "—") + "\">" + prizeStr + "</td>";
        }
        parts.push("<tr" + (trClass ? " class=\"" + trClass + "\"" : "") + "><td>" + placeCell + "</td><td><button type=\"button\" class=\"winter-rating__nick-btn\" data-nick=\"" + nickAttr + "\">" + nickEsc + "</button></td><td>" + (row.points != null ? row.points : "") + "</td><td>" + (row.reward != null ? row.reward : "0") + "</td>" + prizeCell + "</tr>");
      }
      bodyEl.innerHTML = parts.length ? parts.join("") : "<tr><td colspan=\"" + colspan + "\" class=\"winter-rating__spring-placeholder\">Данные с 1 марта</td></tr>";
      bodyEl.removeEventListener("click", bodyEl._leagueNickClick);
      bodyEl._leagueNickClick = function (e) {
        var btn = e.target && e.target.closest && e.target.closest(".winter-rating__nick-btn");
        if (btn && btn.dataset.nick && typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(btn.dataset.nick);
      };
      bodyEl.addEventListener("click", bodyEl._leagueNickClick);
    }
    function setupLeagueCollapse(bodyEl, leagueNum) {
      if (!bodyEl) return;
      var rows = bodyEl.querySelectorAll("tr");
      var tableWrap = bodyEl.parentElement && bodyEl.parentElement.parentElement;
      var showAllWrap = document.getElementById("winterRatingLeague" + leagueNum + "ShowAllWrap");
      var showAllBtn = showAllWrap && showAllWrap.querySelector(".winter-rating__show-all-btn--league");
      var searchWrap = document.getElementById("winterRatingLeague" + leagueNum + "SearchWrap");
      var searchInput = document.getElementById("winterRatingLeague" + leagueNum + "SearchInput");
      var hasData = rows.length > 0 && !bodyEl.querySelector(".winter-rating__spring-placeholder");
      if (searchWrap) searchWrap.style.display = hasData ? "" : "none";
      if (rows.length > 10 && tableWrap && showAllWrap && showAllBtn) {
        tableWrap.classList.add("winter-rating__table-wrap--collapsed");
        showAllWrap.style.display = "";
        showAllBtn.textContent = "Ещё";
        showAllBtn.onclick = function () {
          var scrollTop = tableWrap && tableWrap.scrollTop != null ? tableWrap.scrollTop : 0;
          var docScrollTop = (document.scrollingElement && document.scrollingElement.scrollTop) || document.documentElement.scrollTop || 0;
          if (tableWrap.classList.contains("winter-rating__table-wrap--collapsed")) {
            tableWrap.classList.remove("winter-rating__table-wrap--collapsed");
            showAllBtn.textContent = "Свернуть";
          } else {
            tableWrap.classList.add("winter-rating__table-wrap--collapsed");
            showAllBtn.textContent = "Ещё";
          }
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              if (tableWrap && tableWrap.scrollTop !== scrollTop) tableWrap.scrollTop = scrollTop;
              var el = document.scrollingElement || document.documentElement;
              if (el && el.scrollTop !== docScrollTop) el.scrollTop = docScrollTop;
            });
          });
        };
      } else if (showAllWrap) {
        showAllWrap.style.display = "none";
      }
      if (searchInput && bodyEl) {
        searchInput.value = "";
        var doFilter = debounceRatingSearch(function () { filterTableByNick(bodyEl, searchInput.value, tableWrap, showAllBtn); }, 120);
        searchInput.oninput = doFilter;
        searchInput.onkeydown = function (e) {
          if (e.key === "Escape") { searchInput.value = ""; searchInput.blur(); filterTableByNick(bodyEl, "", tableWrap, showAllBtn); }
        };
      }
    }
    renderLeagueRows(1, league1Body);
    renderLeagueRows(2, league2Body);
    setupLeagueCollapse(league1Body, 1);
    setupLeagueCollapse(league2Body, 2);
  }
  function buildSpringTop3PodiumHtml(rowsForPodium, titleText) {
    if (!rowsForPodium || rowsForPodium.length < 3) return "";
    var top3 = [rowsForPodium[1], rowsForPodium[0], rowsForPodium[2]];
    var places = [2, 1, 3];
    var podiumHtml = titleText ? "<div class=\"spring-rating-top3__title\">" + escapeHtmlRating(titleText) + "</div>" : "";
    podiumHtml += "<div class=\"spring-rating-top3__podium\">";
    for (var pj = 0; pj < 3; pj++) {
      var r = top3[pj];
      var place = places[pj];
      var nickStr = r && r.nick != null ? String(r.nick) : "";
      var nickEsc = escapeHtmlRating(nickStr);
      var nickAttr = nickStr.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      var initial = nickStr.length ? nickStr.charAt(0).toUpperCase() : "?";
      var pointsStr = r && r.points != null ? String(r.points) : "0";
      var rewardStr = r && r.reward != null ? String(r.reward) : "0";
      var rewardFormatted = rewardStr + " ₽";
      var placeClass = place === 1 ? "spring-rating-top3__card--first" : "";
      podiumHtml += "<div class=\"spring-rating-top3__card " + placeClass + "\"><span class=\"spring-rating-top3__rank\">#" + place + "</span><div class=\"spring-rating-top3__avatar\" aria-hidden=\"true\">" + initial + "</div><span class=\"spring-rating-top3__nick\">" + nickEsc + "</span><div class=\"spring-rating-top3__stats\"><span class=\"spring-rating-top3__points\">" + pointsStr + " баллов</span><span class=\"spring-rating-top3__reward\">" + rewardFormatted + "</span></div><button type=\"button\" class=\"spring-rating-top3__nick-btn\" data-nick=\"" + nickAttr + "\" aria-label=\"Подробнее: " + nickEsc + "\"></button></div>";
    }
    podiumHtml += "</div>";
    return podiumHtml;
  }
  var podiumEl = document.getElementById("springRatingTop3Podium");
  var podiumLeague1El = document.getElementById("springRatingTop3PodiumLeague1");
  var podiumLeague2El = document.getElementById("springRatingTop3PodiumLeague2");
  if (podiumEl || podiumLeague1El || podiumLeague2El) {
    var sectionEl = document.getElementById("winterRatingSection");
    if (sectionEl && sectionEl.getAttribute("data-spring-top3-inited") !== "1") {
      sectionEl.setAttribute("data-spring-top3-inited", "1");
      sectionEl.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest && e.target.closest(".spring-rating-top3__nick-btn");
        if (btn && btn.dataset.nick && typeof openWinterRatingPlayerModal === "function") openWinterRatingPlayerModal(btn.dataset.nick);
      });
    }
    if (isSpringRatingMode()) {
      if (podiumEl) { podiumEl.setAttribute("hidden", ""); podiumEl.innerHTML = ""; }
      var league1Raw = [], league2Raw = [];
      try { league1Raw = getSpringRatingOverallByLeague(1); } catch (e) {}
      try { league2Raw = getSpringRatingOverallByLeague(2); } catch (e) {}
      var toPodiumRows = function (raw) {
        var list = [];
        for (var pi = 0; pi < raw.length && pi < 3; pi++) {
          var r = raw[pi];
          var rewardVal = r && r.reward != null ? Number(r.reward) : 0;
          list.push({ place: pi + 1, nick: r && r.nick != null ? String(r.nick) : "", points: r && r.points != null ? r.points : 0, reward: formatRewardRound(rewardVal) });
        }
        return list;
      };
      var rows1 = toPodiumRows(league1Raw), rows2 = toPodiumRows(league2Raw);
      if (podiumLeague1El) {
        if (rows1.length >= 3) {
          podiumLeague1El.removeAttribute("hidden");
          podiumLeague1El.innerHTML = buildSpringTop3PodiumHtml(rows1, "");
        } else { podiumLeague1El.setAttribute("hidden", ""); podiumLeague1El.innerHTML = ""; }
      }
      if (podiumLeague2El) {
        if (rows2.length >= 3) {
          podiumLeague2El.removeAttribute("hidden");
          podiumLeague2El.innerHTML = buildSpringTop3PodiumHtml(rows2, "");
        } else { podiumLeague2El.setAttribute("hidden", ""); podiumLeague2El.innerHTML = ""; }
      }
    } else {
      var rowsForPodium = rows;
      if (rowsForPodium.length >= 3 && podiumEl) {
        podiumEl.removeAttribute("hidden");
        podiumEl.innerHTML = buildSpringTop3PodiumHtml(rowsForPodium, "Рейтинг Зимы");
      } else if (podiumEl) {
        podiumEl.setAttribute("hidden", "");
        podiumEl.innerHTML = "";
      }
    }
  }
  if (tbody) {
    try {
      if (isSpringRatingMode() && rows.length === 0) {
        tbody.innerHTML = "<tr><td colspan=\"4\" class=\"winter-rating__spring-placeholder\"></td></tr>";
      } else {
        var htmlParts = [];
        for (var wi = 0; wi < rows.length; wi++) {
          var row = rows[wi];
          var place = row.place != null ? parseInt(row.place, 10) : wi + 1;
          if (place !== place) place = wi + 1;
          var trClass = winterRatingRowClass(place);
          var placeCell = winterRatingPlaceCell(place);
          var nickStr = row.nick != null ? String(row.nick) : "";
          var nickEsc = escapeHtmlRating(nickStr);
          var nickAttr = nickStr.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          htmlParts.push("<tr" + (trClass ? " class=\"" + trClass + "\"" : "") + "><td>" + placeCell + "</td><td><button type=\"button\" class=\"winter-rating__nick-btn\" data-nick=\"" + nickAttr + "\">" + nickEsc + "</button></td><td>" + (row.points != null ? row.points : "") + "</td><td>" + (row.reward != null ? row.reward : "0") + "</td></tr>");
        }
        tbody.innerHTML = htmlParts.join("");
      }
    } catch (e) {
      if (typeof console !== "undefined" && console.error) console.error("winter rating table render", e);
      tbody.innerHTML = "<tr><td colspan=\"4\">Ошибка отображения рейтинга</td></tr>";
    }
    tbody.addEventListener("click", function (e) {
      var btn = e.target && e.target.closest(".winter-rating__nick-btn");
      if (btn && btn.dataset.nick) openWinterRatingPlayerModal(btn.dataset.nick);
    });
    var tableWrap = document.getElementById("winterRatingTableWrap");
    var showAllWrap = document.getElementById("winterRatingShowAllWrap");
    var showAllBtn = document.getElementById("winterRatingShowAllBtn");
    if (rows.length > 10 && tableWrap && showAllWrap && showAllBtn) {
      tableWrap.classList.add("winter-rating__table-wrap--collapsed");
      showAllWrap.style.display = "";
      showAllBtn.textContent = "Ещё";
      showAllBtn.onclick = function () {
        var scrollTop = tableWrap && tableWrap.scrollTop != null ? tableWrap.scrollTop : 0;
        var docScrollTop = (document.scrollingElement && document.scrollingElement.scrollTop) || document.documentElement.scrollTop || 0;
        if (tableWrap.classList.contains("winter-rating__table-wrap--collapsed")) {
          tableWrap.classList.remove("winter-rating__table-wrap--collapsed");
          showAllBtn.textContent = "Свернуть";
        } else {
          tableWrap.classList.add("winter-rating__table-wrap--collapsed");
          showAllBtn.textContent = "Ещё";
        }
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            if (tableWrap && tableWrap.scrollTop !== scrollTop) tableWrap.scrollTop = scrollTop;
            var el = document.scrollingElement || document.documentElement;
            if (el && el.scrollTop !== docScrollTop) el.scrollTop = docScrollTop;
          });
        });
      };
    } else if (showAllWrap) {
      showAllWrap.style.display = "none";
    }
  }
  var winterSearchInput = document.getElementById("winterRatingSearchInput");
  var winterTableWrap = document.getElementById("winterRatingTableWrap");
  if (winterSearchInput && tbody) {
    var winterDoFilter = debounceRatingSearch(function () {
      filterTableByNick(tbody, winterSearchInput.value, winterTableWrap, document.getElementById("winterRatingShowAllBtn"));
    }, 120);
    winterSearchInput.addEventListener("input", winterDoFilter);
    winterSearchInput.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { winterSearchInput.value = ""; winterSearchInput.blur(); filterTableByNick(tbody, "", winterTableWrap, document.getElementById("winterRatingShowAllBtn")); }
    });
  }
  var datesContainer = document.getElementById("winterRatingDates");
  if (!datesContainer) return;
  var alreadyInited = datesContainer.getAttribute("data-rating-inited") === "1";
  if (!alreadyInited) {
    datesContainer.setAttribute("data-rating-inited", "1");
    datesContainer.addEventListener("click", function (e) {
      var cell = e.target && e.target.closest ? e.target.closest(".winter-rating__screenshot") : null;
      if (!cell) return;
      var screensWrap = cell.parentElement;
      if (!screensWrap || !screensWrap.classList || !screensWrap.classList.contains("winter-rating__screenshots")) return;
      var dateStr = screensWrap.getAttribute("data-rating-date");
      if (!dateStr) return;
      var leagueAttr = screensWrap.getAttribute("data-league");
      var leagueNum = leagueAttr === "1" || leagueAttr === "2" ? parseInt(leagueAttr, 10) : undefined;
      var siblings = screensWrap.querySelectorAll(".winter-rating__screenshot");
      var idx = Array.prototype.indexOf.call(siblings, cell);
      if (idx < 0) return;
      e.preventDefault();
      if (typeof openWinterRatingLightbox === "function") openWinterRatingLightbox(dateStr, idx, leagueNum);
    });
  }
  var dateItems = datesContainer.querySelectorAll(".winter-rating__date-item");
  var byDate = getRatingByDate();
  if (typeof byDate === "object" && Object.keys(byDate).length) {
    var dates = Object.keys(byDate).sort(function (a, b) {
      var pa = a.split("."), pb = b.split(".");
      var ka = (pa[2] || "") + (pa[1] || "") + (pa[0] || "");
      var kb = (pb[2] || "") + (pb[1] || "") + (pb[0] || "");
      return kb.localeCompare(ka);
    });
    var existingDates = Array.prototype.map.call(dateItems, function (it) { return it.getAttribute("data-rating-date"); });
    var missingDates = dates.filter(function (d) { return existingDates.indexOf(d) === -1; });
    if (missingDates.length) {
      var firstExisting = datesContainer.querySelector(".winter-rating__date-item");
      missingDates.forEach(function (dateStr) {
        var parts = dateStr.split(".");
        var slug = (parts[0] || "") + (parts[1] || "");
        var item = document.createElement("div");
        item.className = "winter-rating__date-item";
        item.setAttribute("data-rating-date", dateStr);
        var panelInner = isSpringRatingMode()
          ? "<div class=\"spring-rating-date-leagues\">" +
            "<div class=\"spring-rating-date-league-tabs\"><button type=\"button\" class=\"spring-rating-date-league-tab spring-rating-date-league-tab--active\" data-league=\"1\">Лига 1</button><button type=\"button\" class=\"spring-rating-date-league-tab\" data-league=\"2\">Лига 2</button></div>" +
            "<div class=\"spring-rating-date-league spring-rating-date-league--1\" data-league=\"1\">" +
            "<div class=\"winter-rating__screenshots\" data-rating-date=\"" + dateStr + "\" data-league=\"1\"></div>" +
            "<div class=\"winter-rating__date-tournaments-list\" data-rating-date=\"" + dateStr + "\" data-league=\"1\"></div>" +
            "<div class=\"winter-rating__date-table-wrap spring-rating-date-table\" data-rating-date=\"" + dateStr + "\" data-league=\"1\"></div></div>" +
            "<div class=\"spring-rating-date-league spring-rating-date-league--2\" data-league=\"2\" style=\"display:none\">" +
            "<div class=\"winter-rating__screenshots\" data-rating-date=\"" + dateStr + "\" data-league=\"2\"></div>" +
            "<div class=\"winter-rating__date-tournaments-list\" data-rating-date=\"" + dateStr + "\" data-league=\"2\"></div>" +
            "<div class=\"winter-rating__date-table-wrap spring-rating-date-table\" data-rating-date=\"" + dateStr + "\" data-league=\"2\"></div></div></div>"
          : "<div class=\"winter-rating__screenshots\" data-rating-date=\"" + dateStr + "\"></div><div class=\"winter-rating__date-table-wrap\" id=\"winterRatingDateTable" + slug + "\"></div>";
        var shareIcon = "<span class=\"winter-rating__share-icon\" aria-hidden=\"true\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg></span>";
        var shareHtml = "<div class=\"winter-rating__date-share\" data-rating-date=\"" + (dateStr || "") + "\"><button type=\"button\" class=\"winter-rating__share-btn winter-rating__share-btn--copy-icon winter-rating__date-share-btn\" aria-label=\"Скопировать ссылку на рейтинг за " + (dateStr || "") + "\">" + shareIcon + "</button></div>";
        item.innerHTML = "<button type=\"button\" class=\"winter-rating__date-btn\" aria-expanded=\"false\" aria-controls=\"winterRatingPanel" + slug + "\">" + dateStr + "</button>" +
          "<div class=\"winter-rating__date-panel winter-rating__date-panel--hidden\" id=\"winterRatingPanel" + slug + "\" role=\"region\" aria-label=\"Рейтинг на " + dateStr + "\">" + panelInner + shareHtml + "</div>";
        var insertBefore = null;
        for (var i = 0; i < dates.length; i++) {
          if (dates[i] === dateStr && i + 1 < dates.length) {
            var nextDate = dates[i + 1];
            var nextEl = datesContainer.querySelector(".winter-rating__date-item[data-rating-date=\"" + nextDate + "\"]");
            if (nextEl) { insertBefore = nextEl; break; }
          }
        }
        if (insertBefore) datesContainer.insertBefore(item, insertBefore);
        else datesContainer.appendChild(item);
      });
      dateItems = datesContainer.querySelectorAll(".winter-rating__date-item");
    }
  }
  dateItems.forEach(function (item) {
    try {
      var dateStr = item.getAttribute("data-rating-date");
      var btn = item.querySelector(".winter-rating__date-btn");
      var panel = item.querySelector(".winter-rating__date-panel");
      var leaguesWrap = panel && panel.querySelector(".spring-rating-date-leagues");
      var tableWrap = item.querySelector(".winter-rating__date-table-wrap:not(.spring-rating-date-table)");
      var screensContainer = item.querySelector(".winter-rating__screenshots:not([data-league])");
      if (!btn || !panel) return;
      function fillScreensForDate(container, dStr, leagueNum) {
        if (!container) return;
        var files = (leagueNum != null && isSpringRatingMode()) ? (getSpringRatingImagesByLeague(leagueNum)[dStr] || []) : getRatingImages()[dStr];
        if (!files || !files.length) return;
        var cacheV = "v=2";
        container.innerHTML = files.map(function (f, i) {
          return "<div class=\"winter-rating__screenshot\" role=\"button\" tabindex=\"0\"><img src=\"" + getAssetUrl(f) + "?" + cacheV + "\" alt=\"Скрин рейтинга " + dStr + " (" + (i + 1) + ")\" loading=\"lazy\" /></div>";
        }).join("");
        container.querySelectorAll(".winter-rating__screenshot").forEach(function (cell, idx) {
          var openLightbox = function (e) {
            if (e) e.preventDefault();
            openWinterRatingLightbox(dStr, idx, leagueNum);
          };
          cell.addEventListener("click", openLightbox);
          cell.addEventListener("keydown", function (e) {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLightbox(); }
          });
        });
      }
      if (leaguesWrap) {
        var tabs = leaguesWrap.querySelectorAll(".spring-rating-date-league-tab");
        var leagueBlocks = leaguesWrap.querySelectorAll(".spring-rating-date-league");
        [1, 2].forEach(function (leagueNum) {
          var block = leaguesWrap.querySelector(".spring-rating-date-league--" + leagueNum);
          if (!block) return;
          var screensEl = block.querySelector(".winter-rating__screenshots[data-league=\"" + leagueNum + "\"]");
          var tournamentsEl = block.querySelector(".winter-rating__date-tournaments-list[data-league=\"" + leagueNum + "\"]");
          var tableEl = block.querySelector(".winter-rating__date-table-wrap[data-league=\"" + leagueNum + "\"]");
          if (screensEl) fillScreensForDate(screensEl, dateStr, leagueNum);
          if (tournamentsEl) {
            var label = leagueNum === 1 ? "Лига 1. Турниры от 500₽" : "Лига 2. Турниры от 100₽ до 500₽";
            tournamentsEl.innerHTML = "<p class=\"winter-rating__date-tournaments-caption\">" + label + "</p>";
          }
          if (tableEl) {
            var rows = getSpringRatingRowsForDateLeague(dateStr, leagueNum);
            tableEl.innerHTML = rows && rows.length ? renderWinterRatingTable(rows) : "<p class=\"winter-rating__spring-placeholder\">Нет данных за эту дату</p>";
          }
        });
        if (leaguesWrap.getAttribute("data-tabs-bound") !== "1") {
          leaguesWrap.setAttribute("data-tabs-bound", "1");
          leaguesWrap.addEventListener("click", function (e) {
            var tab = e.target && e.target.closest ? e.target.closest(".spring-rating-date-league-tab") : null;
            if (!tab) return;
            e.preventDefault();
            e.stopPropagation();
            var league = tab.getAttribute("data-league");
            leaguesWrap.querySelectorAll(".spring-rating-date-league-tab").forEach(function (t) { t.classList.toggle("spring-rating-date-league-tab--active", t.getAttribute("data-league") === league); });
            leaguesWrap.querySelectorAll(".spring-rating-date-league").forEach(function (b) { b.style.display = b.getAttribute("data-league") === league ? "" : "none"; });
          });
        }
      } else {
        var data = getRatingByDate()[dateStr];
        if (data && data.length && tableWrap && !tableWrap.innerHTML) tableWrap.innerHTML = renderWinterRatingTable(data);
        if (screensContainer) fillScreensForDate(screensContainer, dateStr);
      }
      var shareWrap = panel.querySelector(".winter-rating__date-share");
      if (!shareWrap) {
        shareWrap = document.createElement("div");
        shareWrap.className = "winter-rating__date-share";
        shareWrap.setAttribute("data-rating-date", dateStr || "");
        var shareIcon = "<span class=\"winter-rating__share-icon\" aria-hidden=\"true\"><svg width=\"20\" height=\"20\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect x=\"9\" y=\"9\" width=\"13\" height=\"13\" rx=\"2\" ry=\"2\"/><path d=\"M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1\"/></svg></span>";
        shareWrap.innerHTML = "<button type=\"button\" class=\"winter-rating__share-btn winter-rating__share-btn--copy-icon winter-rating__date-share-btn\" aria-label=\"Скопировать ссылку на рейтинг за " + (dateStr || "") + "\">" + shareIcon + "</button>";
        panel.appendChild(shareWrap);
      }
      if (!alreadyInited) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var scrollY = window.scrollY || window.pageYOffset;
          panel.classList.toggle("winter-rating__date-panel--hidden");
          var open = !panel.classList.contains("winter-rating__date-panel--hidden");
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          if (open) {
            if (leaguesWrap) {
              [1, 2].forEach(function (leagueNum) {
                var block = leaguesWrap.querySelector(".spring-rating-date-league--" + leagueNum);
                if (!block) return;
                var screensEl = block.querySelector(".winter-rating__screenshots[data-league=\"" + leagueNum + "\"]");
                if (screensEl) fillScreensForDate(screensEl, dateStr, leagueNum);
              });
            } else if (screensContainer) fillScreensForDate(screensContainer, dateStr);
          }
          requestAnimationFrame(function () { window.scrollTo(0, scrollY); });
        });
      }
    } catch (err) {
      if (typeof console !== "undefined" && console.error) console.error("winter rating date item", err);
    }
  });
  var calendarWrap = document.getElementById("winterRatingCalendarWrap");
  if (calendarWrap && dateItems.length) {
    var availableDates = Array.prototype.map.call(dateItems, function (it) { return it.getAttribute("data-rating-date"); });
    var monthNames = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
    var monthSet = {};
    availableDates.forEach(function (d) {
      var p = d ? d.split(".") : [];
      if (p.length >= 3) {
        var y = parseInt(p[2], 10);
        var m = parseInt(p[1], 10);
        if (y && m) monthSet[y + "-" + (m < 10 ? "0" + m : m)] = { year: y, month: m };
      }
    });
    var availableMonths = Object.keys(monthSet).sort(function (a, b) {
      return b.localeCompare(a);
    }).map(function (k) { return monthSet[k]; });
    if (isSpringRatingMode()) {
      availableMonths = [{ year: 2026, month: 3 }];
      var springByDate = getSpringRatingTournamentsByDate();
      availableDates = typeof springByDate === "object" ? Object.keys(springByDate).filter(function (d) { return /\.03\.2026$/.test(d); }).sort(function (a, b) { return winterRatingDateKeyToStamp(b) - winterRatingDateKeyToStamp(a); }) : [];
    }
    if (!availableMonths.length) return;
    calendarWrap._availableMonths = availableMonths;
    calendarWrap._availableDates = availableDates;
    calendarWrap._calendarMonthIndex = typeof calendarWrap._calendarMonthIndex === "number" ? calendarWrap._calendarMonthIndex : 0;
    if (calendarWrap._calendarMonthIndex >= availableMonths.length) calendarWrap._calendarMonthIndex = availableMonths.length - 1;
    if (calendarWrap._calendarMonthIndex < 0) calendarWrap._calendarMonthIndex = 0;
    var dateModal = document.getElementById("winterRatingDateModal");
    var dateModalBackdrop = document.getElementById("winterRatingDateModalBackdrop");
    var dateModalClose = document.getElementById("winterRatingDateModalClose");
    var dateModalTitle = document.getElementById("winterRatingDateModalTitle");
    var dateModalBody = document.getElementById("winterRatingDateModalBody");
    function openDateModal(dateStr, panel) {
      if (!dateModal || !dateModalBody || !panel) return;
      dateModalBody.innerHTML = "";
      var clone = panel.cloneNode(true);
      clone.classList.remove("winter-rating__date-panel--hidden");
      dateModalBody.appendChild(clone);
      var cloneLeaguesWrap = clone.querySelector(".spring-rating-date-leagues");
      if (cloneLeaguesWrap) {
        cloneLeaguesWrap.addEventListener("click", function (e) {
          var tab = e.target && e.target.closest ? e.target.closest(".spring-rating-date-league-tab") : null;
          if (!tab) return;
          e.preventDefault();
          e.stopPropagation();
          var league = tab.getAttribute("data-league");
          cloneLeaguesWrap.querySelectorAll(".spring-rating-date-league-tab").forEach(function (t) { t.classList.toggle("spring-rating-date-league-tab--active", t.getAttribute("data-league") === league); });
          cloneLeaguesWrap.querySelectorAll(".spring-rating-date-league").forEach(function (b) { b.style.display = b.getAttribute("data-league") === league ? "" : "none"; });
        });
      }
      dateModalBody.querySelectorAll(".winter-rating__screenshot").forEach(function (cell) {
        var screensWrap = cell.parentElement;
        if (!screensWrap || !screensWrap.classList || !screensWrap.classList.contains("winter-rating__screenshots")) return;
        var dStr = screensWrap.getAttribute("data-rating-date") || dateStr;
        var leagueAttr = screensWrap.getAttribute("data-league");
        var leagueNum = leagueAttr === "1" || leagueAttr === "2" ? parseInt(leagueAttr, 10) : undefined;
        var siblings = screensWrap.querySelectorAll(".winter-rating__screenshot");
        var idx = Array.prototype.indexOf.call(siblings, cell);
        if (idx < 0 || typeof openWinterRatingLightbox !== "function") return;
        var handler = function (e) {
          if (e) e.preventDefault();
          openWinterRatingLightbox(dStr, idx, leagueNum);
        };
        cell.addEventListener("click", handler);
        cell.addEventListener("keydown", function (e) {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handler(); }
        });
      });
      if (dateModalTitle) dateModalTitle.textContent = "Рейтинг на " + dateStr;
      dateModal.setAttribute("aria-hidden", "false");
      if (document.body) document.body.style.overflow = "hidden";
    }
    function closeDateModal() {
      if (!dateModal) return;
      dateModal.setAttribute("aria-hidden", "true");
      if (document.body) document.body.style.overflow = "";
    }
    if (dateModalBackdrop) dateModalBackdrop.addEventListener("click", closeDateModal);
    if (dateModalClose) dateModalClose.addEventListener("click", closeDateModal);
    function renderCalendarMonth(monthIndex) {
      calendarWrap._calendarMonthIndex = monthIndex;
      var am = calendarWrap._availableMonths;
      var avail = calendarWrap._availableDates;
      if (monthIndex < 0 || monthIndex >= am.length) return;
      var yearNum = am[monthIndex].year;
      var monthNum = am[monthIndex].month;
      var monthLabel = (monthNames[monthNum - 1] || "") + " " + yearNum;
      var firstDay = new Date(yearNum, monthNum - 1, 1);
      var dow = firstDay.getDay();
      var monFirst = (dow + 6) % 7;
      var daysInMonth = new Date(yearNum, monthNum, 0).getDate();
      var cells = [];
      var i;
      for (i = 0; i < monFirst; i++) cells.push({ empty: true });
      for (i = 1; i <= daysInMonth; i++) {
        var d = i < 10 ? "0" + i : "" + i;
        var m = monthNum < 10 ? "0" + monthNum : "" + monthNum;
        var dateStr = d + "." + m + "." + yearNum;
        cells.push({ empty: false, day: i, dateStr: dateStr, hasData: avail.indexOf(dateStr) !== -1 });
      }
      var weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
      var headerRow = "<div class=\"winter-rating__calendar-weekdays\">" + weekdays.map(function (w) { return "<span class=\"winter-rating__calendar-wday\">" + w + "</span>"; }).join("") + "</div>";
      var rowHtml = "";
      var rowsHtml = "";
      for (i = 0; i < cells.length; i++) {
        if (i > 0 && i % 7 === 0) {
          rowsHtml += "<div class=\"winter-rating__calendar-row\">" + rowHtml + "</div>";
          rowHtml = "";
        }
        var cell = cells[i];
        if (cell.empty) {
          rowHtml += "<span class=\"winter-rating__calendar-cell winter-rating__calendar-cell--empty\"></span>";
        } else if (cell.hasData) {
          rowHtml += "<button type=\"button\" class=\"winter-rating__calendar-cell winter-rating__calendar-cell--day\" data-rating-date=\"" + cell.dateStr.replace(/"/g, "&quot;") + "\" aria-label=\"Рейтинг на " + cell.dateStr + "\">" + cell.day + "</button>";
        } else {
          rowHtml += "<span class=\"winter-rating__calendar-cell winter-rating__calendar-cell--no-data\" aria-hidden=\"true\">" + cell.day + "</span>";
        }
      }
      if (cells.length % 7 !== 0) {
        for (i = cells.length % 7; i < 7; i++) rowHtml += "<span class=\"winter-rating__calendar-cell winter-rating__calendar-cell--empty\"></span>";
      }
      rowsHtml += "<div class=\"winter-rating__calendar-row\">" + rowHtml + "</div>";
      var canPrev = monthIndex < am.length - 1;
      var canNext = monthIndex > 0;
      var prevBtn = "<button type=\"button\" class=\"winter-rating__calendar-nav winter-rating__calendar-nav--prev\" aria-label=\"Предыдущий месяц\"" + (canPrev ? "" : " disabled") + ">←</button>";
      var nextBtn = "<button type=\"button\" class=\"winter-rating__calendar-nav winter-rating__calendar-nav--next\" aria-label=\"Следующий месяц\"" + (canNext ? "" : " disabled") + ">→</button>";
      var titleRow = "<div class=\"winter-rating__calendar-title-row\">" + prevBtn + "<span class=\"winter-rating__calendar-title\">" + monthLabel + "</span>" + nextBtn + "</div>";
      calendarWrap.innerHTML = "<div class=\"winter-rating__calendar\">" + titleRow + headerRow + "<div class=\"winter-rating__calendar-grid\">" + rowsHtml + "</div></div>";
      calendarWrap.querySelectorAll(".winter-rating__calendar-cell--day").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          var dateStr = btn.getAttribute("data-rating-date");
          var item = datesContainer.querySelector(".winter-rating__date-item[data-rating-date=\"" + dateStr + "\"]");
          if (!item) return;
          var panel = item.querySelector(".winter-rating__date-panel");
          if (panel) openDateModal(dateStr, panel);
        });
      });
      var prevEl = calendarWrap.querySelector(".winter-rating__calendar-nav--prev");
      var nextEl = calendarWrap.querySelector(".winter-rating__calendar-nav--next");
      if (prevEl && canPrev) prevEl.addEventListener("click", function () { renderCalendarMonth(monthIndex + 1); });
      if (nextEl && canNext) nextEl.addEventListener("click", function () { renderCalendarMonth(monthIndex - 1); });
    }
    renderCalendarMonth(calendarWrap._calendarMonthIndex);
    calendarWrap.setAttribute("aria-hidden", "false");
  }
}

function fetchRaffleBadge() {
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base || !initData) return;
  fetch(base + "/api/raffles?initData=" + encodeURIComponent(initData))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok) {
        updateRaffleBadge(!!(data.activeRaffle));
        if (typeof window !== "undefined") window._rafflesCache = { data: data, time: Date.now() };
      }
    })
    .catch(function () {});
}

function updateProfileUserName() {
  var el = document.getElementById("profileUserName");
  if (!el) return;
  var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  el.textContent = user && user.first_name ? user.first_name : "гость";
  updateProfileUserMeta();
}

function updateProfileUserMeta() {
  var metaEl = document.getElementById("profileUserMeta");
  if (!metaEl) return;
  var parts = [];
  var dtId = (typeof sessionStorage !== "undefined" && sessionStorage.getItem("poker_dt_id")) || (typeof localStorage !== "undefined" && localStorage.getItem("poker_dt_id")) || "";
  if (dtId) parts.push("ID: " + dtId);
  var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
  var username = user && user.username ? user.username : "";
  if (username) parts.push("@" + username);
  if (parts.length) metaEl.textContent = " (" + parts.join(", ") + ")";
  else metaEl.textContent = "";
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
        var headerIdEl = document.getElementById("headerUserId");
        if (headerIdEl) headerIdEl.textContent = data.dtId;
        if (typeof updateProfileUserMeta === "function") updateProfileUserMeta();
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
      if (data && data.ok && data.personalInfo != null) {
        var personalInput = document.getElementById("profilePersonalInput");
        if (personalInput) personalInput.value = data.personalInfo;
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

function initProfilePersonal() {
  var textarea = document.getElementById("profilePersonalInput");
  var saveBtn = document.getElementById("profilePersonalSaveBtn");
  var feedback = document.getElementById("profilePersonalFeedback");
  if (!textarea || !saveBtn) return;
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (base && initData) {
    fetch(base + "/api/users?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.personalInfo != null) textarea.value = data.personalInfo;
      })
      .catch(function () {});
  }
  function savePersonal() {
    var val = (textarea.value || "").trim().slice(0, 500);
    if (!base || !initData) {
      if (feedback) { feedback.textContent = "Откройте в Telegram"; feedback.classList.add("profile-personal__feedback--visible"); setTimeout(function () { feedback.textContent = ""; feedback.classList.remove("profile-personal__feedback--visible"); }, 2500); }
      return;
    }
    saveBtn.disabled = true;
    fetch(base + "/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData, personalInfo: val }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        saveBtn.disabled = false;
        if (feedback) {
          feedback.textContent = data && data.ok ? "Сохранено" : (data && data.error) || "Ошибка";
          feedback.classList.add("profile-personal__feedback--visible");
          setTimeout(function () { feedback.textContent = ""; feedback.classList.remove("profile-personal__feedback--visible"); }, 2500);
        }
      })
      .catch(function () {
        saveBtn.disabled = false;
        if (feedback) { feedback.textContent = "Ошибка сети"; feedback.classList.add("profile-personal__feedback--visible"); setTimeout(function () { feedback.textContent = ""; feedback.classList.remove("profile-personal__feedback--visible"); }, 2500); }
      });
  }
  saveBtn.addEventListener("click", savePersonal);
}

function syncProfileStatusVisual() {
  var input = document.getElementById("profileStatusInput");
  var visual = document.getElementById("profileStatusVisual");
  if (!input || !visual) return;
  var val = Math.min(100, Math.max(0, parseInt(input.value, 10) || 0));
  visual.style.setProperty("--status-value", String(val));
}

function setProfileStatus(value) {
  var input = document.getElementById("profileStatusInput");
  var visual = document.getElementById("profileStatusVisual");
  if (!input || !visual) return;
  var val = Math.min(100, Math.max(0, parseInt(value, 10) || 0));
  input.value = val;
  visual.style.setProperty("--status-value", String(val));
}

function loadProfileRespect() {
  var el = document.getElementById("profileRespectValue");
  if (!el) return;
  var base = getApiBase();
  var initData = tg && tg.initData ? tg.initData : "";
  if (!base || !initData) { el.textContent = "\u2014"; return; }
  fetch(base + "/api/respect?initData=" + encodeURIComponent(initData))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      if (data && data.ok && data.score !== undefined) {
        el.textContent = data.score === 0 ? "\u2014" : String(data.score);
      } else {
        el.textContent = "\u2014";
      }
    })
    .catch(function () { el.textContent = "\u2014"; });
}

function initProfileFriends() {
  var btn = document.getElementById("profileFriendsBtn");
  var modal = document.getElementById("friendsListModal");
  var listEl = document.getElementById("friendsListModalList");
  if (!btn || !modal || !listEl) return;
  if (btn.dataset.friendsBound) return;
  btn.dataset.friendsBound = "1";
  function closeFriendsModal() {
    modal.setAttribute("aria-hidden", "true");
    modal.classList.remove("friends-list-modal--open");
  }
  var backdrop = modal.querySelector(".friends-list-modal__backdrop");
  var closeBtn = modal.querySelector(".friends-list-modal__close");
  if (backdrop) backdrop.addEventListener("click", closeFriendsModal);
  if (closeBtn) closeBtn.addEventListener("click", closeFriendsModal);
  btn.addEventListener("click", function () {
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) return;
    listEl.innerHTML = "<p class=\"friends-list-modal__loading\">Загрузка…</p>";
    modal.setAttribute("aria-hidden", "false");
    modal.classList.add("friends-list-modal--open");
    fetch(base + "/api/friends?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok || !Array.isArray(data.friends)) {
          listEl.innerHTML = "<p class=\"friends-list-modal__empty\">Ошибка загрузки</p>";
          return;
        }
        if (data.friends.length === 0) {
          listEl.innerHTML = "<p class=\"friends-list-modal__empty\">Пока нет друзей</p>";
          return;
        }
        listEl.innerHTML = data.friends.map(function (f) {
          var name = (f.userName || f.userId || "Игрок").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
          var id = (f.userId || "").replace(/"/g, "&quot;");
          return "<a href=\"#\" class=\"friends-list-modal__item\" data-user-id=\"" + id + "\" data-user-name=\"" + name + "\">" + name + " <span class=\"friends-list-modal__item-action\">Написать</span></a>";
        }).join("");
        listEl.querySelectorAll(".friends-list-modal__item").forEach(function (item) {
          item.addEventListener("click", function (e) {
            e.preventDefault();
            var id = item.dataset.userId;
            var name = item.dataset.userName;
            if (id && typeof window.openChatUserModalById === "function") {
              closeFriendsModal();
              window.openChatUserModalById(id, name);
            }
          });
        });
      })
      .catch(function () {
        listEl.innerHTML = "<p class=\"friends-list-modal__empty\">Ошибка сети</p>";
      });
  });
}

function initPokerShowsPlayer() {
  var iframe = document.getElementById("pokerShowsIframe");
  var tabs = document.querySelectorAll(".home-poker-shows__tab[data-poker-show]");
  if (!iframe || !tabs.length) return;
  var playlists = {
    afterdark: "PL2bAZuFpadxGdQdaYJuSUtw9JFgsMB8YV",
    highstakes: "PLzjpJOumIPMiQQhiCWYlawTFz7LNKPino"
  };
  tabs.forEach(function (tab) {
    if (tab.dataset.pokerShowsBound) return;
    tab.dataset.pokerShowsBound = "1";
    tab.addEventListener("click", function () {
      var show = tab.getAttribute("data-poker-show");
      var listId = playlists[show];
      if (!listId) return;
      iframe.src = "https://www.youtube.com/embed/videoseries?list=" + listId + "&rel=0";
      tabs.forEach(function (t) {
        t.classList.toggle("home-poker-shows__tab--active", t === tab);
        t.setAttribute("aria-pressed", t === tab ? "true" : "false");
      });
    });
  });
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

// Стримы: трансляция экрана и микрофона в реальном времени (PeerJS). Задержка 2 мин — отдельный сервер.
var streamsBroadcastPeer = null;
var streamsBroadcastStream = null;
var streamsWatchPeer = null;
var streamsWatchCall = null;

function randomStreamRoomId() {
  return Math.random().toString(36).slice(2, 8);
}

function getStreamsAppUrl() {
  var app = document.getElementById("app");
  if (app && app.getAttribute("data-telegram-app-url")) return app.getAttribute("data-telegram-app-url");
  return window.location.origin + window.location.pathname;
}

function streamsCleanup() {
  if (streamsBroadcastStream) {
    streamsBroadcastStream.getTracks().forEach(function (t) { t.stop(); });
    streamsBroadcastStream = null;
  }
  if (streamsBroadcastPeer) {
    try { streamsBroadcastPeer.destroy(); } catch (e) {}
    streamsBroadcastPeer = null;
  }
  if (streamsWatchCall) {
    try { streamsWatchCall.close(); } catch (e) {}
    streamsWatchCall = null;
  }
  if (streamsWatchPeer) {
    try { streamsWatchPeer.destroy(); } catch (e) {}
    streamsWatchPeer = null;
  }
  var previewWrap = document.getElementById("streamsPreviewWrap");
  var previewVideo = document.getElementById("streamsPreviewVideo");
  var remoteWrap = document.getElementById("streamsRemoteWrap");
  var remoteVideo = document.getElementById("streamsRemoteVideo");
  if (previewWrap) previewWrap.classList.add("streams-preview-wrap--hidden");
  if (previewVideo) previewVideo.srcObject = null;
  if (remoteWrap) remoteWrap.classList.add("streams-remote-wrap--hidden");
  if (remoteVideo) remoteVideo.srcObject = null;
}

function initStreams() {
  var startBtn = document.getElementById("streamsStartBtn");
  var stopBtn = document.getElementById("streamsStopBtn");
  var previewWrap = document.getElementById("streamsPreviewWrap");
  var previewVideo = document.getElementById("streamsPreviewVideo");
  var shareLinkInput = document.getElementById("streamsShareLink");
  var copyLinkBtn = document.getElementById("streamsCopyLinkBtn");
  var browserLinkInput = document.getElementById("streamsBrowserLinkInput");
  var copyBrowserLinkBtn = document.getElementById("streamsCopyBrowserLinkBtn");
  var openBrowserBtn = document.getElementById("streamsOpenBrowserBtn");
  var roomInput = document.getElementById("streamsRoomInput");
  var watchBtn = document.getElementById("streamsWatchBtn");
  var stopWatchBtn = document.getElementById("streamsStopWatchBtn");
  var remoteWrap = document.getElementById("streamsRemoteWrap");
  var remoteVideo = document.getElementById("streamsRemoteVideo");
  var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

  if (!startBtn || !previewWrap || !previewVideo) return;

  function showAlert(msg) {
    if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
  }

  var directAppUrl = window.location.origin + window.location.pathname + (window.location.search || "") + "#streams";
  if (browserLinkInput) browserLinkInput.value = directAppUrl;
  if (openBrowserBtn) {
    openBrowserBtn.addEventListener("click", function () {
      if (tg && tg.openLink) {
        tg.openLink(directAppUrl);
      } else {
        window.open(directAppUrl, "_blank", "noopener");
      }
    });
  }
  if (copyBrowserLinkBtn && browserLinkInput) {
    copyBrowserLinkBtn.addEventListener("click", function () {
      browserLinkInput.select();
      try {
        document.execCommand("copy");
        showAlert("Ссылка скопирована. Вставьте её в адресную строку Chrome и откройте.");
      } catch (e) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(browserLinkInput.value).then(function () {
            showAlert("Ссылка скопирована. Вставьте её в адресную строку Chrome и откройте.");
          }).catch(function () {});
        }
      }
    });
  }

  startBtn.addEventListener("click", function () {
    if (streamsBroadcastPeer || streamsBroadcastStream) return;
    if (!navigator.mediaDevices) {
      showAlert("Трансляция недоступна: нет доступа к медиа-устройствам.");
      return;
    }
    var getDisplayMedia = navigator.mediaDevices.getDisplayMedia || navigator.mediaDevices.webkitGetDisplayMedia;
    if (!getDisplayMedia) {
      showAlert("Трансляция экрана недоступна в Safari и в приложении Telegram. Откройте мини-приложение в Chrome (Android) или в браузере на компьютере.");
      return;
    }
    if (!window.isSecureContext) {
      showAlert("Трансляция экрана работает только по HTTPS. Откройте страницу по ссылке https://…");
      return;
    }
    startBtn.disabled = true;
    var btnText = startBtn.textContent;
    startBtn.textContent = "Запрос доступа к экрану…";
    var combinedStream = new MediaStream();
    getDisplayMedia.call(navigator.mediaDevices, { video: true, audio: false })
      .then(function (screenStream) {
        screenStream.getVideoTracks().forEach(function (t) { combinedStream.addTrack(t); });
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (micStream) {
          micStream.getAudioTracks().forEach(function (t) { combinedStream.addTrack(t); });
          return combinedStream;
        }).catch(function () { return combinedStream; });
      })
      .catch(function () {
        return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (micStream) {
          micStream.getAudioTracks().forEach(function (t) { combinedStream.addTrack(t); });
          return getDisplayMedia.call(navigator.mediaDevices, { video: true }).then(function (screenStream) {
            screenStream.getVideoTracks().forEach(function (t) { combinedStream.addTrack(t); });
            return combinedStream;
          });
        });
      })
      .then(function (stream) {
        streamsBroadcastStream = stream;
        var roomId = randomStreamRoomId();
        var PeerJs = typeof Peer !== "undefined" ? Peer : null;
        if (!PeerJs) {
          streamsBroadcastStream.getTracks().forEach(function (t) { t.stop(); });
          streamsBroadcastStream = null;
          startBtn.disabled = false;
          startBtn.textContent = btnText;
          showAlert("Библиотека PeerJS не загружена. Проверьте интернет и обновите страницу.");
          return;
        }
        var peer = new PeerJs(roomId, { debug: 0 });
        streamsBroadcastPeer = peer;
        peer.on("open", function () {
          var appUrl = getStreamsAppUrl();
          var link = appUrl + (appUrl.indexOf("?") >= 0 ? "&" : "?") + "startapp=streams_" + roomId;
          if (shareLinkInput) shareLinkInput.value = link;
          if (roomInput) roomInput.placeholder = roomId;
          previewVideo.srcObject = streamsBroadcastStream;
          previewWrap.classList.remove("streams-preview-wrap--hidden");
          startBtn.disabled = false;
          startBtn.textContent = btnText;
        });
        peer.on("call", function (call) {
          if (streamsBroadcastStream) call.answer(streamsBroadcastStream);
        });
        peer.on("error", function (err) {
          if (err.type !== "peer-unavailable") showAlert("Ошибка: " + (err.message || err.type || "сеть"));
        });
        peer.on("close", function () {
          if (streamsBroadcastStream) {
            streamsBroadcastStream.getTracks().forEach(function (t) { t.stop(); });
            streamsBroadcastStream = null;
          }
          streamsBroadcastPeer = null;
          previewWrap.classList.add("streams-preview-wrap--hidden");
          previewVideo.srcObject = null;
        });
      })
      .catch(function (err) {
        startBtn.disabled = false;
        startBtn.textContent = btnText;
        var msg = "Не удалось запустить трансляцию. Разрешите доступ к экрану и микрофону.";
        if (err && (err.name === "NotAllowedError" || err.name === "PermissionDeniedError")) {
          msg = "Доступ к экрану отклонён. Нажмите «Запустить» снова и выберите экран или вкладку в окне браузера.";
        } else if (err && err.name === "NotFoundError") {
          msg = "Не найден источник для трансляции. Выберите вкладку или окно в диалоге браузера.";
        } else if (err) {
          msg = "Ошибка: " + (err.message || err.name || "неизвестная");
        }
        showAlert(msg);
      });
  });

  if (stopBtn) {
    stopBtn.addEventListener("click", function () {
      if (streamsBroadcastStream) streamsBroadcastStream.getTracks().forEach(function (t) { t.stop(); });
      streamsBroadcastStream = null;
      if (streamsBroadcastPeer) {
        try { streamsBroadcastPeer.destroy(); } catch (e) {}
        streamsBroadcastPeer = null;
      }
      previewWrap.classList.add("streams-preview-wrap--hidden");
      previewVideo.srcObject = null;
    });
  }

  if (copyLinkBtn && shareLinkInput) {
    copyLinkBtn.addEventListener("click", function () {
      shareLinkInput.select();
      try {
        document.execCommand("copy");
        showAlert("Ссылка скопирована");
      } catch (e) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(shareLinkInput.value).then(function () { showAlert("Ссылка скопирована"); }).catch(function () {});
        }
      }
    });
  }

  function parseRoomIdFromInput(val) {
    if (!val || !val.trim()) return null;
    val = val.trim();
    var m = val.match(/startapp=streams_([a-z0-9]+)/i) || val.match(/[?&]room=([a-z0-9]+)/i) || val.match(/#([a-z0-9]+)$/);
    if (m) return m[1];
    if (/^[a-z0-9]{4,10}$/i.test(val)) return val;
    return null;
  }

  if (watchBtn && roomInput && remoteWrap && remoteVideo) {
    watchBtn.addEventListener("click", function () {
      var roomId = parseRoomIdFromInput(roomInput.value);
      if (!roomId) {
        showAlert("Введите код комнаты или ссылку от ведущего.");
        return;
      }
      if (streamsWatchPeer) return;
      var PeerJs = typeof Peer !== "undefined" ? Peer : null;
      if (!PeerJs) {
        showAlert("Библиотека PeerJS не загружена.");
        return;
      }
      watchBtn.disabled = true;
      var peer = new PeerJs({ debug: 0 });
      streamsWatchPeer = peer;
      peer.on("open", function () {
        var call = peer.call(roomId, new MediaStream());
        streamsWatchCall = call;
        call.on("stream", function (stream) {
          remoteVideo.srcObject = stream;
          remoteWrap.classList.remove("streams-remote-wrap--hidden");
          watchBtn.disabled = false;
        });
        call.on("close", function () {
          remoteWrap.classList.add("streams-remote-wrap--hidden");
          remoteVideo.srcObject = null;
          streamsWatchCall = null;
          watchBtn.disabled = false;
        });
        call.on("error", function () {
          remoteWrap.classList.add("streams-remote-wrap--hidden");
          watchBtn.disabled = false;
          streamsWatchCall = null;
        });
      });
      peer.on("error", function (err) {
        if (err.type === "peer-unavailable" || err.type === "network") showAlert("Трансляция недоступна. Проверьте код комнаты.");
        else showAlert("Ошибка: " + (err.message || err.type || "сеть"));
        watchBtn.disabled = false;
        streamsWatchPeer = null;
      });
    });

    if (stopWatchBtn) {
      stopWatchBtn.addEventListener("click", function () {
        if (streamsWatchCall) {
          try { streamsWatchCall.close(); } catch (e) {}
          streamsWatchCall = null;
        }
        if (streamsWatchPeer) {
          try { streamsWatchPeer.destroy(); } catch (e) {}
          streamsWatchPeer = null;
        }
        remoteVideo.srcObject = null;
        remoteWrap.classList.add("streams-remote-wrap--hidden");
      });
    }
  }
}

navItems.forEach(function (item) {
  item.addEventListener("click", function (e) {
    if (window.__touchWasScroll && window.__touchWasScroll()) {
      e.preventDefault();
      return;
    }
    var target = item.dataset.viewTarget;
    if (target) {
      setView(target);
      if (target === "download") setDownloadPage("main");
    }
  });
});

document.addEventListener("click", function (e) {
  var interactive = e.target.closest("button, a[href], .feature--link, .home-mini-icon-item, .hero__link, .bottom-nav__item, [data-view-target], .feature, [role=\"button\"]");
  if (interactive && !e.target.closest("audio, [aria-hidden=\"true\"]")) playClickSound();
}, true);

(function scrollVsTap() {
  var touchStartX = 0;
  var touchStartY = 0;
  var touchMoved = false;
  var scrollThreshold = 12;
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchMoved = false;
    }
  }, { passive: true });
  document.addEventListener("touchmove", function (e) {
    if (e.touches.length && !touchMoved) {
      var dx = e.touches[0].clientX - touchStartX;
      var dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > scrollThreshold || Math.abs(dy) > scrollThreshold) touchMoved = true;
    }
  }, { passive: true });
  window.__touchWasScroll = function () { return touchMoved; };
  document.addEventListener("touchend", function () {
    setTimeout(function () { touchMoved = false; }, 0);
  }, { passive: true });
})();

var viewHandledInTouchend = false;

function handleViewLinkClick(e) {
  if (e.target && e.target.closest && e.target.closest("#chatDialogsView")) return;
  if (viewHandledInTouchend) {
    viewHandledInTouchend = false;
    e.preventDefault();
    return;
  }
  if (window.__touchWasScroll && window.__touchWasScroll()) {
    e.preventDefault();
    return;
  }
  var springBtn = e.target.closest("#springRatingInfoBtn");
  if (springBtn) {
    e.preventDefault();
    e.stopPropagation();
    openSpringRatingInfoModal();
    return;
  }
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
}

document.addEventListener("click", handleViewLinkClick);

document.addEventListener("touchend", function (e) {
  var link = e.target.closest("a[data-view-target]");
  if (!link || link.getAttribute("data-download-page")) return;
  if (window.__touchWasScroll && window.__touchWasScroll()) return;
  e.preventDefault();
  var view = link.getAttribute("data-view-target");
  if (view) {
    viewHandledInTouchend = true;
    setView(view);
  }
}, { passive: false });

document.addEventListener("click", function (e) {
  var link = e.target.closest("[data-view-target][data-download-page]");
  if (!link) return;
  e.preventDefault();
  var view = link.getAttribute("data-view-target");
  var page = link.getAttribute("data-download-page");
  if (view) setView(view);
  if (page) setDownloadPage(page);
});

document.addEventListener("click", function (e) {
  var btn = e.target && e.target.closest ? e.target.closest("#pokerTasksStartBtn") : null;
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  if (typeof window.startMttChallenge === "function") {
    window.startMttChallenge();
  } else {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.showAlert) tg.showAlert("Задачи ещё загружаются. Обновите страницу."); else alert("Задачи ещё загружаются. Обновите страницу.");
  }
}, true);

document.addEventListener("click", function (e) {
  var trainingBtn = e.target && e.target.closest ? e.target.closest(".learn-play-hub__training-btn") : null;
  if (trainingBtn) {
    var href = trainingBtn.getAttribute("href");
    if (href && href.indexOf("t.me") !== -1) {
      e.preventDefault();
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(href);
      else if (tg && tg.openLink) tg.openLink(href);
      else window.open(href, "_blank", "noopener,noreferrer");
    }
    return;
  }
  var attachment = e.target && e.target.closest ? e.target.closest(".video-lessons__attachment") : null;
  if (attachment) {
    var href = attachment.getAttribute("href");
    if (href) {
      e.preventDefault();
      var url = href.indexOf("http") === 0 ? href : (function () { try { return new URL(href, window.location.href).href; } catch (err) { return href; } })();
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openLink) tg.openLink(url);
      else window.open(url, "_blank", "noopener,noreferrer");
    }
    return;
  }
  var item = e.target && e.target.closest ? e.target.closest(".video-lessons__item") : null;
  if (!item) return;
  e.preventDefault();
  var card = item.closest(".video-lessons__card");
  var playerWrap = card ? card.querySelector(".video-lessons__player-wrap") : null;
  if (!card || !playerWrap) return;
  var isOpen = !playerWrap.classList.contains("video-lessons__player-wrap--hidden");
  document.querySelectorAll(".video-lessons__player-wrap").forEach(function (w) {
    w.classList.add("video-lessons__player-wrap--hidden");
  });
  document.querySelectorAll(".video-lessons__item[aria-expanded]").forEach(function (btn) {
    btn.setAttribute("aria-expanded", "false");
  });
  document.querySelectorAll(".video-lessons__card--open").forEach(function (c) {
    c.classList.remove("video-lessons__card--open");
  });
  if (!isOpen) {
    playerWrap.classList.remove("video-lessons__player-wrap--hidden");
    item.setAttribute("aria-expanded", "true");
    card.classList.add("video-lessons__card--open");
    var url = item.getAttribute("data-video-url");
    if (url && url !== "#") {
      var iframe = playerWrap.querySelector(".video-lessons__iframe[data-video-src]");
      if (iframe && !iframe.src) iframe.src = iframe.getAttribute("data-video-src") || url;
    }
  }
});

function initVideoLessons() {}

(function initChillRadio() {
  var radio = document.getElementById("chillRadio");
  if (!radio) return;
  function tryPlay() {
    tryChillRadioPlay();
  }
  document.addEventListener("click", tryPlay, { once: true, passive: true });
  document.addEventListener("touchstart", tryPlay, { once: true, passive: true });
  tryChillRadioPlay();
})();

// Модалка «Предсказание на день»
function openDailyPredictionModal() {
  var modal = document.getElementById("dailyPredictionModal");
  if (!modal) return;
  var textEl = document.getElementById("dailyPredictionText");
  if (textEl) {
    textEl.textContent = getPokerDailyPredictionForToday();
  }
  markDailyPredictionRead();
  updateDailyPredictionBadge();
  modal.setAttribute("aria-hidden", "false");
  modal.classList.add("daily-prediction-modal--open");
   startDailyPredictionTimer();
  if (document.body) document.body.style.overflow = "hidden";
}

function closeDailyPredictionModal() {
  var modal = document.getElementById("dailyPredictionModal");
  if (!modal) return;
  modal.setAttribute("aria-hidden", "true");
  modal.classList.remove("daily-prediction-modal--open");
  stopDailyPredictionTimer();
  if (document.body) document.body.style.overflow = "";
}

(function initDailyPredictionModal() {
  var btn = document.getElementById("dailyPredictionBtn");
  var modal = document.getElementById("dailyPredictionModal");
  if (!btn || !modal) return;
  var closeBtn = modal.querySelector(".daily-prediction-modal__close");
  var backdrop = modal.querySelector(".daily-prediction-modal__backdrop");
  var shareBtn = document.getElementById("dailyPredictionShareBtn");
  btn.addEventListener("click", function (e) {
    e.preventDefault();
    openDailyPredictionModal();
  });
  if (closeBtn) closeBtn.addEventListener("click", function () { closeDailyPredictionModal(); });
  if (backdrop) backdrop.addEventListener("click", function () { closeDailyPredictionModal(); });
  if (shareBtn && !shareBtn._bound) {
    shareBtn._bound = true;
    shareBtn.addEventListener("click", function () {
      var predictionTextEl = document.getElementById("dailyPredictionText");
      var prediction = predictionTextEl ? predictionTextEl.textContent.trim() : "";
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var link = appUrl + "?startapp=daily_prediction";
      var shortText = "Моё покерное предсказание на сегодня:";
      if (prediction) shortText += "\n\n" + prediction;
      shortText += "\n\nПосмотрите своё предсказание здесь —\n" + link;
      var shareUrl = "https://t.me/share/url?url=&text=" + encodeURIComponent(shortText);
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openTelegramLink) {
        tg.openTelegramLink(shareUrl);
      } else if (tg && tg.openLink) {
        tg.openLink(shareUrl);
      } else {
        window.open(shareUrl, "_blank");
      }
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("daily_prediction");
    });
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && modal.getAttribute("aria-hidden") === "false") closeDailyPredictionModal();
  });
  // Обновляем бейдж при инициализации
  updateDailyPredictionBadge();
})(); 

(function initChatNavDropdown() {
  window.closeChatNavDropdown = function () {};
})();

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
  if (flush && straight) score = 11000000000 + (wheel ? 0 : sorted[4]) * 1e7;
  else if (quads) score = 10000000000 + quadRank * 1e8 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e6;
  else if (set && pairCount >= 1) score = 9000000000 + setRank * 1e8 + pairRank * 1e6;
  else if (flush) score = 8000000000 + ranks[0] * 1e7 + ranks[1] * 1e5 + ranks[2] * 1e3 + ranks[3] * 10 + ranks[4];
  else if (straight) score = 7000000000 + (wheel ? 0 : sorted[4]) * 1e7;
  else if (set) score = 6000000000 + setRank * 1e8 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e6 + (kickers[1] !== undefined ? kickers[1] : 0) * 1e4;
  else if (pairCount === 2) score = 4000000000 + Math.max(pairRank, pairRank2) * 1e8 + Math.min(pairRank, pairRank2) * 1e6 + (kickers[0] !== undefined ? kickers[0] : 0) * 1e4;
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

var PLASTERER_RANK_DISPLAY = { "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "T": "10", "J": "J", "Q": "Q", "K": "K", "A": "A" };

function plastererSuitToKey(suitCh) {
  return suitCh === "\u2660" ? "s" : suitCh === "\u2665" ? "h" : suitCh === "\u2666" ? "d" : suitCh === "\u2663" ? "c" : "";
}

function renderPlastererCardBack() {
  return "<div class=\"equilator-card-slot plasterer-card\"><span class=\"equilator-card-slot__text\">—</span></div>";
}

function renderPlastererCard(card) {
  if (!card || card.length < 2) return "";
  var rankCh = card.charAt(0);
  var suitCh = card.charAt(1);
  var suitKey = plastererSuitToKey(suitCh);
  if (!suitKey) return "";
  var rank = rankCh;
  var label = (PLASTERER_RANK_DISPLAY[rank] || rank) + suitCh;
  var suitClass = suitKey === "s" ? "equilator-card-slot--spade" : suitKey === "h" ? "equilator-card-slot--heart" : suitKey === "d" ? "equilator-card-slot--diamond" : "equilator-card-slot--club";
  return "<div class=\"equilator-card-slot plasterer-card " + suitClass + "\" data-rank=\"" + rank.replace(/"/g, "&quot;") + "\" data-suit=\"" + suitKey + "\"><span class=\"equilator-card-slot__text\">" + label.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</span></div>";
}

function renderPlastererCards(containerId, cards, showBacks) {
  var el = document.getElementById(containerId);
  if (!el) return;
  if (showBacks && cards.length > 0) {
    el.innerHTML = Array(cards.length).fill(0).map(function () { return renderPlastererCardBack(); }).join("");
  } else {
    el.innerHTML = cards.map(function (c) { return renderPlastererCard(c); }).join("");
  }
}

function initPlastererGame() {
  var nameEl = document.getElementById("plastererPlayerName");
  if (nameEl) {
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    var user = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
    nameEl.textContent = user && user.first_name ? user.first_name : "Вы";
  }
  plastererAttemptCount = 0;
  dealPlastererHands();
  renderPlastererCards("plastererOpponentCards", plastererOpponentHand, true);
  renderPlastererCards("plastererPlayerCards", plastererPlayerHand, true);
  plastererBoardStep = 0;
  ["plastererFlop0", "plastererFlop1", "plastererFlop2", "plastererTurn", "plastererRiver"].forEach(function (id) {
    var slot = document.getElementById(id);
    if (slot) { slot.innerHTML = ""; slot.classList.remove("has-card"); }
  });
  var resultEl = document.getElementById("plastererResult");
  if (resultEl) { resultEl.textContent = ""; resultEl.className = "plasterer-result"; }
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
  renderPlastererCards("plastererOpponentCards", plastererOpponentHand, false);
  renderPlastererCards("plastererPlayerCards", plastererPlayerHand, false);
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
    renderPlastererCards("plastererOpponentCards", plastererOpponentHand, false);
    renderPlastererCards("plastererPlayerCards", plastererPlayerHand, false);
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
  var rafflesSubscribeBtn = document.getElementById("rafflesSubscribeBtn");
  var adminWrap = document.getElementById("rafflesAdminWrap");
  var raffleAdminActions = document.getElementById("raffleAdminActions");
  var createToggle = document.getElementById("rafflesCreateToggle");
  var createForm = document.getElementById("raffleCreateForm");
  var raffleTypeTickets = document.getElementById("raffleTypeTickets");
  var raffleTypeOther = document.getElementById("raffleTypeOther");
  var raffleCreatePanelTickets = document.getElementById("raffleCreatePanelTickets");
  var raffleCreatePanelOther = document.getElementById("raffleCreatePanelOther");
  var raffleTicketGroupCount = document.getElementById("raffleTicketGroupCount");
  var raffleTicketWinnersWrap = document.getElementById("raffleTicketWinnersWrap");
  var raffleTicketSingleWinnersLabel = document.getElementById("raffleTicketSingleWinnersLabel");
  var raffleTicketWinnersCount = document.getElementById("raffleTicketWinnersCount");
  var raffleTicketGroups = document.getElementById("raffleTicketGroups");
  var raffleTicketTournamentSelect = document.getElementById("raffleTicketTournamentSelect");
  var raffleCreateTotal = document.getElementById("raffleCreateTotal");
  var raffleEndDateInput = document.getElementById("raffleEndDate");
  var groupCountInput = document.getElementById("raffleGroupCount");
  var raffleGroupsEl = document.getElementById("raffleGroups");
  var raffleEndDateOther = document.getElementById("raffleEndDateOther");
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
  var raffleCompleteBtn = document.getElementById("raffleCompleteBtn");
  var raffleCancelBtn = document.getElementById("raffleCancelBtn");
  var raffleDeleteBtn = document.getElementById("raffleDeleteBtn");
  var raffleStatWinners = document.getElementById("raffleStatWinners");
  var raffleStatPrize = document.getElementById("raffleStatPrize");
  var raffleStatPrizeValue = document.getElementById("raffleStatPrizeValue");
  var raffleStatGroups = document.getElementById("raffleStatGroups");
  var raffleEnd = document.getElementById("raffleEnd");
  var rafflePrizes = document.getElementById("rafflePrizes");
  var raffleJoinBtn = document.getElementById("raffleJoinBtn");
  var raffleLeaveBtn = document.getElementById("raffleLeaveBtn");
  var raffleJoinedMsg = document.getElementById("raffleJoinedMsg");
  var raffleParticipantsCount = document.getElementById("raffleParticipantsCount");
  var raffleParticipantsChance = document.getElementById("raffleParticipantsChance");
  var raffleParticipants = document.getElementById("raffleParticipants");
  var raffleWinnersWrap = document.getElementById("raffleWinnersWrap");
  var raffleWinners = document.getElementById("raffleWinners");
  var raffleInviteFriendInlineBtn = document.getElementById("raffleInviteFriendInlineBtn");
  var rafflesNotifySubsBtn = document.getElementById("rafflesNotifySubsBtn");
  var rafflesNotifySubsHint = document.getElementById("rafflesNotifySubsHint");
  var currentRaffleId = null;
  var currentRaffleEndDate = null;
  var currentRaffleData = null;
  var raffleTimerInterval = null;
  var rafflesIsAdmin = false;
  var myRaffleUserId = null;

  // Подписка на уведомления о новых розыгрышах
  (function initRafflesSubscribe() {
    if (!rafflesSubscribeBtn) return;
    var RAFFLE_SUBSCRIBED_KEY = "poker_raffles_subscribed";
    function setRaffleSubscribeState(subscribed) {
      rafflesSubscribeBtn.disabled = false;
      rafflesSubscribeBtn.textContent = subscribed ? "Отписаться" : "Подписаться";
      rafflesSubscribeBtn.dataset.subscribed = subscribed ? "1" : "0";
    }
    try {
      setRaffleSubscribeState(localStorage.getItem(RAFFLE_SUBSCRIBED_KEY) === "1");
    } catch (e) {
      setRaffleSubscribeState(false);
    }
    rafflesSubscribeBtn.addEventListener("click", function () {
      var tgLocal = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      var init = tgLocal && tgLocal.initData ? tgLocal.initData : initData;
      var baseUrl = getApiBase();
      if (!init || !baseUrl) {
        if (tgLocal && tgLocal.showAlert) {
          tgLocal.showAlert("Откройте приложение в Telegram, чтобы подписаться.");
        } else {
          alert("Откройте приложение в Telegram, чтобы подписаться.");
        }
        return;
      }
      var subscribed = rafflesSubscribeBtn.dataset.subscribed === "1";
      rafflesSubscribeBtn.disabled = true;
      fetch(baseUrl.replace(/\/$/, "") + "/api/raffle-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: init, unsubscribe: subscribed }),
      })
        .then(function (r) {
          return r.json().catch(function () {
            return { ok: false, error: "Ошибка ответа сервера" };
          });
        })
        .then(function (data) {
          if (data && data.ok) {
            try {
              localStorage.setItem(RAFFLE_SUBSCRIBED_KEY, data.subscribed ? "1" : "0");
            } catch (e) {}
            setRaffleSubscribeState(!!data.subscribed);
            var tgNow = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tgNow && tgNow.showAlert) {
              tgNow.showAlert(
                data.subscribed
                  ? "Подписка оформлена. Уведомления о новых розыгрышах будут приходить в Telegram."
                  : "Вы отписаны от уведомлений о розыгрышах."
              );
            } else {
              alert(data.subscribed ? "Подписка оформлена." : "Вы отписаны.");
            }
          } else {
            var msg = (data && data.error) || "Ошибка. Попробуйте позже.";
            var tgNow2 = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
            if (tgNow2 && tgNow2.showAlert) tgNow2.showAlert(msg);
            else alert(msg);
            setRaffleSubscribeState(subscribed);
          }
        })
        .catch(function () {
          var tgNow3 = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tgNow3 && tgNow3.showAlert) {
            tgNow3.showAlert("Сервис временно недоступен. Попробуйте позже.");
          } else {
            alert("Сервис временно недоступен.");
          }
          setRaffleSubscribeState(subscribed);
        })
        .finally(function () {
          rafflesSubscribeBtn.disabled = false;
        });
    });
  })();

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

  /** Подмена старого «билет» на «беккинг-билет» при отображении (для данных из БД до переименования). */
  function raffleDisplayPrizeText(s) {
    if (s == null || typeof s !== "string") return s;
    var ph = "\x01BECKING_PH\x02";
    return s.replace(/беккинг-билет/gi, ph).replace(/Билет/g, "Беккинг-билет").replace(/билет/g, "беккинг-билет").split(ph).join("беккинг-билет");
  }

  function buildRaffleWinnerRowHtml(w, raffleId, isAdmin) {
    var uid = (w.userId || "").replace(/"/g, "&quot;");
    var status = w.winnerStatus;
    var statusIcon = status === "ok" ? " ✓" : status === "fail" ? " ✗" : "";
    var statusClass = status === "ok" ? "raffle-winner-status--ok" : status === "fail" ? "raffle-winner-status--fail" : "";
    var text = escapeHtml(w.name) + " — " + escapeHtml(w.p21Id);
    if (isAdmin) {
      var okActive = status === "ok" ? " raffle-winner-btn--active" : "";
      var failActive = status === "fail" ? " raffle-winner-btn--active" : "";
      return "<li class=\"raffle-winner-row\"><span class=\"raffle-winner-row__text\">" + text + "</span>" +
        "<span class=\"raffle-winner-status " + statusClass + "\">" + statusIcon + "</span>" +
        "<span class=\"raffle-winner-btns\"><button type=\"button\" class=\"raffle-winner-btn raffle-winner-btn--ok" + okActive + "\" data-raffle-id=\"" + escapeHtml(raffleId) + "\" data-winner-user-id=\"" + uid + "\" title=\"Подтвердить\">✓</button>" +
        "<button type=\"button\" class=\"raffle-winner-btn raffle-winner-btn--fail" + failActive + "\" data-raffle-id=\"" + escapeHtml(raffleId) + "\" data-winner-user-id=\"" + uid + "\" title=\"Отклонить\">✗</button></span></li>";
    }
    return "<li class=\"raffle-winner-row\"><span class=\"raffle-winner-row__text\">" + text + "</span><span class=\"raffle-winner-status " + statusClass + "\">" + statusIcon + "</span></li>";
  }

  function setRaffleWinnerStatus(rid, wid, btnIsOk, currentStatus, onDone) {
    var newStatus = btnIsOk ? "ok" : "fail";
    if ((btnIsOk && currentStatus === "ok") || (!btnIsOk && currentStatus === "fail")) newStatus = null;
    fetch(base + "/api/raffles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initData: initData, action: "setWinnerStatus", raffleId: rid, winnerUserId: wid, status: newStatus }),
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok) loadRaffles();
        if (onDone) onDone(!!(data && data.ok));
      })
      .catch(function () {
        if (onDone) onDone(false);
      });
  }

  function bindRaffleWinnerStatusButtons(container, raffleId) {
    if (!container || !rafflesIsAdmin || !base || !initData) return;
    container.querySelectorAll(".raffle-winner-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var rid = this.getAttribute("data-raffle-id");
        var wid = this.getAttribute("data-winner-user-id");
        var row = this.closest(".raffle-winner-row");
        var statusEl = row && row.querySelector(".raffle-winner-status");
        var currentStatus = statusEl && statusEl.classList.contains("raffle-winner-status--ok") ? "ok" : statusEl && statusEl.classList.contains("raffle-winner-status--fail") ? "fail" : null;
        if (!rid || !wid) return;
        btn.disabled = true;
        setRaffleWinnerStatus(rid, wid, this.classList.contains("raffle-winner-btn--ok"), currentStatus, function (ok) { if (!ok) btn.disabled = false; });
      });
    });
  }

  function parsePrizeValue(prizeStr) {
    if (prizeStr == null || prizeStr === "") return 0;
    var m = String(prizeStr).trim().match(/\d+(?:[.,]\d+)?/);
    return m ? parseFloat(m[0].replace(",", ".")) : 0;
  }

  function getRaffleTotalPrize(raffle) {
    if (!raffle || !raffle.groups) return 0;
    return raffle.groups.reduce(function (sum, g) {
      var count = Math.max(0, parseInt(g.count, 10) || 0);
      var nominal = parsePrizeValue(g.prize);
      return sum + (nominal > 0 ? nominal * count : 0);
    }, 0);
  }

  function formatRaffleSum(rub) {
    var n = Math.round(rub);
    if (n === 0) return "0 ₽";
    return (n < 0 ? "-" : "") + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "\u202f") + " ₽";
  }

  function getMyUserId() {
    if (myRaffleUserId) return myRaffleUserId;
    if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && tg.initDataUnsafe.user.id) {
      myRaffleUserId = "tg_" + tg.initDataUnsafe.user.id;
      return myRaffleUserId;
    }
    return null;
  }

  function parseMoscowDateTimeLocal(value) {
    if (!value) return null;
    if (/[zZ]$/.test(value) || /[+-]\d\d:\d\d$/.test(value)) return new Date(value);
    return new Date(value + ":00+03:00");
  }

  function renderRaffle(raffle) {
    if (!raffle || !raffleCard) return;
    if (raffleTimerInterval) {
      clearInterval(raffleTimerInterval);
      raffleTimerInterval = null;
    }
    currentRaffleId = raffle.id;
    currentRaffleData = raffle;
    var total = raffle.totalWinners || 0;
    var groups = raffle.groups || [];
    var totalPrize = getRaffleTotalPrize(raffle);
    var endDate = raffle.endDate ? new Date(raffle.endDate) : null;
    var isActive = raffle.status === "active";
    currentRaffleEndDate = isActive && endDate ? endDate : null;
    if (raffleStatWinners) raffleStatWinners.textContent = "Победителей: " + total;
    if (raffleStatPrizeValue) raffleStatPrizeValue.textContent = totalPrize > 0 ? totalPrize + " р" : "—";
    if (raffleStatGroups) raffleStatGroups.textContent = "Групп призов: " + (groups.length > 0 ? groups.length : "—");
    if (currentRaffleEndDate) {
      updateRaffleEndText();
      raffleTimerInterval = setInterval(updateRaffleEndText, 1000);
    } else {
      raffleEnd.textContent = raffle.status === "drawn"
        ? "Завершён"
        : (endDate ? "Завершится через " + endDate.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "");
    }
    if (raffleCompleteBtn) {
      var showComplete = rafflesIsAdmin && raffle.status === "active";
      raffleCompleteBtn.classList.toggle("raffle-cancel-btn--hidden", !showComplete);
      raffleCompleteBtn.disabled = !showComplete;
    }
    if (raffleCancelBtn) {
      var showCancel = rafflesIsAdmin && raffle.status === "active";
      raffleCancelBtn.classList.toggle("raffle-cancel-btn--hidden", !showCancel);
      raffleCancelBtn.disabled = !showCancel;
    }
    if (raffleDeleteBtn) {
      var showDelete = rafflesIsAdmin;
      raffleDeleteBtn.classList.toggle("raffle-cancel-btn--hidden", !showDelete);
      raffleDeleteBtn.disabled = !showDelete;
    }
    var prizesHtml = "";
    groups.forEach(function (g, i) {
      var cnt = g.count != null ? parseInt(g.count, 10) : 0;
      var cntStr = isNaN(cnt) ? "0" : String(cnt);
      prizesHtml += "<div class=\"raffle-prize\">Группа " + (i + 1) + " (" + cntStr + " побед.): " + escapeHtml(raffleDisplayPrizeText(g.prize || "—")) + "</div>";
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
    if (raffleParticipantsCount) raffleParticipantsCount.textContent = "(" + parts.length + ")";
    var chancePct = "";
    if (parts.length > 0 && total > 0) {
      var pct = Math.min(100, (total / parts.length) * 100);
      chancePct = "Ваш шанс выиграть: " + (pct >= 100 ? "100" : pct.toFixed(1)) + "%";
    }
    if (raffleParticipantsChance) {
      raffleParticipantsChance.textContent = chancePct;
      raffleParticipantsChance.style.display = chancePct ? "" : "none";
    }
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
        winHtml += "<li class=\"raffle-winner-group\"><strong>" + escapeHtml(g) + (prize ? ": " + escapeHtml(raffleDisplayPrizeText(prize)) : "") + "</strong><ul>";
        byGroup[g].forEach(function (w) {
          winHtml += buildRaffleWinnerRowHtml(w, raffle.id, rafflesIsAdmin);
        });
        winHtml += "</ul></li>";
      });
      raffleWinners.innerHTML = winHtml;
      bindRaffleWinnerStatusButtons(raffleWinners, raffle.id);
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

  function loadRaffles(switchToCompleted) {
    if (!base) return;
    var hostname = typeof window !== "undefined" && window.location && window.location.hostname ? window.location.hostname : "";
    var baseStr = (base || "").toString();
    var isLocal = /localhost|127\.0\.0\.1/i.test(hostname) || /localhost|127\.0\.0\.1/i.test(baseStr);
    var init = initData || (isLocal ? "local" : "");
    if (!init && !isLocal) return;

    function showRafflesLoading() {
      if (raffleEmpty) {
        raffleEmpty.innerHTML = "<span class=\"raffle-loading__spinner\" aria-hidden=\"true\"></span><span class=\"raffle-loading__text\">Подождите, Розыгрыш загружается</span>";
        raffleEmpty.classList.remove("raffle-empty--hidden");
      }
      if (raffleCurrent) raffleCurrent.classList.add("raffle-current--hidden");
    }
    function showRafflesError() {
      if (raffleEmpty) {
        raffleEmpty.textContent = "Ошибка загрузки. Проверьте сеть.";
        raffleEmpty.classList.remove("raffle-empty--hidden");
      }
      if (raffleCurrent) raffleCurrent.classList.add("raffle-current--hidden");
    }

    showRafflesLoading();

    var cache = typeof window !== "undefined" && window._rafflesCache;
    var cacheAge = cache && cache.time ? Date.now() - cache.time : 0;
    if (cache && cache.data && cacheAge < 60000) {
      applyRafflesData(cache.data, switchToCompleted);
    }

    var url = base + "/api/raffles?initData=" + encodeURIComponent(init) + "&_t=" + Date.now() + (isLocal ? "&demo=1" : "");
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok) return;
        if (typeof window !== "undefined") window._rafflesCache = { data: data, time: Date.now() };
        applyRafflesData(data, switchToCompleted);
      })
      .catch(function () {
        showRafflesError();
      });
  }

  function applyRafflesData(data, switchToCompleted) {
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
        rafflesIsAdmin = !!data.isAdmin;
        if (adminWrap) adminWrap.classList.toggle("raffles-admin-wrap--hidden", !rafflesIsAdmin);
        if (raffleAdminActions) {
          raffleAdminActions.classList.toggle("raffle-admin-actions--hidden", !rafflesIsAdmin);
          raffleAdminActions.setAttribute("aria-hidden", rafflesIsAdmin ? "false" : "true");
        }
        if (raffleCompleteBtn) {
          raffleCompleteBtn.classList.toggle("raffle-cancel-btn--hidden", !rafflesIsAdmin);
          raffleCompleteBtn.disabled = !rafflesIsAdmin;
        }
        if (raffleCancelBtn) {
          raffleCancelBtn.classList.toggle("raffle-cancel-btn--hidden", !rafflesIsAdmin);
          raffleCancelBtn.disabled = !rafflesIsAdmin;
        }
        if (raffleDeleteBtn) {
          raffleDeleteBtn.classList.toggle("raffle-cancel-btn--hidden", !rafflesIsAdmin);
          raffleDeleteBtn.disabled = !rafflesIsAdmin;
        }
        if (rafflesIsAdmin && window.updateRaffleSubsCount) {
          window.updateRaffleSubsCount();
        }

        var now = new Date();

        function isTournamentDayRaffle(r) {
          if (!r) return false;
          var title = (r.title || "").toLowerCase();
          if (title.indexOf("турнир дня") !== -1) return true;
          var groups = Array.isArray(r.groups) ? r.groups : [];
          for (var gi = 0; gi < groups.length; gi++) {
            var prizeStr = (groups[gi].prize || "").toLowerCase();
            if (prizeStr.indexOf("турнир дня") !== -1) return true;
          }
          return false;
        }

        var activeList = allRaffles.filter(function (r) {
          if (r.status !== "active") return false;
          var end = r.endDate ? new Date(r.endDate) : null;
          return !end || end > now;
        });
        // Турниры дня всегда первыми в списке активных розыгрышей
        activeList.sort(function (a, b) {
          var aTd = isTournamentDayRaffle(a) ? 1 : 0;
          var bTd = isTournamentDayRaffle(b) ? 1 : 0;
          if (aTd !== bTd) return bTd - aTd;
          var endA = a.endDate ? new Date(a.endDate).getTime() : 0;
          var endB = b.endDate ? new Date(b.endDate).getTime() : 0;
          return endA - endB;
        });
        var completed = allRaffles.filter(function (r) {
          if (r.status !== "active") return true;
          var end = r.endDate ? new Date(r.endDate) : null;
          return end && end <= now;
        });
        completed.sort(function (a, b) {
          var endA = a.endDate ? new Date(a.endDate).getTime() : 0;
          var endB = b.endDate ? new Date(b.endDate).getTime() : 0;
          return endB - endA;
        });

        // Вкладка «Активные»: показываем ровно один текущий розыгрыш (как в карточке ниже)
        var active = activeList[0] || null;
        var activeCount = active ? 1 : 0;
        var activeSumRub = active ? getRaffleTotalPrize(active) : 0;
        if (rafflesTabActiveCount) rafflesTabActiveCount.textContent = String(activeCount);
        if (rafflesTabActiveSum) rafflesTabActiveSum.textContent = formatRaffleSum(activeSumRub);

        if (active) {
          if (raffleCurrent) raffleCurrent.classList.remove("raffle-current--hidden");
          if (raffleEmpty) raffleEmpty.classList.add("raffle-empty--hidden");
          renderRaffle(active);
        } else {
          if (raffleCurrent) raffleCurrent.classList.add("raffle-current--hidden");
          if (raffleEmpty) {
            raffleEmpty.textContent = "Нет активных розыгрышей.";
            raffleEmpty.classList.remove("raffle-empty--hidden");
          }
          currentRaffleId = null;
          currentRaffleEndDate = null;
          if (raffleTimerInterval) {
            clearInterval(raffleTimerInterval);
            raffleTimerInterval = null;
          }
        }
        updateRaffleBadge(!!active);

        if (switchToCompleted && typeof setRafflesTab === "function") setRafflesTab("completed");

        // Вкладка «Завершённые»: количество розыгрышей и сумма разыгранная за все время (₽)
        var completedCount = completed.length;
        var completedSumRub = completed.reduce(function (s, r) { return s + getRaffleTotalPrize(r); }, 0);
        if (rafflesTabCompletedCount) rafflesTabCompletedCount.textContent = String(completedCount);
        if (rafflesTabCompletedSum) rafflesTabCompletedSum.textContent = formatRaffleSum(completedSumRub);

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
                winHtml += "<li class=\"raffle-winner-group\"><strong>" + escapeHtml(g) + (prize ? ": " + escapeHtml(raffleDisplayPrizeText(prize)) : "") + "</strong><ul>";
                byGroup[g].forEach(function (w) {
                  winHtml += buildRaffleWinnerRowHtml(w, raffle.id, rafflesIsAdmin);
                });
                winHtml += "</ul></li>";
              });
              var deleteHtml = rafflesIsAdmin
                ? "<div class=\"raffle-completed-card__actions\"><button type=\"button\" class=\"raffle-completed-card__delete-btn\" data-raffle-id=\"" +
                  escapeHtml(raffle.id || "") + "\">Удалить розыгрыш (админ)</button></div>"
                : "";
              return "<div class=\"raffle-completed-card\"><p class=\"raffle-completed-card__meta\">" + escapeHtml(meta) + "</p>" +
                deleteHtml +
                (winHtml ? "<p class=\"raffle-completed-card__winners-title\">Победители</p><ul class=\"raffle-completed-card__winners\">" + winHtml + "</ul>" : "") + "</div>";
              }).join("");
          } else {
            rafflesCompleted.innerHTML = "";
            if (rafflesCompletedEmpty) rafflesCompletedEmpty.classList.remove("raffle-empty--hidden");
          }
        }
  }

  // Админская рассылка подписчикам розыгрышей
  window.updateRaffleSubsCount = function () {
    if (!rafflesNotifySubsBtn) return;
    if (!base || !initData) return;
    fetch(
      base +
        "/api/raffle-manual-subscribers?stats=1&initData=" +
        encodeURIComponent(initData)
    )
      .then(function (r) {
        if (!r.ok) return Promise.reject(new Error("http " + r.status));
        return r.json();
      })
      .then(function (data) {
        if (!data || !data.ok || typeof data.total !== "number") return;
        var total = data.total;
        var baseText = "Разослать подписчикам розыгрыша";
        var current = rafflesNotifySubsBtn.textContent || baseText;
        var idx = current.indexOf(" (");
        if (idx !== -1) current = current.slice(0, idx);
        rafflesNotifySubsBtn.textContent = current + " (" + total + ")";
      })
      .catch(function () {});
  };

  (function initRafflesSubscribersAdminNotify() {
    if (!rafflesNotifySubsBtn) return;
    rafflesNotifySubsBtn.addEventListener("click", function () {
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      var btn = rafflesNotifySubsBtn;
      var originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Рассылаем…";
      if (rafflesNotifySubsHint) rafflesNotifySubsHint.textContent = "";
      var endDate = currentRaffleData && currentRaffleData.endDate ? currentRaffleData.endDate : undefined;
      fetch(base + "/api/raffle-manual-subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, endDate: endDate }),
      })
        .then(function (r) {
          return r
            .json()
            .catch(function () {
              return { ok: false, error: "Ошибка ответа сервера" };
            });
        })
        .then(function (data) {
          if (data && data.ok) {
            var sent =
              data && typeof data.sent === "number" && data.sent >= 0 ? data.sent : 0;
            var total =
              data && typeof data.total === "number" && data.total >= 0
                ? data.total
                : 0;
            if (rafflesNotifySubsHint) {
              rafflesNotifySubsHint.textContent =
                "Личные сообщения отправлены: " +
                sent +
                " из " +
                total +
                " подписчиков розыгрыша.";
            }
          } else if (rafflesNotifySubsHint) {
            rafflesNotifySubsHint.textContent =
              "Ошибка рассылки: " +
              (data && data.error ? data.error : "не удалось отправить");
          }
        })
        .catch(function () {
          if (rafflesNotifySubsHint) {
            rafflesNotifySubsHint.textContent =
              "Ошибка сети при отправке рассылки.";
          }
        })
        .finally(function () {
          btn.disabled = false;
          btn.textContent = originalText;
        });
    });
  })();

  function getRaffleCreateType() {
    return raffleTypeTickets && raffleTypeTickets.checked ? "tickets" : "other";
  }

  function setupTournamentDaySelect() {
    var select = document.getElementById("raffleTicketTournamentSelect");
    if (!select || select._tournamentDaySetupDone) return;
    select._tournamentDaySetupDone = true;

    // Поднять группу «Турнир дня» наверх
    var groups = select.querySelectorAll("optgroup");
    var tdGroup = null;
    for (var gi = 0; gi < groups.length; gi++) {
      var label = (groups[gi].getAttribute("label") || "").toLowerCase();
      if (label.indexOf("турнир дня") !== -1) {
        tdGroup = groups[gi];
        break;
      }
    }
    if (tdGroup && select.firstElementChild && tdGroup !== select.firstElementChild) {
      // Оставляем первую «— Выберите турнир —», а группу турнирa дня ставим сразу после неё
      var first = select.firstElementChild;
      if (first && first.tagName === "OPTION" && first.nextSibling) {
        select.insertBefore(tdGroup, first.nextSibling);
      }
    }

    // Выделить сегодняшний турнир дня
    var now = new Date();
    var moscowOffsetMs = 3 * 60 * 60 * 1000;
    var moscowNow = new Date(now.getTime() + moscowOffsetMs);
    var weekday = moscowNow.getUTCDay(); // 0=Вс,1=Пн...
    var dayMap = { 1: "(Пн)", 2: "(Вт)", 3: "(Ср)", 4: "(Чт)", 5: "(Пт)", 6: "(Сб)", 0: "(Вс)" };
    var marker = dayMap[weekday];
    if (!marker) return;
    var options = tdGroup ? tdGroup.querySelectorAll("option") : [];
    var todayOpt = null;
    for (var oi = 0; oi < options.length; oi++) {
      var txt = options[oi].textContent || "";
      if (txt.indexOf(marker) !== -1) {
        todayOpt = options[oi];
        break;
      }
    }
    if (todayOpt) {
      select.value = todayOpt.value;
      if (todayOpt.textContent.indexOf("сегодня") === -1) {
        todayOpt.textContent = todayOpt.textContent + " — сегодня";
      }
    }
  }

  function switchRaffleCreatePanel() {
    var isTickets = getRaffleCreateType() === "tickets";
    if (raffleCreatePanelTickets) raffleCreatePanelTickets.classList.toggle("raffle-create-form__panel--hidden", !isTickets);
    if (raffleCreatePanelOther) raffleCreatePanelOther.classList.toggle("raffle-create-form__panel--hidden", isTickets);
    if (isTickets) {
      setupTournamentDaySelect();
      buildTicketGroupInputs();
      updateRaffleCreateTotal();
    } else {
      buildGroupInputs();
    }
  }

  var raffleTicketTournamentWrap = document.getElementById("raffleTicketTournamentWrap");
  function buildTicketGroupInputs() {
    if (!raffleTicketGroupCount || !raffleTicketWinnersWrap || !raffleTicketGroups) return;
    var n = Math.max(1, Math.min(10, parseInt(raffleTicketGroupCount.value, 10) || 1));
    raffleTicketWinnersWrap.classList.toggle("raffle-ticket-winners-wrap--single", n === 1);
    if (raffleTicketTournamentWrap) raffleTicketTournamentWrap.style.display = n === 1 ? "" : "none";
    if (n === 1) {
      raffleTicketGroups.innerHTML = "";
      return;
    }
    raffleTicketGroups.innerHTML = "";
    for (var i = 0; i < n; i++) {
      var div = document.createElement("div");
      div.className = "raffle-ticket-group-row";
      var tournamentSelect = raffleTicketTournamentSelect ? raffleTicketTournamentSelect.cloneNode(true) : null;
      if (tournamentSelect) {
        tournamentSelect.removeAttribute("id");
        tournamentSelect.className = "randomizer-input raffle-tournament-select raffle-ticket-group-tournament";
        tournamentSelect.setAttribute("data-group-index", String(i));
        tournamentSelect.setAttribute("aria-label", "Турнир для группы " + (i + 1));
      }
      var selectHtml = tournamentSelect ? tournamentSelect.outerHTML : "<select class=\"randomizer-input raffle-tournament-select raffle-ticket-group-tournament\" data-group-index=\"" + i + "\" aria-label=\"Турнир для группы " + (i + 1) + "\"><option value=\"\">— Выберите турнир —</option></select>";
      div.innerHTML = "<label class=\"randomizer-label\"><span class=\"randomizer-label__text\">Группа " + (i + 1) + " (<span class=\"raffle-ticket-group-winners-num\" data-group-index=\"" + i + "\">1</span> побед.) — турнир:</span>" + selectHtml + "</label><label class=\"randomizer-label\"><span class=\"randomizer-label__text\">мест:</span><input type=\"number\" class=\"raffle-ticket-group-count randomizer-input\" min=\"0\" max=\"100\" value=\"1\" data-group-index=\"" + i + "\" /></label>";
      raffleTicketGroups.appendChild(div);
    }
    updateRaffleCreateTotal();
    updateTicketGroupWinnersLabels();
  }

  function updateTicketGroupWinnersLabels() {
    if (!raffleTicketGroups) return;
    raffleTicketGroups.querySelectorAll(".raffle-ticket-group-row").forEach(function (row) {
      var countInput = row.querySelector(".raffle-ticket-group-count");
      var numEl = row.querySelector(".raffle-ticket-group-winners-num");
      if (numEl && countInput) {
        var n = Math.max(0, parseInt(countInput.value, 10) || 0);
        numEl.textContent = String(n);
      }
    });
  }

  function updateRaffleCreateTotal() {
    if (!raffleCreateTotal) return;
    var total = 0;
    var parts = [];
    if (raffleTicketGroupCount && parseInt(raffleTicketGroupCount.value, 10) === 1) {
      var c = Math.max(0, parseInt(raffleTicketWinnersCount.value, 10) || 0);
      var buyin = 0;
      if (raffleTicketTournamentSelect && raffleTicketTournamentSelect.value && raffleTicketTournamentSelect.value !== "custom") {
        buyin = parseFloat(raffleTicketTournamentSelect.value) || 0;
      }
      total = c * buyin;
      if (c > 0 && buyin >= 0) parts.push(c + " × " + (buyin % 1 === 0 ? buyin : buyin.toFixed(2)) + " ₽");
    } else if (raffleTicketGroups) {
      var rows = raffleTicketGroups.querySelectorAll(".raffle-ticket-group-row");
      for (var i = 0; i < rows.length; i++) {
        var countInput = rows[i].querySelector(".raffle-ticket-group-count");
        var groupSelect = rows[i].querySelector(".raffle-ticket-group-tournament");
        var cnt = countInput ? Math.max(0, parseInt(countInput.value, 10) || 0) : 0;
        var buyin = 0;
        if (groupSelect && groupSelect.value && groupSelect.value !== "custom") {
          buyin = parseFloat(groupSelect.value) || 0;
        }
        total += cnt * buyin;
        if (cnt > 0 && buyin >= 0) parts.push(cnt + " × " + (buyin % 1 === 0 ? buyin : buyin.toFixed(2)) + " ₽");
      }
    }
    var suffix = parts.length > 0 ? " (" + parts.join(", ") + ")" : "";
    raffleCreateTotal.textContent = "Итого: " + (total % 1 === 0 ? total : total.toFixed(2)) + " ₽" + suffix;
  }

  function buildGroupInputs() {
    if (!groupCountInput || !raffleGroupsEl) return;
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

  var rafflesCopyLinkBtn = document.getElementById("rafflesCopyLinkBtn");
  if (rafflesCopyLinkBtn && rafflesCopyLinkBtn.getAttribute("data-share-bound") !== "1") {
    rafflesCopyLinkBtn.setAttribute("data-share-bound", "1");
    rafflesCopyLinkBtn.addEventListener("click", function () {
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var link = appUrl + "?startapp=raffles";
      var msg = "Ссылка скопирована. Отправьте другу — откроется раздел розыгрышей.";
      if (typeof navigator.clipboard !== "undefined" && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert(msg); else alert("Ссылка скопирована.");
        }).catch(function () {
          var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
          if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
        });
      } else {
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Ссылка: " + link); else alert("Ссылка: " + link);
      }
    });
  }
  var rafflesInviteFriendBtn = document.getElementById("rafflesInviteFriendBtn");
  if (rafflesInviteFriendBtn) {
    rafflesInviteFriendBtn.addEventListener("click", function () {
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var link = appUrl + "?startapp=raffles";
      var shareUrl = "https://t.me/share/url?url=&text=" + encodeURIComponent("Привет бро, клуб Два туза снова разыгрывает беккинг-билеты на турниры бесплатно, заходи участвуй)\n" + link);
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, "_blank");
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("raffle_hero");
    });
  }

  if (raffleInviteFriendInlineBtn) {
    raffleInviteFriendInlineBtn.addEventListener("click", function () {
      if (!currentRaffleData) return;
      var raffle = currentRaffleData;
      var groups = raffle.groups || [];
      var total = raffle.totalWinners || 0;
      var totalPrize = getRaffleTotalPrize(raffle);
      var tournamentName = raffleDisplayPrizeText((raffle.title || (groups[0] && groups[0].prize) || "").trim()) || "турнир клуба";
      var appEl = document.getElementById("app");
      var appUrl = (appEl && appEl.getAttribute("data-telegram-app-url")) || "https://t.me/Poker_dvatuza_bot/DvaTuza";
      appUrl = appUrl.replace(/\/$/, "");
      var link = appUrl + "?startapp=raffles";
      var text =
        "Разыгрываем " +
        (total || 0) +
        " беккинг-билетов на сумму " +
        (totalPrize || 0) +
        "₽ на " +
        tournamentName +
        "\n" +
        link;
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      var shareUrl = "https://t.me/share/url?url=&text=" + encodeURIComponent(text);
      if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl); else window.open(shareUrl, "_blank");
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("raffle_card");
    });
  }

  if (createToggle && createForm) {
    createToggle.addEventListener("click", function () {
      createForm.classList.toggle("raffle-create-form--hidden");
      if (!createForm.classList.contains("raffle-create-form--hidden")) switchRaffleCreatePanel();
    });
  }
  if (raffleTypeTickets) raffleTypeTickets.addEventListener("change", switchRaffleCreatePanel);
  if (raffleTypeOther) raffleTypeOther.addEventListener("change", switchRaffleCreatePanel);
  if (raffleTicketTournamentSelect) raffleTicketTournamentSelect.addEventListener("change", updateRaffleCreateTotal);
  if (raffleTicketGroupCount) raffleTicketGroupCount.addEventListener("change", buildTicketGroupInputs);
  if (raffleTicketGroupCount) raffleTicketGroupCount.addEventListener("input", buildTicketGroupInputs);
  if (raffleTicketWinnersCount) raffleTicketWinnersCount.addEventListener("input", updateRaffleCreateTotal);
  if (raffleTicketGroups) {
    raffleTicketGroups.addEventListener("input", function (e) {
      if (e.target && e.target.classList.contains("raffle-ticket-group-count")) {
        updateTicketGroupWinnersLabels();
        updateRaffleCreateTotal();
      }
    });
    raffleTicketGroups.addEventListener("change", function (e) { if (e.target && e.target.classList.contains("raffle-ticket-group-tournament")) updateRaffleCreateTotal(); });
  }
  if (groupCountInput && raffleGroupsEl) {
    groupCountInput.addEventListener("change", buildGroupInputs);
  }
  if (createBtn) {
    createBtn.addEventListener("click", function () {
      var isTickets = getRaffleCreateType() === "tickets";
      var endDateEl = isTickets ? raffleEndDateInput : raffleEndDateOther;
      var endVal = endDateEl ? endDateEl.value : "";
      if (!endVal) {
        if (tg && tg.showAlert) tg.showAlert("Укажите дату и время завершения");
        return;
      }
      var endDate = parseMoscowDateTimeLocal(endVal);
      if (isNaN(endDate.getTime())) {
        if (tg && tg.showAlert) tg.showAlert("Некорректная дата");
        return;
      }
      var totalWinners;
      var groups;
      var title = "";
      if (isTickets) {
        totalWinners = 0;
        groups = [];
        if (raffleTicketGroupCount && parseInt(raffleTicketGroupCount.value, 10) === 1) {
          var c = Math.max(0, parseInt(raffleTicketWinnersCount.value, 10) || 0);
          totalWinners = c;
          var singleBuyin = 0;
          if (raffleTicketTournamentSelect && raffleTicketTournamentSelect.value && raffleTicketTournamentSelect.value !== "custom") {
            singleBuyin = parseFloat(raffleTicketTournamentSelect.value) || 0;
          }
          var singleTournamentName = "";
          if (raffleTicketTournamentSelect && raffleTicketTournamentSelect.selectedIndex >= 0) {
            var singleOpt = raffleTicketTournamentSelect.options[raffleTicketTournamentSelect.selectedIndex];
            singleTournamentName = (singleOpt && (singleOpt.getAttribute("data-name") || singleOpt.textContent || "").trim()) || "";
          }
          var singlePrizeText = singleBuyin > 0 ? "Беккинг-билет " + (singleBuyin % 1 === 0 ? singleBuyin : singleBuyin.toFixed(2)) + " ₽" : "Беккинг-билет на турнир";
          var singlePrize = singlePrizeText + (singleTournamentName ? " — " + singleTournamentName : "");
          if (c > 0) groups.push({ count: c, prize: singlePrize });
        } else if (raffleTicketGroups) {
          var rows = raffleTicketGroups.querySelectorAll(".raffle-ticket-group-row");
          for (var i = 0; i < rows.length; i++) {
            var countInput = rows[i].querySelector(".raffle-ticket-group-count");
            var groupSelect = rows[i].querySelector(".raffle-ticket-group-tournament");
            var cnt = countInput ? Math.max(0, parseInt(countInput.value, 10) || 0) : 0;
            var groupBuyin = 0;
            if (groupSelect && groupSelect.value && groupSelect.value !== "custom") {
              groupBuyin = parseFloat(groupSelect.value) || 0;
            }
            var groupTournamentName = "";
            if (groupSelect && groupSelect.selectedIndex >= 0) {
              var groupOpt = groupSelect.options[groupSelect.selectedIndex];
              groupTournamentName = (groupOpt && (groupOpt.getAttribute("data-name") || groupOpt.textContent || "").trim()) || "";
            }
            var groupPrizeText = groupBuyin > 0 ? "Беккинг-билет " + (groupBuyin % 1 === 0 ? groupBuyin : groupBuyin.toFixed(2)) + " ₽" : "Беккинг-билет на турнир";
            var groupPrize = groupPrizeText + (groupTournamentName ? " — " + groupTournamentName : "");
            totalWinners += cnt;
            if (cnt > 0) groups.push({ count: cnt, prize: groupPrize });
          }
        }
        if (groups.length === 0) {
          if (tg && tg.showAlert) tg.showAlert("Укажите количество победителей");
          return;
        }
        title = "Розыгрыш беккинг-билетов на турниры";
      } else {
        var groupInputs = raffleGroupsEl ? raffleGroupsEl.querySelectorAll(".raffle-group-count") : [];
        var prizeInputs = raffleGroupsEl ? raffleGroupsEl.querySelectorAll(".raffle-group-prize") : [];
        groups = [];
        totalWinners = 0;
        for (var j = 0; j < groupInputs.length; j++) {
          var count = Math.max(0, parseInt(groupInputs[j].value, 10) || 0);
          var prize = prizeInputs[j] ? prizeInputs[j].value.trim().slice(0, 200) : "";
          totalWinners += count;
          groups.push({ count: count, prize: prize });
        }
        if (groups.length === 0) groups = [{ count: 1, prize: "Приз" }];
        totalWinners = Math.max(1, totalWinners);
        title = document.getElementById("raffleTitle") ? document.getElementById("raffleTitle").value.trim().slice(0, 200) : "";
      }
      createBtn.disabled = true;
      fetch(base + "/api/raffles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData, action: "create", totalWinners: totalWinners, groups: groups, endDate: endDate.toISOString(), title: title || undefined }),
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

  if (raffleCompleteBtn) {
    raffleCompleteBtn.addEventListener("click", function () {
      if (!rafflesIsAdmin) return;
      if (!currentRaffleId) {
        if (tg && tg.showAlert) tg.showAlert("Розыгрыш не выбран. Обновите страницу.");
        return;
      }
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      var doComplete = function () {
        raffleCompleteBtn.disabled = true;
        fetch(base + "/api/raffles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, action: "complete", raffleId: currentRaffleId }),
        })
          .then(function (r) {
            return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
          })
          .then(function (data) {
            raffleCompleteBtn.disabled = false;
            if (data && data.ok) {
              if (tg && tg.showAlert) tg.showAlert("Розыгрыш завершён. Победители определены.");
              loadRaffles(true);
            } else if (tg && tg.showAlert) {
              tg.showAlert((data && data.error) || "Ошибка завершения розыгрыша");
            }
          })
          .catch(function () {
            raffleCompleteBtn.disabled = false;
            if (tg && tg.showAlert) tg.showAlert("Ошибка сети при завершении розыгрыша");
          });
      };
      if (tg && tg.showConfirm) {
        tg.showConfirm("Завершить розыгрыш сейчас и определить победителей? Приём заявок будет остановлен.", function (ok) {
          if (ok) doComplete();
        });
      } else {
        var sure = window.confirm("Завершить розыгрыш сейчас и определить победителей? Приём заявок будет остановлен.");
        if (sure) doComplete();
      }
    });
  }

  if (raffleCancelBtn) {
    raffleCancelBtn.addEventListener("click", function () {
      if (!rafflesIsAdmin) return;
      if (!currentRaffleId) {
        if (tg && tg.showAlert) tg.showAlert("Розыгрыш не выбран. Обновите страницу.");
        return;
      }
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      var doCancel = function () {
        raffleCancelBtn.disabled = true;
        fetch(base + "/api/raffles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, action: "cancel", raffleId: currentRaffleId }),
        })
          .then(function (r) {
            return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
          })
          .then(function (data) {
            raffleCancelBtn.disabled = false;
            if (data && data.ok) {
              if (tg && tg.showAlert) tg.showAlert("Розыгрыш отменён");
              loadRaffles();
            } else if (tg && tg.showAlert) {
              tg.showAlert((data && data.error) || "Ошибка отмены розыгрыша");
            }
          })
          .catch(function () {
            raffleCancelBtn.disabled = false;
            if (tg && tg.showAlert) tg.showAlert("Ошибка сети при отмене розыгрыша");
          });
      };
      if (tg && tg.showConfirm) {
        tg.showConfirm("Отменить розыгрыш? Это действие нельзя будет отменить.", function (ok) {
          if (ok) doCancel();
        });
      } else {
        var sure = window.confirm("Точно отменить этот розыгрыш? Это действие нельзя будет отменить.");
        if (sure) doCancel();
      }
    });
  }

  if (raffleDeleteBtn) {
    raffleDeleteBtn.addEventListener("click", function () {
      if (!rafflesIsAdmin) return;
      if (!currentRaffleId) {
        if (tg && tg.showAlert) tg.showAlert("Розыгрыш не выбран. Обновите страницу.");
        return;
      }
      if (!base || !initData) {
        if (tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram.");
        return;
      }
      var doDelete = function () {
        raffleDeleteBtn.disabled = true;
        fetch(base + "/api/raffles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, action: "delete", raffleId: currentRaffleId }),
        })
          .then(function (r) {
            return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
          })
          .then(function (data) {
            raffleDeleteBtn.disabled = false;
            if (data && data.ok) {
              if (tg && tg.showAlert) tg.showAlert("Розыгрыш удалён");
              loadRaffles();
            } else if (tg && tg.showAlert) {
              tg.showAlert((data && data.error) || "Ошибка удаления розыгрыша");
            }
          })
          .catch(function () {
            raffleDeleteBtn.disabled = false;
            if (tg && tg.showAlert) tg.showAlert("Ошибка сети при удалении розыгрыша");
          });
      };
      if (tg && tg.showConfirm) {
        tg.showConfirm("Удалить этот розыгрыш окончательно?", function (ok) {
          if (ok) doDelete();
        });
      } else {
        var sure = window.confirm("Точно удалить этот розыгрыш окончательно?");
        if (sure) doDelete();
      }
    });
  }

  if (rafflesCompleted && base && initData) {
    rafflesCompleted.addEventListener("click", function (e) {
      var winnerBtn = e.target.closest(".raffle-winner-btn");
      if (winnerBtn && rafflesIsAdmin) {
        var rid = winnerBtn.getAttribute("data-raffle-id");
        var wid = winnerBtn.getAttribute("data-winner-user-id");
        var row = winnerBtn.closest(".raffle-winner-row");
        var statusEl = row && row.querySelector(".raffle-winner-status");
        var currentStatus = statusEl && statusEl.classList.contains("raffle-winner-status--ok") ? "ok" : statusEl && statusEl.classList.contains("raffle-winner-status--fail") ? "fail" : null;
        if (rid && wid) {
          winnerBtn.disabled = true;
          setRaffleWinnerStatus(rid, wid, winnerBtn.classList.contains("raffle-winner-btn--ok"), currentStatus, function (ok) { if (!ok) winnerBtn.disabled = false; });
        }
        return;
      }
      if (!rafflesIsAdmin) return;
      var btn = e.target.closest(".raffle-completed-card__delete-btn");
      if (!btn) return;
      var raffleId = btn.getAttribute("data-raffle-id") || "";
      if (!raffleId) return;
      var doDelete = function () {
        btn.disabled = true;
        fetch(base + "/api/raffles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, action: "delete", raffleId: raffleId }),
        })
          .then(function (r) {
            return r.json().catch(function () { return { ok: false, error: "Ошибка ответа сервера" }; });
          })
          .then(function (data) {
            btn.disabled = false;
            if (data && data.ok) {
              if (tg && tg.showAlert) tg.showAlert("Розыгрыш удалён");
              loadRaffles();
            } else if (tg && tg.showAlert) {
              tg.showAlert((data && data.error) || "Ошибка удаления розыгрыша");
            }
          })
          .catch(function () {
            btn.disabled = false;
            if (tg && tg.showAlert) tg.showAlert("Ошибка сети при удалении розыгрыша");
          });
      };
      if (tg && tg.showConfirm) {
        tg.showConfirm("Удалить этот завершённый розыгрыш окончательно?", function (ok) {
          if (ok) doDelete();
        });
      } else {
        var sure = window.confirm("Точно удалить этот завершённый розыгрыш окончательно?");
        if (sure) doDelete();
      }
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
            } else if (data && data.code === "CHANNEL_REQUIRED") {
              if (tg && tg.showAlert) tg.showAlert(err);
              if (tg && tg.openTelegramLink) tg.openTelegramLink("https://t.me/dva_tuza_club");
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

// Эквилятор: расчёт эквити (Монте-Карло + оценка руки)
(function equilatorHandEval() {
  var RANKS = "23456789TJQKA";
  var SUITS = "shdc";
  function cardToStr(c) { return (c && RANKS[c.r - 2] != null && SUITS[c.s] != null) ? RANKS[c.r - 2] + SUITS[c.s] : null; }
  function parseCard(str) {
    if (!str || str.length < 2) return null;
    var r = String(str).toUpperCase();
    var rankCh = r.charAt(0);
    var suitCh = r.charAt(1).toLowerCase();
    var ri = RANKS.indexOf(rankCh);
    var si = SUITS.indexOf(suitCh);
    if (ri < 0 || si < 0) return null;
    return { r: ri + 2, s: si };
  }
  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 2; r <= 14; r++) d.push({ r: r, s: s });
    return d;
  }
  function cloneCards(arr) { return arr.map(function (c) { return { r: c.r, s: c.s }; }); }
  function rankCounts(cards) {
    var cnt = {};
    for (var i = 0; i < cards.length; i++) { var r = cards[i].r; cnt[r] = (cnt[r] || 0) + 1; }
    return cnt;
  }
  function suitCounts(cards) {
    var cnt = {};
    for (var i = 0; i < cards.length; i++) { var s = cards[i].s; cnt[s] = (cnt[s] || 0) + 1; }
    return cnt;
  }
  function sortRanksDesc(cards) {
    var r = cards.map(function (c) { return c.r; }).sort(function (a, b) { return b - a; });
    return r;
  }
  function isStraight(ranks) {
    var uniq = [];
    for (var i = 0; i < ranks.length; i++) if (uniq.indexOf(ranks[i]) < 0) uniq.push(ranks[i]);
    uniq.sort(function (a, b) { return b - a; });
    if (uniq.length < 5) return null;
    for (var j = 0; j <= uniq.length - 5; j++) {
      var a = uniq[j];
      if (uniq[j + 1] === a - 1 && uniq[j + 2] === a - 2 && uniq[j + 3] === a - 3 && uniq[j + 4] === a - 4) return a;
    }
    if (uniq.indexOf(14) >= 0 && uniq.indexOf(5) >= 0 && uniq.indexOf(4) >= 0 && uniq.indexOf(3) >= 0 && uniq.indexOf(2) >= 0) return 5;
    return null;
  }
  function eval5(cards) {
    if (cards.length !== 5) return [0, 0, 0, 0, 0, 0];
    var ranks = sortRanksDesc(cards);
    var rc = rankCounts(cards);
    var sc = suitCounts(cards);
    var flush = false;
    for (var s in sc) if (sc[s] >= 5) { flush = true; break; }
    var straightHigh = isStraight(ranks);
    var values = Object.keys(rc).map(Number);
    var byCount = {};
    for (var v in rc) { var n = rc[v]; if (!byCount[n]) byCount[n] = []; byCount[n].push(parseInt(v, 10)); }
    for (var n in byCount) byCount[n].sort(function (a, b) { return b - a; });
    if (flush && straightHigh !== null) return [8, straightHigh, 0, 0, 0, 0];
    if (byCount[4]) return [7, byCount[4][0], values.filter(function (x) { return x !== byCount[4][0]; }).sort(function (a, b) { return b - a; })[0] || 0, 0, 0, 0];
    if (byCount[3] && byCount[2]) return [6, byCount[3][0], byCount[2][0], 0, 0, 0];
    if (flush) { var fr = sortRanksDesc(cards); return [5, fr[0], fr[1], fr[2], fr[3], fr[4]]; }
    if (straightHigh !== null) return [4, straightHigh, 0, 0, 0, 0];
    if (byCount[3]) { var tk = byCount[3][0]; var kickers = values.filter(function (x) { return x !== tk; }).sort(function (a, b) { return b - a; }).slice(0, 2); return [3, tk, kickers[0] || 0, kickers[1] || 0, 0, 0]; }
    if (byCount[2] && byCount[2].length >= 2) { var p2 = byCount[2].slice(0, 2).sort(function (a, b) { return b - a; }); var k = values.filter(function (x) { return p2.indexOf(x) < 0; }).sort(function (a, b) { return b - a; })[0]; return [2, p2[0], p2[1], k, 0, 0]; }
    if (byCount[2]) { var p = byCount[2][0]; var k2 = values.filter(function (x) { return x !== p; }).sort(function (a, b) { return b - a; }).slice(0, 3); return [1, p, k2[0] || 0, k2[1] || 0, k2[2] || 0, 0]; }
    return [0, ranks[0], ranks[1], ranks[2], ranks[3], ranks[4]];
  }
  function comb5from7(cards) {
    var out = [];
    for (var i = 0; i < 7; i++) for (var j = i + 1; j < 7; j++) for (var k = j + 1; k < 7; k++) for (var l = k + 1; l < 7; l++) for (var m = l + 1; m < 7; m++) out.push([cards[i], cards[j], cards[k], cards[l], cards[m]]);
    return out;
  }
  function bestHandValue(cards7) {
    if (cards7.length < 5) return [0, 0, 0, 0, 0, 0];
    var fives = cards7.length === 5 ? [cards7] : (cards7.length === 7 ? comb5from7(cards7) : []);
    var best = [0, 0, 0, 0, 0, 0];
    for (var i = 0; i < fives.length; i++) {
      var v = eval5(fives[i]);
      for (var t = 0; t < 6; t++) {
        if (v[t] > best[t]) { best = v; break; }
        if (v[t] < best[t]) break;
      }
    }
    return best;
  }
  function handCompare(a, b) {
    for (var i = 0; i < 6; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  }
  window.equilatorEvalHand = function (cards7) { return bestHandValue(cards7); };
  window.equilatorCompareHands = function (a7, b7) { return handCompare(bestHandValue(a7), bestHandValue(b7)); };
  window.equilatorParseCard = parseCard;
  window.equilatorMakeDeck = makeDeck;
  window.equilatorCloneCards = cloneCards;
})();

function initEquilator() {
  var RANKS = "23456789TJQKA";
  var RANKS_DISPLAY = { "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7", "8": "8", "9": "9", "T": "10", "J": "J", "Q": "Q", "K": "K", "A": "A" };
  var SUITS = "shdc";
  var SUITS_SYM = { "s": "♠", "h": "♥", "d": "♦", "c": "♣" };
  var BASE_SLOT_IDS = ["hero1", "hero2", "board1", "board2", "board3", "board4", "board5"];
  var calcBtn = document.getElementById("equilatorCalcBtn");
  var resultBlock = document.getElementById("equilatorResult");
  var winPct = document.getElementById("equilatorWinPct");
  var tiePct = document.getElementById("equilatorTiePct");
  var oppEquityLines = document.getElementById("equilatorOppEquityLines");
  var resultMeta = document.getElementById("equilatorResultMeta");
  var pickerWrap = document.getElementById("equilatorPickerWrap");
  var pickerGrid = document.getElementById("equilatorPickerGrid");
  var pickerTitle = document.getElementById("equilatorPickerTitle");
  var pickerClose = document.getElementById("equilatorPickerClose");
  var oppCardsContainer = document.getElementById("equilatorOppCards");
  var addPlayerBtn = document.getElementById("equilatorAddPlayerBtn");
  var activeSlotId = null;
  var numOpponents = 1;
  function getNumOpp() { return numOpponents; }
  function getOppSlotIds() {
    var n = numOpponents;
    var ids = [];
    for (var i = 1; i <= n * 2; i++) ids.push("opp" + i);
    return ids;
  }
  function getSlotIds() { return BASE_SLOT_IDS.concat(getOppSlotIds()); }
  function collectOppCards() {
    var out = [];
    for (var o = 0; o < numOpponents; o++) {
      var c1 = getSlotCard("opp" + (o * 2 + 1));
      var c2 = getSlotCard("opp" + (o * 2 + 2));
      out.push([c1, c2]);
    }
    return out;
  }
  function removeOpponent(idx) {
    if (numOpponents <= 1) return;
    var preserved = collectOppCards();
    preserved.splice(idx, 1);
    numOpponents--;
    buildOppSlots(preserved);
  }
  function buildOppSlots(preservedCards) {
    if (!oppCardsContainer) return;
    oppCardsContainer.innerHTML = "";
    for (var o = 0; o < numOpponents; o++) {
      var row = document.createElement("div");
      row.className = "equilator-opp-row";
      var head = document.createElement("div");
      head.className = "equilator-opp-row-head";
      if (numOpponents > 1) {
        var minusBtn = document.createElement("button");
        minusBtn.type = "button";
        minusBtn.className = "equilator-opp-remove-btn";
        minusBtn.setAttribute("aria-label", "Удалить оппонента " + (o + 1));
        minusBtn.textContent = "−";
        minusBtn.dataset.oppIdx = String(o);
        minusBtn.addEventListener("click", function (e) {
          e.preventDefault();
          removeOpponent(parseInt(this.dataset.oppIdx, 10));
        });
        head.appendChild(minusBtn);
      }
      var label = document.createElement("span");
      label.className = "equilator-opp-label";
      label.textContent = "Оппонент " + (o + 1);
      head.appendChild(label);
      row.appendChild(head);
      var cardsWrap = document.createElement("div");
      cardsWrap.className = "equilator-cards";
      var prevCards = preservedCards && preservedCards[o] ? preservedCards[o] : [null, null];
      for (var c = 0; c < 2; c++) {
        var slotId = "opp" + (o * 2 + c + 1);
        var wrap = document.createElement("div");
        wrap.className = "equilator-slot-wrap";
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "equilator-card-slot";
        btn.setAttribute("data-equilator-slot", slotId);
        btn.setAttribute("aria-label", "Оппонент " + (o + 1) + " карта " + (c + 1));
        var card = prevCards[c];
        if (card) {
          var rankStr = (RANKS[card.r - 2] != null) ? RANKS[card.r - 2] : String(card.r);
          var suitStr = (SUITS[card.s] != null) ? SUITS[card.s] : String(card.s);
          btn.setAttribute("data-rank", rankStr);
          btn.setAttribute("data-suit", suitStr);
          btn.innerHTML = "<span class=\"equilator-card-slot__text\">" + ((RANKS_DISPLAY[rankStr] || rankStr) + (SUITS_SYM[suitStr] || suitStr)) + "</span>";
          btn.classList.add("equilator-card-slot--" + (suitStr === "s" ? "spade" : suitStr === "h" ? "heart" : suitStr === "d" ? "diamond" : "club"));
        } else {
          btn.innerHTML = "<span class=\"equilator-card-slot__text\">—</span>";
        }
        btn.addEventListener("click", function (e) { e.preventDefault(); openPicker(this.getAttribute("data-equilator-slot")); });
        wrap.appendChild(btn);
        var resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "equilator-card-slot__reset" + (card ? "" : " equilator-card-slot__reset--hidden");
        resetBtn.setAttribute("data-equilator-slot", slotId);
        resetBtn.setAttribute("aria-label", "Сбросить карту");
        resetBtn.textContent = "×";
        wrap.appendChild(resetBtn);
        cardsWrap.appendChild(wrap);
      }
      row.appendChild(cardsWrap);
      oppCardsContainer.appendChild(row);
    }
  }
  if (addPlayerBtn) addPlayerBtn.addEventListener("click", function (e) {
    e.preventDefault();
    numOpponents++;
    buildOppSlots();
  });
  buildOppSlots();
  function slotEl(slotId) { return document.querySelector(".equilator-card-slot[data-equilator-slot=\"" + slotId + "\"]"); }
  function getSlotCard(slotId) {
    var el = slotEl(slotId);
    if (!el) return null;
    var r = el.getAttribute("data-rank");
    var s = el.getAttribute("data-suit");
    if (!r || !s) return null;
    return window.equilatorParseCard(r + s);
  }
  function getUsedCards(excludeSlotId) {
    var used = {};
    getSlotIds().forEach(function (id) {
      if (id === excludeSlotId) return;
      var c = getSlotCard(id);
      if (c) used[c.r + "_" + c.s] = true;
    });
    return used;
  }
  function clearSlot(slotId) {
    var el = slotEl(slotId);
    if (!el) return;
    el.removeAttribute("data-rank");
    el.removeAttribute("data-suit");
    var textEl = el.querySelector(".equilator-card-slot__text");
    if (textEl) textEl.textContent = "—";
    el.classList.remove("equilator-card-slot--spade", "equilator-card-slot--heart", "equilator-card-slot--diamond", "equilator-card-slot--club");
    var wrap = el.parentElement;
    if (wrap && wrap.classList.contains("equilator-slot-wrap")) {
      var resetBtn = wrap.querySelector(".equilator-card-slot__reset");
      if (resetBtn) resetBtn.classList.add("equilator-card-slot__reset--hidden");
    }
  }
  function setSlotCard(slotId, rank, suit) {
    var el = slotEl(slotId);
    if (!el) return;
    el.setAttribute("data-rank", rank);
    el.setAttribute("data-suit", suit);
    var label = (RANKS_DISPLAY[rank] || rank) + (SUITS_SYM[suit] || suit);
    var textEl = el.querySelector(".equilator-card-slot__text");
    if (textEl) textEl.textContent = label;
    el.classList.remove("equilator-card-slot--spade", "equilator-card-slot--heart", "equilator-card-slot--diamond", "equilator-card-slot--club");
    if (suit) el.classList.add("equilator-card-slot--" + (suit === "s" ? "spade" : suit === "h" ? "heart" : suit === "d" ? "diamond" : "club"));
    var wrap = el.parentElement;
    if (wrap && wrap.classList.contains("equilator-slot-wrap")) {
      var resetBtn = wrap.querySelector(".equilator-card-slot__reset");
      if (resetBtn) resetBtn.classList.remove("equilator-card-slot__reset--hidden");
    }
  }
  function openPicker(forSlotId) {
    activeSlotId = forSlotId;
    var used = getUsedCards(forSlotId);
    if (pickerTitle) pickerTitle.textContent = "Выберите карту";
    if (pickerGrid) {
      pickerGrid.innerHTML = "";
      for (var si = 0; si < SUITS.length; si++) {
        for (var ri = 0; ri < RANKS.length; ri++) {
          var r = RANKS[ri];
          var s = SUITS[si];
          var key = (window.equilatorParseCard(r + s).r) + "_" + (window.equilatorParseCard(r + s).s);
          var disabled = !!used[key];
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "equilator-picker-card equilator-picker-card--" + (s === "s" ? "spade" : s === "h" ? "heart" : s === "d" ? "diamond" : "club");
          if (disabled) btn.disabled = true;
          btn.textContent = (RANKS_DISPLAY[r] || r) + (SUITS_SYM[s] || s);
          btn.setAttribute("data-rank", r);
          btn.setAttribute("data-suit", s);
          btn.addEventListener("click", function () {
            if (activeSlotId && !this.disabled) {
              setSlotCard(activeSlotId, this.getAttribute("data-rank"), this.getAttribute("data-suit"));
              closePicker();
            }
          });
          pickerGrid.appendChild(btn);
        }
      }
    }
    if (!pickerWrap) return;
    var slot = slotEl(forSlotId);
    if (!slot) {
      pickerWrap.classList.remove("equilator-picker-wrap--hidden");
      pickerWrap.setAttribute("aria-hidden", "false");
      return;
    }
    var rect = slot.getBoundingClientRect();
    var gap = 8;
    pickerWrap.style.position = "fixed";
    pickerWrap.style.visibility = "hidden";
    pickerWrap.classList.remove("equilator-picker-wrap--hidden");
    pickerWrap.setAttribute("aria-hidden", "false");
    var top = rect.bottom + gap;
    var left = rect.left;
    var width = pickerWrap.offsetWidth || 260;
    var height = pickerWrap.offsetHeight || 220;
    if (left + width + 8 > window.innerWidth) {
      left = Math.max(8, window.innerWidth - width - 8);
    }
    if (top + height + 8 > window.innerHeight) {
      top = rect.top - gap - height;
      if (top < 8) {
        top = Math.max(8, window.innerHeight - height - 8);
      }
    }
    if (left < 8) left = 8;
    pickerWrap.style.top = top + "px";
    pickerWrap.style.left = left + "px";
    pickerWrap.style.right = "auto";
    pickerWrap.style.maxWidth = "";
    pickerWrap.style.visibility = "";
  }
  function closePicker() {
    pickerWrap.classList.add("equilator-picker-wrap--hidden");
    pickerWrap.setAttribute("aria-hidden", "true");
    pickerWrap.style.position = "";
    pickerWrap.style.top = "";
    pickerWrap.style.left = "";
    pickerWrap.style.right = "";
    pickerWrap.style.maxWidth = "";
    activeSlotId = null;
  }
  BASE_SLOT_IDS.forEach(function (id) {
    var el = slotEl(id);
    if (el) el.addEventListener("click", function (e) { e.preventDefault(); openPicker(id); });
  });
  var formEl = document.querySelector(".equilator-form");
  if (formEl) formEl.addEventListener("click", function (e) {
    var resetBtn = e.target && e.target.closest ? e.target.closest(".equilator-card-slot__reset") : null;
    if (resetBtn && resetBtn.dataset.equilatorSlot) {
      e.preventDefault();
      e.stopPropagation();
      clearSlot(resetBtn.dataset.equilatorSlot);
    }
  });
  if (pickerClose) pickerClose.addEventListener("click", closePicker);
  var getHero = function () {
    var c1 = getSlotCard("hero1");
    var c2 = getSlotCard("hero2");
    if (!c1 || !c2 || (c1.r === c2.r && c1.s === c2.s)) return null;
    return [c1, c2];
  };
  var getBoard = function () {
    var out = [];
    for (var i = 1; i <= 5; i++) {
      var c = getSlotCard("board" + i);
      if (c) out.push(c);
    }
    return out;
  };
  var getFixedOpps = function () {
    var numOpp = getNumOpp();
    var out = [];
    for (var o = 0; o < numOpp; o++) {
      var c1 = getSlotCard("opp" + (o * 2 + 1));
      var c2 = getSlotCard("opp" + (o * 2 + 2));
      if (!c1 || !c2 || (c1.r === c2.r && c1.s === c2.s)) out.push(null);
      else out.push([c1, c2]);
    }
    return out;
  };
  var getUsed = function (hero, board, fixedOpps) {
    var used = {};
    hero.forEach(function (c) { used[c.r + "_" + c.s] = true; });
    if (board) board.forEach(function (c) { used[c.r + "_" + c.s] = true; });
    if (fixedOpps) fixedOpps.forEach(function (pair) { if (pair) pair.forEach(function (c) { used[c.r + "_" + c.s] = true; }); });
    return used;
  };
  var deckWithout = function (used) {
    var d = window.equilatorMakeDeck();
    return d.filter(function (c) { return !used[c.r + "_" + c.s]; });
  };
  var shuffle = function (arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  };
  if (!calcBtn) return;
  calcBtn.addEventListener("click", function () {
    var errMsg = null;
    try {
      if (resultBlock) resultBlock.classList.remove("equilator-result--hidden");
      if (resultMeta) resultMeta.textContent = "Проверка…";
      var hero = getHero();
      if (!hero) {
        errMsg = "Выберите две разные карты в руку.";
        if (winPct) winPct.textContent = "—";
        if (tiePct) tiePct.textContent = "—";
        if (oppEquityLines) oppEquityLines.innerHTML = "";
        if (resultMeta) resultMeta.textContent = errMsg;
        return;
      }
      var board = getBoard();
      var fixedOpps = getFixedOpps();
      var numOpp = getNumOpp();
      var used = getUsed(hero, board, fixedOpps);
      var deck = deckWithout(used);
      var needBoard = Math.max(0, 5 - board.length);
      var randomOppCount = 0;
      for (var ro = 0; ro < numOpp; ro++) { if (!fixedOpps[ro]) randomOppCount++; }
      var needRandomCards = needBoard + randomOppCount * 2;
      if (needRandomCards > 0 && deck.length < needRandomCards) {
        errMsg = "Недостаточно карт в колоде.";
        if (winPct) winPct.textContent = "—";
        if (tiePct) tiePct.textContent = "—";
        if (oppEquityLines) oppEquityLines.innerHTML = "";
        if (resultMeta) resultMeta.textContent = errMsg;
        return;
      }
      calcBtn.disabled = true;
      if (winPct) winPct.textContent = "…";
      if (tiePct) tiePct.textContent = "…";
      if (oppEquityLines) oppEquityLines.innerHTML = "<p class=\"equilator-result__line\"><span class=\"equilator-result__label\">…</span></p>";
      var trials = 10000;
      if (resultMeta) resultMeta.textContent = "Прогоняем " + trials.toLocaleString("ru-RU") + " раз";
      var showResult = function (wins, ties, trials, oppWins) {
        var winRaw = (100 * wins / trials);
        var tieRaw = (100 * ties / trials);
        if (winPct) winPct.textContent = winRaw.toFixed(1) + "%";
        if (tiePct) tiePct.textContent = tieRaw.toFixed(1) + "%";
        if (oppEquityLines) {
          var html = "";
          if (oppWins && oppWins.length > 0) {
            for (var i = 0; i < oppWins.length; i++) {
              var pct = (100 * oppWins[i] / trials).toFixed(1);
              var label = oppWins.length === 1 ? "Эквити оппонента на победу:" : "Эквити оппонента " + (i + 1) + " на победу:";
              html += "<p class=\"equilator-result__line\"><span class=\"equilator-result__label\">" + label + "</span> <strong>" + pct + "%</strong></p>";
            }
          } else {
            var oppRaw = 100 - winRaw - tieRaw;
            if (oppRaw < 0) oppRaw = 0;
            html = "<p class=\"equilator-result__line\"><span class=\"equilator-result__label\">Эквити оппонента на победу:</span> <strong>" + oppRaw.toFixed(1) + "%</strong></p>";
          }
          oppEquityLines.innerHTML = html;
        }
        if (resultMeta) resultMeta.textContent = trials === 1 ? "Точный расчёт (известна рука оппонента)." : "По " + trials + " симуляциям.";
        calcBtn.disabled = false;
        var scrollEl = document.scrollingElement || document.documentElement;
        if (scrollEl) scrollEl.scrollBy({ top: 100, behavior: "smooth" });
      };
      var allFixed = board.length === 5 && fixedOpps.every(function (p) { return p !== null; });
      if (allFixed) {
        var boardCardsExact = window.equilatorCloneCards(board);
        var heroHandExact = hero.concat(boardCardsExact);
        var oppHandsExact = fixedOpps.map(function (p) { return p.concat(boardCardsExact); });
        var winsExact = 0, tiesExact = 0;
        var oppWinsExact = [];
        for (var eo = 0; eo < numOpp; eo++) oppWinsExact.push(0);
        if (numOpp === 1) {
          var cmp01 = window.equilatorCompareHands(heroHandExact, oppHandsExact[0]);
          if (cmp01 > 0) winsExact = 1;
          else if (cmp01 < 0) oppWinsExact[0] = 1;
          else tiesExact = 1;
        } else if (numOpp === 2) {
          var cmpHero1 = window.equilatorCompareHands(heroHandExact, oppHandsExact[0]);
          var cmpHero2 = window.equilatorCompareHands(heroHandExact, oppHandsExact[1]);
          var cmp12 = window.equilatorCompareHands(oppHandsExact[0], oppHandsExact[1]);
          if (cmpHero1 > 0 && cmpHero2 > 0) winsExact = 1;
          else if (cmpHero1 < 0 && cmp12 > 0) oppWinsExact[0] = 1;
          else if (cmpHero2 < 0 && cmp12 < 0) oppWinsExact[1] = 1;
          else tiesExact = 1;
        } else {
          var anyLossExact = false;
          var anyTieExact = false;
          for (var eo = 0; eo < numOpp; eo++) {
            var c = window.equilatorCompareHands(heroHandExact, oppHandsExact[eo]);
            if (c < 0) anyLossExact = true;
            if (c === 0) anyTieExact = true;
          }
          winsExact = anyLossExact ? 0 : (anyTieExact ? 0 : 1);
          tiesExact = anyLossExact ? 0 : (anyTieExact ? 1 : 0);
        }
        showResult(winsExact, tiesExact, 1, numOpp <= 2 ? oppWinsExact : null);
        return;
      }
      var wins = 0;
      var ties = 0;
      var oppWins = [];
      for (var ow = 0; ow < numOpp; ow++) oppWins.push(0);
      var run = function (done) {
        var next = 0;
        function step() {
          var batch = 1000;
          for (var b = 0; b < batch && next < trials; b++, next++) {
            var sh = shuffle(deck);
            var boardCards = window.equilatorCloneCards(board);
            for (var bi = 0; bi < needBoard; bi++) {
              boardCards.push(sh[bi]);
            }
            var heroHand = hero.concat(boardCards);
            var heroVal = window.equilatorEvalHand(heroHand);
            var oppHands = [];
            var shOffset = needBoard;
            for (var o = 0; o < numOpp; o++) {
              var o1, o2;
              if (fixedOpps[o]) {
                o1 = fixedOpps[o][0];
                o2 = fixedOpps[o][1];
              } else {
                o1 = sh[shOffset];
                o2 = sh[shOffset + 1];
                shOffset += 2;
              }
              oppHands.push([o1, o2].concat(boardCards));
            }
            if (numOpp === 1) {
              var cmp = window.equilatorCompareHands(heroHand, oppHands[0]);
              if (cmp > 0) wins++;
              else if (cmp < 0) oppWins[0]++;
              else ties++;
            } else if (numOpp === 2) {
              var cmpHero1 = window.equilatorCompareHands(heroHand, oppHands[0]);
              var cmpHero2 = window.equilatorCompareHands(heroHand, oppHands[1]);
              var cmp12 = window.equilatorCompareHands(oppHands[0], oppHands[1]);
              if (cmpHero1 > 0 && cmpHero2 > 0) wins++;
              else if (cmpHero1 < 0 && cmp12 > 0) oppWins[0]++;
              else if (cmpHero2 < 0 && cmp12 < 0) oppWins[1]++;
              else ties++;
            } else {
              var anyLoss = false;
              var anyTie = false;
              for (var o = 0; o < numOpp; o++) {
                var c = window.equilatorCompareHands(heroHand, oppHands[o]);
                if (c < 0) anyLoss = true;
                if (c === 0) anyTie = true;
              }
              if (!anyLoss && anyTie) ties++;
              else if (!anyLoss) wins++;
            }
          }
          if (next < trials) setTimeout(step, 0);
          else done();
        }
        step();
      };
      run(function () {
        showResult(wins, ties, trials, numOpp <= 2 ? oppWins : null);
      });
    } catch (e) {
      calcBtn.disabled = false;
      if (resultMeta) resultMeta.textContent = "Ошибка: " + (e && e.message ? e.message : String(e));
      if (winPct) winPct.textContent = "—";
      if (tiePct) tiePct.textContent = "—";
      if (oppEquityLines) oppEquityLines.innerHTML = "";
    }
  });
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
  var dialogsView = document.getElementById("chatDialogsView");
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
  var findByIdInputDialogs = document.getElementById("chatFindByIdInputDialogs");
  var backBtn = document.getElementById("chatBackBtn");
  var chatGeneralBackBtn = document.getElementById("chatGeneralBackBtn");
  var chatDialogClub = document.getElementById("chatDialogClub");
  var convTitle = document.getElementById("chatConvTitle");
  var convTitleIdWrap = document.getElementById("chatConvTitleIdWrap");
  var convTitleId = document.getElementById("chatConvTitleId");
  var convTitleCopy = document.getElementById("chatConvTitleCopy");
  var CHAT_ADMIN_IDS = ["tg_2144406710", "tg_1897001087", "tg_roman"];
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

  var chatUserModalEl = document.getElementById("chatUserModal");
  var chatUserModalUserId = null;
  var chatUserModalUserName = null;
  var chatNameBtnLongPressHandled = false;
  var chatNameBtnLongPressTimer = null;
  if (chatUserModalEl) {
    var modalTitle = document.getElementById("chatUserModalTitle");
    var modalAvatar = document.getElementById("chatUserModalAvatar");
    var modalAvatarPlaceholder = document.getElementById("chatUserModalAvatarPlaceholder");
    var modalP21 = document.getElementById("chatUserModalP21");
    var modalPersonal = document.getElementById("chatUserModalPersonal");
    var modalLevelText = document.getElementById("chatUserModalLevelText");
    var modalRespectVal = document.getElementById("chatUserModalRespectVal");
    var modalStatusScale = document.getElementById("chatUserModalStatusScale");
    var modalPersonalBlock = document.getElementById("chatUserModalPersonalBlock");
    var modalWriteBtn = document.getElementById("chatUserModalWriteBtn");
    var modalRespectUp = document.getElementById("chatUserModalRespectUp");
    var modalRespectDown = document.getElementById("chatUserModalRespectDown");
    var modalAddFriend = document.getElementById("chatUserModalAddFriend");
    var modalFriendMsg = document.getElementById("chatUserModalFriendMsg");
    var modalBackdrop = chatUserModalEl.querySelector(".chat-user-modal__backdrop");
    var modalClose = chatUserModalEl.querySelector(".chat-user-modal__close");
    function closeChatUserModal() {
      chatUserModalEl.setAttribute("aria-hidden", "true");
      chatUserModalEl.classList.remove("chat-user-modal--open");
    }
    function updateChatUserModalFriendState(isFriend, userName) {
      if (modalAddFriend) {
        modalAddFriend.style.display = isFriend ? "none" : "";
        modalAddFriend.disabled = !!isFriend;
        modalAddFriend.classList.toggle("chat-user-modal__friend-btn--added", !!isFriend);
      }
      if (modalFriendMsg) {
        if (isFriend) {
          modalFriendMsg.textContent = "Теперь " + (userName || "Игрок") + " ваш друг";
          modalFriendMsg.style.display = "";
        } else {
          modalFriendMsg.textContent = "";
          modalFriendMsg.style.display = "none";
        }
      }
    }
    function updateChatUserModalRespectButtons(myVote) {
      if (modalRespectUp) modalRespectUp.disabled = myVote === "up";
      if (modalRespectDown) modalRespectDown.disabled = myVote === "down";
    }
    function openChatUserModalById(id, name, avatarUrl) {
      var userName = name || "Игрок";
      if (!id || !chatUserModalEl) {
        if (id) { setTab("personal"); showConv(id, userName); }
        return;
      }
      chatUserModalUserId = id;
      chatUserModalUserName = userName;
      if (modalTitle) modalTitle.textContent = userName;
      if (modalAvatar && modalAvatarPlaceholder) {
        if (avatarUrl) {
          modalAvatar.src = avatarUrl;
          modalAvatar.alt = userName;
          modalAvatar.style.display = "";
          modalAvatarPlaceholder.style.display = "none";
        } else {
          modalAvatar.removeAttribute("src");
          modalAvatar.style.display = "none";
          modalAvatarPlaceholder.textContent = (userName || "И")[0];
          modalAvatarPlaceholder.style.display = "";
        }
      }
      if (modalP21) modalP21.textContent = "";
      if (modalPersonal) modalPersonal.textContent = "Загрузка…";
      if (modalLevelText) modalLevelText.textContent = "Уровень — из 55";
      if (modalRespectVal) modalRespectVal.textContent = "—";
      if (modalStatusScale) modalStatusScale.style.setProperty("--status-value", "0");
      if (typeof updateChatUserModalRespectButtons === "function") {
        if (modalRespectUp) modalRespectUp.disabled = true;
        if (modalRespectDown) modalRespectDown.disabled = true;
      }
      if (typeof updateChatUserModalFriendState === "function") updateChatUserModalFriendState(false, null);
      chatUserModalEl.setAttribute("aria-hidden", "false");
      chatUserModalEl.classList.add("chat-user-modal--open");
      if (modalPersonalBlock) modalPersonalBlock.classList.add("chat-user-modal__personal-block--hidden");
      fetch(base + "/api/users?userId=" + encodeURIComponent(id))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (modalP21) modalP21.textContent = (data && data.p21Id) ? "P21 ID: " + data.p21Id : "";
          var personalText = (data && data.personalInfo != null) ? String(data.personalInfo).trim() : "";
          if (modalPersonal) modalPersonal.textContent = personalText || "—";
          if (modalPersonalBlock) {
            if (personalText) modalPersonalBlock.classList.remove("chat-user-modal__personal-block--hidden");
            else modalPersonalBlock.classList.add("chat-user-modal__personal-block--hidden");
          }
          if (modalLevelText && data && data.level != null) modalLevelText.textContent = "Уровень " + data.level + " из 55";
          if (modalStatusScale && data && data.statusValue != null) modalStatusScale.style.setProperty("--status-value", String(data.statusValue));
          if (data && data.ok && typeof updateChatUserModalFriendState === "function") updateChatUserModalFriendState(!!data.isFriend, userName);
        })
        .catch(function () {
          if (modalPersonal) modalPersonal.textContent = "—";
        });
      fetch(base + "/api/respect?userId=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok && typeof updateChatUserModalRespectButtons === "function") updateChatUserModalRespectButtons(data.myVote || null);
          if (modalRespectVal) modalRespectVal.textContent = (data && data.score !== undefined && data.score !== null) ? String(data.score) : "—";
        })
        .catch(function () {
          if (typeof updateChatUserModalRespectButtons === "function") updateChatUserModalRespectButtons(null);
        });
    }
    window.openChatUserModalById = openChatUserModalById;
    if (modalBackdrop) modalBackdrop.addEventListener("click", closeChatUserModal);
    if (modalClose) modalClose.addEventListener("click", closeChatUserModal);
    if (modalWriteBtn) {
      modalWriteBtn.addEventListener("click", function () {
        if (chatUserModalUserId) {
          var uid = chatUserModalUserId;
          var uname = chatUserModalUserName || "Игрок";
          closeChatUserModal();
          if (typeof setView === "function") setView("chat");
          if (typeof window.chatOpenConvFromDialogs === "function") window.chatOpenConvFromDialogs(uid, uname);
          else { setTab("personal"); showConv(uid, uname); }
        }
      });
    }
    if (modalRespectUp) {
      modalRespectUp.addEventListener("click", function () {
        if (!chatUserModalUserId || !base || !initData) return;
        if (modalRespectUp.disabled) return;
        modalRespectUp.disabled = true;
        fetch(base + "/api/respect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, targetUserId: chatUserModalUserId, action: "up" }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) {
            updateChatUserModalRespectButtons("up");
            if (modalRespectVal) {
              var n = parseInt(modalRespectVal.textContent, 10);
              modalRespectVal.textContent = (isNaN(n) ? 0 : n) + 1;
            }
          } else {
            modalRespectUp.disabled = false;
            if (tg && tg.showAlert) tg.showAlert(d && d.error === "already_raised" ? "Уже поднимали" : (d && d.error) || "Ошибка");
          }
        }).catch(function () { modalRespectUp.disabled = false; });
      });
    }
    if (modalRespectDown) {
      modalRespectDown.addEventListener("click", function () {
        if (!chatUserModalUserId || !base || !initData) return;
        if (modalRespectDown.disabled) return;
        modalRespectDown.disabled = true;
        fetch(base + "/api/respect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, targetUserId: chatUserModalUserId, action: "down" }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) {
            updateChatUserModalRespectButtons("down");
            if (modalRespectVal) {
              var n = parseInt(modalRespectVal.textContent, 10);
              modalRespectVal.textContent = (isNaN(n) ? 0 : n) - 1;
            }
          } else {
            modalRespectDown.disabled = false;
            if (tg && tg.showAlert) tg.showAlert(d && d.error === "already_lowered" ? "Уже уменьшали" : (d && d.error) || "Ошибка");
          }
        }).catch(function () { modalRespectDown.disabled = false; });
      });
    }
    if (modalAddFriend) {
      modalAddFriend.addEventListener("click", function () {
        if (!chatUserModalUserId || !base || !initData || modalAddFriend.disabled) return;
        modalAddFriend.disabled = true;
        fetch(base + "/api/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, targetUserId: chatUserModalUserId }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.ok) updateChatUserModalFriendState(true, chatUserModalUserName);
          else {
            modalAddFriend.disabled = false;
            if (tg && tg.showAlert) tg.showAlert((d && d.error) || "Ошибка");
          }
        }).catch(function () { modalAddFriend.disabled = false; });
      });
    }
  }
  var respectVotersModalEl = document.getElementById("respectVotersModal");
  if (respectVotersModalEl && !respectVotersModalEl.dataset.bound) {
    respectVotersModalEl.dataset.bound = "1";
    var rvUpEl = document.getElementById("respectVotersModalUp");
    var rvDownEl = document.getElementById("respectVotersModalDown");
    var rvBtnUp = document.getElementById("respectVotersModalBtnUp");
    var rvBtnDown = document.getElementById("respectVotersModalBtnDown");
    function closeRespectVotersModal() {
      respectVotersModalEl.classList.remove("respect-voters-modal--open");
      respectVotersModalEl.setAttribute("aria-hidden", "true");
    }
    function loadRespectVotersList(userId) {
      if (!userId || !rvUpEl || !rvDownEl || !base || !initData) return;
      rvUpEl.textContent = "";
      rvDownEl.textContent = "Загрузка…";
      fetch(base + "/api/respect?userId=" + encodeURIComponent(userId) + "&initData=" + encodeURIComponent(initData) + "&list=1")
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok) {
            var up = Array.isArray(data.up) ? data.up : [];
            var down = Array.isArray(data.down) ? data.down : [];
            rvUpEl.textContent = up.map(function (uid) { return String(uid).replace(/^tg_/, "ID"); }).join(", ") || "Никто";
            rvDownEl.textContent = down.map(function (uid) { return String(uid).replace(/^tg_/, "ID"); }).join(", ") || "Никто";
          } else {
            rvUpEl.textContent = "—";
            rvDownEl.textContent = "—";
          }
        })
        .catch(function () {
          rvUpEl.textContent = "—";
          rvDownEl.textContent = "Ошибка загрузки";
        });
    }
    window._loadRespectVotersList = loadRespectVotersList;
    var rvBackdrop = respectVotersModalEl.querySelector(".respect-voters-modal__backdrop");
    var rvClose = respectVotersModalEl.querySelector(".respect-voters-modal__close");
    if (rvBackdrop) rvBackdrop.addEventListener("click", closeRespectVotersModal);
    if (rvClose) rvClose.addEventListener("click", closeRespectVotersModal);
    if (rvBtnUp) {
      rvBtnUp.addEventListener("click", function () {
        var targetId = respectVotersModalEl.dataset.targetUserId;
        if (!targetId || !base || !initData || rvBtnUp.disabled) return;
        rvBtnUp.disabled = true;
        fetch(base + "/api/respect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, targetUserId: targetId, action: "up" }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          rvBtnUp.disabled = false;
          if (d && d.ok) loadRespectVotersList(targetId);
          else if (tg && tg.showAlert) tg.showAlert(d && d.error === "already_raised" ? "Уже поднимали" : (d && d.error) || "Ошибка");
        }).catch(function () { rvBtnUp.disabled = false; });
      });
    }
    if (rvBtnDown) {
      rvBtnDown.addEventListener("click", function () {
        var targetId = respectVotersModalEl.dataset.targetUserId;
        if (!targetId || !base || !initData || rvBtnDown.disabled) return;
        rvBtnDown.disabled = true;
        fetch(base + "/api/respect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, targetUserId: targetId, action: "down" }),
        }).then(function (r) { return r.json(); }).then(function (d) {
          rvBtnDown.disabled = false;
          if (d && d.ok) loadRespectVotersList(targetId);
          else if (tg && tg.showAlert) tg.showAlert(d && d.error === "already_lowered" ? "Уже уменьшали" : (d && d.error) || "Ошибка");
        }).catch(function () { rvBtnDown.disabled = false; });
      });
    }
  }

  if (!base) {
    generalMessages.innerHTML = "<p class=\"chat-empty\">Не задан адрес API.</p>";
    return;
  }

  var myId = tg && tg.initDataUnsafe && tg.initDataUnsafe.user ? "tg_" + tg.initDataUnsafe.user.id : null;
  var myChatName = (tg && tg.initDataUnsafe && tg.initDataUnsafe.user && (tg.initDataUnsafe.user.first_name || tg.initDataUnsafe.user.username || "Вы")) || "Вы";

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
  function linkUrls(escapedText) {
    if (!escapedText) return "";
    return String(escapedText).replace(/(https?:\/\/[^\s<>&"']+)/g, function (url) {
      var href = url.replace(/&amp;/g, "&");
      return '<a href="' + escapeHtml(href).replace(/"/g, "&quot;") + '" class="chat-msg__link" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
  }
  function linkAppIds(escapedText) {
    if (!escapedText) return "";
    return String(escapedText).replace(/\b(ID\d{6})\b/gi, function (_, id) {
      var idUp = id.toUpperCase();
      return '<button type="button" class="chat-msg__id-link" data-app-id="' + escapeHtml(idUp) + '">' + escapeHtml(idUp) + '</button>';
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
  function closeSwitcherDropdown() {}
  function setTab(tab) {
    chatActiveTab = tab;
    closeSwitcherDropdown();
    if (dialogsView) dialogsView.classList.add("chat-dialogs-view--hidden");
    if (tab === "general") {
      if (generalView) { generalView.classList.remove("chat-general-view--hidden"); generalView.style.display = ""; }
      if (personalView) personalView.classList.add("chat-personal-view--hidden");
      if (adminsView) adminsView.classList.add("chat-admins-view--hidden");
      window.chatGeneralUnread = false;
      scrollGeneralToBottomOnNextRender = true;
      if (generalMessages) {
        generalMessages.scrollTop = generalMessages.scrollHeight;
        requestAnimationFrame(function () { generalMessages.scrollTop = generalMessages.scrollHeight; });
      }
      loadGeneral();
    } else if (tab === "personal") {
      if (!chatWithUserId) {
        showDialogs();
        updateChatHeaderStats();
        updateUnreadDots();
        return;
      }
      if (generalView) { generalView.classList.add("chat-general-view--hidden"); generalView.style.display = "none"; }
      if (personalView) personalView.classList.remove("chat-personal-view--hidden");
      if (adminsView) adminsView.classList.add("chat-admins-view--hidden");
      scrollPersonalToBottomOnNextRender = true;
      loadMessages();
    } else if (tab === "admins") {
      if (generalView) { generalView.classList.add("chat-general-view--hidden"); generalView.style.display = "none"; }
      if (personalView) personalView.classList.add("chat-personal-view--hidden");
      if (adminsView) adminsView.classList.remove("chat-admins-view--hidden");
      loadAdminsOnline();
    }
    if (tab === "personal") window.chatPersonalUnread = false;
    updateChatHeaderStats();
    updateUnreadDots();
  }
  function showDialogs() {
    chatWithUserId = null;
    chatWithUserName = null;
    if (dialogsView) dialogsView.classList.remove("chat-dialogs-view--hidden");
    if (generalView) generalView.classList.add("chat-general-view--hidden");
    if (personalView) personalView.classList.add("chat-personal-view--hidden");
    if (listView) listView.classList.add("chat-list-view--hidden");
    if (convView) convView.classList.add("chat-conv-view--hidden");
    generalView.style.display = "none";
    if (window._chatGeneralCache && window._chatGeneralCache.messages && typeof updateClubChatPreview === "function") updateClubChatPreview(window._chatGeneralCache.messages);
    else loadGeneral();
    loadContacts();
    updateAdminShiftOnline();
    updateChatHeaderStats();
    updateUnreadDots();
  }
  var scrollGeneralToBottomOnNextRender = false;
  var scrollPersonalToBottomOnNextRender = false;
  function openClubChat() {
    if (typeof window.closeChatNavDropdown === "function") window.closeChatNavDropdown();
    if (dialogsView) dialogsView.classList.add("chat-dialogs-view--hidden");
    if (generalView) {
      generalView.classList.remove("chat-general-view--hidden");
      generalView.style.display = "";
    }
    if (personalView) personalView.classList.add("chat-personal-view--hidden");
    window.chatGeneralUnread = false;
    chatActiveTab = "general";
    scrollGeneralToBottomOnNextRender = true;
    if (generalMessages) {
      generalMessages.scrollTop = generalMessages.scrollHeight;
      requestAnimationFrame(function () { generalMessages.scrollTop = generalMessages.scrollHeight; });
    }
    loadGeneral();
    updateChatHeaderStats();
  }
  function openConvFromDialogs(userId, userName, dtId) {
    if (typeof window.closeChatNavDropdown === "function") window.closeChatNavDropdown();
    if (dialogsView) dialogsView.classList.add("chat-dialogs-view--hidden");
    if (generalView) generalView.classList.add("chat-general-view--hidden");
    generalView.style.display = "none";
    if (personalView) personalView.classList.remove("chat-personal-view--hidden");
    if (listView) listView.classList.add("chat-list-view--hidden");
    if (convView) convView.classList.remove("chat-conv-view--hidden");
    setTab("personal");
    showConv(userId, userName || userId, dtId);
  }
  window.chatSetTab = setTab;
  window.chatShowDialogs = showDialogs;
  window.chatOpenConvFromDialogs = openConvFromDialogs;

  var CHAT_LAST_VIEWED_KEY = "chat_last_viewed";
  var stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(CHAT_LAST_VIEWED_KEY) || "{}");
  } catch (e) { stored = {}; }
  var lastViewedGeneral = stored && stored.general != null ? stored.general : null;
  var lastViewedPersonal = (stored && stored.personal && typeof stored.personal === "object") ? stored.personal : {};
  function saveChatLastViewed() {
    try {
      localStorage.setItem(CHAT_LAST_VIEWED_KEY, JSON.stringify({ general: lastViewedGeneral, personal: lastViewedPersonal }));
    } catch (e) {}
  }
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
    updateChatNavDot();
  }
  window.chatGeneralUnread = false;
  window.chatPersonalUnread = false;
  window.chatGeneralUnreadCount = 0;
  window.chatPersonalUnreadCount = 0;

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
  document.body.addEventListener("click", function (e) {
    var idLink = e.target && e.target.closest ? e.target.closest(".chat-msg__id-link") : null;
    if (!idLink || !idLink.dataset || !idLink.dataset.appId) return;
    e.preventDefault();
    e.stopPropagation();
    var id = idLink.dataset.appId;
    if (!id || !/^ID\d{6}$/.test(id)) return;
    fetch(base + "/api/users?id=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.userId) {
          showConv(data.userId, data.userName || data.userId, data.dtId);
          setTab("personal");
        } else {
          if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Не найдено");
        }
      })
      .catch(function () {
        if (tg && tg.showAlert) tg.showAlert("Ошибка сети");
      });
  });

  function loadGeneral() {
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&mode=general";
    fetch(url).then(function (r) { return r.json().catch(function () { return { ok: false, error: "Ошибка ответа" }; }); }).then(function (data) {
      if (data && data.ok) {
        chatIsAdmin = !!data.isAdmin;
        var messages = data.messages || [];
        var pending = window._pendingGeneralMessage;
        if (pending && pending.id && !messages.some(function (m) { return m.id === pending.id; })) {
          messages = messages.concat([pending]);
        }
        window._pendingGeneralMessage = null;
        window._chatGeneralCache = { messages: messages, participantsCount: data.participantsCount, onlineCount: data.onlineCount };
        var latest = messages.length ? (messages[messages.length - 1].time || "") : "";
        var isChatViewActive = !!document.querySelector('[data-view="chat"].view--active');
        var isGeneralScreenVisible = generalView && !generalView.classList.contains("chat-general-view--hidden");
        var lastView = lastViewedGeneral != null ? lastViewedGeneral : "";
        var unreadCount = messages.filter(function (m) { return (m.time || "") > lastView && m.from !== myId; }).length;
        if (isChatViewActive && chatActiveTab === "general" && isGeneralScreenVisible) {
          lastViewedGeneral = latest;
          saveChatLastViewed();
          window.chatGeneralUnread = false;
          window.chatGeneralUnreadCount = 0;
        } else if (latest && (lastViewedGeneral == null || latest > lastViewedGeneral)) {
          window.chatGeneralUnread = true;
          window.chatGeneralUnreadCount = unreadCount > 0 ? unreadCount : 1;
        } else {
          window.chatGeneralUnread = false;
          window.chatGeneralUnreadCount = 0;
        }
        var total = data.participantsCount != null ? data.participantsCount : "—";
        var online = data.onlineCount != null ? data.onlineCount : "—";
        window.lastGeneralStats = total + " уч · " + online + " онл";
        updateChatHeaderStats();
        if (isChatViewActive && chatActiveTab === "general" && !chatIsEditingMessage) {
          var sig = generalMessagesSignature(messages);
          if (scrollGeneralToBottomOnNextRender || sig !== lastGeneralMessagesSig) {
            if (sig !== lastGeneralMessagesSig) lastGeneralMessagesSig = sig;
            renderGeneralMessages(messages);
          }
        }
        updateUnreadDots();
        if (typeof updateDialogUnreadBadges === "function") updateDialogUnreadBadges();
        if (typeof updateClubChatPreview === "function") updateClubChatPreview(messages);
      } else if (chatActiveTab === "general" && generalMessages) {
        generalMessages.innerHTML = "<p class=\"chat-empty\">" + (data && data.error ? escapeHtml(data.error) : "Ошибка загрузки") + "</p>";
      }
    }).catch(function () { if (chatActiveTab === "general" && generalMessages) generalMessages.innerHTML = "<p class=\"chat-empty\">Ошибка сети</p>"; });
  }

  var generalReplyTo = null;
  var personalReplyTo = null;
  var generalImage = null;
  var personalImage = null;
  var generalDocument = null;
  var personalDocument = null;
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

  // Уровень 1 из 55 = двойка треф (2♣), уровень 2 = тройка треф (3♣), и т.д. параллельно по колоде (трефы 1–13, бубны 14–26, черви 27–39, пики 40–52, джокеры 53–54, 55 = Бог покера).
  function levelToStatusText(level) {
    var n = parseInt(level, 10);
    if (isNaN(n) || n < 1) return null;
    if (n === 53) return "джокер обычный";
    if (n === 54) return "джокер сияющий";
    if (n >= 55) return "Бог покера";
    var value = ((n - 1) % 13) + 2;
    var cardName = value <= 10 ? String(value) : value === 11 ? "валет" : value === 12 ? "дама" : value === 13 ? "король" : "туз";
    var suit = n <= 13 ? "треф" : n <= 26 ? "бубны" : n <= 39 ? "черви" : "пики";
    return cardName + " " + suit;
  }
  function levelToStatusCard(level) {
    var n = parseInt(level, 10);
    if (isNaN(n) || n < 1) return "2\u2663";
    if (n === 53) return "джокер обычный";
    if (n === 54) return "джокер сияющий";
    if (n >= 55) return "Бог покера";
    var value = ((n - 1) % 13) + 2;
    var cardChar = value <= 10 ? String(value) : value === 11 ? "J" : value === 12 ? "Q" : value === 13 ? "K" : "A";
    var suitSym = n <= 13 ? "\u2663" : n <= 26 ? "\u2666" : n <= 39 ? "\u2665" : "\u2660";
    return cardChar + suitSym;
  }
  function renderGeneralMessages(messages) {
    if (!messages || messages.length === 0) {
      generalMessages.innerHTML = '<p class="chat-empty">Нет сообщений. Напишите первым!</p>';
      return;
    }
    var html = messages.map(function (m, i) {
      var prev = i > 0 ? messages[i - 1] : null;
      var next = i < messages.length - 1 ? messages[i + 1] : null;
      var sameUser = function (a, b) {
        if (!a || !b || a.from == null || a.from === "" || b.from == null || b.from === "") return false;
        return String(a.from) === String(b.from);
      };
      var isFirstInGroup = !prev || !sameUser(prev, m);
      var isLastInGroup = !next || !sameUser(next, m);
      var isOwn = myId && String(m.from) === String(myId);
      var cls = isOwn ? "chat-msg chat-msg--own" : "chat-msg chat-msg--other";
      var dataAttrs = "";
      if (isOwn && m.id) {
        dataAttrs = ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-own="true"';
        if (!m.image && !m.voice && !m.document && (m.text != null)) dataAttrs += ' data-msg-text="' + escapeHtml(String(m.text || "")) + '"';
      } else if (!isOwn && m.id) {
        dataAttrs = ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-from="' + escapeHtml(m.from || "") + '" data-msg-from-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"';
      }
      var time = m.time ? new Date(m.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
      var text = linkUrls(linkAppIds(linkTgUsernames((m.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"))));
      var imgBlock = m.image ? '<img class="chat-msg__image" src="' + escapeHtml(m.image) + '" alt="Картинка" loading="lazy" />' : "";
      var voiceBlock = m.voice ? '<audio class="chat-msg__voice" controls src="' + escapeHtml(m.voice) + '"></audio>' : "";
      var documentBlock = m.document ? '<span class="chat-msg__document chat-msg__document-wrap">' + '<a class="chat-msg__document-link chat-msg__document-link--view" href="' + escapeHtml(m.document) + '">📄 ' + escapeHtml(m.documentName || "document.pdf") + '</a> <a class="chat-msg__document-link" href="' + escapeHtml(m.document) + '" download="' + escapeHtml(m.documentName || "document.pdf") + '">Скачать</a></span>' : "";
      var cornerDelBtn = "";
      var editBtn = "";
      var blockBtn = "";
      var replyBlock = m.replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(m.replyTo.fromName || "Игрок") + ':</strong> ' + escapeHtml(String(m.replyTo.text || "").slice(0, 80)) + (String(m.replyTo.text || "").length > 80 ? "…" : "") + '</div>' : "";
      var adminBadge = m.fromAdmin ? '<span class="chat-msg__admin">(админ)</span>' : "";
      var editedBadge = m.edited ? '<span class="chat-msg__edited">(отредактировано)</span>' : "";
      var avatarEl = isLastInGroup
        ? (m.fromAvatar ? '<img class="chat-msg__avatar" src="' + escapeHtml(m.fromAvatar) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + (m.fromName || "И")[0] + '</span>')
        : '<span class="chat-msg__avatar-spacer"></span>';
      var nameStr = escapeHtml(m.fromName || "Игрок");
      var p21Str = m.fromP21Id ? escapeHtml(m.fromP21Id) : "\u2014";
      var rankCard = m.fromStatus != null ? (levelToStatusCard(m.fromStatus) || String(m.fromStatus)) : "2\u2663";
      var respectVal = m.fromRespect !== undefined && m.fromRespect !== null ? (m.fromRespect === 0 ? "\u2014" : String(m.fromRespect)) : "\u2014";
      var respectClass = "chat-msg__respect";
      if (m.fromRespect > 0) respectClass += " chat-msg__respect--positive";
      else if (m.fromRespect < 0) respectClass += " chat-msg__respect--negative";
      var respectDataAttrs = !isOwn && m.from ? ' data-user-id="' + escapeHtml(m.from) + '" data-user-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"' : "";
      var sep = '<span class="chat-msg__meta-sep"> · </span>';
      var metaLineParts = '<span class="chat-msg__name">' + nameStr + "</span>" + sep + '<span class="chat-msg__p21-inline">P21: ' + p21Str + "</span>" + sep + '<span class="chat-msg__rank-inline">' + escapeHtml(rankCard) + "</span>";
      var respectPart = '<span class="chat-msg__respect-row chat-msg__respect-inline"' + respectDataAttrs + '><span class="' + respectClass + '" title="Уважение в чате">Уважение: ' + escapeHtml(respectVal) + "</span></span>";
      var pmAvatarAttr = !isOwn && m.fromAvatar ? ' data-pm-avatar="' + escapeHtml(m.fromAvatar) + '"' : "";
      var nameEl = isOwn
        ? '<div class="chat-msg__meta-line">' + metaLineParts + sep + respectPart + "</div>"
        : '<button type="button" class="chat-msg__name-btn" data-pm-id="' + escapeHtml(m.from) + '" data-pm-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"' + pmAvatarAttr + '><div class="chat-msg__meta-line">' + metaLineParts + "</div></button>" + sep + respectPart;
      var textBlock = (text || imgBlock || voiceBlock || documentBlock) ? '<div class="chat-msg__text">' + imgBlock + voiceBlock + documentBlock + text + '</div>' : "";
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
      var reactionsRow = m.id ? '<div class="chat-msg__reactions-wrap"><span class="chat-msg__reactions">' + reactionsHtml + '</span></div>' : "";
      var metaBlock = isFirstInGroup ? nameEl + adminBadge : "";
      var bodyClass = "chat-msg__body" + (text && text.trim() ? " chat-msg__body--has-text" : "");
      return '<div class="' + cls + '"' + dataAttrs + '><div class="chat-msg__row">' + avatarEl + '<div class="' + bodyClass + '">' + cornerDelBtn + '<div class="chat-msg__meta">' + metaBlock + '</div>' + replyBlock + textBlock + '<div class="chat-msg__footer">' + '<span class="chat-msg__time">' + time + '</span>' + editedBadge + '</div>' + reactionsRow + '</div></div></div>';
    }).join("");
    var prevScrollTop = generalMessages.scrollTop;
    var prevScrollHeight = generalMessages.scrollHeight;
    var wasNearBottom = prevScrollHeight - prevScrollTop - generalMessages.clientHeight < 80;
    generalMessages.innerHTML = html;
    function restoreScroll(clearScrollFlag) {
      var maxScroll = generalMessages.scrollHeight - generalMessages.clientHeight;
      if (scrollGeneralToBottomOnNextRender || wasNearBottom || maxScroll <= 0) {
        generalMessages.scrollTop = generalMessages.scrollHeight;
        if (clearScrollFlag && scrollGeneralToBottomOnNextRender) scrollGeneralToBottomOnNextRender = false;
      } else {
        generalMessages.scrollTop = Math.min(prevScrollTop, Math.max(0, maxScroll));
      }
    }
    restoreScroll(false);
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        restoreScroll(true);
      });
    });
    generalMessages.querySelectorAll(".chat-msg__name-btn").forEach(function (btn) {
      var avatar = btn.dataset.pmAvatar || "";
      function openUserModal() {
        openChatUserModalById(btn.dataset.pmId, btn.dataset.pmName, avatar);
      }
      btn.addEventListener("click", function () {
        if (chatNameBtnLongPressHandled) {
          chatNameBtnLongPressHandled = false;
          return;
        }
        openUserModal();
      });
      btn.addEventListener("touchstart", function () {
        if (chatNameBtnLongPressTimer) return;
        chatNameBtnLongPressTimer = setTimeout(function () {
          chatNameBtnLongPressTimer = null;
          chatNameBtnLongPressHandled = true;
          if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
          openUserModal();
        }, 500);
      }, { passive: true });
      btn.addEventListener("touchend", function () {
        if (chatNameBtnLongPressTimer) {
          clearTimeout(chatNameBtnLongPressTimer);
          chatNameBtnLongPressTimer = null;
        }
      });
      btn.addEventListener("touchcancel", function () {
        if (chatNameBtnLongPressTimer) {
          clearTimeout(chatNameBtnLongPressTimer);
          chatNameBtnLongPressTimer = null;
        }
      });
      btn.addEventListener("mousedown", function () {
        if (chatNameBtnLongPressTimer) return;
        chatNameBtnLongPressTimer = setTimeout(function () {
          chatNameBtnLongPressTimer = null;
          chatNameBtnLongPressHandled = true;
          if (tg && tg.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
          openUserModal();
        }, 500);
      });
      btn.addEventListener("mouseup", function () {
        if (chatNameBtnLongPressTimer) {
          clearTimeout(chatNameBtnLongPressTimer);
          chatNameBtnLongPressTimer = null;
        }
      });
      btn.addEventListener("mouseleave", function () {
        if (chatNameBtnLongPressTimer) {
          clearTimeout(chatNameBtnLongPressTimer);
          chatNameBtnLongPressTimer = null;
        }
      });
    });
    generalMessages.querySelectorAll(".chat-msg__respect-row[data-user-id]").forEach(function (row) {
      row.addEventListener("click", function () {
        var id = row.dataset.userId;
        if (!id || !initData || !base) return;
        var modal = document.getElementById("respectVotersModal");
        if (!modal) return;
        modal.dataset.targetUserId = id;
        modal.classList.add("respect-voters-modal--open");
        modal.setAttribute("aria-hidden", "false");
        if (typeof window._loadRespectVotersList === "function") window._loadRespectVotersList(id);
      });
    });
    generalMessages.querySelectorAll(".chat-msg__delete").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var id = btn.dataset.msgId;
        if (!id) return;
        if (!confirm("Удалить сообщение?")) return;
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
        requestAnimationFrame(function () {
          if (msgEl && msgEl.scrollIntoView) msgEl.scrollIntoView({ block: "center", behavior: "auto" });
        });
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
    var ctxMenu = document.getElementById("chatContextMenu");
    var ctxBackdrop = document.getElementById("chatContextBackdrop");
    var longPressTimer = null;
    var menuOpenedAt = 0;
    var ctxOpenedForEl = null;
    function showMenu(el, msg) {
      chatCtxMsg = msg;
      chatCtxSource = source;
      ctxOpenedForEl = el;
      if (!ctxMenu) return;
      var isOwn = !!msg.own;
      var canEdit = isOwn && !msg.hasImage && !msg.hasVoice && !msg.hasDocument;
      var canDelete = isOwn || !!chatIsAdmin;
      ctxMenu.querySelectorAll("[data-action=\"delete\"]").forEach(function (item) {
        item.style.display = canDelete ? "" : "none";
      });
      ctxMenu.querySelectorAll("[data-action=\"edit\"]").forEach(function (item) {
        item.style.display = canEdit ? "" : "none";
      });
      if (ctxBackdrop) {
        ctxBackdrop.classList.add("chat-ctx-backdrop--visible");
        ctxBackdrop.setAttribute("aria-hidden", "false");
      }
      el.classList.add("chat-msg--ctx-highlight");
      if (el.scrollIntoView) el.scrollIntoView({ block: "center", behavior: "auto" });
      var GAP = 10;
      var menuWidth = 280;
      var bottomNavHeight = 96;
      var maxBottom = window.innerHeight - bottomNavHeight;
      ctxMenu.style.width = menuWidth + "px";
      ctxMenu.style.maxWidth = (window.innerWidth - 24) + "px";
      ctxMenu.style.top = "-9999px";
      ctxMenu.style.left = "12px";
      ctxMenu.classList.add("chat-ctx-menu--visible");
      ctxMenu.setAttribute("aria-hidden", "false");
      menuOpenedAt = Date.now();
      requestAnimationFrame(function () {
        var menuHeight = ctxMenu.offsetHeight;
        var rect = el.getBoundingClientRect();
        var menuTop = rect.bottom + GAP;
        if (menuTop + menuHeight > maxBottom) menuTop = rect.top - GAP - menuHeight;
        if (menuTop < 12 && el.scrollIntoView) {
          el.scrollIntoView({ block: "center", behavior: "auto" });
          requestAnimationFrame(function () {
            var r2 = el.getBoundingClientRect();
            var top2 = r2.bottom + GAP;
            if (top2 + menuHeight > maxBottom) top2 = r2.top - GAP - menuHeight;
            top2 = Math.max(12, Math.min(top2, maxBottom - menuHeight));
            var left2 = Math.max(12, Math.min(Math.round(r2.left + r2.width / 2 - menuWidth / 2), window.innerWidth - menuWidth - 12));
            ctxMenu.style.top = top2 + "px";
            ctxMenu.style.left = left2 + "px";
          });
        } else {
          menuTop = Math.max(12, Math.min(menuTop, maxBottom - menuHeight));
          var menuLeft = Math.max(12, Math.min(Math.round(rect.left + rect.width / 2 - menuWidth / 2), window.innerWidth - menuWidth - 12));
          ctxMenu.style.top = menuTop + "px";
          ctxMenu.style.left = menuLeft + "px";
        }
      });
    }
    function hideMenu() {
      if (ctxOpenedForEl) {
        ctxOpenedForEl.classList.remove("chat-msg--ctx-highlight");
        ctxOpenedForEl = null;
      }
      if (ctxBackdrop) {
        ctxBackdrop.classList.remove("chat-ctx-backdrop--visible");
        ctxBackdrop.setAttribute("aria-hidden", "true");
      }
      if (ctxMenu) {
        ctxMenu.classList.remove("chat-ctx-menu--visible");
        ctxMenu.setAttribute("aria-hidden", "true");
      }
      chatCtxMsg = null;
      chatCtxSource = null;
      if (typeof menuPointerDown !== "undefined") menuPointerDown = false;
      if (typeof currentActiveItem !== "undefined") currentActiveItem = null;
    }
    function attachToEl(el) {
      function onLongPress() {
        var textEl = el.querySelector(".chat-msg__text");
        var text = textEl ? (textEl.textContent || "").trim() : "";
        var hasImage = !!el.querySelector(".chat-msg__image");
        var hasVoice = !!el.querySelector(".chat-msg__voice");
        var hasDocument = !!el.querySelector(".chat-msg__document");
        var isOwn = el.classList.contains("chat-msg--own");
        showMenu(el, {
          id: el.dataset.msgId,
          from: el.dataset.msgFrom || "",
          fromName: (el.dataset.msgFromName || "Игрок").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"),
          text: text,
          hasImage: hasImage,
          hasVoice: hasVoice,
          hasDocument: hasDocument,
          own: isOwn,
          msgText: isOwn ? (el.dataset.msgText || "").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&') : "",
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
        onLongPress();
      });
    }
    container.querySelectorAll(".chat-msg[data-msg-id]").forEach(attachToEl);
    if (ctxMenu && !ctxMenu.dataset.chatCtxBound) {
      ctxMenu.dataset.chatCtxBound = "1";
      if (ctxBackdrop) ctxBackdrop.addEventListener("click", hideMenu);
      function closeIfOutside(e) {
        if (!ctxMenu.classList.contains("chat-ctx-menu--visible")) return;
        if (ctxMenu.contains(e.target)) return;
        if (ctxBackdrop && ctxBackdrop.contains(e.target)) return;
        if (ctxOpenedForEl && (e.target === ctxOpenedForEl || ctxOpenedForEl.contains(e.target))) return;
        hideMenu();
      }
      document.addEventListener("click", closeIfOutside);
      function runAction(action, activeEl) {
        var msg = chatCtxMsg;
        var src = chatCtxSource;
        var el = ctxOpenedForEl;
        hideMenu();
        if (!msg) return;
        if (action === "react" && activeEl && activeEl.dataset.emoji) {
          sendReaction(msg.id, activeEl.dataset.emoji, src, src === "personal" ? chatWithUserId : "");
          return;
        }
        if (action === "reply") {
          generalReplyTo = personalReplyTo = null;
          var quotePreviewText = (msg.text && msg.text.slice(0, 60)) || (msg.hasImage ? "[Фото]" : msg.hasVoice ? "[Голосовое сообщение]" : msg.hasDocument ? "[Документ]" : "");
          if (msg.text && msg.text.length > 60) quotePreviewText += "…";
          if (src === "general") {
            generalReplyTo = msg;
            var prev = document.getElementById("chatGeneralReplyPreview");
            if (prev) {
              prev.querySelector(".chat-reply-preview__text").textContent = "Ответ на " + (msg.fromName || "Игрок") + ": " + quotePreviewText;
              prev.classList.add("chat-reply-preview--visible");
            }
            if (generalInput) generalInput.focus();
          } else {
            personalReplyTo = msg;
            var prevP = document.getElementById("chatPersonalReplyPreview");
            if (prevP) {
              prevP.querySelector(".chat-reply-preview__text").textContent = "Ответ на " + (msg.fromName || "Игрок") + ": " + quotePreviewText;
              prevP.classList.add("chat-reply-preview--visible");
            }
            if (inputEl) inputEl.focus();
          }
        } else if (action === "copy") {
          if (msg.text && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(msg.text).then(function () {
              if (tg && tg.showAlert) tg.showAlert("Скопировано");
            });
          }
        } else if (action === "edit" && msg.own && el) {
          var msgId = msg.id;
          var oldText = msg.msgText != null ? msg.msgText : (msg.text || "");
          var msgEl = el;
          var textEl = msgEl && msgEl.querySelector(".chat-msg__text");
          if (!textEl || !msgId) return;
          chatIsEditingMessage = true;
          var origHtml = textEl.innerHTML;
          textEl.innerHTML = '<div class="chat-msg__edit-form"><input type="text" class="chat-input chat-msg__edit-input" value="' + escapeHtml(oldText) + '" maxlength="500" /><div class="chat-msg__edit-actions"><button type="button" class="chat-msg__edit-save">Сохранить</button><button type="button" class="chat-msg__edit-cancel">Отмена</button></div></div>';
          var inputElEdit = textEl.querySelector(".chat-msg__edit-input");
          var saveBtn = textEl.querySelector(".chat-msg__edit-save");
          var cancelBtn = textEl.querySelector(".chat-msg__edit-cancel");
          if (inputElEdit) inputElEdit.focus();
          requestAnimationFrame(function () {
            if (msgEl && msgEl.scrollIntoView) msgEl.scrollIntoView({ block: "center", behavior: "auto" });
          });
          function closeEdit() { textEl.innerHTML = origHtml; chatIsEditingMessage = false; }
          saveBtn.addEventListener("click", function () {
            var newText = (inputElEdit.value || "").trim();
            if (!newText) return;
            fetch(base + "/api/chat", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ initData: initData, action: "edit", messageId: msgId, text: newText }),
            }).then(function (r) { return r.json(); }).then(function (d) {
              chatIsEditingMessage = false;
              if (d && d.ok) {
                if (src === "general") loadGeneral();
                else loadMessages();
              } else if (tg && tg.showAlert) tg.showAlert((d && d.error) || "Ошибка");
            }).catch(function () { chatIsEditingMessage = false; });
          });
          cancelBtn.addEventListener("click", closeEdit);
        } else if (action === "delete" && (msg.own || chatIsAdmin)) {
          if (!confirm("Удалить сообщение?")) return;
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
        }
      }
      var menuPointerDown = false;
      var currentActiveItem = null;
      function setActiveItem(item) {
        ctxMenu.querySelectorAll(".chat-ctx-menu__item--active").forEach(function (b) { b.classList.remove("chat-ctx-menu__item--active"); });
        currentActiveItem = item;
        if (item) item.classList.add("chat-ctx-menu__item--active");
      }
      function onMenuPointerMove(e) {
        if (!menuPointerDown || !ctxMenu.classList.contains("chat-ctx-menu--visible")) return;
        var under = document.elementFromPoint(e.clientX, e.clientY);
        var item = under && under.closest ? (under.closest(".chat-ctx-menu__item") || under.closest(".chat-ctx-menu__reaction-emoji")) : null;
        if (item && ctxMenu.contains(item)) setActiveItem(item);
        else setActiveItem(null);
      }
      function onMenuPointerUp(e) {
        if (!menuPointerDown) return;
        menuPointerDown = false;
        setActiveItem(null);
      }
      function bindMenuButton(btn) {
        btn.addEventListener("pointerdown", function (e) {
          e.preventDefault();
          e.stopPropagation();
          menuPointerDown = true;
          setActiveItem(btn);
        });
        btn.addEventListener("click", function (e) {
          e.preventDefault();
          e.stopPropagation();
          if (btn.dataset.action) runAction(btn.dataset.action, btn);
        });
      }
      ctxMenu.querySelectorAll(".chat-ctx-menu__item").forEach(bindMenuButton);
      ctxMenu.querySelectorAll(".chat-ctx-menu__reaction-emoji").forEach(bindMenuButton);
      document.addEventListener("pointermove", onMenuPointerMove);
      document.addEventListener("pointerup", onMenuPointerUp);
      document.addEventListener("pointercancel", onMenuPointerUp);
    }
  }

  var sendingGeneral = false;
  function appendOptimisticGeneralMessage(text, image, voice, document, replyTo) {
    if (!generalMessages) return;
    var emptyEl = generalMessages.querySelector(".chat-empty");
    if (emptyEl) generalMessages.innerHTML = "";
    var authAvatarEl = document.getElementById("authUserAvatar");
    var myAvatarUrl = (authAvatarEl && authAvatarEl.src && authAvatarEl.src.indexOf("data:") !== 0 && authAvatarEl.src.indexOf("http") === 0) ? authAvatarEl.src : "";
    var optAvatarEl = myAvatarUrl ? '<img class="chat-msg__avatar" src="' + escapeHtml(myAvatarUrl) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + (myChatName[0] || "Я") + '</span>';
    var time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    var replyBlock = replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(replyTo.fromName || "Игрок") + ":</strong> " + escapeHtml(String(replyTo.text || "").slice(0, 80)) + (String(replyTo.text || "").length > 80 ? "…" : "") + "</div>" : "";
    var textContent = "";
    if (image) textContent = '<img class="chat-msg__image" src="' + escapeHtml(image) + '" alt="Картинка" />';
    else if (voice) textContent = '<audio class="chat-msg__voice" controls src="' + escapeHtml(voice) + '"></audio>';
    else if (document && document.dataUrl && document.fileName) textContent = '<span class="chat-msg__document chat-msg__document-wrap">' + '<a class="chat-msg__document-link chat-msg__document-link--view" href="' + escapeHtml(document.dataUrl) + '">📄 ' + escapeHtml(document.fileName) + '</a> <a class="chat-msg__document-link" href="' + escapeHtml(document.dataUrl) + '" download="' + escapeHtml(document.fileName) + '">Скачать</a></span>';
    else if (text) textContent = linkUrls(linkAppIds(linkTgUsernames(escapeHtml(text).replace(/\n/g, "<br>"))));
    var optMeta = '<div class="chat-msg__name-row"><span class="chat-msg__name">' + escapeHtml(myChatName) + '</span></div><div class="chat-msg__p21-line">P21_ID: —</div><div class="chat-msg__rank-line">Ранг: <span class="chat-msg__rank-card">2♣</span></div>';
    var optBodyClass = "chat-msg__body" + (text && !image && !voice && !document ? " chat-msg__body--has-text" : "");
    var html = '<div class="chat-msg chat-msg--own" data-optimistic="true"><div class="chat-msg__row">' + optAvatarEl + '<div class="' + optBodyClass + '"><div class="chat-msg__meta">' + optMeta + '</div>' + replyBlock + '<div class="chat-msg__text">' + textContent + '</div><div class="chat-msg__footer"><span class="chat-msg__time">' + time + '</span></div></div></div></div>';
    var wrap = document.createElement("div");
    wrap.innerHTML = html;
    generalMessages.appendChild(wrap.firstElementChild);
    generalMessages.scrollTop = generalMessages.scrollHeight;
  }
  function sendGeneral() {
    var text = (generalInput && generalInput.value || "").trim();
    if ((!text && !generalImage && !generalVoice && !generalDocument) || !initData || sendingGeneral) return;
    if (!initData) { if (tg && tg.showAlert) tg.showAlert("Откройте в Telegram."); return; }
    sendingGeneral = true;
    if (generalSendBtn) generalSendBtn.disabled = true;
    var body = { initData: initData, text: text };
    if (generalImage) body.image = generalImage;
    if (generalVoice) body.voice = generalVoice;
    if (generalDocument) { body.document = generalDocument.dataUrl; body.documentName = generalDocument.fileName; }
    if (generalReplyTo) {
      var replyText = (generalReplyTo.text && String(generalReplyTo.text).trim()) || (generalReplyTo.hasImage ? "[Фото]" : generalReplyTo.hasVoice ? "[Голосовое сообщение]" : generalReplyTo.hasDocument ? "[Документ]" : "\u2014");
      body.replyTo = { id: generalReplyTo.id, from: generalReplyTo.from, fromName: generalReplyTo.fromName || "Игрок", text: replyText };
    }
    var optText = text;
    var optImage = generalImage || null;
    var optVoice = generalVoice || null;
    var optDocument = generalDocument ? { dataUrl: generalDocument.dataUrl, fileName: generalDocument.fileName } : null;
    var optReply = generalReplyTo ? { fromName: generalReplyTo.fromName || "Игрок", text: generalReplyTo.text || "" } : null;
    if (generalInput) {
      generalInput.value = "";
      generalInput.blur();
    }
    generalReplyTo = null;
    generalImage = null;
    generalDocument = null;
    generalVoice = null;
    var prevEl = document.getElementById("chatGeneralReplyPreview");
    if (prevEl) { prevEl.classList.remove("chat-reply-preview--visible"); prevEl.querySelector(".chat-reply-preview__text").textContent = ""; }
    var imgPrev = document.getElementById("chatGeneralImagePreview");
    if (imgPrev) { imgPrev.classList.remove("chat-image-preview--visible"); imgPrev.innerHTML = ""; }
    var voicePrev = document.getElementById("chatGeneralVoicePreview");
    if (voicePrev) voicePrev.classList.add("chat-voice-preview--hidden");
    appendOptimisticGeneralMessage(optText, optImage, optVoice, optDocument, optReply);
    if (generalSendBtn) generalSendBtn.disabled = false;
    fetch(base + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); }).then(function (data) {
      sendingGeneral = false;
      if (data && data.ok) {
        var opt = generalMessages && generalMessages.querySelector('[data-optimistic="true"]');
        if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
        var msg = data.message;
        if (msg && msg.id) {
          window._pendingGeneralMessage = msg;
          var cache = window._chatGeneralCache || { messages: [], participantsCount: null, onlineCount: null };
          if (Array.isArray(cache.messages) && !cache.messages.some(function (m) { return m.id === msg.id; })) {
            var msgs = cache.messages.concat([msg]);
            window._chatGeneralCache = { messages: msgs, participantsCount: cache.participantsCount, onlineCount: cache.onlineCount };
            lastGeneralMessagesSig = null;
            if (chatActiveTab === "general" && !chatIsEditingMessage) {
              lastGeneralMessagesSig = generalMessagesSignature(msgs);
              renderGeneralMessages(msgs);
            }
          }
        }
        loadGeneral();
      } else {
        var opt = generalMessages && generalMessages.querySelector('[data-optimistic="true"]');
        if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
        if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
      }
    }).catch(function () {
      sendingGeneral = false;
      var opt = generalMessages && generalMessages.querySelector('[data-optimistic="true"]');
      if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
      if (tg && tg.showAlert) tg.showAlert("Ошибка сети");
    });
  }

  function showList() {
    chatWithUserId = null;
    if (listView) listView.classList.remove("chat-list-view--hidden");
    if (convView) convView.classList.add("chat-conv-view--hidden");
    updateChatHeaderStats();
    loadContacts();
  }

  function showConv(userId, userName, dtIdFromContact) {
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
    if (convTitleIdWrap && convTitleId && convTitleCopy) {
      convTitleIdWrap.classList.remove("chat-conv-title__id-wrap--hidden");
      var displayId = (dtIdFromContact && String(dtIdFromContact).trim()) || "—";
      convTitleId.textContent = displayId;
      convTitleCopy.onclick = function () {
        var toCopy = (convTitleId && convTitleId.textContent) || "";
        if (toCopy === "—") toCopy = "";
        if (!toCopy) { if (tg && tg.showAlert) tg.showAlert("ID пока неизвестен"); return; }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(toCopy).then(function () { if (tg && tg.showAlert) tg.showAlert("ID скопирован"); }, function () { if (tg && tg.showAlert) tg.showAlert("Не удалось скопировать"); });
        } else { if (tg && tg.showAlert) tg.showAlert("Копирование недоступно"); }
      };
    }
    updateChatHeaderStats();
    scrollPersonalToBottomOnNextRender = true;
    if (messagesEl) {
      messagesEl.innerHTML = '<p class="chat-empty">Загрузка...</p>';
      messagesEl.scrollTop = 0;
    }
    loadMessages();
  }

  function updateDialogUnreadBadges() {
    var clubEl = document.getElementById("chatDialogClubUnread");
    if (clubEl) {
      var n = window.chatGeneralUnreadCount || 0;
      var txt = n > 99 ? "99+" : (n > 0 ? String(n) : "");
      clubEl.textContent = txt;
      clubEl.classList.toggle("chat-dialog-item__unread--visible", n > 0);
      clubEl.setAttribute("aria-hidden", n > 0 ? "false" : "true");
      clubEl.setAttribute("aria-label", n > 0 ? "Непрочитанных: " + txt : "");
    }
    var adminUnread = window.chatAdminUnread || {};
    if (dialogsView) dialogsView.querySelectorAll(".chat-dialog-item__unread[data-dialog-unread-for]").forEach(function (el) {
      var id = el.getAttribute("data-dialog-unread-for");
      var n = id ? (adminUnread[id] || 0) : 0;
      var txt = n > 99 ? "99+" : (n > 0 ? String(n) : "");
      el.textContent = txt;
      el.classList.toggle("chat-dialog-item__unread--visible", n > 0);
      el.setAttribute("aria-hidden", n > 0 ? "false" : "true");
      el.setAttribute("aria-label", n > 0 ? "Непрочитанных: " + txt : "");
    });
  }

  function updateClubChatPreview(messages) {
    var el = document.getElementById("chatDialogClubPreview");
    if (!el) return;
    if (!messages || messages.length === 0) {
      el.textContent = "Нет сообщений";
      return;
    }
    var last = messages[messages.length - 1];
    var name = (last.fromName || "Игрок").trim();
    var snippet = "";
    if (last.image) snippet = "[Фото]";
    else if (last.voice) snippet = "[Голосовое]";
    else if (last.document) snippet = "[Документ]";
    else if (last.text) snippet = String(last.text).trim().replace(/\s+/g, " ").slice(0, 50);
    if (snippet && snippet.length >= 50) snippet += "…";
    el.textContent = snippet ? name + ": " + snippet : name;
  }

  function loadContacts() {
    if (!contactsEl) return;
    var lastViewedParam = "";
    try {
      var lv = Object.assign({}, lastViewedPersonal || {});
      if (lastViewedGeneral != null) lv.general = lastViewedGeneral;
      lastViewedParam = "&lastViewed=" + encodeURIComponent(JSON.stringify(lv));
    } catch (e) {}
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&mode=contacts" + lastViewedParam;
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (data && data.ok && Array.isArray(data.contacts)) {
        chatIsAdmin = !!data.isAdmin;
        window.chatAdminUnread = data.adminUnread || {};
        var genUnread = data.generalUnreadCount != null ? data.generalUnreadCount : 0;
        window.chatGeneralUnreadCount = genUnread;
        window.chatGeneralUnread = genUnread > 0;
        var total = data.participantsCount != null ? data.participantsCount : "—";
        var online = data.onlineCount != null ? data.onlineCount : "—";
        window.lastListStats = total + " конт · " + online + " онл";
        updateChatHeaderStats();
        if (data.contacts.length === 0) {
          contactsEl.innerHTML = '<p class="chat-empty">Пока нет личных переписок. Напишите кому-то по ID выше или дождитесь ответа.</p>';
        } else {
          var firstChar = function (name) { return (name || "?").toString().replace(/^@/, "")[0] || "?"; };
          contactsEl.innerHTML = data.contacts.map(function (c) {
            var dtSpan = c.dtId ? '<span class="chat-contact__dt">' + escapeHtml(c.dtId) + '</span>' : "";
            var adminBadge = c.admin ? '<span class="chat-contact__admin" aria-label="админ">админ</span>' : "";
            var onlineBadge = c.online ? '<span class="chat-contact__online" aria-label="онлайн">онлайн</span>' : "";
            var badgesBlock = (adminBadge || onlineBadge) ? '<span class="chat-contact__badges">' + adminBadge + onlineBadge + '</span>' : "";
            var unreadBadge = (c.unreadCount > 0) ? '<span class="chat-contact__unread chat-contact__unread--visible" aria-label="Непрочитано: ' + (c.unreadCount > 99 ? '99+' : c.unreadCount) + '">' + (c.unreadCount > 99 ? "99+" : c.unreadCount) + '</span>' : '';
            var initial = firstChar(c.name);
            var avatarEl = c.avatar
              ? '<img class="chat-contact__avatar" src="' + escapeHtml(c.avatar) + '" alt="" loading="lazy" />'
              : '<span class="chat-contact__avatar chat-contact__avatar--placeholder">' + initial + '</span>';
            return '<button type="button" class="chat-contact" tabindex="-1" data-chat-id="' + escapeHtml(c.id) + '" data-chat-name="' + escapeHtml(c.name) + '" data-chat-initial="' + escapeHtml(initial) + '"' + (c.dtId ? ' data-chat-dt-id="' + escapeHtml(c.dtId) + '"' : '') + '>' + avatarEl + '<span class="chat-contact__main"><span class="chat-contact__name-row"><span class="chat-contact__name">' + escapeHtml(c.name) + '</span>' + badgesBlock + '</span>' + dtSpan + '</span>' + unreadBadge + '</button>';
          }).join("");
          updateDialogUnreadBadges();
          contactsEl.querySelectorAll(".chat-contact img.chat-contact__avatar").forEach(function (img) {
            img.onerror = function () {
              var contact = this.closest(".chat-contact");
              if (!contact) return;
              var initial = contact.dataset.chatInitial || "?";
              var place = document.createElement("span");
              place.className = "chat-contact__avatar chat-contact__avatar--placeholder";
              place.textContent = initial;
              if (this.parentNode) this.parentNode.replaceChild(place, this);
            };
          });
          if (typeof window.chatAttachDialogButtons === "function") window.chatAttachDialogButtons();
        }
      }
    }).catch(function () { contactsEl.innerHTML = "<p class=\"chat-empty\">Ошибка</p>"; });
  }


  function loadAdminsOnline() {
    if (!adminsView || !initData) return;
    var url = base + "/api/chat?initData=" + encodeURIComponent(initData) + "&mode=adminOnline";
    fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data || !data.ok || !Array.isArray(data.onlineAdminIds)) return;
      var onlineSet = new Set(data.onlineAdminIds);
      adminsView.querySelectorAll(".chat-manager-btn[data-chat-user-id]").forEach(function (btn) {
        var id = btn.dataset.chatUserId;
        var onEl = btn.querySelector(".chat-admins-view__online");
        if (onEl) onEl.classList.toggle("chat-admins-view__online--visible", onlineSet.has(id));
      });
    }).catch(function () {});
  }

  function renderMessages(messages) {
    if (!messagesEl) return;
    if (!messages || messages.length === 0) {
      messagesEl.innerHTML = '<p class="chat-empty">Нет сообщений.</p>';
      return;
    }
    var html = messages.map(function (m, i) {
      var prev = i > 0 ? messages[i - 1] : null;
      var next = i < messages.length - 1 ? messages[i + 1] : null;
      var sameUser = function (a, b) {
        if (!a || !b || a.from == null || a.from === "" || b.from == null || b.from === "") return false;
        return String(a.from) === String(b.from);
      };
      var isFirstInGroup = !prev || !sameUser(prev, m);
      var isLastInGroup = !next || !sameUser(next, m);
      var isOwn = myId && String(m.from) === String(myId);
      var cls = isOwn ? "chat-msg chat-msg--own" : "chat-msg chat-msg--other";
      var dataAttrs = "";
      if (isOwn && m.id) {
        dataAttrs = ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-own="true"';
        if (!m.image && !m.voice && !m.document && (m.text != null)) dataAttrs += ' data-msg-text="' + escapeHtml(String(m.text || "")) + '"';
      } else if (!isOwn && m.id) {
        dataAttrs = ' data-msg-id="' + escapeHtml(m.id) + '" data-msg-from="' + escapeHtml(m.from || "") + '" data-msg-from-name="' + escapeHtml(m.fromName || m.fromDtId || "Игрок") + '"';
      }
      var time = m.time ? new Date(m.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
      var text = linkUrls(linkAppIds(linkTgUsernames((m.text || "").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/&/g, "&amp;"))));
      var imgBlock = m.image ? '<img class="chat-msg__image" src="' + escapeHtml(m.image) + '" alt="Картинка" loading="lazy" />' : "";
      var voiceBlock = m.voice ? '<audio class="chat-msg__voice" controls src="' + escapeHtml(m.voice) + '"></audio>' : "";
      var documentBlock = m.document ? '<span class="chat-msg__document chat-msg__document-wrap">' + '<a class="chat-msg__document-link chat-msg__document-link--view" href="' + escapeHtml(m.document) + '">📄 ' + escapeHtml(m.documentName || "document.pdf") + '</a> <a class="chat-msg__document-link" href="' + escapeHtml(m.document) + '" download="' + escapeHtml(m.documentName || "document.pdf") + '">Скачать</a></span>' : "";
      var cornerDelBtnP = "";
      var editBtnP = "";
      var replyBlock = m.replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(m.replyTo.fromName || "Игрок") + ':</strong> ' + escapeHtml(String(m.replyTo.text || "").slice(0, 80)) + (String(m.replyTo.text || "").length > 80 ? "…" : "") + '</div>' : "";
      var adminBadge = m.fromAdmin ? '<span class="chat-msg__admin">(админ)</span>' : "";
      var editedBadge = m.edited ? '<span class="chat-msg__edited">(отредактировано)</span>' : "";
      var avatarEl = isLastInGroup
        ? (m.fromAvatar ? '<img class="chat-msg__avatar" src="' + escapeHtml(m.fromAvatar) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + (m.fromName || "И")[0] + '</span>')
        : '<span class="chat-msg__avatar-spacer"></span>';
      var nameStrP = escapeHtml(m.fromName || "Игрок");
      var p21StrP = m.fromP21Id ? escapeHtml(m.fromP21Id) : "\u2014";
      var rankCardP = m.fromStatus != null ? (levelToStatusCard(m.fromStatus) || String(m.fromStatus)) : "2\u2663";
      var rankRowP = '<div class="chat-msg__rank-line">Ранг: <span class="chat-msg__rank-card">' + escapeHtml(rankCardP) + '</span></div>';
      var p21RowP = '<div class="chat-msg__p21-line">P21_ID: ' + p21StrP + "</div>";
      var nameRowP = '<div class="chat-msg__name-row"><span class="chat-msg__name">' + nameStrP + "</span></div>";
      var metaBlockP = nameRowP + p21RowP + rankRowP;
      var nameElP = isOwn ? metaBlockP : '<span class="chat-msg__name-block">' + metaBlockP + "</span>";
      var textBlock = (text || imgBlock || voiceBlock || documentBlock) ? '<div class="chat-msg__text">' + imgBlock + voiceBlock + documentBlock + text + '</div>' : "";
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
      var reactionsRowP = m.id ? '<div class="chat-msg__reactions-wrap"><span class="chat-msg__reactions">' + reactionsHtmlP + '</span></div>' : "";
      var metaBlockP = isFirstInGroup ? nameElP + adminBadge : "";
      var bodyClassP = "chat-msg__body" + (text && text.trim() ? " chat-msg__body--has-text" : "");
      return '<div class="' + cls + '"' + dataAttrs + '><div class="chat-msg__row">' + avatarEl + '<div class="' + bodyClassP + '">' + cornerDelBtnP + '<div class="chat-msg__meta">' + metaBlockP + '</div>' + replyBlock + textBlock + '<div class="chat-msg__footer">' + '<span class="chat-msg__time">' + time + '</span>' + editedBadge + '</div>' + reactionsRowP + '</div></div></div>';
    }).join("");
    var prevScrollTopP = messagesEl.scrollTop;
    var prevScrollHeightP = messagesEl.scrollHeight;
    var wasNearBottomP = prevScrollHeightP - prevScrollTopP - messagesEl.clientHeight < 80;
    messagesEl.innerHTML = html;
    function restoreScrollP() {
      var maxScrollP = messagesEl.scrollHeight - messagesEl.clientHeight;
      if (scrollPersonalToBottomOnNextRender || wasNearBottomP || maxScrollP <= 0) {
        if (scrollPersonalToBottomOnNextRender) scrollPersonalToBottomOnNextRender = false;
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
        if (!confirm("Удалить сообщение?")) return;
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
        requestAnimationFrame(function () {
          if (msgEl && msgEl.scrollIntoView) msgEl.scrollIntoView({ block: "center", behavior: "auto" });
        });
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
        var pending = window._pendingPersonalMessage;
        if (pending && pending.id && chatWithUserId === (window._pendingPersonalWith || "")) {
          if (!messages.some(function (m) { return m.id === pending.id; })) messages = messages.concat([pending]);
        }
        window._pendingPersonalMessage = null;
        window._pendingPersonalWith = null;
        var pt = data.participantsCount != null ? data.participantsCount : "—";
        var ol = data.onlineCount != null ? data.onlineCount : "—";
        window.lastConvStats = pt + " уч · " + ol + " онл";
        updateChatHeaderStats();
        if (data.otherDtId != null && convTitleId) {
          convTitleId.textContent = String(data.otherDtId).trim() || "—";
        }
        var latest = messages.length ? (messages[messages.length - 1].time || "") : "";
        var isChatViewActive = !!document.querySelector('[data-view="chat"].view--active');
        var lastView = (chatWithUserId && lastViewedPersonal[chatWithUserId] != null) ? lastViewedPersonal[chatWithUserId] : "";
        var unreadCount = messages.filter(function (m) { return (m.time || "") > lastView && m.from === chatWithUserId; }).length;
        if (isChatViewActive && chatActiveTab === "personal" && convView && !convView.classList.contains("chat-conv-view--hidden")) {
          lastViewedPersonal[chatWithUserId] = latest;
          saveChatLastViewed();
          window.chatPersonalUnread = false;
          window.chatPersonalUnreadCount = 0;
        } else if (latest && chatWithUserId && (lastViewedPersonal[chatWithUserId] == null || latest > lastViewedPersonal[chatWithUserId])) {
          window.chatPersonalUnread = true;
          window.chatPersonalUnreadCount = unreadCount > 0 ? unreadCount : 1;
        } else {
          window.chatPersonalUnread = false;
          window.chatPersonalUnreadCount = 0;
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
  function appendOptimisticPersonalMessage(text, image, voice, document, replyTo) {
    if (!messagesEl) return false;
    try {
      var emptyEl = messagesEl.querySelector(".chat-empty");
      if (emptyEl) messagesEl.innerHTML = "";
      var authAvatarEl = document.getElementById("authUserAvatar");
      var myAvatarUrl = (authAvatarEl && authAvatarEl.src && authAvatarEl.src.indexOf("data:") !== 0 && authAvatarEl.src.indexOf("http") === 0) ? authAvatarEl.src : "";
      var nameStr = (myChatName != null && myChatName !== "") ? String(myChatName) : "Вы";
      var initial = nameStr[0] || "Я";
      var optAvatarEl = myAvatarUrl ? '<img class="chat-msg__avatar" src="' + escapeHtml(myAvatarUrl) + '" alt="" />' : '<span class="chat-msg__avatar chat-msg__avatar--placeholder">' + escapeHtml(initial) + '</span>';
      var time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      var replyBlock = replyTo ? '<div class="chat-msg__reply"><strong>' + escapeHtml(String(replyTo.fromName || "Игрок").slice(0, 100)) + ":</strong> " + escapeHtml(String(replyTo.text || "").slice(0, 80)) + (String(replyTo.text || "").length > 80 ? "…" : "") + "</div>" : "";
      var textContent = "";
      if (image) textContent = '<img class="chat-msg__image" src="' + escapeHtml(String(image)) + '" alt="Картинка" />';
      else if (voice) textContent = '<audio class="chat-msg__voice" controls src="' + escapeHtml(String(voice)) + '"></audio>';
      else if (document && document.dataUrl && document.fileName) textContent = '<span class="chat-msg__document chat-msg__document-wrap">' + '<a class="chat-msg__document-link chat-msg__document-link--view" href="' + escapeHtml(document.dataUrl) + '">📄 ' + escapeHtml(document.fileName) + '</a> <a class="chat-msg__document-link" href="' + escapeHtml(document.dataUrl) + '" download="' + escapeHtml(document.fileName) + '">Скачать</a></span>';
      else if (text) textContent = linkUrls(linkAppIds(linkTgUsernames(escapeHtml(String(text)).replace(/\n/g, "<br>"))));
      var optMeta = '<div class="chat-msg__name-row"><span class="chat-msg__name">' + escapeHtml(nameStr) + '</span></div><div class="chat-msg__p21-line">P21_ID: —</div><div class="chat-msg__rank-line">Ранг: <span class="chat-msg__rank-card">2♣</span></div>';
      var optBodyClassP = "chat-msg__body" + (text && !image && !voice && !document ? " chat-msg__body--has-text" : "");
      var html = '<div class="chat-msg chat-msg--own" data-optimistic="true"><div class="chat-msg__row">' + optAvatarEl + '<div class="' + optBodyClassP + '"><div class="chat-msg__meta">' + optMeta + '</div>' + replyBlock + '<div class="chat-msg__text">' + textContent + '</div><div class="chat-msg__footer"><span class="chat-msg__time">' + time + '</span></div></div></div></div>';
      var wrap = document.createElement("div");
      wrap.innerHTML = html;
      var first = wrap.firstElementChild;
      if (!first) return false;
      messagesEl.appendChild(first);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return true;
    } catch (e) {
      return false;
    }
  }
  function sendMessage() {
    var text = (inputEl && inputEl.value || "").trim();
    if ((!text && !personalImage && !personalVoice && !personalDocument) || !chatWithUserId || !initData || sendingPrivate) {
      if (!chatWithUserId && (text || personalImage || personalVoice || personalDocument) && tg && tg.showAlert) tg.showAlert("Выберите собеседника");
      if (!initData && (text || personalImage || personalVoice || personalDocument) && tg && tg.showAlert) tg.showAlert("Откройте приложение в Telegram");
      return;
    }
    if (!messagesEl) {
      if (tg && tg.showAlert) tg.showAlert("Ошибка: чат не загружен");
      return;
    }
    sendingPrivate = true;
    if (sendBtn) sendBtn.disabled = true;
    var body = { initData: initData, with: chatWithUserId, text: text };
    if (personalImage) body.image = personalImage;
    if (personalVoice) body.voice = personalVoice;
    if (personalDocument) { body.document = personalDocument.dataUrl; body.documentName = personalDocument.fileName; }
    if (personalReplyTo) {
      var replyTextP = (personalReplyTo.text && String(personalReplyTo.text).trim()) || (personalReplyTo.hasImage ? "[Фото]" : personalReplyTo.hasVoice ? "[Голосовое сообщение]" : personalReplyTo.hasDocument ? "[Документ]" : "\u2014");
      body.replyTo = { id: personalReplyTo.id, from: personalReplyTo.from, fromName: personalReplyTo.fromName || "Игрок", text: replyTextP };
    }
    var optText = text;
    var optImage = personalImage || null;
    var optVoice = personalVoice || null;
    var optDocument = personalDocument ? { dataUrl: personalDocument.dataUrl, fileName: personalDocument.fileName } : null;
    var optReply = personalReplyTo ? { fromName: personalReplyTo.fromName || "Игрок", text: personalReplyTo.text || "" } : null;
    if (inputEl) {
      inputEl.value = "";
      inputEl.blur();
    }
    personalReplyTo = null;
    personalImage = null;
    personalDocument = null;
    personalVoice = null;
    var prevEl = document.getElementById("chatPersonalReplyPreview");
    if (prevEl) { prevEl.classList.remove("chat-reply-preview--visible"); prevEl.querySelector(".chat-reply-preview__text").textContent = ""; }
    var imgPrev = document.getElementById("chatPersonalImagePreview");
    if (imgPrev) { imgPrev.classList.remove("chat-image-preview--visible"); imgPrev.innerHTML = ""; }
    var voicePrevP = document.getElementById("chatPersonalVoicePreview");
    if (voicePrevP) voicePrevP.classList.add("chat-voice-preview--hidden");
    try {
      appendOptimisticPersonalMessage(optText, optImage, optVoice, optDocument, optReply);
    } catch (err) {}
    if (sendBtn) sendBtn.disabled = false;
    if (typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
    var hasUpload = !!(body.document || body.image || body.voice);
    var progressWrap = document.getElementById("chatPersonalUploadProgress");
    var progressFill = document.getElementById("chatPersonalUploadProgressFill");
    var progressLabel = document.getElementById("chatPersonalUploadProgressLabel");
    function hideProgress() {
      if (progressWrap) {
        progressWrap.classList.remove("chat-upload-progress--visible");
        progressWrap.setAttribute("aria-hidden", "true");
      }
      if (progressFill) progressFill.style.width = "0%";
    }
    function handleResponse(data) {
      sendingPrivate = false;
      hideProgress();
      if (data && data.ok) {
        var opt = messagesEl && messagesEl.querySelector('[data-optimistic="true"]');
        if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
        var msg = data.message;
        if (msg && msg.id && chatWithUserId) {
          window._pendingPersonalMessage = msg;
          window._pendingPersonalWith = chatWithUserId;
        }
        lastPersonalMessagesSig = null;
        loadMessages();
      } else {
        var opt = messagesEl && messagesEl.querySelector('[data-optimistic="true"]');
        if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
        if (inputEl) inputEl.value = optText;
        if (typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
        if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Ошибка");
      }
    }
    function handleError() {
      sendingPrivate = false;
      hideProgress();
      var opt = messagesEl && messagesEl.querySelector('[data-optimistic="true"]');
      if (opt && opt.parentNode) opt.parentNode.removeChild(opt);
      if (inputEl) inputEl.value = optText;
      if (typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
      if (tg && tg.showAlert) tg.showAlert("Ошибка сети или файл слишком большой");
    }
    if (hasUpload && progressWrap && progressFill && typeof XMLHttpRequest !== "undefined") {
      if (progressLabel) progressLabel.textContent = "Отправка…";
      progressWrap.classList.add("chat-upload-progress--visible");
      progressWrap.setAttribute("aria-hidden", "false");
      progressFill.style.width = "0%";
      var bodyStr = JSON.stringify(body);
      var xhr = new XMLHttpRequest();
      xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable && progressFill) progressFill.style.width = Math.round((e.loaded / e.total) * 100) + "%";
        else if (progressFill) progressFill.style.width = "50%";
      });
      xhr.addEventListener("load", function () {
        var data = null;
        try {
          data = JSON.parse(xhr.responseText || "{}");
        } catch (err) {}
        if (xhr.status >= 200 && xhr.status < 300) {
          handleResponse(data);
        } else {
          var errMsg = "Не удалось отправить";
          if (xhr.status === 413) errMsg = "Файл слишком большой. Попробуйте документ до 8 МБ.";
          else if (data && data.error) errMsg = data.error;
          handleResponse({ ok: false, error: errMsg });
        }
      });
      xhr.addEventListener("error", handleError);
      xhr.addEventListener("abort", handleError);
      xhr.open("POST", base + "/api/chat");
      xhr.setRequestHeader("Content-Type", "application/json");
      xhr.send(bodyStr);
    } else {
      fetch(base + "/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(function (r) {
        if (!r.ok) {
          return r.text().then(function (t) {
            var errMsg = "Не удалось отправить";
            if (r.status === 413) errMsg = "Файл слишком большой. Попробуйте документ до 8 МБ.";
            else {
              try {
                var j = JSON.parse(t);
                if (j && j.error) errMsg = j.error;
              } catch (e) {}
            }
            return { ok: false, error: errMsg };
          });
        }
        return r.json();
      }).then(function (data) {
        handleResponse(data);
      }).catch(handleError);
    }
  }

  if (!chatListenersAttached) {
    chatListenersAttached = true;
    window.chatListenersAttached = true;
    (function () {
      function getVisibleMessagesEl() {
        if (chatActiveTab === "general" && generalView && !generalView.classList.contains("chat-general-view--hidden")) return generalMessages;
        if (chatActiveTab === "personal" && convView && !convView.classList.contains("chat-conv-view--hidden")) return messagesEl;
        return null;
      }
      function scrollDocumentToZero() {
        var se = document.scrollingElement;
        if (se && se.scrollTop !== 0) se.scrollTop = 0;
        if (document.documentElement && document.documentElement.scrollTop !== 0) document.documentElement.scrollTop = 0;
        if (document.body && document.body.scrollTop !== 0) document.body.scrollTop = 0;
      }
      function setChatKeyboardOpen(open) {
        var el = getVisibleMessagesEl();
        var savedScroll = el ? el.scrollTop : 0;
        if (open) {
          document.documentElement.classList.add("chat-keyboard-open");
          document.body.classList.add("chat-keyboard-open");
        } else {
          document.documentElement.classList.remove("chat-keyboard-open");
          document.body.classList.remove("chat-keyboard-open");
        }
        scrollDocumentToZero();
        if (el && savedScroll > 0) {
          requestAnimationFrame(function () {
            el.scrollTop = savedScroll;
            requestAnimationFrame(function () { el.scrollTop = savedScroll; });
          });
        }
      }
      function onChatInputFocus() {
        scrollDocumentToZero();
        var el = getVisibleMessagesEl();
        document.documentElement.classList.add("chat-keyboard-open");
        document.body.classList.add("chat-keyboard-open");
        scrollDocumentToZero();
        function scrollMessagesToBottom() {
          scrollDocumentToZero();
          if (el) el.scrollTop = el.scrollHeight;
        }
        requestAnimationFrame(function () {
          scrollMessagesToBottom();
          requestAnimationFrame(scrollMessagesToBottom);
        });
        setTimeout(scrollMessagesToBottom, 50);
        setTimeout(scrollMessagesToBottom, 150);
        setTimeout(scrollMessagesToBottom, 400);
      }
      function onChatInputBlur() {
        setTimeout(function () {
          var active = document.activeElement;
          if (active !== generalInput && active !== inputEl) {
            scrollDocumentToZero();
            var el = getVisibleMessagesEl();
            var savedScroll = el ? el.scrollTop : 0;
            document.documentElement.classList.remove("chat-keyboard-open");
            document.body.classList.remove("chat-keyboard-open");
            scrollDocumentToZero();
            if (el && savedScroll > 0) {
              requestAnimationFrame(function () {
                el.scrollTop = savedScroll;
              });
            }
          }
        }, 0);
      }
      if (generalInput) {
        generalInput.addEventListener("focus", onChatInputFocus);
        generalInput.addEventListener("blur", onChatInputBlur);
      }
      if (inputEl) {
        inputEl.addEventListener("focus", onChatInputFocus);
        inputEl.addEventListener("blur", onChatInputBlur);
      }
    })();
    window.chatRefresh = function () {
      if (chatActiveTab === "general" && generalMessages && window._chatGeneralCache && window._chatGeneralCache.messages && window._chatGeneralCache.messages.length) {
        renderGeneralMessages(window._chatGeneralCache.messages);
        if (window._chatGeneralCache.participantsCount != null || window._chatGeneralCache.onlineCount != null) {
          window.lastGeneralStats = (window._chatGeneralCache.participantsCount != null ? window._chatGeneralCache.participantsCount : "—") + " уч · " + (window._chatGeneralCache.onlineCount != null ? window._chatGeneralCache.onlineCount : "—") + " онл";
          updateChatHeaderStats();
        }
      }
      setTab(chatActiveTab);
      if (chatWithUserId) showConv(chatWithUserId, chatWithUserName);
      else showDialogs();
    };
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
    if (backBtn) backBtn.addEventListener("click", showDialogs);
    if (findByIdBtn && findByIdInput) {
      function findByIdAndOpen() {
        var raw = (findByIdInput.value || "").trim();
        var byId = false;
        var idPart = raw.replace(/^@/, "").toUpperCase();
        if (/^\d{6}$/.test(idPart) || (/^ID\d{6}$/.test(idPart))) {
          byId = true;
        } else if (idPart.startsWith("ID") && idPart.length === 8 && /^ID\d{6}$/.test(idPart)) {
          byId = true;
        }
        var url;
        if (byId) {
          var id = idPart.startsWith("ID") ? idPart : "ID" + idPart;
          url = base + "/api/users?id=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData);
        } else {
          var nick = raw.replace(/^@/, "").trim();
          if (!nick) {
            if (tg && tg.showAlert) tg.showAlert("Введите ID (ID123456) или ник (@username)");
            return;
          }
          url = base + "/api/users?username=" + encodeURIComponent(nick) + "&initData=" + encodeURIComponent(initData);
        }
        findByIdBtn.disabled = true;
        fetch(url)
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
    var generalPdfInput = document.getElementById("chatGeneralPdfInput");
    var generalAttachBtn = document.getElementById("chatGeneralAttachBtn");
    var generalAttachDropdown = document.getElementById("chatGeneralAttachDropdown");
    var generalImagePreview = document.getElementById("chatGeneralImagePreview");
    function closeGeneralAttachDropdown() {
      if (generalAttachDropdown) { generalAttachDropdown.classList.add("chat-attach-dropdown--hidden"); generalAttachDropdown.setAttribute("aria-hidden", "true"); }
      if (generalAttachBtn) generalAttachBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", generalAttachDropdownOutside);
    }
    function generalAttachDropdownOutside(e) {
      if (generalAttachDropdown && !generalAttachDropdown.contains(e.target) && generalAttachBtn && !generalAttachBtn.contains(e.target)) closeGeneralAttachDropdown();
    }
    if (generalAttachBtn && generalFileInput) {
      generalAttachBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (generalAttachDropdown && generalAttachDropdown.classList.contains("chat-attach-dropdown--hidden")) {
          generalAttachDropdown.classList.remove("chat-attach-dropdown--hidden");
          generalAttachDropdown.setAttribute("aria-hidden", "false");
          generalAttachBtn.setAttribute("aria-expanded", "true");
          setTimeout(function () { document.addEventListener("click", generalAttachDropdownOutside); }, 0);
        } else closeGeneralAttachDropdown();
      });
      if (generalAttachDropdown) {
        generalAttachDropdown.querySelectorAll(".chat-attach-dropdown__item").forEach(function (item) {
          item.addEventListener("click", function (e) {
            e.stopPropagation();
            var action = item.getAttribute("data-action");
            if (action === "photo") generalFileInput.click();
            else if (action === "document" && generalPdfInput) generalPdfInput.click();
            else if (action === "contact" && typeof openConvFromDialogs === "function") openConvFromDialogs(item.getAttribute("data-user-id"), item.getAttribute("data-user-name"));
            closeGeneralAttachDropdown();
          });
        });
      }
      generalFileInput.addEventListener("change", function () {
        var f = generalFileInput.files && generalFileInput.files[0];
        if (!f || !f.type.startsWith("image/")) return;
        generalDocument = null;
        resizeImage(f, 240, 240, 0.8).then(function (dataUrl) {
          generalImage = dataUrl;
          updateGeneralSendBtnIcon();
          if (generalImagePreview) {
            generalImagePreview.innerHTML = '<img class="chat-image-preview__thumb" src="' + dataUrl.replace(/"/g, "&quot;") + '" alt="" /><button type="button" class="chat-image-preview__remove">Убрать</button>';
            generalImagePreview.classList.add("chat-image-preview--visible");
            generalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
              generalImage = null; generalFileInput.value = "";
              updateGeneralSendBtnIcon();
              generalImagePreview.classList.remove("chat-image-preview--visible"); generalImagePreview.innerHTML = "";
            });
          }
        }).catch(function () { if (tg && tg.showAlert) tg.showAlert("Не удалось обработать изображение"); });
        generalFileInput.value = "";
      });
      if (generalPdfInput) {
        generalPdfInput.addEventListener("change", function () {
          var f = generalPdfInput.files && generalPdfInput.files[0];
          if (!f || f.type !== "application/pdf") return;
          if (f.size > 8 * 1024 * 1024) {
            if (tg && tg.showAlert) tg.showAlert("Файл слишком большой. Максимум 8 МБ.");
            generalPdfInput.value = "";
            return;
          }
          generalImage = null;
          var reader = new FileReader();
          reader.onload = function () {
            var dataUrl = reader.result;
            if (dataUrl && typeof dataUrl === "string" && dataUrl.indexOf("data:application/pdf") === 0) {
              generalDocument = { dataUrl: dataUrl, fileName: (f.name || "document.pdf").replace(/[^\w\s.-]/g, "") || "document.pdf" };
              updateGeneralSendBtnIcon();
              if (generalImagePreview) {
                generalImagePreview.innerHTML = '<span class="chat-image-preview__doc">📄 ' + escapeHtml(generalDocument.fileName) + '</span><button type="button" class="chat-image-preview__remove">Убрать</button>';
                generalImagePreview.classList.add("chat-image-preview--visible");
                generalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
                  generalDocument = null; generalPdfInput.value = "";
                  updateGeneralSendBtnIcon();
                  generalImagePreview.classList.remove("chat-image-preview--visible"); generalImagePreview.innerHTML = "";
                });
              }
            } else if (tg && tg.showAlert) tg.showAlert("Не удалось прочитать файл");
          };
          reader.onerror = function () { if (tg && tg.showAlert) tg.showAlert("Не удалось прочитать файл"); };
          reader.readAsDataURL(f);
          generalPdfInput.value = "";
        });
      }
    }
    var CHAT_EMOJIS = ["😀","😃","😄","😁","😅","😂","🤣","😊","😇","🙂","😉","😍","🥰","😘","😗","😋","😛","😜","🤪","😎","🤩","🥳","👍","👎","👏","🙌","🤝","🙏","❤️","🧡","💛","💚","💙","💜","🖤","🤍","💔","🔥","⭐","✨","💯","🎉","🎊","🤔","😐","😑","😶","🙄","😏","😣","😢","😭","😤","😡","🤬","😈","💀","👋","✌️","🤞","💪","🐶","🐱","🎲","♠️","♥️","♦️","♣️"];
    var chatEmojiPicker = document.getElementById("chatEmojiPicker");
    var chatEmojiPickerGrid = document.getElementById("chatEmojiPickerGrid");
    var chatGeneralEmojiBtn = document.getElementById("chatGeneralEmojiBtn");
    var chatPersonalEmojiBtn = document.getElementById("chatPersonalEmojiBtn");
    var chatEmojiPickerTargetInput = null;
    var chatEmojiPickerClose = null;
    function insertEmojiAtCursor(ta, emoji) {
      if (!ta) return;
      var start = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
      var end = ta.selectionEnd != null ? ta.selectionEnd : start;
      var text = ta.value;
      var maxLen = ta.getAttribute("maxlength") ? parseInt(ta.getAttribute("maxlength"), 10) : 500;
      var newText = text.slice(0, start) + emoji + text.slice(end);
      if (newText.length > maxLen) newText = newText.slice(0, maxLen);
      ta.value = newText;
      ta.selectionStart = ta.selectionEnd = Math.min(start + emoji.length, newText.length);
      ta.focus();
      if (typeof resizeChatTextarea === "function") resizeChatTextarea(ta);
    }
    function hideChatEmojiPicker() {
      if (!chatEmojiPicker) return;
      chatEmojiPicker.classList.add("chat-emoji-picker--hidden");
      chatEmojiPicker.setAttribute("aria-hidden", "true");
      chatEmojiPickerTargetInput = null;
      if (chatEmojiPickerClose) {
        document.removeEventListener("click", chatEmojiPickerClose);
        chatEmojiPickerClose = null;
      }
    }
    if (chatEmojiPickerGrid && CHAT_EMOJIS.length) {
      CHAT_EMOJIS.forEach(function (emoji) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "chat-emoji-picker__emoji";
        btn.textContent = emoji;
        btn.setAttribute("aria-label", "Вставить " + emoji);
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (chatEmojiPickerTargetInput) insertEmojiAtCursor(chatEmojiPickerTargetInput, emoji);
          hideChatEmojiPicker();
        });
        chatEmojiPickerGrid.appendChild(btn);
      });
    }
    if (chatGeneralEmojiBtn && chatEmojiPicker && generalInput) {
      chatGeneralEmojiBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (chatEmojiPicker.classList.contains("chat-emoji-picker--hidden")) {
          chatEmojiPickerTargetInput = generalInput;
          var rect = chatGeneralEmojiBtn.getBoundingClientRect();
          chatEmojiPicker.style.left = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 268)) + "px";
          chatEmojiPicker.style.top = (rect.top - 206) + "px";
          chatEmojiPicker.classList.remove("chat-emoji-picker--hidden");
          chatEmojiPicker.setAttribute("aria-hidden", "false");
          chatEmojiPickerClose = function (ev) {
            if (ev.target && !chatEmojiPicker.contains(ev.target) && ev.target !== chatGeneralEmojiBtn && !chatGeneralEmojiBtn.contains(ev.target)) {
              hideChatEmojiPicker();
            }
          };
          setTimeout(function () { document.addEventListener("click", chatEmojiPickerClose); }, 0);
        } else if (chatEmojiPickerTargetInput === generalInput) {
          hideChatEmojiPicker();
        }
      });
    }
    if (chatPersonalEmojiBtn && chatEmojiPicker && inputEl) {
      chatPersonalEmojiBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (chatEmojiPicker.classList.contains("chat-emoji-picker--hidden")) {
          chatEmojiPickerTargetInput = inputEl;
          var rect = chatPersonalEmojiBtn.getBoundingClientRect();
          chatEmojiPicker.style.left = Math.max(8, Math.min(rect.right - 160, window.innerWidth - 268)) + "px";
          chatEmojiPicker.style.top = (rect.top - 206) + "px";
          chatEmojiPicker.classList.remove("chat-emoji-picker--hidden");
          chatEmojiPicker.setAttribute("aria-hidden", "false");
          chatEmojiPickerClose = function (ev) {
            if (ev.target && !chatEmojiPicker.contains(ev.target) && ev.target !== chatPersonalEmojiBtn && !chatPersonalEmojiBtn.contains(ev.target)) {
              hideChatEmojiPicker();
            }
          };
          setTimeout(function () { document.addEventListener("click", chatEmojiPickerClose); }, 0);
        } else if (chatEmojiPickerTargetInput === inputEl) {
          hideChatEmojiPicker();
        }
      });
    }
    var generalVoiceBtn = document.getElementById("chatGeneralVoiceBtn");
    var generalVoiceRemove = document.getElementById("chatGeneralVoiceRemove");
    var generalVoicePreviewEl = document.getElementById("chatGeneralVoicePreview");
    var generalSendBtnRef = generalSendBtn;
    var sendBtnRef = sendBtn;
    (function initVoiceRecording() {
      var voiceTarget = null;
      var voiceStream = null;
      var voiceChunks = [];
      var voiceRecorder = null;
      var voiceRecordStartTime = null;
      var voiceRecordTimerInterval = null;
      var generalTimerEl = document.getElementById("chatGeneralVoiceTimer");
      var personalTimerEl = document.getElementById("chatPersonalVoiceTimer");
      var generalBtn = generalVoiceBtn || generalSendBtnRef;
      var personalBtn = document.getElementById("chatPersonalVoiceBtn") || sendBtnRef;
      function stopVoiceTimer() {
        if (voiceRecordTimerInterval) {
          clearInterval(voiceRecordTimerInterval);
          voiceRecordTimerInterval = null;
        }
        voiceRecordStartTime = null;
      }
      function updateVoiceTimer() {
        if (voiceRecordStartTime == null) return;
        var sec = Math.floor((Date.now() - voiceRecordStartTime) / 1000);
        if (generalTimerEl) generalTimerEl.textContent = String(sec);
        if (personalTimerEl) personalTimerEl.textContent = String(sec);
      }
      function startVoiceTimer() {
        stopVoiceTimer();
        voiceRecordStartTime = Date.now();
        if (generalTimerEl) generalTimerEl.textContent = "0";
        if (personalTimerEl) personalTimerEl.textContent = "0";
        updateVoiceTimer();
        voiceRecordTimerInterval = setInterval(updateVoiceTimer, 1000);
      }
      function stopAndDiscard() {
        voiceTarget = null;
        stopVoiceTimer();
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
        if (target === "general") {
          if (generalBtn) { generalBtn.classList.add("chat-voice-btn--recording"); generalBtn.title = "Остановить запись"; }
          if (generalVoicePreviewEl) {
            generalVoicePreviewEl.classList.remove("chat-voice-preview--hidden");
            generalVoicePreviewEl.classList.add("chat-voice-preview--recording");
          }
        }
        if (target === "personal") {
          if (personalBtn) { personalBtn.classList.add("chat-voice-btn--recording"); personalBtn.title = "Остановить запись"; }
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
            stopVoiceTimer();
            var mime = (voiceRecorder && voiceRecorder.mimeType) ? voiceRecorder.mimeType : "audio/webm";
            voiceRecorder = null;
            if (voiceStream) {
              voiceStream.getTracks().forEach(function (t) { t.stop(); });
              voiceStream = null;
            }
            if (voiceChunks.length === 0) {
              if (savedTarget === "general") {
                if (generalBtn) { generalBtn.classList.remove("chat-voice-btn--recording"); generalBtn.title = "Голосовое сообщение"; }
                if (generalVoicePreviewEl) {
                  generalVoicePreviewEl.classList.remove("chat-voice-preview--recording");
                  generalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
                }
              }
              if (savedTarget === "personal") {
                if (personalBtn) { personalBtn.classList.remove("chat-voice-btn--recording"); personalBtn.title = "Голосовое сообщение"; }
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
                if (typeof updateGeneralSendBtnIcon === "function") updateGeneralSendBtnIcon();
                if (generalVoicePreviewEl) {
                  generalVoicePreviewEl.classList.remove("chat-voice-preview--recording");
                  generalVoicePreviewEl.classList.remove("chat-voice-preview--hidden");
                }
              } else if (savedTarget === "personal") {
                personalVoice = dataUrl;
                if (typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
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
          startVoiceTimer();
        }).catch(function () {
          voiceTarget = null;
          stopVoiceTimer();
          if (target === "general" && generalBtn) { generalBtn.classList.remove("chat-voice-btn--recording"); generalBtn.title = "Голосовое сообщение"; if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); } }
          if (target === "personal") {
            if (personalBtn) { personalBtn.classList.remove("chat-voice-btn--recording"); personalBtn.title = "Голосовое сообщение"; }
            var pvErr = document.getElementById("chatPersonalVoicePreview");
            if (pvErr) { pvErr.classList.remove("chat-voice-preview--recording"); pvErr.classList.add("chat-voice-preview--hidden"); }
          }
          if (tg && tg.showAlert) tg.showAlert("Нет доступа к микрофону");
        });
      }
      if (generalBtn) {
        generalBtn.addEventListener("click", function (e) {
          e.preventDefault();
          if (voiceTarget === "general") {
            stopVoiceTimer();
            if (voiceRecorder) {
              try {
                if (voiceRecorder.state === "recording" && voiceRecorder.requestData) voiceRecorder.requestData();
                voiceRecorder.stop();
              } catch (err) {}
            } else {
              voiceTarget = null;
              if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); }
            }
            generalBtn.classList.remove("chat-voice-btn--recording");
            generalBtn.title = "Голосовое сообщение";
            if (generalSendBtnRef && typeof updateGeneralSendBtnIcon === "function") updateGeneralSendBtnIcon();
          } else if (voiceTarget === "personal") {
            stopAndDiscard();
            if (personalBtn) personalBtn.classList.remove("chat-voice-btn--recording");
            var pvPrev = document.getElementById("chatPersonalVoicePreview");
            if (pvPrev) { pvPrev.classList.remove("chat-voice-preview--recording"); pvPrev.classList.add("chat-voice-preview--hidden"); }
            startRecording("general");
          } else if ((generalInput && generalInput.value.trim()) || generalImage || generalVoice || generalDocument) {
            sendGeneral();
          } else {
            startRecording("general");
          }
        });
      }
      if (generalVoiceRemove && generalVoicePreviewEl) {
        generalVoiceRemove.addEventListener("click", function () {
          generalVoice = null;
          generalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
          if (typeof updateGeneralSendBtnIcon === "function") updateGeneralSendBtnIcon();
        });
      }
      var generalVoiceSend = document.getElementById("chatGeneralVoiceSend");
      if (generalVoiceSend) generalVoiceSend.addEventListener("click", function () { sendGeneral(); });
      var generalVoiceStop = document.getElementById("chatGeneralVoiceStop");
      if (generalVoiceStop) generalVoiceStop.addEventListener("click", function (e) {
        e.preventDefault();
        if (voiceTarget === "general") {
          stopVoiceTimer();
          if (voiceRecorder) {
            try {
              if (voiceRecorder.state === "recording" && voiceRecorder.requestData) voiceRecorder.requestData();
              voiceRecorder.stop();
            } catch (err) {}
          } else {
            voiceTarget = null;
            if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); }
          }
          if (generalBtn) { generalBtn.classList.remove("chat-voice-btn--recording"); generalBtn.title = "Голосовое сообщение"; }
          if (generalSendBtnRef && typeof updateGeneralSendBtnIcon === "function") updateGeneralSendBtnIcon();
        }
      });
      var personalVoiceRemove = document.getElementById("chatPersonalVoiceRemove");
      var personalVoicePreviewEl = document.getElementById("chatPersonalVoicePreview");
      function runPersonalSendAction() {
        if (voiceTarget === "personal") {
          stopVoiceTimer();
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
          personalBtn.classList.remove("chat-voice-btn--recording");
          personalBtn.title = "Голосовое сообщение";
          if (sendBtnRef && typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
        } else if (voiceTarget === "general") {
          stopAndDiscard();
          if (generalBtn) generalBtn.classList.remove("chat-voice-btn--recording");
          if (generalVoicePreviewEl) { generalVoicePreviewEl.classList.remove("chat-voice-preview--recording"); generalVoicePreviewEl.classList.add("chat-voice-preview--hidden"); }
          startRecording("personal");
        } else if ((inputEl && inputEl.value.trim()) || personalImage || personalVoice || personalDocument) {
          sendMessage();
        } else {
          startRecording("personal");
        }
      }
      if (personalBtn) {
        personalBtn.addEventListener("click", function (e) {
          e.preventDefault();
          runPersonalSendAction();
        });
        personalBtn.addEventListener("touchend", function (e) {
          if (e.target !== personalBtn && !personalBtn.contains(e.target)) return;
          e.preventDefault();
          runPersonalSendAction();
        }, { passive: false });
      }
      if (personalVoiceRemove && personalVoicePreviewEl) {
        personalVoiceRemove.addEventListener("click", function () {
          personalVoice = null;
          personalVoicePreviewEl.classList.add("chat-voice-preview--hidden");
          if (typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
        });
      }
      var personalVoiceSend = document.getElementById("chatPersonalVoiceSend");
      if (personalVoiceSend) personalVoiceSend.addEventListener("click", function () { sendMessage(); });
      var personalVoiceStop = document.getElementById("chatPersonalVoiceStop");
      if (personalVoiceStop) personalVoiceStop.addEventListener("click", function (e) {
        e.preventDefault();
        if (voiceTarget === "personal") {
          stopVoiceTimer();
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
          if (personalBtn) { personalBtn.classList.remove("chat-voice-btn--recording"); personalBtn.title = "Голосовое сообщение"; }
          if (sendBtnRef && typeof updatePersonalSendBtnIcon === "function") updatePersonalSendBtnIcon();
        }
      });
    })();
    function updateGeneralSendBtnIcon() {
      if (!generalSendBtn) return;
      var hasContent = (generalInput && generalInput.value.trim()) || generalImage || generalVoice || generalDocument;
      generalSendBtn.textContent = hasContent ? "\u2191" : "\uD83C\uDFA4";
      generalSendBtn.title = hasContent ? "Отправить" : "Голосовое сообщение";
      generalSendBtn.setAttribute("aria-label", hasContent ? "Отправить" : "Записать голосовое");
      generalSendBtn.classList.toggle("chat-send-btn--mic", !hasContent);
    }
    function updatePersonalSendBtnIcon() {
      if (!sendBtn) return;
      var hasContent = (inputEl && inputEl.value.trim()) || personalImage || personalVoice || personalDocument;
      sendBtn.textContent = hasContent ? "\u2191" : "\uD83C\uDFA4";
      sendBtn.title = hasContent ? "Отправить" : "Голосовое сообщение";
      sendBtn.setAttribute("aria-label", hasContent ? "Отправить" : "Записать голосовое");
      sendBtn.classList.toggle("chat-send-btn--mic", !hasContent);
    }
    function resizeChatTextarea(ta) {
      if (!ta || ta.nodeName !== "TEXTAREA") return;
      ta.style.height = "auto";
      var max = 140;
      var h = Math.min(ta.scrollHeight, max);
      ta.style.height = h + "px";
    }
    if (generalInput) {
      generalInput.addEventListener("input", function () { resizeChatTextarea(generalInput); updateGeneralSendBtnIcon(); });
      generalInput.addEventListener("focus", function () { resizeChatTextarea(generalInput); });
      generalInput.addEventListener("change", updateGeneralSendBtnIcon);
      resizeChatTextarea(generalInput);
    }
    updateGeneralSendBtnIcon();
    var generalReplyCancel = document.querySelector("#chatGeneralReplyPreview .chat-reply-preview__cancel");
    if (generalReplyCancel) generalReplyCancel.addEventListener("click", function () {
      generalReplyTo = null;
      var p = document.getElementById("chatGeneralReplyPreview");
      if (p) { p.classList.remove("chat-reply-preview--visible"); p.querySelector(".chat-reply-preview__text").textContent = ""; }
    });
    var personalFileInput = document.getElementById("chatPersonalFileInput");
    var personalPdfInput = document.getElementById("chatPersonalPdfInput");
    var personalAttachBtn = document.getElementById("chatPersonalAttachBtn");
    var personalAttachDropdown = document.getElementById("chatPersonalAttachDropdown");
    var personalImagePreview = document.getElementById("chatPersonalImagePreview");
    function closePersonalAttachDropdown() {
      if (personalAttachDropdown) { personalAttachDropdown.classList.add("chat-attach-dropdown--hidden"); personalAttachDropdown.setAttribute("aria-hidden", "true"); }
      if (personalAttachBtn) personalAttachBtn.setAttribute("aria-expanded", "false");
      document.removeEventListener("click", personalAttachDropdownOutside);
    }
    function personalAttachDropdownOutside(e) {
      if (personalAttachDropdown && !personalAttachDropdown.contains(e.target) && personalAttachBtn && !personalAttachBtn.contains(e.target)) closePersonalAttachDropdown();
    }
    if (personalAttachBtn && personalFileInput) {
      personalAttachBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        if (personalAttachDropdown && personalAttachDropdown.classList.contains("chat-attach-dropdown--hidden")) {
          personalAttachDropdown.classList.remove("chat-attach-dropdown--hidden");
          personalAttachDropdown.setAttribute("aria-hidden", "false");
          personalAttachBtn.setAttribute("aria-expanded", "true");
          setTimeout(function () { document.addEventListener("click", personalAttachDropdownOutside); }, 0);
        } else closePersonalAttachDropdown();
      });
      if (personalAttachDropdown) {
        personalAttachDropdown.querySelectorAll(".chat-attach-dropdown__item").forEach(function (item) {
          item.addEventListener("click", function (e) {
            e.stopPropagation();
            var action = item.getAttribute("data-action");
            if (action === "photo") personalFileInput.click();
            else if (action === "document" && personalPdfInput) personalPdfInput.click();
            closePersonalAttachDropdown();
          });
        });
      }
      personalFileInput.addEventListener("change", function () {
        var f = personalFileInput.files && personalFileInput.files[0];
        if (!f || !f.type.startsWith("image/")) return;
        personalDocument = null;
        resizeImage(f, 800, 800, 0.88).then(function (dataUrl) {
          personalImage = dataUrl;
          updatePersonalSendBtnIcon();
          if (personalImagePreview) {
            personalImagePreview.innerHTML = '<img class="chat-image-preview__thumb" src="' + dataUrl.replace(/"/g, "&quot;") + '" alt="" /><button type="button" class="chat-image-preview__remove">Убрать</button>';
            personalImagePreview.classList.add("chat-image-preview--visible");
            personalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
              personalImage = null; personalFileInput.value = "";
              updatePersonalSendBtnIcon();
              personalImagePreview.classList.remove("chat-image-preview--visible"); personalImagePreview.innerHTML = "";
            });
          }
        }).catch(function () { if (tg && tg.showAlert) tg.showAlert("Не удалось обработать изображение"); });
        personalFileInput.value = "";
      });
      if (personalPdfInput) {
        personalPdfInput.addEventListener("change", function () {
          var f = personalPdfInput.files && personalPdfInput.files[0];
          if (!f || f.type !== "application/pdf") return;
          if (f.size > 8 * 1024 * 1024) {
            if (tg && tg.showAlert) tg.showAlert("Файл слишком большой. Максимум 8 МБ.");
            personalPdfInput.value = "";
            return;
          }
          personalImage = null;
          var reader = new FileReader();
          reader.onload = function () {
            var dataUrl = reader.result;
            if (dataUrl && typeof dataUrl === "string" && dataUrl.indexOf("data:application/pdf") === 0) {
              personalDocument = { dataUrl: dataUrl, fileName: (f.name || "document.pdf").replace(/[^\w\s.-]/g, "") || "document.pdf" };
              updatePersonalSendBtnIcon();
              if (personalImagePreview) {
                personalImagePreview.innerHTML = '<span class="chat-image-preview__doc">📄 ' + escapeHtml(personalDocument.fileName) + '</span><button type="button" class="chat-image-preview__remove">Убрать</button>';
                personalImagePreview.classList.add("chat-image-preview--visible");
                personalImagePreview.querySelector(".chat-image-preview__remove").addEventListener("click", function () {
                  personalDocument = null; personalPdfInput.value = "";
                  updatePersonalSendBtnIcon();
                  personalImagePreview.classList.remove("chat-image-preview--visible"); personalImagePreview.innerHTML = "";
                });
              }
            } else if (tg && tg.showAlert) tg.showAlert("Не удалось прочитать файл");
          };
          reader.onerror = function () { if (tg && tg.showAlert) tg.showAlert("Не удалось прочитать файл"); };
          reader.readAsDataURL(f);
          personalPdfInput.value = "";
        });
      }
    }
    if (inputEl) {
      inputEl.addEventListener("input", function () { resizeChatTextarea(inputEl); updatePersonalSendBtnIcon(); });
      inputEl.addEventListener("focus", function () { resizeChatTextarea(inputEl); });
      inputEl.addEventListener("change", updatePersonalSendBtnIcon);
      inputEl.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
      resizeChatTextarea(inputEl);
    }
    updatePersonalSendBtnIcon();
    var personalReplyCancel = document.querySelector("#chatPersonalReplyPreview .chat-reply-preview__cancel");
    if (personalReplyCancel) personalReplyCancel.addEventListener("click", function () {
      personalReplyTo = null;
      var p = document.getElementById("chatPersonalReplyPreview");
      if (p) { p.classList.remove("chat-reply-preview--visible"); p.querySelector(".chat-reply-preview__text").textContent = ""; }
    });
  }

  showDialogs();

  if (dialogsView) {
    var assetPath = (window.location.pathname || "").replace(/\/[^/]*$/, "") || "/";
    var assetBase = assetPath.replace(/\/?$/, "/") + "assets/";
    dialogsView.querySelectorAll(".chat-dialog-item img.chat-dialog-item__avatar[src]").forEach(function (img) {
      var s = img.getAttribute("src") || "";
      if (s.indexOf("dep-manager") !== -1) img.src = assetBase + (s.indexOf("vika") !== -1 ? "dep-manager-vika.png" : "dep-manager.png");
      else if (s.indexOf("logo-two-aces") !== -1) img.src = assetBase + "logo-two-aces.png";
    });
  }

  function updateAdminShiftOnline() {
    if (!dialogsView) return;
    var moscowHour = parseInt(new Date().toLocaleString("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", hour12: false }), 10);
    if (isNaN(moscowHour)) moscowHour = new Date().getUTCHours() + 3;
    if (moscowHour < 0) moscowHour += 24;
    if (moscowHour >= 24) moscowHour -= 24;
    dialogsView.querySelectorAll(".chat-dialog-item[data-shift-start][data-shift-end]").forEach(function (btn) {
      var start = parseInt(btn.dataset.shiftStart, 10);
      var end = parseInt(btn.dataset.shiftEnd, 10);
      var onShift = false;
      if (start <= end) onShift = moscowHour >= start && moscowHour < end;
      else onShift = moscowHour >= start || moscowHour < end;
      var onEl = btn.querySelector(".chat-dialog-item__online");
      if (onEl) onEl.classList.toggle("chat-dialog-item__online--visible", !!onShift);
    });
  }
  updateAdminShiftOnline();

  if (chatGeneralBackBtn) chatGeneralBackBtn.addEventListener("click", showDialogs);
  var chatGeneralAdminsBtn = document.getElementById("chatGeneralAdminsBtn");
  if (chatGeneralAdminsBtn) chatGeneralAdminsBtn.addEventListener("click", function () { showDialogs(); });

  function runDialogActionForBtn(btn) {
    var raw = (btn.dataset.chatUserId || "").trim();
    var userName = btn.dataset.chatUserName || "Менеджер";
    if (!raw) return;
    function doShow(tgUserId) { openConvFromDialogs(tgUserId, userName); }
    if (raw.startsWith("tg_") && raw !== "tg_roman") {
      doShow(raw);
    } else if (raw === "tg_roman") {
      var romanUsername = "roman1787443";
      fetch(base + "/api/users?username=" + encodeURIComponent(romanUsername) + "&initData=" + encodeURIComponent(initData))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          if (data && data.ok && data.userId) doShow(data.userId);
          else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Не найдено");
        })
        .catch(function () { if (tg && tg.showAlert) tg.showAlert("Ошибка сети"); });
      return;
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
  }

  if (dialogsView) {
    function openDialogsViewItem(el) {
      if (!el || !dialogsView.contains(el)) return;
      if (el.blur) el.blur();
      if (el.classList && el.classList.contains("chat-dialog-item--find-user")) {
        if (findByIdInputDialogs) findByIdInputDialogs.focus();
        return;
      }
      if (el.classList && el.classList.contains("chat-dialog-item--club")) {
        openClubChat();
        return;
      }
      if (el.classList && el.classList.contains("chat-contact") && el.dataset.chatId) {
        openConvFromDialogs(el.dataset.chatId, el.dataset.chatName, el.dataset.chatDtId);
        return;
      }
      if (el.getAttribute && el.getAttribute("data-chat-user-id")) {
        runDialogActionForBtn(el);
      }
    }
    var dialogsSelector = ".chat-dialog-item--club, .chat-dialog-item--find-user, .chat-dialog-item[data-chat-user-id], .chat-contact";
    function attachChatDialogButton(btn) {
      if (btn._chatDialogAttached) return;
      btn._chatDialogAttached = true;
      btn.addEventListener("pointerdown", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDialogsViewItem(btn);
      }, { passive: false, capture: true });
      btn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        openDialogsViewItem(btn);
      }, { capture: true });
    }
    function attachAllChatDialogButtons() {
      if (!dialogsView) return;
      dialogsView.querySelectorAll(dialogsSelector).forEach(attachChatDialogButton);
    }
    attachAllChatDialogButtons();
    window.chatAttachDialogButtons = attachAllChatDialogButtons;
  }
  if (findByIdInputDialogs) {
    var suggestEl = document.getElementById("chatFindSuggest");
    var suggestListEl = document.getElementById("chatFindSuggestList");
    var findSuggestDebounce = null;
    var lastSuggestions = [];

    function hideSuggest() {
      if (suggestEl) {
        suggestEl.classList.add("chat-find-suggest--hidden");
        suggestEl.setAttribute("aria-hidden", "true");
        if (findByIdInputDialogs) findByIdInputDialogs.setAttribute("aria-expanded", "false");
      }
      lastSuggestions = [];
    }
    function openFromSuggestItem(btn) {
      if (!btn || !btn.dataset.userId) return;
      openConvFromDialogs(btn.dataset.userId, btn.dataset.userName);
      findByIdInputDialogs.value = "";
      hideSuggest();
    }
    function showSuggest(items) {
      lastSuggestions = items || [];
      if (!suggestListEl || !suggestEl) return;
      if (!items || items.length === 0) {
        hideSuggest();
        return;
      }
      suggestListEl.innerHTML = items.map(function (s) {
        var name = (s.userName || s.userId || "").replace(/^@/, "");
        return '<button type="button" class="chat-find-suggest__item" data-user-id="' + escapeHtml(s.userId) + '" data-user-name="' + escapeHtml(s.userName || s.userId) + '">' + escapeHtml(s.userName || s.userId) + '</button>';
      }).join("");
      suggestEl.classList.remove("chat-find-suggest--hidden");
      suggestEl.setAttribute("aria-hidden", "false");
      if (findByIdInputDialogs) findByIdInputDialogs.setAttribute("aria-expanded", "true");
    }
    function fetchSuggest() {
      var raw = (findByIdInputDialogs.value || "").trim().replace(/^@/, "");
      if (raw.length < 1) { hideSuggest(); return; }
      var byId = /^\d{6}$/.test(raw) || /^ID\d{6}$/i.test(raw);
      if (byId) { hideSuggest(); return; }
      var url = base + "/api/users?username=" + encodeURIComponent(raw) + "&suggest=1&initData=" + encodeURIComponent(initData);
      fetch(url).then(function (r) { return r.json(); }).then(function (data) {
        if (data && data.ok && Array.isArray(data.suggestions)) showSuggest(data.suggestions);
        else hideSuggest();
      }).catch(function () { hideSuggest(); });
    }

    findByIdInputDialogs.addEventListener("input", function () {
      clearTimeout(findSuggestDebounce);
      var raw = (findByIdInputDialogs.value || "").trim();
      if (raw.length < 1) { hideSuggest(); return; }
      findSuggestDebounce = setTimeout(fetchSuggest, 280);
    });
    findByIdInputDialogs.addEventListener("focus", function () {
      document.documentElement.classList.add("chat-keyboard-open");
      document.body.classList.add("chat-keyboard-open");
      if (lastSuggestions.length) showSuggest(lastSuggestions);
    });
    findByIdInputDialogs.addEventListener("blur", function (e) {
      document.documentElement.classList.remove("chat-keyboard-open");
      document.body.classList.remove("chat-keyboard-open");
      var relatedTarget = e.relatedTarget;
      setTimeout(function () {
        if (document.activeElement && suggestEl && suggestEl.contains(document.activeElement)) return;
        if (relatedTarget && suggestEl && suggestEl.contains(relatedTarget)) return;
        hideSuggest();
      }, 380);
    });
    if (suggestListEl) {
      suggestListEl.addEventListener("pointerdown", function (e) {
        var btn = e.target && e.target.closest && e.target.closest(".chat-find-suggest__item");
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          openFromSuggestItem(btn);
        }
      }, { passive: false, capture: true });
      suggestListEl.addEventListener("click", function (e) {
        var btn = e.target && e.target.closest && e.target.closest(".chat-find-suggest__item");
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          openFromSuggestItem(btn);
        }
      }, { capture: true });
    }
    if (suggestEl) {
      suggestEl.addEventListener("mousedown", function (e) {
        if (e.target && e.target.closest && e.target.closest(".chat-find-suggest__item")) return;
        e.preventDefault();
      });
      suggestEl.addEventListener("pointerdown", function (e) {
        if (e.target && e.target.closest && e.target.closest(".chat-find-suggest__item")) return;
        e.preventDefault();
      }, { passive: false });
    }

    function findByIdAndOpenDialogs() {
      var raw = (findByIdInputDialogs.value || "").trim();
      var idPart = raw.replace(/^@/, "").toUpperCase();
      var byId = /^\d{6}$/.test(idPart) || /^ID\d{6}$/.test(idPart) || (idPart.startsWith("ID") && idPart.length === 8 && /^ID\d{6}$/.test(idPart));
      var url;
      if (byId) {
        var id = idPart.startsWith("ID") ? idPart : "ID" + idPart;
        url = base + "/api/users?id=" + encodeURIComponent(id) + "&initData=" + encodeURIComponent(initData);
      } else {
        var nick = raw.replace(/^@/, "").trim();
        if (!nick) {
          if (tg && tg.showAlert) tg.showAlert("Введите ID (ID123456) или ник в Telegram");
          return;
        }
        url = base + "/api/users?username=" + encodeURIComponent(nick) + "&initData=" + encodeURIComponent(initData);
      }
      hideSuggest();
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          findByIdInputDialogs.value = "";
          if (data && data.ok && data.userId) openConvFromDialogs(data.userId, data.userName || data.userId, data.dtId);
          else if (tg && tg.showAlert) tg.showAlert((data && data.error) || "Не найдено");
        })
        .catch(function () {
          if (tg && tg.showAlert) tg.showAlert("Ошибка сети");
        });
    }
    findByIdInputDialogs.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        if (suggestEl && !suggestEl.classList.contains("chat-find-suggest--hidden") && lastSuggestions.length > 0) {
          openConvFromDialogs(lastSuggestions[0].userId, lastSuggestions[0].userName || lastSuggestions[0].userId);
          findByIdInputDialogs.value = "";
          hideSuggest();
        } else {
          findByIdAndOpenDialogs();
        }
      }
    });
  }

  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(function () {
    loadGeneral();
    if (chatWithUserId) loadMessages();
    else if (dialogsView && !dialogsView.classList.contains("chat-dialogs-view--hidden")) loadContacts();
    else if (chatActiveTab === "personal") loadContacts();
    else if (chatActiveTab === "admins" && adminsView && !adminsView.classList.contains("chat-admins-view--hidden")) loadAdminsOnline();
  }, 10000);
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

function recordShareButtonClick(buttonId) {
  var base = getApiBase();
  if (!base) return;
  try {
    fetch(base + "/api/share-button-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buttonId: buttonId })
    }).catch(function () {});
  } catch (e) {}
}

function updateVisitorCounter() {
  const elTotal = document.getElementById("visitorTotal");
  const elUnique = document.getElementById("visitorUnique");
  const elReturning = document.getElementById("visitorReturning");
  const hasCounterEls = !!(elUnique && elReturning);

  const setDash = function () {
    if (elTotal) elTotal.textContent = "—";
    if (elUnique) elUnique.textContent = "—";
    if (elReturning) elReturning.textContent = "—";
  };

  const base = getApiBase();
  const isLocal = isLocalEnv();
  if (isLocal && !(document.getElementById("app") && document.getElementById("app").getAttribute("data-api-base"))) {
    if (hasCounterEls) setDash();
    return;
  }

  if (!base) {
    if (hasCounterEls) setDash();
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
        if (hasCounterEls) applyVisitorCounts(data, elTotal, elUnique, elReturning);
        if (data && data.dtId) sessionStorage.setItem("poker_dt_id", data.dtId);
        if (data && data.ok === false && hasCounterEls) fetchVisitorStatsOnly();
      })
      .catch(function () {
        if (hasCounterEls) setDash();
        if (retryCount > 0) {
          setTimeout(function () { doFetch(retryCount - 1); }, 1500);
        } else {
          if (hasCounterEls) {
            fetchVisitorStatsOnly();
            setTimeout(updateVisitorCounter, 5000);
          }
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

// Посетители (админ): кнопка в футере, модалка со списком, отправка сообщения
(function () {
  var visitorsAdminData = null;

  function esc(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function checkAdminAndShowVisitorsButton() {
    var wrap = document.getElementById("footerAdminVisitorsWrap");
    var ratingAdminRow = document.getElementById("winterRatingAdminRow");
    var gazetteAdminRow = document.getElementById("gazetteAdminRow");
    if (!wrap && !ratingAdminRow && !gazetteAdminRow) return;
    function showAdminUi() {
      if (wrap) wrap.classList.remove("footer-admin-visitors--hidden");
      if (ratingAdminRow) ratingAdminRow.classList.remove("winter-rating__admin-row--hidden");
      if (window.updateRatingSubsCount) window.updateRatingSubsCount();
      if (gazetteAdminRow) gazetteAdminRow.classList.remove("gazette-admin-row--hidden");
      if (window.updateGazetteSubsCount) window.updateGazetteSubsCount();
    }
    // В локальной разработке всегда показываем кнопку админа,
    // чтобы можно было тестировать без Telegram initData.
    try {
      if (typeof window !== "undefined" && window.location && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")) {
        showAdminUi();
        return;
      }
    } catch (e) {}
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) return;
    fetch(base + "/api/visitors-list?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data && data.ok && data.isAdmin) showAdminUi();
      })
      .catch(function () {});
  }

  var MONTH_NAMES = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
  function getMonthValue(d) {
    var y = d.getFullYear();
    var m = d.getMonth() + 1;
    return y + "-" + (m < 10 ? "0" + m : String(m));
  }
  function fillMonthFilterSelect() {
    var sel = document.getElementById("visitorsAdminMonthFilter");
    if (!sel) return;
    var d = new Date();
    sel.innerHTML = "";
    for (var i = 0; i < 12; i++) {
      var value = getMonthValue(d);
      var label = MONTH_NAMES[d.getMonth()] + " " + d.getFullYear();
      var opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      sel.appendChild(opt);
      d.setMonth(d.getMonth() - 1);
    }
    sel.value = getMonthValue(new Date());
  }
  function fetchVisitorsAdminStats(monthValue) {
    var elUnique = document.getElementById("visitorsAdminUnique");
    var elGazette = document.getElementById("visitorsAdminGazette");
    var elRating = document.getElementById("visitorsAdminRating");
    var elRaffle = document.getElementById("visitorsAdminRaffle");
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) return;
    var url = base + "/api/visitors-list?initData=" + encodeURIComponent(initData);
    if (monthValue) url += "&month=" + encodeURIComponent(monthValue);
    fetch(url)
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok || !data.isAdmin) return;
        visitorsAdminData = data;
        if (elUnique) elUnique.textContent = String(data.uniqueInSelectedMonth != null ? data.uniqueInSelectedMonth : data.uniqueThisMonth != null ? data.uniqueThisMonth : "—");
        if (elGazette) elGazette.textContent = String(data.gazetteSubscribers != null ? data.gazetteSubscribers : "—");
        if (elRating) elRating.textContent = String(data.ratingSubscribers != null ? data.ratingSubscribers : "—");
        if (elRaffle) elRaffle.textContent = String(data.raffleSubscribers != null ? data.raffleSubscribers : "—");
      })
      .catch(function () {});
  }
  function openVisitorsModal() {
    var modal = document.getElementById("visitorsAdminModal");
    var listWrap = document.getElementById("visitorsAdminListWrap");
    var listEl = document.getElementById("visitorsAdminList");
    var elUnique = document.getElementById("visitorsAdminUnique");
    var elGazette = document.getElementById("visitorsAdminGazette");
    var elRating = document.getElementById("visitorsAdminRating");
    var elRaffle = document.getElementById("visitorsAdminRaffle");
    var monthSelect = document.getElementById("visitorsAdminMonthFilter");
    if (!modal || !listWrap || !listEl) return;
    listWrap.classList.add("visitors-admin-modal__list-wrap--hidden");
    listEl.innerHTML = "";
    if (elUnique) elUnique.textContent = "—";
    if (elGazette) elGazette.textContent = "—";
    if (elRating) elRating.textContent = "—";
    if (elRaffle) elRaffle.textContent = "—";
    visitorsAdminData = null;
    fillMonthFilterSelect();
    ["Visitors", "Gazette", "Rating", "Raffle"].forEach(function (name) {
      var btn = document.getElementById("visitorsAdminGroup" + name);
      updateGroupBtnState(btn, false);
    });
    modal.setAttribute("aria-hidden", "false");
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) return;
    var monthValue = monthSelect ? monthSelect.value : null;
    fetchVisitorsAdminStats(monthValue);
  }

  function closeVisitorsModal() {
    var modal = document.getElementById("visitorsAdminModal");
    if (modal) modal.setAttribute("aria-hidden", "true");
  }

  var selectedBroadcastGroups = [];
  function updateGroupBtnState(btn, pressed) {
    if (!btn) return;
    btn.setAttribute("aria-pressed", pressed ? "true" : "false");
    var check = btn.querySelector(".visitors-admin-modal__group-check");
    if (check) check.textContent = pressed ? "\u2611" : "\u2610";
  }
  function getSelectedBroadcastGroups() {
    var out = [];
    ["visitors", "gazette", "rating", "raffle"].forEach(function (g) {
      var btn = document.getElementById("visitorsAdminGroup" + (g.charAt(0).toUpperCase() + g.slice(1)));
      if (btn && btn.getAttribute("aria-pressed") === "true") out.push(g);
    });
    return out;
  }
  function openBroadcastModal() {
    selectedBroadcastGroups = getSelectedBroadcastGroups();
    if (selectedBroadcastGroups.length === 0) {
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.showAlert) tg.showAlert("Выберите хотя бы одну группу"); else alert("Выберите хотя бы одну группу");
      return;
    }
    var modal = document.getElementById("visitorsBroadcastModal");
    var hint = document.getElementById("visitorsBroadcastHint");
    var textEl = document.getElementById("visitorsBroadcastText");
    var fileEl = document.getElementById("visitorsBroadcastImageFile");
    var fileNameEl = document.getElementById("visitorsBroadcastFileName");
    if (hint) hint.textContent = "Выбрано групп: " + selectedBroadcastGroups.length;
    if (textEl) textEl.value = "";
    if (fileEl) { fileEl.value = ""; if (fileNameEl) fileNameEl.textContent = ""; }
    if (modal) modal.setAttribute("aria-hidden", "false");
  }
  function closeBroadcastModal() {
    var modal = document.getElementById("visitorsBroadcastModal");
    if (modal) modal.setAttribute("aria-hidden", "true");
  }
  function sendBroadcast() {
    var textEl = document.getElementById("visitorsBroadcastText");
    var fileEl = document.getElementById("visitorsBroadcastImageFile");
    var sendBtn = document.getElementById("visitorsBroadcastSendBtn");
    var text = (textEl && textEl.value || "").trim();
    var file = fileEl && fileEl.files && fileEl.files[0];
    if (!text && !file) {
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (tg && tg.showAlert) tg.showAlert("Введите текст или прикрепите картинку"); else alert("Введите текст или прикрепите картинку");
      return;
    }
    var base = getApiBase();
    var initData = tg && tg.initData ? tg.initData : "";
    var monthSelect = document.getElementById("visitorsAdminMonthFilter");
    var month = monthSelect ? monthSelect.value : null;
    if (!base || !initData) return;
    if (sendBtn) sendBtn.disabled = true;

    function doSend(imageBase64, imageMimeType) {
      var payload = {
        initData: initData,
        groups: getSelectedBroadcastGroups(),
        month: month || undefined,
        text: text,
      };
      if (imageBase64) payload.imageBase64 = imageBase64;
      if (imageMimeType) payload.imageMimeType = imageMimeType;
      fetch(base + "/api/send-bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (sendBtn) sendBtn.disabled = false;
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (data && data.ok) {
          var msg = "Отправлено: " + (data.sent || 0) + ", ошибок: " + (data.failed || 0) + (data.total != null ? " из " + data.total : "");
          if (tg && tg.showAlert) tg.showAlert(msg); else alert(msg);
          closeBroadcastModal();
        } else {
          if (tg && tg.showAlert) tg.showAlert(data && data.error ? data.error : "Ошибка рассылки"); else alert(data && data.error || "Ошибка рассылки");
        }
      })
      .catch(function () {
        if (sendBtn) sendBtn.disabled = false;
        var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (tg && tg.showAlert) tg.showAlert("Ошибка сети"); else alert("Ошибка сети");
      });
    }
    if (file) {
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        var match = typeof dataUrl === "string" && dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        var mime = (match && match[1]) || "image/jpeg";
        var base64 = (match && match[2]) || "";
        doSend(base64, mime);
      };
      reader.onerror = function () {
        if (sendBtn) sendBtn.disabled = false;
        var t = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
        if (t && t.showAlert) t.showAlert("Не удалось прочитать файл"); else alert("Не удалось прочитать файл");
      };
      reader.readAsDataURL(file);
    } else {
      doSend();
    }
  }

  function renderVisitorsList() {
    var listWrap = document.getElementById("visitorsAdminListWrap");
    var listEl = document.getElementById("visitorsAdminList");
    if (!listWrap || !listEl || !visitorsAdminData || !visitorsAdminData.visitors) return;
    listWrap.classList.remove("visitors-admin-modal__list-wrap--hidden");
    var initData = tg && tg.initData ? tg.initData : "";
    var base = getApiBase();
    var visitors = visitorsAdminData.visitors;
    listEl.innerHTML = "";
    visitors.forEach(function (v) {
      var isTg = v.id && v.id.indexOf("tg_") === 0;
      var channelSpan = "Подписан на канал клуба: <span class=\"visitors-admin-item__channel\" data-user-id=\"" + esc(v.id) + "\">—</span>";
      if (!isTg) channelSpan = "Подписан на канал: —";
      var botSpan = " Подписан на бота: проверяется отправкой сообщения.";
      var sendBlock = "";
      if (isTg) {
        sendBlock =
          "<div class=\"visitors-admin-item__send\">" +
          "<input type=\"text\" class=\"visitors-admin-item__input\" placeholder=\"Сообщение...\" maxlength=\"4000\" data-user-id=\"" + esc(v.id) + "\" />" +
          "<button type=\"button\" class=\"visitors-admin-item__send-btn\" data-user-id=\"" + esc(v.id) + "\">Отправить</button>" +
          "</div>";
      }
      var row =
        "<div class=\"visitors-admin-item\" data-user-id=\"" + esc(v.id) + "\">" +
        "<div class=\"visitors-admin-item__row\">" +
        "<span class=\"visitors-admin-item__id\">" + esc(v.id) + "</span> " +
        (v.username ? "<span class=\"visitors-admin-item__meta\">@" + esc(v.username) + "</span>" : "") + " " +
        (v.dtId ? "<span class=\"visitors-admin-item__badge\">" + esc(v.dtId) + "</span>" : "") + " " +
        "<span class=\"visitors-admin-item__meta\">визитов: " + esc(v.count) + "</span>" +
        "</div>" +
        (isTg ? "<div class=\"visitors-admin-item__row\">" + channelSpan + "." + botSpan + "</div>" : "") +
        sendBlock +
        "</div>";
      listEl.insertAdjacentHTML("beforeend", row);
    });
    if (base && initData) {
      listEl.querySelectorAll(".visitors-admin-item__channel[data-user-id]").forEach(function (el) {
        var uid = el.getAttribute("data-user-id");
        if (!uid) return;
        fetch(base + "/api/visitor-telegram-status?initData=" + encodeURIComponent(initData) + "&userId=" + encodeURIComponent(uid))
          .then(function (r) { return r.json(); })
          .then(function (d) {
            if (d && d.ok) {
              if (d.channelSubscribedUnknown) el.textContent = "?";
              else el.textContent = d.channelSubscribed ? "да" : "нет";
              el.classList.add(d.channelSubscribed ? "visitors-admin-item__badge--yes" : "visitors-admin-item__badge--no");
            }
          })
          .catch(function () { el.textContent = "—"; });
      });
    }
    listEl.querySelectorAll(".visitors-admin-item__send-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var uid = btn.getAttribute("data-user-id");
        var input = listEl.querySelector(".visitors-admin-item__input[data-user-id=\"" + uid + "\"]");
        var text = (input && input.value || "").trim();
        if (!text || !base || !initData) return;
        btn.disabled = true;
        fetch(base + "/api/send-to-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: initData, user_id: uid, text: text }),
        })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            btn.disabled = false;
            if (d && d.ok) {
              if (input) input.value = "";
            } else {
              alert(d && d.error ? d.error : "Ошибка отправки");
            }
          })
          .catch(function () { btn.disabled = false; alert("Ошибка сети"); });
      });
    });
    var modalBox = listWrap.closest(".visitors-admin-modal__box");
    if (modalBox && listWrap.scrollIntoView) {
      setTimeout(function () {
        listWrap.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    checkAdminAndShowVisitorsButton();
    var btn = document.getElementById("adminVisitorsBtn");
    var showListBtn = document.getElementById("visitorsAdminShowListBtn");
    var closeBtn = document.getElementById("visitorsAdminModalClose");
    var backdrop = document.getElementById("visitorsAdminModalBackdrop");
    var monthFilter = document.getElementById("visitorsAdminMonthFilter");
    var broadcastBtn = document.getElementById("visitorsAdminBroadcastBtn");
    var broadcastModalClose = document.getElementById("visitorsBroadcastModalClose");
    var broadcastModalBackdrop = document.getElementById("visitorsBroadcastModalBackdrop");
    var broadcastSendBtn = document.getElementById("visitorsBroadcastSendBtn");
    if (btn) btn.addEventListener("click", openVisitorsModal);
    if (showListBtn) showListBtn.addEventListener("click", renderVisitorsList);
    if (closeBtn) closeBtn.addEventListener("click", closeVisitorsModal);
    if (backdrop) backdrop.addEventListener("click", closeVisitorsModal);
    if (monthFilter) monthFilter.addEventListener("change", function () {
      fetchVisitorsAdminStats(monthFilter.value || null);
    });
    if (broadcastBtn) broadcastBtn.addEventListener("click", openBroadcastModal);
    if (broadcastModalClose) broadcastModalClose.addEventListener("click", closeBroadcastModal);
    if (broadcastModalBackdrop) broadcastModalBackdrop.addEventListener("click", closeBroadcastModal);
    if (broadcastSendBtn) broadcastSendBtn.addEventListener("click", sendBroadcast);
    var broadcastFileEl = document.getElementById("visitorsBroadcastImageFile");
    var broadcastFileNameEl = document.getElementById("visitorsBroadcastFileName");
    if (broadcastFileEl && broadcastFileNameEl) {
      broadcastFileEl.addEventListener("change", function () {
        var f = this.files && this.files[0];
        broadcastFileNameEl.textContent = f ? f.name : "";
      });
    }
    ["Visitors", "Gazette", "Rating", "Raffle"].forEach(function (name) {
      var groupBtn = document.getElementById("visitorsAdminGroup" + name);
      if (groupBtn) {
        groupBtn.addEventListener("click", function () {
          var pressed = this.getAttribute("aria-pressed") !== "true";
          updateGroupBtnState(this, pressed);
        });
      }
    });
  });
})();

(function initShareStatsAdminModal() {
  var SHARE_BUTTON_LABELS = {
    tournament_day: "Турнир дня (Позвать друга)",
    daily_prediction: "Предсказание на день",
    gazette_article: "Газета (новость)",
    winter_rating_week_top: "Рейтинг — топы недели",
    winter_rating_spring_top: "Рейтинг весны — топы",
    winter_rating_player_share: "Рейтинг — карточка игрока",
    winter_rating_date: "Рейтинг — дата",
    raffle_hero: "Розыгрыши — пригласить друга",
    raffle_card: "Розыгрыш — карточка (пригласить)"
  };
  var btn = document.getElementById("adminShareStatsBtn");
  var modal = document.getElementById("shareStatsAdminModal");
  var closeBtn = document.getElementById("shareStatsAdminModalClose");
  var backdrop = document.getElementById("shareStatsAdminModalBackdrop");
  var tbody = document.getElementById("shareStatsAdminTableBody");
  if (!btn || !modal || !tbody) return;
  function closeShareStatsModal() {
    modal.setAttribute("aria-hidden", "true");
    if (document.body) document.body.style.overflow = "";
  }
  function openShareStatsModal() {
    modal.setAttribute("aria-hidden", "false");
    if (document.body) document.body.style.overflow = "hidden";
    tbody.innerHTML = "<tr><td colspan=\"2\">Загрузка…</td></tr>";
    var base = getApiBase();
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    var initData = tg && tg.initData ? tg.initData : "";
    if (!base || !initData) {
      tbody.innerHTML = "<tr><td colspan=\"2\">Нет initData. Откройте в Telegram.</td></tr>";
      return;
    }
    fetch(base + "/api/share-button-stats?initData=" + encodeURIComponent(initData))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data || !data.ok || !data.stats) {
          tbody.innerHTML = "<tr><td colspan=\"2\">Нет данных</td></tr>";
          return;
        }
        var ids = Object.keys(SHARE_BUTTON_LABELS);
        var rows = ids.map(function (id) {
          var label = SHARE_BUTTON_LABELS[id] || id;
          var count = data.stats[id] != null ? data.stats[id] : 0;
          return "<tr><td>" + String(label).replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</td><td>" + count + "</td></tr>";
        });
        if (rows.length === 0) rows.push("<tr><td colspan=\"2\">Нет записей</td></tr>");
        tbody.innerHTML = rows.join("");
      })
      .catch(function () {
        tbody.innerHTML = "<tr><td colspan=\"2\">Ошибка загрузки</td></tr>";
      });
  }
  btn.addEventListener("click", openShareStatsModal);
  if (closeBtn) closeBtn.addEventListener("click", closeShareStatsModal);
  if (backdrop) backdrop.addEventListener("click", closeShareStatsModal);
})();

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

if (typeof initChat === "function") initChat();
if (typeof initPokerShowsPlayer === "function") initPokerShowsPlayer();

var TOURNAMENT_OF_DAY_BY_WEEKDAY = [
  { name: "Турнир Недели Нокаут Меджик", buyin: "2 000₽", guarantee: "250 000₽" },
  { name: "Magic MKO", buyin: "500₽", guarantee: "100 000₽" },
  { name: "Rebuy", buyin: "300₽", guarantee: "100 000₽" },
  { name: "Rebuy", buyin: "100₽", guarantee: "50 000₽" },
  { name: "Нокаут Мистери", buyin: "1 000₽", guarantee: "150 000₽" },
  { name: "Нокаут Прогрессив", buyin: "500₽", guarantee: "100 000₽" },
  { name: "Фриролл", buyin: "Бесплатно", guarantee: "150 000₽" }
];

function updateTournamentDayBlock() {
  var els = [
    document.getElementById("tournamentDayName"),
    document.getElementById("scheduleTournamentDayName")
  ].filter(Boolean);
  var buyinEls = [document.getElementById("tournamentDayBuyin"), document.getElementById("scheduleTournamentDayBuyin")].filter(Boolean);
  var guaranteeEls = [document.getElementById("tournamentDayGuarantee"), document.getElementById("scheduleTournamentDayGuarantee")].filter(Boolean);
  var timerLabelEls = [document.getElementById("tournamentDayTimerLabel"), document.getElementById("scheduleTournamentDayTimerLabel")].filter(Boolean);
  var timerEls = [document.getElementById("tournamentDayTimer"), document.getElementById("scheduleTournamentDayTimer")].filter(Boolean);
  if (els.length === 0 || buyinEls.length === 0 || guaranteeEls.length === 0 || timerEls.length === 0) return;
  var MSK_START_UTC_HOUR = 15;
  var MSK_END_REG_UTC_HOUR = 18;
  function getMskDateParts() {
    var s = new Date().toLocaleString("en-CA", { timeZone: "Europe/Moscow" });
    var parts = s.slice(0, 10).split("-");
    return { y: parseInt(parts[0], 10), m: parseInt(parts[1], 10) - 1, d: parseInt(parts[2], 10) };
  }
  function getMskDayOfWeek() {
    var s = new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow", weekday: "short" });
    var map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return map[s] !== undefined ? map[s] : new Date().getDay();
  }
  function getTournamentDayState(now) {
    var p = getMskDateParts();
    var mskDow = getMskDayOfWeek();
    var startToday = new Date(Date.UTC(p.y, p.m, p.d, MSK_START_UTC_HOUR, 0, 0, 0));
    var endRegToday = new Date(Date.UTC(p.y, p.m, p.d, MSK_END_REG_UTC_HOUR, 0, 0, 0));
    if (now < startToday) {
      return { t: TOURNAMENT_OF_DAY_BY_WEEKDAY[mskDow], target: startToday, label: "" };
    }
    if (now < endRegToday) {
      return { t: TOURNAMENT_OF_DAY_BY_WEEKDAY[mskDow], target: endRegToday, label: "до конца рег " };
    }
    var nextDate = new Date(p.y, p.m, p.d + 1);
    var nextStart = new Date(Date.UTC(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate(), MSK_START_UTC_HOUR, 0, 0, 0));
    var nextMskDow = nextDate.getDay();
    return { t: TOURNAMENT_OF_DAY_BY_WEEKDAY[nextMskDow], target: nextStart, label: "" };
  }
  function formatTimer() {
    var n = new Date();
    var state = getTournamentDayState(n);
    var nameStr = state.t ? state.t.name : "";
    var buyinStr = state.t ? state.t.buyin : "";
    var guaranteeStr = state.t ? state.t.guarantee : "";
    window._tournamentDayShare = {
      name: nameStr,
      time: "18:00",
      guarantee: guaranteeStr
    };
    els.forEach(function (el) {
      el.textContent = nameStr;
      if (nameStr === "Фриролл") {
        el.classList.add("tournament-day-name--freeroll");
      } else {
        el.classList.remove("tournament-day-name--freeroll");
      }
    });
    buyinEls.forEach(function (el) { el.textContent = buyinStr; });
    guaranteeEls.forEach(function (el) { el.textContent = guaranteeStr; });
    timerLabelEls.forEach(function (el) { el.textContent = state.label; });
    var diff = state.target - n;
    var timerStr = diff <= 0 ? "Скоро" : (function () {
      var h = Math.floor(diff / 3600000);
      var m = Math.floor((diff % 3600000) / 60000);
      var s = Math.floor((diff % 60000) / 1000);
      return (h < 10 ? "0" : "") + h + ":" + (m < 10 ? "0" : "") + m + ":" + (s < 10 ? "0" : "") + s;
    })();
    timerEls.forEach(function (el) { el.textContent = timerStr; });
    var trophyImg = document.getElementById("tournamentDayTrophyImg");
    var scheduleTrophyImg = document.getElementById("scheduleTournamentDayTrophyImg");
    var trophyFile = nameStr === "Фриролл" ? "tournament-day-trophy.png" : nameStr === "Турнир Недели Нокаут Меджик" ? "tournament-day-sunday.png" : "tournament-day-golden-glove.png";
    var trophySrc = typeof getAssetUrl === "function" ? getAssetUrl(trophyFile) : "";
    if (trophyImg && trophySrc) trophyImg.src = trophySrc;
    if (scheduleTrophyImg && trophySrc) scheduleTrophyImg.src = trophySrc;
  }
  formatTimer();
  if (window._tournamentDayTimer) clearInterval(window._tournamentDayTimer);
  window._tournamentDayTimer = setInterval(formatTimer, 1000);
}

function initTournamentDayBlock() {
  updateTournamentDayBlock();
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTournamentDayBlock);
} else {
  initTournamentDayBlock();
}

// Поделиться турниром дня с другом (кнопка под блоком «Турнир дня» на главной и на экране расписания)
function handleTournamentDayShare() {
    var share = window._tournamentDayShare || {};
    var name = (share.name || "").trim() || "турнир клуба";
    var guarantee = (share.guarantee || "").trim();
    var time = (share.time || "18:00").trim();
    var appEl = document.getElementById("app");
    var appUrl =
      (appEl && appEl.getAttribute("data-telegram-app-url")) ||
      "https://t.me/Poker_dvatuza_bot/DvaTuza";
    appUrl = appUrl.replace(/\/$/, "");
    var link = appUrl + "?startapp=schedule";
    var text;
    if (name === "Фриролл" && guarantee) {
      text =
        "Привет, сегодня Фриролл на " +
        guarantee +
        " в Poker21. Скачать можно здесь:\n" +
        link;
    } else {
      text =
        "Привет, сегодня " +
        name +
        " в " +
        time +
        " в Poker21. Скачать можно здесь:\n" +
        link;
    }
    var shareUrl =
      "https://t.me/share/url?url=&text=" +
      encodeURIComponent(text);
    var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    if (tg && tg.openTelegramLink) tg.openTelegramLink(shareUrl);
    else if (tg && tg.openLink) tg.openLink(shareUrl);
    else window.open(shareUrl, "_blank");
    if (typeof recordShareButtonClick === "function") recordShareButtonClick("tournament_day");
}
(function initTournamentDayShareButton() {
  [document.getElementById("tournamentDayShareBtn"), document.getElementById("scheduleTournamentDayShareBtn")].forEach(function (btn) {
    if (btn) btn.addEventListener("click", handleTournamentDayShare);
  });
})();

(function initScheduleTournamentDayToday() {
  var wrap = document.querySelector(".schedule-table-wrap--tournament-day");
  if (!wrap) return;
  var rows = wrap.querySelectorAll("tbody tr");
  if (rows.length !== 7) return;
  var dayIndex = (new Date().getDay() + 6) % 7;
  var todayRow = rows[dayIndex];
  if (todayRow) {
    todayRow.classList.add("schedule-row--today");
    var firstCell = todayRow.querySelector("td");
    if (firstCell) firstCell.textContent = "СЕГОДНЯ";
  }
})();

(function preinitChat() {
  var idle = window.requestIdleCallback || function (cb) { setTimeout(cb, 150); };
  idle(function () {
    if (window.chatListenersAttached) return;
    if (typeof initChat === "function") initChat();
  });
})();

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