# Suwat Clinic v2 — Supabase + Vercel + LINE OA เดิม

**เวอร์ชัน:** v2.1 (No scheduled Cron for Hobby testing) — Source code สำหรับ GitHub/Vercel

โปรเจกต์นี้ย้ายออกจาก SQLite แล้ว โดยใช้ Supabase PostgreSQL ผ่าน Server-side API (Vercel Functions) พร้อม SQL สำหรับจองคิวแบบ Transaction, จองสต็อกแบบ FEFO, ระบบพนักงานรับทราบงาน, ร้านค้าและระบบแจ้งเตือน LINE OA เดิม ทั้ง UI ไทย/อังกฤษยังเหมือนเดิม

> ⚠️ **ข้อจำกัดที่ต้องรู้**: โค้ดผ่าน Automated Tests แต่ยังไม่ได้ Deploy หรือเชื่อมต่อกับฐานข้อมูล Supabase จริงของคุณจากสภาพแวดล้อมนี้ ต้องรัน SQL และตั้งค่า Environment Variables จึงทำงานได้ การจอง/สั่งซื้อต้องมี LINE Login และ SMS OTP จริง; การชำระเงินยังใช้ **ตรวจสอบด้วยพนักงาน** ไม่ใช่ Payment Gateway และยังไม่ควรใช้ข้อมูลผู้ป่วยจริงจนกว่าจะผ่านการตรวจสอบความปลอดภัย/PDPA และทดสอบใช้งานจริง

## A. อัปโหลดไฟล์ขึ้น GitHub (ทำทีละขั้น)

1. ดาวน์โหลด ZIP แล้วคลิกขวา **Extract All** เพื่อแตกไฟล์
2. เปิดโฟลเดอร์ `suwat-clinic-supabase` จะเห็น `api`, `lib`, `public`, `sql`, `package.json`, `vercel.json`, `.env.example` และ `README.md`
3. ถ้าจะใช้ Repository เดิม ให้ **ลบไฟล์เก่า** ที่ไม่ใช้แล้ว ได้แก่ `server.mjs`, `lib/db.mjs`, `lib/config.mjs`, `data/` (รวมไฟล์ `.sqlite`), และ `start.bat`/`start.sh` ก่อนวางไฟล์ใหม่ อย่าลบไฟล์ใน `public/` ใหม่ที่ให้มานี้
4. ใช้ **GitHub Desktop** เปิด Repository เดิม แล้วคัดลอก **เนื้อหาภายในโฟลเดอร์ที่แตก ZIP** ไปทับใน Repository เดิม (ไม่ใช่อัปโหลด ZIP ทั้งไฟล์)
5. ใน GitHub Desktop คลิก **Commit to main** แล้ว **Push origin**
6. ใช้ Repository แบบ **Private** และตรวจว่าไม่มีไฟล์ `.env`, Secret Key, ข้อมูลผู้ป่วย หรือ SQLite อยู่ในรายการที่จะ Commit

อีกวิธี: สร้าง GitHub Repository ใหม่แบบ Private แล้วเลือก **Add file → Upload files** จากนั้นอัปโหลดไฟล์และโฟลเดอร์ที่แตก ZIP (อัปโหลดเป็นไฟล์ ไม่ใช่ ZIP)

## B. ติดตั้งฐานข้อมูล (สำคัญที่สุด)

1. เปิด https://supabase.com/dashboard และเลือกโปรเจกต์ Suwat Clinic ที่คุณสร้างไว้
2. เปิด **SQL Editor → New query**
3. เปิดไฟล์ `sql/01_setup.sql`, คัดลอกทั้งหมดมาวาง และกด **Run**
4. ใน Table Editor จะเห็น `sw_customers`, `sw_bookings`, `sw_slot_rules`, `sw_products`, `sw_inventory_lots`, `sw_orders`, `sw_staff`, `sw_tasks`, ฯลฯ
5. ถ้าเคยสร้างตาราง `sc_*` จากไฟล์ MVP v1 ไว้ ตารางเหล่านั้นจะยังอยู่ แต่เวอร์ชัน v2 ใช้ `sw_*` เท่านั้น เพื่อไม่ลบข้อมูลเดิมโดยไม่ตั้งใจ
6. **อย่าใส่ Supabase Secret Key ใน SQL Editor**, อย่าบันทึกกุญแจลับในไฟล์ ZIP

### สร้างบัญชีเจ้าของคลินิก (Owner)

1. ใน Supabase เปิด **Authentication → Users**
2. กด **Add user** แล้วสร้างผู้ใช้ด้วย **อีเมลจริงและรหัสผ่านใหม่** (ยืนยันอีเมลตามการตั้งค่าของ Auth)
3. เปิด **SQL Editor → New query** แล้วเรียกใช้คำสั่งต่อไปนี้โดยแทนอีเมล:

```sql
insert into public.sw_staff(auth_user_id,email,display_name,role)
select id,email,'Suwat Clinic Owner','owner'
from auth.users
where email = 'YOUR-OWNER-EMAIL@example.com'
on conflict (auth_user_id) do nothing;
```

4. เข้าสู่หน้า `/staff` ของเว็บไซต์ โดยใช้อีเมลและรหัสผ่านที่สร้างใน Supabase Auth (ไม่ได้ใช้ `owner/demo1234` แบบ MVP เก่าอีกแล้ว)
5. พนักงานเพิ่มภายหลังได้ด้วยการสร้าง Auth User และเพิ่มแถวใน `sw_staff` โดยเปลี่ยน role เป็น `reception` หรือ `store`

> Owner ควรเปิด MFA สำหรับบัญชี Supabase Dashboard และไม่ใช้รหัสผ่านเดียวกับบัญชีอื่น

## C. ตั้งค่า Vercel

1. ไปที่ https://vercel.com/new แล้ว **Import** Repository `suwat-clinic`
2. **Framework Preset: Other** (ไม่ใช่ Next.js; เวอร์ชันนี้ใช้ Static HTML + Vercel Functions)
3. **Root Directory:** โฟลเดอร์รากที่มี `package.json`/`vercel.json`
4. **Output Directory:** `public` (ไฟล์ `vercel.json` ตั้งค่าให้แล้ว)
5. เข้า **Project → Settings → Environment Variables** เพิ่มค่าต่อไปนี้:

| Name | ใส่ค่าอย่างไร |
|---|---|
| `SUPABASE_URL` | `https://onoivcfoaradmefcdwls.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable Key ของโปรเจกต์ Supabase |
| `SUPABASE_SECRET_KEY` | **Secret Key ตัวใหม่หลัง Rotate** (เก็บแบบ Secret) |
| `PUBLIC_BASE_URL` | `https://โดเมนโปรเจกต์.vercel.app` |
| `CRON_SECRET` | สำหรับล็อก endpoint ส่ง LINE ซ้ำ หากยังไม่ใช้ scheduler จะเว้นว่างไว้ชั่วคราวก็ได้ |
| `LINE_LOGIN_CHANNEL_ID` | Channel ID จาก LINE Login ของ OA เดิม |
| `LINE_LIFF_ID` | LIFF ID |
| `LINE_CHANNEL_ACCESS_TOKEN` | Token ของ Messaging API Channel ของ OA เดิม |
| `LINE_CHANNEL_SECRET` | Channel Secret จาก Messaging API |
| `LINE_STAFF_GROUP_ID` | ไม่ต้องใส่ก่อนก็ได้ เลือกกลุ่มในแดชบอร์ดภายหลัง |
| `TWILIO_ACCOUNT_SID` | สำหรับเปิดใช้งาน SMS OTP จริง |
| `TWILIO_AUTH_TOKEN` | สำหรับ SMS OTP (Secret) |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify Service ID |

6. กด **Deploy** หรือ **Redeploy** หากเคย Deploy ไปแล้ว
7. เปิดเว็บ `https://โดเมนโปรเจกต์.vercel.app/api/health` หากเชื่อมต่อ Supabase และรัน SQL สำเร็จ จะได้ `{"ok":true,"database":"supabase",...}`
8. เปิดหน้า `/staff` แล้ว Login ด้วยอีเมล Owner ที่สร้างในขั้น B

**ข้อจำกัดในการใช้งานจริง:** Vercel Hobby ใช้ได้สำหรับงานส่วนบุคคลที่ไม่ใช่เชิงพาณิชย์เท่านั้น สำหรับคลินิกที่เปิดรับจองหรือขายสินค้า ต้องเลือกแพ็กเกจที่รองรับธุรกิจ เช่น Vercel Pro ก่อนเปิดใช้งานลูกค้าจริง

**คำเตือน:** Secret Key เดิมที่เคยส่งในแชตถือว่าเปิดเผยแล้ว ให้ยกเลิกและสร้างคีย์ใหม่ที่ Supabase → Settings → API Keys ก่อน Deploy และอย่าแปะคีย์ใหม่ลงใน GitHub หรือแชต

## D. เชื่อม LINE OA เดิม (ไม่ต้องสร้าง OA ใหม่)

1. เปิด https://manager.line.biz/ เลือก OA ที่คลินิกใช้อยู่ → Settings → Messaging API
2. ใช้ **Messaging API Channel เดิม** และตรวจสิทธิ์ Provider ก่อนเปลี่ยนค่าใด ๆ
3. ใน https://developers.line.biz/console/ สร้าง **LINE Login Channel ภายใต้ Provider เดียวกัน**
4. สร้าง LIFF App ภายใต้ LINE Login Channel โดยใช้ Endpoint URL `https://โดเมนโปรเจกต์.vercel.app/`
5. คัดลอก LINE Login Channel ID และ LIFF ID มาใส่ใน Vercel Environment Variables
6. ตั้ง LINE Messaging API Webhook URL เป็น `https://โดเมนโปรเจกต์.vercel.app/api/line/webhook`, กด Verify และเปิด Use webhook
7. หาก OA เดิมใช้งาน Webhook กับระบบแชตอื่นอยู่ **อย่าเปลี่ยนทันที** เพราะระบบเดิมอาจหยุดทำงาน; ต้องออกแบบรวม webhook หรือปรึกษาผู้ดูแลระบบเดิม
8. เปิด Allow bot to join group chats, เชิญ OA เข้ากลุ่มพนักงาน จากนั้นส่งข้อความหนึ่งข้อความในกลุ่มเพื่อให้ระบบตรวจพบ Group ID
9. Login Owner → `/staff` → Settings → LINE Group เพื่อเลือกกลุ่มแจ้งเตือน
10. ตั้ง Rich Menu เดิมให้เปิด `https://liff.line.me/LIFF_ID?view=booking` สำหรับจองคิว และ `?view=shop` สำหรับร้านค้า

## E. SMS OTP — ต้องมีเพื่อจองคิว/สั่งซื้อจริง

- เวอร์ชัน v2 **ไม่ให้ใช้เบอร์โทรที่ยังไม่ผ่านการยืนยันในการจองคิวหรือสั่งซื้อ**
- ตั้งค่าบริการ Twilio Verify และ Environment Variables 3 ตัว ตามตารางด้านบน
- ลูกค้าเข้าสู่ระบบผ่าน LINE และเข้า **บัญชีของฉัน → ยืนยันเบอร์โทร** ก่อนจองคิว
- หากยังไม่ได้ตั้ง Twilio หน้าเว็บ/ร้านค้าดูได้ แต่การยืนยันเบอร์และการจองจริงจะไม่ผ่าน นี่เป็นข้อจำกัดที่ตั้งใจไว้เพื่อป้องกันการแอบอ้างตัวตน

## F. การขายสินค้า

- Owner ไป `/staff` → Inventory → เพิ่มผลิตภัณฑ์ แล้วเพิ่มล็อต, วันหมดอายุ และจำนวน
- คำสั่งซื้อจะสำรองสินค้าในฐานข้อมูลทันที (FEFO) และตั้งสถานะ `awaiting_payment`
- Owner ต้องตรวจสอบยอดเงิน **จริงด้วยตนเอง** ก่อนกด `Verify payment`
- พนักงาน Store เปลี่ยนเป็น Packing → Shipped → Delivered; ถ้า Shipped ต้องกรอกบริษัทขนส่งและเลขพัสดุ
- ระบบเตรียมข้อความ LINE แจ้งลูกค้าเมื่อคำสั่งซื้อ/สถานะอัปเดต
- **ยังไม่มีระบบรับเงิน QR/Payment Gateway อัตโนมัติ** (ต่อยอดภายหลังได้)

## G. ข้อควรทดสอบก่อนเปิดใช้งานจริง

- Login LINE, เชื่อมบัญชีเดิม และ OTP SMS จริง
- 2 คนจองคิวสุดท้ายพร้อมกัน ต้องยืนยันได้เพียง 1 คน
- หลายคนซื้อสินค้าล็อตสุดท้ายพร้อมกัน ต้องไม่ตัดสต็อกติดลบ
- ลูกค้าเห็นข้อมูลเฉพาะของตน ส่วนพนักงานเห็นเฉพาะข้อมูลตามสิทธิ์
- LINE Flex Message ถึงลูกค้าและกลุ่ม LINE พนักงาน โดย **ไม่ส่งอาการผู้ป่วยในกลุ่ม**
- เวอร์ชัน v2.1 สำหรับทดสอบบน Hobby ปิด **Cron ที่ตั้งเวลา** เพื่อแก้ปัญหา Deploy: ส่ง LINE แบบทันทีเมื่อมีการจอง/ออร์เดอร์ยังทำงานผ่าน `deliver()` หากส่งไม่สำเร็จ **ไม่มีการส่งซ้ำอัตโนมัติ** จนกว่าจะเปิด Scheduler ที่รองรับ แนะนำใช้ Vercel Pro สำหรับระบบคลินิกจริง
- ตรวจ PDPA, การจัดเก็บข้อมูลสุขภาพ, ความยินยอม, retention, การสำรองข้อมูล, นโยบายคืนสินค้า, และข้อกฎหมายร้านขายผลิตภัณฑ์เสริมอาหาร

## H. รันทดสอบบนเครื่อง

1. ติดตั้ง Node.js 22+
2. คัดลอก `.env.example` เป็น `.env` แล้วใส่ค่าเชื่อมต่อจริงเฉพาะในไฟล์ `.env` (อย่านำไฟล์นี้ขึ้น GitHub)
3. เปิด Terminal ในโฟลเดอร์ แล้วรัน:

```bash
npm test
npm run dev
```

เปิด http://localhost:3000 ระบบจะใช้ Supabase จริงตามค่า `.env` — **ไม่มี Demo Account** และ **ไม่มี SQLite**

## โครงสร้างไฟล์

```text
suwat-clinic-supabase/
├─ public/                    # หน้าเว็บลูกค้าและพนักงาน ไทย/อังกฤษ
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  └─ assets/
├─ api/
│  ├─ index.mjs              # API สำหรับสมาชิก, จองคิว, ร้านค้า, พนักงาน
│  ├─ webhook.mjs            # LINE webhook verify HMAC
│  └─ cron.mjs               # Notification delivery retry
├─ lib/remote.mjs            # Supabase REST adapter + session + LINE Flex
├─ sql/01_setup.sql          # Run ใน Supabase SQL Editor
├─ scripts/setup-richmenu.mjs
├─ tests/basic.test.mjs
├─ vercel.json               # Vercel routing (ไม่มี scheduled cron ใน v2.1)
├─ package.json
├─ .env.example              # Template เท่านั้น ไม่มี Secret จริง
└─ README.md
```

### หมายเหตุด้านเทคนิค

- ตัวเวอร์ชันนี้ใช้ Vercel **Functions + Static HTML** โดยไม่ต้องติดตั้ง Next.js เพิ่ม
- ภายใน Database ใช้ตาราง `sw_*` ใหม่ ไม่แก้/ลบ `sc_*` ที่เคยสร้างจาก MVP
- PostgreSQL RPC `sw_book` ใช้ Lock ป้องกันจองคิวเกิน; `sw_checkout` ใช้ Lock และ Transaction สำหรับ FEFO stock
- Supabase Secret Key ใช้ฝั่ง API เท่านั้น, ฝั่ง Browser ไม่เรียกฐานข้อมูลโดยตรง
- Staff Login ตรวจสอบรหัสผ่านด้วย **Supabase Auth** และอนุญาตเฉพาะรายชื่อใน `sw_staff`
- ระบบแจ้ง LINE ใช้ Queue ใน `sw_notifications` และพยายามส่งทันทีเมื่อเกิดรายการ; **v2.1 ปิด schedule ของ Cron** เพื่อผ่านการ Deploy บน Hobby แบบทดสอบเท่านั้น หากส่งล้มเหลวจะค้างใน Queue จนกว่าจะกำหนด Scheduler ที่รองรับ
- ยังไม่ได้ทำ penetration test, production load test, หรือทดสอบเชื่อม Supabase/LINE จริงในบัญชีผู้ใช้
