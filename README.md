# Suwat Clinic — bilingual booking + store + staff MVP

**Version:** 0.1.0 · **Languages:** ไทย / English · **Existing LINE OA:** yes, reuse it.

A runnable, dependency-free Node 22+ prototype for customers, reception, store staff, and clinic owners. It includes real SQLite transactions for booking capacities and inventory allocation, a responsive interface, LINE LIFF authentication endpoints, the LINE Messaging API notification outbox, Twilio Verify integration hooks, and an optional Rich Menu image + setup script.

## Start locally (Windows 11 or macOS/Linux)

1. Install **Node.js 22 or newer** (Node 22 contains built-in `node:sqlite`).
2. Extract the ZIP, open the `suwat-clinic` folder.
3. Double-click **`start.bat`** on Windows or run `bash start.sh` on macOS/Linux.
4. Open **http://localhost:3000**.

The app runs in **local demo mode** by default, with six **sample products**, sample staff, and database `data/suwat-clinic.sqlite`. Local customer login is through **Try demo account**; no real LINE message, SMS, or payment will be sent unless you add the credentials and disable demo mode appropriately.

Demo staff credentials (local demo only):

| Role | Username | Password |
| --- | --- | --- |
| Owner | `owner` | `demo1234` |
| Reception | `reception` | `staff1234` |
| Store | `store` | `store1234` |

**DO NOT use these demo passwords or `DEMO_MODE=true` on a public website.** The database and credentials in demo mode are not meant to store real customer, patient, or payment information.

### Pages

- `/` — customer home; Thai/English switch
- `/booking` — 3-step booking, daily capacities, notes, date override
- `/shop` — sample supplement product cards, basket, manual-payment order request
- `/appointments` — appointment history and cancellation
- `/orders` — order history and shipment tracking number
- `/account` — customer profile, phone verification when configured
- `/staff` — staff login, task acknowledgments, management dashboard, booking and fulfillment status, stock lot creation, booking capacities

## Reuse the **existing LINE Official Account**

**Do not create a new LINE OA.** Enable Messaging API on the **existing** LINE Official Account using https://manager.line.biz/ (Settings > Messaging API). In https://developers.line.biz/console/ find the Messaging API channel that was created for the existing OA. Add a LINE Login channel in the **same Provider** if one does not yet exist. LINE Provider selection is effectively permanent, so verify the correct owner/Provider before creating anything.

1. In LINE Developers, configure LINE Login + LIFF for this website. LIFF endpoint must be the **public HTTPS** root URL (e.g., `https://clinic.example/`) with the `openid` scope enabled. If LINE Login is in Developing mode, only testers can sign in; publish it when ready for customers.
2. Add the existing OA as the linked official account where appropriate; ask customers to add the OA as friend to receive push messages.
3. Copy `.env.example` to `.env` and fill in `LINE_LOGIN_CHANNEL_ID`, `LINE_LIFF_ID`, `LINE_CHANNEL_ACCESS_TOKEN`, and `LINE_CHANNEL_SECRET`. These are **server configuration values**, never paste secrets into a public frontend or commit `.env` to GitHub.
4. Set `PUBLIC_BASE_URL=https://your-public-site.example`; register the HTTPS webhook URL `https://your-public-site.example/api/line/webhook` in LINE Developers and turn on **Use webhook**.
5. Optional: invite your **existing OA bot** to your staff LINE group and enable group participation for the bot. Its verified webhook event will register the group ID in `line_groups`; choose the right group for notifications as the owner, or set `LINE_STAFF_GROUP_ID` privately in `.env`.
6. A **sample bilingual Rich Menu image** is `line-richmenu-th-en.png` (2500×1686). Only if you explicitly want to change the **default Rich Menu on your existing OA**, run `node scripts/setup-richmenu.mjs` after placing your production credentials. This **modifies the existing OA's default Rich Menu** and creates no new OA. Backup the original Rich Menu first. You can instead upload the PNG and set tap areas through LINE OA Manager manually.

Rich Menu buttons: Book / Shop / Appointments / Orders / Account / Contact. LIFF URLs use `https://liff.line.me/<LIFF_ID>?view=...` and the web app reads the corresponding `view` parameter.

Official references: https://developers.line.biz/en/docs/messaging-api/getting-started/ and https://developers.line.biz/en/docs/liff/getting-started/

## Configuration

Copy `.env.example` to `.env` and adjust, especially:

```dotenv
DEMO_MODE=false
NODE_ENV=production
SESSION_SECRET=long-random-secret-at-least-48-characters
STAFF_OWNER_PASSWORD=long-unique-production-password
STAFF_RECEPTION_PASSWORD=another-unique-production-password
STAFF_STORE_PASSWORD=third-unique-production-password
LINE_LOGIN_CHANNEL_ID=...
LINE_LIFF_ID=...
LINE_CHANNEL_ACCESS_TOKEN=...
LINE_CHANNEL_SECRET=...
PUBLIC_BASE_URL=https://your-site.example
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_VERIFY_SERVICE_SID=...
```

- With real Twilio Verify credentials configured, a customer can verify a Thai mobile number via SMS OTP. In **live mode**, phone verification is required before booking or ordering.
- LINE Messaging API pushes Flex Messages to the customer and selected staff group. Staff group messages contain **reference, date, time, and status only**, not symptoms, phone numbers, addresses, or clinical notes. Actual delivery requires a valid token and that the recipient is eligible to receive messages. A basic retry outbox is included but is **not a substitute for durable background workers** in production.
- Order creation reserves inventory with FEFO (earliest-expiring lot first). **Payment is not processed by this MVP**. Orders stay in `awaiting_payment`; the owner can mark payment manually verified after checking external payment evidence. There is no automatic payment gateway or carrier API yet.
- Role separation: owner, reception, store. Server verifies sessions; staff API never exposes symptoms via the overview listing. Clinical notes should only be available to authorized medical roles in a future medical-record subsystem.

## Important production deployment limits

This version deliberately uses **SQLite on a local or persistent server**, not Supabase, so you can inspect and run it immediately without credentials. A **Supabase PostgreSQL schema blueprint** is provided in `sql/supabase-schema.sql`; it is **NOT connected to the current Node server**, and copying its SQL alone does not migrate data or deploy the app. You need an implementation of the Postgres adapter, atomic booking/checkout RPCs, migration and backup plan before public production on Supabase.

**Do not deploy this SQLite server as-is to Vercel serverless:** the local filesystem is not a persistent database there. For internal evaluation use a local computer. For production use a persistent, backed-up Node server with HTTPS and security review, or complete the Supabase migration. Add periodic notification workers, rate-limits on shared storage, uptime monitoring, audit retention, privacy notices, PDPA compliance, emergency/out-of-hours guidance, staff onboarding, SMS and payment-provider agreements, product registration checks, and LINE messaging quota monitoring before use with real patients.

No customer/patient data should be entered into demo mode. Product images, prices, expiry dates, and descriptions are **fictional samples**, not authorized product listings or medical claims.

## Tests

```bash
npm test
```

Tests validate login sessions, availability limits, idempotency, cancellation, stock reservation, payment gate, shipping status, role checks, and protection from exposure of symptoms in staff listings.
