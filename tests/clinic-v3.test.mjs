import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://test-clinic.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-key";
delete process.env.LINE_CHANNEL_ACCESS_TOKEN;
delete process.env.LINE_STAFF_GROUP_ID;
const { default: handler } = await import("../api/index.mjs");
const { clinicLine } = await import("../lib/clinic-line.mjs");

async function invoke(method, url, body, cookie = "") {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
  );
  Object.assign(req, {
    method,
    url,
    headers: {
      host: "localhost:3000",
      "content-type": "application/json",
      cookie,
    },
  });
  const res = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.data = JSON.parse(body);
    },
  };
  await handler(req, res);
  return res;
}

test("patient cards, medication records, staff scanner and review require their respective sessions", async () => {
  const routes = [
    ["POST", "/api/clinic/qr", { patient_id: 1 }],
    ["POST", "/api/clinic/refills", {}],
    ["GET", "/api/clinic/medications"],
    [
      "POST",
      "/api/staff/clinic/scan",
      { code: "SWT1-AAAAA-AAAAA-AAAAA-AAAAA" },
    ],
    ["GET", "/api/staff/clinic/refills/1"],
    ["POST", "/api/staff/clinic/line", { idToken: "fixture" }],
  ];
  for (const args of routes) assert.equal((await invoke(...args)).status, 401);
});

test("clinical routes deny staff before requesting medication data unless authorized", async (t) => {
  const network = t.mock.method(globalThis, "fetch", async (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/sw_sessions"))
      return Response.json([{ principal_id: 1 }]);
    if (path.endsWith("/sw_staff"))
      return Response.json([
        { id: 1, role: "reception", active: true, clinical_access: false },
      ]);
    assert.fail("Unexpected request for clinical records: " + path);
  });
  const result = await invoke(
    "GET",
    "/api/staff/clinic/refills/10",
    undefined,
    "sc_staff=fixture-staff",
  );
  assert.equal(result.status, 403);
  assert.equal(result.data.error, "CLINICAL_ACCESS_REQUIRED");
  assert.equal(network.mock.callCount(), 2);
});

test("refills send the original dispense ID and address, and ignore client prices and quantities", async (t) => {
  let refilled;
  t.mock.method(globalThis, "fetch", async (input, options) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/sw_sessions"))
      return Response.json([{ principal_id: 9 }]);
    if (path.endsWith("/sw_customers"))
      return Response.json([{ id: 9, phone: "0810000000" }]);
    if (path.endsWith("/rpc/sw_request_refill")) {
      refilled = JSON.parse(options.body);
      return Response.json({
        id: 1,
        ref: "RX-TEST",
        patient_id: 5,
        dispense_id: 74,
        shipping_fee: 150,
        status: "pending",
        shipping_address: "Test private address",
      });
    }
    if (path.endsWith("/sw_audit_logs")) return Response.json([{ id: 1 }]);
    if (path.endsWith("/sw_settings")) return Response.json([]);
    assert.fail("Unexpected path " + path);
  });
  const payload = {
    dispense_id: 74,
    recipient: "Fixture Customer",
    shipping_phone: "0810000000",
    shipping_address: "123 Fixtures Road",
    postal_code: "40000",
    request_id: "fixture-request",
    shipping_fee: 1,
    items: [{ name: "altered", quantity: 100 }],
    finished: true,
  };
  const result = await invoke(
    "POST",
    "/api/clinic/refills",
    payload,
    "sc_customer=fixture-customer",
  );
  assert.equal(result.status, 201);
  assert.equal(refilled.p_customer, 9);
  assert.equal(refilled.p_dispense, 74);
  assert.deepEqual(Object.keys(refilled).sort(), [
    "p_address",
    "p_customer",
    "p_dispense",
    "p_phone",
    "p_postal",
    "p_recipient",
    "p_request",
  ]);
  assert.equal(result.data.request.shipping_fee, 150);
  assert.equal(Object.hasOwn(result.data.request, "shipping_address"), false);
  assert.equal(
    (
      await invoke(
        "POST",
        "/api/clinic/refills",
        { ...payload, finished: false },
        "sc_customer=fixture-customer",
      )
    ).status,
    400,
  );
});

test("LINE reminders offer direct actions and refill alerts omit addresses, HN and medicines", () => {
  const cfg = { liffId: "123456-abcdEFG", baseUrl: "https://clinic.invalid" };
  const reminder = clinicLine(
    {
      event_type: "reminder_tomorrow",
      destination: "customer",
      payload: {
        clinic_v3: true,
        lang: "en",
        date: "2026-11-20",
        from: "09:00",
        booking_id: 8,
        revision: 2,
        ref: "SWC-TEST",
      },
    },
    cfg,
  );
  assert.equal(reminder.type, "flex");
  assert.match(reminder.altText, /tomorrow/);
  const buttons = reminder.contents.footer.contents.map((x) => x.action.uri);
  assert.match(buttons[0], /action=attend/);
  assert.match(buttons[1], /action=reschedule/);
  const refill = clinicLine(
    {
      event_type: "refill_received",
      destination: "customer",
      payload: {
        clinic_v3: true,
        lang: "th",
        ref: "RX-TEST",
        hn: "PRIVATE-HN",
        patient_name: "PRIVATE-NAME",
        medication: "PRIVATE-MED",
        shipping_address: "PRIVATE-ADDRESS",
      },
    },
    cfg,
  );
  assert.doesNotMatch(JSON.stringify(refill), /PRIVATE-/);
  assert.match(JSON.stringify(refill), /view=medications/);
});
