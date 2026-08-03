(function () {
  var state = {
    bound: false,
    loading: false,
    fetching: false,
    loadedAt: 0,
    filter: "active",
    kind: "cashout",
    items: [],
    viewer: null,
    access: null,
    maxAmount: 2500,
    subscribed: false,
  };
  var tickTimer = null;
  var pollTimer = null;
  var keyboardRestoreTimers = [];
  var keyboardRestoreInProgress = false;

  function root() {
    return document.getElementById("transfersView");
  }

  function apiBase() {
    return typeof getApiBase === "function" ? getApiBase() : "";
  }

  function authQuery() {
    if (typeof pokerRafflesApiQueryLeading === "function") return pokerRafflesApiQueryLeading();
    if (typeof pokerApiAuthQuery === "function") return pokerApiAuthQuery("?");
    var webApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    return "?initData=" + encodeURIComponent(webApp && webApp.initData ? webApp.initData : "");
  }

  function authedBody(extra) {
    if (typeof pokerGuestOrAuthedPostBody === "function") return pokerGuestOrAuthedPostBody(extra || {});
    var webApp = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
    return Object.assign({}, extra || {}, { initData: webApp && webApp.initData ? webApp.initData : "" });
  }

  function fetchJson(url, init) {
    var run = typeof pokerFetchRetry === "function" ? pokerFetchRetry : fetch;
    return run(url, init || {}, { timeoutMs: 16000, maxAttempts: 2 })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok && data && !data.error) data.error = "Ошибка " + res.status;
          return data;
        });
      });
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setFeedback(text, kind) {
    var el = byId("transfersCreateFeedback");
    if (!el) return;
    el.textContent = text || "";
    el.classList.toggle("transfers-feedback--error", kind === "error");
    el.classList.toggle("transfers-feedback--ok", kind === "ok");
  }

  function renderSubscription() {
    var btn = byId("transfersSubscribeBtn");
    if (!btn) return;
    btn.disabled = false;
    btn.textContent = state.subscribed ? "Отписаться" : "Подписаться";
    btn.setAttribute("aria-pressed", state.subscribed ? "true" : "false");
  }

  function toggleSubscription(button) {
    if (!button) return;
    var wasSubscribed = state.subscribed;
    button.disabled = true;
    button.textContent = wasSubscribed ? "Отписываем…" : "Подписываем…";
    return fetchJson(apiBase() + "/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authedBody({ action: "subscribe", unsubscribe: wasSubscribed })),
    }).then(function (data) {
      if (!data || !data.ok) throw new Error((data && data.error) || "Не удалось изменить подписку");
      state.subscribed = !!data.subscribed;
      renderSubscription();
      setFeedback(state.subscribed ? "Уведомления о новых заявках включены" : "Уведомления отключены", "ok");
      return data;
    }).catch(function (err) {
      state.subscribed = wasSubscribed;
      renderSubscription();
      setFeedback(err && err.message ? err.message : "Не удалось изменить подписку", "error");
      return null;
    });
  }

  function textNode(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text != null) el.textContent = String(text);
    return el;
  }

  function participantInitial(name, id) {
    var value = String(name || id || "И").trim();
    return value.charAt(0).toUpperCase() || "И";
  }

  function formatAmount(amount) {
    var n = Math.max(0, Number(amount) || 0);
    try {
      return n.toLocaleString("ru-RU") + " ₽";
    } catch (e) {
      return String(n) + " ₽";
    }
  }

  function normalizeRussianPhone(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.length === 10 && digits.charAt(0) === "9") digits = "7" + digits;
    if (digits.length === 11 && digits.charAt(0) === "8") digits = "7" + digits.slice(1);
    return /^79\d{9}$/.test(digits) ? digits : "";
  }

  function russianPhoneLocalDigits(value) {
    var digits = String(value || "").replace(/\D/g, "");
    if (digits.charAt(0) === "8" || digits.charAt(0) === "7") digits = digits.slice(1);
    return digits.slice(0, 10);
  }

  function formatRussianPhoneInput(value, showMask) {
    var digits = russianPhoneLocalDigits(value);
    if (!digits && !showMask) return "";
    if (showMask) {
      var padded = (digits + "__________").slice(0, 10);
      return "+7 (" + padded.slice(0, 3) + ") " + padded.slice(3, 6) + "-" + padded.slice(6, 8) + "-" + padded.slice(8, 10);
    }
    var out = "+7";
    if (digits.length) out += " (" + digits.slice(0, 3);
    if (digits.length >= 3) out += ")";
    if (digits.length > 3) out += " " + digits.slice(3, 6);
    if (digits.length > 6) out += "-" + digits.slice(6, 8);
    if (digits.length > 8) out += "-" + digits.slice(8, 10);
    return out;
  }

  function formatLeft(until) {
    var left = Math.max(0, Number(until || 0) - Date.now());
    var total = Math.ceil(left / 1000);
    var min = Math.floor(total / 60);
    var sec = total % 60;
    return min + ":" + (sec < 10 ? "0" : "") + sec;
  }

  function statusText(item) {
    if (!item) return "";
    if (item.status === "completed") return "Закрыта";
    if (item.status === "cancelled") return "Отменена";
    if (item.status === "expired") return "Время истекло";
    if (item.status === "seller_transferred") return "Ждёт подтверждение";
    if (item.status === "buyer_sent") return "Деньги отправлены";
    if (item.status === "reserved") return "В работе " + formatLeft(item.reservedUntil);
    return "Открыта";
  }

  function kindText(kind) {
    return kind === "deposit" ? "Депозит" : "Хочу сделать кешаут и перевести вам на счёт в Poker21";
  }

  function renderMode() {
    var details = byId("transfersDetailsField");
    var bankInput = byId("transfersBankInput");
    var recipientInput = byId("transfersRecipientInput");
    var submit = byId("transfersCreateSubmit");
    var label = byId("transfersDetailsLabel");
    Array.prototype.slice.call(document.querySelectorAll("[data-transfers-kind]")).forEach(function (btn) {
      var active = btn.getAttribute("data-transfers-kind") === state.kind;
      btn.classList.toggle("transfers-create__mode-btn--active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
    if (details) details.hidden = state.kind === "deposit";
    if (bankInput) bankInput.required = state.kind === "cashout";
    if (recipientInput) recipientInput.required = state.kind === "cashout";
    if (submit) submit.textContent = state.kind === "deposit" ? "Хочу сделать депозит" : "Разместить кешаут";
    if (label) label.textContent = state.kind === "deposit" ? "Реквизиты" : "Реквизиты";
  }

  function visibleItems() {
    var items = state.items.slice();
    if (state.filter === "mine") return items.filter(function (item) { return !!item.isMine; });
    if (state.filter === "completed") return items.filter(function (item) { return item.status === "completed" || item.status === "expired" || item.status === "cancelled"; });
    return items.filter(function (item) { return item.status !== "completed" && item.status !== "cancelled"; });
  }

  function addMeta(row, label, value) {
    if (!value) return;
    var item = textNode("span", "transfers-card__meta-item");
    item.appendChild(textNode("span", "transfers-card__meta-label", label));
    item.appendChild(textNode("span", "transfers-card__meta-value", value));
    row.appendChild(item);
  }

  function transferDisplayId(item, role) {
    item = item || {};
    var profile = item[role + "Profile"] || {};
    return profile.poker21Id || item[role + "DisplayId"] || item[role + "Poker21Id"] || item[role + "AccountId"] || "";
  }

  function participantName(item, role) {
    item = item || {};
    var profile = item[role + "Profile"] || {};
    return profile.name || item[role + "Name"] || "Игрок Poker21";
  }

  function participantAvatar(item, role) {
    item = item || {};
    var profile = item[role + "Profile"] || {};
    return profile.avatarUrl || profile.avatar || "";
  }

  function participantProfileAvatarFallback(item, role, currentUrl) {
    item = item || {};
    var profile = item[role + "Profile"] || {};
    var candidate = profile.avatarFallbackUrl || "";
    return candidate && candidate !== currentUrl ? candidate : "";
  }

  function participantAvatarFallback(item, role, currentUrl) {
    var targetId = String(transferDisplayId(item, role) || "").trim();
    if (!targetId) return "";
    var roles = ["owner", "seller", "buyer"];
    for (var i = 0; i < roles.length; i += 1) {
      var candidateRole = roles[i];
      if (candidateRole === role || String(transferDisplayId(item, candidateRole) || "").trim() !== targetId) continue;
      var candidate = participantAvatar(item, candidateRole);
      if (candidate && candidate !== currentUrl) return candidate;
    }
    return "";
  }

  function participantLevel(item, role) {
    item = item || {};
    var profile = item[role + "Profile"] || {};
    var raw = profile.level != null ? profile.level : item[role + "Level"];
    var level = Math.max(0, Math.floor(Number(raw) || 0));
    return level > 0 ? level : 0;
  }

  function participantCity(item, role) {
    var profile = item && item[role + "Profile"] || {};
    return String(profile.city || profile.profileCity || "").trim();
  }

  function participantTelegram(item, role) {
    var profile = item && item[role + "Profile"] || {};
    var username = String(profile.telegramUsername || profile.telegram || "").trim().replace(/^@+/, "");
    return /^[A-Za-z0-9_]{5,32}$/.test(username) ? username : "";
  }

  function participantDealsCount(item, role) {
    var profile = item && item[role + "Profile"] || {};
    return Math.max(0, Math.floor(Number(profile.dealsCount != null ? profile.dealsCount : item && item[role + "DealsCount"]) || 0));
  }

  function renderParticipant(label, item, role) {
    if (item && item.status === "open" && role === "buyer") return null;
    var id = transferDisplayId(item, role);
    var name = participantName(item, role);
    if (!id && !name) return null;
    var profile = textNode("article", "transfers-card__participant transfers-card__participant--" + role);
    var avatar = textNode("span", "transfers-card__participant-avatar");
    var avatarUrl = participantAvatar(item, role);
    if (avatarUrl) {
      var img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "";
      img.loading = "lazy";
      img.decoding = "async";
      img.addEventListener("error", function () {
        var currentUrl = img.getAttribute("src") || avatarUrl;
        var fallbackUrl = participantProfileAvatarFallback(item, role, currentUrl) || participantAvatarFallback(item, role, currentUrl);
        if (fallbackUrl && img.dataset.fallbackTried !== "1") {
          img.dataset.fallbackTried = "1";
          img.src = fallbackUrl;
          return;
        }
        var initial = textNode("b", "", participantInitial(name, id));
        if (img.parentNode) img.parentNode.replaceChild(initial, img);
      });
      avatar.appendChild(img);
    } else {
      avatar.appendChild(textNode("b", "", participantInitial(name, id)));
    }
    var level = participantLevel(item, role);
    if (level) avatar.appendChild(textNode("em", "", String(level)));
    profile.appendChild(avatar);

    var body = textNode("span", "transfers-card__participant-body");
    body.appendChild(textNode("span", "transfers-card__participant-role", label));
    body.appendChild(textNode("strong", "transfers-card__participant-name", name || "Игрок"));
    var facts = textNode("span", "transfers-card__participant-facts");
    if (id) {
      var pokerId = textNode("span", "transfers-card__participant-id");
      pokerId.appendChild(textNode("span", "", "Poker21 ID"));
      pokerId.appendChild(textNode("b", "", id));
      facts.appendChild(pokerId);
    }
    var city = participantCity(item, role);
    if (city) facts.appendChild(textNode("span", "transfers-card__participant-city", city));
    var telegram = participantTelegram(item, role);
    if (telegram) {
      var telegramLink = textNode("a", "transfers-card__participant-telegram", "@" + telegram);
      telegramLink.href = "https://t.me/" + telegram;
      telegramLink.target = "_blank";
      telegramLink.rel = "noopener noreferrer";
      facts.appendChild(telegramLink);
    }
    if (facts.children.length) body.appendChild(facts);
    var dealsCount = participantDealsCount(item, role);
    var dealsBadge = textNode("span", "transfers-card__participant-deals");
    dealsBadge.setAttribute("aria-label", "Успешные сделки: " + dealsCount);
    dealsBadge.appendChild(textNode("span", "transfers-card__participant-deals-label", "Сделки"));
    dealsBadge.appendChild(textNode("b", "transfers-card__participant-deals-value", "+" + dealsCount));
    body.appendChild(dealsBadge);
    profile.appendChild(body);
    return profile;
  }

  function actionButton(action, label, item) {
    var btn = textNode("button", "transfers-card__action", label);
    btn.type = "button";
    btn.setAttribute("data-transfers-action", action);
    btn.setAttribute("data-transfer-id", item.id);
    return btn;
  }

  function shareButton(item) {
    var share = textNode("button", "transfers-card__share", "Отправить в чат");
    share.type = "button";
    share.setAttribute("data-transfers-share", item.id);
    return share;
  }

  function transfersDeepLink() {
    if (typeof pokerBuildWebsiteStartLink === "function") {
      var webLink = pokerBuildWebsiteStartLink("transfers");
      if (webLink) return webLink;
    }
    if (typeof pokerBuildPersonalInviteLink === "function") {
      var inviteLink = pokerBuildPersonalInviteLink("transfers");
      if (inviteLink) return inviteLink;
    }
    if (typeof buildMiniAppStartLink === "function") return buildMiniAppStartLink("transfers");
    var base = typeof getAppBaseUrlForLinks === "function" ? String(getAppBaseUrlForLinks() || "").replace(/\/+$/, "") : "";
    return base ? base + (base.indexOf("?") >= 0 ? "&" : "?") + "startapp=transfers" : "";
  }

  function shareTransfersSection() {
    var link = transfersDeepLink();
    var text = "Переводы между игроками Poker21";
    if (!link && window.location) link = String(window.location.origin || "") + "/?startapp=transfers";
    if (!link) return;
    var tryWebShare = typeof pokerTryPwaWebShare === "function"
      ? pokerTryPwaWebShare
      : function () { return Promise.resolve(false); };
    tryWebShare({ title: "Переводы", text: text + "\n" + link, url: link }).then(function (ok) {
      if (ok) return;
      var shareUrl = typeof pokerBuildTelegramShareUrlDialog === "function"
        ? pokerBuildTelegramShareUrlDialog(link, text)
        : "https://t.me/share/url?url=" + encodeURIComponent(link) + "&text=" + encodeURIComponent(text);
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (shareUrl && tg && typeof tg.openTelegramLink === "function") tg.openTelegramLink(shareUrl);
      else if (shareUrl && tg && typeof tg.openLink === "function") tg.openLink(shareUrl);
      else if (shareUrl) window.open(shareUrl, "_blank", "noopener,noreferrer");
      else if (typeof pokerCopyTextToClipboard === "function") {
        pokerCopyTextToClipboard(link).then(function () {
          if (tg && tg.showToast) tg.showToast("Ссылка скопирована");
        });
      }
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("transfers_section_share");
    });
  }

  function buildTransferShareText(item, link) {
    item = item || {};
    var lines = [
      kindText(item.kind) + " " + formatAmount(item.amount),
    ];
    if (item.comment) lines.push(String(item.comment));
    lines.push("");
    lines.push("Реквизиты доступны в приложении игрокам уровня 10+.");
    if (link) {
      lines.push("");
      lines.push("Открыть переводы: " + link);
    }
    return lines.join("\n");
  }

  function shareTransfer(item) {
    if (!item) return;
    if (typeof window.tryTelegramWebAppExpandBurst === "function") window.tryTelegramWebAppExpandBurst();
    var link = transfersDeepLink();
    var text = buildTransferShareText(item, link);
    var caption = buildTransferShareText(item, "");
    var shareUrl = typeof pokerBuildTelegramShareUrlDialog === "function"
      ? pokerBuildTelegramShareUrlDialog(link, caption)
      : "";
    var tryWebShare = typeof pokerTryPwaWebShare === "function"
      ? pokerTryPwaWebShare
      : function () { return Promise.resolve(false); };
    tryWebShare({ title: "Переводы", text: text, url: link }).then(function (pwaOk) {
      if (pwaOk) {
        if (typeof recordShareButtonClick === "function") recordShareButtonClick("transfers_requisites_share");
        return;
      }
      var tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
      if (shareUrl && tg && typeof tg.openTelegramLink === "function") tg.openTelegramLink(shareUrl);
      else if (shareUrl && tg && typeof tg.openLink === "function") tg.openLink(shareUrl);
      else if (shareUrl) window.open(shareUrl, "_blank", "noopener,noreferrer");
      else if (typeof pokerCopyTextToClipboard === "function") {
        pokerCopyTextToClipboard(text).then(function () {
          if (tg && tg.showToast) tg.showToast("Текст скопирован");
        });
      }
      if (typeof recordShareButtonClick === "function") recordShareButtonClick("transfers_requisites_share");
    });
  }

  function renderRequisites(card, item) {
    if (!item.canSeeRequisites || !item.requisites) return;
    var box = textNode("div", "transfers-card__details");
    box.appendChild(textNode("span", "transfers-card__details-label", "Реквизиты"));
    var lines = String(item.requisites).split(/\n+/);
    var bank = "";
    var rest = [];
    lines.forEach(function (line) {
      var match = String(line || "").match(/^Банк:\s*(.+)$/i);
      if (match && !bank) bank = match[1].trim();
      else if (String(line || "").trim()) rest.push(String(line).trim());
    });
    if (bank) {
      var bankRow = textNode("strong", "transfers-card__details-bank");
      bankRow.appendChild(textNode("span", "", "!"));
      bankRow.appendChild(textNode("b", "", bank));
      box.appendChild(bankRow);
    }
    if (rest.length || !bank) box.appendChild(textNode("pre", "transfers-card__details-text", (rest.length ? rest : lines).join("\n")));
    card.appendChild(box);
  }

  function renderTakeDetails(actions, item) {
    if (item.kind !== "deposit") return;
    var field = textNode("label", "transfers-card__take-details");
    field.appendChild(textNode("span", "transfers-card__take-label", "Ваши реквизиты"));
    var textarea = document.createElement("textarea");
    textarea.rows = 2;
    textarea.maxLength = 700;
    textarea.placeholder = "карта, банк, телефон";
    textarea.setAttribute("data-transfers-take-details", item.id);
    field.appendChild(textarea);
    actions.appendChild(field);
  }

  function renderActions(card, item) {
    var actions = textNode("div", "transfers-card__actions");
    if (item.status === "open" && !item.isMine) {
      renderTakeDetails(actions, item);
      actions.appendChild(actionButton("take", "Взял", item));
    }
    if (item.status === "open" && item.isOwner) {
      if (item.requisites) actions.appendChild(shareButton(item));
      actions.appendChild(actionButton("cancel", "Отменить", item));
    }
    if (item.status === "reserved" && item.isBuyer) {
      actions.appendChild(actionButton("sent", "Отправил", item));
    }
    if (item.status === "buyer_sent" && item.isSeller) {
      actions.appendChild(actionButton("transferred", "Перевёл", item));
    }
    if (item.status === "seller_transferred" && item.isBuyer) {
      actions.appendChild(actionButton("received", "Получил", item));
    }
    if (state.viewer && state.viewer.isAdmin) {
      var deleteBtn = actionButton("delete", "Удалить", item);
      deleteBtn.classList.add("transfers-card__action--delete");
      actions.appendChild(deleteBtn);
    }
    if (actions.children.length) card.appendChild(actions);
  }

  function renderCard(item) {
    var card = textNode("article", "transfers-card transfers-card--" + item.status + " transfers-card--" + item.kind);
    card.setAttribute("data-transfer-card", item.id);

    var top = textNode("div", "transfers-card__top");
    var titleBlock = textNode("div", "transfers-card__title-block");
    titleBlock.appendChild(textNode(
      "span",
      "transfers-card__kind" + (item.kind === "cashout" ? " transfers-card__kind--cashout-request" : ""),
      kindText(item.kind)
    ));
    titleBlock.appendChild(textNode("strong", "transfers-card__amount", formatAmount(item.amount)));
    top.appendChild(titleBlock);
    top.appendChild(textNode("span", "transfers-card__status", statusText(item)));
    card.appendChild(top);

    if (item.status === "open" && Number(item.expiresAt || 0) > 0) {
      var listingTimer = textNode("div", "transfers-card__listing-timer", "Актуально ещё " + formatLeft(item.expiresAt));
      listingTimer.setAttribute("data-transfer-expires-at", String(item.expiresAt));
      card.appendChild(listingTimer);
    }

    var meta = textNode("div", "transfers-card__meta");
    [
      renderParticipant("Продавец", item, "owner"),
      renderParticipant("Покупатель", item, "buyer"),
    ].forEach(function (node) {
      if (node) meta.appendChild(node);
    });
    if (meta.children.length) card.appendChild(meta);

    if (item.comment) card.appendChild(textNode("p", "transfers-card__comment", item.comment));
    renderRequisites(card, item);
    renderActions(card, item);
    return card;
  }

  function renderTabs() {
    Array.prototype.slice.call(document.querySelectorAll("[data-transfers-filter]")).forEach(function (btn) {
      var active = btn.getAttribute("data-transfers-filter") === state.filter;
      btn.classList.toggle("transfers-tabs__btn--active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function render() {
    var list = byId("transfersList");
    var empty = byId("transfersEmpty");
    var viewer = byId("transfersViewerId");
    var form = byId("transfersCreateForm");
    var tabs = document.querySelector(".transfers-tabs");
    var locked = byId("transfersAccessLocked");
    var access = state.access;
    var accessResolved = !!access;
    var allowed = !accessResolved || access.allowed !== false;
    if (viewer && state.viewer && state.viewer.accountId) {
      viewer.hidden = false;
      viewer.textContent = "Ваш ID: " + state.viewer.accountId + (state.viewer.level ? " · уровень " + state.viewer.level : "");
    }
    var showCreate = allowed && state.filter === "create";
    if (form) form.hidden = !showCreate;
    if (tabs) tabs.hidden = !allowed;
    if (locked) {
      locked.hidden = !accessResolved || allowed;
      locked.textContent = !accessResolved || allowed ? "" : (access.message || "Переводы доступны только игрокам с уровнем 10+.");
    }
    renderMode();
    renderTabs();
    if (!list) return;
    list.textContent = "";
    list.hidden = !allowed || showCreate;
    if (!allowed) {
      if (empty) empty.hidden = true;
      return;
    }
    if (showCreate) {
      if (empty) empty.hidden = true;
      return;
    }
    var items = visibleItems();
    items.forEach(function (item) {
      list.appendChild(renderCard(item));
    });
    if (empty) {
      empty.hidden = items.length > 0 || state.loading;
      if (!items.length && !state.loading) {
        empty.textContent = state.filter === "completed"
          ? "Закрытых сделок пока нет."
          : state.filter === "active"
            ? "Активных заявок пока нет, можете разместить свой вывод по кнопке «Разместить»."
            : "Ваших заявок пока нет.";
      }
    }
  }

  function setLoading(value) {
    state.loading = !!value;
    var r = root();
    if (r) r.classList.toggle("transfers-page--loading", state.loading);
  }

  function loadTransfers(force, options) {
    options = options || {};
    var base = apiBase();
    var q = authQuery();
    if (!base || !q || q === "?initData=") {
      setFeedback("Нужно войти в аккаунт", "error");
      render();
      return Promise.resolve(null);
    }
    if (state.fetching) return Promise.resolve(null);
    if (!force && state.loadedAt && Date.now() - state.loadedAt < 15000) {
      render();
      return Promise.resolve(state.items);
    }
    state.fetching = true;
    if (!options.silent) setLoading(true);
    return fetchJson(base + "/api/transfers" + q, { method: "GET" })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "Не удалось загрузить заявки");
        state.items = Array.isArray(data.items) ? data.items : [];
        state.viewer = data.viewer || null;
        state.access = data.access || {
          allowed: !(data.viewer && data.viewer.transfersAccess === false),
          level: data.viewer && data.viewer.level ? Number(data.viewer.level) || 0 : 0,
          requiredLevel: data.viewer && data.viewer.requiredLevel ? Number(data.viewer.requiredLevel) || 10 : 10,
          message: "",
        };
        state.maxAmount = Number(data.maxAmount || 2500) || 2500;
        state.subscribed = !!data.subscribed;
        state.loadedAt = Date.now();
        render();
        renderSubscription();
        return state.items;
      })
      .catch(function (err) {
        if (!options.silent) setFeedback(err && err.message ? err.message : "Не удалось загрузить заявки", "error");
        render();
        return null;
      })
      .finally(function () {
        state.fetching = false;
        if (!options.silent) setLoading(false);
        render();
      });
  }

  function upsertItem(item) {
    if (!item || !item.id) return;
    state.items = state.items.filter(function (row) { return row.id !== item.id; });
    state.items.unshift(item);
    state.items.sort(function (a, b) {
      return Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0);
    });
    state.loadedAt = Date.now();
    render();
  }

  function postAction(payload, button) {
    var base = apiBase();
    if (!base) return Promise.resolve(null);
    var prev = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.textContent = "Ждём...";
    }
    setFeedback("", "");
    return fetchJson(base + "/api/transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(authedBody(payload)),
    })
      .then(function (data) {
        if (!data || !data.ok) throw new Error((data && data.error) || "Не удалось выполнить действие");
        if (data.item) upsertItem(data.item);
        if (payload.action === "delete" && data.deleted) {
          state.items = state.items.filter(function (row) { return row.id !== payload.id; });
          state.loadedAt = Date.now();
          render();
        }
        if (payload.action === "received") {
          try {
            if (typeof pokerClearCurrentProfileUserInfoCache === "function") pokerClearCurrentProfileUserInfoCache();
          } catch (eProfileCache) {}
        }
        setFeedback("Готово", "ok");
        return data;
      })
      .catch(function (err) {
        setFeedback(err && err.message ? err.message : "Не удалось выполнить действие", "error");
        return null;
      })
      .finally(function () {
        if (button) {
          button.disabled = false;
          button.textContent = prev;
        }
      });
  }

  function handleCreate(event) {
    event.preventDefault();
    var amountEl = byId("transfersAmountInput");
    var commentEl = byId("transfersCommentInput");
    var bankEl = byId("transfersBankInput");
    var recipientEl = byId("transfersRecipientInput");
    var phoneEl = byId("transfersPhoneInput");
    var cardEl = byId("transfersCardInput");
    var expiryEl = byId("transfersExpiryInput");
    var amount = amountEl ? Number(amountEl.value) || 0 : 0;
    if (!amount || amount > state.maxAmount) {
      setFeedback("Максимум " + state.maxAmount + " ₽", "error");
      return;
    }
    var bank = bankEl ? bankEl.value.trim() : "";
    var recipient = recipientEl ? recipientEl.value.trim() : "";
    var phone = phoneEl ? phoneEl.value.trim() : "";
    var phoneDigitsEntered = russianPhoneLocalDigits(phone).length;
    if (!phoneDigitsEntered) phone = "";
    var cardNumber = cardEl ? cardEl.value.trim() : "";
    if (state.kind === "cashout" && !bank) {
      setFeedback("Укажите банк", "error");
      return;
    }
    if (state.kind === "cashout" && !recipient) {
      setFeedback("Укажите получателя (ФИО)", "error");
      if (recipientEl) recipientEl.focus();
      return;
    }
    if (state.kind === "cashout" && !phone && !cardNumber) {
      setFeedback("Укажите номер телефона или номер карты", "error");
      return;
    }
    var normalizedPhone = phone ? normalizeRussianPhone(phone) : "";
    if (phone && !normalizedPhone) {
      setFeedback("Введите телефон в формате +7 (999) 999-99-99", "error");
      if (phoneEl) phoneEl.focus();
      return;
    }
    if (normalizedPhone) phone = formatRussianPhoneInput(normalizedPhone.slice(1));
    var details = [
      bank ? "Банк: " + bank : "",
      recipient ? "Получатель: " + recipient : "",
      phone ? "Номер: " + phone : "",
      cardNumber ? "Номер карты: " + cardNumber : "",
    ].filter(Boolean).join("\n");
    var submit = byId("transfersCreateSubmit");
    postAction({
      action: "create",
      kind: state.kind,
      amount: amount,
      comment: commentEl ? commentEl.value : "",
      requisites: state.kind === "cashout" ? details : "",
      phoneNumber: normalizedPhone,
      recipientName: recipient,
      activeMinutes: expiryEl ? Number(expiryEl.value) || 30 : 30,
    }, submit).then(function (data) {
      if (!data || !data.ok) return;
      if (commentEl) commentEl.value = "";
      if (bankEl) bankEl.value = "";
      if (recipientEl) recipientEl.value = "";
      if (phoneEl) phoneEl.value = "";
      if (cardEl) cardEl.value = "";
      if (amountEl) amountEl.value = "";
      state.filter = "active";
      render();
    });
  }

  function handleAction(event) {
    var btn = event.target && event.target.closest ? event.target.closest("[data-transfers-action]") : null;
    if (!btn || btn.disabled) return;
    var action = btn.getAttribute("data-transfers-action");
    var id = btn.getAttribute("data-transfer-id");
    if (!action || !id) return;
    var payload = { action: action, id: id };
    if (action === "delete" && typeof window.confirm === "function" && !window.confirm("Удалить эту заявку без возможности восстановления?")) return;
    if (action === "take") {
      var details = document.querySelector('[data-transfers-take-details="' + id.replace(/"/g, '\\"') + '"]');
      if (details) {
        payload.requisites = details.value.trim();
        if (!payload.requisites) {
          setFeedback("Укажите реквизиты", "error");
          return;
        }
      }
    }
    postAction(payload, btn);
  }

  function handleShare(event) {
    var btn = event.target && event.target.closest ? event.target.closest("[data-transfers-share]") : null;
    if (!btn || btn.disabled) return false;
    var id = btn.getAttribute("data-transfers-share");
    var item = state.items.filter(function (row) { return row.id === id; })[0];
    shareTransfer(item);
    return true;
  }

  function bind() {
    var r = root();
    if (!r || state.bound) return;
    state.bound = true;
    r.addEventListener("click", function (event) {
      var emojiToggle = event.target && event.target.closest ? event.target.closest("#transfersCommentEmojiToggle") : null;
      var emojiPicker = byId("transfersCommentEmojiPicker");
      if (emojiToggle) {
        var willOpen = !!(emojiPicker && emojiPicker.hidden);
        if (emojiPicker) emojiPicker.hidden = !willOpen;
        emojiToggle.setAttribute("aria-expanded", willOpen ? "true" : "false");
        return;
      }
      var emojiBtn = event.target && event.target.closest ? event.target.closest("[data-transfers-comment-emoji]") : null;
      if (emojiBtn) {
        var commentInput = byId("transfersCommentInput");
        var emoji = emojiBtn.getAttribute("data-transfers-comment-emoji") || "";
        if (commentInput && emoji) {
          var start = typeof commentInput.selectionStart === "number" ? commentInput.selectionStart : commentInput.value.length;
          var end = typeof commentInput.selectionEnd === "number" ? commentInput.selectionEnd : start;
          commentInput.value = commentInput.value.slice(0, start) + emoji + commentInput.value.slice(end);
          commentInput.focus();
          commentInput.setSelectionRange(start + emoji.length, start + emoji.length);
        }
        return;
      }
      var sectionShare = event.target && event.target.closest ? event.target.closest("[data-transfers-share-section]") : null;
      if (sectionShare) {
        shareTransfersSection();
        return;
      }
      var subscribe = event.target && event.target.closest ? event.target.closest("#transfersSubscribeBtn") : null;
      if (subscribe) {
        toggleSubscription(subscribe);
        return;
      }
      var mode = event.target && event.target.closest ? event.target.closest("[data-transfers-kind]") : null;
      if (mode) {
        state.kind = mode.getAttribute("data-transfers-kind") || "cashout";
        setFeedback("", "");
        render();
        return;
      }
      var filter = event.target && event.target.closest ? event.target.closest("[data-transfers-filter]") : null;
      if (filter) {
        state.filter = filter.getAttribute("data-transfers-filter") || "active";
        render();
        return;
      }
      if (handleShare(event)) return;
      handleAction(event);
    });
    var form = byId("transfersCreateForm");
    if (form) form.addEventListener("submit", handleCreate);
    var phoneInput = byId("transfersPhoneInput");
    if (phoneInput) {
      phoneInput.addEventListener("focus", function () {
        phoneInput.value = formatRussianPhoneInput(phoneInput.value, true);
        var next = phoneInput.value.indexOf("_");
        if (next >= 0) phoneInput.setSelectionRange(next, next + 1);
      });
      phoneInput.addEventListener("input", function () {
        var formatted = formatRussianPhoneInput(phoneInput.value, true);
        if (phoneInput.value !== formatted) phoneInput.value = formatted;
        phoneInput.setCustomValidity(phoneInput.value && !normalizeRussianPhone(phoneInput.value) ? "Введите полный номер телефона" : "");
        var next = phoneInput.value.indexOf("_");
        var caret = next >= 0 ? next : phoneInput.value.length;
        phoneInput.setSelectionRange(caret, next >= 0 ? caret + 1 : caret);
      });
      phoneInput.addEventListener("keydown", function (event) {
        if (event.key !== "Backspace") return;
        var digits = russianPhoneLocalDigits(phoneInput.value);
        if (!digits.length) return;
        event.preventDefault();
        phoneInput.value = formatRussianPhoneInput(digits.slice(0, -1), true);
        phoneInput.setCustomValidity(phoneInput.value && !normalizeRussianPhone(phoneInput.value) ? "Введите полный номер телефона" : "");
        var next = phoneInput.value.indexOf("_");
        if (next >= 0) phoneInput.setSelectionRange(next, next + 1);
      });
      phoneInput.addEventListener("blur", function () {
        if (!russianPhoneLocalDigits(phoneInput.value).length) {
          phoneInput.value = "";
          phoneInput.setCustomValidity("");
        }
      });
    }
  }

  function activeView() {
    return document.body && document.body.getAttribute("data-view") === "transfers";
  }

  function isTransfersKeyboardField(node) {
    if (!node || !node.matches) return false;
    return !!node.matches(
      "#transfersAmountInput, #transfersCommentInput, #transfersBankInput, #transfersRecipientInput, #transfersPhoneInput, #transfersCardInput, [data-transfers-take-details]"
    );
  }

  function setTransfersKeyboardClass(active) {
    try {
      if (document.documentElement) document.documentElement.classList.toggle("transfers-keyboard-open", !!active);
      if (document.body) document.body.classList.toggle("transfers-keyboard-open", !!active);
    } catch (eTransfersKbClass) {}
  }

  function runTransfersKeyboardRestore() {
    if (!activeView()) return;
    if (isTransfersKeyboardField(document.activeElement)) return;
    keyboardRestoreInProgress = true;
    setTransfersKeyboardClass(false);
    try {
      if (typeof setTelegramIosKeyboardRootLock === "function") setTelegramIosKeyboardRootLock(false);
    } catch (eTransfersTgKbUnlock) {}
    try {
      if (typeof pokerClearBodyDocumentScrollLockInline === "function") pokerClearBodyDocumentScrollLockInline();
    } catch (eTransfersBodyUnlock) {}
    try {
      if (typeof pokerEnsureUnlockedDocumentScrollForNonChat === "function") pokerEnsureUnlockedDocumentScrollForNonChat();
    } catch (eTransfersDocUnlock) {}
    try {
      if (typeof pokerSyncViewHtmlScrollClasses === "function") pokerSyncViewHtmlScrollClasses("transfers");
    } catch (eTransfersScrollClass) {}
    try {
      if (typeof pokerApplyAppTopPadding === "function") pokerApplyAppTopPadding();
    } catch (eTransfersTopPad) {}
    try {
      if (typeof pokerApplyTelegramTopClearance === "function") pokerApplyTelegramTopClearance();
    } catch (eTransfersTopClearance) {}
    try {
      if (typeof pokerApplyBottomTabbarPad === "function") {
        pokerApplyBottomTabbarPad._lastPad = null;
        pokerApplyBottomTabbarPad();
      }
    } catch (eTransfersTabbarPad) {}
    try {
      if (typeof pokerNukeIosKeyboardViewportArtifacts === "function") {
        pokerNukeIosKeyboardViewportArtifacts({ resetMainScroll: true });
      }
    } catch (eTransfersVvNuke) {}
    try {
      if (typeof pokerFlushBottomNavAndViewportAfterChatChrome === "function") {
        pokerFlushBottomNavAndViewportAfterChatChrome();
      }
    } catch (eTransfersNavFlush) {}
    try {
      if (typeof window.tryTelegramWebAppExpandBurst === "function") window.tryTelegramWebAppExpandBurst();
      else if (typeof window.tryTelegramWebAppExpand === "function") window.tryTelegramWebAppExpand();
    } catch (eTransfersExpand) {}
    try {
      if (typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("resize"));
    } catch (eTransfersResize) {}
    setTimeout(function () {
      keyboardRestoreInProgress = false;
    }, 120);
  }

  function scheduleTransfersKeyboardRestore() {
    keyboardRestoreTimers.forEach(function (timer) {
      clearTimeout(timer);
    });
    keyboardRestoreTimers = [];
    [40, 140, 320, 680].forEach(function (delay) {
      keyboardRestoreTimers.push(setTimeout(runTransfersKeyboardRestore, delay));
    });
  }

  function bindKeyboardRestore() {
    var r = root();
    if (!r || r.__pokerTransfersKeyboardRestoreBound) return;
    r.__pokerTransfersKeyboardRestoreBound = true;
    r.addEventListener("focusin", function (event) {
      if (!isTransfersKeyboardField(event.target)) return;
      setTransfersKeyboardClass(true);
      try {
        if (typeof window.tryTelegramWebAppExpandBurst === "function") window.tryTelegramWebAppExpandBurst();
      } catch (eTransfersFocusExpand) {}
    });
    r.addEventListener("focusout", function (event) {
      if (!isTransfersKeyboardField(event.target)) return;
      scheduleTransfersKeyboardRestore();
    });
    if (!window.__pokerTransfersVisualViewportRestoreBound) {
      window.__pokerTransfersVisualViewportRestoreBound = true;
      var onViewportRest = function () {
        if (keyboardRestoreInProgress) return;
        if (!activeView() || isTransfersKeyboardField(document.activeElement)) return;
        scheduleTransfersKeyboardRestore();
      };
      try {
        if (window.visualViewport && window.visualViewport.addEventListener) {
          window.visualViewport.addEventListener("resize", onViewportRest);
          window.visualViewport.addEventListener("scroll", onViewportRest);
        }
      } catch (eTransfersVvListen) {}
      window.addEventListener("resize", onViewportRest);
    }
  }

  function bindBodyObserver() {
    if (window.__pokerTransfersBodyObserverBound) return;
    window.__pokerTransfersBodyObserverBound = true;
    try {
      var observer = new MutationObserver(function () {
        if (activeView()) {
          bind();
          loadTransfers(false);
        }
      });
      if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ["data-view"] });
    } catch (eObserver) {}
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && activeView() && Date.now() - Number(state.loadedAt || 0) > 5000) loadTransfers(true, { silent: true });
    });
  }

  function startTicker() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      if (!activeView()) return;
      Array.prototype.slice.call(document.querySelectorAll(".transfers-card--reserved .transfers-card__status")).forEach(function (el) {
        var card = el.closest("[data-transfer-card]");
        var id = card ? card.getAttribute("data-transfer-card") : "";
        var item = state.items.filter(function (row) { return row.id === id; })[0];
        if (item) el.textContent = statusText(item);
      });
      Array.prototype.slice.call(document.querySelectorAll("[data-transfer-expires-at]")).forEach(function (el) {
        var expiresAt = Number(el.getAttribute("data-transfer-expires-at") || 0);
        el.textContent = "Актуально ещё " + formatLeft(expiresAt);
        if (expiresAt > 0 && expiresAt <= Date.now() && el.dataset.expiryRefresh !== "1") {
          el.dataset.expiryRefresh = "1";
          loadTransfers(true, { silent: true });
        }
      });
    }, 1000);
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (!activeView() || document.hidden) return;
      loadTransfers(true, { silent: true });
    }, 20000);
  }

  function initTransfers() {
    bindBodyObserver();
    bind();
    bindKeyboardRestore();
    render();
    startTicker();
    startPolling();
    if (activeView()) loadTransfers(false);
  }

  window.pokerInitTransfers = initTransfers;
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initTransfers);
  } else {
    initTransfers();
  }
})();
