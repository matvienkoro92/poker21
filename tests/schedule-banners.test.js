"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

const { scheduleBannerView } = require("../lib/api-handlers/telegram-report-webhook");

test("форматы выбираются кнопками, фотографии показываются отдельно без ссылок", () => {
  for (const [format, count, label] of [["square", 5, "Квадрат"], ["story", 4, "Сторис"]]) {
    for (let index = 1; index <= count; index += 1) {
      const view = scheduleBannerView(index, format);
      assert.match(view.text, new RegExp(`Среда</b> · ${index} из ${count} · ${label}$`));
      assert.equal(view.inlineKeyboard.at(-1)[0].callback_data, "schedule:banners:close");
      assert.deepEqual(view.inlineKeyboard.at(-2).map((button) => button.callback_data), ["schedule:banners:square:1", "schedule:banners:story:1"]);
      assert.match(view.previewUrl, new RegExp(`^https://poker21-app\\.vercel\\.app/assets/schedule/banners/${format}/wednesday/wednesday-${index}\\.png`));
      assert.doesNotMatch(view.text, /<a |github/i);
      assert.ok(fs.existsSync(path.join(__dirname, `../assets/schedule/banners/${format}/wednesday/wednesday-${index}.png`)));
    }
  }
  assert.equal(scheduleBannerView(1).inlineKeyboard[0][0].callback_data, "schedule:banners:square:2");
  assert.equal(scheduleBannerView(4, "story").inlineKeyboard[0][0].callback_data, "schedule:banners:story:3");
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
  await context.showScheduleBanners("-1001", 43, 2, true, "story");
  assert.deepEqual(calls.map((call) => call.name), ["sendPhoto", "editMessageMedia"]);
  assert.equal(calls[0].body.message_id, undefined);
  assert.equal(calls[1].body.message_id, 43);
  assert.match(calls[1].body.media.media, /story\/wednesday\/wednesday-2\.png/);
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
  assert.equal(buttons.filter((button) => button.callback_data === "schedule:banners").length, 1);
  assert.equal(context.scheduleViewKeyboard("today").inline_keyboard.flat().some((button) => button.callback_data === "schedule:banners"), false);
});
