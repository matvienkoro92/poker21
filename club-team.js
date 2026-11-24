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
