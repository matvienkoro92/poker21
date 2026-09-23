"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

const { scheduleBannerView } = require("../lib/api-handlers/telegram-report-webhook");

test("баннеры показывают доступные форматы вместе и листаются в том же сообщении", () => {
  for (let index = 1; index <= 5; index += 1) {
    const view = scheduleBannerView(index);
    assert.match(view.text, new RegExp(`Среда</b> · ${index} из 5`));
    assert.equal(view.inlineKeyboard.at(-1)[0].callback_data, "schedule:view:today");
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
