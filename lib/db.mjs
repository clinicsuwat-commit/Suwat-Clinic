import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { cfg } from './config.mjs';
import { timestamp, localDateDaysFromNow } from './clock.mjs';
import { passHash } from './security.mjs';

const dbPath = path.resolve(process.cwd(), cfg.dbFile);
fs.mkdirSync(path.dirname(dbPath), {recursive:true});
export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.exec(`
CREATE TABLE IF NOT EXISTS customers (
 id INTEGER PRIMARY KEY, line_user_id TEXT UNIQUE, display_name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
 phone_verified INTEGER NOT NULL DEFAULT 0, preferred_lang TEXT NOT NULL DEFAULT 'th', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS phone_verifications (
 customer_id INTEGER PRIMARY KEY REFERENCES customers(id), phone TEXT NOT NULL, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('customer','staff')),
 principal_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS slot_rules (
 key TEXT PRIMARY KEY, label_th TEXT NOT NULL, label_en TEXT NOT NULL, start_time TEXT NOT NULL,
 end_time TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity BETWEEN 0 AND 500), active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS date_overrides (
 date TEXT NOT NULL, slot_key TEXT NOT NULL REFERENCES slot_rules(key), capacity INTEGER CHECK(capacity BETWEEN 0 AND 500),
 closed INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(date,slot_key)
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS bookings (
 id INTEGER PRIMARY KEY, booking_ref TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL REFERENCES customers(id),
 patient_name TEXT NOT NULL, patient_phone TEXT NOT NULL, date TEXT NOT NULL, slot_key TEXT NOT NULL REFERENCES slot_rules(key),
 symptoms TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('pending','confirmed','checked_in','completed','cancelled','no_show')),
 request_id TEXT UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_slot ON bookings(date, slot_key, status);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY, sku TEXT UNIQUE NOT NULL, title_th TEXT NOT NULL, title_en TEXT NOT NULL,
 desc_th TEXT NOT NULL DEFAULT '', desc_en TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 price INTEGER NOT NULL CHECK(price >= 0), image TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS inventory_lots (
 id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), lot_no TEXT NOT NULL,
 expiry_date TEXT NOT NULL, available_qty INTEGER NOT NULL CHECK(available_qty >= 0),
 UNIQUE(product_id,lot_no)
);
CREATE TABLE IF NOT EXISTS orders (
 id INTEGER PRIMARY KEY, order_ref TEXT UNIQUE NOT NULL, customer_id INTEGER NOT NULL REFERENCES customers(id),
 amount INTEGER NOT NULL, delivery_method TEXT NOT NULL CHECK(delivery_method IN ('pickup','shipping')),
 shipping_address TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK(status IN ('awaiting_payment','confirmed','packing','shipped','delivered','cancelled')),
 payment_status TEXT NOT NULL DEFAULT 'unverified' CHECK(payment_status IN ('unverified','verified','refunded')),
 tracking_no TEXT NOT NULL DEFAULT '', carrier TEXT NOT NULL DEFAULT '', request_id TEXT UNIQUE,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), product_id INTEGER NOT NULL REFERENCES products(id),
 title_th TEXT NOT NULL, title_en TEXT NOT NULL, qty INTEGER NOT NULL CHECK(qty>0), unit_price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS order_allocations (
 id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id), lot_id INTEGER NOT NULL REFERENCES inventory_lots(id),
 qty INTEGER NOT NULL CHECK(qty>0)
);
CREATE TABLE IF NOT EXISTS stock_movements (
 id INTEGER PRIMARY KEY, lot_id INTEGER NOT NULL REFERENCES inventory_lots(id), delta INTEGER NOT NULL,
 reason TEXT NOT NULL, actor TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS staff (
 id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('owner','reception','store')), salt TEXT NOT NULL, password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS tasks (
 id INTEGER PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('booking','order')),
 reference_id INTEGER NOT NULL, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new'
 CHECK(status IN ('new','acknowledged','done')), created_at TEXT NOT NULL, completed_at TEXT
);
CREATE TABLE IF NOT EXISTS task_acks (
 task_id INTEGER NOT NULL REFERENCES tasks(id), staff_id INTEGER NOT NULL REFERENCES staff(id), acknowledged_at TEXT NOT NULL,
 PRIMARY KEY(task_id, staff_id)
);
CREATE TABLE IF NOT EXISTS line_groups (
 group_id TEXT PRIMARY KEY, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY, event_type TEXT NOT NULL, destination TEXT NOT NULL, to_id TEXT NOT NULL,
 payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
 last_error TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, sent_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
 id INTEGER PRIMARY KEY, actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
`);

function seed() {
 const now = timestamp();
 if (!db.prepare('SELECT 1 FROM slot_rules LIMIT 1').get()) {
   const add = db.prepare('INSERT INTO slot_rules(key,label_th,label_en,start_time,end_time,capacity,active) VALUES(?,?,?,?,?,?,1)');
   [['morning','ช่วงเช้า','Morning','09:00','12:00',8],['afternoon','ช่วงบ่าย','Afternoon','13:00','15:00',8],['evening','ช่วงเย็น','Late afternoon','15:00','17:00',4]].forEach(s=>add.run(...s));
 }
 if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get('closed_weekdays')) db.prepare('INSERT INTO settings VALUES(?,?)').run('closed_weekdays', '[0]');
 if (!db.prepare('SELECT 1 FROM settings WHERE key=?').get('booking_mode')) db.prepare('INSERT INTO settings VALUES(?,?)').run('booking_mode', 'auto');
 if (cfg.demo && !db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
   const add = db.prepare('INSERT INTO products(sku,title_th,title_en,desc_th,desc_en,category,price,image) VALUES(?,?,?,?,?,?,?,?)');
   [
     ['SW-C','Suwat Vitamin C','Suwat Vitamin C','ผลิตภัณฑ์เสริมอาหารวิตามินซี ข้อมูลสินค้าเพื่อการสาธิต','Vitamin C dietary supplement. Sample catalog item.','vitamins',390,'c.svg'],
     ['SW-D','Suwat Vitamin D3','Suwat Vitamin D3','ผลิตภัณฑ์เสริมอาหารวิตามินดี ข้อมูลสินค้าเพื่อการสาธิต','Vitamin D3 dietary supplement. Sample catalog item.','vitamins',450,'d.svg'],
     ['SW-O','Suwat Omega','Suwat Omega','ผลิตภัณฑ์เสริมอาหารน้ำมันปลา ข้อมูลสินค้าเพื่อการสาธิต','Fish oil dietary supplement. Sample catalog item.','wellness',590,'omega.svg'],
     ['SW-B','Suwat B Complex','Suwat B Complex','ผลิตภัณฑ์เสริมอาหารวิตามินบี ข้อมูลสินค้าเพื่อการสาธิต','B-complex dietary supplement. Sample catalog item.','vitamins',420,'b.svg'],
     ['SW-P','Suwat Probiotic','Suwat Probiotic','ผลิตภัณฑ์เสริมอาหารจุลินทรีย์ ข้อมูลสินค้าเพื่อการสาธิต','Probiotic dietary supplement. Sample catalog item.','wellness',650,'pro.svg'],
     ['SW-M','Suwat Mineral Mix','Suwat Mineral Mix','ผลิตภัณฑ์เสริมอาหารแร่ธาตุ ข้อมูลสินค้าเพื่อการสาธิต','Mineral dietary supplement. Sample catalog item.','wellness',490,'mineral.svg']
   ].forEach(p=>add.run(...p));
   const addLot=db.prepare('INSERT INTO inventory_lots(product_id,lot_no,expiry_date,available_qty) VALUES(?,?,?,?)');
   db.prepare('SELECT id FROM products ORDER BY id').all().forEach((p,i)=>addLot.run(p.id,`DEMO-${i+1}`, '2028-12-31', [25,18,14,28,12,22][i]));
 }
 for (const u of [
   ['owner','Clinic Owner','owner',process.env.STAFF_OWNER_PASSWORD || (cfg.demo?'demo1234':'')],
   ['reception','Reception Staff','reception',process.env.STAFF_RECEPTION_PASSWORD || (cfg.demo?'staff1234':'')],
   ['store','Store Staff','store',process.env.STAFF_STORE_PASSWORD || (cfg.demo?'store1234':'')]
 ]) {
   if (u[3] && !db.prepare('SELECT 1 FROM staff WHERE username=?').get(u[0])) {
     const salt=randomBytes(16).toString('hex');
     db.prepare('INSERT INTO staff(username,display_name,role,salt,password_hash) VALUES(?,?,?,?,?)').run(u[0],u[1],u[2],salt,passHash(u[3],salt));
   }
 }
}
seed();
export function atomic(fn) { db.exec('BEGIN IMMEDIATE'); try {const result=fn(); db.exec('COMMIT'); return result;} catch(e) {db.exec('ROLLBACK'); throw e;} }
export function setting(key) { return db.prepare('SELECT value FROM settings WHERE key=?').get(key)?.value; }
export function audit(actor,action,target,data={}) {db.prepare('INSERT INTO audit_logs(actor,action,target,data,created_at) VALUES(?,?,?,?,?)').run(actor,action,target,JSON.stringify(data),timestamp());}
export function available(date) {
 const day = new Date(date+'T12:00:00Z').getUTCDay();
 const closed = JSON.parse(setting('closed_weekdays')||'[0]').includes(day);
 return db.prepare(`SELECT s.*, o.capacity AS override_capacity, o.closed AS override_closed,
    (SELECT COUNT(*) FROM bookings b WHERE b.date=? AND b.slot_key=s.key AND b.status IN ('pending','confirmed','checked_in')) AS used
    FROM slot_rules s LEFT JOIN date_overrides o ON o.date=? AND o.slot_key=s.key WHERE s.active=1 ORDER BY s.start_time`).all(date,date).map(s=>{
      const cap=closed || s.override_closed ? 0 : (s.override_capacity??s.capacity);
      return {key:s.key,label_th:s.label_th,label_en:s.label_en,start:s.start_time,end:s.end_time,capacity:cap,used:s.used,left:Math.max(0,cap-s.used),closed:Boolean(closed||s.override_closed)};
    });
}
export function products() {return db.prepare(`SELECT p.*, COALESCE((SELECT SUM(l.available_qty) FROM inventory_lots l WHERE l.product_id=p.id AND l.expiry_date>=?),0) as stock FROM products p WHERE p.active=1 ORDER BY p.id`).all(localDateDaysFromNow());}
export function getSession(kind, rawToken) {
 if (!rawToken) return null;
 return db.prepare(`SELECT s.principal_id, ${kind==='staff'?'u.username,u.display_name,u.role,u.active':'u.line_user_id,u.display_name,u.phone,u.phone_verified,u.preferred_lang'} FROM sessions s JOIN ${kind==='staff'?'staff':'customers'} u ON u.id=s.principal_id WHERE s.kind=? AND s.token_hash=? AND s.expires_at>?`).get(kind,hashToken(rawToken),timestamp());
}
import { hashToken } from './security.mjs';
export function createSession(kind,id,rawToken) {const expiry=new Date(Date.now()+14*86400*1000).toISOString();db.prepare('INSERT INTO sessions(token_hash,kind,principal_id,expires_at,created_at) VALUES(?,?,?,?,?)').run(hashToken(rawToken),kind,id,expiry,timestamp());}
export function deleteSession(rawToken) {if(rawToken) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(rawToken));}
