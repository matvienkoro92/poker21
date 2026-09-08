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
    if (String(url).endsWith('/api/pokerplus-tables')) return {ok:true,json:async()=>({ok:true,tables:[{...tables[0],deskId:'EMPTY',playerCount:0},...tables]})};
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
    assert.deepEqual(buttons.slice(0,2).map(b=>b.callback_data),['tables:tournaments','tables:cash']);
    assert.equal(calls.length,1);
  }
  async function click(data) {
    calls=[];
    const result={status(){return this},json(body){this.body=body;return this}};
    await handler({method:'POST',headers:{'x-telegram-bot-api-secret-token':'test-secret'},body:{callback_query:{id:'tables-button',data,from:{id:42},message:{message_id:7,chat:{id:-998,type:'supergroup',title:'poker21plus общий чат'}}}}},result);
    assert.equal(result.body.sent,true);
    assert.equal(calls[0].callback_query_id,'tables-button');
    return calls.filter(c=>c.text);
  }
  const menu=await click('tables:now');
  assert.equal(menu.length,1);
  assert.equal(menu[0].message_id,7);
  for(const category of ['cash','tournaments']) {
    const pages=await click('tables:'+category);
    const combined=pages.map(c=>c.text).join('\n');
    assert.doesNotMatch(combined,/EMPTY/);
    assert.ok(pages.every(c=>!c.message_id && c.text.length<=4096));
    assert.equal(pages.at(-1).reply_markup.inline_keyboard[0][0].callback_data,'tables:now');
    for(const row of tables) {
      const tournament=['MTT','SNG','Thirteen'].includes(row.playType);
      assert.equal(combined.includes(`<code>${row.deskId}</code>`),tournament===(category==='tournaments'),row.playType);
    }
    if(category==='cash') {
      assert.ok(pages.length>1);
      for(const value of ['Холдем','Омаха','Двадцать одно','Китайский покер','Стол &lt;&amp;&gt;','Игроков: 2','PLO6','50/100','entryFees: 0','7158','184691','680649']) assert.ok(combined.includes(value),value);
    }
  }
});
