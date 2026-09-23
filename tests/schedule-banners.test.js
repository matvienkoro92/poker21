"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

const { scheduleBannerView } = require("../lib/api-handlers/telegram-report-webhook");

test("баннеры показывают доступные форматы вместе и листаются в том же сообщении", () => {
  for (let index = 1; index <= 5; index += 1) {
    const view = scheduleBannerView(index);
    assert.match(view.text, new RegExp(`Среда</b> · ${index} из 5`));
    assert.equal(view.inlineKeyboard.at(-1)[0].callback_data, "pulse:menu");
    assert.match(view.text, /square\/wednesday/);
    const square = path.join(__dirname, `../assets/schedule/banners/square/wednesday/wednesday-${index}.png`);
    assert.ok(fs.existsSync(square));
    if (index <= 4) {
      assert.match(view.previewUrl, new RegExp(`combined/wednesday/wednesday-${index}\\.jpg`));
      assert.match(view.text, /story\/wednesday/);
      const combined = path.join(__dirname, `../assets/schedule/banners/combined/wednesday/wednesday-${index}.jpg`);
      assert.ok(fs.statSync(combined).size < 3_000_000);
    } else {
      assert.match(view.previewUrl, /square\/wednesday\/wednesday-5\.png/);
      assert.doesNotMatch(view.text, /story\/wednesday/);
    }
  }
  assert.equal(scheduleBannerView(1).inlineKeyboard[0][0].callback_data, "schedule:banners:2");
  assert.equal(scheduleBannerView(5).inlineKeyboard[0][0].callback_data, "schedule:banners:4");
});

test("открытие и перелистывание меняют исходное сообщение", async () => {
  const source = fs.readFileSync(require.resolve("../lib/api-handlers/telegram-report-webhook"), "utf8");
  const method = source.slice(source.indexOf("async function showScheduleBanners("), source.indexOf("async function sendTournamentSchedule("));
  const calls = [];
  const context = {
    scheduleBannerView,
    telegram: async (name, body) => { calls.push({ name, body }); return { ok: true }; },
  };
  vm.createContext(context);
  vm.runInContext(method, context);
  await context.showScheduleBanners("-1001", 42, 1, false);
  await context.showScheduleBanners("-1001", 42, 2, false);
  assert.deepEqual(calls.map((call) => call.name), ["editMessageText", "editMessageText"]);
  assert.deepEqual(calls.map((call) => call.body.message_id), [42, 42]);
  assert.match(calls[1].body.link_preview_options.url, /wednesday-2\.jpg/);
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
