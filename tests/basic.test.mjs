import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {Readable} from 'node:stream';
process.env.NODE_ENV='test';
process.env.LINE_CHANNEL_SECRET='test-line-hmac-secret-only';
const {default:handler}=await import('../api/index.mjs');
const {default:webhook}=await import('../api/webhook.mjs');
const {default:cron}=await import('../api/cron.mjs');
const {isDate,validPhone}=await import('../lib/remote.mjs');
function mockRes(){let body='';return {status:null,headers:null,headersSent:false,writeHead(status,h){this.status=status;this.headers=h;this.headersSent=true;},end(d=''){body+=d;this.body=body;}};}
async function invoke(fn,method,url,body,headers={}){const stream=Readable.from(body===undefined?[]:[Buffer.from(body)]);stream.method=method;stream.url=url;stream.headers={host:'localhost:3000',...headers};const res=mockRes();await fn(stream,res);return res;}

test('public config returns no secrets and demo mode disabled',async()=>{
 const r=await invoke(handler,'GET','/api/config');assert.equal(r.status,200);const json=JSON.parse(r.body);assert.equal(json.demo,false);assert.equal(Object.hasOwn(json,'secretKey'),false);
 const viaRewrite=await invoke(handler,'GET','/api/index?route=config');assert.equal(viaRewrite.status,200);
});
test('unauthenticated booking and staff routes reject',async()=>{
 const r=await invoke(handler,'POST','/api/bookings',JSON.stringify({date:'2026-11-20'}),{'Content-Type':'application/json'});assert.equal(r.status,401);
 const staff=await invoke(handler,'GET','/api/staff/overview');assert.equal(staff.status,401);
});
test('LINE webhook requires verified signature',async()=>{
 const r=await invoke(webhook,'POST','/api/line/webhook','{"events":[]}',{'x-line-signature':'wrong'});assert.equal(r.status,401);
});
test('cron cannot be triggered without private auth',async()=>{
 const r=await invoke(cron,'GET','/api/cron/notifications');assert.equal(r.status,401);
});
test('date, phone validation and bilingual UI routes',()=>{
 assert.equal(isDate('2026-11-16'),true);assert.equal(isDate('2026-02-30'),false);
 assert.equal(validPhone('0812345678'),true);assert.equal(validPhone('12345'),false);
 const js=fs.readFileSync(path.resolve('public/app.js'),'utf8');assert.match(js,/requestedView/);assert.match(js,/const dictionary=/);assert.match(js,/lang=localStorage/);
});
test('Supabase SQL contains transaction routines and RLS',()=>{
 const sql=fs.readFileSync(path.resolve('sql/01_setup.sql'),'utf8');
 for(const name of ['sw_book','sw_checkout','sw_claim_notifications','sw_restock','sw_ack_task'])assert.ok(sql.includes('function public.'+name+'('));
 assert.match(sql,/enable row level security/);assert.match(sql,/for update/);
});
test('repository ships no SQLite or local secrets',()=>{
 const files=fs.readdirSync('.');assert.equal(files.includes('server.mjs'),false);assert.equal(files.includes('.env'),false);
 assert.equal(files.includes('data'),false);
 assert.equal(files.includes('vercel.json'),true);
});

test('v2.2 no-SMS phone entry requires LINE-authenticated session',async()=>{
 const p=await invoke(handler,'POST','/api/me/phone',JSON.stringify({phone:'0812345678'}),{'Content-Type':'application/json'});
 assert.equal(p.status,401);
 const otp=await invoke(handler,'POST','/api/otp/start',JSON.stringify({phone:'0812345678'}),{'Content-Type':'application/json'});
 assert.equal(otp.status,410);
 const code=fs.readFileSync(path.resolve('api/index.mjs'),'utf8');
 assert.match(code,/phone_verified:verified/);
 assert.match(code,/Add your phone number in My Account/);
 assert.doesNotMatch(code,/verify\.twilio\.com/);
});
test('v2.2 keeps staff approval and no-OTP account UI',()=>{
 const app=fs.readFileSync(path.resolve('public/app.js'),'utf8');
 const setup=fs.readFileSync(path.resolve('sql/01_setup.sql'),'utf8');
 const migration=fs.readFileSync(path.resolve('sql/02_line_phone_no_otp.sql'),'utf8');
 assert.match(app,/data-form="phone-save"/);
 assert.doesNotMatch(app,/data-form="otp-start"/);
 assert.match(setup,/case when m='manual' or not c\.phone_verified then 'pending'/);
 assert.match(migration,/case when m='manual' or not c\.phone_verified then 'pending'/);
 assert.match(migration,/on conflict\(key\) do update set value=excluded\.value/);
 assert.doesNotMatch(migration,/drop table/i);
});
