import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'suwat-test-'));
process.env.DB_FILE=path.join(dir,'test.sqlite');
process.env.DEMO_MODE='true';
process.env.LINE_CHANNEL_ACCESS_TOKEN='';
const {server}=await import('../server.mjs');
await new Promise(res=>server.listen(0,'127.0.0.1',res));
const base=`http://127.0.0.1:${server.address().port}`;
let customerCookie='',staffCookie='';
async function api(url,data,as='none') {
 const headers={'Content-Type':'application/json'};
 if(as==='customer')headers.Cookie=customerCookie;
 if(as==='staff')headers.Cookie=staffCookie;
 const response=await fetch(base+url,{method:data===undefined?'GET':'POST',headers,body:data===undefined?undefined:JSON.stringify(data)});
 const payload=await response.json();return {response,payload};
}
test('existing LINE OA integration is not required in demo and customer browsing works',async()=>{
 const c=await api('/api/config');assert.equal(c.response.status,200);assert.equal(c.payload.demo,true);
 const products=await api('/api/products');assert.equal(products.payload.products.length,6);
 const page=await fetch(base+'/');assert.equal(page.status,200);assert.match(await page.text(),/SUWAT CLINIC/);
});
test('demo login, appointment capacity, cancellation and ownership',async()=>{
 let r=await api('/api/auth/demo',{name:'Test Demo'});assert.equal(r.response.status,200);customerCookie=r.response.headers.get('set-cookie').split(';')[0];
 r=await api('/api/staff/login',{username:'owner',password:'demo1234'});assert.equal(r.response.status,200);staffCookie=r.response.headers.get('set-cookie').split(';')[0];
 const slots=[{key:'morning',capacity:1},{key:'afternoon',capacity:0},{key:'evening',capacity:0}];
 assert.equal((await api('/api/staff/slots',{slots},'staff')).response.status,200);
 let date=new Date(Date.now()+2*86400000);while(date.getUTCDay()===0)date=new Date(date.getTime()+86400000);const day=date.toISOString().slice(0,10);
 r=await api('/api/bookings',{date:day,slot_key:'morning',patient_name:'Test Member',request_id:'capacity-test-1'},'customer');assert.equal(r.response.status,201);const bookingId=r.payload.booking.id;
 r=await api('/api/bookings',{date:day,slot_key:'morning',patient_name:'Test Member',request_id:'capacity-test-1'},'customer');assert.equal(r.response.status,201);assert.equal(r.payload.booking.id,bookingId,'idempotency should prevent duplicate booking');
 r=await api('/api/bookings',{date:day,slot_key:'morning',patient_name:'Another test',request_id:'capacity-test-2'},'customer');assert.equal(r.response.status,409);
 r=await api('/api/slots?date='+day);assert.equal(r.payload.slots.find(s=>s.key==='morning').left,0);
 r=await api('/api/bookings/'+bookingId+'/cancel',{},'customer');assert.equal(r.response.status,200);
 r=await api('/api/slots?date='+day);assert.equal(r.payload.slots.find(s=>s.key==='morning').left,1);
 r=await api('/api/staff/overview?date='+day,undefined,'staff');assert.equal(r.response.status,200);assert.ok(r.payload.tasks.some(x=>x.kind==='booking'));
 const task=r.payload.tasks.find(x=>x.kind==='booking');r=await api('/api/staff/tasks/'+task.id+'/ack',{},'staff');assert.equal(r.response.status,200);
});
test('orders reserve stock, require payment verification, update shipment',async()=>{
 let r=await api('/api/products');const product=r.payload.products[0];
 r=await api('/api/orders',{items:[{id:product.id,qty:2}],delivery_method:'shipping',shipping_address:'123 Sample Street, Bangkok 10000, Thailand',request_id:'order-test-1'},'customer');assert.equal(r.response.status,201);const order=r.payload.order;
 assert.equal(order.status,'awaiting_payment');assert.equal(order.amount,product.price*2);
 r=await api('/api/products');assert.equal(r.payload.products[0].stock,product.stock-2);
 r=await api('/api/staff/orders/'+order.id+'/status',{status:'packing'},'staff');assert.equal(r.response.status,409,'must not pack unpaid order');
 r=await api('/api/staff/orders/'+order.id+'/verify-payment',{},'staff');assert.equal(r.response.status,200);
 r=await api('/api/staff/orders/'+order.id+'/status',{status:'packing'},'staff');assert.equal(r.response.status,200);
 r=await api('/api/staff/orders/'+order.id+'/status',{status:'shipped',carrier:'Demo Logistics',tracking_no:'TEST-00001'},'staff');assert.equal(r.response.status,200);
 r=await api('/api/orders',undefined,'customer');assert.equal(r.payload.orders[0].tracking_no,'TEST-00001');
});
test('authorization checks protect staff data',async()=>{
 assert.equal((await api('/api/staff/overview')).response.status,401);
 assert.equal((await api('/api/staff/login',{username:'owner',password:'invalid'})).response.status,401);
 assert.equal((await api('/api/line/webhook',{events:[]})).response.status,503);
 const r=await api('/api/staff/overview',undefined,'staff');assert.ok(!r.payload.bookings.some(x=>Object.hasOwn(x,'symptoms')));
});
test('shutdown',async()=>{await new Promise(res=>server.close(res));fs.rmSync(dir,{recursive:true,force:true});});
