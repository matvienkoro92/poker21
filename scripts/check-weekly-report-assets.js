const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = name => JSON.parse(fs.readFileSync(path.join(root, 'data', name), 'utf8'));
const jackpot = read('union-jackpot-summary.json');
const period = `${jackpot.startDate}_${jackpot.endDate}`;
const required = [`assets/reports/share/${period}.png`, `assets/reports/share/${period}-full.png`];
for (const name of ['prepared-union-reports.json', 'prepared-union-club-reports.json']) {
  const data = read(name);
  if (data.startDate !== jackpot.startDate || data.endDate !== jackpot.endDate) {
    throw new Error(`${name}: report period differs from summary ${period}`);
  }
  for (const report of data.reports) {
    if (report.startDate !== jackpot.startDate || report.endDate !== jackpot.endDate) {
      throw new Error(`${name}: row period differs from summary ${period}`);
    }
    if (!report.imagePath) throw new Error(`${name}: missing imagePath`);
    required.push(report.imagePath.replace(/^\//, ''));
  }
}
const missing = required.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) throw new Error(`Missing weekly report images:\n${missing.join('\n')}`);
console.log(`Weekly report assets verified: ${required.length} images for ${period}.`);
