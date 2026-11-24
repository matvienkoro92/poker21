(() => {
  const byId = id => document.getElementById(id);
  const desk = document.querySelector('.club-desk');
  if (!desk) return;
  const themeButton = byId('desk-theme');
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem('poker21-cabinet-theme'); } catch {}
  function applyTheme() {
    const dark = preference === 'dark' || (preference !== 'light' && systemTheme.matches);
    document.documentElement.dataset.cabinetTheme = dark ? 'dark' : 'light';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.textContent = dark ? '☀' : '☾';
    themeButton.title = dark ? 'Включить светлую тему' : 'Включить тёмную тему';
  }
  themeButton.onclick = () => {
    preference = document.documentElement.dataset.cabinetTheme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('poker21-cabinet-theme', preference); } catch {}
    applyTheme();
  };
  if (systemTheme.addEventListener) systemTheme.addEventListener('change', applyTheme);
  else systemTheme.addListener(applyTheme);
  applyTheme();
  let data;
  const preview = byId('desk-preview');
  const fullImage = preview.querySelector('img');
  preview.querySelector('button').onclick = () => preview.close();
  preview.onclick = event => { if (event.target === preview) preview.close(); };

  function thumbnail(src, alt) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desk-thumbnail';
    const image = document.createElement('img');
    image.src = src;
    image.alt = alt;
    image.loading = 'lazy';
    button.append(image);
    button.onclick = () => {
      fullImage.src = src;
      fullImage.alt = alt;
      preview.showModal();
    };
    return button;
  }
  function renderSchedule() {
    const all = byId('desk-period').value === 'all';
    const files = all ? ['schedule-overview-v2-3.jpg', 'schedule-overview-v2-2.jpg'] : ['schedule-2026-09-13.jpg'];
    byId('desk-rows').replaceChildren(...files.map((file, index) =>
      thumbnail('./assets/schedule/' + file, all ? 'Общее расписание · афиша ' + (index + 1) : 'Афиша из расписания на сегодня')
    ));
  }
  function renderGallery() {
    const day = byId('desk-day').value;
    const format = byId('desk-format').value;
    const label = byId('desk-day').selectedOptions[0].text;
    const files = data.banners[format][day] || [];
    byId('desk-gallery').replaceChildren(...files.map((file, index) =>
      thumbnail('./assets/schedule/banners/' + file, label + ' · баннер ' + (index + 1))
    ));
  }
  function renderEvening(text, art) {
    const lines = text.split('\n') || [];
    const main = lines.find(line => /18[:.]00/.test(line));
    byId('desk-event').textContent = main?.replace(/^.*?18[:.]00\s*(?:МСК)?\s*[·—-]?\s*/i, '') || 'Турнир вечера';
    const facts = main ? ['18:00 МСК', ...lines.slice(lines.indexOf(main) + 1).flatMap(line => line.split(' · '))] : ['На сегодня вечерний турнир не указан.'];
    byId('desk-details').replaceChildren(...facts.map(text => {
      const span = document.createElement('span');
      span.textContent = text.replace(/ (₽|МСК)/g, '\u00a0$1');
      return span;
    }));

    byId('desk-art').hidden = !art || !main;
    if (art && main) { byId('desk-art').src = './assets/schedule/banners/' + art; byId('desk-art').hidden = false; }
    byId('desk-event').classList.toggle('desk-long-title', byId('desk-event').textContent.length > 12);
  }
  // First paint uses the bot's weekly programme; the live response takes precedence.
  const programme = {
  "mon": [
    "Понедельник\n18:00 МСК · MKO\nБай-ин: 500 ₽ · Гарантия: 170 000 ₽",
    "square/monday/monday-1.jpg"
  ],
  "tue": [
    "Вторник\n18:00 МСК · Rebuy\nБай-ин: 300 ₽ · Гарантия: 150 000 ₽",
    "square/tuesday/tuesday-1.jpg"
  ],
  "wed": [
    "Среда\n18:00 МСК · MKO\nБай-ин: 1 000 ₽ · Гарантия: 170 000 ₽",
    "square/wednesday/wednesday-kosar-1.jpg"
  ],
  "thu": [
    "Четверг\n18:00 МСК · MKO\nБай-ин: 300 ₽ · Гарантия: 100 000 ₽",
    "square/thursday/thursday-1-info.jpg"
  ],
  "fri": [
    "Пятница\n18:00 МСК · PKO\nБай-ин: 500 ₽ · Гарантия: 150 000 ₽",
    "square/friday/friday-knockout-ram.jpg"
  ],
  "sat": [
    "Суббота\n18:00 МСК · PKO\nБай-ин: 5 000 ₽ · Гарантия: 250 000 ₽",
    "square/saturday/saturday-fast-track-1.jpg"
  ],
  "sun": [
    "Воскресенье\n18:00 МСК · PKO\nБай-ин: 2 000 ₽ · Гарантия: 300 000 ₽",
    "square/month3000/main-tournament-4.png"
  ]
};
  const day = new Intl.DateTimeFormat('en-US', {weekday:'short',timeZone:'Europe/Moscow'}).format(new Date()).toLowerCase();
  renderEvening(...programme[day]);
  async function load() {
    byId('desk-retry').hidden = true;
    try {
      const response = await fetch('./api/club-cabinet');
      if (!response.ok) throw Error();
      data = await response.json();
      const options = data.days.map(([key, label]) => new Option(label, key));
      byId('desk-day').replaceChildren(...options);
      byId('desk-day').value = data.day;
      const evening = data.rows.find(row => row.category === 'day' && row.today && /18[:.]00/.test(row.text));
      renderEvening(evening?.text, data.banners.square[data.day]?.[0]);
      renderGallery();
      byId('desk-status').textContent = '';
    } catch {
      byId('desk-status').textContent = 'Не удалось загрузить расписание и баннеры.';
      byId('desk-retry').hidden = false;
    }
  }
  byId('desk-period').onchange = renderSchedule;
  renderSchedule();
  byId('desk-day').onchange = byId('desk-format').onchange = () => data && renderGallery();
  byId('desk-retry').onclick = load;
  desk.querySelector('[data-desk-open]').onclick = event => {
    const banners = byId(event.currentTarget.dataset.deskOpen);
    if (data) {
      byId('desk-day').value = data.day;
      renderGallery();
    }
    banners.open = true;
    banners.scrollIntoView({block:'start'});
  };
  load();
})();
