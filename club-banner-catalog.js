(() => {
const SCHEDULE_BANNER_DAYS = [
  ["mon", "Понедельник"], ["tue", "Вторник"], ["wed", "Среда"], ["thu", "Четверг"],
  ["fri", "Пятница"], ["sat", "Суббота"], ["sun", "Воскресенье"],
  ["leaderboard", "Лидерборд"],
  ["highhand", "Хайхенд джекпот"],
];
const SCHEDULE_BANNERS = {
  square: {
    mon: [...Array.from({ length: 4 }, (_, index) => `square/monday/monday-${index + 1}.jpg`), ...Array.from({ length: 7 }, (_, index) => `square/monday/monday-magic-${index + 1}.png`)],
    tue: Array.from({ length: 5 }, (_, index) => `square/tuesday/tuesday-${index + 1}.jpg`),
    wed: Array.from({ length: 9 }, (_, index) => `square/wednesday/pko-${index + 1}.jpg`),
    thu: Array.from({ length: 6 }, (_, index) => `square/thursday/thursday-${index + 1}-info.jpg`),
    fri: ["ram", "press", "fuel", "saturn", "rocket", "fishing"].map(name => `square/friday/friday-knockout-${name}.jpg`),
    sat: Array.from({ length: 8 }, (_, index) => `square/saturday/saturday-fast-track-${index + 1}.jpg`),
    sun: ["main-tournament-4.png", "main-tournament-5.png", "sunday-magic-hunter.jpg", "sunday-magic-coin.jpg"].map(file => `square/month3000/${file}`),
    leaderboard: Array.from({ length: 4 }, (_, index) => `square/leaderboard/leaderboard-${index + 1}.png`),
    highhand: Array.from({ length: 5 }, (_, index) => `square/highhand/highhand-${index + 1}.png`),
  },
  story: {
    mon: [...Array.from({ length: 4 }, (_, index) => `story/monday/monday-${index + 1}.jpg`), ...Array.from({ length: 7 }, (_, index) => `story/monday/monday-magic-${index + 1}.png`)],
    tue: Array.from({ length: 5 }, (_, index) => `story/tuesday/tuesday-${index + 1}.jpg`),
    wed: Array.from({ length: 9 }, (_, index) => `story/wednesday/pko-${index + 1}.jpg`),
    thu: Array.from({ length: 5 }, (_, index) => `story/thursday/thursday-${index + 1}-info.jpg`),
    fri: ["saturn", "fuel", "fishing", "rocket"].map(name => `story/friday/friday-knockout-${name}.jpg`),
    sat: Array.from({ length: 7 }, (_, index) => `story/saturday/saturday-fast-track-${index + 1}.jpg`),
    sun: ["main-tournament-4.png", "main-tournament-5.png", "sunday-magic-hunter.jpg", "sunday-magic-coin.jpg"].map(file => `story/month3000/${file}`),
    leaderboard: Array.from({ length: 2 }, (_, index) => `story/leaderboard/leaderboard-${index + 1}.png`),
    highhand: Array.from({ length: 5 }, (_, index) => `story/highhand/highhand-${index + 1}.png`),
  },
};

const catalog = { days: SCHEDULE_BANNER_DAYS, banners: SCHEDULE_BANNERS };
if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
else window.poker21BannerCatalog = catalog;
})();
