"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const sharp = require("sharp");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

const { scheduleBannerTodayPage, scheduleBannerView, scheduleBannerCallbackSelection, isBannerChat } = require("../lib/api-handlers/telegram-report-webhook");

test("баннеры доступны в группах клубов и союзов", () => {
  assert.equal(isBannerChat({ type: "group", title: "Poker21 союз Ginger" }), true);
  assert.equal(isBannerChat({ type: "supergroup", title: "Poker21 клуб Два Туза" }), true);
  assert.equal(isBannerChat({ type: "supergroup", title: "poker21plus общий чат" }), true);
  assert.equal(isBannerChat({ type: "private", title: "Личный чат" }), false);
});

test("вторник: по пять баннеров в обоих форматах", async () => {
  for (const format of ["square", "story"]) {
    for (let i = 1; i <= 5; i++) {
      const view = scheduleBannerView(i + (format === "square" ? 5 : 4), format);
      assert.match(view.text, new RegExp(`Вторник</b> · ${i} из 5`));
      assert.match(view.previewUrl, new RegExp(`${format}/tuesday/tuesday-${i}\\.jpg`));
      assert.equal(view.inlineKeyboard.flat().find(button => button.text === "✅ ВТ").callback_data, `schedule:banners:${format}:${format === "square" ? 6 : 5}`);
      const file = path.join(__dirname, `../assets/schedule/banners/${format}/tuesday/tuesday-${i}.jpg`);
      assert.ok(fs.statSync(file).size < 700_000);
      const metadata = await sharp(file).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
    }
    const otherFormat = format === "square" ? "story" : "square";
    const switchButton = scheduleBannerView(3 + (format === "square" ? 5 : 4), format).inlineKeyboard.flat().find(button => button.callback_data === `schedule:banners:format:${otherFormat}:tue`);
    assert.ok(switchButton);
    assert.deepEqual(scheduleBannerCallbackSelection(null, [null, otherFormat, "tue"]), { format: otherFormat, page: otherFormat === "square" ? 6 : 5, isPhoto: true });
  }
});

test("смена формата сохраняет день, включая кнопки старого сообщения", () => {
  for (const [format, thursdayPage] of [["square", 22], ["story", 20]]) {
    const callback = `schedule:banners:format:${format}:thu`.match(/^schedule:banners:format:(square|story):(wed|thu)$/);
    assert.deepEqual(scheduleBannerCallbackSelection(null, callback), { format, page: thursdayPage, isPhoto: true });
    const oldCallback = `schedule:banners:${format}:1`.match(/^schedule:banners(?::(square|story):([1-9]\d?))?$/);
    const oldCaption = `🖼 Четверг · 6 из 11 · ${format === "square" ? "Сторис" : "Квадрат"}`;
    assert.deepEqual(scheduleBannerCallbackSelection(oldCallback, null, oldCaption), { format, page: thursdayPage, isPhoto: true });
    const dayCallback = `schedule:banners:${format}:1`.match(/^schedule:banners(?::(square|story):([1-9]\d?))?$/);
    assert.equal(scheduleBannerCallbackSelection(dayCallback, null, `🖼 Четверг · 6 из 11 · ${format === "square" ? "Квадрат" : "Сторис"}`).page, "1");
  }
});

test("среда: новый баннер первый в каждом формате, остальные сохранены", async () => {
  for (const [format, oldCount, label] of [["square", 10, "Квадрат"], ["story", 9, "Сторис"]]) {
    const start = format === "square" ? 11 : 10;
    const first = scheduleBannerView(start, format);
    assert.match(first.text, new RegExp(`Среда</b> · 1 из ${oldCount + 1} · ${label}$`));
    assert.match(first.previewUrl, new RegExp(`${format}/wednesday/wednesday-kosar-1\\.jpg`));
    assert.equal(first.inlineKeyboard.flat().find(button => button.text === "✅ СР").callback_data, `schedule:banners:${format}:${start}`);
    assert.equal(first.inlineKeyboard[0][0].callback_data, `schedule:banners:${format}:${start + 1}`);
    const other = format === "square" ? "story" : "square";
    assert.deepEqual(scheduleBannerCallbackSelection(null, [null, other, "wed"]), { format: other, page: other === "square" ? 11 : 10, isPhoto: true });
    for (let i = 0; i <= oldCount; i++) {
      const view = scheduleBannerView(start + i, format);
      assert.match(view.text, new RegExp(`Среда</b> · ${i + 1} из ${oldCount + 1} · ${label}$`));
      const filename = i === 0 ? "wednesday-kosar-1.jpg" : i <= (format === "square" ? 5 : 4) ? `wednesday-${i}-info.jpg` : `wednesday-magic-${i - (format === "square" ? 5 : 4)}.jpg`;
      assert.match(view.previewUrl, new RegExp(`${format}/wednesday/${filename.replace(".", "\\.")}`));
      const image = path.join(__dirname, `../assets/schedule/banners/${format}/wednesday/${filename}`);
      assert.ok(fs.statSync(image).size < 700_000);
      const metadata = await sharp(image).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
    }
  }
});

test("кнопка открывает новую фотографию, а стрелки меняют её", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const method = source.slice(source.indexOf("async function showScheduleBanners("), source.indexOf("async function sendTournamentSchedule("));
  const calls = [];
  const scheduled = [];
  const state = new Map();
  const context = {
    scheduleBannerView,
    telegram: async (name, body) => { calls.push({ name, body }); return { ok: true, result: { message_id: 43 } }; },
    redisPipeline: async (commands) => commands.map(([command, key, value]) => {
      if (command === "SET") state.set(key, value);
      if (command === "DEL") state.delete(key);
      return { result: command === "GET" ? state.get(key) : 1 };
    }),
    isRedisConfigured: () => true,
    fetch: async (url, options) => { scheduled.push({ url, options }); return { ok: true }; },
    process: { env: { QSTASH_TOKEN: "test-token" } },
    WEBHOOK_SECRET: "test-secret",
    APP_ORIGIN: "https://example.com",
    require,
    console,
  };
  vm.createContext(context);
  vm.runInContext(method, context);
  await context.showScheduleBanners("-1001", 42, 1, false);
  const firstNonce = [...state.values()][0];
  await context.showScheduleBanners("-1001", 43, 6, true, "story");
  assert.deepEqual(calls.map((call) => call.name), ["sendPhoto", "editMessageMedia"]);
  assert.equal(calls[0].body.message_id, undefined);
  assert.equal(calls[1].body.message_id, 43);
  assert.match(calls[1].body.media.media, /story\/tuesday\/tuesday-2\.jpg/);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[0].options.headers["Upstash-Delay"], "1m");
  assert.equal(await context.closeIdleBanner({ chatId: "-1001", messageId: 43, nonce: firstNonce }), false);
  assert.equal(await context.closeIdleBanner({ chatId: "-1001", messageId: 43, nonce: [...state.values()][0] }), true);
  assert.equal(calls.at(-1).name, "deleteMessage");
});

test("кнопка баннеров находится в главном меню, а не в расписании", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const scheduleKeyboard = source.slice(source.indexOf("function scheduleViewKeyboard("), source.indexOf("function pulseScheduleKeyboard("));
  const mainMenu = source.slice(source.indexOf("async function sendPublicPulseMenu("), source.indexOf("async function sendLiveTablesMenu("));
  const calls = [];
  const context = { telegram: async (name, body) => { calls.push({ name, body }); return { ok: true }; } };
  vm.createContext(context);
  vm.runInContext(scheduleKeyboard + mainMenu, context);
  await context.sendPublicPulseMenu("-1001", null, 42);
  const buttons = calls[0].body.reply_markup.inline_keyboard.flat();
  assert.equal(buttons.find((button) => button.callback_data === "schedule:banners").text, "🖼 Банеры на сегодня");
  assert.equal(buttons[0].callback_data, "schedule:banners");
  assert.equal(buttons[0].style, "success");
  assert.equal(buttons.filter((button) => button.callback_data === "schedule:banners").length, 1);
  assert.equal(context.scheduleViewKeyboard("today").inline_keyboard.flat().some((button) => button.callback_data === "schedule:banners"), false);
});

test("команда /банеры распознаётся в общем чате", () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const command = source.slice(source.indexOf("function isBannersCommand("), source.indexOf("function scheduleViewMode("));
  const context = {};
  vm.createContext(context);
  vm.runInContext(command, context);
  assert.equal(context.isBannersCommand("/банеры"), true);
  assert.equal(context.isBannersCommand("/баннеры@Poker21Bot"), true);
  assert.equal(context.isBannersCommand("/банеры завтра"), false);
});


test("суббота: файлы каждого формата, свой счётчик и сохранение дня", async () => {
  for (const [format, start, count] of [["square", 28, 8], ["story", 25, 6]]) {
    for (let i = 0; i < count; i++) {
      const view = scheduleBannerView(start + i, format);
      assert.match(view.text, new RegExp(`Суббота</b> · ${i + 1} из ${count}`));
      assert.deepEqual(view.inlineKeyboard.at(-3).map(b => b.text.startsWith("✅ ")), [false, false, false, false, true, false]);
      for (const button of view.inlineKeyboard.at(-2)) {
        const match = button.callback_data.match(/^schedule:banners:format:(square|story|landscape):(wed|thu|sat)$/);
        assert.ok(match);
        const selection = scheduleBannerCallbackSelection(null, match);
        assert.match(scheduleBannerView(selection.page, selection.format).text, new RegExp(`Суббота</b> · 1 из ${{square: 8, story: 6}[selection.format]}`));
      }
      const navigation = view.inlineKeyboard.flat().filter(b => /^(⬅️|Следующий)/.test(b.text));
      assert.equal(navigation.length, i === 0 || i === count - 1 ? 1 : 2);
      const image = path.join(__dirname, `../assets/schedule/banners/${format}/saturday/saturday-${i + 1}-info.jpg`);
      const metadata = await sharp(image).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else if (format === "story") assert.ok(metadata.height / metadata.width > 1.5);
      else assert.ok(metadata.width > metadata.height);
      assert.ok(fs.statSync(image).size < 700_000);
    }
  }
});

test("старые горизонтальные кнопки открывают квадратные версии", () => {
  for (let i = 1; i <= 3; i++) {
    const selection = scheduleBannerCallbackSelection(["", "landscape", String(i)], null);
    const view = scheduleBannerView(selection.page, selection.format);
    assert.match(view.previewUrl, new RegExp(`square/saturday/saturday-${i + 5}-info`));
    assert.equal(view.inlineKeyboard.at(-2).length, 2);
  }
});


test("воскресенье: пять баннеров и переключение форматов", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const callbackPattern = source.match(/const scheduleBannersFormatCallback = .*?\.match\((\/.*?\/)\)/)[1];
  const formatRegex = new RegExp(callbackPattern.slice(1, -1));
  for (const [format, start] of [["square", 36], ["story", 31]]) {
    for (let i = 1; i <= 5; i++) {
      const view = scheduleBannerView(start + i - 1, format);
      assert.match(view.text, new RegExp(`Воскресенье</b> · ${i} из 5`));
      assert.match(view.previewUrl, new RegExp(`${format}/sunday/sunday-${i}\\.jpg`));
      assert.equal(view.inlineKeyboard.flat().find(button => button.text === "✅ ВСКР").callback_data, `schedule:banners:${format}:${start}`);
      const navigation = view.inlineKeyboard.flat().filter(button => /^(⬅️|Следующий)/.test(button.text));
      assert.equal(navigation.length, i === 1 || i === 5 ? 1 : 2);
      const file = path.join(__dirname, `../assets/schedule/banners/${format}/sunday/sunday-${i}.jpg`);
      assert.ok(fs.statSync(file).size < 700_000);
      const metadata = await sharp(file).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
      for (const button of view.inlineKeyboard.at(-2)) {
        const match = button.callback_data.match(formatRegex);
        assert.ok(match);
        const selection = scheduleBannerCallbackSelection(null, match);
        assert.match(scheduleBannerView(selection.page, selection.format).text, /Воскресенье<\/b> · 1 из 5/);
      }
    }
  }
});

test("лидерборд: свои баннеры, навигация и переключение форматов", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const callbackPattern = source.match(/const scheduleBannersFormatCallback = .*?\.match\((\/.*?\/)\)/)[1];
  const formatRegex = new RegExp(callbackPattern.slice(1, -1));
  for (const [format, start, count] of [["square", 41, 4], ["story", 36, 2]]) {
    const entry = scheduleBannerView(1, format).inlineKeyboard.flat().find(b => b.text === "Лидерборд");
    assert.equal(entry.callback_data, `schedule:banners:${format}:${start}`);
    for (let i = 0; i < count; i++) {
      const view = scheduleBannerView(start + i, format);
      assert.match(view.text, new RegExp(`Лидерборд</b> · ${i + 1} из ${count}`));
      assert.equal(view.inlineKeyboard.flat().find(b => b.text === "✅ Лидерборд").callback_data, entry.callback_data);
      const navigation = view.inlineKeyboard.flat().filter(b => /^(⬅️|Следующий)/.test(b.text));
      assert.deepEqual(navigation.map(b => b.callback_data), [
        ...(i > 0 ? [`schedule:banners:${format}:${start + i - 1}`] : []),
        ...(i + 1 < count ? [`schedule:banners:${format}:${start + i + 1}`] : []),
      ]);
      for (const button of view.inlineKeyboard.at(-2)) {
        const match = button.callback_data.match(formatRegex);
        assert.ok(match);
        const selection = scheduleBannerCallbackSelection(null, match);
        assert.match(scheduleBannerView(selection.page, selection.format).text, /Лидерборд<\/b> · 1 из/);
      }
      const file = path.join(__dirname, `../assets/schedule/banners/${format}/leaderboard/leaderboard-${i + 1}.png`);
      assert.ok(fs.statSync(file).size < 10_000_000);
      const metadata = await sharp(file).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
      assert.match(view.previewUrl, new RegExp(`${format}/leaderboard/leaderboard-${i + 1}\\.png`));
    }
  }
});

test("турнир месяца: свои баннеры, навигация и переключение форматов", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const callbackPattern = source.match(/const scheduleBannersFormatCallback = .*?\.match\((\/.*?\/)\)/)[1];
  const formatRegex = new RegExp(callbackPattern.slice(1, -1));
  for (const [format, start, count] of [["square", 45, 13], ["story", 38, 10]]) {
    const entry = scheduleBannerView(1, format).inlineKeyboard.flat().find(b => b.text === "Главный турнир за 5к");
    assert.equal(entry, undefined);
    for (let i = 0; i < count; i++) {
      const view = scheduleBannerView(start + i, format);
      assert.match(view.text, new RegExp(`Главный турнир за 5к</b> · ${i + 1} из ${count}`));
      assert.ok(view.inlineKeyboard.flat().every(b => !b.text.includes("Главный турнир")));
      const navigation = view.inlineKeyboard.flat().filter(b => /^(⬅️|Следующий)/.test(b.text));
      assert.deepEqual(navigation.map(b => b.callback_data), [
        ...(i > 0 ? [`schedule:banners:${format}:${start + i - 1}`] : []),
        ...(i + 1 < count ? [`schedule:banners:${format}:${start + i + 1}`] : []),
      ]);
      for (const button of view.inlineKeyboard.at(-2)) {
        const match = button.callback_data.match(formatRegex);
        assert.ok(match);
        const selection = scheduleBannerCallbackSelection(null, match);
        assert.match(scheduleBannerView(selection.page, selection.format).text, /Главный турнир за 5к<\/b> · 1 из/);
      }
      const fileIndex = format === "square" ? [1, 2, 3, 4, 5, 6, 7, 11, 12, 13, 14, 15, 16][i] : i + 1;
      const file = path.join(__dirname, `../assets/schedule/banners/${format}/month3000/month3000-${fileIndex}.png`);
      assert.ok(fs.statSync(file).size < 10_000_000);
      const metadata = await sharp(file).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
      assert.match(view.previewUrl, new RegExp(`${format}/month3000/month3000-${fileIndex}\\.png`));
    }
  }
});


test("понедельник: все присланные баннеры и кнопка ПН", async () => {
  for (const [format, count] of [["square", 5], ["story", 4]]) {
    for (let i = 1; i <= count; i++) {
      const view = scheduleBannerView(i, format);
      assert.match(view.text, new RegExp(`Понедельник</b> · ${i} из ${count}`));
      assert.match(view.previewUrl, new RegExp(`${format}/monday/monday-${i}\\.jpg`));
      assert.ok(view.inlineKeyboard.flat().some(b => b.text === "✅ ПН"));
      const file = path.join(__dirname, `../assets/schedule/banners/${format}/monday/monday-${i}.jpg`);
      assert.ok(fs.statSync(file).size < 700_000);
      const metadata = await sharp(file).metadata();
      if (format === "square") assert.equal(metadata.width, metadata.height);
      else assert.ok(metadata.height / metadata.width > 1.5);
    }
    assert.deepEqual(scheduleBannerCallbackSelection(null, [null, format, "mon"]), { format, page: 1, isPhoto: true });
  }
});


test("начальное открытие выбирает сегодняшний день по Москве", () => {
  for (const format of ["square", "story"]) {
    assert.match(scheduleBannerView(scheduleBannerTodayPage(format, new Date("2026-10-07T12:00:00Z")), format).text, /Среда/);
    assert.match(scheduleBannerView(scheduleBannerTodayPage(format, new Date("2026-10-06T21:01:00Z")), format).text, /Среда/);
    assert.match(scheduleBannerView(scheduleBannerTodayPage(format, new Date("2026-10-06T20:59:00Z")), format).text, /Вторник/);
    assert.equal(scheduleBannerTodayPage(format, new Date("2026-10-09T12:00:00Z")), 1);
  }
  const selection = scheduleBannerCallbackSelection(["schedule:banners"], null);
  assert.equal(selection.page, scheduleBannerTodayPage());
  assert.equal(selection.isPhoto, false);
});

test("вся подборка отправляется альбомами выбранного дня и формата", async () => {
  const { sendScheduleBannerDay } = require("../lib/api-handlers/telegram-report-webhook");
  for (const [format, expected] of [["square", [10, 1]], ["story", [10]]]) {
    const calls = [];
    const send = async (method, body) => { calls.push({ method, body }); return { ok: true }; };
    assert.equal(await sendScheduleBannerDay("-1001", format, "wed", send), true);
    assert.deepEqual(calls.map(c => c.body.media?.length || 1), expected);
    const urls = calls.flatMap(c => c.body.media ? c.body.media.map(m => m.media) : [c.body.photo]);
    assert.equal(new Set(urls).size, expected.reduce((a, b) => a + b, 0));
    assert.ok(urls.every(url => url.includes(`/${format}/wednesday/`)));
    const view = scheduleBannerView(format === "square" ? 11 : 10, format);
    assert.ok(view.inlineKeyboard.flat().some(b => b.callback_data === `schedule:banners:all:${format}:wed`));
  }
  let attempts = 0;
  assert.equal(await sendScheduleBannerDay("-1001", "square", "wed", async () => { attempts++; return { ok: false }; }), false);
  assert.equal(attempts, 1);
});
