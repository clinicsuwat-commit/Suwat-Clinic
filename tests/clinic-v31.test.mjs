import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://fixture.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-settings";
const { default: api } = await import("../api/index.mjs");
const { clinicLine } = await import("../lib/clinic-line.mjs");
const { validMapUrl } = await import("../lib/locations.mjs");
const { estimateDepletion } = await import("../public/medication.js");

async function call(method, path, body, cookie = "") {
  const req = Readable.from(
    body === undefined ? [] : [Buffer.from(JSON.stringify(body))],
  );
  Object.assign(req, {
    method,
    url: path,
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
      this.json = body === undefined ? null : JSON.parse(body);
    },
  };
  await api(req, res);
  return res;
}

test("calendar stock estimates use start day, rounded partial day and no date for variable use", () => {
  const item = {
    schedule: "regular",
    dose: "1",
    times_daily: "2",
    quantity: "20",
    started_on: "2026-11-28",
  };
  assert.equal(estimateDepletion(item), "2026-12-07");
  assert.equal(estimateDepletion({ ...item, quantity: "21" }), "2026-12-08");
  assert.equal(
    estimateDepletion({ ...item, dose: "0.5", quantity: "3" }),
    "2026-11-30",
  );
  assert.equal(estimateDepletion({ ...item, schedule: "variable" }), "");
  assert.equal(estimateDepletion({ ...item, times_daily: "0" }), "");
});

test("refill and low-supply alerts contain no names, notes or address and link to the authorized set", () => {
  const config = { liffId: "123456-abCDeF", baseUrl: "https://clinic.example" };
  const message = clinicLine(
    {
      destination: "customer",
      event_type: "medication_depletion",
      payload: {
        clinic_v3: true,
        lang: "th",
        dispense_id: 78,
        can_refill: true,
        depletion_on: "2026-11-28",
        ref: "PRIVATE-NAME",
        directions: "PRIVATE-SCHEDULE",
        shipping_address: "PRIVATE-ADDRESS",
      },
    },
    config,
  );
  assert.match(JSON.stringify(message), /refill=78/);
  assert.doesNotMatch(JSON.stringify(message), /PRIVATE-/);
  const future = clinicLine(
    {
      destination: "customer",
      event_type: "medication_depletion",
      payload: {
        clinic_v3: true,
        lang: "th",
        dispense_id: 78,
        can_refill: false,
        depletion_on: "2026-11-28",
      },
    },
    config,
  );
  assert.doesNotMatch(JSON.stringify(future), /refill=78/);
});

test("LINE uses the clinic redirect to look up the latest map by branch", async (t) => {
  const message = clinicLine(
    {
      event_type: "visit_confirmed",
      destination: "customer",
      payload: {
        clinic_v3: true,
        lang: "th",
        branch_id: "ubon",
        branch_th: "สาขาอุบล",
        booking_id: 1,
      },
    },
    { baseUrl: "https://clinic.example", liffId: "12345-fake" },
  );
  const map = message.contents.footer.contents.find(
    (b) => b.action.label === "แผนที่สาขา",
  );
  assert.equal(map.action.uri, "https://clinic.example/api/locations/ubon/map");
  assert.match(JSON.stringify(message), /สาขาอุบล/);
  let stored = "";
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    assert.equal(url.searchParams.get("id"), "eq.ubon");
    return Response.json([{ id: "ubon", name_th: "สาขาอุบล", map_url: stored }]);
  });
  const fallback = await call("GET", "/api/locations/ubon/map");
  assert.equal(fallback.status, 302);
  assert.match(fallback.headers.Location, /\/maps\/search\/\?api=1/);
  stored = "https://maps.app.goo.gl/example-fixture";
  const saved = await call("GET", "/api/locations/ubon/map");
  assert.equal(saved.headers.Location, stored);
  assert.equal(saved.headers["Cache-Control"], "no-store");
  assert.equal(
    validMapUrl("https://www.google.com.evil.test/maps/place/foo"),
    "",
  );
  assert.equal(validMapUrl("javascript:alert(1)"), "");
  assert.equal(
    validMapUrl("https://www.google.com/maps/place/Example"),
    "https://www.google.com/maps/place/Example",
  );
});

test("patient history queries only safe metadata and omits injected drug details", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const url = new URL(input);
    const name = url.pathname.split("/").at(-1);
    if (name === "sw_sessions") return Response.json([{ principal_id: 12 }]);
    if (name === "sw_customers")
      return Response.json([{ id: 12, phone: "0810000000" }]);
    if (name === "sw_patients")
      return Response.json([
        {
          id: 13,
          full_name: "Fixture Patient",
          relation: "self",
          hn: "FIXTURE0",
        },
      ]);
    if (name === "sw_refill_requests") return Response.json([]);
    if (name === "sw_dispenses") {
      assert.doesNotMatch(
        url.searchParams.get("select"),
        /name|directions|quantity|prescription_ref/,
      );
      return Response.json([
        {
          id: 55,
          patient_id: 13,
          estimated_depletion_on: "2026-11-29",
          dispensed_at: "2026-11-19T05:00:00Z",
          items: [
            {
              position: 1,
              name: "PRIVATE-MEDICATION",
              directions: "PRIVATE-REGIMEN",
            },
          ],
          prescription_ref: "PRIVATE-RX",
        },
      ]);
    }
    assert.fail("Unexpected request to " + name);
  });
  const result = await call(
    "GET",
    "/api/clinic/medications",
    undefined,
    "sc_customer=fixture-customer",
  );
  assert.equal(result.status, 200);
  assert.equal(result.json.dispenses[0].item_count, 1);
  assert.doesNotMatch(JSON.stringify(result.json), /PRIVATE-/);
});

test("map editor is restricted to the owner account", async (t) => {
  t.mock.method(globalThis, "fetch", async (input) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/sw_sessions"))
      return Response.json([{ principal_id: 1 }]);
    if (path.endsWith("/sw_staff"))
      return Response.json([
        { id: 1, role: "reception", active: true, clinical_access: true },
      ]);
    assert.fail("Map write should not be reached");
  });
  const result = await call(
    "POST",
    "/api/staff/clinic/location-map",
    { branch_id: "ubon", map_url: "https://maps.app.goo.gl/sample" },
    "sc_staff=fixture-staff",
  );
  assert.equal(result.status, 403);
});
