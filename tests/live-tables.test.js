const test = require('node:test');
const assert = require('node:assert/strict');
process.env.TELEGRAM_BOT_TOKEN = 'test-token';
process.env.TELEGRAM_REPORT_WEBHOOK_SECRET = 'test-secret';
const handler = require('../lib/api-handlers/telegram-report-webhook');

test('tables command works in ordinary, main and public groups; excludes empty tables and sends all fields', async t => {
  const original = global.fetch;
  t.after(() => { global.fetch = original; });
  let calls = [];
  const https = require('https');
  const {EventEmitter} = require('events');
  const originalRequest = https.request;
  t.after(() => { https.request = originalRequest; });
  https.request = (options, callback) => {
    const req = new EventEmitter();
    req.end = payload => {
      calls.push(JSON.parse(payload));
      const response = new EventEmitter();
      response.statusCode = 200; response.setEncoding = () => {};
      callback(response);
      response.emit('data', JSON.stringify({ok:true})); response.emit('end');
    };
    return req;
  };
  const tables = Array.from({length: 75}, (_, i) => ({deskId: String(100000+i), deskName: 'Стол <&> '+i, playerCount: 2, unionId:'7158', leagueId:'184691', groupId:'680649', playType:'PLO6', blindAnnotation:'50/100', entryFees:0}));
  for (const playType of ['NLH', 'NLH 3-1', '6+', 'PLO4', 'PLO5', '21', 'TweneyOne', 'OFC', 'MTT', 'SNG', 'Thirteen']) tables.push({...tables[0],deskId:playType,playType});
  global.fetch = async (url, options) => {
    if (String(url).endsWith('/api/pokerplus-tables')) return {ok:true,json:async()=>({ok:true,tables:[{...tables[0],deskId:'EMPTY',playerCount:0},...tables, {...tables[0],deskId:'OTHERLEAGUE',leagueId:'152595',unionId:'8382'}, {...tables[0],deskId:'NOSCOPE',leagueId:'0',unionId:'0'}, {...tables[0],deskId:'LEAGUE111',leagueId:'111',unionId:'0'}, {...tables[0],deskId:'UNIONONLY',leagueId:'0',unionId:'999'}]})};
    assert.ok(String(url).startsWith('https://api.telegram.org/'));
    calls.push(JSON.parse(options.body));
    return {ok:true,json:async()=>({ok:true})};
  };
  for (const [id,title,text] of [[-999,'Клуб','Столы сейчас'],[-1004391487736,'Главная','/tables'],[-998,'poker21plus общий чат','столы сейчас'],[-997,'Новая группа','/tables@ReportBot']]) {
    calls=[];
    const res={status(){return this},json(body){this.body=body;return this}};
    await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':'test-secret'},body:{message:{message_id:1,text,chat:{id,title,type:'supergroup'},from:{id:42}}}},res);
    assert.equal(res.body.sent,true);
    assert.equal(res.body.liveTables,'tables');
    const buttons=calls.at(-1).reply_markup.inline_keyboard.flat();
    assert.deepEqual(buttons.slice(0,3).map(b=>b.callback_data),['tables:tournaments','tables:cash','tables:other']);
    assert.equal(calls.length,1);
  }
  async function click(data, chatId = -998) {
    calls=[];
    const result={status(){return this},json(body){this.body=body;return this}};
    await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':'test-secret'},body:{callback_query:{id:'tables-button',data,from:{id:42},message:{message_id:7,chat:{id:chatId,type:'supergroup',title:'poker21plus общий чат'}}}}},result);
    assert.equal(result.body.sent,true);
    assert.equal(calls[0].callback_query_id,'tables-button');
    return calls.filter(c=>c.text);
  }
  const menu=await click('tables:now');
  assert.equal(menu.length,1);
  assert.equal(menu[0].message_id,7);
  const unions=await click('tables:cash', -1004391487736);
  assert.equal(unions.length,1);
  assert.equal(unions[0].message_id,7);
  const unionButtons=unions[0].reply_markup.inline_keyboard.flat();
  assert.ok(unionButtons.some(b=>b.callback_data==='tables:cash:l184691:0'));
  assert.ok(unionButtons.some(b=>b.text.startsWith('Анти-Рег')));
  assert.ok(unionButtons.some(b=>b.callback_data==='tables:cash:l152595:0'));
  assert.ok(unionButtons.some(b=>b.callback_data==='tables:cash:none:0'));
  for(const [scope,id] of [['l152595','OTHERLEAGUE'],['none','NOSCOPE'],['l111','LEAGUE111'],['u999','UNIONONLY']]) {
    const page=await click(`tables:cash:${scope}:0`, -1004391487736);
    assert.equal(page.length,1);
    assert.equal(page[0].message_id,7);
    assert.ok(page[0].text.includes(`<code>${id}</code>`));
    assert.ok(!page[0].text.includes('<code>100000</code>'));
    assert.ok(page[0].reply_markup.inline_keyboard.flat().some(b=>b.callback_data===`tables:cash:${scope}:0`));
  }
  for (const chatId of [-998, -999, -1004472155269]) {
    const selection=await click('tables:cash', chatId);
    const buttons=selection[0].reply_markup.inline_keyboard.flat().map(b=>b.callback_data);
    for(const scope of ['l152595','l111','none']) {
      assert.ok(!buttons.includes(`tables:cash:${scope}:0`));
      for(const pageIndex of [0,1]) {
        const denied=await click(`tables:cash:${scope}:${pageIndex}`, chatId);
        assert.equal(denied.length,1);
        assert.equal(denied[0].message_id,7);
        assert.doesNotMatch(denied[0].text,/OTHERLEAGUE|NOSCOPE|LEAGUE111/);
      }
    }
    for(const data of ['tables:list','tables:online']) {
      const page=await click(data, chatId);
      assert.doesNotMatch(page[0].text,/OTHERLEAGUE|NOSCOPE|LEAGUE111/);
    }
  }
  for(const category of ['cash','tournaments','other']) {
    const pages=[];
    let action=category==='cash' ? 'tables:cash:l184691:0' : 'tables:'+category;
    while(action) {
      const edits=await click(action);
      assert.equal(edits.length,1,'one edit per click');
      assert.equal(edits[0].message_id,7);
      pages.push(edits[0]);
      action=edits[0].reply_markup.inline_keyboard.flat().find(b=>b.text==='Далее ▶️')?.callback_data;
      assert.ok(pages.length<50);
    }
    const combined=pages.map(c=>c.text).join('\n');
    assert.doesNotMatch(combined,/OTHERLEAGUE|NOSCOPE|LEAGUE111|UNIONONLY|EMPTY|entryFees|unionId|leagueId|groupId|7158|184691|680649/);
    assert.ok(pages.every(c=>c.message_id===7 && c.text.length<=4096));
    assert.equal(pages.at(-1).reply_markup.inline_keyboard.at(-1)[0].callback_data,'tables:now');
    for(const row of tables) {
      const expected=row.playType==='MTT' ? 'tournaments' : ['SNG','Thirteen','21','TweneyOne','OFC'].includes(row.playType) ? 'other' : 'cash';
      assert.equal(combined.includes(`<code>${row.deskId}</code>`),expected===category && category!=='tournaments',row.playType);
    }
    if(category==='tournaments') assert.doesNotMatch(combined,/Столов с игроками|Занято мест|Один игрок|По видам игр/);
    else assert.match(combined,/Столов с игроками/);
    if(category==='cash') {
      assert.ok(pages.length>1);
      for(const value of ['Холдем','Омаха','Стол &lt;&amp;&gt;','Игроков: 2','PLO6','50/100']) assert.ok(combined.includes(value),value);
    }
  }
});
