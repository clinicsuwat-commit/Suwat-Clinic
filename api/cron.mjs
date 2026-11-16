// Vercel Cron. CRON_SECRET required even during test; retries LINE notifications.
import {cfg,reply,errorReply,fail,flush} from '../lib/remote.mjs';
export default async function handler(req,res){
 try{
  if(req.method!=='GET')throw fail(405,'Method not allowed');
  if(!cfg.cronSecret||req.headers.authorization!=='Bearer '+cfg.cronSecret)throw fail(401,'Unauthorized');
  const result=await flush(12);return reply(res,200,{ok:true,...result});
 }catch(e){return errorReply(res,e);}
}
