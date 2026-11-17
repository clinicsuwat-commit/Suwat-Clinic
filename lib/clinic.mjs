import { randomBytes } from "node:crypto";
import {
  audit,
  clean,
  cfg,
  fail,
  first,
  flush,
  getBody,
  getSession,
  hash,
  insert,
  isDate,
  iso,
  lineVerify,
  notifyGroup,
  patch,
  reply,
  requireUser,
  rows,
  rpc,
  safeDate,
  today,
  validPhone,
} from "./remote.mjs";

const eq = (value) => "eq." + value;
const inList = (ids) => "in.(" + ids.join(",") + ")";
const one = (value) => (Array.isArray(value) ? value[0] : value);
const bookingFields =
  "id,booking_ref,patient_name,patient_id,date,slot_key,appointment_time,status,attending_at,source,appointment_revision";
const slotFields = "slot:sw_slot_rules(label_th,label_en,start_time,end_time)";
const activeStatuses = ["pending", "confirmed", "checked_in"];
const clinicRoles = ["owner", "reception"];
const profileRelations = ["self", "child", "parent", "dependent"];
const normalizedName = (value) =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
const qrInput = (value) =>
  clean(value, 60)
    .toUpperCase()
    .replace(/[\s-]+/g, "");
const err = (code, status = 400) => fail(status, code);
const isPhone = (value) => validPhone(value);

function id(value) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw err("REQUEST_INVALID");
  return number;
}

function requestId(value) {
  const token = clean(value, 100);
  if (!/^[A-Za-z0-9_-]{8,100}$/.test(token)) throw err("REQUEST_INVALID");
  return token;
}

function required(value, min, max, code = "REQUEST_INVALID") {
  const text = clean(value, max + 1).replace(/\s+/g, " ");
  if (text.length < min || text.length > max) throw err(code);
  return text;
}

function slotKey(value) {
  const key = clean(value, 51);
  if (!/^[A-Za-z0-9_-]{1,50}$/.test(key)) throw err("BOOKING_TIME_INVALID");
  return key;
}

function clockTime(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    throw err("BOOKING_TIME_INVALID");
  return value;
}

function dayOffset(value, shift) {
  const date = new Date(value + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + shift);
  return date.toISOString().slice(0, 10);
}

function publicPatient(patient) {
  return {
    id: patient.id,
    full_name: patient.full_name,
    relation: patient.relation,
    hn_linked: !!patient.hn,
    hn_tail: patient.hn?.slice(-4) ?? null,
  };
}

function staffPatient(patient) {
  return { ...publicPatient(patient), hn: patient.hn };
}

function publicRefill(row) {
  return {
    id: row.id,
    ref: row.ref,
    dispense_id: row.dispense_id,
    patient_id: row.patient_id,
    shipping_fee: row.shipping_fee,
    status: row.status,
    created_at: row.created_at,
  };
}

async function patientOf(customerId, patientId) {
  const patient = await first("sw_patients", {
    id: eq(id(patientId)),
    customer_id: eq(customerId),
  });
  if (!patient) throw err("PATIENT_NOT_FOUND", 404);
  return patient;
}

async function qrPatient(code) {
  const value = qrInput(code);
  if (!/^SWT1[0-9A-F]{20}$/.test(value)) throw err("QR_INVALID");
  const record = await first("sw_patient_qr", {
    select: "patient:sw_patients(*)",
    code_hash: eq(hash(value)),
    expires_at: "gt." + iso(),
  });
  if (!record?.patient) throw err("QR_EXPIRED", 404);
  return record.patient;
}

async function roles(req, clinical = false) {
  const staff = requireUser(await getSession(req, "staff"), clinicRoles);
  if (clinical && !staff.clinical_access)
    throw err("CLINICAL_ACCESS_REQUIRED", 403);
  return staff;
}

async function push() {
  try {
    await flush(6);
  } catch {
    console.error("Clinic notifications remain in the queue");
  }
}

async function pushGroup(key, kind) {
  try {
    await notifyGroup(key, kind);
  } catch {
    console.error("Clinic group alert was unavailable");
  }
}

async function waitOffer(booking) {
  try {
    await rpc("sw_offer_waitlist", {
      p_date: booking.date,
      p_slot: booking.slot_key,
    });
  } catch {
    console.error("Waitlist will be checked by the scheduler");
  }
}

function duplicateGroups(bookings, patients) {
  const byName = new Map();
  for (const p of patients) {
    const key = p.customer_id + ":" + normalizedName(p.full_name);
    byName.set(key, byName.has(key) ? null : p.id);
  }
  const groups = new Map();
  for (const b of bookings) {
    if (!activeStatuses.includes(b.status)) continue;
    const nameKey = b.customer_id + ":" + normalizedName(b.patient_name);
    const key = b.date + ":" + (b.patient_id || byName.get(nameKey) || nameKey);
    const group = groups.get(key) || [];
    group.push(b);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) => ({
      date: group[0].date,
      name: group[0].patient_name,
      refs: group.map((b) => b.booking_ref),
    }));
}

async function overview(customer) {
  const [patientRows, bookings, waiting] = await Promise.all([
    rows("sw_patients", {
      customer_id: eq(customer.id),
      order: "id.asc",
      limit: 20,
    }),
    rows("sw_bookings", {
      select: bookingFields + "," + slotFields,
      customer_id: eq(customer.id),
      order: "date.desc,id.desc",
      limit: 150,
    }),
    rows("sw_waitlist", {
      select: "id,patient_id,date,slot_key,status,offer_until," + slotFields,
      customer_id: eq(customer.id),
      status: "in.(waiting,offered)",
      date: "gte." + today(),
      order: "date.asc,id.asc",
      limit: 100,
    }),
  ]);
  const bookingIds = bookings.map((b) => b.id);
  const requests = bookingIds.length
    ? await rows("sw_reschedule", {
        select: "id,booking_id,desired_date,desired_slot,status",
        booking_id: inList(bookingIds),
        status: "eq.pending",
        limit: 150,
      })
    : [];
  const existing = new Map(requests.map((row) => [row.booking_id, row]));
  return {
    patients: patientRows.map(publicPatient),
    bookings: bookings.map((b) => ({
      ...b,
      reschedule: existing.get(b.id) ?? null,
    })),
    waitlist: waiting,
    duplicates: duplicateGroups(
      bookings
        .filter((b) => b.date >= today())
        .map((b) => ({ ...b, customer_id: customer.id })),
      patientRows,
    ),
  };
}

async function scanContext(patient, staff) {
  const recent = await rows("sw_bookings", {
    select: bookingFields + "," + slotFields,
    customer_id: eq(patient.customer_id),
    date: "gte." + today(),
    status: "in.(pending,confirmed,checked_in,completed)",
    order: "date.asc,id.desc",
    limit: 100,
  });
  const bookings = recent.filter(
    (b) =>
      b.patient_id === patient.id ||
      (b.patient_id === null &&
        normalizedName(b.patient_name) === normalizedName(patient.full_name)),
  );
  const visit =
    bookings.find((b) => b.date === today() && b.status === "checked_in") ??
    bookings.find((b) => b.date === today() && b.status === "confirmed") ??
    bookings.find((b) => b.date === today() && b.status === "pending") ??
    bookings.find((b) => b.date === today() && b.status === "completed") ??
    null;
  const saved =
    visit && staff.clinical_access
      ? await first("sw_dispenses", { select: "id", booking_id: eq(visit.id) })
      : null;
  return {
    patient: staffPatient(patient),
    visit,
    has_dispense: !!saved,
    clinical_access: !!staff.clinical_access,
    next:
      bookings.find(
        (b) => b.date > today() && ["pending", "confirmed"].includes(b.status),
      ) ?? null,
  };
}

async function desk(staff, date) {
  if (!isDate(date)) throw err("BOOKING_DATE_INVALID");
  const [todayRows, nextRows, requests, notifications, refills] =
    await Promise.all([
      rows("sw_bookings", {
        select: bookingFields + ",customer_id," + slotFields,
        date: eq(date),
        order: "id.desc",
        limit: 500,
      }),
      rows("sw_bookings", {
        select: bookingFields + ",customer_id," + slotFields,
        date: eq(dayOffset(date, 1)),
        status: "in.(pending,confirmed,checked_in)",
        order: "id.desc",
        limit: 500,
      }),
      rows("sw_reschedule", {
        select:
          "id,booking_id,desired_date,desired_slot,status,booking:sw_bookings(booking_ref,patient_name,date,slot_key),slot:sw_slot_rules(label_th,label_en,start_time,end_time)",
        status: "eq.pending",
        order: "id.asc",
        limit: 100,
      }),
      rows("sw_notifications", {
        select: "event_type,status,payload",
        destination: "eq.customer",
        event_type: "in.(reminder_today,reminder_tomorrow)",
        "payload->>date": eq(date),
        order: "id.desc",
        limit: 500,
      }),
      staff.clinical_access
        ? rows("sw_refill_requests", {
            select: "id,ref,status,created_at,shipping_fee",
            order: "id.desc",
            limit: 70,
          })
        : [],
    ]);
  const accounts = [
    ...new Set([...todayRows, ...nextRows].map((b) => b.customer_id)),
  ];
  const pt = accounts.length
    ? await rows("sw_patients", {
        select: "id,customer_id,full_name",
        customer_id: inList(accounts),
        limit: 1000,
      })
    : [];
  const reminderCounts = { sent: 0, waiting: 0, failed: 0 };
  const revisions = new Map(
    todayRows.map((b) => [b.id, b.appointment_revision]),
  );
  for (const n of notifications) {
    if (revisions.get(n.payload?.booking_id) !== n.payload?.revision) continue;
    if (n.status === "sent") reminderCounts.sent++;
    else if (n.status === "failed") reminderCounts.failed++;
    else reminderCounts.waiting++;
  }
  const strip = ({ customer_id, ...b }) => b;
  return {
    date,
    bookings: todayRows.map(strip),
    tomorrow: nextRows.map(strip),
    requests,
    duplicates: duplicateGroups([...todayRows, ...nextRows], pt),
    reminders: reminderCounts,
    refills,
  };
}

function dispenseItems(source) {
  if (!Array.isArray(source) || !source.length || source.length > 30)
    throw err("DISPENSE_INVALID");
  return source.map((item) => {
    const quantity = Number(item?.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000)
      throw err("DISPENSE_INVALID");
    return {
      name: required(item?.name, 1, 150, "DISPENSE_INVALID"),
      quantity,
      unit: required(item?.unit, 1, 40, "DISPENSE_INVALID"),
      directions: clean(item?.directions, 300),
    };
  });
}

async function readMedications(customer) {
  const pt = await rows("sw_patients", {
    select: "id,full_name,relation,hn",
    customer_id: eq(customer.id),
    hn: "not.is.null",
    limit: 20,
  });
  if (!pt.length) return { patients: [], dispenses: [], requests: [] };
  const [dispenses, requests] = await Promise.all([
    rows("sw_dispenses", {
      select:
        "id,patient_id,dispensed_at,refill_from,refill_until,items:sw_dispense_items(position,name,quantity,unit,directions)",
      patient_id: inList(pt.map((p) => p.id)),
      order: "dispensed_at.desc,id.desc",
      limit: 100,
    }),
    rows("sw_refill_requests", {
      customer_id: eq(customer.id),
      order: "id.desc",
      limit: 100,
    }),
  ]);
  const pending = new Set(
    requests.filter((r) => r.status === "pending").map((r) => r.dispense_id),
  );
  const date = today();
  return {
    patients: pt.map(publicPatient),
    dispenses: dispenses.map((d) => ({
      ...d,
      items: [...d.items].sort((a, b) => a.position - b.position),
      can_request:
        !!d.refill_from &&
        d.refill_from <= date &&
        d.refill_until >= date &&
        !pending.has(d.id),
    })),
    requests: requests.map(publicRefill),
  };
}

export async function clinicRoute(req, res, { path, url }) {
  const forStaff = path.startsWith("/api/staff/clinic/");
  const base = forStaff ? "/api/staff/clinic/" : "/api/clinic/";
  const action = path.slice(base.length);
  if (req.method === "GET" && forStaff) {
    if (action === "workspace") {
      const s = await roles(req);
      return reply(
        res,
        200,
        await desk(s, url.searchParams.get("date") || today()),
      );
    }
    if (action === "permissions") {
      requireUser(await getSession(req, "staff"), ["owner"]);
      const staff = await rows("sw_staff", {
        select: "id,display_name,role,clinical_access",
        active: "eq.true",
        role: "in.(owner,reception)",
        order: "display_name.asc",
        limit: 80,
      });
      return reply(res, 200, { staff });
    }
    const detail = action.match(/^refills\/(\d+)$/);
    if (detail) {
      const s = await roles(req, true);
      const refill = await first("sw_refill_requests", {
        id: eq(id(detail[1])),
        select:
          "id,ref,status,created_at,recipient,shipping_phone,shipping_address,postal_code,shipping_fee,patient:sw_patients(full_name,hn),dispense:sw_dispenses(prescription_ref,items:sw_dispense_items(position,name,quantity,unit,directions))",
      });
      if (!refill) throw err("REFILL_NOT_AVAILABLE", 404);
      await audit("staff:" + s.id, "clinic.refill.read", refill.ref);
      return reply(res, 200, { refill });
    }
  }
  if (req.method === "GET" && !forStaff) {
    const c = requireUser(await getSession(req, "customer"));
    if (action === "overview") return reply(res, 200, await overview(c));
    if (action === "medications")
      return reply(res, 200, await readMedications(c));
    if (action === "conflicts") {
      const patient = await patientOf(c.id, url.searchParams.get("patient"));
      const date = url.searchParams.get("date");
      safeDate(date);
      const list = await rpc("sw_same_day_bookings", {
        p_customer: c.id,
        p_patient: patient.id,
        p_date: date,
        p_name: patient.full_name,
      });
      return reply(res, 200, {
        bookings: list.map(({ id, booking_ref, date, slot_key, status }) => ({
          id,
          booking_ref,
          date,
          slot_key,
          status,
        })),
      });
    }
  }

  if (req.method !== "POST") throw fail(404, "API endpoint not found");
  if (!forStaff) {
    const c = requireUser(await getSession(req, "customer"));
    const d = await getBody(req);
    if (action === "patients") {
      const fullName = required(d.full_name, 2, 100, "PATIENT_NAME_INVALID");
      if (!profileRelations.includes(d.relation)) throw err("REQUEST_INVALID");
      const existing = await rows("sw_patients", {
        select: "id,relation",
        customer_id: eq(c.id),
        limit: 20,
      });
      if (existing.length >= 15) throw err("PROFILES_LIMIT", 409);
      if (d.relation === "self" && existing.some((p) => p.relation === "self"))
        throw err("SELF_EXISTS", 409);
      const p = await insert("sw_patients", {
        customer_id: c.id,
        full_name: fullName,
        relation: d.relation,
      });
      return reply(res, 201, { patient: publicPatient(p) });
    }
    if (action === "qr") {
      const p = await patientOf(c.id, d.patient_id);
      const hex = randomBytes(10).toString("hex").toUpperCase();
      const code = "SWT1-" + hex.match(/.{5}/g).join("-");
      const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      await insert("sw_patient_qr", {
        patient_id: p.id,
        code_hash: hash(qrInput(code)),
        expires_at: expires,
      });
      return reply(res, 201, {
        code,
        expires_at: expires,
        patient: publicPatient(p),
      });
    }
    if (action === "book") {
      safeDate(d.date);
      const booking = one(
        await rpc("sw_book_patient", {
          p_customer: c.id,
          p_patient: id(d.patient_id),
          p_date: d.date,
          p_slot: slotKey(d.slot_key),
          p_time: null,
          p_symptoms: clean(d.note, 500),
          p_request: requestId(d.request_id),
        }),
      );
      await audit(
        "customer:" + c.id,
        "clinic.booking.create",
        booking.booking_ref,
      );
      await pushGroup("booking:group:new:" + booking.id, "staff_booking");
      await push();
      return reply(res, 201, {
        booking: {
          id: booking.id,
          booking_ref: booking.booking_ref,
          status: booking.status,
          date: booking.date,
        },
      });
    }
    if (action === "attendance") {
      const out = await patch(
        "sw_bookings",
        {
          id: eq(id(d.booking_id)),
          customer_id: eq(c.id),
          status: "eq.confirmed",
          date: "gte." + today(),
        },
        { attending_at: iso() },
      );
      if (!out.length) throw err("VISIT_NOT_READY", 409);
      return reply(res, 200, { ok: true });
    }
    if (action === "reschedule") {
      safeDate(d.date);
      const request = one(
        await rpc("sw_request_reschedule", {
          p_booking: id(d.booking_id),
          p_customer: c.id,
          p_date: d.date,
          p_slot: slotKey(d.slot_key),
        }),
      );
      await push();
      return reply(res, 201, { request });
    }
    if (action === "waitlist") {
      safeDate(d.date);
      const waiting = one(
        await rpc("sw_join_waitlist", {
          p_customer: c.id,
          p_patient: id(d.patient_id),
          p_date: d.date,
          p_slot: slotKey(d.slot_key),
        }),
      );
      return reply(res, 201, { id: waiting.id });
    }
    if (action === "waitlist/accept") {
      const b = one(
        await rpc("sw_accept_waitlist", {
          p_customer: c.id,
          p_waitlist: id(d.waitlist_id),
        }),
      );
      await waitOffer(b);
      await push();
      return reply(res, 200, {
        booking: { id: b.id, booking_ref: b.booking_ref, status: b.status },
      });
    }
    if (action === "waitlist/withdraw") {
      const out = await patch(
        "sw_waitlist",
        {
          id: eq(id(d.waitlist_id)),
          customer_id: eq(c.id),
          status: "in.(waiting,offered)",
        },
        { status: "withdrawn" },
      );
      if (!out.length) throw err("OFFER_NOT_AVAILABLE", 409);
      await waitOffer(out[0]);
      await push();
      return reply(res, 200, { ok: true });
    }
    if (action === "refills") {
      if (d.finished !== true) throw err("REFILL_FINISHED_REQUIRED");
      const phone = clean(d.shipping_phone, 16);
      if (!isPhone(phone)) throw err("PHONE_INVALID");
      const postal = clean(d.postal_code, 12);
      if (!/^\d{5}$/.test(postal)) throw err("POSTAL_INVALID");
      const request = one(
        await rpc("sw_request_refill", {
          p_customer: c.id,
          p_dispense: id(d.dispense_id),
          p_recipient: required(d.recipient, 2, 100),
          p_phone: phone,
          p_address: required(d.shipping_address, 12, 360),
          p_postal: postal,
          p_request: requestId(d.request_id),
        }),
      );
      await audit("customer:" + c.id, "clinic.refill.request", request.ref);
      await pushGroup("refill:group:" + request.id, "staff_refill");
      await push();
      return reply(res, 201, { request: publicRefill(request) });
    }
    if (action === "refills/withdraw") {
      const out = await patch(
        "sw_refill_requests",
        {
          id: eq(id(d.refill_id)),
          customer_id: eq(c.id),
          status: "eq.pending",
        },
        { status: "withdrawn" },
      );
      if (!out.length) throw err("REFILL_NOT_PENDING", 409);
      await audit("customer:" + c.id, "clinic.refill.withdraw", out[0].ref);
      return reply(res, 200, { ok: true });
    }
  }

  if (forStaff) {
    const s = requireUser(await getSession(req, "staff"));
    const d = await getBody(req);
    if (action === "line") {
      const ident = await lineVerify(d.idToken);
      const existing = await first("sw_staff", {
        select: "id",
        line_user_id: eq(ident.sub),
      });
      if (existing && existing.id !== s.id) throw err("STAFF_LINE_USED", 409);
      const linked = await first("sw_staff", {
        select: "line_user_id",
        id: eq(s.id),
        active: "eq.true",
      });
      if (linked?.line_user_id && linked.line_user_id !== ident.sub)
        throw err("STAFF_LINE_UNLINK_FIRST", 409);
      try {
        await patch(
          "sw_staff",
          {
            id: eq(s.id),
            active: "eq.true",
            or: "(line_user_id.is.null,line_user_id.eq." + ident.sub + ")",
          },
          { line_user_id: ident.sub },
        );
      } catch (e) {
        if (e.status === 409) throw err("STAFF_LINE_USED", 409);
        throw e;
      }
      const result = await first("sw_staff", {
        select: "line_user_id",
        id: eq(s.id),
        active: "eq.true",
      });
      if (result?.line_user_id !== ident.sub)
        throw err("STAFF_LINE_UNLINK_FIRST", 409);
      await audit("staff:" + s.id, "staff.line.link", "self");
      return reply(res, 200, { linked: true });
    }
    if (action === "line/unlink") {
      await patch("sw_staff", { id: eq(s.id) }, { line_user_id: null });
      await audit("staff:" + s.id, "staff.line.unlink", "self");
      return reply(res, 200, { linked: false });
    }
    if (action === "permissions") {
      requireUser(s, ["owner"]);
      if (typeof d.enabled !== "boolean") throw err("REQUEST_INVALID");
      const target = id(d.staff_id);
      const out = await patch(
        "sw_staff",
        { id: eq(target), active: "eq.true", role: "in.(owner,reception)" },
        { clinical_access: d.enabled },
      );
      if (!out.length) throw err("STAFF_REQUIRED", 404);
      await audit("staff:" + s.id, "clinic.permissions", String(target), {
        enabled: d.enabled,
      });
      return reply(res, 200, { ok: true });
    }
    requireUser(s, clinicRoles);
    if (action === "scan") {
      const p = await qrPatient(d.code);
      await audit("staff:" + s.id, "clinic.scan", String(p.id));
      return reply(res, 200, await scanContext(p, s));
    }
    if (action === "link-hn") {
      const p = await qrPatient(d.code);
      if (d.verified !== true) throw err("HN_VERIFY_REQUIRED");
      const hn = clean(d.hn, 31).toUpperCase().replace(/\s/g, "");
      if (!/^[A-Z0-9][A-Z0-9/-]{1,29}$/.test(hn)) throw err("HN_INVALID");
      const patient = one(
        await rpc("sw_link_hn", { p_patient: p.id, p_hn: hn, p_staff: s.id }),
      );
      await audit("staff:" + s.id, "clinic.hn.link", String(p.id));
      return reply(res, 200, await scanContext(patient, s));
    }
    if (action === "book") {
      const p = await qrPatient(d.code);
      safeDate(d.date);
      const booking = one(
        await rpc("sw_book_patient", {
          p_customer: p.customer_id,
          p_patient: p.id,
          p_date: d.date,
          p_slot: slotKey(d.slot_key),
          p_time: clockTime(d.time),
          p_symptoms: "",
          p_request: requestId(d.request_id),
          p_staff: s.id,
          p_source: "staff_qr",
        }),
      );
      await audit(
        "staff:" + s.id,
        "clinic.booking.create",
        booking.booking_ref,
      );
      await push();
      return reply(res, 201, {
        booking: {
          id: booking.id,
          booking_ref: booking.booking_ref,
          status: booking.status,
          date: booking.date,
        },
      });
    }
    if (action === "check-in") {
      const p = await qrPatient(d.code);
      if (d.match !== true) throw err("PATIENT_CONFIRM_REQUIRED");
      const visit = one(
        await rpc("sw_claim_visit", {
          p_patient: p.id,
          p_booking: id(d.booking_id),
          p_staff: s.id,
        }),
      );
      await audit("staff:" + s.id, "clinic.check_in", visit.booking_ref);
      return reply(res, 200, await scanContext(p, s));
    }
    if (action === "reschedule") {
      if (typeof d.accept !== "boolean") throw err("REQUEST_INVALID");
      const request = await first("sw_reschedule", {
        select: "booking:sw_bookings(date,slot_key)",
        id: eq(id(d.request_id)),
      });
      const b = one(
        await rpc("sw_decide_reschedule", {
          p_request: id(d.request_id),
          p_staff: s.id,
          p_accept: d.accept,
        }),
      );
      await audit("staff:" + s.id, "clinic.reschedule.resolve", b.booking_ref, {
        accepted: d.accept,
      });
      if (d.accept && request?.booking) await waitOffer(request.booking);
      await push();
      return reply(res, 200, { ok: true });
    }
    if (action === "dispenses") {
      if (!s.clinical_access) throw err("CLINICAL_ACCESS_REQUIRED", 403);
      const p = await qrPatient(d.code);
      if (d.verified !== true) throw err("DISPENSE_CONFIRM_REQUIRED");
      if (
        (d.refill_from && !isDate(d.refill_from)) ||
        (d.refill_until && !isDate(d.refill_until))
      )
        throw err("REFILL_WINDOW_INVALID");
      const dispense = one(
        await rpc("sw_record_dispense", {
          p_staff: s.id,
          p_patient: p.id,
          p_booking: id(d.booking_id),
          p_ref: required(d.prescription_ref, 1, 100, "DISPENSE_INVALID"),
          p_items: dispenseItems(d.items),
          p_from: d.refill_from || null,
          p_until: d.refill_until || null,
        }),
      );
      await audit(
        "staff:" + s.id,
        "clinic.dispense.create",
        String(dispense.id),
      );
      return reply(res, 201, {
        dispense: { id: dispense.id },
        ...(await scanContext(p, s)),
      });
    }
    if (action === "refills/review") {
      if (!s.clinical_access) throw err("CLINICAL_ACCESS_REQUIRED", 403);
      const refill = one(
        await rpc("sw_review_refill", {
          p_staff: s.id,
          p_request: id(d.refill_id),
          p_status: clean(d.status, 30),
        }),
      );
      await audit("staff:" + s.id, "clinic.refill.review", refill.ref, {
        status: refill.status,
      });
      await push();
      return reply(res, 200, { request: publicRefill(refill) });
    }
  }
  throw fail(404, "API endpoint not found");
}

export function clinicPublicConfig() {
  try {
    const line = new URL(cfg.lineOaUrl);
    if (
      line.protocol === "https:" &&
      ["lin.ee", "line.me", "www.line.me", "liff.line.me"].includes(
        line.hostname,
      )
    ) {
      return { lineOaUrl: line.href };
    }
  } catch {}
  return { lineOaUrl: "" };
}
