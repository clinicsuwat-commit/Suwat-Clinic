import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import {
  authenticateLineCustomer,
  clearExternalLineSession,
  isReturningFromLine,
  lineEntryUrl,
  lineLoginPendingKey,
  lineSignedOutKey,
} from "../public/line-session.js";

Object.assign(process.env, {
  NODE_ENV: "test",
  SUPABASE_URL: "https://fixture.invalid",
  SUPABASE_SECRET_KEY: "fixture-only",
  LINE_LOGIN_CHANNEL_ID: " 123456 ",
  LINE_LIFF_ID: " 123456-fixture ",
  LINE_CHANNEL_ACCESS_TOKEN: "fixture-only",
  PUBLIC_BASE_URL: "https://clinic.example",
});
const { default: api } = await import("../api/index.mjs");
const { flush, today } = await import("../lib/remote.mjs");
const customerLineId = "U" + "1".repeat(32);
const staffLineId = "U" + "2".repeat(32);

async function post(path, body, cookie = "") {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  Object.assign(req, {
    method: "POST",
    url: path,
    headers: { host: "clinic.example", cookie },
  });
  const res = {
    writeHead(status, headers) {
      Object.assign(this, { status, headers, headersSent: true });
    },
    end(body) {
      this.json = JSON.parse(body);
    },
  };
  await api(req, res);
  return res;
}

function loginFixture({ inClient = false, loggedIn = true } = {}) {
  const keys = new Map();
  const calls = [];
  const liff = {
    isLoggedIn: () => loggedIn,
    isInClient: () => inClient,
    getIDToken: () => "fixture-token",
    logout() {
      calls.push("logout");
      loggedIn = false;
    },
    login(options) {
      calls.push(options.redirectUri);
      loggedIn = true;
    },
  };
  const storage = {
    getItem: (key) => keys.get(key),
    setItem: (key, value) => keys.set(key, value),
    removeItem: (key) => keys.delete(key),
  };
  return {
    liff,
    storage,
    calls,
    redirectUri: lineEntryUrl(
      "https://clinic.example/appointments?booking=17&action=attend&code=old&state=old",
      "appointments",
    ),
  };
}

test("external logout and sign-in refresh the LIFF session and resume the appointment link", async () => {
  const fixture = loginFixture();
  const { liff, storage, calls } = fixture;
  storage.setItem(lineSignedOutKey, "true");
  clearExternalLineSession(liff);
  const verify = async (token) => {
    assert.equal(token, "fixture-token");
    return { id: 19 };
  };
  assert.equal(await authenticateLineCustomer({ ...fixture, verify }), null);
  assert.equal(
    await authenticateLineCustomer({ ...fixture, verify, interactive: true }),
    null,
  );
  assert.deepEqual(calls, [
    "logout",
    "https://clinic.example/?view=appointments&booking=17&action=attend&clinic_line_return=1",
  ]);
  assert.equal(storage.getItem(lineSignedOutKey), undefined);
  assert.equal(storage.getItem(lineLoginPendingKey), "true");
  assert.deepEqual(
    await authenticateLineCustomer({
      ...fixture,
      verify,
      returningFromLogin: true,
    }),
    { id: 19 },
  );
  assert.equal(calls.length, 2);
});

test("LIFF app links preserve clinic navigation and discard authorization parameters", () => {
  const current =
    "https://clinic.example/medications?refill=17&code=old&state=old&liff.state=old";
  assert.equal(
    lineEntryUrl(current, "medications", "123456-fixture"),
    "https://liff.line.me/123456-fixture?view=medications&refill=17",
  );
  assert.equal(lineEntryUrl(current, "medications", "../unsafe"), "");
  assert.equal(
    lineEntryUrl("https://clinic.example/?view=account", "account"),
    "https://clinic.example/?view=account",
  );
});

test("an unfinished LINE return is detected when the browser loses the pending marker", async () => {
  const fixture = loginFixture({ loggedIn: false });
  const returningFromLogin = isReturningFromLine(
    "https://clinic.example/?view=account&code=example&state=example",
    fixture.storage,
  );
  assert.equal(returningFromLogin, true);
  assert.equal(
    isReturningFromLine(
      "https://clinic.example/?view=account&clinic_line_return=1",
      fixture.storage,
    ),
    true,
  );
  await assert.rejects(
    authenticateLineCustomer({ ...fixture, returningFromLogin }),
    { code: "LINE_LOGIN_INCOMPLETE" },
  );
  assert.deepEqual(fixture.calls, []);
});

test("a callback URL cannot override an explicit clinic logout", async () => {
  const fixture = loginFixture({ inClient: true });
  fixture.storage.setItem(lineSignedOutKey, "true");
  assert.equal(
    await authenticateLineCustomer({
      ...fixture,
      returningFromLogin: true,
      verify: () => assert.fail("Unexpected sign-in after logout"),
    }),
    null,
  );
});

test("external sign-in retries an expired ID token once and surfaces configuration errors", async () => {
  const fixture = loginFixture();
  const verify = async () => {
    throw Object.assign(new Error("Expired fixture"), {
      code: "LINE_TOKEN_EXPIRED",
    });
  };
  assert.equal(
    await authenticateLineCustomer({ ...fixture, verify, interactive: true }),
    null,
  );
  assert.equal(fixture.calls.length, 2);
  await assert.rejects(
    authenticateLineCustomer({ ...fixture, verify, returningFromLogin: true }),
    { code: "LINE_TOKEN_EXPIRED" },
  );
  await assert.rejects(
    authenticateLineCustomer({
      ...fixture,
      interactive: true,
      verify: async () => {
        throw Object.assign(new Error("Mismatch fixture"), {
          code: "LINE_LOGIN_CHANNEL_MISMATCH",
        });
      },
    }),
    { code: "LINE_LOGIN_CHANNEL_MISMATCH" },
  );
  assert.equal(fixture.calls.length, 2);
});

test("signing out of the clinic in LIFF blocks automatic sign-in and preserves LINE's own session", async () => {
  const fixture = loginFixture({ inClient: true });
  fixture.storage.setItem(lineSignedOutKey, "true");
  clearExternalLineSession(fixture.liff);
  assert.equal(await authenticateLineCustomer(fixture), null);
  await assert.rejects(
    authenticateLineCustomer({
      ...fixture,
      interactive: true,
      verify: async () => {
        throw Object.assign(new Error("Expired fixture"), {
          code: "LINE_TOKEN_EXPIRED",
        });
      },
    }),
    { code: "LINE_TOKEN_EXPIRED" },
  );
  const customer = { id: 19 };
  assert.equal(
    await authenticateLineCustomer({
      ...fixture,
      interactive: true,
      verify: async () => customer,
    }),
    customer,
  );
  assert.deepEqual(fixture.calls, []);
  assert.equal(fixture.storage.getItem(lineSignedOutKey), undefined);
});

test("the LINE sign-in API maps provider errors without writing the database", async (t) => {
  let description = "IdToken expired.";
  const fetch = t.mock.method(globalThis, "fetch", async (url, init) => {
    assert.equal(url, "https://api.line.me/oauth2/v2.1/verify");
    assert.equal(init.body.get("client_id"), "123456");
    assert.equal(init.body.get("id_token"), "fixture-token");
    return Response.json(
      { error: "invalid_request", error_description: description },
      { status: 400 },
    );
  });
  const expired = await post("/api/auth/line", { idToken: "fixture-token" });
  assert.equal(expired.status, 401);
  assert.equal(expired.json.code, "LINE_TOKEN_EXPIRED");
  description = "Invalid IdToken Audience.";
  const mismatch = await post("/api/auth/line", { idToken: "fixture-token" });
  assert.equal(mismatch.status, 401);
  assert.equal(mismatch.json.code, "LINE_LOGIN_CHANNEL_MISMATCH");
  assert.doesNotMatch(
    JSON.stringify(mismatch.json),
    /IdToken Audience|fixture-token/,
  );
  assert.equal(fetch.mock.callCount(), 2);
});

test("a verified LINE login resumes the same customer account after logout", async (t) => {
  const seen = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    if (url.hostname === "api.line.me") {
      return Response.json({
        aud: "123456",
        sub: customerLineId,
        name: "Changed LINE name",
      });
    }
    seen.push(url.pathname);
    if (url.pathname.endsWith("/sw_customers")) {
      assert.equal(options.method, "GET");
      assert.equal(
        url.searchParams.get("line_user_id"),
        "eq." + customerLineId,
      );
      return Response.json([
        { id: 19, display_name: "Existing account", preferred_lang: "th" },
      ]);
    }
    assert.ok(url.pathname.endsWith("/sw_sessions"));
    assert.equal(JSON.parse(options.body).principal_id, 19);
    return Response.json([{}]);
  });
  const response = await post("/api/auth/line", {
    idToken: "fresh-fixture-token",
  });
  assert.equal(response.status, 200);
  assert.equal(response.json.customer.display_name, "Existing account");
  assert.match(response.headers["Set-Cookie"], /^sc_customer=.+HttpOnly/);
  assert.deepEqual(seen, ["/rest/v1/sw_customers", "/rest/v1/sw_sessions"]);
});

test("LINE cards resolve appointment details for recipients and preserve group privacy", async (t) => {
  const date = "2026-11-28";
  const patientName = "คนไข้ทดสอบ";
  const booking = {
    id: 17,
    booking_ref: "APPT-FIXTURE",
    patient_name: patientName,
    date,
    appointment_time: "14:25:00",
    status: "confirmed",
    appointment_revision: 3,
    branch_id: "yasothon",
    branch: { name_th: "สาขายโสธร", name_en: "Yasothon" },
    slot: { start_time: "13:00:00", end_time: "15:00:00" },
    customer: { line_user_id: customerLineId },
  };
  const notice = (
    id,
    event_type,
    destination,
    to_id,
    event_key,
    details = {},
  ) => ({
    id,
    event_type,
    destination,
    to_id,
    event_key,
    attempts: 1,
    locked_at: "2026-11-17T01:02:03.123Z",
    payload: { clinic_v3: true, lang: "th", ...details },
  });
  const customerDetails = { booking_id: 17, revision: 3 };
  const claims = [
    notice(
      1,
      "reminder_today",
      "customer",
      customerLineId,
      "reminder:17:3:0",
      customerDetails,
    ),
    notice(
      2,
      "reminder_tomorrow",
      "customer",
      customerLineId,
      "reminder:17:3:1",
      { ...customerDetails, lang: "en" },
    ),
    notice(3, "staff_booking", "group", "test-group", "booking:group:new:17"),
    notice(4, "staff_booking", "staff", staffLineId, "booking:staff:17:9"),
    notice(
      5,
      "staff_booked",
      "staff",
      staffLineId,
      "booking:staff:created:17:9",
      { booking_id: 17 },
    ),
    notice(
      6,
      "staff_reschedule",
      "staff",
      staffLineId,
      "reschedule:staff:26:9",
    ),
    notice(
      7,
      "visit_confirmed",
      "customer",
      customerLineId,
      "visit:17:2:visit_confirmed",
      { booking_id: 17, revision: 2 },
    ),
    notice(
      8,
      "staff_booked",
      "staff",
      staffLineId,
      "booking:staff:created:17:8",
      { booking_id: 17 },
    ),
  ];
  const byRecipient = new Map();
  const states = new Map();
  let loads = 0;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    const route = url.pathname.split("/").at(-1);
    const id = url.searchParams.get("id");
    if (route === "sw_claim_notifications") return Response.json(claims);
    if (route === "sw_bookings") {
      loads++;
      assert.equal(id, "eq.17");
      assert.doesNotMatch(
        url.searchParams.get("select"),
        /patient_phone|symptoms|\bhn\b/,
      );
      return Response.json([booking]);
    }
    if (route === "sw_reschedule") {
      assert.equal(id, "eq.26");
      assert.equal(url.searchParams.get("status"), "eq.pending");
      return Response.json([
        {
          desired_date: "2026-11-29",
          desired_branch: "ubon",
          branch: { name_th: "สาขาอุบล", name_en: "Ubon Ratchathani" },
          slot: { start_time: "09:00:00", end_time: "12:00:00" },
          booking: {
            id: 17,
            booking_ref: booking.booking_ref,
            patient_name: patientName,
          },
        },
      ]);
    }
    if (route === "sw_staff") {
      assert.equal(url.searchParams.get("role"), "in.(owner,reception)");
      return Response.json(id === "eq.9" ? [{ id: 9 }] : []);
    }
    if (route === "sw_notifications") {
      states.set(id, JSON.parse(options.body).status);
      return Response.json([]);
    }
    assert.equal(url.pathname, "/v2/bot/message/push");
    const { to, messages } = JSON.parse(options.body);
    byRecipient.set(to, [...(byRecipient.get(to) || []), messages[0]]);
    return Response.json({});
  });
  assert.deepEqual(await flush(), { sent: 6, processed: 8 });
  assert.equal(loads, 1);
  assert.equal(states.get("eq.7"), "failed");
  assert.equal(states.get("eq.8"), "failed");

  for (const recipient of [customerLineId, staffLineId, "test-group"]) {
    const notices = byRecipient.get(recipient);
    const rendered = JSON.stringify(notices);
    assert.match(rendered, /สาขายโสธร/);
    assert.match(rendered, /14:25/);
    assert.match(rendered, /APPT-FIXTURE/);
    assert.doesNotMatch(rendered, /15:00/);
    assert.ok(
      notices.every((message) => !message.altText.includes(patientName)),
    );
  }
  const customerCards = JSON.stringify(byRecipient.get(customerLineId));
  assert.match(customerCards, /คนไข้ทดสอบ/);
  assert.match(customerCards, /วันนี้มีนัด/);
  assert.match(customerCards, /Your appointment is tomorrow/);
  assert.match(customerCards, /\/api\/locations\/yasothon\/map/);
  assert.match(customerCards, /action=attend/);
  const staffCards = JSON.stringify(byRecipient.get(staffLineId));
  assert.match(staffCards, /คนไข้ทดสอบ/);
  assert.match(staffCards, /ลงนัดสำเร็จ/);
  assert.match(staffCards, /สาขาอุบล/);
  assert.match(staffCards, /09:00 – 12:00/);
  assert.doesNotMatch(
    JSON.stringify(byRecipient.get("test-group")),
    /คนไข้ทดสอบ/,
  );
});

test("staff QR booking queues a single stable private receipt for the staff account", async (t) => {
  const receipts = [];
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const url = new URL(input);
    switch (url.pathname.split("/").at(-1)) {
      case "sw_sessions":
        return Response.json([{ principal_id: 9 }]);
      case "sw_staff":
        return Response.json([
          { id: 9, role: "reception", line_user_id: staffLineId },
        ]);
      case "sw_patient_qr":
        return Response.json([{ patient: { id: 25, customer_id: 19 } }]);
      case "sw_book_at_branch": {
        const args = JSON.parse(options.body);
        assert.equal(args.p_staff, 9);
        assert.equal(args.p_branch, "ubon");
        assert.equal(args.p_time, "14:25");
        return Response.json({
          id: 17,
          booking_ref: "APPT-FIXTURE",
          status: "confirmed",
        });
      }
      case "sw_clinic_queue":
        receipts.push(JSON.parse(options.body));
        return Response.json(null);
      case "sw_audit_logs":
      case "sw_claim_notifications":
        return Response.json([]);
      default:
        assert.fail(url.pathname);
    }
  });
  const data = {
    code: "SWT1-" + "A".repeat(20),
    date: today(),
    slot_key: "afternoon",
    time: "14:25",
    branch_id: "ubon",
    request_id: "fixture-booking",
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await post(
      "/api/staff/clinic/book",
      data,
      "sc_staff=fixture-session",
    );
    assert.equal(response.status, 201);
  }
  assert.equal(receipts.length, 2);
  for (const receipt of receipts) {
    assert.equal(receipt.p_key, "booking:staff:created:17:9");
    assert.equal(receipt.p_destination, "staff");
    assert.equal(receipt.p_to, staffLineId);
    assert.deepEqual(receipt.p_data, { booking_id: 17 });
  }
});
