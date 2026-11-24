(() => {
  const byId = id => document.getElementById(id);
  const desk = document.querySelector('.club-desk');
  if (!desk) return;
  const catalog = window.poker21BannerCatalog;
  const preview = byId('desk-preview');
  const fullImage = preview.querySelector('img');
  preview.querySelector('button').onclick = () => preview.close();
  preview.onclick = event => { if (event.target === preview) preview.close(); };

  function thumbnail(src, alt, miniature = src) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'desk-thumbnail';
    const image = document.createElement('img');
    if (miniature !== src) image.addEventListener('error', () => { image.src = src; }, {once:true});
    image.src = miniature;
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
    const files = ['schedule-overview-v2-3.jpg', 'schedule-overview-v2-2.jpg'];
    byId('desk-rows').replaceChildren(...files.map((file, index) =>
      thumbnail('./assets/schedule/' + file, 'Расписание турниров · афиша ' + (index + 1), './assets/banner-previews/' + file + '.webp')
    ));
  }
  function renderGallery() {
    const day = byId('desk-day').value;
    const format = byId('desk-format').querySelector('[aria-pressed=true]').dataset.format;
    const label = byId('desk-day').selectedOptions[0].text;
    const files = catalog.banners[format][day] || [];
    byId('desk-gallery').replaceChildren(...files.map((file, index) =>
      thumbnail('./assets/schedule/banners/' + file, label + ' · баннер ' + (index + 1), './assets/banner-previews/' + file + '.webp')
    ));
  }
  function renderEvening(text, art) {
    const lines = (text || '').split('\n');
    const main = lines.find(line => /18[:.]00/.test(line));
    byId('desk-event').textContent = main?.replace(/^.*?18[:.]00\s*(?:МСК)?\s*[·—-]?\s*/i, '') || 'Турнир вечера';
    const facts = main ? ['18:00 МСК', ...lines.slice(lines.indexOf(main) + 1).flatMap(line => line.split(' · '))] : ['На сегодня вечерний турнир не указан.'];
    byId('desk-details').replaceChildren(...facts.map(text => {
      const span = document.createElement('span');
      span.textContent = text.replace(/ (₽|МСК)/g, '\u00a0$1');
      return span;
    }));

    byId('desk-art').hidden = !art || !main;
    if (art && main) {
      const image = byId('desk-art');
      const miniature = './assets/banner-previews/' + art + '.webp';
      if (image.getAttribute('src') !== miniature) {
        image.onerror = () => {
          image.onerror = null;
          image.src = './assets/schedule/banners/' + art;
        };
        image.fetchPriority = 'high';
        image.src = miniature;
      }
    }
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
      const data = await response.json();
      const evening = data.rows.find(row => row.category === 'day' && row.today && /18[:.]00/.test(row.text));
      renderEvening(evening?.text, data.banners.square[data.day]?.[0]);
      byId('desk-status').textContent = '';
    } catch {
      byId('desk-status').textContent = 'Не удалось обновить расписание.';
      byId('desk-retry').hidden = false;
    }
  }
  byId('desk-day').replaceChildren(...catalog.days.map(([key,label]) => new Option(label,key)));
  byId('desk-day').value = day;
  renderGallery();
  renderSchedule();
  byId('desk-day').onchange = renderGallery;
  const formats = byId('desk-format').querySelectorAll('button');
  formats.forEach(button => {
    button.onclick = () => {
      if (button.getAttribute('aria-pressed') === 'true') return;
      formats.forEach(option => option.setAttribute('aria-pressed', String(option === button)));
      renderGallery();
    };
  });
  byId('desk-retry').onclick = load;
  desk.querySelector('[data-desk-open]').onclick = event => {
    const banners = byId(event.currentTarget.dataset.deskOpen);
    byId('desk-day').value = day;
    renderGallery();
    banners.scrollIntoView({block:'start'});
  };
  load();
})();
