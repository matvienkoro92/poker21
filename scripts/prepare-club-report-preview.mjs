#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

const [clubDataPath, calculatedReportsPath, sourceExcelDir] = process.argv.slice(2);
if (!clubDataPath || !calculatedReportsPath || !sourceExcelDir) {
  throw new Error("Usage: prepare-club-report-preview.mjs CLUBS.json UNION_CLUB_REPORTS.json EXCEL_DIR");
}

const root = path.resolve(import.meta.dirname, "..");
const preparedPath = path.join(root, "data", "prepared-reports.json");
const prepared = JSON.parse(await fs.readFile(preparedPath, "utf8"));
const source = JSON.parse(await fs.readFile(clubDataPath, "utf8"));
const calculated = JSON.parse(await fs.readFile(calculatedReportsPath, "utf8"));
const periodKey = `${source.startDate}_${source.endDate}`;
const targetExcelDir = path.join(root, "assets", "reports", "clubs", periodKey, "excel");
await fs.mkdir(targetExcelDir, { recursive: true });

const latestMappings = new Map();
for (const report of prepared.reports || []) {
  if (!report.chatId || !report.clubId) continue;
  latestMappings.set(`${report.clubId}:${report.chatId}`, report);
}
const sourceById = new Map((source.clubs || []).map((report) => [String(report.id), report]));
const calculatedById = new Map((calculated.reports || []).map((report) => [String(report.clubId), report]));
const excelNames = await fs.readdir(sourceExcelDir);
const next = [];

for (const mapping of latestMappings.values()) {
  const clubId = String(mapping.clubId);
  const raw = sourceById.get(clubId);
  const report = calculatedById.get(clubId);
  if (!raw || !report) continue;
  const excelName = excelNames.find((name) => name.includes(`_${clubId}_${source.startDate}_${source.endDate}.xlsx`));
  if (!excelName) throw new Error(`Excel report not found for club ${clubId}`);
  await fs.copyFile(path.join(sourceExcelDir, excelName), path.join(targetExcelDir, excelName));
  next.push({
    club: mapping.club,
    clubId,
    chatId: String(mapping.chatId),
    startDate: source.startDate,
    endDate: source.endDate,
    imagePath: report.imagePath,
    excelPath: `/assets/reports/clubs/${periodKey}/excel/${excelName}`,
    metrics: report.metrics,
    total: report.metrics.total,
    currency: "RUB",
  });
}

prepared.reports = (prepared.reports || [])
  .filter((report) => report.startDate !== source.startDate || report.endDate !== source.endDate)
  .concat(next);
await fs.writeFile(preparedPath, `${JSON.stringify(prepared, null, 2)}\n`);
console.log(JSON.stringify({ period: periodKey, prepared: next.length, reports: next.map(({ club, clubId, chatId, total }) => ({ club, clubId, chatId, total })) }, null, 2));
