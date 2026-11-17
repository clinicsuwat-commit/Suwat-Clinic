import { createMedicationUI } from "./medication.js";

export function createCareUI(api) {
  const {
    root,
    t,
    loc,
    ico,
    esc,
    today,
    later,
    displayDate,
    request,
    post,
    state,
    render,
    sending,
    toast,
    statusTag,
    sectionHeader,
    loginPrompt,
    staffActions,
    linkStaffLine,
    refreshApp,
  } = api;
  let data = null;
  let med = null;
  let desk = null;
  let permissions = [];
  let failure = "";
  let bookingSlots = [];
  let conflicts = [];
  let focusPatient = "";
  let date = later(1);
  let note = "";
  let selected = "";
  let bookingKey = "";
  let bookingResult = null;
  let branch = "";
  let deskBranch = "";
  let stockBranch = "";
  let medicineStock = null;
  let dispensingStock = [];
  let followedRefill = "";
  let locationList = [
    {
      id: "ubon",
      name_th: "สาขาอุบล",
      name_en: "Ubon Ratchathani",
      map_url: "",
    },
    { id: "yasothon", name_th: "สาขายโสธร", name_en: "Yasothon", map_url: "" },
  ];
  let medsFilter = "";
  let stepKey = 0;
  let followedLink = "";
  let modal = null;
  let modalFocus = null;
  let stream = null;
  let cameraEpoch = 0;
  let cameraFrame = 0;
  let code = "";
  let ctx = null;
  let scanTimer = 0;
  const active = ["pending", "confirmed", "checked_in"];
  const cp = "/api/clinic/";
  const sp = "/api/staff/clinic/";
  const fee = () => loc("150 บาท", "฿150");
  const shortTime = (value) => String(value || "").slice(0, 5);
  const clinicClock = () =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());

  const relationLabel = (relation) =>
    ({
      self: loc("ตัวเอง", "Self"),
      child: loc("บุตร", "Child"),
      parent: loc("บิดา / มารดา", "Parent"),
      dependent: loc("ผู้ที่ดูแล", "Dependent"),
    })[relation] || "";
  const refillStatus = (status) =>
    ({
      pending: loc("รอคลินิกทบทวน", "Waiting for clinic review"),
      contacted: loc("ดำเนินการติดต่อแล้ว", "Clinic has contacted you"),
      visit_required: loc("กรุณานัดพบคลินิก", "Visit required"),
      declined: loc("คลินิกปิดคำขอ", "Request declined"),
      withdrawn: loc("ถอนคำขอแล้ว", "Withdrawn"),
    })[status] || status;
  const errorMessages = {
    BRANCH_REQUIRED: ["เลือกสาขาคลินิกก่อน", "Choose a clinic branch."],
    BRANCH_ALREADY_ASSIGNED: [
      "นัดนี้มีสาขาแล้ว หากต้องการเปลี่ยนให้ดำเนินการผ่านการเลื่อนนัด",
      "This appointment already has a branch. Use rescheduling to change it.",
    ],
    MAP_URL_INVALID: [
      "กรุณาวางลิงก์ HTTPS จาก Google Maps",
      "Paste an HTTPS link from Google Maps.",
    ],
    MED_SCHEDULE_INVALID: [
      "ตรวจจำนวนเม็ดต่อครั้ง จำนวนครั้งต่อวัน และวันที่เริ่มใช้ตามใบสั่ง",
      "Check the tablet count per dose, daily frequency and start date.",
    ],
    MED_STOCK_SHORT: [
      "สต็อกสาขานี้ไม่พอ กรุณาตรวจยอดและล็อตก่อนบันทึก",
      "The selected branch does not have enough stock. Check the lots and counts.",
    ],
    MED_NOT_FOUND: [
      "ไม่พบรายการยานี้ในสต็อก",
      "The medication was not found in stock.",
    ],
    MED_DUPLICATE: [
      "ยารายการเดิมปรากฏมากกว่าหนึ่งครั้ง กรุณาตรวจใบสั่ง",
      "The same medication was selected twice. Check the prescription.",
    ],
    MED_BRANCH_MISMATCH: [
      "สาขาจ่ายยาต้องตรงกับสาขาที่นัด",
      "The dispensing branch must match the appointment.",
    ],
    MED_STOCK_INVALID: [
      "ตรวจชื่อยา จำนวน เลขล็อต และวันหมดอายุ",
      "Check the medication name, quantity, lot and expiry date.",
    ],
    MED_LOT_CONFLICT: [
      "เลขล็อตนี้มีวันหมดอายุอื่นหรือมียอดเกินขีดจำกัด",
      "This lot already has a different expiry date or exceeds the quantity limit.",
    ],
    MED_EXISTS: [
      "มีชื่อยาและความแรงนี้ในรายการแล้ว",
      "This medication and strength already exist.",
    ],
    REFILL_CONFIRM_REQUIRED: [
      "ยืนยันคำขอก่อนส่งให้คลินิก",
      "Confirm the request before sending it to the clinic.",
    ],

    BOOKING_DUPLICATE: [
      "คนไข้คนนี้มีนัดในวันดังกล่าวแล้ว กดดูนัดเดิมหรือขอเลื่อนนัดได้",
      "This patient already has an appointment that day. Open the existing appointment to view or reschedule it.",
    ],
    BOOKING_DATE_INVALID: [
      "เลือกวันที่ภายใน 90 วันข้างหน้า",
      "Choose a date within the next 90 days.",
    ],
    BOOKING_TIME_INVALID: [
      "เลือกเวลาภายในช่วงที่เปิดให้จองและยังมาไม่ถึง",
      "Select a future time within the chosen window.",
    ],
    PHONE_REQUIRED: [
      "กรุณาบันทึกเบอร์ติดต่อในบัญชีคนไข้ก่อน",
      "Save a contact phone in the patient account first.",
    ],
    PHONE_INVALID: [
      "กรอกเบอร์โทร 10 หลัก เช่น 0812345678",
      "Enter a 10-digit Thai contact number.",
    ],
    POSTAL_INVALID: ["กรอกรหัสไปรษณีย์ 5 หลัก", "Enter a five-digit postal code."],
    PATIENT_NOT_FOUND: [
      "ไม่พบโปรไฟล์ผู้ป่วยที่เลือก",
      "The selected patient profile was not found.",
    ],
    PATIENT_NAME_INVALID: [
      "กรอกชื่อและนามสกุลที่ใช้กับคลินิก",
      "Enter the name used at the clinic.",
    ],
    SELF_EXISTS: [
      "มีโปรไฟล์ตัวเองอยู่แล้ว",
      "Your own patient profile already exists.",
    ],
    PROFILES_LIMIT: [
      "บัญชีนี้เพิ่มโปรไฟล์ครบแล้ว",
      "This account has reached the profile limit.",
    ],
    QR_INVALID: [
      "รหัสไม่ตรงรูปแบบ กรุณาเปิด QR จากบัญชีคนไข้",
      "Use a QR or code from a clinic patient account.",
    ],
    QR_EXPIRED: [
      "QR หมดอายุแล้ว ให้คนไข้เปิดบัตร QR ใหม่",
      "Ask the patient to open a fresh QR card.",
    ],
    HN_REQUIRED: [
      "ผูก HN ก่อนดำเนินการต่อ",
      "Link the patient record number first.",
    ],
    HN_IN_USE: [
      "HN นี้ผูกกับโปรไฟล์อื่นแล้ว กรุณาตรวจทะเบียนคลินิก",
      "This HN is already linked. Check the clinic register.",
    ],
    HN_ALREADY_LINKED: [
      "โปรไฟล์นี้มี HN แล้ว กรุณาตรวจทะเบียนคลินิก",
      "The profile already has an HN. Check the clinic register.",
    ],
    HN_INVALID: [
      "กรอก HN ให้ตรงทะเบียนคลินิก เช่น 001234 หรือ OP-0123",
      "Enter the HN as listed in the clinic register.",
    ],
    PATIENT_CONFIRM_REQUIRED: [
      "ตรวจชื่อและ HN แล้วทำเครื่องหมายยืนยัน",
      "Match the patient name and HN before confirming.",
    ],
    VISIT_PATIENT_MISMATCH: [
      "ข้อมูลคนไข้ไม่ตรงกับนัด กรุณาตรวจทะเบียนและชื่อในนัด",
      "The appointment and profile do not match. Check the register and appointment name.",
    ],
    VISIT_NOT_READY: [
      "นัดนี้ยังทำรายการดังกล่าวไม่ได้ กรุณาตรวจสถานะล่าสุด",
      "Check the latest appointment status before continuing.",
    ],
    SLOT_FULL: [
      "คิวเต็มแล้ว กรุณาเลือกช่วงอื่นหรือเข้าแถวคิวสำรอง",
      "This time window is full. Pick another time or join the waitlist.",
    ],
    SLOT_CLOSED: ["ช่วงเวลานี้ปิดรับคิว", "This time window is closed."],
    SLOT_ALREADY_OPEN: [
      "ช่วงนี้มีคิวว่างแล้ว สามารถกดจองได้",
      "A slot is available now. Use the booking form.",
    ],
    OFFER_NOT_AVAILABLE: [
      "หมดเวลารับคิว กรุณาเลือกนัดใหม่",
      "The offer is no longer available. Choose another appointment.",
    ],
    RESCHEDULE_SLOT_INVALID: [
      "ช่วงเวลาที่ขอเต็มหรือปิดแล้ว กรุณาเลือกใหม่",
      "The requested time is unavailable. Choose another window.",
    ],
    RESCHEDULE_ALREADY_PENDING: [
      "มีคำขอเลื่อนนัดรอพิจารณาอยู่แล้ว",
      "A reschedule request is already pending.",
    ],
    CLINICAL_ACCESS_REQUIRED: [
      "ต้องใช้บัญชีที่กำหนดสิทธิ์บันทึกและทบทวนการจ่ายยา",
      "Use an account with clinical record access.",
    ],
    DISPENSE_ALREADY_RECORDED: [
      "บันทึกการจ่ายยาของนัดนี้แล้ว",
      "The medication set has already been recorded for this visit.",
    ],
    DISPENSE_INVALID: [
      "ตรวจชื่อยา จำนวน หน่วย และเลขอ้างอิงให้ครบ",
      "Check the medication items, quantities, units and reference.",
    ],
    REFILL_WINDOW_INVALID: [
      "ตรวจวันเริ่มและวันสิ้นสุดที่เปิดรับคำขอ",
      "Check the start and end dates for refill requests.",
    ],
    REFILL_NOT_AVAILABLE: [
      "ชุดยานี้ยังเปิดรับคำขอไม่ได้ กรุณาติดต่อคลินิก",
      "This set is unavailable for requests. Contact the clinic.",
    ],
    REFILL_ALREADY_PENDING: [
      "มีคำขอชุดนี้ที่คลินิกกำลังทบทวนอยู่",
      "The clinic is already reviewing a request for this set.",
    ],
    REFILL_NOT_PENDING: [
      "คำขอนี้ถูกดำเนินการแล้ว กรุณาโหลดข้อมูลล่าสุด",
      "This request has already been updated. Reload the latest details.",
    ],
    STAFF_LINE_USED: [
      "LINE นี้ผูกกับบัญชีสตาฟอื่นแล้ว",
      "This LINE account is linked to another staff account.",
    ],
    STAFF_LINE_UNLINK_FIRST: [
      "ยกเลิกการผูกบัญชีเดิมก่อนเชื่อม LINE ใหม่",
      "Unlink the previous account before linking another LINE account.",
    ],
    CHECKIN_USE_QR: [
      "เปิดสแกน QR เพื่อยืนยันคนไข้และเช็กอิน",
      "Scan the patient QR to verify identity and check in.",
    ],
    REQUEST_INVALID: [
      "กรุณาตรวจข้อมูลที่กรอก แล้วลองใหม่",
      "Check the information and try again.",
    ],
  };

  const errorText = (error) => {
    const pair = errorMessages[error?.message];
    return pair
      ? loc(...pair)
      : error?.message || loc("เกิดข้อผิดพลาด", "Something went wrong");
  };
  const msg = (body, style = "") =>
    `<div class="care-note ${style}" role="${style === "attention" ? "alert" : "status"}">${ico(style === "attention" ? "info" : "check")}<span>${body}</span></div>`;
  const btn = (action, title, icon = "", style = "outline", value = "") =>
    `<button type="button" class="btn ${style}" data-care="${action}" data-value="${esc(value)}">${icon ? ico(icon) : ""}${title}</button>`;
  const nextButton = (title, icon = "arrow") =>
    `<button type="submit" class="btn primary">${title}${ico(icon)}</button>`;
  const field = (name, label, attrs = "", type = "text") =>
    `<label class="care-field"><span>${label}</span><input class="input" type="${type}" name="${name}" ${attrs}></label>`;
  const empty = (icon, title, button = "") =>
    `<div class="card care-empty">${ico(icon)}<p>${title}</p>${button}</div>`;
  const errorCard = () =>
    failure
      ? msg(esc(failure), "attention")
      : `<div class="card care-skeleton" aria-busy="true" aria-label="${t("wait")}"></div>`;
  const freshKey = () =>
    crypto.randomUUID?.() ||
    [...crypto.getRandomValues(new Uint8Array(16))]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("");
  const timeText = (b) =>
    b.appointment_time
      ? shortTime(b.appointment_time)
      : b.slot?.start_time
        ? shortTime(b.slot.start_time) + "–" + shortTime(b.slot.end_time)
        : b.slot_key || b.desired_slot || "";
  const appointmentText = (b) => displayDate(b.date) + " · " + timeText(b);
  const dateInput = (name) =>
    `type="date" name="${name}" min="${today()}" max="${later(90)}" required`;
  const bookingBadges = (b) =>
    `${statusTag(b.status)}${b.attending_at ? `<span class="tag">${loc("ยืนยันว่าจะมา", "Attendance confirmed")}</span>` : ""}`;

  function branchName(id) {
    const b = locationList.find((l) => l.id === id);
    return b
      ? loc(b.name_th, b.name_en)
      : loc("ยังไม่ระบุสาขา", "Branch unassigned");
  }
  function branchSelect(
    name,
    value,
    change = "",
    required = false,
    includeAll = false,
  ) {
    return `<label class="care-field branch-field"><span>${loc("สาขาคลินิก", "Clinic branch")}</span>
      <select class="select" name="${name}" data-care-change="${change}" ${required ? "required" : ""}>
        <option value="">${includeAll ? loc("ทุกสาขา", "All branches") : loc("เลือกสาขา", "Choose a branch")}</option>
        ${locationList.map((l) => `<option value="${esc(l.id)}" ${l.id === value ? "selected" : ""}>${esc(loc(l.name_th, l.name_en))}</option>`).join("")}
      </select></label>`;
  }
  function mapLink(id) {
    if (!locationList.some((l) => l.id === id)) return "";
    const row = locationList.find((l) => l.id === id);
    return `<a class="btn outline branch-map-link" href="/api/locations/${esc(id)}/map" target="_blank" rel="noopener">${ico("location")}${row?.map_url ? loc("เปิดแผนที่สาขา", "Open clinic map") : loc("ค้นหาแผนที่สาขา", "Find clinic on map")}</a>`;
  }
  function branchPicker() {
    return `<fieldset class="branch-picker"><legend>${loc("เลือกสาขาคลินิก", "Choose a clinic branch")}</legend><div>
      ${locationList
        .map(
          (
            l,
          ) => `<label class="branch-choice ${l.id === branch ? "selected" : ""}">
        <input type="radio" name="branch_id" value="${esc(l.id)}" data-care-change="booking-branch" ${l.id === branch ? "checked" : ""} required>
        <span class="tile-icon">${ico("location")}</span><strong>${esc(loc(l.name_th, l.name_en))}</strong>
      </label>`,
        )
        .join("")}</div></fieldset>`;
  }
  async function refreshLocations() {
    const result = await request("/api/locations");
    if (Array.isArray(result.locations) && result.locations.length)
      locationList = result.locations;
  }
  function locationSettings() {
    return `<section class="card clinical-section"><h3>${loc("สาขาและแผนที่", "Branches and maps")}</h3>
      <p class="muted">${loc("วางลิงก์แชร์พิกัดจาก Google Maps ของแต่ละสาขา ระบบใช้ลิงก์ล่าสุดเมื่อคนไข้กดจาก LINE", "Paste the Google Maps share link for each branch. LINE buttons open the latest saved location.")}</p><div class="location-settings">
      ${locationList
        .map(
          (
            l,
          ) => `<form class="care-form" data-care-form="location-map" data-id="${esc(l.id)}"><h4>${ico("location")}${esc(branchName(l.id))}</h4>
        ${field("map_url", loc("ลิงก์ Google Maps", "Google Maps link"), `maxlength="1000" placeholder="https://maps.app.goo.gl/…" value="${esc(l.map_url)}"`, "url")}
        <div class="care-actions">${nextButton(loc("บันทึกแผนที่", "Save map"), "check")}${mapLink(l.id)}</div></form>`,
        )
        .join("")}</div></section>`;
  }
  const medicationUI = createMedicationUI({
    loc,
    esc,
    ico,
    today,
    displayDate,
    field,
    btn,
    msg,
    nextButton,
    branchSelect,
    branchName,
  });
  function staffStock() {
    return medicationUI.inventory(stockBranch, medicineStock);
  }
  async function fetchStock(branchId) {
    if (!branchId) return [];
    const result = await request(
      sp + "medication-stock?branch=" + encodeURIComponent(branchId),
    );
    return result.drugs;
  }
  async function changeStockBranch(value) {
    stockBranch = value;
    medicineStock = value ? await fetchStock(value) : null;
    render();
  }

  function duplicateBox(list) {
    if (!list.length) return "";
    return msg(
      `<strong>${loc("พบรายการนัดที่อาจซ้ำ", "Possible duplicate appointments")}</strong><br>${list.map((d) => `${esc(d.name)} · ${displayDate(d.date)} · ${esc(d.refs.join(" / "))}`).join("<br>")}`,
      "attention",
    );
  }

  function home() {
    const next = data?.bookings
      .filter((b) => b.date >= today() && active.includes(b.status))
      .sort((a, b) => a.date.localeCompare(b.date))[0];
    const service = (path, icon, title, text, style = "") =>
      `<button type="button" class="service-tile ${style}" data-nav="${path}"><span class="tile-icon">${ico(icon)}</span><span class="tile-go">${ico("arrow")}</span><strong>${title}</strong><span>${text}</span></button>`;
    return `<div class="home-bento">
      <section class="clinic-hero"><div class="hero-waves" aria-hidden="true"><i></i><i></i><i></i><b></b></div><div class="hero-text">
        <p class="hero-label"><span></span> ${loc("บริการออนไลน์ของคลินิก", "ONLINE CLINIC SERVICES")}</p>
        <h1>${loc("นัดหมายสะดวก<br><em>ดูแลต่อเนื่อง</em>", "Book your visit.<br><em>Stay connected.</em>")}</h1>
        <div class="hero-buttons"><button class="btn white" data-nav="/booking">${ico("calendar")}${loc("จองคิว", "Book a visit")}${ico("arrow")}</button><button class="btn hero-outline" data-nav="/appointments">${loc("ดูนัดของฉัน", "My appointments")}</button></div>
      </div></section>
      <section class="next-tile"><span class="tile-icon">${ico("clock")}</span><h2>${loc("นัดครั้งถัดไป", "Your next appointment")}</h2>
        ${
          next
            ? `<p class="next-date">${displayDate(next.date)}</p><p class="next-copy">${esc(timeText(next))} · ${esc(branchName(next.branch_id))} · ${esc(next.patient_name)}</p>${bookingBadges(next)}`
            : `<p class="next-copy">${state().customer ? loc("ยังไม่มีนัดที่กำลังจะมาถึง", "No upcoming appointments") : loc("เข้าสู่ระบบด้วย LINE เพื่อดูวันนัดและสถานะ", "Open with LINE to see your date and status.")}</p>`
        }
        <button class="text-link" data-nav="${next ? "/appointments" : state().customer ? "/booking" : "/account"}">${next ? loc("ดูรายละเอียด", "View details") : state().customer ? loc("เลือกวันนัด", "Choose a date") : loc("เข้าสู่ระบบ", "Sign in")}${ico("arrow")}</button>
      </section>
      ${data?.duplicates.length ? `<div class="home-wide">${duplicateBox(data.duplicates)}</div>` : ""}
      ${service("/account", "qr", loc("บัตรคนไข้ QR", "Patient QR card"), loc("เปิดบัตรเพื่อให้เจ้าหน้าที่สแกน", "Open your card for staff to scan"), "soft-blue")}
      ${service("/medications", "pill", loc("ประวัติการจ่ายยา", "Medication history"), loc("ดูประวัติและคำขอชุดเดิม", "View past medication sets and requests"))}
      ${service("/shop", "shop", loc("ร้านค้าคลินิก", "Clinic shop"), loc("เลือกดูผลิตภัณฑ์", "Browse clinic products"))}
      ${service("/orders", "package", loc("คำสั่งซื้อ", "My orders"), loc("ติดตามคำสั่งซื้อสินค้า", "Track shop orders"))}
      <button class="service-tile contact-tile" data-care="contact"><span class="tile-icon">${ico("chat")}</span><span class="tile-go">${ico("arrow")}</span><strong>${loc("ติดต่อคลินิก", "Contact clinic")}</strong><span>${loc("สอบถามผ่าน LINE ของคลินิก", "Reach the clinic on LINE")}</span></button>
    </div>`;
  }

  function accountCards() {
    if (!data) return errorCard();
    const list = data.patients
      .map(
        (
          p,
        ) => `<div class="identity-row"><span class="tile-icon">${ico("user")}</span><div>
       <strong>${esc(p.full_name)}</strong><small>${relationLabel(p.relation)} · ${p.hn_linked ? `HN ••••${esc(p.hn_tail)}` : loc("รอผูก HN ที่คลินิก", "HN verification at clinic")}</small></div>${btn("qr", loc("เปิด QR", "Show QR"), "qr", "soft", p.id)}</div>`,
      )
      .join("");
    return `<section class="card care-account"><div class="care-heading"><div><h3>${loc("บัตรคนไข้และครอบครัว", "Patient cards")}</h3><p>${loc("เพิ่มชื่อจริงที่ใช้กับคลินิก แล้วเปิดบัตร QR ให้สตาฟผูก HN", "Add the name used at the clinic, then show your QR to staff to link an HN.")}</p></div>${btn("add-patient", loc("เพิ่มคนไข้", "Add patient"), "plus", "primary")}</div>${list || msg(loc("เพิ่มโปรไฟล์ตัวเองหรือคนที่คุณดูแล", "Add your own profile or a person you look after."))}</section>`;
  }

  function bookingPage() {
    const heading = sectionHeader(
      loc("จองคิวคลินิก", "Book a visit"),
      loc(
        "เลือกคนไข้ สาขา วัน และช่วงเวลาที่สะดวก",
        "Choose the patient, branch, date and time window.",
      ),
    );
    if (!state().customer) return heading + loginPrompt();
    if (!data) return heading + errorCard();
    if (bookingResult) {
      return (
        heading +
        `<section class="card confirmation"><span class="big-check">${ico("check")}</span><h2>${loc("ส่งคำขอนัดแล้ว", "Appointment request sent")}</h2><p>${esc(bookingResult.booking_ref)} · ${displayDate(bookingResult.date)} · ${esc(branchName(bookingResult.branch_id))}</p>${statusTag(bookingResult.status)}<div class="care-actions"><button class="btn primary" data-nav="/appointments">${loc("ดูนัดของฉัน", "My appointments")}${ico("arrow")}</button>${mapLink(bookingResult.branch_id)}</div></section>`
      );
    }
    if (!data.patients.length) return heading + accountCards();
    if (!state().customer.phone)
      return (
        heading +
        empty(
          "user",
          loc(
            "บันทึกเบอร์ติดต่อในบัญชีก่อนจองคิว",
            "Save your phone in My account before booking.",
          ),
          `<button class="btn primary" data-nav="/account">${t("account")}</button>`,
        )
      );
    const options = data.patients
      .map(
        (p) =>
          `<option value="${p.id}" ${String(p.id) === focusPatient ? "selected" : ""}>${esc(p.full_name)} · ${relationLabel(p.relation)}</option>`,
      )
      .join("");
    const slot = bookingSlots.find((s) => s.key === selected);
    const tiles = bookingSlots
      .map(
        (
          s,
        ) => `<div class="visit-slot ${selected === s.key ? "is-selected" : ""}"><button type="button" data-care="slot" data-value="${esc(s.key)}" ${s.closed || s.left < 1 || conflicts.length ? "disabled" : ""} aria-pressed="${selected === s.key}">
      <strong>${esc(loc(s.label_th, s.label_en))}</strong><span>${esc(s.start)}–${esc(s.end)}</span><small>${s.closed ? t("closed") : s.left < 1 ? t("full") : loc("ว่าง " + s.left + " คิว", s.left + " open")}</small>
    </button>${!s.closed && s.left < 1 && !conflicts.length && (date > today() || s.start > clinicClock()) ? btn("join-wait", loc("เข้าคิวสำรอง", "Join waitlist"), "bell", "soft", s.key) : ""}</div>`,
      )
      .join("");
    return (
      heading +
      `<div class="two-col care-book"><section class="card"><form data-care-form="booking">
      ${branchPicker()}
      <div class="care-fields"><label class="care-field"><span>${loc("คนไข้", "Patient")}</span><select class="select" name="patient" data-care-change="patient">${options}</select></label>
      <label class="care-field"><span>${loc("วันนัด", "Appointment date")}</span><input class="input" ${dateInput("date")} value="${esc(date)}" data-care-change="booking-date"></label></div>
      ${conflicts.length ? msg(`<strong>${loc("มีนัดในวันเดียวกันแล้ว", "You already have a visit that day")}</strong><br>${esc(conflicts.map((b) => b.booking_ref).join(" · "))} <button type="button" class="text-link" data-nav="/appointments">${loc("ดูนัดหรือขอเลื่อน", "View or reschedule")}${ico("arrow")}</button>`, "attention") : ""}
      <h3 class="care-subhead">${loc("ช่วงเวลา", "Time window")}</h3><div class="visit-slots">${tiles || `<p class="muted">${branch ? loc("ยังไม่มีช่วงเวลาที่เปิดให้จอง", "There are no booking windows to show.") : loc("เลือกสาขาเพื่อดูคิวว่าง", "Choose a branch to see available times.")}</p>`}</div>
      <label class="care-field"><span>${loc("ฝากข้อความถึงคลินิก (ถ้ามี)", "Message to the clinic (optional)")}</span><textarea class="textarea" name="note" maxlength="500" data-care-input="booking-note">${esc(note)}</textarea></label>
      <div class="care-actions"><button type="submit" class="btn primary" ${!branch || !slot || conflicts.length ? "disabled" : ""}>${loc("ส่งคำขอนัด", "Send booking request")}${ico("arrow")}</button></div>
      </form></section><aside class="card care-side"><span class="tile-icon">${ico("bell")}</span><h3>${loc("แจ้งเตือนผ่าน LINE", "LINE reminders")}</h3><p>${loc("เมื่อคลินิกยืนยันนัด ระบบเตือนก่อนวันนัด 1 วัน และเช้าวันนัด", "Once confirmed, we remind you the day before and on the morning of your visit.")}</p>
      ${state().config.lineOaUrl ? `<a class="text-link" href="${esc(state().config.lineOaUrl)}" target="_blank" rel="noopener">${loc("เพิ่ม LINE OA ของคลินิก", "Add the clinic LINE account")}${ico("arrow")}</a>` : ""}</aside></div>`
    );
  }

  function appointmentsPage() {
    const heading = sectionHeader(
      loc("การนัดหมายของฉัน", "My appointments"),
      loc(
        "ดูนัด ยืนยันว่าจะมา หรือส่งคำขอเลื่อนนัด",
        "View, confirm or request a change.",
      ),
    );
    if (!state().customer) return heading + loginPrompt();
    if (!data) return heading + errorCard();
    const deep = new URLSearchParams(location.search).get("booking");
    const list = [...data.bookings].sort((a, b) => {
      const rank = (v) =>
        String(v.id) === deep
          ? 0
          : v.date >= today() && active.includes(v.status)
            ? 1
            : 2;
      const order = rank(a) - rank(b);
      return (
        order ||
        (rank(a) === 1
          ? a.date.localeCompare(b.date)
          : b.date.localeCompare(a.date))
      );
    });
    const visits = list
      .map((b) => {
        const current =
          b.date >= today() && ["pending", "confirmed"].includes(b.status);
        return `<article class="visit-card ${String(b.id) === deep ? "highlight-visit" : ""}">
        <div class="visit-heading"><span class="tile-icon">${ico("calendar")}</span><div><h3>${displayDate(b.date)} · ${esc(timeText(b))}</h3><p>${esc(b.patient_name)} · ${esc(b.booking_ref)} · ${esc(branchName(b.branch_id))}</p></div></div><div class="visit-status">${bookingBadges(b)}</div>
        ${b.reschedule ? msg(loc("รอพิจารณาขอเลื่อนไป ", "Change requested for ") + displayDate(b.reschedule.desired_date) + " · " + esc(branchName(b.reschedule.desired_branch))) : ""}
        ${
          current
            ? `<div class="care-actions">
          ${b.status === "confirmed" && !b.attending_at ? btn("attend", loc("ยืนยันว่าจะมา", "Confirm attendance"), "check", "primary", b.id) : ""}
          ${b.reschedule ? "" : btn("reschedule", loc("ขอเลื่อนนัด", "Reschedule"), "clock", "outline", b.id)}
          ${mapLink(b.branch_id)}
          <button class="btn outline" data-cancel-booking="${b.id}">${loc("ยกเลิกนัด", "Cancel visit")}</button>
        </div>`
            : ""
        }
      </article>`;
      })
      .join("");
    const waiting = data.waitlist
      .map((w) => {
        const pt = data.patients.find((p) => p.id === w.patient_id);
        const live =
          w.status === "offered" && new Date(w.offer_until) > new Date();
        const until = live
          ? new Date(w.offer_until).toLocaleTimeString(loc("th-TH", "en-GB"), {
              timeZone: "Asia/Bangkok",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          : "";
        return `<article class="visit-card"><div class="visit-heading"><span class="tile-icon">${ico("bell")}</span><div><h3>${displayDate(w.date)} · ${esc(timeText(w))}</h3><p>${esc(pt?.full_name || "")} · ${esc(branchName(w.branch_id))} · ${live ? loc("รับคิวได้ถึง ", "Accept by ") + esc(until) : w.status === "offered" ? loc("หมดเวลารับคิว", "Offer expired") : loc("รอคิวว่าง", "Waiting for a vacancy")}</p></div></div><div class="care-actions">${live ? btn("accept-wait", loc("รับคิวนี้", "Accept slot"), "check", "primary", w.id) : ""}${btn("leave-wait", loc("ออกจากคิวสำรอง", "Leave waitlist"), "", "outline", w.id)}</div></article>`;
      })
      .join("");
    return (
      heading +
      duplicateBox(data.duplicates) +
      `<div class="visit-grid">${visits || empty("calendar", t("nothingBooked"), `<button class="btn primary" data-nav="/booking">${t("startBooking")}</button>`)}</div>` +
      (waiting
        ? `<h2 class="care-subhead">${loc("คิวสำรองของฉัน", "My waitlist")}</h2><div class="visit-grid">${waiting}</div>`
        : "")
    );
  }

  function drugItems(items) {
    const times = (i) =>
      i.dose_half_units
        ? loc(
            i.dose_half_units / 2 +
              " เม็ด × " +
              i.times_daily +
              " เวลา" +
              (i.meal_timing === "after_food"
                ? " หลังอาหาร"
                : i.meal_timing === "before_food"
                  ? " ก่อนอาหาร"
                  : ""),
            i.dose_half_units / 2 +
              " tablets × " +
              i.times_daily +
              " per day" +
              (i.meal_timing === "after_food"
                ? " after meals"
                : i.meal_timing === "before_food"
                  ? " before meals"
                  : ""),
          )
        : "";
    return `<ul class="drug-list">${items
      .map(
        (i) => `<li><div><strong>${esc(i.name)}</strong>
      ${times(i) ? `<small>${esc(times(i))}${i.estimated_depletion_on ? " · " + displayDate(i.estimated_depletion_on) : ""}</small>` : ""}
      ${i.directions ? `<small>${esc(i.directions)}</small>` : ""}</div><b>${esc(i.quantity)} ${esc(i.unit === "tablet" ? loc("เม็ด", "tablets") : i.unit)}</b></li>`,
      )
      .join("")}</ul>`;
  }

  function medSetSummary(d) {
    return `<div class="med-set-summary"><span>${loc("ชุดยาตามบันทึกของคลินิก", "Medication set recorded by the clinic")}</span>
      ${d.estimated_depletion_on ? `<strong>${loc("คาดว่าใกล้หมด ", "Estimated low-supply date ")}${displayDate(d.estimated_depletion_on)}</strong>` : ""}</div>`;
  }

  function medicationsPage() {
    const title = sectionHeader(
      loc("ประวัติการจ่ายยา", "Medication history"),
      loc(
        "ดูชุดยาที่คลินิกบันทึกและติดตามคำขอชุดเดิม",
        "Review medication sets recorded by the clinic and track requests.",
      ),
    );
    if (!state().customer) return title + loginPrompt();
    if (!med) return title + errorCard();
    if (!med.patients.length)
      return (
        title +
        empty(
          "qr",
          loc(
            "นำบัตร QR ไปให้เจ้าหน้าที่ผูก HN เพื่อเปิดประวัติการจ่ายยา",
            "Show your QR to staff to link an HN and view medication history.",
          ),
          `<button class="btn primary" data-nav="/account">${loc("เปิดบัตรคนไข้", "Open patient card")}</button>`,
        )
      );
    const filter = `<label class="care-filter"><span>${loc("คนไข้", "Patient")}</span><select class="select" data-care-change="med-filter"><option value="">${loc("ทุกคน", "All patients")}</option>${med.patients.map((p) => `<option value="${p.id}" ${medsFilter === String(p.id) ? "selected" : ""}>${esc(p.full_name)}</option>`).join("")}</select></label>`;
    const selectedPatient = (v) =>
      !medsFilter || String(v.patient_id) === medsFilter;
    const ds = med.dispenses
      .filter(selectedPatient)
      .map((d) => {
        const pt = med.patients.find((p) => p.id === d.patient_id);
        const logDate = new Date(d.dispensed_at).toLocaleDateString(
          loc("th-TH", "en-GB"),
          { timeZone: "Asia/Bangkok", dateStyle: "medium" },
        );
        return `<article class="visit-card"><div class="visit-heading"><span class="tile-icon">${ico("pill")}</span><div><h3>${esc(logDate)}</h3><p>${esc(pt?.full_name || "")}</p></div></div>${medSetSummary(d)}
        ${
          d.can_request
            ? `<div class="care-actions">${btn("refill", loc("ขอสั่งยาชุดเดิม", "Request the same set"), "package", "primary", d.id)}</div>`
            : d.refill_from && d.refill_from > today()
              ? `<p class="muted">${loc("เปิดส่งคำขอได้ตั้งแต่ ", "Requests open on ")}${displayDate(d.refill_from)}</p>`
              : ""
        }
      </article>`;
      })
      .join("");
    const requests = med.requests
      .filter(selectedPatient)
      .map(
        (r) =>
          `<div class="identity-row"><span class="tile-icon">${ico("package")}</span><div><strong>${esc(r.ref)}</strong><small>${loc("ค่าส่ง ", "Shipping ")}${fee()}</small></div><span class="tag">${esc(refillStatus(r.status))}</span>${r.status === "pending" ? btn("refill-withdraw", loc("ถอนคำขอ", "Withdraw"), "", "outline", r.id) : ""}</div>`,
      )
      .join("");
    return (
      title +
      filter +
      `<div class="visit-grid">${ds || empty("pill", loc("ยังไม่มีบันทึกการจ่ายยา", "No medication records yet."))}</div>` +
      (requests
        ? `<section class="card refill-history"><h3>${loc("คำขอของฉัน", "My requests")}</h3>${requests}</section>`
        : "")
    );
  }

  function visitRows(bookings, withActions = true) {
    return (
      bookings
        .map(
          (b) =>
            `<div class="desk-row"><span class="desk-time">${esc(timeText(b))}</span><div><strong>${esc(b.patient_name)}</strong><small>${esc(b.booking_ref)} · ${esc(branchName(b.branch_id))}</small></div><div>${bookingBadges(b)}</div>${withActions ? staffActions(b) : ""}</div>`,
        )
        .join("") ||
      `<div class="care-empty"><p>${loc("ไม่มีรายการนัด", "No appointments")}</p></div>`
    );
  }

  function staffOverview(user) {
    if (!desk) return errorCard();
    const reviewCount = desk.refills.filter(
      (r) => r.status === "pending",
    ).length;
    return `<div class="desk-hero"><div><h2>${loc("งานหน้าคลินิก", "Front desk")}</h2><p>${loc("สแกนบัตรคนไข้เพื่อดูขั้นตอนถัดไป", "Scan a patient card to see the next action.")}</p></div>${btn("scanner", loc("สแกน QR คนไข้", "Scan patient QR"), "scan", "white")}</div>
      <div class="desk-metrics">${[
        [
          "calendar",
          desk.bookings.filter((b) => active.includes(b.status)).length,
          loc("นัดวันที่เลือก", "Selected day"),
        ],
        ["clock", desk.tomorrow.length, loc("นัดวันถัดไป", "Following day")],
        [
          "arrow",
          desk.requests.length,
          loc("รอพิจารณาเลื่อนนัด", "Reschedule requests"),
        ],
        [
          "bell",
          desk.reminders.sent,
          loc("LINE รับการเตือนแล้ว", "Reminders accepted by LINE"),
        ],
      ]
        .map(
          ([icon, n, label]) =>
            `<div class="desk-metric"><span class="tile-icon">${ico(icon)}</span><strong>${n}</strong><span>${label}</span></div>`,
        )
        .join("")}</div>
      ${duplicateBox(desk.duplicates)}
      ${desk.reminders.failed ? msg(loc("มีการแจ้งเตือนที่ส่งไม่สำเร็จหรือหมดเวลา ", "Failed or expired reminders: ") + desk.reminders.failed, "attention") : ""}
      <div class="desk-bento"><section class="card desk-main"><div class="care-heading"><div><h3>${loc("รายการนัด", "Appointments")}</h3><p>${displayDate(desk.date)}</p></div><div class="desk-filters">${branchSelect("desk_branch", deskBranch, "desk-branch", false, true)}<label class="care-field"><span>${loc("เลือกวัน", "Select day")}</span><input id="staffDate" class="input" type="date" value="${esc(desk.date)}"></label></div></div>${visitRows(desk.bookings)}</section>
        <section class="card"><h3>${loc("วันถัดไป", "Following day")}</h3>${visitRows(desk.tomorrow, false)}</section>
        <section class="card desk-main"><h3>${loc("คำขอเลื่อนนัด", "Reschedule requests")}</h3>${
          desk.requests
            .map(
              (
                r,
              ) => `<div class="identity-row"><span class="tile-icon">${ico("clock")}</span><div><strong>${esc(r.booking?.patient_name || "")} · ${esc(r.booking?.booking_ref || "")}</strong><small>${displayDate(r.booking?.date)} → ${displayDate(r.desired_date)} · ${esc(timeText(r))} · ${esc(branchName(r.desired_branch))}</small></div>
          ${btn("decide-reschedule", loc("อนุมัติ", "Accept"), "check", "soft", r.id + ":yes")}${btn("decide-reschedule", loc("คงนัดเดิม", "Keep original"), "", "outline", r.id + ":no")}</div>`,
            )
            .join("") ||
          `<p class="muted">${loc("ไม่มีคำขอที่รอพิจารณา", "No open requests.")}</p>`
        }</section>
        <section class="card">${staffLine(user)}${user.clinical_access ? `<div class="divider"></div><button class="text-link" data-tab="refills">${loc("คำขอชุดยาเดิม", "Medication set requests")} (${reviewCount}) ${ico("arrow")}</button>` : ""}</section>
      </div>`;
  }

  function staffLine(user) {
    return `<h3>${loc("LINE ของสตาฟ", "Staff LINE account")}</h3><p class="muted">${user.line_linked ? loc("ผูก LINE สำหรับรับแจ้งเตือนงานแล้ว", "Your LINE account is linked for staff updates.") : loc("ผูก LINE เพื่อรับแจ้งเตือนงานตามสิทธิ์ของคุณ", "Link LINE to receive updates for your role.")}</p>
      ${user.line_linked ? btn("staff-unlink", loc("ยกเลิกการผูก LINE", "Unlink LINE"), "", "outline") : btn("staff-link", loc("ผูก LINE", "Link LINE"), "chat", "soft")}`;
  }

  function staffRefills() {
    if (!desk) return errorCard();
    return `<section class="card"><h3>${loc("คำขอชุดยาเดิม", "Medication set requests")}</h3><p class="muted">${loc("ตรวจชุดยาต้นฉบับและบันทึกผลการติดต่อคนไข้", "Review the original recorded set and log the outcome.")}</p>
     ${desk.refills.map((r) => `<div class="identity-row"><span class="tile-icon">${ico("pill")}</span><div><strong>${esc(r.ref)}</strong><small>${esc(refillStatus(r.status))} · ${fee()}</small></div>${btn("refill-detail", loc("เปิดคำขอ", "Open request"), "arrow", "soft", r.id)}</div>`).join("") || `<p class="muted">${loc("ยังไม่มีคำขอ", "No requests yet.")}</p>`}</section>`;
  }

  function staffPermissions() {
    return `<section class="card"><div class="care-heading"><div><h3>${loc("สิทธิ์บันทึกและทบทวนยา", "Clinical record access")}</h3><p>${loc("กำหนดให้บุคลากรที่คลินิกมอบหมายหน้าที่ด้านยา", "Assign access to staff authorized by the clinic to handle medication records.")}</p></div>${btn("load-permissions", loc("โหลดรายชื่อ", "Load staff"), "users", "soft")}</div>
      ${permissions.map((s) => `<div class="identity-row"><span class="tile-icon">${ico("user")}</span><div><strong>${esc(s.display_name)}</strong><small>${s.clinical_access ? loc("มีสิทธิ์", "Access enabled") : loc("ยังไม่ได้กำหนดสิทธิ์", "Access disabled")}</small></div>${btn("set-permission", s.clinical_access ? loc("ถอนสิทธิ์", "Revoke") : loc("ให้สิทธิ์", "Grant"), "lock", "outline", s.id + ":" + !s.clinical_access)}</div>`).join("")}</section>`;
  }

  function stopCamera() {
    cameraEpoch++;
    cancelAnimationFrame(cameraFrame);
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  function closeModal(restore = true) {
    stopCamera();
    clearInterval(scanTimer);
    if (modal) modal.remove();
    modal = null;
    root.inert = false;
    if (restore && modalFocus?.isConnected) modalFocus.focus();
    modalFocus = null;
    code = "";
    ctx = null;
  }

  function overlay(title, html, wide = false) {
    stopCamera();
    clearInterval(scanTimer);
    if (!modal) {
      modalFocus = document.activeElement;
      modal = document.createElement("div");
      modal.className = "care-layer";
      document.body.append(modal);
      root.inert = true;
    }
    modal.innerHTML = `<section class="care-dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="care-dialog-title" tabindex="-1">
      <header class="dialog-header"><h2 id="care-dialog-title">${title}</h2><button type="button" data-care="close" class="dialog-close" aria-label="${loc("ปิด", "Close")}">${ico("close")}</button></header>${html}</section>`;
    modal.querySelector(".care-dialog").focus();
  }

  function newPatient() {
    const cust = state().customer;
    const relations = data.patients.some((p) => p.relation === "self")
      ? ["child", "parent", "dependent"]
      : ["self", "child", "parent", "dependent"];
    overlay(
      loc("เพิ่มโปรไฟล์คนไข้", "Add patient profile"),
      `<form data-care-form="patient" class="care-form">
      <label class="care-field"><span>${loc("ความสัมพันธ์", "Relationship")}</span><select class="select" name="relation">${relations.map((r) => `<option value="${r}">${relationLabel(r)}</option>`).join("")}</select></label>
      ${field("full_name", loc("ชื่อ–นามสกุลตามทะเบียนคลินิก", "Full name as used at the clinic"), 'required minlength="2" maxlength="100" autocomplete="name"')}
      ${msg(loc("ใช้บัตรของผู้ป่วยแต่ละคนเมื่อถึงคลินิก เจ้าหน้าที่จะตรวจชื่อและผูก HN", "Show this person’s card at the clinic for a name and HN check."))}
      ${cust ? nextButton(loc("เพิ่มคนไข้", "Add patient"), "check") : ""}</form>`,
    );
  }

  async function showQr(patientId) {
    const r = await sending(() => post(cp + "qr", { patient_id: patientId }));
    const qr = globalThis.qrcode(0, "M");
    qr.addData(r.code);
    qr.make();
    overlay(
      loc("บัตรคนไข้ QR", "Patient QR card"),
      `<div class="qr-card"><h3>${esc(r.patient.full_name)}</h3>
      <p>${r.patient.hn_linked ? `HN ••••${esc(r.patient.hn_tail)}` : loc("ยื่นให้สตาฟผูก HN", "Show staff to link your HN")}</p>
      <img alt="${loc("QR สำหรับให้สตาฟสแกน", "QR for staff to scan")}" src="${qr.createDataURL(8, 32)}" width="234" height="234">
      <p><code>${esc(r.code)}</code></p><small data-qr-clock></small><div class="care-actions">${btn("qr", loc("ออก QR ใหม่", "Refresh QR"), "qr", "outline", patientId)}</div></div>`,
    );
    const update = () => {
      const remain = Math.max(
        0,
        Math.ceil((new Date(r.expires_at) - Date.now()) / 1000),
      );
      const el = modal?.querySelector("[data-qr-clock]");
      if (el)
        el.textContent = remain
          ? loc("ใช้ได้อีก ", "Expires in ") +
            Math.floor(remain / 60) +
            ":" +
            String(remain % 60).padStart(2, "0")
          : loc("หมดอายุแล้ว กดออก QR ใหม่", "Expired. Refresh the code.");
      if (!remain)
        modal?.querySelector(".qr-card img")?.classList.add("qr-expired");
    };
    update();
    scanTimer = setInterval(update, 1000);
  }

  function scanner() {
    code = "";
    ctx = null;
    overlay(
      loc("สแกนบัตรคนไข้", "Scan patient card"),
      `<div class="scanner-panel"><video muted playsinline aria-hidden="true"></video><div class="scanner-guide" aria-hidden="true"><i></i></div><div class="scanner-caption" data-camera-status>${loc("จัด QR ให้อยู่ในกรอบ", "Position the QR inside the frame")}</div></div>
      <div class="care-actions">${btn("camera", loc("เปิดกล้อง", "Open camera"), "scan", "primary")}<label class="btn outline file-button">${ico("photo")}${loc("อ่านจากรูป", "Read an image")}<input type="file" accept="image/*" data-care-change="qr-file"></label></div>
      <form class="care-form" data-care-form="scan">${field("code", loc("หรือกรอกรหัสจากบัตรคนไข้", "Or enter the patient card code"), 'required autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="40" placeholder="SWT1-…"')}${nextButton(loc("เปิดข้อมูลคนไข้", "Open patient details"))}</form>`,
    );
  }

  function readQr(canvas) {
    const pixels = canvas
      .getContext("2d", { willReadFrequently: true })
      .getImageData(0, 0, canvas.width, canvas.height);
    return globalThis.jsQR?.(pixels.data, pixels.width, pixels.height, {
      inversionAttempts: "attemptBoth",
    })?.data;
  }

  async function startCamera() {
    stopCamera();
    const epoch = cameraEpoch;
    const video = modal?.querySelector("video");
    const status = modal?.querySelector("[data-camera-status]");
    if (!video || !navigator.mediaDevices?.getUserMedia)
      throw new Error(
        loc(
          "เปิดกล้องผ่าน HTTPS หรือกรอกรหัสจากบัตร",
          "Use HTTPS to access the camera or enter the card code.",
        ),
      );
    let feed;
    try {
      feed = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
        audio: false,
      });
    } catch {
      throw new Error(
        loc(
          "เปิดกล้องไม่สำเร็จ ตรวจสิทธิ์กล้องหรือกรอกรหัสจากบัตร",
          "Camera unavailable. Check browser permissions or enter the card code.",
        ),
      );
    }
    if (epoch !== cameraEpoch) {
      feed.getTracks().forEach((track) => track.stop());
      return;
    }
    stream = feed;
    video.srcObject = feed;
    await video.play();
    status.textContent = loc("กำลังอ่านบัตร QR", "Scanning for a patient QR");
    const canvas = document.createElement("canvas");
    let last = 0;
    const poll = (ms) => {
      if (epoch !== cameraEpoch || !modal) return;
      if (video.readyState >= 2 && ms - last >= 135) {
        last = ms;
        canvas.width = Math.min(video.videoWidth, 720);
        canvas.height = Math.round(
          (video.videoHeight * canvas.width) / video.videoWidth,
        );
        if (canvas.width && canvas.height) {
          canvas
            .getContext("2d", { willReadFrequently: true })
            .drawImage(video, 0, 0, canvas.width, canvas.height);
          const value = readQr(canvas);
          if (value && /^SWT1[0-9A-F -]{20,35}$/i.test(value)) {
            stopCamera();
            applyScan(value).catch((e) => {
              if (status.isConnected) status.textContent = errorText(e);
              toast(errorText(e));
            });
            return;
          }
        }
      }
      cameraFrame = requestAnimationFrame(poll);
    };
    cameraFrame = requestAnimationFrame(poll);
  }

  async function scanImage(file) {
    if (!file || file.size > 8 * 1024 * 1024)
      throw new Error(
        loc("เลือกรูป QR ขนาดไม่เกิน 8 MB", "Choose a QR image under 8 MB."),
      );
    stopCamera();
    const bitmap = await createImageBitmap(file);
    try {
      const canvas = document.createElement("canvas");
      const ratio = Math.min(1, 1050 / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
      canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const scanned = readQr(canvas);
      if (!scanned)
        throw new Error(
          loc(
            "อ่าน QR ไม่ได้ ลองใช้รูปที่ชัดขึ้นหรือกรอกรหัส",
            "Use a clearer QR image or enter the card code.",
          ),
        );
      await applyScan(scanned);
    } finally {
      bitmap.close();
    }
  }

  async function applyScan(value) {
    const r = await sending(() => post(sp + "scan", { code: value }));
    code = value;
    ctx = r;
    patientWorkspace();
  }

  function patientWorkspace() {
    const p = ctx.patient;
    const b = ctx.visit;
    const visit = b
      ? `<div class="scan-visit"><div><strong>${loc("นัดวันนี้", "Today’s visit")}</strong><p>${esc(appointmentText(b))} · ${esc(b.booking_ref)} · ${esc(branchName(b.branch_id))}</p></div>${bookingBadges(b)}</div>`
      : "";
    let body;
    if (!p.hn_linked) {
      body = `<form data-care-form="hn" class="care-form"><h3>${loc("ผูก HN กับคนไข้", "Link the patient HN")}</h3><p>${loc("เทียบชื่อกับทะเบียนคลินิก แล้วกรอก HN ที่ตรงกัน", "Match the name against the clinic register and enter the same HN.")}</p>
        ${field("hn", "HN", 'placeholder="001234" required minlength="2" maxlength="30" autocapitalize="characters" autocomplete="off"')}
        <label class="care-check"><input type="checkbox" name="verified" required><span>${loc("ตรวจชื่อและ HN กับทะเบียนคลินิกแล้ว", "I matched the name and HN against the clinic register.")}</span></label>${nextButton(loc("ผูก HN", "Link HN"), "check")}</form>`;
    } else if (
      b?.status === "confirmed" ||
      (b && !b.patient_id && ["checked_in", "completed"].includes(b.status))
    ) {
      body = `<form data-care-form="check-in" class="care-form"><h3>${loc("พร้อมเช็กอิน", "Ready to check in")}</h3>
       <label class="care-check"><input type="checkbox" name="match" required><span>${loc("ยืนยันว่า QR และ HN ตรงกับคนไข้ที่มาถึง", "The QR and HN match the person who arrived.")}</span></label>${nextButton(loc("เช็กอินนัดนี้", "Check in"), "check")}</form>`;
    } else if (b?.status === "pending") {
      body =
        msg(
          loc(
            "นัดวันนี้รอยืนยัน ให้ยืนยันนัดในรายการคิวก่อน",
            "Confirm today’s booking in the queue first.",
          ),
        ) +
        btn(
          "confirm-visit",
          loc("ยืนยันนัดวันนี้", "Confirm today’s visit"),
          "check",
          "primary",
          b.id,
        );
    } else if (b && ["checked_in", "completed"].includes(b.status)) {
      body = ctx.has_dispense
        ? msg(
            loc(
              "บันทึกชุดยาของนัดนี้แล้ว",
              "Medication set recorded for this visit.",
            ) +
              (ctx.dispense?.estimated_depletion_on
                ? " · " +
                  loc("คาดว่าใกล้หมด ", "Estimated low-supply date ") +
                  displayDate(ctx.dispense.estimated_depletion_on)
                : ""),
          )
        : ctx.clinical_access
          ? `<h3 class="care-subhead">${loc("หลังพบแพทย์", "After the consultation")}</h3>${btn("dispense", loc("บันทึกการจ่ายยา", "Record dispensed medication"), "pill", "primary")}`
          : msg(
              loc(
                "เช็กอินแล้ว ให้ผู้มีสิทธิ์ด้านยาสแกนเพื่อบันทึกการจ่ายยา",
                "Checked in. Authorized clinical staff can scan to record medication.",
              ),
            );
    } else {
      body = msg(loc("คนไข้ยังไม่มีนัดวันนี้", "No visit scheduled today."));
    }
    overlay(
      loc("ข้อมูลคนไข้", "Patient details"),
      `<div class="scan-identity"><span class="tile-icon">${ico("user")}</span><div><h3>${esc(p.full_name)}</h3><p>${p.hn_linked ? `HN ${esc(p.hn)}` : loc("ยังไม่ผูก HN", "HN not linked")}</p></div></div>${visit}${body}
      ${ctx.next ? `<p class="muted scan-next">${loc("นัดถัดไป ", "Next visit ")}${esc(appointmentText(ctx.next))}</p>` : ""}
      <div class="care-actions">${p.hn_linked ? btn("staff-book-form", loc("ลงนัดใหม่", "Schedule a visit"), "calendar", b ? "outline" : "primary") : ""}${btn("scanner", loc("สแกนคนถัดไป", "Scan another patient"), "scan", "outline")}</div>`,
    );
  }

  function slotOptions(slots) {
    return (
      `<option value="">${loc("เลือกช่วงเวลา", "Pick a window")}</option>` +
      slots
        .filter((s) => !s.closed && s.left > 0)
        .map(
          (s) =>
            `<option value="${esc(s.key)}" data-start="${esc(s.start)}" data-end="${esc(s.end)}">${esc(loc(s.label_th, s.label_en))} · ${esc(s.start)}–${esc(s.end)}</option>`,
        )
        .join("")
    );
  }

  async function dateSlots(value, branchValue) {
    if (!branchValue) return [];
    const r = await request(
      "/api/slots?" + new URLSearchParams({ date: value, branch: branchValue }),
    );
    return r.slots.map((slot) =>
      value === today() && slot.end <= clinicClock()
        ? { ...slot, closed: true, left: 0 }
        : slot,
    );
  }

  async function visitForm(mode, bookingId) {
    const initial = later(1);
    const staff = mode === "schedule";
    const b = staff
      ? null
      : data.bookings.find((b) => String(b.id) === String(bookingId));
    if (!staff && !b) return;
    const chosen = staff
      ? ctx.visit?.branch_id || deskBranch
      : b.branch_id || "";
    const windows = await dateSlots(initial, chosen);
    overlay(
      staff
        ? loc("ลงนัดใหม่", "Schedule a visit")
        : loc("ขอเลื่อนนัด", "Request a reschedule"),
      `<form class="care-form" data-care-form="${mode}" data-id="${esc(bookingId || "")}" data-key="${freshKey()}">
      <div class="scan-identity"><span class="tile-icon">${ico("calendar")}</span><div><strong>${esc(staff ? ctx.patient.full_name : b.patient_name)}</strong>
      <p>${staff ? "HN " + esc(ctx.patient.hn) : esc(appointmentText(b))}</p></div></div>
      ${branchSelect("branch_id", chosen, "visit-branch", true)}
      <label class="care-field"><span>${loc("เลือกวัน", "Choose a date")}</span><input class="input" ${dateInput("date")} value="${initial}" data-care-change="visit-date"></label>
      <label class="care-field"><span>${loc("ช่วงเวลา", "Time window")}</span><select class="select" name="slot" required data-care-change="visit-slot">${slotOptions(windows)}</select></label>
      ${staff ? field("time", loc("เวลานัดที่แน่นอน", "Exact appointment time"), "required disabled", "time") : ""}
      ${!staff ? msg(loc("นัดเดิมยังมีผลจนกว่าคลินิกจะอนุมัติคำขอ", "Your original booking stays in effect until the clinic accepts the request.")) : ""}
      ${nextButton(staff ? loc("ยืนยันวันนัด", "Confirm appointment") : loc("ส่งคำขอเลื่อนนัด", "Send reschedule request"), "check")}</form>`,
    );
  }

  async function dispenseForm() {
    const distributeContext = ctx;
    const selectedBranch = ctx.visit.branch_id || deskBranch;
    dispensingStock = await fetchStock(selectedBranch);
    if (ctx !== distributeContext) return;
    overlay(
      loc("เลือกยาจากสต็อกและบันทึกการจ่าย", "Record a stock dispense"),
      medicationUI.dispenseMarkup(
        ctx,
        selectedBranch,
        dispensingStock,
        freshKey(),
      ),
      true,
    );
    medicationUI.update(modal.querySelector("form"));
  }

  async function refillForm(id) {
    const d = med.dispenses.find(
      (d) => String(d.id) === String(id) && d.can_request,
    );
    if (!d) return;
    const { customer } = state();
    const contact = await request(cp + "refill-contact");
    if (state().customer?.id !== customer.id || state().page !== "/medications")
      return;
    overlay(
      loc("ขอชุดยาเดิม", "Request the same set"),
      `<form class="care-form" data-care-form="refill" data-id="${d.id}" data-key="${freshKey()}">
      ${medSetSummary(d)}
      <div class="fee-line"><strong>${loc("ค่าส่งเหมา", "Flat shipping fee")}</strong><b>${fee()}</b></div>
      <p>${loc("ตรวจข้อมูลจากโปรไฟล์สมาชิก LINE และที่อยู่ครั้งล่าสุดก่อนส่ง", "Review the contact details from your LINE member profile and last request.")}</p>
      ${field("recipient", loc("ชื่อผู้รับ", "Recipient"), `required minlength="2" maxlength="100" autocomplete="shipping name" value="${esc(contact.recipient || "")}"`)}
      ${field("phone", loc("เบอร์ผู้รับ", "Recipient phone"), `required pattern="0[0-9]{9}" maxlength="10" inputmode="tel" autocomplete="shipping tel-national" value="${esc(contact.shipping_phone || "")}"`, "tel")}
      <label class="care-field"><span>${loc("ที่อยู่จัดส่ง", "Shipping address")}</span><textarea class="textarea" name="address" required minlength="12" maxlength="360" autocomplete="shipping street-address">${esc(contact.shipping_address || "")}</textarea></label>
      ${field("postal", loc("รหัสไปรษณีย์", "Postal code"), `required pattern="[0-9]{5}" maxlength="5" inputmode="numeric" autocomplete="shipping postal-code" value="${esc(contact.postal_code || "")}"`)}
      <label class="care-check"><input type="checkbox" name="confirmed" required><span>${loc("ยืนยันส่งคำขอชุดเดิมให้คลินิกทบทวน", "I confirm this request for the clinic to review.")}</span></label>
      ${nextButton(loc("ส่งคำขอให้คลินิก", "Send request to clinic"))}</form>`,
      true,
    );
  }

  async function refillDetail(id) {
    const { refill: r } = await request(
      sp + "refills/" + encodeURIComponent(id),
    );
    overlay(
      loc("ตรวจคำขอชุดยาเดิม", "Review medication set request"),
      `<div class="scan-identity"><span class="tile-icon">${ico("pill")}</span><div><h3>${esc(r.patient.full_name)}</h3><p>HN ${esc(r.patient.hn)} · ${esc(r.ref)}</p></div></div>
      <p class="muted">${loc("อ้างอิงใบสั่งยา ", "Prescription reference ")}${esc(r.dispense.prescription_ref)}</p>
      ${drugItems([...r.dispense.items].sort((a, b) => a.position - b.position))}
      <div class="shipping-box"><h3>${loc("ข้อมูลผู้รับ", "Recipient")}</h3><p>${esc(r.recipient)} · ${esc(r.shipping_phone)}</p><p>${esc(r.shipping_address)} ${esc(r.postal_code)}</p><b>${loc("ค่าส่ง ", "Shipping ")}${fee()}</b></div>
      ${
        r.status === "pending"
          ? `<form data-care-form="review-refill" data-id="${r.id}" class="care-form">
        <label class="care-field"><span>${loc("ผลการทบทวนและติดต่อ", "Review outcome")}</span><select class="select" name="status" required><option value="">${loc("เลือกสถานะ", "Choose status")}</option>${["contacted", "visit_required", "declined"].map((s) => `<option value="${s}">${refillStatus(s)}</option>`).join("")}</select></label>
        ${nextButton(loc("บันทึกผล", "Save outcome"), "check")}</form>`
          : `<span class="tag">${esc(refillStatus(r.status))}</span>`
      }`,
      true,
    );
  }

  async function reloadBooking() {
    const revision = ++stepKey;
    const [s, result] = await Promise.all([
      dateSlots(date, branch),
      focusPatient
        ? request(
            cp +
              "conflicts?patient=" +
              encodeURIComponent(focusPatient) +
              "&date=" +
              encodeURIComponent(date),
          )
        : Promise.resolve({ bookings: [] }),
    ]);
    if (revision !== stepKey) return;
    bookingSlots = s;
    conflicts = result.bookings;
    if (!s.some((v) => v.key === selected && v.left > 0)) selected = "";
  }

  async function refresh(page, staffDate = today()) {
    failure = "";
    if (page === "/staff" || page === "/booking" || page === "/appointments")
      await refreshLocations().catch(() => {});
    if (page === "/staff" && state().staff && state().staff.role !== "store") {
      try {
        desk = await request(
          sp +
            "workspace?" +
            new URLSearchParams({ date: staffDate, branch: deskBranch }),
        );
      } catch (e) {
        failure = errorText(e);
      }
      return;
    }
    if (!state().customer) return;
    try {
      if (["/", "/booking", "/appointments", "/account"].includes(page)) {
        data = await request(cp + "overview");
        if (!data.patients.some((p) => String(p.id) === focusPatient))
          focusPatient = String(data.patients[0]?.id || "");
      }
      if (page === "/booking" && focusPatient) await reloadBooking();
      if (page === "/medications") med = await request(cp + "medications");
    } catch (e) {
      failure = errorText(e);
    }
  }

  async function followLink() {
    const map = new URLSearchParams(location.search).get("map");
    if (locationList.some((l) => l.id === map)) {
      window.location.replace("/api/locations/" + map + "/map");
      return;
    }
    if (!state().customer || !data || followedLink === location.search || modal)
      return;
    const query = new URLSearchParams(location.search);
    const target = data.bookings.find(
      (b) => String(b.id) === query.get("booking") && b.date >= today(),
    );
    if (!target) return;
    followedLink = location.search;
    if (
      query.get("action") === "reschedule" &&
      ["pending", "confirmed"].includes(target.status) &&
      !target.reschedule
    ) {
      await visitForm("reschedule", target.id);
    } else if (
      query.get("action") === "attend" &&
      target.status === "confirmed" &&
      !target.attending_at
    ) {
      await click({ dataset: { care: "attend", value: String(target.id) } });
    }
  }

  async function followRefillLink() {
    if (
      !state().customer ||
      !med ||
      followedRefill === location.search ||
      modal
    )
      return;
    const id = new URLSearchParams(location.search).get("refill");
    if (!id) return;
    followedRefill = location.search;
    if (med.dispenses.some((d) => String(d.id) === id && d.can_request))
      await refillForm(id);
    else
      toast(
        loc(
          "ดูสถานะคำขอได้ในประวัติชุดยา",
          "Check the set or request status in your history.",
        ),
      );
  }

  function finish(title, detail = "") {
    if (!globalThis.Swal) {
      toast(title);
      return;
    }
    void globalThis.Swal.fire({
      icon: "success",
      title,
      text: detail,
      confirmButtonText: loc("ตกลง", "OK"),
      confirmButtonColor: "#154db8",
    });
  }

  async function confirmAction(title, text = "") {
    if (!globalThis.Swal) return window.confirm(title);
    const r = await globalThis.Swal.fire({
      title,
      text,
      icon: "question",
      showCancelButton: true,
      confirmButtonText: loc("ยืนยัน", "Confirm"),
      cancelButtonText: loc("กลับ", "Back"),
      confirmButtonColor: "#154db8",
      cancelButtonColor: "#536783",
      reverseButtons: true,
    });
    return r.isConfirmed;
  }

  function showError(error) {
    const text = errorText(error);
    if (!globalThis.Swal) {
      toast(text);
      return;
    }
    void globalThis.Swal.fire({
      icon: "error",
      title: loc("บันทึกไม่สำเร็จ", "Could not complete the request"),
      text,
      confirmButtonText: loc("ตกลง", "OK"),
      confirmButtonColor: "#154db8",
    });
  }

  async function change(event) {
    const el = event.target;
    const dispense = el.closest('form[data-care-form="dispense"]');
    if (dispense) medicationUI.update(dispense);
    const action = el.dataset.careChange;
    if (!action) return;
    if (
      action === "patient" ||
      action === "booking-date" ||
      action === "booking-branch"
    ) {
      if (action === "booking-branch") branch = el.value;
      if (action === "patient") focusPatient = el.value;
      if (action === "booking-date") date = el.value;
      if (!date) return;
      selected = "";
      bookingKey = "";
      await reloadBooking();
      if (state().page === "/booking") render();
    }
    if (action === "med-filter") {
      medsFilter = el.value;
      render();
    }
    if (action === "qr-file") {
      if (el.files[0]) await scanImage(el.files[0]);
    }
    if (action === "visit-date" || action === "visit-branch") {
      const form = el.form;
      const value = form.elements.date.value;
      const chosen = form.elements.branch_id.value;
      const select = form.elements.slot;
      select.innerHTML = slotOptions([]);
      select.disabled = true;
      setClock(select);
      try {
        const windows = await dateSlots(value, chosen);
        if (
          form.elements.date.value === value &&
          form.elements.branch_id.value === chosen
        )
          select.innerHTML = slotOptions(windows);
      } finally {
        if (
          form.elements.date.value === value &&
          form.elements.branch_id.value === chosen
        )
          select.disabled = false;
      }
    }
    if (action === "visit-slot") setClock(el);
    if (action === "desk-branch") {
      deskBranch = el.value;
      await refresh("/staff", desk?.date);
      render();
    }
    if (action === "stock-branch" || action === "stock-intake-branch")
      await changeStockBranch(el.value);
    if (action === "dispense-branch") {
      const form = el.form;
      dispensingStock = await fetchStock(el.value);
      if (form.isConnected) medicationUI.changeBranch(form, dispensingStock);
    }
  }

  function setClock(select) {
    const input = select.form.elements.time;
    const opt = select.selectedOptions[0];
    if (!input) return;
    input.disabled = !opt?.dataset.start;
    input.value = "";
    if (!input.disabled) {
      input.min =
        select.form.elements.date.value === today()
          ? [opt.dataset.start, clinicClock()].sort().at(-1)
          : opt.dataset.start;
      const [hour, minute] = opt.dataset.end.split(":").map(Number);
      const last = hour * 60 + minute - 1;
      input.max =
        String(Math.floor(last / 60)).padStart(2, "0") +
        ":" +
        String(last % 60).padStart(2, "0");
      input.value = input.min;
    }
  }

  async function click(el) {
    const action = el.dataset.care;
    const value = el.dataset.value;
    if (action === "close") {
      closeModal();
      return;
    }
    if (action === "contact") {
      const url = state().config.lineOaUrl;
      overlay(
        loc("ติดต่อคลินิก", "Contact clinic"),
        `<div class="care-form"><p>${loc("สอบถามเรื่องนัดและบริการผ่าน LINE OA ของคลินิก", "Contact the clinic’s LINE account for appointments and services.")}</p>
        ${url ? `<a class="btn primary" target="_blank" rel="noopener" href="${esc(url)}">${ico("chat")}${loc("เปิด LINE คลินิก", "Open clinic LINE")}</a>` : msg(loc("เปิดแชตกับ LINE OA ที่คุณใช้เข้าระบบนี้", "Open the LINE Official Account where you launched the clinic portal."))}</div>`,
      );
    }
    if (action === "add-patient") newPatient();
    if (action === "qr") await showQr(value);
    if (action === "scanner") scanner();
    if (action === "camera") await startCamera();
    if (action === "staff-book-form") await visitForm("schedule");
    if (action === "reschedule") await visitForm("reschedule", value);
    if (action === "dispense") await dispenseForm();
    if (action === "refill") await refillForm(value);
    if (action === "refill-detail") await refillDetail(value);
    if (action === "add-drug") {
      const target = modal.querySelector("[data-items]");
      if (target.children.length < 30) {
        target.insertAdjacentHTML(
          "beforeend",
          medicationUI.drugRow(dispensingStock),
        );
        medicationUI.update(target.closest("form"));
        target.lastElementChild.querySelector("input").focus();
      }
    }
    if (action === "remove-drug") {
      const row = el.closest("fieldset");
      const form = row.closest("form");
      if (row.parentElement.children.length > 1) row.remove();
      medicationUI.update(form);
    }
    if (action === "dose-preset") medicationUI.fillPreset(el);
    if (action === "assign-branch") {
      overlay(
        loc("กำหนดสาขานัดเดิม", "Assign appointment branch"),
        `<form class="care-form" data-care-form="assign-branch" data-id="${esc(value)}">
        ${branchSelect("branch_id", deskBranch, "", true)}
        ${msg(loc("ตรวจสอบสาขากับข้อมูลนัดก่อนบันทึก", "Confirm the location before saving."))}
        ${nextButton(loc("บันทึกสาขา", "Save branch"), "check")}</form>`,
      );
    }
    if (action === "slot") {
      selected = value;
      bookingKey = "";
      render();
    }
    if (action === "join-wait") {
      if (
        !(await confirmAction(
          loc("เข้าคิวสำรองช่วงนี้", "Join this waitlist"),
          loc(
            "คลินิกจะแจ้งผ่าน LINE เมื่อมีคิวเปิด",
            "LINE will notify you when a slot opens.",
          ),
        ))
      )
        return;
      await sending(() =>
        post(cp + "waitlist", {
          patient_id: focusPatient,
          date,
          slot_key: value,
          branch_id: branch,
        }),
      );
      finish(loc("เพิ่มเข้าคิวสำรองแล้ว", "Joined the waitlist"));
    }
    if (
      ["attend", "accept-wait", "leave-wait", "refill-withdraw"].includes(
        action,
      )
    ) {
      const actions = {
        attend: [
          "attendance",
          "booking_id",
          loc("ยืนยันว่าจะมา", "Confirm attendance"),
        ],
        "accept-wait": [
          "waitlist/accept",
          "waitlist_id",
          loc("รับคิวนี้", "Accept the slot"),
        ],
        "leave-wait": [
          "waitlist/withdraw",
          "waitlist_id",
          loc("ออกจากคิวสำรอง", "Leave the waitlist"),
        ],
        "refill-withdraw": [
          "refills/withdraw",
          "refill_id",
          loc("ถอนคำขอนี้", "Withdraw this request"),
        ],
      };
      const [route, key, title] = actions[action];
      if (!(await confirmAction(title))) return;
      const r = await sending(() => post(cp + route, { [key]: value }));
      await refresh(state().page);
      render();
      finish(loc("บันทึกแล้ว", "Saved"), r.booking?.booking_ref || "");
    }
    if (action === "confirm-visit") {
      if (!(await confirmAction(loc("ยืนยันนัดวันนี้", "Confirm today’s visit"))))
        return;
      await sending(() =>
        post("/api/staff/bookings/" + value + "/status", {
          status: "confirmed",
        }),
      );
      ctx = await post(sp + "scan", { code });
      patientWorkspace();
    }
    if (action === "decide-reschedule") {
      const [requestId, decision] = value.split(":");
      if (
        !(await confirmAction(
          decision === "yes"
            ? loc("อนุมัติการเลื่อนนัด", "Accept reschedule")
            : loc("คงนัดเดิม", "Keep the original appointment"),
        ))
      )
        return;
      await sending(() =>
        post(sp + "reschedule", {
          request_id: requestId,
          accept: decision === "yes",
        }),
      );
      await refresh("/staff", desk.date);
      render();
      finish(loc("บันทึกผลแล้ว", "Outcome saved"));
    }
    if (action === "staff-link") await linkStaffLine();
    if (action === "staff-unlink") {
      if (!(await confirmAction(loc("ยกเลิกการผูก LINE", "Unlink LINE")))) return;
      await sending(() => post(sp + "line/unlink"));
      await refreshApp();
    }
    if (action === "load-permissions" || action === "set-permission") {
      if (action === "set-permission") {
        const [staffId, enabled] = value.split(":");
        if (
          !(await confirmAction(
            loc("ยืนยันการปรับสิทธิ์ด้านยา", "Confirm clinical access change"),
          ))
        )
          return;
        await sending(() =>
          post(sp + "permissions", {
            staff_id: staffId,
            enabled: enabled === "true",
          }),
        );
      }
      permissions = (await request(sp + "permissions")).staff;
      await refreshApp();
    }
  }

  async function submit(form) {
    const kind = form.dataset.careForm;
    const d = Object.fromEntries(new FormData(form));
    if (kind === "booking") {
      if (!branch || !selected || conflicts.length) return;
      bookingKey ||= freshKey();
      const result = await sending(() =>
        post(cp + "book", {
          patient_id: focusPatient,
          date,
          slot_key: selected,
          branch_id: branch,
          note,
          request_id: bookingKey,
        }),
      );
      bookingResult = result.booking;
      render();
      finish(
        loc("บันทึกคำขอนัดแล้ว", "Booking request saved"),
        result.booking.booking_ref + " · " + displayDate(result.booking.date),
      );
    }
    if (kind === "patient") {
      await sending(() =>
        post(cp + "patients", { full_name: d.full_name, relation: d.relation }),
      );
      await refresh(state().page);
      closeModal();
      render();
      finish(loc("เพิ่มโปรไฟล์แล้ว", "Patient added"));
    }
    if (kind === "scan") await applyScan(d.code);
    if (kind === "hn") {
      ctx = await sending(() =>
        post(sp + "link-hn", { code, hn: d.hn, verified: d.verified === "on" }),
      );
      patientWorkspace();
      toast(loc("ผูก HN แล้ว", "HN linked"));
    }
    if (kind === "check-in") {
      ctx = await sending(() =>
        post(sp + "check-in", {
          code,
          booking_id: ctx.visit.id,
          match: d.match === "on",
        }),
      );
      patientWorkspace();
      await refresh("/staff", desk?.date);
      render();
      toast(loc("เช็กอินเรียบร้อย", "Checked in"));
    }
    if (kind === "schedule") {
      const r = await sending(() =>
        post(sp + "book", {
          code,
          date: d.date,
          slot_key: d.slot,
          branch_id: d.branch_id,
          time: d.time,
          request_id: form.dataset.key,
        }),
      );
      const currentCode = code;
      ctx = await post(sp + "scan", { code: currentCode });
      patientWorkspace();
      await refresh("/staff", desk?.date);
      render();
      finish(
        loc("ลงนัดแล้ว", "Appointment scheduled"),
        r.booking.booking_ref +
          " · " +
          displayDate(r.booking.date) +
          " · " +
          d.time,
      );
    }
    if (kind === "reschedule") {
      await sending(() =>
        post(cp + "reschedule", {
          booking_id: form.dataset.id,
          date: d.date,
          slot_key: d.slot,
          branch_id: d.branch_id,
        }),
      );
      closeModal();
      await refresh("/appointments");
      render();
      finish(loc("ส่งคำขอเลื่อนนัดแล้ว", "Reschedule request sent"));
    }
    if (kind === "location-map") {
      const { location: updated } = await sending(() =>
        post(sp + "location-map", {
          branch_id: form.dataset.id,
          map_url: d.map_url,
        }),
      );
      locationList = locationList.map((l) =>
        l.id === updated.id ? updated : l,
      );
      render();
      finish(loc("บันทึกแผนที่แล้ว", "Map saved"));
    }
    if (kind === "assign-branch") {
      await sending(() =>
        post(sp + "booking-branch", {
          booking_id: form.dataset.id,
          branch_id: d.branch_id,
        }),
      );
      closeModal();
      await refreshApp();
      finish(loc("กำหนดสาขาแล้ว", "Branch assigned"));
    }
    if (kind === "stock-create" || kind === "stock-intake") {
      const isNew = kind === "stock-create";
      if (!isNew) {
        form.dataset.key ||= freshKey();
        d.request_id = form.dataset.key;
      }
      await sending(() =>
        post(sp + "medication-stock/" + (isNew ? "create" : "intake"), d),
      );
      await changeStockBranch(stockBranch || d.branch_id || "");
      finish(
        isNew
          ? loc("เพิ่มรายการยาแล้ว", "Medication added")
          : loc("บันทึกรับยาแล้ว", "Stock intake saved"),
      );
    }
    if (kind === "dispense") {
      const items = medicationUI.getItems(form);
      ctx = await sending(() =>
        post(sp + "dispenses", {
          code: d.refresh_code || code,
          booking_id: ctx.visit.id,
          prescription_ref: d.reference,
          branch_id: d.branch_id,
          request_id: form.dataset.key,
          items,
          remind: d.remind === "on",
          allow_refill: d.refill_allowed === "on",
          refill_from: d.refill_from,
          refill_until: d.refill_until,
          verified: d.verified === "on",
        }),
      );
      if (d.refresh_code) code = d.refresh_code;
      if (stockBranch === d.branch_id)
        medicineStock = await fetchStock(stockBranch).catch(() => null);
      patientWorkspace();
      finish(
        loc("บันทึกการจ่ายยาแล้ว", "Medication record saved"),
        ctx.dispense.estimated_depletion_on
          ? loc("คาดว่าใกล้หมด ", "Estimated low-supply date ") +
              displayDate(ctx.dispense.estimated_depletion_on)
          : "",
      );
    }
    if (kind === "refill") {
      const r = await sending(() =>
        post(cp + "refills", {
          dispense_id: form.dataset.id,
          request_id: form.dataset.key,
          recipient: d.recipient,
          shipping_phone: d.phone,
          shipping_address: d.address,
          postal_code: d.postal,
          confirmed: d.confirmed === "on",
        }),
      );
      closeModal();
      await refresh("/medications");
      render();
      finish(
        loc("ส่งคำขอให้คลินิกแล้ว", "Request sent to clinic"),
        r.request.ref + " · " + loc("ค่าส่ง ", "Shipping ") + fee(),
      );
    }
    if (kind === "review-refill") {
      await sending(() =>
        post(sp + "refills/review", {
          refill_id: form.dataset.id,
          status: d.status,
        }),
      );
      closeModal();
      await refresh("/staff", desk?.date);
      render();
      finish(loc("บันทึกผลแล้ว", "Outcome saved"));
    }
  }

  document.addEventListener("click", (event) => {
    const el = event.target.closest("[data-care]");
    if (!el || el.disabled || state().busy) return;
    event.preventDefault();
    void click(el).catch(showError);
  });
  document.addEventListener(
    "change",
    (event) => void change(event).catch(showError),
  );
  document.addEventListener("input", (event) => {
    const form = event.target.closest('form[data-care-form="dispense"]');
    if (form) medicationUI.update(form);

    if (event.target.dataset.careInput === "booking-note") {
      note = event.target.value;
      bookingKey = "";
    }
  });
  document.addEventListener("submit", (event) => {
    const form = event.target.closest("[data-care-form]");
    if (!form) return;
    event.preventDefault();
    if (!state().busy) void submit(form).catch(showError);
  });
  document.addEventListener("keydown", (event) => {
    if (!modal || globalThis.Swal?.isVisible()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    }
    if (event.key === "Tab") {
      const list = [
        ...modal.querySelectorAll(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ].filter((el) => el.getClientRects().length);
      if (!list.length) return;
      const first = list[0],
        last = list.at(-1);
      if (
        event.shiftKey &&
        [first, modal.querySelector(".care-dialog")].includes(
          document.activeElement,
        )
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });

  return {
    home,
    bookingPage,
    appointmentsPage,
    medicationsPage,
    accountCards,
    staffOverview,
    staffRefills,
    staffPermissions,
    staffLine,
    refresh,
    followLink,
    followRefillLink,
    locationSettings,
    staffStock,
    branchName,
    branchSelect,
    errorText,
    closeModal,
    confirmAction,
    showError,
    reset: () => {
      data = null;
      med = null;
      desk = null;
      medicineStock = null;
      stockBranch = "";
      deskBranch = "";
      permissions = [];
      focusPatient = "";
      resetVisit();
    },
    resetVisit,
  };

  function resetVisit() {
    bookingResult = null;
    selected = "";
    bookingKey = "";
    note = "";
    conflicts = [];
  }
}
