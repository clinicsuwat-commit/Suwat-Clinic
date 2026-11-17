const copy = {
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
    "เปิดแดชบอร์ดเพื่อตรวจรายการ",
    "Open the staff dashboard to review.",
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
  const target =
    notification.destination !== "customer"
      ? "staff"
      : kind.startsWith("refill_")
        ? "medications"
        : "appointments";
  const url = bookingLink(
    config,
    notification.destination,
    target,
    p.booking_id ? { booking: String(p.booking_id) } : {},
  );
  const components = [
    {
      type: "text",
      text: words[th ? 2 : 3],
      size: "sm",
      color: "#445C77",
      wrap: true,
    },
  ];
  if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) {
    const date = new Date(p.date + "T12:00:00+07:00");
    const value = new Intl.DateTimeFormat(th ? "th-TH" : "en-GB", {
      timeZone: "Asia/Bangkok",
      dateStyle: "long",
    }).format(date);
    components.push({
      type: "text",
      text: value,
      size: "xl",
      color: "#082451",
      weight: "bold",
      wrap: true,
    });
  }
  if (p.from)
    components.push({
      type: "text",
      text: p.from + (p.until ? " – " + p.until : ""),
      size: "md",
      color: "#164DA7",
      weight: "bold",
    });
  if (p.offer_until) {
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
  if (p.ref)
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
  return {
    type: "flex",
    altText: title,
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
