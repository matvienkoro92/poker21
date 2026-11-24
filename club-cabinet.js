(() => {
  const byId = id => document.getElementById(id);
  const desk = document.querySelector('.club-desk');
  if (!desk) return;
  let data;
  function renderSchedule() {
    const all = byId('desk-period').value === 'all';
    const files = all ? ['schedule-overview-v2-3.jpg', 'schedule-overview-v2-2.jpg'] : ['schedule-2026-09-13.jpg'];
    byId('desk-rows').replaceChildren(...files.map((file, index) => {
      const link = document.createElement('a');
      link.href = './assets/schedule/' + file;
      link.target = '_blank';
      link.rel = 'noopener';
      const image = document.createElement('img');
      image.src = link.href;
      image.loading = 'lazy';
      image.alt = all ? 'Общее расписание · афиша ' + (index + 1) : 'Афиша из расписания на сегодня';
      link.append(image);
      return link;
    }));
  }
  function renderGallery() {
    const day = byId('desk-day').value;
    const format = byId('desk-format').value;
    const label = byId('desk-day').selectedOptions[0].text;
    const files = data.banners[format][day] || [];
    byId('desk-gallery').replaceChildren(...files.map((file, index) => {
      const link = document.createElement('a');
      link.href = './assets/schedule/banners/' + file;
      link.target = '_blank';
      link.rel = 'noopener';
      const image = document.createElement('img');
      image.alt = label + ' · баннер ' + (index + 1);
      image.loading = 'lazy';
      image.src = link.href;
      link.append(image);
      return link;
    }));
  }
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
      const lines = evening?.text.split('\n') || [];
      const main = lines.find(line => /18[:.]00/.test(line));
      byId('desk-event').textContent = main?.replace(/^.*?18[:.]00\s*(?:МСК)?\s*[·—-]?\s*/i, '') || 'Турнир вечера';
      byId('desk-details').textContent = main ? ['18:00 МСК', ...lines.slice(lines.indexOf(main) + 1)].join(' · ') : 'На сегодня вечерний турнир не указан.';
      const art = data.banners.square[data.day]?.[0];
      if (art && main) { byId('desk-art').src = './assets/schedule/banners/' + art; byId('desk-art').hidden = false; }

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
  desk.querySelector('[data-desk-open]').onclick = () => {
    byId('desk-schedule').open = true;
    byId('desk-schedule').scrollIntoView({block:'start'});
  };
  load();
})();
