import { clinicLine, isAppointmentNotice } from "./clinic-line.mjs";
import {
  createHash,
  randomBytes,
  createHmac,
  timingSafeEqual,
} from "node:crypto";

// The server alone holds the Supabase secret. Browser assets never import this module.
const env = (k) => process.env[k] || "";
export const cfg = {
  url: env("SUPABASE_URL") || env("NEXT_PUBLIC_SUPABASE_URL"),
  publicKey:
    env("SUPABASE_PUBLISHABLE_KEY") ||
    env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
  secretKey: env("SUPABASE_SECRET_KEY"),
  lineLogin: env("LINE_LOGIN_CHANNEL_ID").trim(),
  liffId: env("LINE_LIFF_ID").trim(),
  lineToken: env("LINE_CHANNEL_ACCESS_TOKEN"),
  lineSecret: env("LINE_CHANNEL_SECRET"),
  lineGroup: env("LINE_STAFF_GROUP_ID"),
  lineOaUrl: env("LINE_OA_URL"),
  baseUrl:
    env("PUBLIC_BASE_URL") ||
    (env("VERCEL_PROJECT_PRODUCTION_URL")
      ? "https://" + env("VERCEL_PROJECT_PRODUCTION_URL")
      : ""),
  cronSecret: env("CRON_SECRET"),
  production: env("NODE_ENV") === "production",
};
export function fail(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}
export function clean(x, max = 150) {
  return typeof x === "string"
    ? x
        .trim()
        .replace(/[\x00-\x1f\x7f]/g, " ")
        .slice(0, max)
    : "";
}
export function validPhone(x) {
  return /^0[0-9]{9}$/.test(x || "");
}
export const iso = () => new Date().toISOString();
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const isDate = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x + "T00:00:00Z")) &&
  new Date(x + "T00:00:00Z").toISOString().slice(0, 10) === x;
export function safeDate(x) {
  if (
    !isDate(x) ||
    x < today() ||
    x >
      new Date(Date.parse(today() + "T00:00:00Z") + 90 * 86400000)
        .toISOString()
        .slice(0, 10)
  )
    throw fail(400, "Choose a date within the next 90 days");
}
export const ref = (prefix) =>
  prefix +
  "-" +
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "") +
  "-" +
  randomBytes(4).toString("hex").toUpperCase();
const encode = (v) => (typeof v === "string" ? v : JSON.stringify(v));
export function qs(obj = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(obj))
    if (v !== undefined && v !== null) p.set(k, encode(v));
  return p.toString();
}
export async function rest(
  table,
  {
    query = {},
    method = "GET",
    value,
    returning = false,
    upsert = false,
    count = false,
  } = {},
) {
  if (!cfg.url || !cfg.secretKey)
    throw fail(503, "Supabase environment variables not configured");
  const url =
    cfg.url.replace(/\/$/, "") +
    "/rest/v1/" +
    table +
    (Object.keys(query).length ? "?" + qs(query) : "");
  const hdr = {
    apikey: cfg.secretKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (method !== "GET")
    hdr.Prefer = returning ? "return=representation" : "return=minimal";
  if (count) hdr.Prefer = "count=exact";
  if (upsert)
    hdr.Prefer += (hdr.Prefer ? "," : "") + "resolution=merge-duplicates";
  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: hdr,
      body: value === undefined ? undefined : JSON.stringify(value),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw fail(503, "Unable to reach Supabase");
  }
  if (!resp.ok) {
    const txt = await resp.text();
    let errData = {};
    try {
      errData = JSON.parse(txt);
    } catch {}
    console.error("Supabase error", table, resp.status, errData.code);
    if (
      errData.code === "23505" &&
      errData.message?.includes("sw_booking_active_patient_uidx")
    ) {
      throw fail(409, "BOOKING_DUPLICATE");
    }
    throw fail(
      errData.code === "P0001" || resp.status === 409
        ? 409
        : resp.status === 400
          ? 400
          : 503,
      errData.code === "P0001"
        ? errData.message
        : resp.status === 404
          ? "Database table or function missing. Run SQL setup."
          : "Database request failed",
    );
  }
  if (resp.status === 204) return returning ? [] : null;
  if (count) {
    const total = resp.headers.get("Content-Range")?.match(/\/(\d+)$/)?.[1];
    if (total === undefined) throw fail(503, "Unable to count records");
    await resp.body?.cancel();
    return Number(total);
  }
  const raw = await resp.text();
  return raw ? JSON.parse(raw) : null;
}
export const rows = (table, query = {}) => rest(table, { query });
export const countRows = (table, filters) =>
  rest(table, { query: { ...filters, select: "id", limit: 1 }, count: true });
export async function first(table, query = {}) {
  const a = await rows(table, { ...query, limit: 1 });
  return a?.[0] || null;
}
export async function insert(table, value) {
  const a = await rest(table, { method: "POST", value, returning: true });
  return a?.[0] || null;
}
export async function patch(table, query, value) {
  return rest(table, { query, method: "PATCH", value, returning: true });
}
export async function del(table, query) {
  return rest(table, { query, method: "DELETE" });
}
export async function upsert(table, value, onConflict) {
  return rest(table, {
    query: onConflict ? { on_conflict: onConflict } : {},
    method: "POST",
    value,
    upsert: true,
    returning: true,
  });
}
export async function rpc(name, params = {}) {
  const r = await rest("rpc/" + name, {
    method: "POST",
    value: params,
    returning: true,
  });
  return r;
}
export function reply(res, status, payload, headers = {}) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "same-origin",
    ...headers,
  });
  res.end(JSON.stringify(payload));
}
export function errorReply(res, e) {
  const status = e.status || 500;
  if (status >= 500) console.error("Suwat API:", e.message);
  if (!res.headersSent)
    reply(res, status, {
      error: status >= 500 && status !== 503 ? "Server error" : e.message,
      ...(typeof e.code === "string" && e.code.startsWith("LINE_")
        ? { code: e.code }
        : {}),
    });
  else res.end();
}
export function requestOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = (req.headers["x-forwarded-host"] || req.headers.host || "")
    .split(",")[0]
    .trim();
  try {
    if (new URL(origin).host !== host)
      throw fail(403, "Cross-origin request blocked");
  } catch (e) {
    if (e.status) throw e;
    throw fail(403, "Cross-origin request blocked");
  }
}
export async function getBody(req, max = 24000) {
  if (req.body !== undefined) {
    const x = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    if (JSON.stringify(x).length > max) throw fail(413, "Request too large");
    return x || {};
  }
  let n = 0;
  const chunks = [];
  for await (const c of req) {
    n += c.length;
    if (n > max) throw fail(413, "Request too large");
    chunks.push(c);
  }
  if (!n) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw fail(400, "Invalid JSON");
  }
}
export const hash = (s) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function cookie(req, name) {
  return (
    String(req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(name + "="))
      ?.slice(name.length + 1) || ""
  );
}
export function sessionCookie(name, value, hours = 336) {
  return `${name}=${encodeURIComponent(value)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${hours * 3600}${cfg.production ? "; Secure" : ""}`;
}
export const clearCookie = (name) => sessionCookie(name, "", 0);
export async function newSession(kind, id, hours) {
  const t = newToken();
  await insert("sw_sessions", {
    token_hash: hash(t),
    kind,
    principal_id: id,
    expires_at: new Date(Date.now() + hours * 3600000).toISOString(),
  });
  return t;
}
export async function getSession(req, kind) {
  const t = cookie(req, kind === "staff" ? "sc_staff" : "sc_customer");
  if (!t) return null;
  const s = await first("sw_sessions", {
    select: "principal_id",
    token_hash: "eq." + hash(t),
    kind: "eq." + kind,
    expires_at: "gt." + iso(),
  });
  if (!s) return null;
  return kind === "staff"
    ? await first("sw_staff", {
        select: "id,display_name,role,active,line_user_id,clinical_access",
        id: "eq." + s.principal_id,
        active: "eq.true",
      })
    : await first("sw_customers", {
        select:
          "id,line_user_id,display_name,phone,phone_verified,preferred_lang",
        id: "eq." + s.principal_id,
      });
}
export async function logout(req, kind) {
  const t = cookie(req, kind === "staff" ? "sc_staff" : "sc_customer");
  if (t) await del("sw_sessions", { token_hash: "eq." + hash(t) });
}
export function requireUser(value, roleList) {
  if (!value) throw fail(401, "Please sign in first");
  if (roleList && !roleList.includes(value.role))
    throw fail(403, "Insufficient permissions");
  return value;
}
export async function audit(actor, action, target, detail = {}) {
  try {
    await insert("sw_audit_logs", { actor, action, target, detail });
  } catch (e) {
    console.error("Audit log write failed:", e.message);
  }
}
export async function lineVerify(idToken) {
  if (!cfg.lineLogin)
    throw fail(503, "LINE Login channel not configured", "LINE_NOT_CONFIGURED");
  if (typeof idToken !== "string" || !idToken || idToken.length > 4000)
    throw fail(400, "Invalid LINE token", "LINE_TOKEN_INVALID");

  const unavailable = () =>
    fail(503, "Unable to verify LINE identity", "LINE_VERIFY_UNAVAILABLE");
  let response;
  let identity;
  try {
    response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        id_token: idToken,
        client_id: cfg.lineLogin,
      }),
      signal: AbortSignal.timeout(10000),
    });
    identity = await response.json();
  } catch {
    throw unavailable();
  }
  if (response.status >= 500 || response.status === 429) throw unavailable();
  const channelMismatch = () =>
    fail(401, "LINE Login channel mismatch", "LINE_LOGIN_CHANNEL_MISMATCH");
  if (!response.ok) {
    if (
      identity?.error_description === "Invalid IdToken Audience." ||
      identity?.error === "invalid_client"
    )
      throw channelMismatch();
    if (identity?.error_description === "IdToken expired.")
      throw fail(401, "LINE token expired", "LINE_TOKEN_EXPIRED");
    throw fail(401, "Invalid LINE identity", "LINE_TOKEN_INVALID");
  }
  if (String(identity?.aud) !== cfg.lineLogin) throw channelMismatch();
  if (!/^U[0-9a-f]{32}$/i.test(identity?.sub || ""))
    throw fail(401, "Invalid LINE identity", "LINE_TOKEN_INVALID");
  return identity;
}
export async function staffAuth(email, password) {
  if (!cfg.publicKey) throw fail(503, "Supabase publishable key missing");
  const r = await fetch(
    cfg.url.replace(/\/$/, "") + "/auth/v1/token?grant_type=password",
    {
      method: "POST",
      headers: { apikey: cfg.publicKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!r.ok) throw fail(401, "Incorrect email or password");
  const x = await r.json();
  if (!x.user?.id || !x.access_token) throw fail(401, "Invalid staff login");
  return x.user;
}
export function flex(title, subtitle, entries, button) {
  return {
    type: "flex",
    altText: title,
    contents: {
      type: "bubble",
      size: "mega",
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "SUWAT / CLINIC",
            size: "xs",
            weight: "bold",
            color: "#124CB8",
          },
          { type: "text", text: title, size: "lg", weight: "bold", wrap: true },
          {
            type: "text",
            text: subtitle,
            size: "sm",
            color: "#445C77",
            wrap: true,
          },
          { type: "separator" },
          ...entries.map(([k, v]) => ({
            type: "box",
            layout: "horizontal",
            contents: [
              {
                type: "text",
                text: String(k),
                size: "sm",
                color: "#445C77",
                flex: 5,
              },
              {
                type: "text",
                text: String(v),
                size: "sm",
                align: "end",
                wrap: true,
                flex: 7,
              },
            ],
          })),
        ],
      },
      ...(button
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              contents: [
                {
                  type: "button",
                  style: "primary",
                  color: "#124CB8",
                  action: { type: "uri", label: button.label, uri: button.url },
                },
              ],
            },
          }
        : {}),
    },
  };
}
export async function queue(event, destination, to, payload) {
  if (!to) return;
  await insert("sw_notifications", {
    event_type: event,
    destination,
    to_id: to,
    payload,
  });
}
export async function staffGroup() {
  if (cfg.lineGroup) return cfg.lineGroup;
  return (
    (await first("sw_settings", { select: "value", key: "eq.staff_group_id" }))
      ?.value || ""
  );
}
async function queueClinicNotice(eventKey, kind, destination, to, data) {
  if (!to) return;
  await rpc("sw_clinic_queue", {
    p_key: eventKey,
    p_kind: kind,
    p_destination: destination,
    p_to: to,
    p_lang: "th",
    p_data: data,
    p_deadline: new Date(Date.now() + 86400000).toISOString(),
  });
}
export async function notifyGroup(eventKey, kind, data = {}) {
  await queueClinicNotice(eventKey, kind, "group", await staffGroup(), data);
}
export async function notifyBooker(bookingId, staff) {
  await queueClinicNotice(
    "booking:staff:created:" + bookingId + ":" + staff.id,
    "staff_booked",
    "staff",
    staff.line_user_id,
    { booking_id: bookingId },
  );
}
export async function notifyOrder(o, c, action = "created") {
  const th = c.preferred_lang !== "en";
  await queue(
    "order_" + action,
    "customer",
    c.line_user_id,
    flex(
      th ? "อัปเดตคำสั่งซื้อ" : "Order update",
      "Suwat Clinic",
      [
        [th ? "หมายเลข" : "Order", o.order_ref],
        [th ? "สถานะ" : "Status", o.status],
        ...(o.tracking_no ? [[th ? "พัสดุ" : "Tracking", o.tracking_no]] : []),
      ],
      cfg.baseUrl
        ? { label: th ? "ดูคำสั่งซื้อ" : "View order", url: cfg.baseUrl + "/orders" }
        : null,
    ),
  );
  const group = await staffGroup();
  if (action === "created" && group)
    await queue(
      "order_created",
      "group",
      group,
      flex(
        "New order",
        "Staff alert · Payment not yet verified",
        [
          ["Reference", o.order_ref],
          ["Status", o.status],
        ],
        cfg.baseUrl
          ? { label: "Staff dashboard", url: cfg.baseUrl + "/staff" }
          : null,
      ),
    );
}
const appointmentRelations =
  "slot:sw_slot_rules(start_time,end_time),branch:sw_clinic_locations(name_th,name_en)";
const patientColumns =
  ",patient_name,patient_phone,patient_id,customer_id,patient:sw_patients!sw_booking_patient_account_fk(hn)";
const isPrivateNotice = (destination) =>
  destination === "customer" || destination === "staff";

function visitDetails(booking) {
  return {
    booking_id: booking.id,
    ref: booking.booking_ref,
    date: booking.date,
    from: (booking.appointment_time || booking.slot?.start_time)?.slice(0, 5),
    until: booking.appointment_time
      ? null
      : booking.slot?.end_time?.slice(0, 5),
    status: booking.status,
    branch_id: booking.branch_id,
    branch_th: booking.branch?.name_th,
    branch_en: booking.branch?.name_en,
  };
}

function noticeRecord(cache, table, id, select, filters = {}) {
  const key = table + ":" + id + ":" + select;
  if (!cache.has(key))
    cache.set(key, first(table, { ...filters, id: "eq." + id, select }));
  return cache.get(key);
}

async function privateVisitDetails(booking, destination, cache) {
  if (!isPrivateNotice(destination)) return {};
  const hn = booking.patient?.hn || "";
  let returning = Boolean(hn);
  if (
    !returning &&
    booking.patient_id &&
    booking.customer_id &&
    isDate(booking.date)
  ) {
    const key = "visit-history:" + booking.patient_id + ":" + booking.date;
    if (!cache.has(key))
      cache.set(
        key,
        first("sw_bookings", {
          select: "id",
          patient_id: "eq." + booking.patient_id,
          customer_id: "eq." + booking.customer_id,
          date: "lt." + booking.date,
          status: "in.(checked_in,completed)",
        })
          .then(Boolean)
          .catch(() => false),
      );
    returning = await cache.get(key);
  }
  return {
    patient_name: booking.patient_name,
    patient_phone: validPhone(booking.patient_phone)
      ? booking.patient_phone
      : "",
    patient_hn: hn && destination === "customer" ? "•••• " + hn.slice(-4) : hn,
    returning_patient: returning,
  };
}

async function appointmentPayload(notification, cache) {
  const {
    event_type: kind,
    payload,
    event_key: key,
    destination,
  } = notification;
  const privateColumns = isPrivateNotice(destination) ? patientColumns : "";
  if (kind === "staff_reschedule") {
    const requestId = key?.match(/^reschedule:staff:(\d+):\d+$/)?.[1];
    if (!requestId) return payload;
    const change = await noticeRecord(
      cache,
      "sw_reschedule",
      requestId,
      "desired_date,desired_branch,booking:sw_bookings(id,booking_ref,date" +
        privateColumns +
        ")," +
        appointmentRelations,
      { status: "eq.pending" },
    );
    if (!change?.booking) return null;
    return {
      ...payload,
      ...visitDetails({
        ...change.booking,
        date: change.desired_date,
        appointment_time: null,
        branch_id: change.desired_branch,
        slot: change.slot,
        branch: change.branch,
      }),
      ...(await privateVisitDetails(change.booking, destination, cache)),
    };
  }

  // Existing staff/group notices may contain only the booking ID in their event key.
  const bookingId =
    payload.booking_id ??
    key?.match(/^booking:(?:group:new|staff):(\d+)(?::\d+)?$/)?.[1];
  if (!/^\d+$/.test(String(bookingId))) return payload;
  const booking = await noticeRecord(
    cache,
    "sw_bookings",
    bookingId,
    "id,booking_ref,date,appointment_time,status,branch_id,appointment_revision," +
      appointmentRelations +
      privateColumns +
      (privateColumns ? ",customer:sw_customers(line_user_id)" : ""),
  );
  if (
    !booking ||
    (notification.destination === "customer" &&
      booking.customer?.line_user_id !== notification.to_id) ||
    (payload.revision != null &&
      String(booking.appointment_revision) !== String(payload.revision)) ||
    (["staff_booking", "staff_booked"].includes(kind) &&
      ["cancelled", "no_show"].includes(booking.status))
  )
    return null;
  return {
    ...payload,
    ...visitDetails(booking),
    ...(await privateVisitDetails(booking, destination, cache)),
  };
}

export async function flush(max = 8) {
  if (!cfg.lineToken)
    return { sent: 0, processed: 0, reason: "LINE messaging not configured" };
  const claims = (await rpc("sw_claim_notifications", { p_limit: max })) || [];
  const appointments = new Map();
  const results = await Promise.allSettled(
    claims.map((notification) => sendNotification(notification, appointments)),
  );
  return {
    sent: results.filter((r) => r.status === "fulfilled" && r.value).length,
    processed: claims.length,
  };
}

async function sendNotification(notification, appointments) {
  const n = notification;
  const appointment = isAppointmentNotice(n);
  const staffId = appointment ? n.event_key?.match(/:(\d+)$/)?.[1] : null;
  const lease = {
    id: "eq." + n.id,
    status: "eq.processing",
    locked_at: "eq." + n.locked_at,
  };
  if (
    n.destination === "staff" &&
    !(await first("sw_staff", {
      select: "id",
      active: "eq.true",
      line_user_id: "eq." + n.to_id,
      ...(appointment ? { role: "in.(owner,reception)" } : {}),
      ...(staffId ? { id: "eq." + staffId } : {}),
      ...(n.event_type === "staff_refill"
        ? { clinical_access: "eq.true" }
        : {}),
    }))
  ) {
    await patch("sw_notifications", lease, {
      status: "failed",
      last_error: "Staff LINE link inactive",
      locked_at: null,
    });
    return false;
  }
  let accepted = false,
    transient = true,
    reason = "LINE connection error";
  try {
    const payload = appointment
      ? await appointmentPayload(n, appointments)
      : n.payload;
    if (!payload) {
      await patch("sw_notifications", lease, {
        status: "failed",
        last_error: "Appointment no longer available",
        locked_at: null,
      });
      return false;
    }
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.lineToken,
        ...(n.retry_key ? { "X-Line-Retry-Key": n.retry_key } : {}),
      },
      body: JSON.stringify({
        to: n.to_id,
        messages: [clinicLine({ ...n, payload }, cfg)],
      }),
      signal: AbortSignal.timeout(4800),
    });
    accepted =
      response.ok ||
      (response.status === 409 &&
        !!response.headers.get("x-line-accepted-request-id"));
    transient = response.status >= 500 || response.status === 429;
    reason = "LINE HTTP " + response.status;
    await response.body?.cancel();
  } catch {}
  if (accepted) {
    await patch("sw_notifications", lease, {
      status: "sent",
      sent_at: iso(),
      last_error: "",
      locked_at: null,
    });
    return true;
  }
  const next = new Date(Date.now() + Math.min(2 ** n.attempts, 60) * 60000);
  const retry =
    transient && n.attempts < 5 && (!n.deadline || next < new Date(n.deadline));
  await patch("sw_notifications", lease, {
    status: retry ? "pending" : "failed",
    last_error: reason,
    locked_at: null,
    available_at: next.toISOString(),
  });
  return false;
}
