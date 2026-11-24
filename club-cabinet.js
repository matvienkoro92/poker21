(() => {
  const byId = id => document.getElementById(id);
  const desk = document.querySelector('.club-desk');
  if (!desk) return;
  let data;
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function renderSchedule() {
    const rows = data.rows.filter(row => byId('desk-period').value === 'all' || row.today);
    byId('desk-rows').replaceChildren(...rows.map(row => element('p', row.text)));
    if (!rows.length) byId('desk-rows').textContent = 'На этот период турниры не указаны.';
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
      renderSchedule();
      renderGallery();
      byId('desk-status').textContent = '';
    } catch {
      byId('desk-status').textContent = 'Не удалось загрузить расписание и баннеры.';
      byId('desk-retry').hidden = false;
    }
  }
  byId('desk-period').onchange = () => data && renderSchedule();
  byId('desk-day').onchange = byId('desk-format').onchange = () => data && renderGallery();
  byId('desk-retry').onclick = load;
  desk.querySelector('[data-desk-open]').onclick = () => {
    byId('desk-schedule').open = true;
    byId('desk-schedule').scrollIntoView({block:'start'});
  };
  load();
})();
