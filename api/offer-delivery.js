const {QueueClient}=require('@vercel/queue');
const {pipeline}=require('../lib/redis');
const {deliver}=require('../lib/offer-delivery');
const {sendTelegram}=require('../lib/financial-outbox');
const call=async commands=>(await pipeline(commands,{throwOnError:true,context:'offer-delivery'})).map(row=>{
  if(row.error)throw Error('Offer storage unavailable');
  return row.result;
});
module.exports=new QueueClient().handleNodeCallback(
  task=>deliver(task,call,sendTelegram),
  {retry:(error,meta)=>({afterSeconds:Math.max(Number(error.retryAfter)||0,Math.min(900,5*2**Math.min(meta.deliveryCount||1,8)))})}
);
