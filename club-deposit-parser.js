/* Shared deterministic parser: extracted values are always reviewed before saving. */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.pokerDepositParser = factory();
})(typeof window !== 'undefined' ? window : this, function() {
  'use strict';
  function money(value) {
    var text = String(value == null ? '' : value).replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
    var multiplier=/[кk]$/i.test(text)?1000:1;text=text.replace(/[кk]$/i,'');
    if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return null;
    var parts = text.split('.');
    var amount = (Number(parts[0]) * 100 + Number((parts[1] || '').padEnd(2, '0')))*multiplier;
    return Number.isSafeInteger(amount) && amount > 0 && amount <= 10000000000 ? amount : null;
  }
  function normalizePhone(value) {
    var raw=String(value==null?'':value).trim();
    if(!raw)return '';
    if(!/^\+?[\d\s().\-–—]+$/.test(raw))return '';
    var digits=raw.replace(/\D/g,'');
    if(digits.length===10&&digits[0]==='9'&&raw[0]!=='+')return '+7'+digits;
    return /^[78]\d{10}$/.test(digits)?'+7'+digits.slice(1):'';
  }
  function phoneError(value) {
    var raw=String(value==null?'':value).trim();
    if(!raw||normalizePhone(raw))return '';
    if(!/^\+?[\d\s().\-–—]+$/.test(raw))return 'В телефоне допустимы цифры, +, пробелы, скобки и дефисы.';
    var digits=raw.replace(/\D/g,''),expected=digits[0]==='9'?10:11;
    if(digits.length!==expected)return 'В телефоне '+digits.length+' цифр, нужно '+expected+'. Пример: +7 (999) 123-45-67.';
    return 'Начните номер с +7, 7, 8 или введите 10 цифр с 9.';
  }
  function walletError(value){var wallet=String(value||'').trim();if(!wallet)return 'Укажите USDT-кошелёк.';if(wallet.length<34)return 'Не хватает '+(34-wallet.length)+' символов. USDT-кошелёк TRC20: получено '+wallet.length+', нужно 34.';if(wallet.length>34)return 'USDT-кошелёк TRC20: лишние символы, получено '+wallet.length+', нужно 34.';if(!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(wallet))return 'USDT-кошелёк TRC20 содержит недопустимые символы. Проверьте адрес у игрока.';return '';}
  function safeLink(value) {
    try { var u = new URL(String(value || '').trim()); return u.protocol === 'https:' ? u.href : ''; } catch(e) { return ''; }
  }
  function looksLikeRecipient(name){return !/^(?:спасибо|благодарю|пожалуйста|добрый|доброе|доброй|здравствуйте|привет|извините|банк|перевод|вывод)(?:[\s,!]|$)/i.test(name);}
  function parse(raw) {
    var rawText=String(raw||'').trim().slice(0,5000);
    var text=rawText.replace(/\r\n?/g,'\n').replace(/[\u00a0\u202f\t]/g,' ').replace(/[‐‑‒–—]/g,'-'),warnings=[];
    var clubRooms={'758417':'P21','1786376':'X','19645':'Supr','1004444':'PP'};
    var clubPattern=/(?:(?:айди|ID)[ \t]*(?:клуба|клуб|club)|(?:клуба?|club)[ \t]*(?:(?:айди|ID))?)[ \t]*[:#№—-]?[ \t]*(\d+)(?!\d)|(\d+)[ \t]+(?:айди|ID)[ \t]+(?:клуба|club)/gi;
    var clubIds=[],playerText=text.replace(clubPattern,function(all,after,before){clubIds.push(after||before);return ' ';});
    if(clubRooms[text.trim()]){clubIds.push(text.trim());playerText='';}
    var knownClubPattern=/(?<![a-zA-Zа-яА-ЯёЁ0-9])(758417|1786376|19645|1004444)(?![a-zA-Zа-яА-ЯёЁ0-9])/g;
    playerText=playerText.replace(knownClubPattern,function(all,id){clubIds.push(id);return ' [клуб] ';});
    var roomMatch=text.match(/(?:^|[\s,:;])(P21|Покер[ -]*21|Poker[ -]*21|X(?:[ -]?poker)?|Х[ -]?покер|Supr(?:ema)?|Супрема|PP(?:poker)?|ПП[ -]?покер)(?=\s|[,;.]|$)/i);
    var room=roomMatch?(/^(?:p21|покер21|poker21)$/i.test(roomMatch[1].replace(/[\s-]/g,''))?'P21':/^(?:x|xpoker|хпокер)$/i.test(roomMatch[1].replace(/[\s-]/g,''))?'X':/^(?:supr|suprema|супрема)$/i.test(roomMatch[1])?'Supr':'PP'):'';
    var identified=Array.from(new Set(clubIds.map(function(id){return clubRooms[id];}).filter(Boolean).concat(room?[room]:[])));
    if(identified.length>1){room='';warnings.push('Название рума и ID клуба не совпадают. Выберите рум вручную.');}else if(identified.length===1)room=identified[0];
    var idBefore=playerText.match(/(?<![a-zA-Zа-яА-ЯёЁ0-9])(\d{1,64})[ \t]+(?:айди|ID)(?=[ \t]*(?:\n|$|[,;]|USDT\b))/i);
    var idMatch=playerText.match(/(?:\bID|айди|ид игрока|мой(?:[ \t]+(?:айди|ID))?)[ \t]*[:#—-]?[ \t]*([a-zA-Z0-9_-]{1,64})/i);
    var playerId=idBefore?idBefore[1]:idMatch&&!/^(?:USDT|TRON|TRC20)$/i.test(idMatch[1])?idMatch[1]:'';
    if(!playerId){var afterClub=text.match(/(?<![a-zA-Zа-яА-ЯёЁ0-9])(?:758417|1786376|19645|1004444)[ ,;\n]+(\d{6,10})(?!\d)/);if(afterClub&&Number(afterClub[1])>100000&&!/^(?:7|8)\d{10}$/.test(afterClub[1])&&!clubRooms[afterClub[1]])playerId=afterClub[1];}
    if(!playerId){var beforeClub=text.match(/(?<![a-zA-Zа-яА-ЯёЁ0-9])(\d{6,10})[ ,;\n]+(?:758417|1786376|19645|1004444)(?!\d)/);if(beforeClub&&Number(beforeClub[1])>100000&&!clubRooms[beforeClub[1]]&&!/^(?:7|8)\d{10}$/.test(beforeClub[1]))playerId=beforeClub[1];}
    if(!playerId){var fromId=playerText.match(/(?:^|[\s!.,;])с[ \t]+(\d{2,10})[ \t]+на(?=\s)/i);if(fromId&&!clubRooms[fromId[1]])playerId=fromId[1];}
    var network=/(?:TRC|ТРЦ|ТРС)[ -]?20|\bTron\b|Трон/i.test(text)?'TRC20':'';
    var walletMatch=text.match(/(?:^|[\s:])(T[a-zA-Z0-9]{24,49})(?=[\s,;.]|$)/);
    var wallet=walletMatch?walletMatch[1]:'';
    var paymentType=/\bUSDT\b|юсдт|усдт/i.test(text)||network||wallet?'usdt':'bank';
    var links = text.match(/https:\/\/[^\s<>]+/gi) || [];
    var paymentLink = safeLink((links[0] || '').replace(/[),.;]+$/, ''));
    var cleaned = text.replace(/https?:\/\/\S+/g, '').replace(wallet,'').replace(knownClubPattern,' [клуб] ');
    if(playerId)cleaned=cleaned.replace(new RegExp('(?<![a-zA-Z0-9])'+playerId+'(?![a-zA-Z0-9])','g'),' [игрок] ');
    // A card is one PAN or conventional four-digit groups, never a chain of IDs.
    var cards=cleaned.match(/(?<![a-zA-Z0-9])(?:\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{4}(?:[ -]\d{1,3})?|\d{4}[ -]\d{4}[ -]\d{4}[ -]\d{5,7}|\d{16,19})(?![a-zA-Z0-9])/g)||[];
    cards = cards.filter(function(v){var groups=v.trim().split(/[ -]+/);return groups.length===1||!groups.some(function(g){return /^(?:7|8)\d{10}$/.test(g);});});
    cards = cards.map(function(v) { return v.replace(/\D/g, ''); }).filter(function(v) { return v.length >= 16 && v.length <= 19; });
    var card = cards[0] || '';
    var noCards = cleaned; cards.forEach(function(v) { noCards = noCards.replace(new RegExp(v.split('').join('[ -]?')), ''); });
    var phones = noCards.match(/(?<!\d)(?:\+?7|8)[ (.-]*\d{3}[ ).-]*\d{3}[ .-]*\d{2}[ .-]*\d{2}(?!\d)/g) || [];
    var phone = phones[0] ? '+7' + phones[0].replace(/\D/g, '').slice(1) : '';
    if(!playerId&&!card&&phones.length===1){var pair=playerText.match(/(?<![a-zA-Zа-яА-ЯёЁ0-9])(\d{6,10})[ \t]+((?:\+?7|8)[ (.-]*\d{3}[ ).-]*\d{3}[ .-]*\d{2}[ .-]*\d{2})(?!\d)/);if(pair)playerId=pair[1];}
    var bankMatch = cleaned.match(/(?:банк\s*[:—-]\s*)([^\n,;]+)/i);
    var knownBanks = cleaned.match(/(?:ЮMoney|Ю[ -]?мани|YooMoney|Ингосстрахбанк|Инго(?:банк)?|Т[ -]?Банк|Тинькофф|Сбербанк|Сбер|Альфа[ -]?(?:Банк)?|ВТБ|Газпромбанк|Райффайзен(?:банк)?|Озон[ -]?Банк|Ozon[ -]?Банк|Яндекс[ -]?Банк|Совкомбанк|Россельхозбанк|ПСБ|МТС[ -]?Банк|Банк\s+Санкт[ -]Петербург)/gi);
    knownBanks=knownBanks||[];
    var known=knownBanks.length?[knownBanks[0]]:null;
    var bank=knownBanks.length?Array.from(new Map(knownBanks.map(function(b){return [b.toLowerCase().replace(/[ -]/g,''),b];})).values()).join(' / '):bankMatch?bankMatch[1].trim():'';
    if(!phones.length&&known){
      var shortPhone=noCards.match(/(?<!\d)(9\d{9})(?!\d)/);
      if(shortPhone&&shortPhone.index>noCards.toLowerCase().indexOf(known[0].toLowerCase())){phones.push(shortPhone[1]);phone='+7'+shortPhone[1];}
    }
    var nameMatch = cleaned.match(/(?:получатель|фио|владелец|имя)\s*[:—-]\s*([^\n,;]+)/i);
    var recipient = nameMatch ? nameMatch[1].trim() : '';
    if (!recipient) {
      var lines = cleaned.split(/\n/).map(function(s) { return s.trim(); });
      recipient = lines.find(function(line) { return /^(?:[А-ЯЁ][а-яё]+\s+){1,2}(?:[А-ЯЁ][а-яё]+|[А-ЯЁ]\.?)$/.test(line) && line !== bank && looksLikeRecipient(line); }) || '';
    }
    if (!recipient && phones.length===1) {
      var afterPhone=cleaned.slice(cleaned.indexOf(phones[0])+phones[0].length).trim();
      if(known&&afterPhone.indexOf(known[0])===0)afterPhone=afterPhone.slice(known[0].length).trim();
      var trailingName=afterPhone.match(/^([А-ЯЁ][а-яёА-ЯЁ]+(?:[ \t]+(?:[А-ЯЁ][а-яёА-ЯЁ]+|[А-ЯЁ]\.?)){0,2})[ \t]*[.,;]?(?:\n|$)/);
      if(trailingName&&looksLikeRecipient(trailingName[1]))recipient=trailingName[1];
    }
    if (!recipient && known) {
      var nameText=cleaned; phones.forEach(function(v){nameText=nameText.replace(v,'');});
      nameText=nameText.replace(known[0],'');
      recipient=nameText.split(/\n/).map(function(line){return line.trim().replace(/^[,;:—-]+\s*|[,;]+$/g,'');}).find(function(line){return /^(?:[А-ЯЁ][а-яё]+\s+){1,2}(?:[А-ЯЁ][а-яё]+|[А-ЯЁ]\.?)$/.test(line)&&looksLikeRecipient(line);})||'';
    }
    var amounts = [], re = /(?:сумма|выведите|выведи|вывести|вывод|выплатите|выплатить|к выплате|остаток)[ ,\t]*(?:(?:пожалуйста|плиз|нужен|нужно|надо)[ ,\t]*)*[:—=-]?\s*((?:\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,]\d{1,2})?[ \t]*[кk]?)(?!\d|[.,]\d)(?:\s*(?:₽|руб\.?|р\.?))?/gi, match;
    while ((match = re.exec(cleaned))) {
      var amountText=match[1];
      // A separated Cyrillic «к» before «с <room>» is message prose, not thousands.
      if(/[ \t]+к$/i.test(amountText)&&/^[ \t]+с(?:о)?[ \t]+(?:Х[ -]?покер|X(?:[ -]?poker)?|P21|Покер[ -]*21|Poker[ -]*21|Supr(?:ema)?|Супрема|PP(?:poker)?|ПП[ -]?покер)(?=\s|[,;.]|$)/i.test(cleaned.slice(match.index+match[0].length)))amountText=amountText.replace(/[ \t]+к$/i,'');
      var n = money(amountText); if (n) amounts.push(n);
    }
    if (!amounts.length) {
      re = /(?<![\d.,])((?:\d{1,3}(?:[ ]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(?:₽|руб\.?|р\.?)(?![а-яё])/gi;
      while ((match = re.exec(noCards.replace(/(?:\+?7|8)[ (.-]*\d{3}[ ).-]*\d{3}[ .-]*\d{2}[ .-]*\d{2}/g, ' ')))) { var m = money(match[1]); if (m) amounts.push(m); }
    }
    if(!amounts.length){
      re=/^[ \t]*((?:\d{1,3}(?: \d{3})+|\d+)(?:[.,]\d{1,2})?[ \t]*[кk])[ \t]*[.!]?[ \t]*$/gim;
      while((match=re.exec(cleaned))){var compactAmount=money(match[1]);if(compactAmount)amounts.push(compactAmount);}
    }
    if(!amounts.length){
      var leading=text.match(/^[ \t]*((?:\d{1,3}(?: \d{3})+|\d{1,8})(?:[.,]\d{1,2})?[кk]?)[ \t]*(?:[,;\n]|$)/i);
      if(leading&&!clubRooms[leading[1]]&&leading[1]!==playerId&&/(?:клуб|банк)/i.test(text.slice(leading[0].length))){var leadingAmount=money(leading[1]);if(leadingAmount)amounts.push(leadingAmount);}
    }
    amounts = Array.from(new Set(amounts));
    if(!playerId&&amounts.length===1){
      var unassigned=noCards;phones.forEach(function(p){unassigned=unassigned.replace(p,' [телефон] ');});
      var candidates=Array.from(new Set((unassigned.match(/(?<![a-zA-Zа-яА-ЯёЁ0-9])\d{6,10}(?![a-zA-Zа-яА-ЯёЁ0-9])/g)||[]).filter(function(id){return Number(id)>100000&&!clubRooms[id]&&money(id)!==amounts[0];})));
      if(candidates.length===1)playerId=candidates[0];
      else if(candidates.length>1)warnings.push('В сообщении несколько возможных ID игрока. Укажите нужный ID вручную.');
    }
    if (cards.length > 1 || phones.length > 1) warnings.push('В тексте несколько реквизитов. Проверьте выбранный номер.');
    if (amounts.length > 1) warnings.push('Найдено несколько сумм. Укажите нужную сумму к выплате.');
    if(paymentType==='usdt'&&walletError(wallet))warnings.push(walletError(wallet));
    if (paymentType==='usdt'&&!network) warnings.push('Укажите сеть USDT.');
    if (paymentType!=='usdt' && !card && !phone && !paymentLink) warnings.push('Номер или ссылка не распознаны. Заполните реквизит вручную.');
    if (amounts.length === 0) warnings.push('Укажите сумму к выплате — она не распознана.');
    if (paymentType!=='usdt'&&!bank) warnings.push('Проверьте банк — он не распознан.');
    return {paymentType:paymentType,wallet:wallet,network:network,card:card, phone:phone, bank:bank, recipient:recipient, room:room, playerId:playerId, paymentLink:paymentLink,
      amount:amounts.length === 1 ? amounts[0] : null, rawText:rawText, warnings:warnings};
  }
  return {parse:parse, money:money, safeLink:safeLink,walletError:walletError,normalizePhone:normalizePhone,phoneError:phoneError};
});
