(() => {
  const panel=document.getElementById('desk-team'), box=panel.querySelector('section'), status=panel.querySelector('[role=status]');
  const selectedGroups=new Map();
  let active='', data, busy=false;
  let refreshVisibleList;
  let expandedRegistry = '';
  const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const clubName=document.querySelector('.desk-brand-club');
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
  const currentBalance=(rub,usd)=>((rub ?? 0)/100).toLocaleString('ru-RU')+' ₽ · '+((usd ?? 0)/100).toLocaleString('ru-RU')+' $';
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
  const rubles=cents=>(cents/100).toLocaleString('ru-RU')+' ₽';
  function placementEditor(container,trigger,clubId,chatId,room){
    const limits=node('div','');
    limits.className='club-metrics';
    for(const [label,value] of [
      ['Доступно к размещению',room.available],['Одна заявка сейчас',room.perRequest],
      ['Баланс реквизитов',room.balance],['Кредитный лимит клуба',room.limit],
      ['Занято активными заявками с комиссией',room.reserved]
    ])limits.append(metric(label,rubles(value)));


    let requestId;
    const dialog=document.createElement('dialog');
    dialog.className='placement-editor';
    const editor=document.createElement('form');
    const close=button('Закрыть',()=>dialog.close());
    const heading=node('h3','Разместить реквизиты');
    heading.id='placement-title';dialog.setAttribute('aria-labelledby',heading.id);
    dialog.append(heading,limits,node('p','Комиссия 1% учтена. Максимум одной заявки — 10 000 ₽.'),editor,close);
    container.append(dialog);
    trigger.onclick=()=>{requestId=crypto.randomUUID();start();dialog.showModal();};
    const raw=field('details','Сообщение с реквизитами');
    raw.lastChild.maxLength=5000;raw.lastChild.rows=6;
    function start(){
      editor.replaceChildren(raw,node('button','Распознать'),button('Заполнить вручную',()=>review({})));
      editor.onsubmit=e=>{e.preventDefault();review(window.pokerDepositParser.parse(raw.lastChild.value));};
    }
    function review(parsed){
      editor.replaceChildren();
      for(const [key,label] of [['amount','Сумма, ₽'],['phone','Телефон'],['bank','Банк'],['recipient','Имя получателя']]){
        const wrap=field(key,label),input=wrap.lastChild;
        if(key==='amount'){input.min='0.01';input.step='0.01';input.max='10000';input.value=parsed.amount?parsed.amount/100:'';}
        else input.value=parsed[key]||'';
        editor.append(wrap);
      }
      const error=node('p',(parsed.warnings||[]).filter(w=>!/игрок|рум|USDT/i.test(w)).join(' '));
      error.setAttribute('role','status');
      const submit=node('button','Разместить');
      editor.append(error,button('Назад',start),submit);
      editor.onsubmit=async e=>{
        e.preventDefault();
        const values=Object.fromEntries(new FormData(editor));
        values.phone=window.pokerDepositParser.normalizePhone(values.phone);
        if(!values.phone){error.textContent='Проверьте телефон получателя.';return;}
        editor.inert=true;close.disabled=true;
        dialog.oncancel=e=>e.preventDefault();
        try{await api({action:'place',clubId,chatId,requestId,...values});}
        catch(err){error.textContent=err.message;return;}
        finally{editor.inert=false;close.disabled=false;dialog.oncancel=null;}
        dialog.close();await work({action:'status'});
      };
    }
  }
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
  function playerDirectory(players,members){
    if(members.length) {
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
      const directory=node('div','');directory.className='player-directory';
      const controls=node('div','');controls.className='player-directory-controls';
      controls.append(search,order);
      directory.append(controls,count,list,paging);players.append(directory);
      const currency=new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB'});
      function draw() {
        const query=search.value.trim().toLocaleLowerCase('ru');
        const rows=members.filter(p=>String(p.nick||'').toLocaleLowerCase('ru').includes(query)||String(p.id).includes(query));
        if(order.value!=='rake') rows.sort((a,b)=>order.value==='plus'?b.winnings-a.winnings:a.winnings-b.winnings);
        page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));
        const start=page*pageSize;
        count.textContent=rows.length ? (start+1)+'–'+Math.min(start+pageSize,rows.length)+' из '+rows.length : 'Игроков по этому запросу нет';
        list.replaceChildren(...rows.slice(start,start+pageSize).map(p=>{
          const row=node('article','');
          row.className='player-directory-row';
          const head=node('header','');head.append(node('strong',p.nick),node('small','ID '+p.id));
          const amounts=node('dl','');
          for(const [label,value] of [['Рейк',p.rake],['Результат',p.winnings]]){
            const cell=node('div',''),amount=node('dd',(label==='Результат'&&value>0?'+':'')+currency.format(value));
            if(label==='Результат')amount.className=value>0?'is-positive':value<0?'is-negative':'';
            cell.append(node('dt',label),amount);amounts.append(cell);
          }
          row.append(head,amounts);
          return row;
        }));
        paging.hidden=rows.length<=pageSize;
        prev.disabled=page===0;
        next.disabled=start+pageSize>=rows.length;
      }
      search.oninput=order.onchange=()=>{page=0;draw();};
      draw();
    } else players.append(node('p','За эту неделю игроков в списке нет.'));
  }
  function showFinance(d,owner) {
    const fmt = n => n == null ? '—' : Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
    finance.replaceChildren();
    if(d.balanceError)finance.append(node('p','Баланс временно недоступен.'));
    else if(!d.accounts.length)finance.append(node('p','У клуба нет привязанной группы с балансом.'));
    d.accounts.forEach((account,index)=>{
      if(d.accounts.length>1)finance.append(node('h4','Счёт '+(index+1)));
      const money = (rub,usd) => [rub==null?null:fmt(rub/100)+' ₽',usd==null?null:fmt(usd/100)+' $'].filter(Boolean).join(' · ') || 'Пока не задан';
      const balances=node('div','');
      balances.className='club-metrics';
      balances.append(metric('Текущий баланс',currentBalance(account.rub,account.usd)),
        metric('Баланс реквизитов',money(account.paymentRub,account.paymentUsd)));
      finance.append(balances);
      if(!owner)return;
      const ops=section('Последние операции',finance);
      for(const text of account.operations||[])ops.append(node('p',text));
      if(!account.operations?.length)ops.append(node('p',account.historyError?'История временно недоступна.':'Операций пока нет.'));
    });
  }
  function showDashboard(d,parent) {
    const fmt=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
    const pulse=node('section','');pulse.className='week-pulse';parent.append(pulse);
    const dates=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const period=d.period.map(value=>new Date(value+'T00:00:00Z'));
    const header=node('header','');
    header.append(node('h2','Пульс клуба'),node('small',typeof dates.formatRange==='function' && period.every(date=>Number.isFinite(+date))?dates.formatRange(...period):d.period.join(' — ')));
    pulse.append(header);
    const rake=node('section','');rake.className='pulse-revenue';
    rake.append(node('h3','Рейк за неделю'),node('strong',fmt(d.rake.total)+' ₽'));
    const bar=node('div','');bar.className='pulse-bar';bar.setAttribute('aria-hidden','true');
    const legend=node('dl','');legend.className='pulse-legend';
    for(const [label,value,color] of [['Кеш',d.rake.cash,'#88dba7'],['МТТ',d.rake.mtt,'#e2bc78'],['СНГ',d.rake.sng,'#b5a2dc']]){
      const segment=node('span','');segment.style.flexGrow=String(Math.max(0,value||0));segment.style.background=color;bar.append(segment);
      const pair=node('div','');pair.style.setProperty('--category-color',color);
      pair.append(node('dt',label),node('dd',fmt(value)+' ₽'));legend.append(pair);
    }
    rake.append(bar,legend);pulse.append(rake);
    const counts=d.activePlayers;
    const active=node('section','');active.className='pulse-activity';
    active.append(node('h3','Активные игроки'),node('strong',fmt(counts.total)));pulse.append(active);
    const categories=node('div','');categories.className='pulse-categories';active.append(categories);
    function category(label,count,container){
      const group=section('',container);
      group.firstChild.append(node('span',label),node('b',fmt(count)));
      return group;
    }
    for(const [label,withRake] of [['С рейком',true],['Без рейка',false]]){
      const members=d.players.filter(p=>p.active && (p.rake>0)===withRake);
      playerDirectory(category(label,withRake?counts.withRake:counts.withoutRake,categories),members);
    }
    if(d.conclusion){
      const insight=node('aside',d.conclusion);insight.className='pulse-insight';
      if(d.activityPeriod && d.activityPeriod!==d.period[1])insight.prepend(node('small','Неделя по '+d.activityPeriod));
      pulse.append(insight);
    }
    const groups=node('section','');groups.append(node('h3','Группы игроков'));
    const tiles=node('div','');tiles.className='pulse-categories';groups.append(tiles);pulse.append(groups);
    for(const [label,rows] of Object.entries(d.groups)){
      const group=category(label,rows.length,tiles);
      if(!rows.length)group.append(node('p','За этот период игроков нет.'));
      for(const p of rows){
        const row=node('article','');row.className='pulse-player';
        row.append(node('strong',p.nick),node('small','ID '+p.id),node('p',p.detail));
        if(p.action)row.append(node('p',p.action));group.append(row);
      }
    }
    playerDirectory(section('Все игроки клуба · '+fmt(d.players.length),pulse),d.players);
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
    refreshVisibleList = null;
    box.replaceChildren();
    document.querySelector('.club-dashboard')?.remove();
    clubName.textContent='';
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
      clubName.textContent=c.name;
      headerBalance.append(node('strong','…'));
      headerBalance.setAttribute('aria-label','Баланс клуба '+c.name);
      dashboard.className='club-dashboard';
      const destination=document.getElementById('players-rake-content');
      if(destination)destination.append(dashboard);
      else panel.after(dashboard);
      if(c.role==='owner')dashboard.textContent='Загружаем статистику…';
      api({action:'balances',clubId:requested}).then(result=>{
        if(!dashboard.isConnected || active!==requested)return;
        const accounts=result.accounts||[];
        const total=k=>accounts.reduce((n,a)=>n+(a[k] ?? 0),0);
        headerBalance.lastChild.textContent=result.balanceError?'Недоступен':accounts.length ? currentBalance(total('rub'),total('usd')) : '—';
        showFinance(result,c.role==='owner');
      }).catch(()=>{
        if(!dashboard.isConnected || active!==requested)return;
        headerBalance.lastChild.textContent='Недоступен';
        finance.textContent='Баланс временно недоступен.';
      });
      if(c.role==='owner')api({action:'dashboard',clubId:requested}).then(result=>{
        if(!dashboard.isConnected||active!==requested)return;
        dashboard.replaceChildren();showDashboard(result,dashboard);
      }).catch(()=>{
        if(dashboard.isConnected&&active===requested)dashboard.textContent='Не удалось загрузить статистику клуба.';
      });
      const requisites=node('div','');box.append(requisites);
      if(clubs.length===1)choice.hidden=true;
      const registry=await api({action:'list',clubId:active,chatId:selectedGroups.get(active)});
      const {groups,chatId}=registry;
      if(groups.length>1){
        const selector=field('group','Группа клуба',groups.map(g=>({clubId:g.id,name:g.name.split(' · ')[0]})));
        const select=selector.lastChild;
        select.prepend(new Option('Выберите группу',''));select.value=chatId||'';
        select.onchange=()=>{selectedGroups.set(active,select.value);work({action:'status'});};
        requisites.append(selector);
      }
      const actions=node('div','');actions.className='requisite-actions';
      actions.setAttribute('role','group');actions.setAttribute('aria-label','Реквизиты');
      const registryKey=JSON.stringify([active,chatId]);
      const list=node('div','');list.hidden=expandedRegistry!==registryKey;list.id='club-requisite-list';
      const take=button('Взять реквизит',()=>{
        list.hidden=!list.hidden;
        expandedRegistry=list.hidden?'':registryKey;
        take.setAttribute('aria-expanded',String(!list.hidden));
        if(!list.hidden)refresh();
      });
      take.setAttribute('aria-expanded',String(!list.hidden));take.setAttribute('aria-controls',list.id);
      const place=button('Разместить',null);place.disabled=!chatId;place.setAttribute('aria-haspopup','dialog');
      actions.append(take,place);requisites.append(actions,list);
      if(chatId)placementEditor(requisites,place,active,chatId,registry.availability);
      else if(!groups.length)requisites.append(node('p','Для размещения реквизитов привяжите группу клуба в боте.'));
      function drawItems(registry){
        const items=registry.items;
        list.replaceChildren();
        const stats={open:{count:0,amount:0},taken:{count:0,amount:0}};
        for(const item of items){const bucket=stats[item.taker?'taken':'open'];bucket.count++;bucket.amount+=item.amount;}
        const summary=node('div','');summary.className='club-metrics';
        for(const [key,label] of [['open','Свободные'],['taken','Взятые']])summary.append(metric(label+' · '+stats[key].count,stats[key].amount.toLocaleString('ru-RU')+' ₽'));
        list.append(summary);
        if(registry.withdrawalError)list.append(node('p','Не удалось загрузить выводы из Депозитов.'),button('Обновить',()=>work({action:'status'})));
        for(const x of items){
          const row=node('article','');row.className='requisite-preview';
          row.append(node('strong',x.amount.toLocaleString('ru-RU')+' ₽'));
          if(x.number)row.append(node('span',x.number));
          if(x.bank)row.append(node('small',x.bank));
          if(x.mine||x.taker){
            const extra=x.number?String(x.details||'').split(/\r?\n/).slice(2).join(' '):x.details;
            if(extra)row.append(node('span',extra));
            row.append(node('small',x.status||(x.taker?'Взята':'Ваша заявка')));
            if(x.canMarkPaid){
              row.append(button('Отметить оплату',()=>work({action:'paid',item:x.id,clubId:active})),
                button('Отменить бронь',()=>work({action:'cancel',item:x.id,clubId:active})));
            }
          }else row.append(button('Взять реквизит',()=>work({action:'take',item:x.id,clubId:active,chatId})));
          list.append(row);
        }
      }
      let loading=false;
      async function refresh(){
        if(loading || busy || document.hidden || !list.getClientRects().length)return;
        loading=true;
        try{
          const latest=await api({action:'list',clubId:requested,chatId});
          if(list.isConnected)drawItems(latest);
        }catch{
          if(list.isConnected){
            list.querySelector('.requisite-refresh-error')?.remove();
            const error=node('p','Не удалось обновить список реквизитов.');
            error.className='requisite-refresh-error';
            error.append(button('Обновить',refresh));
            list.prepend(error);
          }
        }finally{loading=false;}
      }
      drawItems(registry);
      refreshVisibleList=refresh;
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
  const refreshList=()=>refreshVisibleList?.();
  window.setInterval(refreshList,15000);
  window.addEventListener('focus',refreshList);
  document.addEventListener('visibilitychange',refreshList);
  document.getElementById('app').addEventListener('cabinet-view',()=>requestAnimationFrame(refreshList));
  panel.addEventListener('toggle',()=>{openPanel();refreshList();});
  if(window.Telegram?.WebApp?.initData || panel.open)work({action:'status'});
})();
