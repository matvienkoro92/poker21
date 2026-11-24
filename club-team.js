(() => {
  const panel=document.getElementById('desk-team'), box=panel.querySelector('section'), status=panel.querySelector('[role=status]');
  let active='', data, busy=false;
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const headerBalance=node('button','');headerBalance.type='button';headerBalance.hidden=true;headerBalance.className='club-header-balance';
  document.querySelector('.desk-brand').append(headerBalance);
  const finance=node('section','');
  finance.id='club-finance';finance.hidden=true;
  headerBalance.closest('header').after(finance);
  headerBalance.setAttribute('aria-controls',finance.id);
  headerBalance.onclick=()=>{
    finance.hidden=!finance.hidden;
    headerBalance.setAttribute('aria-expanded',String(!finance.hidden));
  };
  const issuer=section('Создать ключ',panel.parentElement);
  issuer.classList.add('club-issuer');issuer.hidden=true;
  const issuerBody=node('div','');issuer.append(issuerBody);
  const issuerStatus=node('p','');issuerStatus.setAttribute('role','status');issuer.append(issuerStatus);
  const money=(rub,usd)=>[rub==null?null:(rub/100).toLocaleString('ru-RU')+' ₽',usd==null?null:(usd/100).toLocaleString('ru-RU')+' $'].filter(Boolean).join(' · ')||'—';
  function issuerControls(directory,selected){
    issuerBody.replaceChildren();
    const club=field('clubId','Клуб',directory),select=club.lastChild;
    select.value=selected||directory[0]?.clubId;
    const roles=[{name:'Менеджер',clubId:'staff'},{name:'Владелец',clubId:'owner'}];
    const kind=field('kind','Роль',roles);
    for(const opt of kind.lastChild.options)opt.textContent=roles.find(r=>r.clubId===opt.value).name;
    form('Доступ к клубу','issue',[club,kind,field('target','Логин в Telegram')],'Создать ключ',{},issuerBody);
    const roster=node('div','');issuerBody.append(roster);
    function draw(){
      const members=directory.find(c=>c.clubId===select.value)?.members||[];
      roster.replaceChildren(node('h4','Привязанные администраторы · '+members.length));
      for(const m of members){
        const row=node('p',m.label+' · '+(m.role==='owner'?'Владелец':'Менеджер')+' ');
        row.append(button('Отозвать доступ',()=>work({action:'revoke',clubId:select.value,target:m.id})));roster.append(row);
      }
    }
    select.onchange=draw;draw();
  }
  function field(name,label,choices){
    const wrap=node('label',label),el=document.createElement(choices?'select':name==='details'?'textarea':'input');
    el.name=name;el.required=true;
    if(choices)for(const c of choices)el.add(new Option(c.name+' · '+c.clubId,c.clubId));
    if(name==='target'){
      el.placeholder='@username';
      el.autocapitalize='none';
      el.spellcheck=false;
    }
    if(name==='amount'){el.type='number';el.min=1;el.step=1;}
    if(name==='details')el.maxLength=500;
    wrap.append(el);return wrap;
  }
  function form(title,action,fields,submit,extra={},container=box){
    const f=document.createElement('form');f.dataset.action=action;f.append(node('h3',title),...fields,node('button',submit));container.append(f);
    f.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(f));work({action:action==='issue'?values.kind:action,...extra,...values});};
  }
  function button(label,fn){const b=node('button',label);b.type='button';b.onclick=fn;return b;}
  async function api(body){
    const res=await fetch('./api/club-team',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData||''},body:JSON.stringify(body)});
    const value=await res.json();if(!res.ok)throw Error(value.error||'Не удалось загрузить кабинет.');return value;
  }
  function section(title,container){
    const el=document.createElement('details');
    el.className='club-fold';
    el.append(node('summary',title));
    container.append(el);
    return el;
  }
  function metric(label,value){
    const tile=node('div','');
    tile.append(node('small',label),node('strong',value));
    return tile;
  }
  function showDashboard(d, parent, owner) {
    const fmt = n => n == null ? '—' : Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
    finance.replaceChildren();
    if(d.balanceError)finance.append(node('p','Баланс временно недоступен.'));
    else if(!d.accounts.length)finance.append(node('p','У клуба нет привязанной группы с балансом.'));
    d.accounts.forEach((account,index)=>{
      if(d.accounts.length>1)finance.append(node('h4','Счёт '+(index+1)));
      const money = (rub,usd) => [rub==null?null:fmt(rub/100)+' ₽',usd==null?null:fmt(usd/100)+' $'].filter(Boolean).join(' · ') || 'Пока не задан';
      const balances=node('div','');
      balances.className='club-metrics';
      balances.append(metric('Текущий баланс',money(account.rub,account.usd)),
        metric('Баланс реквизитов',money(account.paymentRub,account.paymentUsd)));
      finance.append(balances);
      if(!owner)return;
      const ops=section('Последние операции',finance);
      for(const text of account.operations)ops.append(node('p',text));
      if(!account.operations.length)ops.append(node('p','Операций пока нет.'));
    });
    if(!owner)return;
    const pulse=section('Пульс клуба',parent);
    pulse.append(node('p',d.period.join(' — ')));
    const metrics=node('div','');metrics.className='club-metrics';
    for(const [label,value] of Object.entries(d.metrics))metrics.append(metric(label,fmt(value)));
    pulse.append(metrics);
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
    const reports=section('Отчёты клуба · '+d.reports.length,parent);
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
  async function render(key, request){
    box.replaceChildren();
    headerBalance.replaceChildren();
    issuer.hidden=!data.directory;
    if(data.directory)issuerControls(data.directory,request.clubId);
    const clubs=data.memberships;
    headerBalance.hidden=!clubs.length;
    finance.hidden=true;finance.textContent='Загружаем баланс…';
    headerBalance.setAttribute('aria-expanded','false');
    panel.classList.toggle('club-connected',!!clubs.length);
    if(clubs.length)panel.open=true;
    if(!clubs.some(c=>c.clubId===active))active=clubs[0]?.clubId||'';
    if(key){
      const club=[...(data.directory||[]),...clubs].find(c=>c.clubId===request.clubId);
      const card=node('article','');
      card.className='issued-invite';
      const target=String(request.target).trim().replace(/^@/,'');
      const recipient=/^\d+$/.test(target)?target:'@'+target;
      const keyField=node('input','');
      keyField.value=key;
      keyField.readOnly=true;
      keyField.setAttribute('aria-label','Одноразовый ключ');
      keyField.onclick=()=>keyField.select();
      const copy=button('Скопировать ключ',async()=>{
        try{
          await navigator.clipboard.writeText(key);
          copy.textContent='Ключ скопирован';
        }catch{
          keyField.focus();
          keyField.select();
          copy.textContent='Скопируйте выделенный ключ';
        }
      });
      card.append(node('h3','Приглашение готово'),node('p',(club?.name||request.clubId)+' · '+recipient),
        keyField,copy,node('small','Отправьте ключ получателю в личном чате. Он действует 24 часа.'));
      issuerBody.prepend(card);issuer.open=true;
    }
    if(clubs.length){
      const choice=field('active','Кабинет клуба',clubs);choice.lastChild.value=active;
      choice.lastChild.onchange=e=>{active=e.target.value;work({action:'status'});};box.append(choice);
      const c=clubs.find(c=>c.clubId===active);
      const role=node('small',c.role==='owner'?'Владелец клуба':'Сотрудник клуба');role.className='club-role';choice.append(role);
      const dashboard=node('div','');
      const requested=active;
      headerBalance.append(node('small',c.name),node('strong','…'));
      headerBalance.setAttribute('aria-label','Баланс клуба '+c.name);
      box.append(dashboard);
      api({action:c.role==='owner'?'dashboard':'balances',clubId:requested}).then(result=>{
        if(!dashboard.isConnected || active!==requested)return;
        const accounts=result.accounts||[];
        const total=k=>accounts.some(a=>a[k]!=null)?accounts.reduce((n,a)=>n+(a[k]||0),0):null;
        headerBalance.lastChild.textContent=result.balanceError?'Недоступен':money(total('rub'),total('usd'));
        showDashboard(result,dashboard,c.role==='owner');
      }).catch(()=>{
        if(!dashboard.isConnected || active!==requested)return;
        headerBalance.lastChild.textContent='Недоступен';
        finance.textContent='Баланс временно недоступен.';
      });
      const people=section('Администраторы · '+c.members.length,box);
      for(const m of c.members)people.append(node('p',m.label+' · '+(m.role==='owner'?'Владелец':'Менеджер')));
      const requisites=section('Реквизиты',box);
      requisites.open=true;
      dashboard.before(requisites);
      if(clubs.length===1)choice.hidden=true;
      form('Разместить реквизиты','place',[field('amount','Сумма, ₽'),field('details','Реквизиты получателя')],'Разместить',{clubId:active},requisites);

      const {items,stats}=await api({action:'list',clubId:active});
      const requests=section('Заявки клуба · '+items.length,requisites);
      const summary=node('div','');summary.className='club-metrics';
      for(const [key,label] of [['open','Свободные'],['taken','Взятые']])summary.append(metric(label+' · '+stats[key].count,stats[key].amount.toLocaleString('ru-RU')+' ₽'));
      requisites.querySelector('summary').after(summary);
      if(!items.length)requests.append(node('p','Пока нет заявок.'));
      for(const x of items){
        const row=node('article',x.amount.toLocaleString('ru-RU')+' ₽');
        if(x.mine||x.taker)row.append(node('p',x.details),node('small',x.taker?'Взята':'Ваша заявка'));
        else row.append(button('Взять реквизиты',()=>work({action:'take',item:x.id,clubId:active})));
        requests.append(row);
      }
    }
    if(clubs.length)return;
    const entry=box;
    form('Вход по приглашению','activate',[field('key','Одноразовый ключ')],'Активировать',{},entry);
    const ownId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if(ownId)entry.append(node('p','Ваш Telegram ID · '+ownId));
  }
  async function work(body){
    if(busy)return;busy=true;box.inert=true;
    status.textContent=body.action==='status'?'Загружаем кабинет…':'Выполняем…';
    const issuing=['owner','staff','revoke'].includes(body.action);
    if(issuing){issuerBody.inert=true;issuerStatus.textContent='Выполняем…';}
    try{
      const result=await api(body);
      data=result.memberships?result:await api({action:'status'});
      await render(result.key,body);
      status.textContent=body.action==='status'||result.key?'':'Готово.';
      if(issuing)issuerStatus.textContent=body.action==='revoke'?'Доступ отозван.':'';
    }catch(e){if(issuing)issuerStatus.textContent=e.message;status.textContent=e.message;box.append(button('Обновить',()=>work({action:'status'})));}
    finally{busy=false;box.inert=false;issuerBody.inert=false;}
  }
  function openPanel(){if(panel.open && !data)work({action:'status'});}
  panel.addEventListener('toggle',openPanel);
  if(window.Telegram?.WebApp?.initData || panel.open)work({action:'status'});
})();
