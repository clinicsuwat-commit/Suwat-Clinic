const copy = {
  medication_depletion: [
    "ชุดยาของคุณอาจใกล้หมด",
    "Your medication supply may be running low",
    "ระบบประเมินจากรอบที่บันทึกไว้",
    "Estimated from the schedule recorded by the clinic.",
  ],
  visit_requested: [
    "ได้รับคำขอนัดแล้ว",
    "Appointment request received",
    "รอเจ้าหน้าที่ตรวจสอบและยืนยัน",
    "The clinic will review your request.",
  ],
  visit_confirmed: [
    "ยืนยันนัดแล้ว",
    "Appointment confirmed",
    "ดูรายละเอียดนัดหมายและยืนยันว่าจะมาได้ในระบบ",
    "Open your appointment to confirm your attendance.",
  ],
  visit_updated: [
    "อัปเดตวันนัดแล้ว",
    "Appointment rescheduled",
    "กรุณาตรวจสอบวันและเวลาใหม่",
    "Please check the new date and time.",
  ],
  visit_cancelled: [
    "ยกเลิกนัดแล้ว",
    "Appointment cancelled",
    "จองนัดใหม่ได้จากเมนูจองคิว",
    "You can book a new visit from the clinic menu.",
  ],
  reminder_tomorrow: [
    "พรุ่งนี้มีนัดกับคลินิก",
    "Your appointment is tomorrow",
    "กดยืนยันว่าจะมา หรือส่งคำขอเลื่อนนัดได้",
    "Confirm attendance or request a new appointment time.",
  ],
  reminder_today: [
    "วันนี้มีนัดกับคลินิก",
    "Your appointment is today",
    "เปิดบัตร QR เมื่อมาถึงเพื่อเช็กอิน",
    "Open your QR card when you arrive to check in.",
  ],
  reschedule_declined: [
    "อัปเดตคำขอเลื่อนนัด",
    "Reschedule request updated",
    "วันและเวลานัดเดิมยังใช้ได้ กรุณาดูรายละเอียดในระบบ",
    "Check your current appointment in the clinic portal.",
  ],
  waitlist_offer: [
    "มีคิวว่างแล้ว",
    "An appointment slot is open",
    "เปิดการนัดหมายเพื่อกดรับคิวภายในเวลาที่ระบุ",
    "Open Appointments to accept before the offer expires.",
  ],
  refill_received: [
    "คลินิกได้รับคำขอแล้ว",
    "The clinic received your request",
    "เจ้าหน้าที่จะตรวจสอบและติดต่อกลับ",
    "The clinic will review your request and contact you.",
  ],
  refill_reviewed: [
    "มีอัปเดตจากคลินิก",
    "You have an update",
    "เปิดระบบเพื่อตรวจสอบสถานะคำขอ",
    "Open the clinic portal to see your request status.",
  ],
  staff_booking: [
    "มีนัดใหม่ในระบบ",
    "New appointment",
    "ตรวจสอบนัดได้จากแดชบอร์ดสตาฟ",
    "Review the appointment in the staff dashboard.",
  ],
  staff_booked: [
    "ลงนัดสำเร็จ",
    "Appointment booked",
    "บันทึกนัดและส่งเข้าคิวแจ้งคนไข้แล้ว",
    "The appointment is saved and the patient message is queued.",
  ],
  staff_reschedule: [
    "มีคำขอเลื่อนนัด",
    "New reschedule request",
    "เปิดแดชบอร์ดเพื่อตรวจรายการ",
    "Open the staff dashboard to review.",
  ],
  staff_refill: [
    "มีคำขอใหม่ในระบบ",
    "New clinic request",
    "เปิดแดชบอร์ดเพื่อตรวจรายการที่คุณมีสิทธิ์เข้าถึง",
    "Open the staff dashboard to review the request.",
  ],
};

const appointmentEvents = new Set([
  "visit_requested",
  "visit_confirmed",
  "visit_updated",
  "visit_cancelled",
  "reminder_tomorrow",
  "reminder_today",
  "reschedule_declined",
  "staff_booking",
  "staff_booked",
  "staff_reschedule",
]);

export function isAppointmentNotice(notification) {
  return (
    notification.payload?.clinic_v3 === true &&
    appointmentEvents.has(notification.event_type)
  );
}

function detailRow(label, value) {
  return {
    type: "box",
    layout: "horizontal",
    spacing: "sm",
    contents: [
      {
        type: "text",
        text: label,
        size: "sm",
        color: "#445C77",
        flex: 3,
        wrap: true,
      },
      {
        type: "text",
        text: value,
        size: "sm",
        color: "#082451",
        weight: "bold",
        flex: 7,
        wrap: true,
      },
    ],
  };
}

function bookingLink(config, destination, view, query = {}) {
  const params = new URLSearchParams({ view, ...query });
  if (
    destination === "customer" &&
    /^[0-9]+-[A-Za-z0-9]+$/.test(config.liffId)
  ) {
    return "https://liff.line.me/" + config.liffId + "?" + params;
  }
  try {
    const base = new URL(config.baseUrl);
    if (base.protocol === "https:")
      return new URL("/" + view + "?" + params, base).href;
  } catch {}
  return "";
}

export function clinicLine(notification, config) {
  const p = notification.payload;
  if (p.clinic_v3 !== true) return p;
  const th = p.lang !== "en";
  const kind = notification.event_type;
  const words = copy[kind] || copy.staff_refill;
  const title = words[th ? 0 : 1];
  const lowSupply = kind === "medication_depletion";
  const appointment = isAppointmentNotice(notification);
  const customer = notification.destination === "customer";
  const branch = th ? p.branch_th || p.branch_en : p.branch_en || p.branch_th;
  const canRefill =
    lowSupply && p.can_refill === true && /^\d+$/.test(String(p.dispense_id));
  const showMap =
    customer && ["ubon", "yasothon"].includes(p.branch_id) && !lowSupply;
  const target =
    notification.destination !== "customer"
      ? "staff"
      : lowSupply || kind.startsWith("refill_")
        ? "medications"
        : "appointments";
  const url = bookingLink(
    config,
    notification.destination,
    target,
    canRefill
      ? { refill: String(p.dispense_id) }
      : p.booking_id
        ? { booking: String(p.booking_id) }
        : {},
  );
  const components = [
    {
      type: "text",
      text: canRefill
        ? th
          ? "หากต้องการชุดเดิม ส่งคำขอให้คลินิกทบทวนได้"
          : "You can request the same set for the clinic to review."
        : words[th ? 2 : 3],
      size: "sm",
      color: "#445C77",
      wrap: true,
    },
  ];
  const eventDate = lowSupply ? p.depletion_on : p.date;
  let dateText = "";
  if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
    const date = new Date(eventDate + "T12:00:00+07:00");
    if (Number.isFinite(date.getTime()))
      dateText = new Intl.DateTimeFormat(th ? "th-TH" : "en-GB", {
        timeZone: "Asia/Bangkok",
        dateStyle: "long",
      }).format(date);
  }
  const timeText = p.from
    ? p.from + (p.until ? " – " + p.until : "") + (th ? " น." : "")
    : "";
  if (appointment) {
    const details = [];
    if ((customer || notification.destination === "staff") && p.patient_name)
      details.push(detailRow(th ? "ผู้ป่วย" : "Patient", p.patient_name));
    if (dateText)
      details.push(
        detailRow(
          kind === "staff_reschedule"
            ? th
              ? "วันที่ขอเลื่อน"
              : "Requested date"
            : th
              ? "วันนัด"
              : "Date",
          dateText,
        ),
      );
    if (timeText) details.push(detailRow(th ? "เวลา" : "Time", timeText));
    if (branch || dateText)
      details.push(
        detailRow(
          th ? "สาขา" : "Branch",
          branch || (th ? "รอคลินิกระบุสาขา" : "Awaiting branch assignment"),
        ),
      );
    if (
      !customer &&
      ["pending", "confirmed"].includes(p.status) &&
      kind !== "staff_reschedule"
    )
      details.push(
        detailRow(
          th ? "สถานะ" : "Status",
          p.status === "confirmed"
            ? th
              ? "ยืนยันแล้ว"
              : "Confirmed"
            : th
              ? "รอยืนยัน"
              : "Pending confirmation",
        ),
      );
    if (p.ref) details.push(detailRow(th ? "เลขนัด" : "Reference", p.ref));
    if (details.length)
      components.push({
        type: "box",
        layout: "vertical",
        paddingAll: "lg",
        spacing: "sm",
        backgroundColor: "#F1F6FF",
        cornerRadius: "md",
        contents: details,
      });
  } else if (dateText) {
    components.push({
      type: "text",
      text:
        (lowSupply
          ? th
            ? "คาดว่าใกล้หมดวันที่ "
            : "Estimated low-supply date: "
          : "") + dateText,
      size: "xl",
      color: "#082451",
      weight: "bold",
      wrap: true,
    });
  }
  if (!appointment && showMap && branch)
    components.push({
      type: "text",
      text: branch,
      size: "md",
      weight: "bold",
      color: "#164DA7",
      wrap: true,
    });
  if (!appointment && p.from && !lowSupply)
    components.push({
      type: "text",
      text: p.from + (p.until ? " – " + p.until : ""),
      size: "md",
      color: "#164DA7",
      weight: "bold",
    });
  if (p.offer_until && !lowSupply) {
    const deadline = new Intl.DateTimeFormat(th ? "th-TH" : "en-GB", {
      timeZone: "Asia/Bangkok",
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(p.offer_until));
    components.push({
      type: "text",
      text: (th ? "รับคิวภายใน " : "Accept by ") + deadline,
      size: "sm",
      color: "#445C77",
    });
  }
  if (!appointment && p.ref && !lowSupply)
    components.push({
      type: "text",
      text: p.ref,
      size: "xs",
      color: "#445C77",
      wrap: true,
    });
  const buttons = [];
  if (url) {
    const main = (bookingLinkValue, label, style = "primary") => ({
      type: "button",
      style,
      height: "sm",
      ...(style === "primary" ? { color: "#124CB8" } : {}),
      action: { type: "uri", label, uri: bookingLinkValue },
    });
    if (
      p.booking_id &&
      [
        "reminder_today",
        "reminder_tomorrow",
        "visit_confirmed",
        "visit_updated",
      ].includes(kind)
    ) {
      const booking = String(p.booking_id);
      buttons.push(
        main(
          bookingLink(config, "customer", target, {
            booking,
            action: "attend",
          }),
          th ? "ยืนยันว่าจะมา" : "Confirm attendance",
        ),
      );
      buttons.push(
        main(
          bookingLink(config, "customer", target, {
            booking,
            action: "reschedule",
          }),
          th ? "ขอเลื่อนนัด" : "Request reschedule",
          "secondary",
        ),
      );
    } else if (canRefill) {
      buttons.push(main(url, th ? "ขอชุดเดิม" : "Request same set"));
    } else {
      buttons.push(
        main(
          url,
          target === "staff"
            ? th
              ? "เปิดแดชบอร์ด"
              : "Open dashboard"
            : th
              ? "ดูสถานะในระบบ"
              : "View details",
        ),
      );
    }
  }
  if (showMap && kind !== "visit_cancelled") {
    let mapUrl = "";
    try {
      const origin = new URL(config.baseUrl);
      if (origin.protocol === "https:")
        mapUrl = new URL("/api/locations/" + p.branch_id + "/map", origin).href;
    } catch {}
    if (!mapUrl)
      mapUrl = bookingLink(config, "customer", "appointments", {
        map: p.branch_id,
      });
    if (mapUrl)
      buttons.push({
        type: "button",
        style: "link",
        height: "sm",
        action: {
          type: "uri",
          label: th ? "แผนที่สาขา" : "Clinic map",
          uri: mapUrl,
        },
      });
  }
  return {
    type: "flex",
    altText: appointment
      ? [title, dateText, timeText, branch]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 400)
      : title,
    contents: {
      type: "bubble",
      size: "mega",
      header: {
        type: "box",
        layout: "vertical",
        backgroundColor: "#0B2C68",
        paddingAll: "xl",
        spacing: "md",
        contents: [
          {
            type: "text",
            text: "SUWAT CLINIC",
            size: "xs",
            color: "#B8DFFF",
            weight: "bold",
          },
          {
            type: "text",
            text: title,
            size: "xl",
            color: "#FFFFFF",
            wrap: true,
            weight: "bold",
          },
        ],
      },
      body: {
        type: "box",
        layout: "vertical",
        spacing: "md",
        contents: components,
      },
      ...(buttons.length
        ? {
            footer: {
              type: "box",
              layout: "vertical",
              spacing: "sm",
              contents: buttons,
            },
          }
        : {}),
    },
  };
}
