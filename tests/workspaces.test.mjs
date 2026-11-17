import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://workspace-fixture.invalid";
process.env.SUPABASE_SECRET_KEY = "fixture-key";
const { default: api } = await import("../api/index.mjs");

async function get(path, cookie) {
  const req = {
    method: "GET",
    url: path,
    headers: { host: "localhost", cookie },
  };
  const res = {
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = JSON.parse(body);
    },
  };
  await api(req, res);
  return res;
}

function mockSupabase(t, role) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (target, options) => {
    const url = new URL(target);
    const table = url.pathname.split("/").at(-1);
    calls.push({ table, query: url.searchParams, headers: options.headers });
    if (table === "sw_sessions") return Response.json([{ principal_id: 9 }]);
    if (table === "sw_staff")
      return Response.json([
        { id: 9, role, display_name: "Fixture", active: true },
      ]);
    if (table === "sw_customers")
      return Response.json([{ id: 9, display_name: "Fixture member" }]);
    assert.equal(options.headers.Prefer, "count=exact");
    assert.equal(url.searchParams.get("select"), "id");
    assert.equal(url.searchParams.get("limit"), "1");
    let count = 0;
    if (table === "sw_tasks") count = 14;
    if (table === "sw_reschedule") count = 3;
    if (
      table === "sw_bookings" &&
      url.searchParams.get("branch_id") === "eq.ubon"
    )
      count = url.searchParams.get("status") === "eq.pending" ? 2 : 54;
    return Response.json(count ? [{ id: 14 }] : [], {
      headers: { "Content-Range": count ? "0-0/" + count : "*/0" },
    });
  });
  return calls;
}

test("staff and customer session checks only read their own account", async (t) => {
  const calls = mockSupabase(t, "owner");
  const cookies = "sc_staff=fixture; sc_customer=fixture";
  const customer = await get("/api/me/customer", cookies);
  assert.equal(customer.body.customer.display_name, "Fixture member");
  assert.deepEqual(
    calls.map((call) => call.table),
    ["sw_sessions", "sw_customers"],
  );
  assert.equal(calls[0].query.get("kind"), "eq.customer");
  calls.length = 0;
  const staff = await get("/api/staff/session", cookies);
  assert.equal(staff.body.staff.role, "owner");
  assert.deepEqual(
    calls.map((call) => call.table),
    ["sw_sessions", "sw_staff"],
  );
  assert.equal(calls[0].query.get("kind"), "eq.staff");
});

test("only owners can request manager totals", async (t) => {
  const calls = mockSupabase(t, "reception");
  assert.equal((await get("/api/manager/overview", "")).status, 401);
  assert.equal(calls.length, 0);
  assert.equal(
    (await get("/api/manager/overview", "sc_staff=fixture")).status,
    403,
  );
  assert.deepEqual(
    calls.map((call) => call.table),
    ["sw_sessions", "sw_staff"],
  );
});

test("manager overview uses exact totals and returns aggregate data", async (t) => {
  const calls = mockSupabase(t, "owner");
  const date = "2026-11-21";
  const result = await get(
    "/api/manager/overview?date=" + date,
    "sc_staff=fixture",
  );
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    date,
    branches: [
      { branch_id: "ubon", visits: 54, pending: 2 },
      { branch_id: "yasothon", visits: 0, pending: 0 },
      { branch_id: null, visits: 0, pending: 0 },
    ],
    tasks: 14,
    reschedules: 3,
  });
  assert.ok(
    calls
      .filter((call) => call.table === "sw_bookings")
      .every((call) => call.query.get("date") === "eq." + date),
  );
});

test("staff session reports connectivity failures separately from being signed out", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("offline");
  });
  assert.equal(
    (await get("/api/staff/session", "sc_staff=fixture")).status,
    503,
  );
  assert.deepEqual((await get("/api/staff/session", "")).body, { staff: null });
});
