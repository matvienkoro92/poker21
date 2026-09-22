"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const sharp = require("sharp");

process.env.TELEGRAM_BOT_TOKEN = "test-token";
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = "test-secret";

const { scheduleBannerView } = require("../lib/api-handlers/telegram-report-webhook");

test("квадратные баннеры среды доступны по одному в том же сообщении", async () => {
  const menu = scheduleBannerView();
  assert.equal(menu.inlineKeyboard[0][0].callback_data, "schedule:banners:square");
  assert.equal(menu.inlineKeyboard[1][0].callback_data, "schedule:banners:story");
  const days = scheduleBannerView("square");
  assert.deepEqual(days.inlineKeyboard[0].map((button) => button.text), ["Среда"]);
  for (let index = 1; index <= 5; index += 1) {
    const view = scheduleBannerView("square", "wed", index);
    assert.match(view.text, new RegExp(`Среда · ${index} из 5`));
    assert.match(view.previewUrl, new RegExp(`wednesday-${index}\\.png`));
    assert.equal(view.inlineKeyboard.at(-1)[0].callback_data, "schedule:view:today");
    const file = path.join(__dirname, `../assets/schedule/banners/square/wednesday/wednesday-${index}.png`);
    assert.ok(fs.statSync(file).size < 3_000_000);
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, metadata.height);
    assert.equal(metadata.isPalette, false);
  }
  assert.equal(scheduleBannerView("square", "wed", 1).inlineKeyboard[0].length, 1);
  assert.equal(scheduleBannerView("square", "wed", 5).inlineKeyboard[0].length, 1);
  const storyDays = scheduleBannerView("story");
  assert.deepEqual(storyDays.inlineKeyboard[0].map((button) => button.text), ["Среда"]);
  for (let index = 1; index <= 4; index += 1) {
    const view = scheduleBannerView("story", "wed", index);
    assert.match(view.text, new RegExp(`Среда · ${index} из 4`));
    assert.match(view.previewUrl, new RegExp(`story/wednesday/wednesday-${index}\\.png`));
    const file = path.join(__dirname, `../assets/schedule/banners/story/wednesday/wednesday-${index}.png`);
    assert.ok(fs.statSync(file).size < 3_000_000);
    const metadata = await sharp(file).metadata();
    assert.ok(metadata.height > metadata.width);
    assert.equal(metadata.isPalette, false);
  }
});
