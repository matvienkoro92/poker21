#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

const artifactToolModule = process.env.ARTIFACT_TOOL_MODULE || path.join(
  os.homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs",
);
const { SpreadsheetFile, Workbook } = await import(pathToFileURL(artifactToolModule));

const [jsonPath, outputDir] = process.argv.slice(2);
if (!jsonPath || !outputDir) throw new Error("Usage: build-club-reports.mjs INPUT.json OUTPUT_DIR");
const payload = JSON.parse(await fs.readFile(jsonPath, "utf8"));
await fs.mkdir(outputDir, { recursive: true });

const safeName = (value) => String(value).replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, " ").trim();
const period = `${payload.startDate.split("-").reverse().join(".")}–${payload.endDate.split("-").reverse().join(".")}`;
const moneyFormat = "#,##0.00;[Red]-#,##0.00";
const metric = (club, name) => Number(club.metrics[name] || 0);
const colName = (index) => {
  let value = "";
  for (let number = index + 1; number; number = Math.floor((number - 1) / 26)) value = String.fromCharCode(65 + ((number - 1) % 26)) + value;
  return value;
};

for (const club of payload.clubs) {
  const workbook = Workbook.create();
  const summary = workbook.worksheets.add("Сводка");
  const players = workbook.worksheets.add("Игроки");
  const full = workbook.worksheets.add("Полные данные");

  summary.showGridLines = false;
  summary.getRange("A1:F1").merge();
  summary.getRange("A1").values = [[`${club.name} (${club.id})`]];
  summary.getRange("A2:F2").merge();
  summary.getRange("A2").values = [[`Период: ${period}`]];
  summary.getRange("A1:F2").format = { fill: "#111827", font: { color: "#FFFFFF", bold: true }, rowHeight: 28 };
  summary.getRange("A1").format.font = { color: "#FFFFFF", bold: true, size: 16 };
  summary.getRange("A4:B13").values = [
    ["Показатель", "Значение"],
    ["Выигрыш игроков", metric(club, "Winnings")],
    ["Cash-комиссия", metric(club, "Ring Game Fee")],
    ["MTT-комиссия", metric(club, "MTT Fee")],
    ["SNG-комиссия", metric(club, "SNG Fee")],
    ["Весь рейк", null],
    ["Страховка", metric(club, "Insurance")],
    ["Сбор джекпота", metric(club, "Jackpot Fee") + metric(club, "Jackpot Fee 21") + metric(club, "Jackpot Fee Mtt")],
    ["Выплаты джекпота", metric(club, "Jackpot Payout") + metric(club, "Jackpot Payout 21") + metric(club, "Jackpot Payout Mtt")],
    ["Profits", metric(club, "Profits")],
  ];
  summary.getRange("B9").formulas = [["=SUM(B6:B8)"]];
  summary.getRange("A4:B4").format = { fill: "#059669", font: { color: "#FFFFFF", bold: true } };
  summary.getRange("A5:B13").format.borders = { preset: "inside", style: "thin", color: "#D1D5DB" };
  summary.getRange("B5:B13").format.numberFormat = moneyFormat;
  summary.getRange("A15:B17").values = [
    ["Активность", "Количество"],
    ["Игроков в таблице", club.rows.length],
    ["Раздач", club.rows.reduce((sum, row) => sum + Number(row[61] || 0), 0)],
  ];
  summary.getRange("A15:B15").format = { fill: "#2563EB", font: { color: "#FFFFFF", bold: true } };
  summary.getRange("B16:B17").format.numberFormat = "#,##0";
  summary.getRange("A:B").format.columnWidth = 24;

  const compactHeaders = ["Player ID", "NickName", "Agent Name", "Agent ID", "Выигрыш", "Cash", "MTT", "SNG", "Весь рейк", "Страховка", "Сбор джекпота", "Выплата джекпота", "Раздачи"];
  const compactRows = club.rows.map((row) => [row[2], row[4], row[6], row[7], row[9], row[30], row[44], row[49], null, row[53], row[59], row[60], row[61]]);
  players.getRangeByIndexes(0, 0, 1, compactHeaders.length).values = [compactHeaders];
  if (compactRows.length) {
    players.getRangeByIndexes(1, 0, compactRows.length, compactHeaders.length).values = compactRows;
    players.getRange("I2").formulas = [["=SUM(F2:H2)"]];
    players.getRange(`I2:I${compactRows.length + 1}`).fillDown();
    players.getRange(`E2:L${compactRows.length + 1}`).format.numberFormat = moneyFormat;
    players.getRange(`M2:M${compactRows.length + 1}`).format.numberFormat = "#,##0";
  }
  players.getRange(`A1:M${compactRows.length + 1}`).format.borders = { preset: "inside", style: "thin", color: "#E5E7EB" };
  players.getRange("A1:M1").format = { fill: "#059669", font: { color: "#FFFFFF", bold: true }, wrapText: true };
  players.freezePanes.freezeRows(1);
  players.getRange("A:M").format.columnWidth = 14;
  players.getRange("B:B").format.columnWidth = 22;
  players.getRange("C:C").format.columnWidth = 20;

  full.getRangeByIndexes(0, 0, 1, payload.headers.length).values = [payload.headers];
  if (club.rows.length) full.getRangeByIndexes(1, 0, club.rows.length, payload.headers.length).values = club.rows;
  full.getRange(`A1:${colName(payload.headers.length - 1)}1`).format = { fill: "#374151", font: { color: "#FFFFFF", bold: true }, wrapText: true };
  full.freezePanes.freezeRows(1);
  full.getUsedRange().format.columnWidth = 14;

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(path.join(outputDir, `${safeName(club.name)}_${club.id}_${payload.startDate}_${payload.endDate}.xlsx`));
  console.log(`${club.name} (${club.id}): ${club.rows.length}`);
}
