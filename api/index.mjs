import { branchId, branchMap, locations } from "../lib/locations.mjs";
import { clinicRoute, clinicPublicConfig } from "../lib/clinic.mjs";
// Suwat Clinic API v2. Runs in a Vercel Node.js Function and in dev.mjs.
// All database operations happen on the server; no privileged key reaches the browser.
import {
  cfg,
  fail,
  clean,
  validPhone,
  iso,
  today,
  isDate,
  safeDate,
  reply,
  errorReply,
  requestOrigin,
  getBody,
  rows,
  first,
  insert,
  patch,
  del,
  upsert,
  rpc,
  getSession,
  requireUser,
  newSession,
  logout,
  sessionCookie,
  clearCookie,
  lineVerify,
  staffAuth,
  audit,
  notifyGroup,
  notifyOrder,
  flush,
  staffGroup,
} from "../lib/remote.mjs";

const publicStaff = (s) =>
  s
    ? {
        name: s.display_name,
        role: s.role,
        line_linked: !!s.line_user_id,
        clinical_access: !!s.clinical_access,
      }
    : null;
const eq = (v) => "eq." + v;
const unrow = (x) => (Array.isArray(x) ? x[0] : x);
const asInt = (x) => {
  const n = Number(x);
  if (!Number.isSafeInteger(n) || n < 1) throw fail(400, "Invalid identifier");
  return n;
};
const publicCustomer = (c) =>
  c
    ? {
        id: c.id,
        display_name: c.display_name,
        phone: c.phone,
        phone_verified: !!c.phone_verified,
        preferred_lang: c.preferred_lang,
      }
    : null;
async function setting(k, defaultValue = "") {
  return (
    (await first("sw_settings", { select: "value", key: eq(k) }))?.value ||
    defaultValue
  );
}
async function available(date, branch = null) {
  return branch
    ? rpc("sw_available_at", { p_date: date, p_branch: branch })
    : rpc("sw_available", { p_date: date });
}
async function products() {
  const p = await rows("sw_products", {
    select:
      "id,sku,title_th,title_en,desc_th,desc_en,category,price,image,active",
    active: "eq.true",
    order: "id.asc",
  });
  const lots = await rows("sw_inventory_lots", {
    select: "product_id,available_qty,expiry_date",
    expiry_date: "gte." + today(),
  });
  const m = new Map();
  for (const l of lots)
    m.set(l.product_id, (m.get(l.product_id) || 0) + l.available_qty);
  return p.map((x) => ({ ...x, stock: m.get(x.id) || 0 }));
}
async function customer(req) {
  return getSession(req, "customer");
}
async function staff(req) {
  return getSession(req, "staff");
}
async function ownBooking(c, id) {
  const b = await first("sw_bookings", {
    select: "*",
    id: eq(id),
    customer_id: eq(c.id),
  });
  if (!b) throw fail(404, "Booking not found");
  return b;
}
async function orderWithItems(o) {
  const items = await rows("sw_order_items", {
    select: "title_th,title_en,qty,unit_price",
    order_id: eq(o.id),
  });
  return { ...o, items };
}
async function deliver() {
  try {
    await flush(5);
  } catch (e) {
    console.error("Notification retry later:", e.message);
  }
}
async function allTasks(staffRow) {
  const tasks = await rows("sw_tasks", {
    select: "id,kind,title,status,created_at",
    order: "id.desc",
    limit: 80,
  });
  const mine =
    staffRow.role === "owner"
      ? tasks
      : tasks.filter(
          (t) =>
            t.kind === (staffRow.role === "reception" ? "booking" : "order"),
        );
  const ids = mine.map((x) => x.id);
  if (!ids.length) return [];
  const acks = await rows("sw_task_acks", {
    select: "task_id,staff_id,acknowledged_at",
    task_id: `in.(${ids.join(",")})`,
  });
  const allStaff =
    staffRow.role === "owner"
      ? await rows("sw_staff", { select: "id,display_name" })
      : [];
  const names = new Map(allStaff.map((x) => [x.id, x.display_name]));
  return mine.map((x) => ({
    ...x,
    ack_count: acks.filter((a) => a.task_id === x.id).length,
    my_ack:
      acks.find((a) => a.task_id === x.id && a.staff_id === staffRow.id)
        ?.acknowledged_at || null,
    ...(staffRow.role === "owner"
      ? {
          acknowledged_by: acks
            .filter((a) => a.task_id === x.id)
            .map((a) => ({
              display_name: names.get(a.staff_id) || "Staff",
              acknowledged_at: a.acknowledged_at,
            })),
        }
      : {}),
  }));
}

export async function route(req, res) {
  const url = new URL(req.url, "http://localhost");
  const routeHint = url.searchParams.get("route");
  const path = routeHint
    ? "/api/" + routeHint.replace(/^\/+/, "")
    : url.pathname;
  const method = req.method;
  if (method !== "GET" && method !== "POST")
    throw fail(405, "Method not allowed");
  if (method === "POST") requestOrigin(req);
  if (path.startsWith("/api/clinic/") || path.startsWith("/api/staff/clinic/"))
    return clinicRoute(req, res, { path, url });
  if (method === "GET" && path === "/api/config")
    return reply(res, 200, {
      demo: false,
      liffId: cfg.liffId,
      lineReady: !!cfg.lineLogin,
      shopPayment: "manual_review",
      title: "Suwat Clinic",
      ...clinicPublicConfig(),
    });
  if (method === "GET" && path === "/api/locations")
    return reply(res, 200, { locations: await locations() });
  const mapPath = path.match(/^\/api\/locations\/([a-z]+)\/map$/);
  if (method === "GET" && mapPath) {
    const map = await branchMap(mapPath[1]);
    res.writeHead(302, {
      Location: map,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    });
    res.end();
    return;
  }
  if (method === "GET" && path === "/api/health") {
    const [x] = await Promise.all([
      first("sw_slot_rules", { select: "key" }),
      first("sw_clinic_locations", { select: "id" }),
    ]);
    return reply(res, 200, {
      ok: !!x,
      database: "supabase",
      version: 3,
      release: "3.1",
      patch: "3.1.1",
      lineConfigured: !!(cfg.lineLogin && cfg.lineToken),
    });
  }
  if (method === "GET" && path === "/api/slots") {
    const date = url.searchParams.get("date") || today();
    if (!isDate(date)) throw fail(400, "Invalid date");
    return reply(res, 200, {
      date,
      slots: await available(
        date,
        branchId(url.searchParams.get("branch"), true),
      ),
      mode: await setting("booking_mode", "auto"),
    });
  }
  if (method === "GET" && path === "/api/products")
    return reply(res, 200, { products: await products() });
  if (method === "GET" && path === "/api/me") {
    const [c, s] = await Promise.all([customer(req), staff(req)]);
    return reply(res, 200, {
      customer: publicCustomer(c),
      staff: publicStaff(s),
    });
  }
  if (method === "POST" && path === "/api/auth/line") {
    const data = await getBody(req);
    const ident = await lineVerify(data.idToken);
    let c = await first("sw_customers", {
      select: "*",
      line_user_id: eq(ident.sub),
    });
    if (!c) {
      try {
        c = await insert("sw_customers", {
          line_user_id: ident.sub,
          display_name: clean(ident.name, 100),
          preferred_lang: data.lang === "en" ? "en" : "th",
        });
      } catch (e) {
        if (e.status !== 409) throw e;
        c = await first("sw_customers", { line_user_id: eq(ident.sub) });
        if (!c) throw e;
      }
    }
    const t = await newSession("customer", c.id, 336);
    return reply(
      res,
      200,
      { customer: publicCustomer(c) },
      { "Set-Cookie": sessionCookie("sc_customer", t) },
    );
  }
  if (method === "POST" && path === "/api/auth/demo")
    throw fail(404, "Demo login disabled in live mode");
  if (method === "POST" && path === "/api/auth/logout") {
    await logout(req, "customer");
    return reply(
      res,
      200,
      { ok: true },
      { "Set-Cookie": clearCookie("sc_customer") },
    );
  }
  if (method === "POST" && path === "/api/me/profile") {
    const c = requireUser(await customer(req)),
      data = await getBody(req),
      name = clean(data.display_name, 100),
      lang = data.preferred_lang === "en" ? "en" : "th";
    if (name.length < 2) throw fail(400, "Please enter your name");
    const result = await patch(
      "sw_customers",
      { id: eq(c.id) },
      { display_name: name, preferred_lang: lang },
    );
    return reply(res, 200, { customer: publicCustomer(result[0]) });
  }
  if (method === "POST" && path === "/api/me/language") {
    const c = requireUser(await customer(req)),
      data = await getBody(req);
    if (!["th", "en"].includes(data.lang)) throw fail(400, "Invalid language");
    await patch(
      "sw_customers",
      { id: eq(c.id) },
      { preferred_lang: data.lang },
    );
    return reply(res, 200, { ok: true });
  }
  // SMS OTP removed in v2.2. Keep explicit responses for older clients; no SMS is sent.
  if (
    method === "POST" &&
    (path === "/api/otp/start" || path === "/api/otp/check")
  )
    throw fail(
      410,
      "SMS OTP is no longer used. Save your phone number in My Account.",
    );
  if (method === "POST" && path === "/api/me/phone") {
    const c = requireUser(await customer(req)),
      data = await getBody(req),
      phone = clean(data.phone, 15);
    if (!validPhone(phone))
      throw fail(400, "Please enter a valid 10-digit Thai phone number");
    // A phone number provided without OTP is self-declared, not ownership-verified.
    // Preserve verified status only when the number did not change.
    const verified = c.phone === phone && c.phone_verified === true;
    const out = await patch(
      "sw_customers",
      { id: eq(c.id) },
      { phone, phone_verified: verified },
    );
    await audit("customer:" + c.id, "profile.phone_updated", String(c.id), {
      verified,
    });
    return reply(res, 200, {
      customer: publicCustomer(out[0]),
      verification: "self_reported",
    });
  }
  if (method === "GET" && path === "/api/bookings") {
    const c = requireUser(await customer(req));
    return reply(res, 200, {
      bookings: await rows("sw_bookings", {
        select:
          "id,booking_ref,patient_name,date,slot_key,status,created_at,branch_id",
        customer_id: eq(c.id),
        order: "date.desc,id.desc",
        limit: 100,
      }),
    });
  }
  if (method === "POST" && path === "/api/bookings") {
    const c = requireUser(await customer(req)),
      data = await getBody(req);
    safeDate(data.date);
    if (!validPhone(c.phone))
      throw fail(403, "Add your phone number in My Account before booking");
    const name = clean(data.patient_name || c.display_name, 100),
      slot = clean(data.slot_key, 50),
      symptoms = clean(data.symptoms, 500),
      request = clean(data.request_id, 100);
    if (name.length < 2 || !slot)
      throw fail(400, "Please enter a name and slot");
    const b = unrow(
      await rpc("sw_book", {
        p_customer: c.id,
        p_date: data.date,
        p_slot: slot,
        p_patient: name,
        p_symptoms: symptoms,
        p_request: request,
      }),
    );
    try {
      await audit("customer:" + c.id, "booking.create", b.booking_ref);
      await notifyGroup("booking:group:new:" + b.id, "staff_booking", {
        booking_id: b.id,
      });
      await deliver();
    } catch (e) {
      console.error("Booking notification will require retry:", e.message);
    }
    return reply(res, 201, {
      booking: {
        id: b.id,
        booking_ref: b.booking_ref,
        date: b.date,
        slot_key: b.slot_key,
        status: b.status,
      },
    });
  }
  const cancel = path.match(/^\/api\/bookings\/(\d+)\/cancel$/);
  if (method === "POST" && cancel) {
    const c = requireUser(await customer(req)),
      b = await ownBooking(c, asInt(cancel[1]));
    if (!["pending", "confirmed"].includes(b.status))
      throw fail(409, "This booking cannot be cancelled");
    const out = await patch(
      "sw_bookings",
      { id: eq(b.id), customer_id: eq(c.id), status: "in.(pending,confirmed)" },
      { status: "cancelled", updated_at: iso() },
    );
    if (!out.length) throw fail(409, "Booking already updated");
    try {
      await rpc("sw_offer_waitlist_at", {
        p_date: b.date,
        p_slot: b.slot_key,
        p_branch: b.branch_id ?? null,
      });
      await deliver();
    } catch (e) {
      console.error("Booking cancellation notice failed:", e.message);
    }
    return reply(res, 200, { booking: { id: b.id, status: "cancelled" } });
  }
  if (method === "GET" && path === "/api/orders") {
    const c = requireUser(await customer(req));
    const orders = await rows("sw_orders", {
      select: "*",
      customer_id: eq(c.id),
      order: "id.desc",
      limit: 50,
    });
    return reply(res, 200, {
      orders: await Promise.all(orders.map(orderWithItems)),
    });
  }
  if (method === "POST" && path === "/api/orders") {
    const c = requireUser(await customer(req)),
      data = await getBody(req);
    if (!validPhone(c.phone))
      throw fail(403, "Add your phone number in My Account before ordering");
    if (
      !Array.isArray(data.items) ||
      !data.items.length ||
      data.items.length > 30
    )
      throw fail(400, "Invalid cart");
    const counts = new Map();
    for (const v of data.items) {
      const id = asInt(v.id),
        qty = asInt(v.qty);
      if (qty > 30) throw fail(400, "Quantity too large");
      counts.set(id, (counts.get(id) || 0) + qty);
    }
    if ([...counts.values()].some((x) => x > 50))
      throw fail(400, "Quantity too large");
    const delivery = data.delivery_method === "pickup" ? "pickup" : "shipping",
      address = clean(data.shipping_address, 300);
    if (delivery === "shipping" && address.length < 12)
      throw fail(400, "Please enter a full shipping address");
    const order = unrow(
      await rpc("sw_checkout", {
        p_customer: c.id,
        p_items: [...counts].map(([id, qty]) => ({ id, qty })),
        p_delivery: delivery,
        p_address: address,
        p_request: clean(data.request_id, 100),
      }),
    );
    try {
      await audit("customer:" + c.id, "order.create", order.order_ref);
      await notifyOrder(order, c);
      await deliver();
    } catch (e) {
      console.error("Order notification will require retry:", e.message);
    }
    return reply(res, 201, {
      order: await orderWithItems(order),
      payment_instructions:
        "Please contact clinic to arrange payment. Payment is not yet verified.",
    });
  }
  if (method === "POST" && path === "/api/staff/login") {
    const data = await getBody(req),
      email = clean(data.username, 180).toLowerCase();
    if (!email.includes("@") || !data.password)
      throw fail(400, "Enter your staff email and password");
    const auth = await staffAuth(email, String(data.password)),
      s = await first("sw_staff", {
        select: "*",
        auth_user_id: eq(auth.id),
        active: "eq.true",
      });
    if (!s) throw fail(403, "This account is not authorized as staff");
    const t = await newSession("staff", s.id, 8);
    await audit("staff:" + s.id, "staff.login", "session");
    return reply(
      res,
      200,
      { staff: publicStaff(s) },
      { "Set-Cookie": sessionCookie("sc_staff", t, 8) },
    );
  }
  if (method === "POST" && path === "/api/staff/logout") {
    await logout(req, "staff");
    return reply(
      res,
      200,
      { ok: true },
      { "Set-Cookie": clearCookie("sc_staff") },
    );
  }
  if (method === "GET" && path === "/api/staff/overview") {
    const s = requireUser(await staff(req)),
      date = url.searchParams.get("date") || today();
    if (!isDate(date)) throw fail(400, "Invalid date");
    const [slots, bookingRows, orderRows, tasks, prs, mode] = await Promise.all(
      [
        available(date),
        s.role === "store"
          ? Promise.resolve([])
          : rows("sw_bookings", {
              select:
                "id,booking_ref,patient_name,date,slot_key,status,created_at,branch_id",
              date: eq(date),
              order: "id.desc",
              limit: 150,
            }),
        s.role === "reception"
          ? Promise.resolve([])
          : rows("sw_orders", {
              select:
                "id,order_ref,amount,status,payment_status,delivery_method,tracking_no,carrier,created_at",
              order: "id.desc",
              limit: 100,
            }),
        allTasks(s),
        s.role === "owner" ? products() : Promise.resolve([]),
        setting("booking_mode", "auto"),
      ],
    );
    const metrics = {
      bookings_today: bookingRows.length,
      capacity_today: slots.reduce((a, x) => a + x.capacity, 0),
      remaining_today: slots.reduce((a, x) => a + x.left, 0),
      pending_tasks: tasks.filter((x) => x.status !== "done").length,
      order_sales: orderRows
        .filter((x) => x.payment_status === "verified")
        .reduce((a, x) => a + x.amount, 0),
      orders: orderRows.length,
    };
    return reply(res, 200, {
      staff: publicStaff(s),
      date,
      slots,
      metrics,
      bookings: bookingRows,
      orders: orderRows,
      tasks,
      products: prs,
      booking_mode: mode,
    });
  }
  const taskAck = path.match(/^\/api\/staff\/tasks\/(\d+)\/ack$/);
  if (method === "POST" && taskAck) {
    const s = requireUser(await staff(req)),
      id = asInt(taskAck[1]),
      task = await first("sw_tasks", { select: "id,kind", id: eq(id) });
    if (!task) throw fail(404, "Task not found");
    if (
      (s.role === "reception" && task.kind !== "booking") ||
      (s.role === "store" && task.kind !== "order")
    )
      throw fail(403, "Not your task category");
    await rpc("sw_ack_task", { p_task: id, p_staff: s.id });
    await audit("staff:" + s.id, "task.ack", String(id));
    return reply(res, 200, { ok: true });
  }
  const bookingStatus = path.match(/^\/api\/staff\/bookings\/(\d+)\/status$/);
  if (method === "POST" && bookingStatus) {
    const s = requireUser(await staff(req), ["owner", "reception"]),
      id = asInt(bookingStatus[1]),
      data = await getBody(req);
    const b = await first("sw_bookings", { select: "*", id: eq(id) });
    if (!b) throw fail(404, "Booking not found");
    if (b.patient_id && data.status === "checked_in")
      throw fail(409, "CHECKIN_USE_QR");
    const transitions = {
      pending: ["confirmed", "cancelled"],
      confirmed: ["checked_in", "cancelled", "no_show"],
      checked_in: ["completed"],
    };
    if (!transitions[b.status]?.includes(data.status))
      throw fail(409, "Invalid booking status transition");
    const out = await patch(
      "sw_bookings",
      { id: eq(id), status: eq(b.status) },
      { status: data.status, updated_at: iso() },
    );
    if (!out.length) throw fail(409, "Booking was updated already");
    await audit("staff:" + s.id, "booking.status", b.booking_ref, {
      from: b.status,
      to: data.status,
    });
    if (["confirmed", "cancelled", "no_show"].includes(data.status)) {
      try {
        if (data.status !== "confirmed")
          await rpc("sw_offer_waitlist_at", {
            p_date: b.date,
            p_slot: b.slot_key,
            p_branch: b.branch_id ?? null,
          });
        await deliver();
      } catch {
        console.error("Booking notifications remain in queue");
      }
    }
    return reply(res, 200, { booking: { id, status: data.status } });
  }
  const verifyPayment = path.match(
    /^\/api\/staff\/orders\/(\d+)\/verify-payment$/,
  );
  if (method === "POST" && verifyPayment) {
    const s = requireUser(await staff(req), ["owner"]),
      id = asInt(verifyPayment[1]);
    // Payment review is MANUAL; owners must check proof of payment outside this starter before clicking.
    const out = await patch(
      "sw_orders",
      {
        id: eq(id),
        status: "eq.awaiting_payment",
        payment_status: "eq.unverified",
      },
      { payment_status: "verified", status: "confirmed", updated_at: iso() },
    );
    if (!out.length) throw fail(409, "Order not awaiting payment");
    await audit(
      "staff:" + s.id,
      "order.payment.manual_verify",
      out[0].order_ref,
    );
    try {
      const c = await first("sw_customers", {
        select: "*",
        id: eq(out[0].customer_id),
      });
      await notifyOrder(out[0], c, "payment_verified");
      await deliver();
    } catch (e) {
      console.error("Payment notice failed", e.message);
    }
    return reply(res, 200, { order: out[0] });
  }
  const orderStatus = path.match(/^\/api\/staff\/orders\/(\d+)\/status$/);
  if (method === "POST" && orderStatus) {
    const s = requireUser(await staff(req), ["owner", "store"]),
      id = asInt(orderStatus[1]),
      data = await getBody(req);
    const o = await first("sw_orders", { select: "*", id: eq(id) });
    if (!o) throw fail(404, "Order not found");
    const updated = unrow(
      await rpc("sw_cancel_order", {
        p_order: id,
        p_expected: o.status,
        p_new: clean(data.status, 30),
        p_carrier: clean(data.carrier || o.carrier, 70),
        p_tracking: clean(data.tracking_no || o.tracking_no, 70),
      }),
    );
    await audit("staff:" + s.id, "order.status", o.order_ref, {
      from: o.status,
      to: updated.status,
    });
    try {
      const c = await first("sw_customers", {
        select: "*",
        id: eq(updated.customer_id),
      });
      await notifyOrder(updated, c, "status");
      await deliver();
    } catch (e) {
      console.error("Shipment notice failed", e.message);
    }
    return reply(res, 200, { order: updated });
  }
  if (method === "POST" && path === "/api/staff/slots") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req);
    if (!Array.isArray(data.slots) || data.slots.length > 20)
      throw fail(400, "Invalid slot data");
    for (const item of data.slots) {
      if (
        !Number.isInteger(item.capacity) ||
        item.capacity < 0 ||
        item.capacity > 500
      )
        throw fail(400, "Capacity must be 0–500");
      const out = await patch(
        "sw_slot_rules",
        { key: eq(clean(item.key, 40)) },
        { capacity: item.capacity },
      );
      if (!out.length) throw fail(404, "Slot not found");
    }
    await audit("staff:" + s.id, "slots.update", "rules");
    return reply(res, 200, { slots: await available(today()) });
  }
  if (method === "POST" && path === "/api/staff/override") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req);
    safeDate(data.date);
    const capacity = Number(data.capacity),
      key = clean(data.key, 40);
    if (!Number.isInteger(capacity) || capacity < 0 || capacity > 500)
      throw fail(400, "Invalid capacity");
    const exists = await first("sw_slot_rules", {
      select: "key",
      key: eq(key),
    });
    if (!exists) throw fail(404, "Slot not found");
    const branch = branchId(data.branch_id, true);
    if (branch)
      await upsert(
        "sw_branch_date_slots",
        {
          branch_id: branch,
          date: data.date,
          slot_key: key,
          capacity,
          closed: !!data.closed,
        },
        "branch_id,date,slot_key",
      );
    else
      await upsert(
        "sw_date_overrides",
        { date: data.date, slot_key: key, capacity, closed: !!data.closed },
        "date,slot_key",
      );
    await audit("staff:" + s.id, "slot.override", data.date, { key, capacity });
    return reply(res, 200, { slots: await available(data.date) });
  }
  if (method === "POST" && path === "/api/staff/booking-mode") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req);
    if (!["auto", "manual"].includes(data.mode))
      throw fail(400, "Invalid mode");
    await upsert(
      "sw_settings",
      { key: "booking_mode", value: data.mode },
      "key",
    );
    await audit("staff:" + s.id, "booking.mode", "settings", {
      mode: data.mode,
    });
    return reply(res, 200, { mode: data.mode });
  }
  if (method === "POST" && path === "/api/staff/products") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req),
      sku = clean(data.sku, 32).toUpperCase(),
      th = clean(data.title_th, 140),
      en = clean(data.title_en, 140),
      price = Number(data.price);
    if (
      !sku ||
      !th ||
      !en ||
      !Number.isInteger(price) ||
      price < 0 ||
      price > 10000000
    )
      throw fail(400, "Invalid product details");
    const p = await insert("sw_products", {
      sku,
      title_th: th,
      title_en: en,
      desc_th: clean(data.desc_th, 300),
      desc_en: clean(data.desc_en, 300),
      price,
      category: "wellness",
      image: "mineral.svg",
    });
    await audit("staff:" + s.id, "product.create", sku);
    return reply(res, 201, { id: p.id });
  }
  if (method === "POST" && path === "/api/staff/restock") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req),
      qty = Number(data.qty),
      lot = clean(data.lot_no, 80),
      product = asInt(data.product_id);
    if (
      !Number.isInteger(qty) ||
      qty < 1 ||
      qty > 100000 ||
      !lot ||
      !isDate(data.expiry_date) ||
      data.expiry_date < today()
    )
      throw fail(400, "Invalid stock lot");
    await rpc("sw_restock", {
      p_product: product,
      p_lot: lot,
      p_expiry: data.expiry_date,
      p_qty: qty,
      p_actor: "staff:" + s.id,
    });
    await audit("staff:" + s.id, "stock.restock", lot, { product, qty });
    return reply(res, 200, { ok: true });
  }
  if (method === "GET" && path === "/api/staff/line-groups") {
    requireUser(await staff(req), ["owner"]);
    return reply(res, 200, {
      groups: await rows("sw_line_groups", {
        select: "group_id,last_seen",
        order: "last_seen.desc",
        limit: 20,
      }),
      active: await staffGroup(),
    });
  }
  if (method === "POST" && path === "/api/staff/line-group") {
    const s = requireUser(await staff(req), ["owner"]),
      data = await getBody(req),
      group = await first("sw_line_groups", {
        select: "group_id",
        group_id: eq(clean(data.group_id, 200)),
      });
    if (!group) throw fail(400, "Select a verified LINE group");
    await upsert(
      "sw_settings",
      { key: "staff_group_id", value: group.group_id },
      "key",
    );
    await audit("staff:" + s.id, "staff.group.select", "group");
    return reply(res, 200, { ok: true });
  }
  const fulfillment = path.match(/^\/api\/staff\/orders\/(\d+)\/fulfillment$/);
  if (method === "GET" && fulfillment) {
    const s = requireUser(await staff(req), ["owner", "store"]),
      o = await first("sw_orders", {
        select:
          "order_ref,delivery_method,shipping_address,tracking_no,carrier,status",
        id: eq(asInt(fulfillment[1])),
      });
    if (!o) throw fail(404, "Order not found");
    await audit("staff:" + s.id, "order.fulfillment.read", o.order_ref);
    return reply(res, 200, { order: o });
  }
  if (method === "GET" && path === "/api/staff/audit") {
    requireUser(await staff(req), ["owner"]);
    return reply(res, 200, {
      logs: await rows("sw_audit_logs", {
        select: "actor,action,target,created_at",
        order: "id.desc",
        limit: 60,
      }),
    });
  }
  throw fail(404, "API endpoint not found");
}
export default async function handler(req, res) {
  try {
    return await route(req, res);
  } catch (e) {
    return errorReply(res, e);
  }
}
