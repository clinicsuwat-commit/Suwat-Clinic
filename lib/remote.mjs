import { clinicLine } from "./clinic-line.mjs";
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
  lineLogin: env("LINE_LOGIN_CHANNEL_ID"),
  liffId: env("LINE_LIFF_ID"),
  lineToken: env("LINE_CHANNEL_ACCESS_TOKEN"),
  lineSecret: env("LINE_CHANNEL_SECRET"),
  lineGroup: env("LINE_STAFF_GROUP_ID"),
  lineOaUrl: env("LINE_OA_URL"),
  baseUrl: env("PUBLIC_BASE_URL"),
  cronSecret: env("CRON_SECRET"),
  production: env("NODE_ENV") === "production",
};
export function fail(status, message) {
  const e = new Error(message);
  e.status = status;
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
  { query = {}, method = "GET", value, returning = false, upsert = false } = {},
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
  const raw = await resp.text();
  return raw ? JSON.parse(raw) : null;
}
export const rows = (table, query = {}) => rest(table, { query });
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
  if (!cfg.lineLogin) throw fail(503, "LINE Login channel not configured");
  if (typeof idToken !== "string" || idToken.length > 4000)
    throw fail(400, "Invalid LINE token");
  const r = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ id_token: idToken, client_id: cfg.lineLogin }),
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw fail(401, "Invalid LINE identity");
  const x = await r.json();
  if (String(x.aud) !== cfg.lineLogin || !/^U[0-9a-f]{32}$/i.test(x.sub || ""))
    throw fail(401, "LINE identity mismatch");
  return x;
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
export async function notifyGroup(eventKey, kind) {
  const group = await staffGroup();
  if (!group) return;
  await rpc("sw_clinic_queue", {
    p_key: eventKey,
    p_kind: kind,
    p_destination: "group",
    p_to: group,
    p_lang: "th",
    p_data: {},
    p_deadline: new Date(Date.now() + 86400000).toISOString(),
  });
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
export async function flush(max = 8) {
  if (!cfg.lineToken)
    return { sent: 0, processed: 0, reason: "LINE messaging not configured" };
  const claims = (await rpc("sw_claim_notifications", { p_limit: max })) || [];
  const results = await Promise.allSettled(claims.map(sendNotification));
  return {
    sent: results.filter((r) => r.status === "fulfilled" && r.value).length,
    processed: claims.length,
  };
}

async function sendNotification(notification) {
  const n = notification;
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
    const response = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + cfg.lineToken,
        ...(n.retry_key ? { "X-Line-Retry-Key": n.retry_key } : {}),
      },
      body: JSON.stringify({ to: n.to_id, messages: [clinicLine(n, cfg)] }),
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
