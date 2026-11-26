'use strict';
const day=86400000, offset=3*3600000;
function weeklyReport(items,date,clubIds){
  const midnight=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(midnight)||new Date(midnight).toISOString().slice(0,10)!==date)throw Object.assign(Error('Выберите дату.'),{status:400});
  const monday=midnight-((new Date(midnight).getUTCDay()+6)%7)*day;
  const iso=t=>new Date(t).toISOString().slice(0,10);
  return [monday,monday-7*day].map(start=>{
    const totals={},rows=[];
    for(const item of items){
      if(item.status!=='confirmed'||![item.owner,item.payer].some(p=>p&&p.type!=='union'&&(!clubIds||clubIds.has(String(p.id)))))continue;
      const at=Date.parse(item.confirmedAt);
      if(!(at>=start-offset&&at<start+7*day-offset))continue;
      const currency=item.currency==='usd'?'USD':'RUB';
      const total=totals[currency] ||= {debit:0,credit:0,fee:0,unknown:0,mismatch:0};
      const op=item.balanceOperation, row={id:item.id,at:item.confirmedAt,owner:item.owner?.name,payer:item.payer?.name,currency,amount:item.amountCents};
      if(op&&[op.ownerDeltaCents,op.payerDeltaCents,op.feeCents,op.ownerFeeCents??op.feeCents].every(Number.isSafeInteger)){
        row.debit=-op.ownerDeltaCents;row.credit=op.payerDeltaCents;row.fee=op.feeCents+(op.ownerFeeCents??op.feeCents);
        row.diff=row.debit-row.credit-row.fee;
        total.debit+=row.debit;total.credit+=row.credit;total.fee+=row.fee;
        if(row.diff!==0)total.mismatch++;
      }else total.unknown++;
      rows.push(row);
    }
    rows.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at));
    return {from:iso(start),to:iso(start+6*day),rows,totals};
  });
}
module.exports={weeklyReport};
