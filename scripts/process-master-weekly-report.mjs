#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolModule = process.env.ARTIFACT_TOOL_MODULE || path.join(
  os.homedir(),
  ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs"
);
const { FileBlob, SpreadsheetFile } = await import(pathToFileURL(artifactToolModule));

const REPORTS_DIR = process.env.REPORTS_DIR || "/Users/kosmonavt/Downloads/ОТЧЕТЫ";
const MONEY_EPSILON = 0.02;

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function isoDate(value) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number" && value > 1) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  throw new Error(`Не удалось распознать дату: ${value}`);
}

async function newestMasterFile(directory) {
  const files = (await readdir(directory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && /^Poker21Plus-.*\.xlsx$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  if (!files.length) throw new Error(`В папке ${directory} нет главного файла Poker21Plus-*.xlsx`);
  return path.join(directory, files[0]);
}

function propagatedHeaders(groupRow, headerRow) {
  let group = "";
  return headerRow.map((name, index) => {
    if (groupRow[index]) group = String(groupRow[index]).trim();
    return { index, group, name: String(name || "").trim() };
  });
}

function aggregate(rows, columns, group, excludedNames) {
  return columns
    .filter((column) => column.group === group && !excludedNames.has(column.name))
    .map((column) => ({
      name: column.name,
      value: roundMoney(rows.reduce((sum, row) => sum + (Number(row[column.index]) || 0), 0)),
    }))
    .filter((item) => item.name && item.value !== 0);
}

function assertClose(label, actual, expected) {
  if (Math.abs(actual - expected) > MONEY_EPSILON) {
    throw new Error(`${label} не сходится: по строкам ${actual}, в итогах ${expected}`);
  }
}

const requestedFile = process.argv.find((argument) => argument.endsWith(".xlsx"));
const requestedClub = process.argv.find((argument) => argument.startsWith("--club="))?.slice(7);
const inputPath = requestedFile ? path.resolve(requestedFile) : await newestMasterFile(REPORTS_DIR);
const workbook = await SpreadsheetFile.importXlsx(await FileBlob.load(inputPath));

const unionData = workbook.worksheets.getItem("Union Data").getUsedRange(true).values;
const memberData = workbook.worksheets.getItem("Union Member Statistics").getUsedRange(true).values;
const startDate = isoDate(unionData[1][1]);
const endDate = isoDate(unionData[1][3]);
const summaryHeaders = unionData[3].map((header) => String(header || "").trim());
const summaryRows = unionData.slice(4).filter((row) => row[0] && row[1]);
const columns = propagatedHeaders(memberData[3], memberData[4]);

const clubs = summaryRows
  .filter((row) => !requestedClub || [row[0], row[1]].some((value) => String(value).toLowerCase() === requestedClub.toLowerCase()))
  .map((row) => {
    const summary = Object.fromEntries(summaryHeaders.map((header, index) => [header, row[index]]));
    const clubId = String(summary["Club ID"]);
    const memberRows = memberData.slice(5).filter((memberRow) => String(memberRow[0]) === clubId);
    const winnings = aggregate(memberRows, columns, "Winnings", new Set(["Total"]));
    const fees = aggregate(memberRows, columns, "Fee", new Set(["Ring Game Total", "MTT Total", "SNG Total"]));
    const winningsTotal = roundMoney(memberRows.reduce((sum, memberRow) => sum + (Number(memberRow[9]) || 0), 0));
    const feeTotal = roundMoney(
      memberRows.reduce((sum, memberRow) => sum + (Number(memberRow[30]) || 0) + (Number(memberRow[44]) || 0) + (Number(memberRow[49]) || 0), 0)
    );
    assertClose(`${summary["Club Name"]}: выигрыш`, winningsTotal, roundMoney(summary.Winnings));
    assertClose(`${summary["Club Name"]}: комиссия`, feeTotal, roundMoney(summary["Total Fee"]));
    return {
      club: summary["Club Name"],
      clubId,
      startDate,
      endDate,
      metrics: {
        winnings: roundMoney(summary.Winnings),
        commission: roundMoney(summary["Total Fee"]),
        ringGameFee: roundMoney(summary["Ring Game Fee"]),
        mttFee: roundMoney(summary["MTT Fee"]),
        sngFee: roundMoney(summary["SNG Fee"]),
        insurance: roundMoney(summary.Insurance),
      },
      gameBreakdown: { winnings, fees },
      verification: { memberRows: memberRows.length, totalsMatch: true },
    };
  });

if (requestedClub && !clubs.length) throw new Error(`Клуб ${requestedClub} не найден в главном файле`);
process.stdout.write(`${JSON.stringify({ source: inputPath, startDate, endDate, clubs }, null, 2)}\n`);
