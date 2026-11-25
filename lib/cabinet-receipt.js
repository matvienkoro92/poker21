'use strict';
module.exports=function validReceipt(value){
  if(typeof value!=='string'||value.length>2800000)return false;
  const match=/^data:(image\/jpeg|image\/png|application\/pdf);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if(!match)return false;
  const bytes=Buffer.from(match[2],'base64');
  const signatures={'image/jpeg':'ffd8ff','image/png':'89504e470d0a1a0a','application/pdf':'255044462d'};
  return bytes.length<=2097152 && bytes.toString('base64')===match[2] && bytes.subarray(0,8).toString('hex').startsWith(signatures[match[1]]);
};
