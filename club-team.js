(() => {
  const panel=document.getElementById('desk-team'), box=panel.querySelector('section'), status=panel.querySelector('[role=status]');
  let noticeTimer;
  function showNotice(text){
    clearTimeout(noticeTimer);
    status.textContent=text;
    noticeTimer=setTimeout(()=>{if(status.textContent===text)status.textContent='';},5000);
  }
  const selectedGroups=new Map();
  const receiptFeedback=new Map();
  let active='', data, busy=false;
  let refreshVisibleList, tickVisibleBookings,refreshBalances;
  let expandedRegistry = '';
  let bookedCardToShow;
  const selectedOffer=/^deal_(w_)?([a-zA-Z0-9-]{1,80})$/.exec(window.Telegram?.WebApp?.initDataUnsafe?.start_param||'');
  let widgetOffer=selectedOffer?(selectedOffer[1]?'withdrawal:':'')+selectedOffer[2]:'';
  let historyDeal=widgetOffer.startsWith('history-')?widgetOffer.slice(8):'';
  if(historyDeal)widgetOffer='';
  const ownerBooking=widgetOffer.startsWith('withdrawal:owner-')?widgetOffer.slice('withdrawal:owner-'.length):'';
  let openRequisitesOnLaunch=window.Telegram?.WebApp?.initDataUnsafe?.start_param==='requisites';
  if(historyDeal||widgetOffer||openRequisitesOnLaunch)panel.open=true;
  const node=(tag,text)=>{const el=document.createElement(tag);if(text instanceof Node)el.append(text);else el.textContent=text;return el;};
  const clubName=document.querySelector('.desk-brand-club');
  const clubsIcon=button('♣',openConnectedClubs);
  clubsIcon.className='connected-clubs-icon';clubsIcon.title='Подключённые клубы';
  clubsIcon.setAttribute('aria-label',clubsIcon.title);clubsIcon.setAttribute('aria-haspopup','dialog');
  document.querySelector('.desk-brand-title').after(clubsIcon);
  async function openConnectedClubs(){
    const dialog=node('dialog','');dialog.className='placement-editor connected-clubs-dialog';
    dialog.setAttribute('aria-labelledby','connected-clubs-title');
    const title=node('h3','Подключённые клубы');title.id='connected-clubs-title';
    const close=button('×',()=>dialog.close());close.setAttribute('aria-label','Закрыть');
    const head=node('div','');head.append(title,close);
    const content=node('div','');content.setAttribute('aria-live','polite');
    dialog.append(head,content);clubsIcon.closest('.club-desk').append(dialog);
    dialog.onclose=()=>dialog.remove();dialog.showModal();
    async function load(){
      content.textContent='Загружаем клубы…';
      try{
        const {clubs,activity}=await api({action:'public-club-list'});
        if(!dialog.open)return;
        title.textContent='Подключённые клубы · '+clubs.length;
        const table=node('table','');table.className='connected-clubs-table';
        table.setAttribute('aria-labelledby',title.id);
        const headers=table.createTHead().insertRow();
        for(const label of ['Клуб','Размещено','Взято','Проведено']){
          const heading=node('th',label);heading.scope='col';headers.append(heading);
        }
        const body=table.createTBody();
        const amountFormat=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
        function addActivity(row,count,cents){
          const cell=row.insertCell();
          if(count==null){cell.textContent='—';return;}
          if(count===0&&!cents?.rub&&!cents?.usd)cell.className='connected-clubs-empty';
          cell.append(node('small',amountFormat.format(count)+' шт.'));
          if(cents?.rub||!cents?.usd)cell.append(node('strong',amountFormat.format((cents?.rub||0)/100)+' ₽'));
          if(cents?.usd)cell.append(node('strong',amountFormat.format(cents.usd/100)+' $'));
        }
        for(const [index,name] of clubs.entries()){
          const row=body.insertRow(), club=node('th',name), stats=activity?.[index];
          club.scope='row';row.append(club);
          addActivity(row,stats?.placed,stats?.placedCents);
          addActivity(row,stats?.taken,stats?.takenCents);
          addActivity(row,stats?.completed,stats?.completedCents);
        }
        const viewport=node('div',table);viewport.className='connected-clubs-viewport';
        content.replaceChildren(clubs.length?viewport:node('p','Пока нет подключённых клубов.'));
      }catch{
        content.replaceChildren(node('p','Не удалось загрузить клубы.'),button('Повторить',load));
      }
    }
    await load();
  }
  const copyMiniApp=document.getElementById('clubMiniAppCopy');
  let copyMiniAppTimer;
  if(copyMiniApp)copyMiniApp.addEventListener('click',async()=>{
    const link=data?.miniAppInviteUrl;
    if(!link)return;
    try{
      await navigator.clipboard.writeText(link);
    }catch{
      window.prompt('Скопируйте ссылку на мини-приложение',link);
      return;
    }
    clearTimeout(copyMiniAppTimer);
    copyMiniApp.dataset.copied='true';
    copyMiniApp.setAttribute('aria-label','Ссылка скопирована');
    copyMiniAppTimer=setTimeout(()=>{
      delete copyMiniApp.dataset.copied;
      copyMiniApp.setAttribute('aria-label','Скопировать ссылку на мини-приложение');
    },1800);
  });
  const headerBalance=node('button','');headerBalance.type='button';headerBalance.hidden=true;headerBalance.className='club-header-balance';
  document.querySelector('.desk-brand').append(headerBalance);
  const finance=node('section','');
  finance.id='club-finance';finance.hidden=true;
  headerBalance.closest('header').after(finance);
  headerBalance.setAttribute('aria-controls',finance.id);
  let historyRequest=0;
  headerBalance.onclick=async()=>{
    finance.hidden=!finance.hidden;
    const version=++historyRequest,clubId=active;
    headerBalance.setAttribute('aria-expanded',String(!finance.hidden));
    if(finance.hidden)return;
    finance.textContent='Загружаем историю переводов…';
    try{
      const {rows}=await api({action:'transfer-history',clubId});
      if(version!==historyRequest||active!==clubId||finance.hidden)return;
      finance.replaceChildren(node('h3','История переводов'));
      for(const r of rows){
        const entry=node('article','');entry.className='deal-entry';
        entry.append(node('small',new Date(r.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК'),
          node('strong',r.payer+' → '+r.owner),node('span',money(r.amount,r.currency)));
        if(r.canVoid)entry.append(button('Отменить сделку',()=>openHistoryDeal(r.id),'secondary'));
        finance.append(entry);
      }
      if(!rows.length)finance.append(node('p','Завершённых переводов пока нет.'));
    }catch{if(version===historyRequest&&active===clubId&&!finance.hidden)finance.textContent='Не удалось загрузить историю переводов.';}

  };
  async function openHistoryDeal(id){
    const dialog=node('dialog','');dialog.className='placement-editor';
    dialog.setAttribute('aria-label','Сделка');
    const content=node('div','Загрузка…');
    const close=button('Закрыть',()=>dialog.close(),'secondary');
    dialog.append(content,close);document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
    const date=t=>new Date(t).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК';
    try{
      const d=await api({action:'deal-preview',item:id});
      if(d.voided){content.textContent='Сделка уже отменена.';return;}
      content.replaceChildren(node('h3',money(d.amount,d.currency)+' · '+date(d.at)),node('p',d.sides[0].name+' → '+d.sides[1].name));
      if(!d.revision)return;
      content.append(node('h4','После отмены'));
      for(const side of d.sides){
        content.append(node('strong',side.name+' · '+side.ledger),node('p',money(side.before,d.currency)+' → '+money(side.after,d.currency)),
          node('small','Комиссия в исходной проводке: '+money(side.fee,d.currency)));
        if(side.movedAt)content.append(node('p','Перенос в основной баланс: '+date(side.movedAt)));
        if(side.resetAt)content.append(node('p','Основной баланс установлен в '+money(side.resetValue,d.currency)+' · '+date(side.resetAt)));
      }
      const error=node('p','');error.setAttribute('role','alert');
      const confirm=button('Подтвердить отмену сделки',async()=>{
        confirm.disabled=true;
        try{
          await api({action:'deal-void',item:id,revision:d.revision});
          content.textContent='Сделка отменена. Балансы обновлены.';
          if(!finance.hidden){finance.hidden=true;await headerBalance.onclick();}
          await refreshBalances?.();
        }catch(e){error.textContent=e.message;}
      },'danger');
      content.append(confirm,error);
    }catch(e){content.textContent=e.message;}
  }
  const broadcastPanel=node('section','');
  broadcastPanel.id='club-requisites-broadcast';
  broadcastPanel.hidden=true;
  const broadcastStatus=node('small','');
  broadcastStatus.setAttribute('role','status');
  const broadcastButton=button('Разослать реквизиты клубам',()=>{
    const requestId=crypto.randomUUID();
    confirmDeal('Отправить список свободных реквизитов пользователям с ключом клуба?','Разослать','primary',async()=>{
      broadcastButton.disabled=true;
      broadcastStatus.textContent='Ставим рассылку в очередь…';
      try{
        await api({action:'broadcast-requisites',requestId});
        broadcastStatus.textContent='Рассылка поставлена в очередь.';
      }catch(e){
        broadcastStatus.textContent=e.message;
      }finally{
        broadcastButton.disabled=false;
      }
    });
  });
  broadcastPanel.append(broadcastButton,broadcastStatus);
  document.querySelector('.desk-evening').before(broadcastPanel);
  const requestsPanel=node('section','');
  requestsPanel.id='club-requests';
  requestsPanel.hidden=true;
  document.querySelector('.desk-evening').after(requestsPanel);
  const issuer=section('Создать ключ',panel.parentElement);
  issuer.classList.add('club-issuer','club-key-panel');issuer.hidden=true;
  const issuerBody=node('div','');issuer.append(issuerBody);
  let issuedInvite=null;
  const issuerStatus=node('p','');issuerStatus.setAttribute('role','status');issuer.append(issuerStatus);
  function currentBalance(rub,usd){
    const values=document.createDocumentFragment();
    for(const [cents,symbol] of [[rub,'₽'],[usd,'$']]){
      if(values.childNodes.length)values.append(' · ');
      const amount=node('span',((cents??0)/100).toLocaleString('ru-RU')+' '+symbol);
      amount.className=cents>0?'balance-positive':cents<0?'balance-negative':'balance-zero';
      values.append(amount);
    }
    return values;
  }
  const pendingConfirmations=section('Ждут подтверждения',issuer.parentElement);
  broadcastPanel.after(pendingConfirmations);
  pendingConfirmations.hidden=true;
  pendingConfirmations.classList.add('club-issuer','owner-hub','pending-confirmations');
  const confirmationSummary=pendingConfirmations.querySelector('summary');
  const confirmationContent=node('div','');
  confirmationContent.setAttribute('aria-live','polite');
  const confirmationRefresh=button('Обновить',loadPendingConfirmations);
  pendingConfirmations.append(confirmationContent,confirmationRefresh);
  pendingConfirmations.addEventListener('toggle',()=>{if(pendingConfirmations.open)loadPendingConfirmations();});

  async function loadPendingConfirmations(){
    if(pendingConfirmations.hidden||confirmationRefresh.disabled)return;
    confirmationRefresh.disabled=true;
    confirmationContent.textContent='Загрузка…';
    try{
      const {deals}=await api({action:'pending-club-confirmations'});
      confirmationSummary.textContent='Ждут подтверждения · '+deals.length;
      confirmationContent.replaceChildren();
      if(!deals.length)confirmationContent.append(node('p','Сделок на подтверждении нет.'));
      const money=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
      const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
      for(const deal of deals){
        const row=node('article','');
        const route=node('div','');
        const amount=money.format(deal.amountCents/100)+' '+(deal.currency==='USD'?'$':'₽');
        route.append(node('strong',deal.payer+' → '+deal.recipient),node('strong',amount));
        row.append(route);
        const paid=Date.parse(deal.paidAt);
        if(Number.isFinite(paid)){
          const minutes=Math.max(0,Math.floor((Date.now()-paid)/60000));
          const hours=Math.floor(minutes/60);
          const elapsed=(hours?hours+' ч ':'')+minutes%60+' мин';
          row.append(node('small',date.format(paid)+' МСК · ждёт '+elapsed));
        }
        confirmationContent.append(row);
      }
    }catch(e){
      confirmationContent.textContent=e.message;
    }finally{
      confirmationRefresh.disabled=false;
    }
  }

  const clubList=section('Список клубов',issuer.parentElement);
  issuer.after(clubList);clubList.classList.add('club-issuer','owner-hub');clubList.hidden=true;
  const contents=node('div','');clubList.append(contents);
  const weekly=weeklyPanel(issuer.parentElement);
  clubList.after(weekly);
  weekly.classList.add('club-issuer','owner-hub');
  weekly.hidden=true;
  const manual=section('Провести сделку вручную',issuer.parentElement);
  weekly.after(manual);manual.hidden=true;manual.classList.add('club-issuer');
  const select=node('select',''),preview=node('p',''),feedback=node('p','');
  select.setAttribute('aria-label','Подтверждённая бронь');feedback.setAttribute('role','status');
  let manualCredits=[];
  const post=button('Провести сделку',async()=>{
    const id=select.value;
    if(!id)return;
    post.disabled=true;select.disabled=true;
    try{
      const result=await api({action:'manual-deal-post',reservationId:id});
      feedback.textContent=result.status==='posted'?'Сделка проведена.':result.status==='legacy'?'Есть ручная сделка той же даты, суммы и клубов. Повторная запись заблокирована.':'Эта сделка уже проведена.';
    }catch(e){feedback.textContent=e.message;post.disabled=false;}
    finally{select.disabled=false;}
  });
  select.onchange=()=>{
    const c=manualCredits.find(row=>row.id===select.value);feedback.textContent='';post.disabled=!c;
    const fee=c?Math.round(c.amountCents/100):0;
    preview.textContent=c?'Два туза −'+money(c.amountCents,'RUB')+' · '+c.name+' +'+money(c.amountCents-fee,'RUB')+' · комиссия '+money(fee,'RUB'):'';
  };
  manual.append(select,preview,post,feedback);
  manual.ontoggle=async()=>{
    if(!manual.open)return;
    post.disabled=true;select.replaceChildren(new Option('Выберите подтверждённую бронь',''));preview.textContent='';feedback.textContent='Загрузка…';
    try{
      const {credits}=await api({action:'manual-deal-list'});manualCredits=credits;
      for(const c of credits)select.add(new Option(new Date(c.confirmedAt).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК · '+c.name+' · '+money(c.amountCents,'RUB')+' · '+c.id.slice(-8),c.id));
      feedback.textContent=credits.length?'':'Подтверждённых броней нет.';
    }catch(e){feedback.textContent=e.message;}
  };
  function bookingPauseBadge(){
    const badge=node('strong','⏸ На паузе до 06:00 МСК');
    badge.className='booking-pause-badge';
    return badge;
  }

  function requisitesWarning(){
    const warning=node('p','');
    warning.append(node('strong','Передавайте реквизиты ТОЛЬКО проверенным игрокам.'),
      document.createTextNode(' Если проблемы будут повторяться, нам придётся отключить ваш клуб от сервиса.'));
    return warning;
  }
  function money(value,currency){
    return (value/100).toLocaleString('ru-RU',{minimumFractionDigits:2})+(currency==='USD'?' $':' ₽');
  }
  function amountLine(parent,title,value){
    const line=node('div','');line.className='week-line';line.append(node('span',title),node('strong',value));parent.append(line);
  }
  function renderClubHistory(parent,account){
    const rows=account.operationRows;
    if(!rows){for(const text of account.operations||[])parent.append(node('p',text));return;}
    const grouped=[],used=new Set();
    for(const row of rows){
      if(used.has(row))continue;
      const transfer=['Перенос из баланса реквизитов','Перенос в основной баланс','Перенос в баланс реквизитов','Перенос из основного баланса'].includes(row.comment);
      const pair=transfer&&row.id&&rows.find(r=>r!==row&&!used.has(r)&&r.id===row.id&&r.label!==row.label&&r.rub?.cents===-row.rub?.cents);
      if(pair)used.add(pair);
      const main=pair&&pair.label==='Баланс'?pair:row;
      const changes=[[main.rub,'₽'],[main.usd,'$']].filter(([v])=>v);
      const title=pair?(main.rub.cents<0?'Перенос в реквизиты':'Перенос в баланс'):changes.some(([v])=>v.action==='set')?'Установка баланса':row.label==='Реквизиты'?'Реквизиты':'Основной баланс';
      const line=section('',parent);line.classList.add('club-op');
      const name=node('span',title);
      const date=new Date(row.at);
      if(Number.isFinite(date.getTime()))name.append(node('small',date.toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'})+' МСК'));
      for(const actor of row.dealActors||[]){
        const username=String(actor.username||'').replace(/^@/,'');
        const contact=/^[a-z0-9_]+$/i.test(username)?'@'+username:/^[1-9]\d*$/.test(actor.id)?'Telegram ID '+actor.id:'не указан';
        name.append(node('small',actor.role+' · '+contact));
      }
      const amounts=changes.map(([v,unit])=>(v.action==='adjust'&&v.cents>0?'+':'')+(v.cents/100).toLocaleString('ru-RU')+' '+unit);
      line.firstChild.append(name,node('strong',amounts.join(' · ')||'—'));
      for(const text of [row.actor,row.comment,row.commission])if(text)line.append(node('p',text));
      if(!row.actor&&!row.comment&&!row.commission)line.append(node('p',row.label));
      if(row.dealId&&data.canInspectClubs)line.append(button('Отменить сделку',()=>openHistoryDeal(row.dealId),'secondary'));
      grouped.push(line);
    }
    if(grouped.length>3){
      const more=section('Ещё операции · '+(grouped.length-3),parent);
      more.append(...grouped.slice(3));
    }
  }
  function weeklyPanel(parent){
    const panel=section('Статистика за неделю',parent);
    panel.classList.add('week-panel');
    const nav=node('div',''),label=node('label',''),range=node('strong',''),date=node('input',''),report=node('div','');
    nav.className='week-nav';report.className='week-report';
    const format=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const period=w=>format.formatRange(new Date(w.from),new Date(w.to));
    date.type='date';date.setAttribute('aria-label','Выбрать неделю по московскому времени');
    date.value=new Date(Date.now()+10800000).toISOString().slice(0,10);
    function shift(days){date.stepUp(days);load();}
    const prev=button('‹',()=>shift(-7)),next=button('›',()=>shift(7));
    prev.setAttribute('aria-label','Предыдущая неделя');next.setAttribute('aria-label','Следующая неделя');
    label.append(range,date);nav.append(prev,label,next);panel.append(nav,report);
    let version=0;
    async function load(){
      if(!panel.open||!date.value)return;
      const stamp=++version;report.textContent='Загрузка…';
      try{
        const {weeks}=await api({action:'issued-weeks',date:date.value});
        if(stamp!==version)return;
        report.replaceChildren();
        const [current,previous]=weeks;
        range.textContent=period(current);
        if(!current.rows.length&&!previous.rows.length){
          const empty=node('div','');empty.className='week-empty';
          empty.append(node('strong','Операций пока нет'),node('small','За выбранную и предыдущую недели нет подтверждённых сделок.'));
          report.append(empty);return;
        }
        for(const week of weeks){
          const card=node('article','');card.className='week-card';report.append(card);
          card.append(node('small',week===current?'Выбранная неделя':'Предыдущая неделя'),node('h4',period(week)));
          amountLine(card,'Подтверждено операций',String(week.rows.length));
          for(const [currency,t] of Object.entries(week.totals)){
            amountLine(card,'Списано',money(t.debit,currency));
            amountLine(card,'Зачислено',money(t.credit,currency));
            amountLine(card,'Комиссия',money(t.fee,currency));
            const warning=t.unknown||t.mismatch;
            const check=node('p',warning?'Требуют проверки: '+(t.unknown+t.mismatch)+' · разница '+money(t.debit-t.credit-t.fee,currency):'✓ Сверено · списано = зачислено + комиссия');
            check.className=warning?'week-check warn':'week-check';card.append(check);
          }
          if(week.rows.length){
            const operations=section('Посмотреть операции',card);
            for(const r of week.rows){
              const entry=node('article','');entry.className='deal-entry';
              entry.append(node('small',new Date(r.at).toLocaleString('ru-RU',{timeZone:'Europe/Moscow'})+' МСК'),node('strong',r.payer+' → '+r.owner));
              amountLine(entry,'Сумма',money(r.amount,r.currency));
              if(r.diff==null)entry.append(node('small','Недостаточно данных для сверки'));
              else{
                amountLine(entry,'Дебет / кредит',money(r.debit,r.currency)+' / '+money(r.credit,r.currency));
                amountLine(entry,'Комиссия',money(r.fee,r.currency));
                if(r.diff)amountLine(entry,'Расхождение',money(r.diff,r.currency));
              }
              operations.append(entry);
            }
          }
        }
        const comparison=section('Изменение к предыдущей неделе',report);
        amountLine(comparison,'Операции',String(current.rows.length-previous.rows.length));
        for(const c of new Set(weeks.flatMap(w=>Object.keys(w.totals)))){
          for(const [k,title] of [['debit','Списано'],['credit','Зачислено'],['fee','Комиссия']])
            amountLine(comparison,title,money((current.totals[c]?.[k]||0)-(previous.totals[c]?.[k]||0),c));
        }
      }catch(e){if(stamp===version)report.textContent=e.message;}
    }
    date.onchange=load;panel.ontoggle=load;
    return panel;
  }
  clubList.ontoggle=async()=>{
    if(!clubList.open)return;
    contents.textContent='Загрузка…';
    try{
      const result=await api({action:'issued-clubs'});
      contents.replaceChildren();
      if(!result.clubs.length)contents.append(node('p','Ключи пока не выдавались.'));
      for(const c of result.clubs){
        const row=section('',contents);row.classList.add('owner-club');
        const emblem=node('span',c.name.split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase());
        emblem.className='club-emblem';emblem.setAttribute('aria-hidden','true');
        const identity=node('span','');identity.append(node('strong',c.name),node('small','ID '+c.clubId));
        const total=node('span','');total.className='owner-club-total';
        total.append(node('small','Основной баланс'),node('strong',result.balanceError?'Недоступен':c.balance?currentBalance(c.balance.rub,c.balance.usd):'Нет счёта'));
        if(c.balance&&c.balance.paymentRub!=null)total.append(node('small','Реквизиты'),node('strong',currentBalance(c.balance.paymentRub,c.balance.paymentUsd)));
        row.firstChild.append(emblem,identity,total);
        const balances=node('div','');
        row.append(node('p',c.members.length?'Подключены: '+c.members.join(', '):'Сейчас никто не привязан'));
        if(c.invites.length)row.append(node('p','Ключ выдан: '+c.invites.join(', ')));
        const creditForm=node('form',''),creditField=field('credit','Кредитный лимит клуба, ₽'),creditInput=creditField.lastChild;
        const feedback=node('small','');feedback.setAttribute('role','status');
        creditInput.value=c.creditCents==null?'':c.creditCents/100;
        if(c.creditCents==null)feedback.textContent='Сейчас действуют лимиты групп. Укажите общий лимит клуба.';
        creditForm.append(creditField,node('button','Сохранить лимит'),feedback);
        creditForm.onsubmit=async event=>{
          event.preventDefault();creditForm.inert=true;
          try{
            const updated=await api({action:'edit-credit',clubId:c.clubId,credit:creditInput.value,previous:c.creditCents});
            c.creditCents=updated.creditCents;
            const entry=data.directory?.find(entry=>entry.clubId===c.clubId);
            if(entry)entry.creditCents=c.creditCents;
            const issue=issuerBody.querySelector('form[data-action=issue]');
            if(issue?.elements.clubId.value===c.clubId)issue.elements.credit.value=c.creditCents/100;
            feedback.textContent='Лимит сохранён.';
          }catch(e){feedback.textContent=e.message;}
          finally{creditForm.inert=false;}
        };
        row.append(creditForm,balances);
        row.ontoggle=async()=>{
          if(!row.open)return;
          balances.textContent='Загрузка…';
          try{
            const d=await api({action:'issued-balances',clubId:c.clubId});
            balances.replaceChildren();
            if(d.balanceError||!d.accounts.length)balances.append(node('p',d.balanceError?'Баланс временно недоступен.':'Нет привязанного счёта.'));
            d.accounts.forEach((a,i)=>{
              if(d.accounts.length>1)balances.append(node('h4','Счёт '+(i+1)));
              amountLine(balances,'Основной баланс',currentBalance(a.rub,a.usd));amountLine(balances,'Реквизиты',currentBalance(a.paymentRub,a.paymentUsd));balances.append(node('h4','Последние операции'));
              if(!a.operations?.length)balances.append(node('p',a.historyError?'История временно недоступна.':'Операций пока нет.'));
              renderClubHistory(balances,a);
              if(a.transferAccount){
                const form=node('form',''),amount=node('input',''),feedback=node('p','');
                amount.type='number';amount.min='0.01';amount.step='0.01';amount.required=true;
                amount.placeholder='Сумма в ₽';amount.setAttribute('aria-label','Сумма переноса в рублях');
                const submit=node('button','Перенести в реквизиты');submit.type='submit';
                feedback.setAttribute('role','status');
                form.append(amount,submit,feedback);balances.append(form);
                let request;
                form.onsubmit=async event=>{
                  event.preventDefault();
                  const cents=Math.round(amount.valueAsNumber*100);
                  if(!request||request.amountCents!==cents){
                    if(!window.confirm('Перенести '+money(cents,'RUB')+' с основного баланса клуба «'+c.name+'» в реквизиты?'))return;
                    request={action:'main-to-requisites',clubId:c.clubId,account:a.transferAccount,amountCents:cents,requestId:crypto.randomUUID()};
                  }
                  form.inert=true;
                  try{
                    await api(request);
                    request=null;
                    await row.ontoggle();
                  }catch(error){feedback.textContent=error.message;}
                  finally{form.inert=false;}
                };
              }
            });
          }catch(e){balances.textContent=e.message;}
        };
      }
    }catch(e){contents.textContent=e.message;}
  };
  function issuerControls(directory,selected){
    issuerBody.replaceChildren();
    const club=field('clubId','Клуб',directory),select=club.lastChild;
    select.value=selected||directory[0]?.clubId;
    const picker=node('div',''),search=node('input','');
    search.type='search';search.placeholder='Название или ID клуба';
    search.setAttribute('aria-label','Поиск клуба по названию или ID');
    picker.className='issuer-picker';
    const tools=node('div','');tools.className='issuer-search';
    const editor=node('div','');editor.className='issuer-new';editor.hidden=true;
    const nameField=field('newClubName','Название клуба'),nameInput=nameField.lastChild;
    nameInput.required=false;nameInput.maxLength=80;
    let renameId;
    function openEditor(entry){
      renameId=entry?.clubId;
      editor.hidden=false;
      save.textContent=entry?'Сохранить название':'Создать клуб';
      nameInput.value=entry?.name||search.value.trim();
      nameInput.focus();
      nameInput.select();
    }
    const add=button('＋ Новый клуб',()=>openEditor());
    const rename=button('Переименовать',()=>{
      const entry=directory.find(c=>c.clubId===select.value);
      if(entry)openEditor(entry);
    });
    const save=button('Создать клуб',()=>{
      const name=nameInput.value.trim();
      if(!name){nameInput.focus();return;}
      work(renameId?{action:'rename-club',clubId:renameId,name}:{action:'create-club',name});
    });
    nameInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();save.click();}};
    editor.append(nameField,save);
    tools.append(search,add);
    picker.append(tools,club);
    if(data.canRenameClub)picker.append(rename);
    picker.append(editor);
    let preferred=select.value;
    search.oninput=()=>{
      const query=search.value.trim().toLocaleLowerCase('ru-RU');
      const matches=directory.filter(c=>(c.name+' '+c.clubId).toLocaleLowerCase('ru-RU').includes(query));
      select.replaceChildren(...matches.map(c=>new Option(c.custom?c.name:c.name+' · '+c.clubId,c.clubId)));
      if(matches.some(c=>c.clubId===preferred))select.value=preferred;
      else if(matches.length!==1)select.prepend(new Option(matches.length?'Выберите клуб':'Клуб не найден','',false,true));
      draw();
    };
    const roles=[{name:'Менеджер',clubId:'staff'},{name:'Владелец',clubId:'owner'}];
    const kind=field('kind','Роль',roles);
    for(const opt of kind.lastChild.options)opt.textContent=roles.find(r=>r.clubId===opt.value).name;
    const creditField=field('credit','Кредитный лимит клуба, ₽');
    const feeField=field('takingFee','Комиссия за взятие реквизитов, %');
    const fee=feeField.lastChild;
    fee.type='number';fee.min='0';fee.max='100';fee.step='0.01';fee.inputMode='decimal';
    form('','issue',[picker,kind,field('target','Логин в Telegram'),creditField,feeField],'Создать ключ',{},issuerBody);
    const roster=node('div','');issuerBody.append(roster);
    function draw(){
      const entry=directory.find(c=>c.clubId===select.value);
      rename.disabled=!entry;
      if(renameId&&renameId!==entry?.clubId)editor.hidden=true;
      creditField.lastChild.value=entry?.creditCents==null?'':entry.creditCents/100;
      fee.value=(entry?.takingFeeBps??100)/100;
      const members=entry?.members||[];
      roster.replaceChildren(node('h4','Привязанные администраторы · '+members.length));
      for(const m of members){
        const row=node('p',m.label+' · '+(m.role==='owner'?'Владелец':'Менеджер')+' ');
        row.append(button('Отозвать доступ',()=>work({action:'revoke',clubId:select.value,target:m.id})));roster.append(row);
      }
    }
    select.onchange=()=>{preferred=select.value;draw();};draw();
  }
  function field(name,label,choices){
    const wrap=node('label',label),el=document.createElement(choices?'select':['details','comment'].includes(name)?'textarea':'input');
    el.name=name;el.required=true;
    if(choices)for(const c of choices)el.add(new Option(c.custom?c.name:c.name+' · '+c.clubId,c.clubId));
    if(name==='target'){
      el.placeholder='@username';
      el.autocapitalize='none';
      el.spellcheck=false;
    }
    if(name==='credit'){el.type='number';el.min='0';el.step='0.01';el.placeholder='0,00';el.inputMode='decimal';}
    if(name==='amount'){el.type='number';el.min=1;el.step=1;}
    if(name==='details')el.maxLength=500;
    wrap.append(el);return wrap;
  }
  function form(title,action,fields,submit,extra={},container=box){
    const f=document.createElement('form');f.dataset.action=action;if(title)f.append(node('h3',title));f.append(...fields,node('button',submit));container.append(f);
    f.onsubmit=e=>{e.preventDefault();const values=Object.fromEntries(new FormData(f));work({action:action==='issue'?values.kind:action,...extra,...values});};
  }
  function button(label,fn,tone){const b=node('button',label);b.type='button';b.onclick=fn;if(tone)b.className='deal-'+tone;return b;}
  const compactNumber=number=>number.replace(/[^+\d]/g,'');
  const bookingTime=new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Moscow'});
  function bookingDeadline(expiresAt){
    return expiresAt?' до '+bookingTime.format(expiresAt)+' МСК':'';
  }
  function bookingInstruction(x){
    if(!x.taker||x.rejected||x.canRecheck)return '';
    const amount=rubles(Math.round(x.amount*100)),deadline=bookingDeadline(x.expiresAt);
    if(x.mine){
      const payer=x.peer||'Клуб';
      if(x.canDecide)return payer+' отметил оплату. Проверьте поступление '+amount+'.';
      if(x.paymentStage==='awaiting_receipt')return 'Ждём чек от клуба «'+payer+'»'+deadline+'.';
      if(x.expiresAt)return payer+' забронировал '+amount+'. Ждём оплату'+deadline+'.';
    }else{
      if(x.paymentStage==='awaiting_receipt')return 'Прикрепите чек на '+amount+deadline+'.';
      if(x.canMarkPaid)return 'Переведите '+amount+' и отметьте оплату'+deadline+'.';
      if(x.canSendReceipt)return 'Переведите '+amount+' и прикрепите чек'+deadline+'.';
      if(x.waitSince||x.status==='Ожидает подтверждения')return 'Вы отметили оплату. Ждём подтверждения от получателя.';
    }
    return '';
  }
  function copyRequisitesButton(item){
    const amount=item.amount.toLocaleString('ru-RU')+(item.currency==='usd'?' $':' ₽');
    const details=item.details||[item.number,item.bank].filter(Boolean).join('\n');
    const copyDetails=details.replace(/^\+?[\d(][\d() \t\u00a0\u202f\-‐‑‒–—−]*(?=\r?$)/m,compactNumber);
    const text=[(amount+'\n'+copyDetails).trimEnd(),'',
      '❗️Строго эта сумма и банк',
      'Отправляйте сразу, позже реквизит будет неактуален',
      'По готовности отправьте чек пдф'
    ].join('\n');
    return clipboardButton(text);
  }
  function clipboardButton(text,numberOnly=false){
    const title=numberOnly?'Скопировать номер':'Скопировать реквизиты';
    const copy=button(numberOnly?'⧉':title,async()=>{
      try{
        await navigator.clipboard.writeText(text);
        copy.textContent=numberOnly?'✓':'✓ Скопировано';
        if(numberOnly)copy.title='Номер скопирован';
      }catch{
        const dialog=node('dialog','');dialog.className='placement-editor';
        const label=node('label',numberOnly?'Выделите и скопируйте номер':'Выделите и скопируйте реквизиты');
        const area=node('textarea','');area.value=text;area.readOnly=true;area.rows=text.split('\n').length;
        label.append(area);dialog.append(label,button('Закрыть',()=>dialog.close(),'secondary'));
        dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
        area.focus();area.select();
      }
    },'secondary');
    if(numberOnly){copy.className='offer-copy-number';copy.title=title;copy.setAttribute('aria-label',title);}
    return copy;
  }
  function confirmDeal(question,label,tone,submit){
    const dialog=node('dialog','');dialog.className='placement-editor deal-confirm';
    dialog.setAttribute('aria-label',question);
    const back=button('Назад',()=>dialog.close(),'secondary');back.autofocus=true;
    dialog.append(node('h3',question),button(label,()=>{dialog.close();submit();},tone),back);
    dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  const rubles=cents=>(cents/100).toLocaleString('ru-RU')+' ₽';
  const splitMinimumHint='Оставьте пустым, чтобы клуб взял всю сумму одним платежом. Если указать 5 000 ₽, клуб сможет взять часть заявки от 5 000 ₽.';
  function chooseBookingAmount(item,configure,submit){
    const total=Math.round(item.amount*100),minimum=item.minimumCents||0;
    const dialog=node('dialog',''),form=node('form','');
    dialog.className='placement-editor booking-amount-editor';
    const title=configure?'Настроить разбивку':'Взять часть суммы';
    dialog.setAttribute('aria-label',title);
    const wrap=field('amount',configure?'Минимальная сумма части, ₽ (необязательно)':'Сумма брони, ₽'),input=wrap.lastChild;
    input.step='0.01';input.max=total/100;input.min=configure?'0.01':minimum/100;
    input.required=!configure;
    if(configure){input.placeholder='Например, 5 000';input.value=minimum?minimum/100:'';}
    form.append(node('h3',title),node('p','Доступно '+rubles(total)),wrap);
    form.append(node('small',configure?splitMinimumHint:'Минимум одной брони — '+rubles(minimum)));
    const remainderHint=node('small','');
    remainderHint.setAttribute('aria-live','polite');form.append(remainderHint);
    input.oninput=()=>{
      const remaining=total-Math.round(input.valueAsNumber*100);
      remainderHint.textContent=!configure&&input.validity.valid&&remaining>0&&remaining<minimum
        ?'После брони останется '+rubles(remaining)+'. Другой клуб сможет взять этот остаток целиком.':'';
    };
    form.onsubmit=e=>{
      e.preventDefault();
      if(!form.reportValidity())return;
      dialog.close();submit(Math.round(Number(input.value)*100));
    };
    form.append(node('button',configure?'Сохранить':'Забронировать'),button('Отмена',()=>dialog.close(),'secondary'));
    dialog.append(form);dialog.onclose=()=>dialog.remove();document.body.append(dialog);dialog.showModal();
  }
  function attachPhoneMask(input){
    function format(){
      const raw=input.value;
      if(!/^\+?[\d\s().–—-]*$/.test(raw))return;
      const digits=raw.replace(/\D/g,'');
      if(!digits)return;
      const prefix=/^[78]/.test(digits);
      if(!prefix&&(!digits.startsWith('9')||raw.startsWith('+')))return;
      const local=digits.slice(prefix?1:0);
      if(local.length>10)return;
      const before=raw.slice(0,input.selectionStart).replace(/\D/g,'').length;
      const value='+7'+(local?' ('+local.slice(0,3):'')+
        (local.length>3?') '+local.slice(3,6):'')+
        (local.length>6?'-'+local.slice(6,8):'')+
        (local.length>8?'-'+local.slice(8):'');
      if(value===raw)return;
      input.value=value;
      const positions=[...value.matchAll(/\d/g)];
      const count=before+(prefix?0:1);
      const caret=count?positions[Math.min(count,positions.length)-1].index+1:0;
      input.setSelectionRange(caret,caret);
    }
    input.addEventListener('beforeinput',event=>{
      let start=input.selectionStart,end=input.selectionEnd;
      if(start!==end)return;
      if(event.inputType==='deleteContentBackward'){
        while(start>0&&/\D/.test(input.value[start-1]))start--;
        if(start!==end)input.setSelectionRange(Math.max(0,start-1),end);
        if(input.value==='+7')input.select();
      }else if(event.inputType==='deleteContentForward'){
        while(end<input.value.length&&/\D/.test(input.value[end]))end++;
        if(start!==end)input.setSelectionRange(start,Math.min(input.value.length,end+1));
      }
    });
    input.addEventListener('input',format);
    format();
  }
  function placementEditor(container,trigger,clubId,chatId,room){
    const limits=node('div','');
    limits.className='club-metrics';
    function updateLimits(room){
    limits.replaceChildren();
    for(const [label,value] of [
      ['Кредитный лимит',room.limit],
      ['Доступно к размещению',room.available],
      ['Ваш баланс по реквизитам',room.balance],
      ['Занято заявками',room.reserved]
    ])limits.append(metric(label,rubles(value)));
    }
    updateLimits(room);


    let requestId;
    const dialog=document.createElement('dialog');
    dialog.className='placement-editor';
    const editor=document.createElement('form');
    const close=button('Закрыть',()=>dialog.close());
    const heading=node('h3','Разместить реквизиты');
    heading.id='placement-title';dialog.setAttribute('aria-labelledby',heading.id);
    const header=node('div','');header.className='placement-heading';
    const dismiss=button('×',close.onclick);
    dismiss.setAttribute('aria-label','Закрыть');
    header.append(heading,dismiss);
    dialog.append(header,editor,limits,node('p','Размещение бесплатно. Комиссия за взятие списывается у плательщика при подтверждении оплаты. Без разбивки сумма заявки — от 1 000 до 30 000 ₽.'),close);
    container.append(dialog);
    trigger.onclick=()=>{requestId=crypto.randomUUID();start();dialog.showModal();};
    const raw=field('details','Сообщение с реквизитами');
    raw.lastChild.maxLength=5000;raw.lastChild.rows=6;
    function start(){
      editor.oninput=null;
      editor.replaceChildren(raw,node('button','Распознать'),button('Заполнить вручную',()=>review({})));
      editor.onsubmit=e=>{e.preventDefault();review(window.pokerDepositParser.parse(raw.lastChild.value));};
    }
    function review(parsed){
      editor.replaceChildren();
      for(const [key,label] of [['phone','Телефон'],['bank','Банк'],['recipient','Имя получателя'],['amount','Сумма, ₽']]){
        const wrap=field(key,label),input=wrap.lastChild;
        if(key==='amount'){input.min='1000';input.step='0.01';input.max='30000';input.value=parsed.amount?parsed.amount/100:'';}
        else input.value=parsed[key]||'';
        if(key==='phone'){
          input.type='tel';
          input.autocomplete='tel';
          input.placeholder='+7 (999) 123-45-67';
          attachPhoneMask(input);
        }
        editor.append(wrap);
        if(key==='bank'){
          const choices=node('div','');choices.className='bank-choices';
          choices.setAttribute('role','group');choices.setAttribute('aria-label','Выбрать банк');
          for(const bank of ['Сбербанк','Т-Банк','ВТБ','Альфа-Банк','Озон Банк','Райффайзенбанк']){
            choices.append(button(bank,()=>{
              input.value=bank;
              input.dispatchEvent(new Event('input',{bubbles:true}));
            }));
          }
          const syncBank=()=>{
            for(const choice of choices.children)
              choice.setAttribute('aria-pressed',String(choice.textContent.toLowerCase()===input.value.trim().toLowerCase()));
          };
          input.addEventListener('input',syncBank);syncBank();editor.append(choices);
        }
      }
      const minimumField=field('splitMinimum','Минимальная сумма части, ₽ (необязательно)');
      const minimum=minimumField.lastChild;
      minimum.type='number';minimum.step='0.01';minimum.min='0.01';minimum.required=false;
      minimum.placeholder='Например, 5 000';
      const minimumHint=node('small',splitMinimumHint);
      minimumHint.id='placement-minimum-hint';
      minimum.setAttribute('aria-describedby',minimumHint.id);
      const commentField=field('comment','Комментарий (необязательно)');
      const comment=commentField.lastChild;
      comment.required=false;comment.maxLength=300;comment.rows=2;
      editor.append(minimumField,minimumHint,commentField);
      const error=node('p',(parsed.warnings||[]).filter(w=>!/игрок|рум|USDT/i.test(w)).join(' '));
      error.setAttribute('role','status');
      const submit=node('button','Разместить');
      editor.append(error,submit,button('Назад',start));
      const validate=()=>{
        const {amount,phone,bank,recipient}=editor.elements;
        const parser=window.pokerDepositParser;
        const cents=parser.money(amount.value);
        amount.max=minimum.value?'100000000':'30000';
        minimum.max=amount.value||'100000000';
        let amountError='';
        if(amount.value){
          if(!/^\d+(?:[.,]\d{1,2})?$/.test(amount.value))amountError='Введите сумму в рублях, до двух знаков после запятой.';
          else if(cents<100000)amountError='Минимальная сумма заявки — 1 000 ₽.';
          else if(cents>10000000000)amountError='Максимальная сумма заявки — 100 000 000 ₽.';
          else if(!minimum.value&&cents>3000000)amountError='Максимальная сумма одним платежом — 30 000 ₽. Чтобы разместить больше, укажите минимальную сумму части в поле ниже.';
        }
        amount.setCustomValidity(amountError);
        minimum.setCustomValidity(minimum.validity.rangeOverflow?'Минимальная сумма части не может превышать сумму заявки.':'');
        phone.setCustomValidity(parser.phoneError(phone.value));
        for(const input of [bank,recipient]){
          input.setCustomValidity(input.value&&!input.value.trim()?'Заполните поле.':input.value.includes('|')?'Уберите символ |.':'');
        }
        const details=[parser.normalizePhone(phone.value),bank.value.trim(),recipient.value.trim()].join('\n');
        if(details.length>500)recipient.setCustomValidity('Телефон, банк и имя вместе должны занимать не более 500 символов.');
      };
      editor.oninput=validate;
      validate();
      editor.onsubmit=async e=>{
        e.preventDefault();
        const values=Object.fromEntries(new FormData(editor));
        values.minimumCents=minimum.value?window.pokerDepositParser.money(minimum.value):0;
        delete values.splitMinimum;
        values.phone=window.pokerDepositParser.normalizePhone(values.phone);
        if(!values.phone){error.textContent='Проверьте телефон получателя.';return;}
        editor.inert=true;close.disabled=true;
        dialog.oncancel=e=>e.preventDefault();
        try{await api({action:'place',clubId,chatId,requestId,...values});}
        catch(err){error.textContent=err.message;return;}
        finally{editor.inert=false;close.disabled=false;dialog.oncancel=null;}
        dialog.close();await refreshVisibleList?.(true);
      };
    }
    return updateLimits;
  }
  function requestEditor(container,clubId){
    const dialog=document.createElement('dialog'),form=document.createElement('form');
    dialog.className='placement-editor';dialog.setAttribute('aria-label','Создать запрос');
    const amount=field('amount','Сумма, ₽'),bank=field('bank','Банк (необязательно)');
    amount.lastChild.min='0.01';amount.lastChild.step='0.01';amount.lastChild.max='999999999.99';
    bank.lastChild.required=false;bank.lastChild.maxLength=100;
    const submit=node('button','Отправить запрос'),status=node('p','');
    status.setAttribute('role','status');
    const close=button('Закрыть',()=>dialog.close());
    const closeIcon=button('×',()=>dialog.close());
    closeIcon.className='request-close';closeIcon.setAttribute('aria-label','Закрыть окно');
    const heading=node('div','');heading.className='request-heading';
    heading.append(node('h3','Создать запрос'),closeIcon);
    const comment=field('comment','Комментарий (необязательно)');
    comment.lastChild.required=false;comment.lastChild.rows=3;comment.lastChild.maxLength=500;
    const duration=field('durationMinutes','Срок запроса, минут');
    Object.assign(duration.lastChild,{type:'number',min:'1',max:'360',step:'1',placeholder:'От 1 до 360 (6 часов)'});
    const kinds=[['card','Карта на нужную сумму'],['crypto-rub','Обмен крипты на рубли'],['rub-crypto','Обмен рублей на крипту'],['other','Другой запрос']];
    const kind=field('requestType','Что вам нужно?',kinds.map(([clubId,name])=>({clubId,name,custom:true})));
    function updateFields(){
      const type=kind.lastChild.value,card=type==='card';
      for(const el of [amount,bank]){
        el.hidden=!card;el.lastChild.disabled=!card;
        el.style.display=card?'':'none';
      }
      comment.firstChild.textContent=card?'Комментарий (необязательно)':'Описание запроса';
      comment.lastChild.required=!card;
      comment.lastChild.placeholder=card?'':type==='other'?'Что вы хотите запросить у клубов?':
        type==='crypto-rub'?'Например, обменяю 200 USDT на рубли':'Например, обменяю 15 000 ₽ на USDT';
    }
    kind.lastChild.onchange=updateFields;
    form.append(kind,amount,bank,comment,duration,submit);dialog.append(heading,form,close);container.append(dialog,status);
    let requestId;
    const trigger=button('Создать запрос',()=>{requestId=crypto.randomUUID();form.reset();updateFields();status.textContent='';dialog.showModal();});
    trigger.setAttribute('aria-haspopup','dialog');
    const error=node('p','');error.setAttribute('role','alert');form.append(error);
    form.onsubmit=async e=>{
      e.preventDefault();if(submit.disabled)return;
      submit.disabled=true;close.disabled=closeIcon.disabled=true;trigger.disabled=true;error.textContent='';
      try{
        await api({action:'request-requisites',clubId,requestId,...Object.fromEntries(new FormData(form))});
        dialog.close();status.textContent='Запрос создан. Предложения придут в Poker21 Assist.';await refreshVisibleList?.(true);
      }catch(err){error.textContent=err.message;}
      finally{submit.disabled=false;close.disabled=closeIcon.disabled=false;trigger.disabled=false;}
    };
    dialog.addEventListener('close',()=>{error.textContent='';});
    return trigger;
  }
  async function api(body){
    const res=await fetch('./api/club-team',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':window.Telegram?.WebApp?.initData||''},body:JSON.stringify(body)});
    const value=await res.json();if(!res.ok)throw Object.assign(Error(value.error||'Не удалось загрузить кабинет.'),{status:res.status});return value;
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
  function showPlayerGroups(parent,groups){
    const panel=node('section','');panel.className='pulse-group-browser';
    const title=node('h3','Группы игроков'),select=node('select','');
    select.setAttribute('aria-label','Группа игроков');
    for(const [label,rows] of Object.entries(groups)){
      const option=node('option',label+' · '+rows.length);option.value=label;select.append(option);
    }
    const search=node('input','');search.type='search';search.placeholder='Ник или ID';search.setAttribute('aria-label','Поиск в группе');
    const metric=node('small',''),list=node('div',''),nav=node('nav','');nav.setAttribute('aria-label','Страницы группы');
    const size=5;let page=0;
    const prev=button('‹',()=>{page--;draw();}),next=button('›',()=>{page++;draw();}),range=node('span','');
    prev.setAttribute('aria-label','Предыдущие игроки');next.setAttribute('aria-label','Следующие игроки');nav.append(prev,range,next);
    const format=new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
    function draw(){
      const label=select.value,query=search.value.trim().toLowerCase();
      const rows=(groups[label]||[]).filter(p=>!query||String(p.nick).toLowerCase().includes(query)||String(p.id).includes(query));
      const delta=['Рост рейка','Снижение рейка'].includes(label),inactive=label==='Не играли';
      metric.textContent=inactive?'Конец последней игровой недели':delta?'Изменение рейка за неделю':label==='Ключевые игроки'?'Рейк за последние 4 недели':'Рейк за неделю';
      list.replaceChildren();
      const peak=Math.max(1,...rows.map(p=>Math.abs(p.value||0)));
      for(const p of rows.slice(page*size,(page+1)*size)){
        const row=node('div','');row.className='pulse-member';
        const nick=node('span',p.nick);nick.title='ID '+p.id;
        const value=inactive?(p.lastDate||'').split('-').reverse().join('.'):(delta&&p.value>0?'+':'')+format.format(p.value)+' ₽';
        row.append(nick,node('strong',value));
        if(p.reason)row.append(node('small',p.reason));
        if(!inactive){const bar=node('i','');bar.setAttribute('aria-hidden','true');bar.style.width=(100*Math.abs(p.value)/peak)+'%';if(p.value<0)bar.className='is-down';row.append(bar);}
        list.append(row);
      }
      if(!rows.length)list.append(node('p',query?'Игрок не найден':'В этой группе пока нет игроков.'));
      nav.hidden=rows.length<=size;
      prev.disabled=page===0;next.disabled=(page+1)*size>=rows.length;
      range.textContent=(page*size+1)+'–'+Math.min((page+1)*size,rows.length)+' из '+rows.length;
    }
    select.onchange=()=>{page=0;search.value='';draw();};
    search.oninput=()=>{page=0;draw();};
    panel.append(title,select,search,metric,list,nav);parent.append(panel);draw();
  }
  function showDashboard(d,parent,loadWeek) {
    if(d.summaryOnly){
      const summary=node('section','');summary.className='week-pulse';
      summary.append(node('h2','Пульс клуба'),node('small',d.period.join(' — ')));
      if(Number.isFinite(d.rakeRub))amountLine(summary,'Рейк за неделю',d.rakeRub.toLocaleString('ru-RU')+' ₽');
      if(Number.isFinite(d.activePlayers))amountLine(summary,'Активные игроки',String(d.activePlayers));
      parent.append(summary);return;
    }
    const fmt=n=>n==null?'—':Number(n).toLocaleString('ru-RU',{maximumFractionDigits:2});
    const pulse=node('section','');pulse.className='week-pulse';parent.append(pulse);
    const dates=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'});
    const period=d.period.map(value=>new Date(value+'T00:00:00Z'));
    const header=node('header','');
    header.append(node('h2','Пульс клуба'),node('small',typeof dates.formatRange==='function' && period.every(date=>Number.isFinite(+date))?dates.formatRange(...period):d.period.join(' — ')));
    const weeks=d.weeks||[],index=weeks.indexOf(d.period[1]);
    const nav=node('nav','');nav.className='pulse-week-nav';nav.setAttribute('aria-label','Неделя отчёта');
    for(const [label,arrow,target] of [['Предыдущая неделя','‹',weeks[index+1]],['Следующая неделя','›',weeks[index-1]]]){
      const control=button(arrow,()=>loadWeek(target));control.setAttribute('aria-label',label);control.disabled=!target;
      nav.append(control);
    }
    header.append(nav);pulse.append(header);
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
    showPlayerGroups(pulse,d.groups);
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
    if(d.rakeHistory?.length){
      const history=d.rakeHistory;
      const chart=node('section','');chart.className='pulse-rake-history';
      chart.append(node('h3','Рейк по неделям'));
      const current=history.find(w=>w.end===d.period[1]);
      const label=w=>dates.format(new Date(w.end+'T00:00:00Z'));
      const amount=w=>Number.isFinite(w.total)?fmt(w.total)+' ₽':'нет данных';
      if(current)chart.append(node('p','Неделя по '+label(current)+' · '+amount(current)));
      const bars=node('div','');bars.className='pulse-rake-bars';
      const peak=Math.max(1,...history.map(w=>w.total||0));
      for(const w of history){
        const bar=button('',()=>loadWeek(w.end));
        bar.title='Неделя по '+label(w)+' · '+amount(w);
        bar.setAttribute('aria-label',bar.title);
        bar.setAttribute('aria-pressed',String(w.end===d.period[1]));
        const column=node('span','');column.style.height=(100*(w.total||0)/peak)+'%';
        if(!Number.isFinite(w.total))column.hidden=true;
        bar.append(column);bars.append(bar);
      }
      const axis=node('div','');axis.className='pulse-rake-axis';
      axis.append(node('span',label(history[0])));
      if(history.length>1)axis.append(node('span',label(history[history.length-1])));
      chart.append(bars,axis);parent.append(chart);
    }
  }
  async function render(key, request){
    refreshVisibleList = null;refreshBalances=null;
    tickVisibleBookings=null;
    box.replaceChildren();
    requestsPanel.replaceChildren();
    requestsPanel.hidden=true;
    document.querySelector('.club-dashboard')?.remove();
    clubName.textContent='';
    if(copyMiniApp)copyMiniApp.hidden=!data.miniAppInviteUrl;
    headerBalance.replaceChildren();
    issuer.hidden=!data.directory;
    clubList.hidden=weekly.hidden=manual.hidden=pendingConfirmations.hidden=broadcastPanel.hidden=!data.canInspectClubs;
    if(data.canInspectClubs&&!confirmationSummary.textContent.includes(' · '))loadPendingConfirmations();
    if(!data.directory){
      issuedInvite=null;
      issuerBody.replaceChildren();
    }else if(key){
      const club=data.directory.find(c=>c.clubId===request.clubId);
      issuedInvite={key,clubId:request.clubId,clubName:club?.name||request.clubId,target:request.target};
      issuer.open=true;
    }
    if(data.directory&&!issuedInvite)issuerControls(data.directory,request.clubId);
    if(historyDeal){const item=historyDeal;historyDeal='';void openHistoryDeal(item);}
    const clubs=data.memberships;
    headerBalance.hidden=!clubs.length;
    finance.hidden=true;finance.textContent='Загружаем баланс…';
    headerBalance.setAttribute('aria-expanded','false');
    panel.classList.toggle('club-connected',!!clubs.length);
    if(clubs.length)panel.open=true;
    if(!active&&ownerBooking&&clubs.some(c=>c.clubId==='758417'))active='758417';
    if(!clubs.some(c=>c.clubId===active))active=clubs[0]?.clubId||'';
    if(issuedInvite){
      const {key,clubId,clubName,target:issuedTarget}=issuedInvite;
      const card=node('article','');
      card.className='issued-invite';
      const target=String(issuedTarget).trim().replace(/^@/,'');
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
      const another=button('Создать другое приглашение',()=>{
        issuedInvite=null;
        issuerControls(data.directory,clubId);
        issuerBody.querySelector('input[type=search]')?.focus();
      },'secondary');
      const keyLabel=node('label','Одноразовый ключ');keyLabel.append(keyField);
      card.append(node('h3','Приглашение готово'),node('p','Клуб: '+clubName),
        node('p','Получатель: '+recipient),keyLabel,copy,
        node('small','Отправьте ключ получателю в личном чате. Он действует 24 часа.'),another);
      issuerBody.replaceChildren(card);
    }
    if(clubs.length){
      const choice=field('active','Кабинет клуба',clubs);choice.lastChild.value=active;
      choice.lastChild.onchange=e=>{active=e.target.value;work({action:'status'});};box.append(choice);
      const c=clubs.find(c=>c.clubId===active);
      const role=node('small',c.role==='owner'?'Владелец клуба':'Сотрудник клуба');role.className='club-role';choice.append(role);
      const dashboard=node('div','');
      const requested=active;
      clubName.textContent=c.name;
      const mainSum=node('strong','…'),paymentSum=node('strong','…');
      const historyLabel=node('span','История переводов');
      historyLabel.className='club-header-history-label';
      headerBalance.append(node('small','Основной'),mainSum,node('small','Реквизиты'),paymentSum,historyLabel);
      headerBalance.setAttribute('aria-label','Баланс клуба '+c.name+'. История переводов');
      dashboard.className='club-dashboard';
      const destination=document.getElementById('players-rake-content');
      if(destination)destination.append(dashboard);
      else panel.after(dashboard);
      if(c.role==='owner')dashboard.textContent='Загружаем статистику…';
      let balanceVersion=0;
      const updateBalances=()=>{const version=++balanceVersion;return api({action:'balances',clubId:requested}).then(result=>{
        if(version!==balanceVersion||!dashboard.isConnected || active!==requested)return;
        const accounts=result.accounts||[];
        const total=k=>accounts.reduce((n,a)=>n+(a[k] ?? 0),0);
        mainSum.replaceChildren(result.balanceError?'Недоступен':accounts.length ? currentBalance(total('rub'),total('usd')) : '—');
        paymentSum.replaceChildren(result.balanceError?'Недоступен':accounts.length?currentBalance(total('paymentRub'),total('paymentUsd')):'—');

      }).catch(()=>{
        if(version!==balanceVersion||!dashboard.isConnected || active!==requested)return;
        mainSum.textContent=paymentSum.textContent='Недоступен';

      });};
      refreshBalances=updateBalances;updateBalances();
      if(c.role==='owner'){
        let version=0;
        async function loadWeek(week){
          const stamp=++version;
          try{
            const result=await api({action:'dashboard',clubId:requested,week});
            if(stamp!==version||!dashboard.isConnected||active!==requested)return;
            dashboard.replaceChildren();showDashboard(result,dashboard,loadWeek);
          }catch{
            if(stamp!==version||!dashboard.isConnected||active!==requested)return;
            dashboard.querySelector('[role="alert"]')?.remove();
            const error=node('p','Не удалось загрузить неделю.');error.setAttribute('role','alert');
            error.append(button('Повторить',()=>loadWeek(week)));dashboard.prepend(error);
          }
        }
        loadWeek();
      }
      const requisites=node('div','');box.append(requisites);
      if(clubs.length===1)choice.hidden=true;
      const registry=await api({action:'list',clubId:active,bookingId:ownerBooking||undefined,chatId:selectedGroups.get(active)});
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
      if(widgetOffer||openRequisitesOnLaunch)expandedRegistry=registryKey;
      const list=node('div','');list.hidden=expandedRegistry!==registryKey;list.id='club-requisite-list';
      const take=button('Реквизиты',()=>{
        list.hidden=!list.hidden;
        expandedRegistry=list.hidden?'':registryKey;
        take.setAttribute('aria-expanded',String(!list.hidden));
        if(!list.hidden)refresh();
      });
      take.setAttribute('aria-expanded',String(!list.hidden));take.setAttribute('aria-controls',list.id);
      const place=button('Разместить',null);place.disabled=!chatId;place.setAttribute('aria-haspopup','dialog');
      requisites.append(actions,list);actions.append(take,place);
      const pool=node('div',''),cards=node('div','');
      pool.className='requisite-actions request-pool-actions';
      cards.id='club-request-list';cards.hidden=true;
      const heading=button('Запросы',()=>{
        cards.hidden=!cards.hidden;
        heading.setAttribute('aria-expanded',String(!cards.hidden));
        if(!cards.hidden)refresh();
      });
      heading.setAttribute('aria-expanded','false');heading.setAttribute('aria-controls',cards.id);
      const description=node('p','Если вам нужна карта на сумму, которой нет в списке реквизитов, оставьте запрос для других клубов. Также можно запросить обмен крипты на рубли или рублей на крипту либо описать другую задачу.');
      description.id='club-request-help';description.hidden=true;
      const help=button('!',()=>{
        description.hidden=!description.hidden;
        help.setAttribute('aria-expanded',String(!description.hidden));
      });
      help.className='request-help';help.setAttribute('aria-label','О запросах для других клубов');
      help.setAttribute('aria-controls',description.id);help.setAttribute('aria-expanded','false');
      pool.append(heading,help,requestEditor(requestsPanel,active));
      requestsPanel.prepend(pool,description,cards);
      requestsPanel.hidden=false;
      let poolSignature;
      function updateRequests(){
        const now=Date.now()+clockOffset;
        for(const card of [...cards.children]){
          const minutes=Math.ceil((Number(card.dataset.end)-now)/60000);
          if(minutes<=0)card.remove();
          else card.lastChild.textContent='Осталось '+minutes+' мин';
        }
        heading.textContent='Запросы · '+cards.childElementCount;
      }
      const updateLimits=chatId?placementEditor(requisites,place,active,chatId,registry.availability):null;
      if(!chatId&&!groups.length)requisites.append(node('p','Для размещения реквизитов привяжите группу клуба в боте.'));
      let clockOffset=0;
      function tickBookings(){
        updateRequests();
        if(list.hidden||document.hidden||!list.isConnected)return;
        for(const clock of list.querySelectorAll('[data-paid-at]')){
          const seconds=Math.max(0,Math.floor((Date.now()+clockOffset-Number(clock.dataset.paidAt))/1000));
          const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60;
          const elapsed=(hours?hours+':'+String(minutes).padStart(2,'0'):String(minutes))+':'+String(seconds%60).padStart(2,'0');
          clock.textContent='Ждём подтверждения '+elapsed;
        }
        for(const clock of list.querySelectorAll('[data-booking-end]')){
          const left=Math.max(0,Math.ceil((Number(clock.dataset.bookingEnd)-Date.now()-clockOffset)/1000));
          if(!left&&clock.dataset.expired)continue;
          clock.textContent=left?'Осталось '+Math.floor(left/60)+':'+String(left%60).padStart(2,'0'):'Время брони истекло';
          clock.classList.toggle('ending',left<=60);
          if(!left){
            clock.dataset.expired='1';
            if(!clock.closest('.withdrawal-booking'))clock.closest('article').querySelectorAll('button').forEach(b=>b.disabled=true);
            refresh();
          }
        }
      }
      let lastContents;
      let previousBookings=new Set();
      const reminders=new Map();
      function reminderButton(x){
        const key=JSON.stringify([x.id,x.waitSince]);
        const label='Напомнить клубу';
        function update(text,pending=false){
          reminders.set(key,{text,pending});
          const current=Array.from(list.querySelectorAll('[data-reminder]')).find(el=>el.dataset.reminder===key);
          if(current){current.textContent=text;current.disabled=pending;}
        }
        const control=button(reminders.get(key)?.text||label,async()=>{
          if(reminders.get(key)?.pending)return;
          update('Отправляем напоминание…',true);
          try{
            await api({action:'remind',item:x.id,clubId:requested,chatId});
            update('✓ Напоминание отправлено клубу',true);
            setTimeout(()=>update(label),30000);
          }catch(error){
            update(error.message+' · Повторить');
          }
        },'secondary');
        control.dataset.reminder=key;
        control.disabled=!!reminders.get(key)?.pending;
        return control;
      }
      function drawItems(registry){
        if(registry.confirmedIds?.some(id=>previousBookings.has(id)))showNotice('Сделка проведена');
        previousBookings=new Set(registry.items.filter(x=>x.taker).map(x=>x.id));
        clockOffset=registry.serverNow?registry.serverNow-Date.now():0;
        const requests=registry.requests||[],signatureRequests=JSON.stringify(requests);
        if(signatureRequests!==poolSignature){
          poolSignature=signatureRequests;cards.replaceChildren();
          for(const request of requests){
            const card=node('article','');card.className='requisite-preview';card.dataset.end=request.expiresAt;
            for(const line of request.text.split('\n'))card.append(node('span',line));
            card.append(node('small',''));cards.append(card);
          }
        }
        updateRequests();
        const items=registry.items;
        take.textContent='Реквизиты · '+items.length;
        const signature=JSON.stringify([items,registry.selectedBooking,registry.withdrawalError,registry.canResumeHousePause]);
        if(signature===lastContents&&!list.querySelector('.requisite-refresh-error'))return;
        lastContents=signature;
        const next=document.createDocumentFragment();
        let scroller=list.parentElement;
        while(scroller&&!(scroller.scrollHeight>scroller.clientHeight&&/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)))scroller=scroller.parentElement;
        scroller ||= document.scrollingElement;
        const top=scroller===document.scrollingElement?0:scroller.getBoundingClientRect().top;
        const anchors=Array.from(list.querySelectorAll('article[data-id]')).filter(el=>el.getBoundingClientRect().bottom>top).map(el=>[el.dataset.id,el.getBoundingClientRect().top]);

        const stats={open:{count:0,amount:0},taken:{count:0,amount:0}};
        for(const item of items){if(item.historyOnly)continue;const bucket=stats[item.taker?'taken':'open'];bucket.count++;bucket.amount+=item.amount;}
        const summary=node('div','');summary.className='requisite-totals';
        for(const [key,label] of [['open','Свободные'],['taken','Взятые']]){
          const total=metric(label,stats[key].amount.toLocaleString('ru-RU')+' ₽');
          total.firstChild.append(node('b',String(stats[key].count)));summary.append(total);
        }
        next.append(requisitesWarning(),summary);
        const selected=registry.selectedBooking;
        if(selected&&!items.some(x=>x.bookings?.some(b=>b.id===selected.id))){
          const history=node('article','');history.className='requisite-preview';history.dataset.booking=selected.id;
          history.append(node('strong',(selected.clubName||selected.clubId)+' · '+rubles(selected.amountCents)),node('span',selected.stage));next.append(history);
        }
        if(!selected&&!items.length&&!registry.withdrawalError)next.append(node('p','Заявок пока нет.'));
        if(registry.withdrawalError)next.append(node('p','Не удалось загрузить выводы из Депозитов.'),button('Обновить',()=>work({action:'status'})));
        const activeBooking=b=>['Забронировано','Плательщик отметил оплату'].includes(b.stage);
        const inWork=item=>Boolean(item.taker||item.bookings?.some(activeBooking));
        const myBookings=items.filter(x=>x.taker&&!x.mine);
        const remaining=items.filter(x=>!x.taker||x.mine).sort((a,b)=>Number(inWork(b))-Number(inWork(a)));
        const orderedItems=[...myBookings,...remaining];
        for(const x of orderedItems){
          if(myBookings.length){
            if(x===myBookings[0])next.append(node('h3','Мои брони'));
            if(x===remaining[0])next.append(node('h3','Остальные реквизиты'));
          }
          const row=node('article','');row.className='requisite-preview';row.dataset.id=x.id;
          const head=node('header','');head.className='offer-head';
          const bookedCents=x.bookings?.filter(activeBooking).reduce((sum,b)=>sum+b.amountCents,0);
          head.append(node('strong',x.mine&&bookedCents?'Забронировано '+rubles(bookedCents):(!x.mine&&!x.taker&&x.minimumCents?'Доступно ':'')+rubles(Math.round(x.amount*100))));
          if(x.bank)head.append(node('small',x.bank));
          row.append(head);
          if(x.publisherClub)row.append(node('small','Разместил клуб «'+x.publisherClub+'»'));
          if(x.comment){
            const comment=node('p','Комментарий: '+x.comment);
            comment.className='offer-comment';
            row.append(comment);
          }
          if(inWork(x)){
            row.classList.add('is-in-work');
            const badge=node('span','В работе');
            badge.className='booking-active-badge';
            row.append(badge);
          }
          if(Array.isArray(x.bookings)){
            row.append(node('span','Свободно '+rubles(x.availableCents)+' из '+rubles(x.totalCents)));
            for(const booking of x.bookings){
              const section=node('div','');section.className='withdrawal-booking';if(booking.id)section.dataset.booking=booking.id;
              section.append(node('strong',(booking.clubName||'Клуб')+' · ID '+booking.clubId+' · '+rubles(booking.amountCents)),node('small',booking.stage==='Забронировано'?'Ждём оплату'+bookingDeadline(booking.expiresAt)+'.':
                booking.stage==='Плательщик отметил оплату'?'Клуб отметил оплату. Проверьте поступление '+rubles(booking.amountCents)+'.':booking.stage));
              if(booking.paidAt||booking.expiresAt){
                const timer=node('time','');timer.className='booking-clock';
                if(booking.paidAt)timer.dataset.paidAt=booking.paidAt;
                else timer.dataset.bookingEnd=booking.expiresAt;
                section.append(timer);
              }
              row.append(section);
            }
          }
          const canSplit=x.minimumCents>0&&Math.round(x.amount*100)>x.minimumCents;
          if(canSplit)row.append(node('small','Минимум одной брони — '+rubles(x.minimumCents)));
          else if(!x.historyOnly&&!x.taker&&!x.bookingPaused){
            const hint=node('small','Только одним платежом');
            hint.className='offer-single-payment';row.append(hint);
          }
          if(x.number){
            const phone=node('span',String(x.number).replace(/^\+7(\d{3})(\d{3})(\d{2})(\d{2})$/,'+7 $1 $2-$3-$4'));
            phone.className='offer-number';
            const number=String(x.number).trim();
            if(inWork(x)&&/^\+?[\d(][\d()\s‐‑‒–—−-]*$/.test(number)){
              const line=node('div','');line.className='offer-number-line';
              line.append(phone,clipboardButton(compactNumber(number),true));row.append(line);
            }else row.append(phone);
          }
          if(x.bookingPaused){
            row.append(bookingPauseBadge());
            if(registry.canResumeHousePause)row.append(button('Убрать с паузы',()=>work({action:'resume',item:x.id,clubId:requested,chatId})));
          }
          if(x.mine||x.taker){
            const extra=x.number?String(x.details||'').split(/\r?\n/).slice(2).join(' '):x.details;
            if(extra)row.append(node('span',extra));
            if(x.taker&&(x.details||x.number))row.append(copyRequisitesButton(x));
            row.append(node('small',bookingInstruction(x)||x.status||(x.taker?'Взята':'Ваша заявка')));
            if(x.waitSince){
              const timer=node('span','');timer.className='booking-clock';timer.dataset.paidAt=x.waitSince;row.append(timer);
            }
            if(x.mine&&!x.taker&&!x.historyOnly&&String(requested)==='758417'&&x.id.startsWith('withdrawal:'))
              row.append(button('Настроить разбивку',()=>chooseBookingAmount(x,true,minimum=>work({action:'split',item:x.id,clubId:requested,chatId,minimum})),'secondary'));
            if(x.canRemind)row.append(reminderButton(x));
            if(x.expiresAt){
              const timer=node('time','');timer.className='booking-clock';timer.dataset.bookingEnd=x.expiresAt;
              row.append(timer);
            }
            if(x.mine&&!x.taker&&!x.historyOnly&&!registry.canDeleteRequisites)row.append(button('Снять заявку',()=>{
              confirmDeal('Снять заявку на '+x.amount.toLocaleString('ru-RU')+' ₽?','Снять заявку','danger',()=>work({action:'remove',item:x.id,clubId:requested,chatId}));
            },'danger'));
            const feedback=node('small','');
            feedback.dataset.receiptFeedback='';
            feedback.setAttribute('role','status');
            feedback.hidden=true;
            row.append(feedback);
            if(x.canSendReceipt||x.canMarkPaid){
              const actions=node('div','');actions.className='booking-actions';
              if(x.canRecheck)actions.append(button('Попросить проверить ещё раз',()=>work({action:'recheck',item:x.id,clubId:requested,chatId}),'primary'));
              const send=button(x.canRecheck?'Отправить новый чек':'Отправить чек',()=>payWithReceipt(x.id,requested,chatId));
              send.dataset.originalLabel=send.textContent;send.dataset.receiptSend='';send.className=x.canRecheck?'deal-secondary':'booking-send';actions.append(send);
              if(x.canMarkPaid)actions.append(button('Отметить оплату без чека',()=>work({action:'paid',item:x.id,clubId:requested,chatId})));
              if(x.canExtend)actions.append(button('Продлить'+bookingDeadline(Number(x.expiresAt)+3600000),()=>work({action:'extend',item:x.id,clubId:requested,chatId})));
              const cancel=button('Отменить бронь',()=>work({action:'cancel',item:x.id,clubId:requested,chatId}));
              cancel.className='booking-cancel';actions.append(cancel);row.append(actions);
            }
            if(x.hasReceipt)row.append(button('Посмотреть чек',()=>showReceipt(x.id,requested,chatId),'secondary'));
            if(x.canDecide){
              row.append(button('Подтвердить поступление',()=>{
                confirmDeal('Подтвердить получение '+x.amount.toLocaleString('ru-RU')+' ₽?','Подтвердить','primary',()=>work({action:'confirm',item:x.id,clubId:requested,chatId}));
              },'primary'),button('Не поступило',()=>work({action:'reject',item:x.id,clubId:requested,chatId}),'danger'));
            }
          }else if(!x.bookingPaused){
            const take=takeCents=>work({action:'take',item:x.id,clubId:requested,chatId,takeCents},x);
            const claim=button(canSplit?'Выбрать сумму':'Взять на '+rubles(Math.round(x.amount*100)),()=>canSplit?chooseBookingAmount(x,false,take):take(x.minimumCents?Math.round(x.amount*100):undefined));
            claim.className='offer-claim';row.append(claim);
          }
          if(registry.canDeleteRequisites&&!x.historyOnly)row.append(button('Удалить реквизиты',()=>{
            confirmDeal('Удалить реквизиты на '+x.amount.toLocaleString('ru-RU')+' ₽ из списка Poker21?'+(x.taker?' Заявка уже в работе. Удаление не подтверждает оплату.':''),'Удалить','danger',()=>work({action:'remove',item:x.id,clubId:requested,chatId}));
          },'remove'));
          if(x.peer){
            const contact=button('Связаться с клубом',()=>openDealDialog(x,requested,chatId),'secondary');
            if(x.unread>0){
              const badge=node('span',String(x.unread));badge.className='club-unread-count';
              contact.setAttribute('aria-label','Связаться с клубом. Непрочитанных сообщений: '+x.unread);
              contact.append(badge);
            }
            row.append(contact);
          }
          renderReceiptFeedback(row,receiptFeedback.get(x.id));
          next.append(row);
        }
        list.replaceChildren(next);
        if(!list.hidden){
          for(const [id,y] of anchors){
            const row=list.querySelector('article[data-id="'+CSS.escape(id)+'"]');
            if(row){scroller.scrollTop+=row.getBoundingClientRect().top-y;break;}
          }
        }
        tickBookings();
      }
      let loading=false;
      let version=0;
      async function refresh(force=false,balances=false){
        if(force!==true&&(loading || busy || document.hidden || !take.getClientRects().length))return;
        const stamp=++version;
        loading=true;
        try{
          const latest=await api({action:'list',clubId:requested,chatId,bookingId:ownerBooking||undefined});
          if(list.isConnected&&stamp===version){
            if(updateLimits&&latest.availability)updateLimits(latest.availability);
            const previous=lastContents;drawItems(latest);
            if(bookedCardToShow?.clubId===requested&&bookedCardToShow.chatId===chatId){
              const card=list.querySelector('article.is-in-work[data-id="'+CSS.escape(bookedCardToShow.id)+'"]');
              if(card){
                bookedCardToShow=null;
                card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({block:'start'});
              }
            }
            if(balances||(finance.hidden&&previous!==lastContents))await updateBalances();
            return latest;
          }
        }catch{
          if(stamp===version&&list.isConnected){
            list.querySelector('.requisite-refresh-error')?.remove();
            const error=node('p','Не удалось обновить список реквизитов.');
            error.className='requisite-refresh-error';
            error.append(button('Обновить',refresh));
            list.prepend(error);
          }
        }finally{if(stamp===version)loading=false;}
      }
      drawItems(registry);
      if(openRequisitesOnLaunch){
        openRequisitesOnLaunch=false;
        requestAnimationFrame(()=>requisites.scrollIntoView({block:'start'}));
      }
      if(widgetOffer && (chatId||ownerBooking)){
        const row=ownerBooking?list.querySelector('[data-booking="'+CSS.escape(ownerBooking)+'"]'):Array.from(list.querySelectorAll('article[data-id]')).find(el=>el.dataset.id===widgetOffer);
        if(row){
          widgetOffer='';
          if(!ownerBooking)list.prepend(row);
          row.prepend(node('small','Выбрано в Telegram'));
          requestAnimationFrame(()=>row.scrollIntoView({block:'center'}));
        }else list.prepend(node('p','Выбранная в Telegram заявка недоступна для этого клуба. Выберите другую заявку или смените клуб.'));
      }
      refreshVisibleList=refresh;
      tickVisibleBookings=tickBookings;
    }
    if(clubs.length)return;
    const guest=section('Свободные реквизиты',box);guest.open=true;guest.append(requisitesWarning());
    const hint=node('p','Без ключа видны банк и сумма. Чтобы увидеть номер и взять заявку, запросите ключ в Telegram у ');
    const contact=node('a','@Roman1787443');contact.href='https://t.me/Roman1787443';contact.target='_blank';contact.rel='noopener';hint.append(contact);guest.append(hint);
    const list=node('div','');guest.append(list);
    async function loadOffers(){
      list.textContent='Загружаем реквизиты…';
      try{
        const result=await api({action:'open-requisites'});
        list.replaceChildren();
        for(const item of result.items){
          const row=node('article','');row.className='requisite-preview';
          const head=node('header','');head.className='offer-head';
          head.append(node('strong',item.amount.toLocaleString('ru-RU')+(item.currency==='usd'?' $':' ₽')),node('small',item.bank||''));
          row.append(head);if(item.bookingPaused)row.append(bookingPauseBadge());list.append(row);
        }
        if(result.withdrawalError)list.append(node('p','Выводы из Депозитов временно недоступны.'));
        else if(!result.items.length)list.append(node('p','Свободных заявок пока нет.'));
      }catch{list.textContent='Не удалось загрузить реквизиты.';}
      list.append(button('Обновить',loadOffers,'secondary'));
    }
    await loadOffers();
    const entry=node('div','');entry.className='club-invite-entry';box.append(entry);
    const inviteKey=field('key','Одноразовый ключ');
    inviteKey.lastChild.placeholder='Вставьте ключ приглашения';
    inviteKey.lastChild.spellcheck=false;inviteKey.lastChild.autocapitalize='none';
    form('Вход по приглашению','activate',[inviteKey],'Активировать ключ',{},entry);
    const ownId=window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
    if(ownId){
      const account=node('small','Ваш Telegram ID');
      account.append(node('strong',String(ownId)));entry.append(account);
    }
  }
  function openDealDialog(item,clubId,chatId){
    const dialog=node('dialog','');dialog.className='placement-editor';
    dialog.setAttribute('aria-label','Диалог с клубом '+item.peer);
    const history=node('div',''),input=node('textarea',''),status=node('small','');
    input.placeholder='Сообщение клубу';input.setAttribute('aria-label',input.placeholder);input.maxLength=2000;
    history.style.cssText='max-height:44vh;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere';
    const params={item:item.id,clubId,chatId};
    let pending,version=0,signature;
    async function refresh(payload){
      const seq=++version;
      const result=await api({...params,...payload});
      if(seq!==version||!dialog.open)return;
      const next=JSON.stringify(result.messages);
      if(signature!==next){
        const follow=signature===undefined||history.scrollHeight-history.clientHeight-history.scrollTop<20;
        history.replaceChildren(...result.messages.map(m=>{
          const line=node('p','');line.append(node('strong',m.club+' · '+m.author),node('br',''),document.createTextNode(m.text));return line;
        }));
        if(!result.messages.length)history.textContent='Сообщений пока нет.';
        signature=next;if(follow)history.scrollTop=history.scrollHeight;
      }
      status.textContent='';
    }
    const send=button('Отправить',async()=>{
      const text=input.value.trim();if(!text)return;
      if(pending?.text!==text)pending={action:'message',text,requestId:crypto.randomUUID()};
      input.disabled=send.disabled=true;
      try{await refresh(pending);input.value='';pending=null;}
      catch(error){status.textContent=error.message;}
      finally{input.disabled=send.disabled=false;}
    },'primary');
    dialog.append(node('h3',item.peer),history,input,send,status,button('Закрыть',()=>dialog.close(),'secondary'));
    document.body.append(dialog);dialog.showModal();
    const read=()=>refresh({action:'dialog'}).catch(error=>{status.textContent=error.message;});
    read();const timer=setInterval(()=>{if(!send.disabled&&!document.hidden&&dialog.open)read();},5000);
    dialog.onclose=()=>{clearInterval(timer);dialog.remove();refreshList();};
  }
  async function showReceipt(item,clubId,chatId){
    const dialog=node('dialog','');dialog.className='placement-editor receipt-view';
    dialog.setAttribute('aria-label','Чек оплаты');
    const content=node('div','Загружаем чек…'),actions=node('div','');
    dialog.append(button('← Назад к заявке',()=>dialog.close(),'secondary'),actions,content);
    let url;
    dialog.onclose=()=>{if(url)URL.revokeObjectURL(url);dialog.remove();};
    document.body.append(dialog);dialog.showModal();
    try{
      const {receipt}=await api({action:'receipt',item,clubId,chatId});
      if(!dialog.open)return;
      const match=/^data:(image\/jpeg|image\/png|application\/pdf);base64,(.+)$/.exec(receipt);
      if(!match)throw Error('Формат чека не поддерживается.');
      const type=match[1],photo=type.startsWith('image/');
      const ext=photo?(type==='image/png'?'png':'jpg'):'pdf';
      const file=new File([Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0))],'receipt.'+ext,{type});
      url=URL.createObjectURL(file);
      content.replaceChildren();
      if(photo){
        const image=node('img','');image.alt='Чек оплаты';image.src=url;content.append(image);
      }else{
        const pdf=node('object','');pdf.type=type;pdf.data=url;pdf.setAttribute('aria-label','Чек PDF');
        pdf.textContent='Просмотр PDF недоступен в этом браузере. Нажмите «Сохранить PDF…» выше.';content.append(pdf);
      }
      if(!photo){
        const hint=node('small','');hint.setAttribute('role','status');
        const savePicker=typeof window.showSaveFilePicker==='function';
        const share=navigator.canShare?.({files:[file]});
        if(share)hint.textContent='В меню устройства выберите «Сохранить в Файлы» или папку для загрузки.';
        actions.append(button('Сохранить PDF…',async()=>{
          try{
            if(savePicker){
              const handle=await window.showSaveFilePicker({suggestedName:file.name,types:[{description:'PDF',accept:{'application/pdf':['.pdf']}}]});
              const writer=await handle.createWritable();await writer.write(file);await writer.close();
              hint.textContent='PDF сохранён.';
            }else if(share){
              await navigator.share({files:[file]});
            }else{
              const link=node('a','');link.href=url;link.download=file.name;link.target='_blank';link.rel='noopener';
              actions.append(link);link.click();link.remove();
              hint.textContent='Проверьте загрузки устройства. Если открылся отдельный просмотр, закройте его, чтобы вернуться к заявке.';
            }
          }catch(error){if(error.name!=='AbortError')hint.textContent='Устройство не разрешило сохранение PDF.';}
        },'primary'),hint);
        return;
      }
      const download=node('a',photo?'Скачать фото':'Скачать PDF');download.href=url;download.download=file.name;
      if(photo&&navigator.canShare?.({files:[file]})){
        const hint=node('small','В системном меню выберите сохранение изображения, если оно доступно.');
        actions.append(button('Сохранить фото…',async()=>{
          try{await navigator.share({files:[file]});}
          catch(e){if(e.name!=='AbortError')hint.textContent='Системное меню недоступно. Нажмите «Скачать фото».';}
        },'primary'),hint);
      }
      actions.append(download);
    }catch(e){if(dialog.open)content.textContent=e.message||'Не удалось открыть чек.';}
  }
  function renderReceiptFeedback(row,state){
    const hint=row.querySelector('[data-receipt-feedback]');
    if(!hint)return;
    hint.textContent=state?.text||'';
    hint.hidden=!state;
    const actions=row.querySelector('.booking-actions');
    if(actions)actions.inert=!!state?.pending;
    const send=row.querySelector('[data-receipt-send]');
    if(send&&state?.pending)send.textContent='Отправка чека…';
    else if(send&&send.dataset.originalLabel)send.textContent=send.dataset.originalLabel;
  }
  function payWithReceipt(item,clubId,chatId){
    const picker=document.createElement('input');
    picker.type='file';
    picker.accept='image/jpeg,image/png,application/pdf';
    const update=(text,pending=false)=>{
      const state={text,pending};
      receiptFeedback.set(item,state);
      const row=document.querySelector('#club-requisite-list article[data-id="'+CSS.escape(item)+'"]');
      if(row)renderReceiptFeedback(row,state);
    };
    picker.onchange=async()=>{
      const file=picker.files[0];
      if(!file||receiptFeedback.get(item)?.pending)return;
      if(file.size>2097152){update('Выберите чек до 2 МБ.');return;}
      if(busy){update('Дождитесь завершения текущего действия и выберите чек ещё раз.');return;}
      busy=true;
      try{
        update('Подготавливаем файл…',true);
        const receipt=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(reader.result);
          reader.onerror=reader.onabort=()=>reject(Error('Не удалось прочитать файл. Выберите чек ещё раз.'));
          reader.readAsDataURL(file);
        });
        update('Загружаем чек…',true);
        await api({action:'paid',item,clubId,chatId,receipt});
        update('Чек отправлен. Ждём подтверждения клуба.');
      }catch(e){
        update(e.message||'Не удалось подтвердить отправку. Обновите карточку.');
      }finally{
        try{await refreshVisibleList?.(true);}finally{busy=false;}
      }
    };
    picker.click();
  }
  let checkedWriteAccessOnEntry=false;
  async function inviteNotificationAccess(app){
    if(app?.initDataUnsafe?.user?.allows_write_to_pm)return true;
    if(!app?.requestWriteAccess||!app.isVersionAtLeast?.('6.9'))return false;
    try{return await new Promise(resolve=>app.requestWriteAccess(resolve));}
    catch{return false;}
  }
  async function work(body,originalOffer){
    if(busy)return;
    const registryAction=['resume','split','take','remove','cancel','paid','remind','recheck','reject','confirm'].includes(body.action);
    busy=true;if(!registryAction)box.inert=true;
    status.textContent=body.action==='status'?'Загружаем кабинет…':'Выполняем…';
    const issuing=['owner','staff','revoke','create-club','rename-club'].includes(body.action);
    if(issuing){issuerBody.inert=true;issuerStatus.textContent='Выполняем…';}
    try{
      const result=body.action==='status'&&!window.Telegram?.WebApp?.initData?{memberships:[]}:await api(body);
      if(body.action==='activate')checkedWriteAccessOnEntry=true;
      const writeAccess=body.action==='activate'?await inviteNotificationAccess(window.Telegram?.WebApp):null;
      if(registryAction){
        if(body.action==='take')bookedCardToShow={id:result.bookingId||body.item,clubId:body.clubId,chatId:body.chatId};
        await refreshVisibleList?.(true,body.action==='confirm');
        showNotice(body.action==='confirm'?'Сделка проведена':body.action==='recheck'?'Запрошена повторная проверка с прежним чеком.':body.action==='remind'?'Напоминание отправлено клубу.':'Готово.');
        return;
      }
      data=result.memberships?result:await api({action:'status'});
      await render(result.key,result.selectedClubId?{...body,clubId:result.selectedClubId}:body);
      if(issuing&&clubList.open)await clubList.ontoggle();
      if(body.action==='status'||result.key)status.textContent='';else showNotice(body.action==='remind'?'Напоминание отправлено клубу.':'Готово.');
      if(body.action==='status'&&data.memberships?.length&&!checkedWriteAccessOnEntry){
        checkedWriteAccessOnEntry=true;
        void inviteNotificationAccess(window.Telegram?.WebApp).then(granted=>{
          if(!granted)showNotice('Чтобы получать сообщения, откройте Poker21 Assist и нажмите «Старт».');
        });
      }
      if(body.action==='activate')showNotice(writeAccess?'Ключ активирован. Бот может писать вам в личку.':'Ключ активирован. Чтобы получать сообщения, откройте Poker21 Assist и нажмите «Старт».');
      if(issuing)issuerStatus.textContent=body.action==='rename-club'?'Название клуба сохранено.':result.selectedClubId?(result.existing?'Клуб уже есть в списке и выбран.':'Клуб создан и выбран.') :body.action==='revoke'?'Доступ отозван.':'';
    }catch(e){if(issuing)issuerStatus.textContent=e.message;status.textContent=e.message;if(registryAction){
      const latest=await refreshVisibleList?.(true);
      if(originalOffer&&e.status===409&&latest&&active===body.clubId){
        const group=originalOffer.offerGroup||originalOffer.id;
        const matches=latest.items.filter(x=>!x.mine&&!x.taker&&!x.bookingPaused&&(x.offerGroup||x.id)===group);
        if(matches.length===1&&matches[0].amount!==originalOffer.amount){
          const current=matches[0],total=Math.round(current.amount*100);
          const dialog=node('dialog','');dialog.className='placement-editor';
          dialog.setAttribute('aria-label','Сумма заявки изменилась');
          const take=cents=>work({...body,item:current.id,takeCents:cents},current);
          const all=button('Взять '+(current.amount<originalOffer.amount?'оставшиеся ':'')+rubles(total),()=>{dialog.close();take(total);},'primary');
          dialog.append(node('h3','Сумма заявки изменилась'),node('p','Сейчас доступно '+rubles(total)+'.'),all);
          if(current.minimumCents&&current.minimumCents<total)dialog.append(button('Выбрать сумму',()=>{dialog.close();chooseBookingAmount(current,false,take);},'secondary'));
          dialog.append(button('Закрыть',()=>dialog.close()));document.body.append(dialog);
          dialog.onclose=()=>dialog.remove();dialog.showModal();
        }else if(!matches.length&&!latest.withdrawalError)showNotice('Свободного остатка по этой заявке сейчас нет.');
      }
      return;
    }box.append(button('Обновить',()=>work({action:'status'})));}
    finally{busy=false;box.inert=false;issuerBody.inert=false;}
  }
  function openPanel(){if(panel.open && !data)work({action:'status'});}
  const refreshList=()=>{
    if(document.hidden)return;
    if(!finance.hidden)refreshBalances?.();
    refreshVisibleList?.();
  };
  window.setInterval(()=>tickVisibleBookings?.(),1000);
  window.setInterval(refreshList,15000);
  window.addEventListener('focus',refreshList);
  document.addEventListener('visibilitychange',refreshList);
  document.getElementById('app').addEventListener('cabinet-view',()=>requestAnimationFrame(refreshList));
  panel.addEventListener('toggle',()=>{openPanel();refreshList();});
  if(window.Telegram?.WebApp?.initData || panel.open)work({action:'status'});
})();
