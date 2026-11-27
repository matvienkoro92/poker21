'use strict';
function pauseEnd(now=Date.now()){
  const end=new Date(now);
  end.setUTCHours(3,0,0,0);
  if(now>=end.getTime())end.setUTCDate(end.getUTCDate()+1);
  return end.getTime();
}
module.exports=function houseBookingPaused(now=Date.now(),resumeUntil=0){
  const hour=(new Date(now).getUTCHours()+3)%24;
  return hour>=2&&hour<6&&resumeUntil!==pauseEnd(now);
};
module.exports.pauseEnd=pauseEnd;
