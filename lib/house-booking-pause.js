'use strict';
module.exports=function houseBookingPaused(now=Date.now()){
  const moscowHour=(new Date(now).getUTCHours()+3)%24;
  return moscowHour>=2 && moscowHour<6;
};
