(() => {
  const panel=document.getElementById('desk-team'), box=panel.querySelector('section'), status=panel.querySelector('[role=status]');
  let active='', data, busy=false;
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  function field(name,label,choices){
    const wrap=node('label',label),el=document.createElement(choices?'select':name==='details'?'textarea':'input');
    el.name=name;el.required=true;
    if(choices)for(const c of choices)el.add(new Option(c.name+' · '+c.clubId,c.clubId));
    if(name==='target'){el.inputMode='numeric';el.pattern='[1-9][0-9]{0,15}';}
    if(name==='amount'){el.type='number';el.min=1;el.step=1;}
    if(name==='details')el.maxLength=500;
    wrap.append(el);return wrap;
  }
  function form(title,action,fields,submit,extra={}){
    const f=document.createElement('form');f.append(node('h3',title),...fields,node('button',submit));box.append(f);
    f.onsubmit=e=>{e.preventDefault();work({action,...extra,...Object.fromEntries(new FormData(f))});};
  }
  function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
  async function api(body){
    const res=await fetch('./api/club-team',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData||''},body:JSON.stringify(body)});
    const value=await res.json();if(!res.ok)throw Error(value.error||'Не удалось загрузить кабинет.');return value;
  }
  function showDashboard(d) {
    const fmt = n => n == null ? '—' : Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
    function section(title, parent=box) {
      const el=document.createElement('details');el.append(node('summary',title));parent.append(el);return el;
    }
    box.append(node('h3',d.name+' · ID '+d.clubId));
    const finance=section('Баланс и последние операции');
    finance.open=true;
    if(d.balanceError)finance.append(node('p','Баланс временно недоступен.'));
    else if(!d.accounts.length)finance.append(node('p','У клуба нет привязанной группы с балансом.'));
    d.accounts.forEach((account,index)=>{
      if(d.accounts.length>1)finance.append(node('h4','Счёт '+(index+1)));
      const money = (rub,usd) => [rub==null?null:fmt(rub/100)+' ₽',usd==null?null:fmt(usd/100)+' $'].filter(Boolean).join(' · ') || 'Пока не задан';
      finance.append(node('p','Текущий баланс · '+money(account.rub,account.usd)),node('p','Баланс реквизитов · '+money(account.paymentRub,account.paymentUsd)));
      const ops=section('Последние операции',finance);
      for(const text of account.operations)ops.append(node('p',text));
      if(!account.operations.length)ops.append(node('p','Операций пока нет.'));
    });
    const pulse=section('Пульс клуба');
    pulse.append(node('p',d.period.join(' — ')));
    for(const [label,value] of Object.entries(d.metrics))pulse.append(node('p',label+' · '+fmt(value)));
    const players=section('Игроки · '+d.players.length,pulse);
    if(d.players.length) {
      const search=node('input','');
      search.type='search';
      search.placeholder='Ник или ID игрока';
      search.setAttribute('aria-label','Поиск по нику или ID игрока');
      const order=document.createElement('select');
      order.setAttribute('aria-label','Сортировка игроков');
      for(const [value,label] of [['rake','По рейку'],['plus','По результату: от большего'],['minus','По результату: от меньшего']]){
        order.add(new Option(label,value));
      }
      const list=node('div',''),count=node('small','');
      count.setAttribute('role','status');
      const pageSize=15;
      let page=0;
      const prev=button('Назад',()=>{page--;draw();});
      const next=button('Далее',()=>{page++;draw();});
      const paging=node('div','');
      paging.className='desk-player-pages';
      paging.append(prev,next);
      players.append(search,order,count,list,paging);
      function draw() {
        const query=search.value.trim().toLocaleLowerCase('ru');
        const rows=d.players.filter(p=>String(p.nick||'').toLocaleLowerCase('ru').includes(query)||String(p.id).includes(query));
        if(order.value!=='rake') rows.sort((a,b)=>order.value==='plus'?b.winnings-a.winnings:a.winnings-b.winnings);
        page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));
        const start=page*pageSize;
        count.textContent=rows.length ? (start+1)+'–'+Math.min(start+pageSize,rows.length)+' из '+rows.length : 'Игроков по этому запросу нет';
        list.replaceChildren(...rows.slice(start,start+pageSize).map(p=>{
          const row=node('article','');
          row.append(node('strong',p.nick+' · '+p.id),node('p','Рейк '+fmt(p.rake)+' ₽ · результат '+fmt(p.winnings)+' ₽'));
          return row;
        }));
        paging.hidden=rows.length<=pageSize;
        prev.disabled=page===0;
        next.disabled=start+pageSize>=rows.length;
      }
      search.oninput=order.onchange=()=>{page=0;draw();};
      draw();
    } else players.append(node('p','В отчёте за этот период нет игроков.'));
    if(d.activityPeriod)pulse.append(node('p','Активность за неделю по '+d.activityPeriod));
    if(d.conclusion)pulse.append(node('p',d.conclusion));
    for(const [label,rows] of Object.entries(d.groups)){
      const group=section(label+' · '+rows.length,pulse);
      for(const p of rows)group.append(node('p',p.nick+' · '+p.id+' · '+p.detail+(p.action?' · '+p.action:'')));
    }
    const reports=section('Отчёты клуба · '+d.reports.length);
    if(!d.reports.length)reports.append(node('p','Сохранённых отчётов пока нет.'));
    for(const r of d.reports){
      const row=node('article',r.start+' — '+r.end);
      for(const [label,url] of [['Отчёт',r.image],['Excel',r.excel]]){
        if(!url || !url.startsWith('/assets/reports/'))continue;
        const a=node('a',label+' ↗');a.href=url;a.target='_blank';a.rel='noopener';row.append(' · ',a);
      }
      reports.append(row);
    }
  }
  async function render(key){
    box.replaceChildren();
    const clubs=data.memberships;
    if(!clubs.some(c=>c.clubId===active))active=clubs[0]?.clubId||'';
    if(key){const wrap=field('issued','Ключ на 24 часа. Передайте его лично получателю.');const el=wrap.lastChild;el.value=key;el.readOnly=true;el.onclick=()=>el.select();box.append(wrap);}
    if(clubs.length){
      const choice=field('active','Кабинет клуба',clubs);choice.lastChild.value=active;
      choice.lastChild.onchange=e=>{active=e.target.value;work({action:'status'});};box.append(choice);
      const c=clubs.find(c=>c.clubId===active);
      box.append(node('p',c.role==='owner'?'Вы владелец клуба':'Вы сотрудник клуба'));
      if(c.role==='owner'){
        try { showDashboard(await api({action:'dashboard',clubId:active})); }
        catch {box.append(node('p','Сводка клуба временно недоступна.'));}
      }
      form('Разместить реквизиты','place',[field('amount','Сумма, ₽'),field('details','Реквизиты получателя')],'Разместить',{clubId:active});
      box.append(node('h3','Заявки клуба'));
      const {items}=await api({action:'list',clubId:active});
      if(!items.length)box.append(node('p','Пока нет заявок.'));
      for(const x of items){
        const row=node('article',x.amount.toLocaleString('ru-RU')+' ₽');
        if(x.mine||x.taker)row.append(node('p',x.details),node('small',x.taker?'Взята':'Ваша заявка'));
        else row.append(button('Взять реквизиты',()=>work({action:'take',item:x.id,clubId:active})));
        box.append(row);
      }
      if(c.role==='owner'){
        form('Команда','staff',[field('target','Telegram ID сотрудника')],'Создать приглашение',{clubId:active});
        for(const id of [...new Set([...c.staff,...c.pending])]){
          const row=node('p',id+' · '+(c.staff.includes(id)?'подключён':'ожидает')+' ');
          row.append(button('Отозвать',()=>work({action:'revoke',clubId:active,target:id})));box.append(row);
        }
      }
    }
    if(data.directory)form('Выдать ключ владельцу','owner',[field('clubId','Клуб',data.directory),field('target','Telegram ID владельца')],'Создать ключ');
    form('Вход по приглашению','activate',[field('key','Одноразовый ключ')],'Активировать');
  }
  async function work(body){
    if(busy)return;busy=true;box.inert=true;
    try{
      const result=await api(body);
      data=result.memberships?result:await api({action:'status'});
      await render(result.key);
      status.textContent=body.action==='status'?'':'Готово.';
    }catch(e){status.textContent=e.message;box.append(button('Обновить',()=>work({action:'status'})));}
    finally{busy=false;box.inert=false;}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)work({action:'status'});});
})();
