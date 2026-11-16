// Verified LINE webhook for the EXISTING LINE Official Account.
import {createHmac,timingSafeEqual} from 'node:crypto';
import {cfg,reply,errorReply,fail,upsert,iso} from '../lib/remote.mjs';

export default async function handler(req,res){
 try{
  if(req.method!=='POST')throw fail(405,'Method not allowed');
  if(!cfg.lineSecret)throw fail(503,'LINE_CHANNEL_SECRET not configured');
  // IMPORTANT: never access req.body before consuming raw stream; HMAC is over exact raw bytes.
  const parts=[];let total=0;
  for await (const part of req){total+=part.length;if(total>100000)throw fail(413,'Webhook too large');parts.push(part);}
  const raw=Buffer.concat(parts);
  const expected=createHmac('sha256',cfg.lineSecret).update(raw).digest('base64');
  const a=Buffer.from(expected),b=Buffer.from(String(req.headers['x-line-signature']||''));
  if(a.length!==b.length||!timingSafeEqual(a,b))throw fail(401,'Invalid LINE signature');
  let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{throw fail(400,'Invalid JSON');}
  for(const event of payload.events||[]){
   if(event?.source?.type==='group'&&typeof event.source.groupId==='string'&&event.source.groupId.length<200){
    const groupId=event.source.groupId;
    await upsert('sw_line_groups',{group_id:groupId,last_seen:iso()},'group_id');
   }
  }
  return reply(res,200,{ok:true});
 }catch(e){return errorReply(res,e);}
}
