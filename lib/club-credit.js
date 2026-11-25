'use strict';
const directAccounts=new Map([['333880',['-4859067732']]]);
const key=id=>'poker21:club-cabinet:credit:'+id;
function parse(value){
  const text=String(value??'').trim().replace(',','.');
  if(!/^\d+(?:\.\d{1,2})?$/.test(text))return null;
  const [units,fraction='']=text.split('.');
  const cents=Number(units)*100+Number(fraction.padEnd(2,'0'));
  return Number.isSafeInteger(cents)?cents:null;
}
// Run inside the same Redis operation as publication. All bound groups share one ceiling.
const roomLua=`
local function clubRoom(club,limit)
  local chats,seen={},{}
  local standalone='club-'..club
  chats[standalone]=true
  local balance=tonumber(redis.call('GET','poker21:telegram-report:payment-balance:'..standalone) or '0')
  local reserved=0
  local assigned=cjson.decode('${JSON.stringify(Object.fromEntries([...directAccounts].flatMap(([id,keys])=>keys.map(chat=>[chat,id]))))}')
  for chat,id in pairs(assigned) do
    if id==club then
      chats[chat]=true
      balance=balance+tonumber(redis.call('GET','poker21:telegram-report:payment-balance:'..chat) or '0')
    end
  end
  local function visit(pattern,callback)
    local cursor='0'
    repeat
      local page=redis.call('SCAN',cursor,'MATCH',pattern,'COUNT',500)
      cursor=page[1]
      for _,k in ipairs(page[2]) do
        if not seen[k] then seen[k]=true;callback(k) end
      end
    until cursor=='0'
  end
  local prefix='poker21:telegram-report:club-chat:'
  visit(prefix..'*',function(k)
    local b=cjson.decode(redis.call('GET',k))
    if b.type=='club' and tostring(b.clubId)==club then
      local chat=string.sub(k,#prefix+1)
      if not assigned[chat] and not chats[chat] then
        chats[chat]=true
        balance=balance+tonumber(redis.call('GET','poker21:telegram-report:payment-balance:'..chat) or '0')
      end
    end
  end)
  visit('poker21:telegram-report:payment-details:*',function(k)
    if redis.call('TYPE',k).ok=='string' then
      local r=cjson.decode(redis.call('GET',k))
      if r.owner and chats[tostring(r.owner.chatId)] and (r.currency or 'rub')=='rub'
        and (r.status=='open' or r.status=='claimed' or r.status=='awaiting_receipt' or r.status=='paid') then
        reserved=reserved+r.amountCents
      end
    end
  end)
  return {balance,tonumber(limit),reserved}
end
`;
module.exports={key,parse,roomLua,directAccounts};
