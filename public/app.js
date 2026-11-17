import { createCareUI } from "./care.js?v=3.2.0";
import {
  authenticateLineCustomer,
  clearExternalLineSession,
  isReturningFromLine,
  lineEntryUrl,
  lineLoginPendingKey,
  lineReturnParam,
  lineSignInError,
  lineSignedOutKey,
  rememberLineLogin,
} from "./line-session.js?v=3.1.2";

const $root = document.getElementById("root");
const icons = {
  heart: "heart",
  home: "home",
  calendar: "calendar",
  shop: "shop",
  user: "user",
  package: "package",
  chart: "chart",
  check: "check",
  arrow: "arrow",
  chevron: "chevron",
  back: "back",
  menu: "menu",
  close: "close",
  bell: "bell",
  clock: "clock",
  shield: "shield",
  truck: "truck",
  users: "users",
  settings: "settings",
  wallet: "wallet",
  plus: "plus",
  minus: "minus",
  sun: "sun",
  location: "location",
  search: "search",
  globe: "globe",
  lock: "lock",
  info: "info",
  logout: "logout",
  qr: "qr",
  scan: "scan",
  chat: "chat",
  pill: "pill",
  photo: "photo",
  cross: "cross",
};
const ico = (n, extra = "") =>
  `<svg class="icon ${extra}" aria-hidden="true"><use href="/icons.svg#${icons[n] || "heart"}"></use></svg>`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmtTHB = (n) =>
  new Intl.NumberFormat("th-TH", {
    style: "currency",
    currency: "THB",
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const later = (days) => {
  let d = new Date(today() + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
let lang = localStorage.getItem("sc_lang") === "en" ? "en" : "th";
let largeText = localStorage.getItem("sc_large_text") === "1";
const isWorkPage = (path) => path === "/staff" || path === "/manager";
function pageFromLocation() {
  const path = location.pathname.replace(/\/$/, "");
  if (path === "/admin") return "/manager";
  if (isWorkPage(path)) return path;
  const views = [
    "booking",
    "shop",
    "appointments",
    "orders",
    "account",
    "medications",
    "staff",
  ];
  const requestedView = new URLSearchParams(location.search).get("view");
  if (views.includes(requestedView)) return "/" + requestedView;
  return views.includes(path.slice(1)) ? path : "/";
}
let page = pageFromLocation();
let lineGroups = { groups: [], active: "" };
let config = { demo: false, liffId: "" },
  me = { customer: null, staff: null },
  allProducts = [],
  orders = [],
  staffData = null,
  orderResult = null,
  cart = {},
  cartOpen = false,
  adminTab = new URLSearchParams(location.search).get("tab") || "overview",
  loading = false;
let workSession = "checking";
let workError = false;
let workAccessDenied = false;
let workRev = 0;
let managerData = null;
let loginError = "";
let sessionExpired = false;
try {
  cart = JSON.parse(localStorage.getItem("sc_cart") || "{}");
} catch {
  cart = {};
}
const dictionary = {
  th: {
    navMenu: "เมนูหลัก",
    home: "หน้าหลัก",
    booking: "จองคิว",
    shop: "ร้านค้า",
    appointments: "การนัดหมาย",
    orders: "คำสั่งซื้อ",
    account: "บัญชีของฉัน",
    staff: "สำหรับพนักงาน",
    help: "ติดต่อคลินิก",
    care: "ความใส่ใจที่คุณเลือกได้",
    welcome: "สุขภาพดี เริ่มต้นได้ง่ายกว่าเดิม",
    heroTitle: "การดูแลสุขภาพที่<br><em>ง่ายและใกล้ตัวคุณ</em>",
    heroSub:
      "จองคิวล่วงหน้า เลือกช่วงเวลาที่สะดวก และสั่งซื้อผลิตภัณฑ์ได้ในที่เดียว ผ่าน Suwat Clinic",
    startBooking: "จองคิวเลย",
    browse: "เลือกดูสินค้า",
    todaySlots: "ช่วงเวลาที่เปิดให้จอง",
    bookAny: "จองคิวได้ทุกวัน",
    fast: "ใช้งานสะดวก",
    private: "ข้อมูลปลอดภัย",
    simple: "บริการที่คุณใช้งานได้ง่าย",
    quick: "ทุกบริการในที่เดียว",
    bookingCard: "จองคิวเข้ารับบริการ",
    bookingDesc: "เลือกวันและเวลา ตรวจสอบคิวว่างแบบเรียลไทม์",
    shopCard: "ผลิตภัณฑ์สุขภาพ",
    shopDesc: "ดูรายการสินค้า ราคา และสต็อกคงเหลือ",
    trackCard: "ติดตามสถานะ",
    trackDesc: "ตรวจสอบนัดหมายและคำสั่งซื้อของคุณ",
    how: "การจองทำได้ใน 3 ขั้นตอน",
    howDesc: "เพียงเลือกเวลา ระบุข้อมูล และยืนยัน",
    stepA: "เลือกวันและเวลา",
    stepB: "กรอกข้อมูล",
    stepC: "ยืนยันการจอง",
    bookTitle: "นัดหมายกับ Suwat Clinic",
    bookSub: "เลือกช่วงเวลาที่เหมาะกับคุณ",
    chooseDate: "วันที่ต้องการเข้ารับบริการ",
    chooseSlot: "ช่วงเวลาที่สะดวก",
    available: "ว่าง",
    full: "เต็มแล้ว",
    closed: "ปิดให้บริการ",
    morning: "ช่วงเช้า",
    afternoon: "ช่วงบ่าย",
    evening: "ช่วงเย็น",
    next: "ดำเนินการต่อ",
    back: "ย้อนกลับ",
    personalInfo: "ข้อมูลสำหรับการนัดหมาย",
    patient: "ชื่อผู้เข้ารับบริการ",
    phone: "เบอร์โทรศัพท์",
    reason: "อาการเบื้องต้นหรือเหตุผลที่มา",
    reasonPlaceholder: "ระบุข้อมูลเบื้องต้นเท่าที่ต้องการ (ไม่จำเป็นต้องกรอก)",
    privacy: "ข้อมูลอาการจะไม่ปรากฏใน LINE กลุ่มพนักงาน และเปิดได้เฉพาะผู้ที่มีสิทธิ์",
    review: "ตรวจสอบรายละเอียดการจอง",
    date: "วันที่",
    slot: "ช่วงเวลา",
    name: "ชื่อ",
    status: "สถานะ",
    note: "หมายเหตุ",
    confirm: "ยืนยันการจอง",
    success: "ทำรายการสำเร็จ",
    booked: "บันทึกการจองเรียบร้อย",
    ref: "หมายเลขอ้างอิง",
    viewBookings: "ดูการนัดหมายของฉัน",
    shopTitle: "Suwat Clinic Store",
    shopSub: "เลือกดูผลิตภัณฑ์เสริมอาหารและสินค้าภายในคลินิก",
    sample: "สินค้าตัวอย่าง",
    stock: "คงเหลือ",
    outOfStock: "สินค้าหมด",
    add: "เพิ่มลงตะกร้า",
    cart: "ตะกร้าสินค้า",
    emptyCart: "ยังไม่มีสินค้าในตะกร้า",
    checkout: "ดำเนินการสั่งซื้อ",
    pickup: "รับที่คลินิก",
    shipping: "จัดส่งถึงบ้าน",
    delivery: "วิธีรับสินค้า",
    address: "ที่อยู่จัดส่ง",
    addressPlaceholder: "บ้านเลขที่ ถนน ตำบล อำเภอ จังหวัด รหัสไปรษณีย์",
    total: "ยอดรวม",
    placeOrder: "ยืนยันคำสั่งซื้อ",
    orderCreated: "รับคำสั่งซื้อเรียบร้อย",
    paymentPending: "ยังไม่ยืนยันการชำระเงิน กรุณาติดต่อคลินิกเพื่อชำระเงิน",
    supplementNotice:
      "ผลิตภัณฑ์เสริมอาหารไม่ใช่ยา ไม่มีผลในการป้องกันหรือรักษาโรค ตรวจสอบฉลากและคำแนะนำจากผู้เชี่ยวชาญก่อนเลือกซื้อ",
    myBookings: "การนัดหมายของฉัน",
    myOrders: "คำสั่งซื้อของฉัน",
    nothingBooked: "ยังไม่มีรายการนัดหมาย",
    nothingOrdered: "ยังไม่มีคำสั่งซื้อ",
    cancel: "ยกเลิกการจอง",
    track: "เลขพัสดุ",
    details: "รายละเอียด",
    myAccount: "ข้อมูลสมาชิก",
    edit: "แก้ไขข้อมูล",
    save: "บันทึกข้อมูล",
    lineMember: "สมาชิกเชื่อมต่อ LINE",
    demoMember: "สมาชิกทดลอง",
    phoneVerify: "ยืนยันเบอร์โทร",
    otp: "รหัส OTP",
    sendOTP: "ส่งรหัสยืนยัน",
    verify: "ตรวจสอบรหัส",
    phoneUnverified: "เบอร์โทรยังไม่ผ่านการยืนยัน",
    phoneVerified: "ยืนยันเบอร์โทรแล้ว",
    signIn: "เข้าสู่ระบบสมาชิก",
    loginDesc: "เข้าสู่ระบบด้วย LINE เพื่อเก็บการจองและติดตามคำสั่งซื้อในบัญชีเดียวกัน",
    loginLine: "เข้าสู่ระบบด้วย LINE",
    demoLogin: "ทดลองเป็นลูกค้า",
    demoNote: "โหมดสาธิต: ไม่ใช่การส่งข้อความ LINE หรือรับเงินของจริง",
    logout: "ออกจากระบบ",
    contact: "ติดต่อ Suwat Clinic",
    contactDesc: "หากมีข้อสงสัยหรือจำเป็นต้องเปลี่ยนนัด กรุณาติดต่อคลินิกทาง LINE OA เดิม",
    protected: "ระบบนี้จำกัดการเข้าถึงข้อมูลตามบทบาท",
    staffLogin: "เข้าสู่ระบบพนักงาน",
    username: "ชื่อผู้ใช้",
    password: "รหัสผ่าน",
    dashboard: "ภาพรวม",
    queue: "รายการจอง",
    staffOrders: "จัดการคำสั่งซื้อ",
    inventory: "สต็อกสินค้า",
    addProduct: "เพิ่มผลิตภัณฑ์",
    settings: "ตั้งค่าคิว",
    tasks: "งานที่ต้องรับทราบ",
    ack: "รับทราบ",
    ackDone: "รับทราบแล้ว",
    noTasks: "ไม่มีงานที่รอดำเนินการ",
    bookingsToday: "คิวประจำวันที่เลือก",
    capacity: "รับได้ทั้งหมด",
    remaining: "คิวว่าง",
    sales: "ยอดชำระที่ยืนยันแล้ว",
    newTasks: "งานที่ต้องดำเนินการ",
    bookingRef: "รหัสการจอง",
    orderRef: "รหัสคำสั่งซื้อ",
    actions: "จัดการ",
    paid: "ยืนยันชำระแล้ว",
    unpaid: "รอตรวจสอบชำระเงิน",
    markPaid: "ตรวจสอบยอดแล้ว",
    packing: "กำลังจัดเตรียม",
    shipped: "จัดส่งแล้ว",
    delivered: "ส่งถึงแล้ว",
    checkedIn: "เช็กอิน",
    completed: "เสร็จสิ้น",
    approved: "อนุมัติ",
    noShow: "ไม่มาตามนัด",
    mark: "บันทึก",
    slotSetting: "จำนวนคิวต่อช่วงเวลา",
    dateOverride: "ตั้งค่าคิวเฉพาะวัน",
    mode: "รูปแบบการยืนยันคิว",
    auto: "ยืนยันอัตโนมัติ",
    manual: "รอเจ้าหน้าที่ยืนยัน",
    saveSettings: "บันทึกการตั้งค่า",
    restock: "เพิ่มสินค้าเข้าสต็อก",
    product: "ผลิตภัณฑ์",
    lot: "เลขล็อต",
    expiry: "วันหมดอายุ",
    quantity: "จำนวน",
    addStock: "เพิ่มสต็อก",
    allSales: "ยอดสั่งซื้อที่ยืนยันชำระ",
    overview: "ภาพรวมการทำงาน",
    intro: "ออกแบบให้ใช้งานง่ายสำหรับทุกวัย",
    powered: "Suwat Clinic • Simple care, every day",
    demoLabel: "DEMO / ระบบสาธิต",
    verifyLine: "LINE OA เดิมพร้อมเชื่อมต่อ",
    loginToBook: "เข้าสู่ระบบก่อนทำรายการ",
    reviewData: "กรุณาตรวจสอบข้อมูลก่อนส่ง",
    wait: "กำลังประมวลผล...",
    ok: "ตกลง",
    active: "พร้อมใช้งาน",
    shipProvider: "บริษัทขนส่ง",
    trackingNumber: "หมายเลขพัสดุ",
    notConfigured: "ยังไม่ได้เชื่อมต่อ",
    reserved: "คิวที่จองแล้ว",
    newOrder: "คำสั่งซื้อใหม่",
    why: "ออกแบบมาเพื่อคุณ",
    designed: "ใช้งานง่าย ตัวอักษรชัดเจน รองรับทุกวัย",
    policy: "ข้อมูลส่วนบุคคลและสุขภาพถูกจัดการตามสิทธิ์การเข้าถึง",
    summary: "สรุปข้อมูล",
    signInFirst: "กรุณาเข้าสู่ระบบสมาชิกก่อน",
    currentLang: "ภาษา",
    notAvailable: "ยังไม่เปิดใช้งาน",
    clinicPickup: "รับที่หน้าคลินิก",
    orderInfo: "คำสั่งซื้อจะอยู่ในสถานะรอตรวจสอบการชำระเงิน",
    previewOnly: "ข้อมูลตัวอย่างสำหรับทดสอบระบบ",
  },
  en: {
    navMenu: "MAIN MENU",
    home: "Home",
    booking: "Book a visit",
    shop: "Shop",
    appointments: "Appointments",
    orders: "My orders",
    account: "My account",
    staff: "Staff portal",
    help: "Contact clinic",
    care: "Care that feels personal",
    welcome: "Better care, made simpler",
    heroTitle: "Healthcare that<br><em>feels effortless</em>",
    heroSub:
      "Book a visit, choose a convenient time, and browse our clinic products, all in one place.",
    startBooking: "Book an appointment",
    browse: "Explore products",
    todaySlots: "Booking time windows",
    bookAny: "Easy scheduling",
    fast: "Simple to use",
    private: "Private by design",
    simple: "Your clinic, made simpler",
    quick: "Everything in one place",
    bookingCard: "Book an appointment",
    bookingDesc: "Choose a day and see real-time availability",
    shopCard: "Clinic products",
    shopDesc: "Browse products, prices and inventory",
    trackCard: "Track your care",
    trackDesc: "View upcoming visits and your orders",
    how: "Book in 3 simple steps",
    howDesc: "Choose a slot, fill in your details, and confirm",
    stepA: "Date & time",
    stepB: "Your details",
    stepC: "Confirmation",
    bookTitle: "Book a visit at Suwat Clinic",
    bookSub: "Choose the most convenient time for you",
    chooseDate: "Preferred visit date",
    chooseSlot: "Available time window",
    available: "Available",
    full: "Full",
    closed: "Closed",
    morning: "Morning",
    afternoon: "Afternoon",
    evening: "Late afternoon",
    next: "Continue",
    back: "Go back",
    personalInfo: "Appointment details",
    patient: "Patient name",
    phone: "Phone number",
    reason: "Initial symptoms or reason for visit",
    reasonPlaceholder:
      "Optional. Share only what you feel comfortable sharing.",
    privacy:
      "Your symptoms are never posted to the staff LINE group, and can only be accessed by authorized personnel.",
    review: "Review your appointment",
    date: "Date",
    slot: "Time",
    name: "Name",
    status: "Status",
    note: "Notes",
    confirm: "Confirm booking",
    success: "Success",
    booked: "Your request has been saved",
    ref: "Reference number",
    viewBookings: "View my appointments",
    shopTitle: "Suwat Clinic Store",
    shopSub: "Explore dietary supplements and clinic products",
    sample: "Sample product",
    stock: "In stock",
    outOfStock: "Out of stock",
    add: "Add to bag",
    cart: "Your bag",
    emptyCart: "Your bag is empty",
    checkout: "Checkout",
    pickup: "Pick up at clinic",
    shipping: "Ship to my address",
    delivery: "Delivery method",
    address: "Shipping address",
    addressPlaceholder: "House number, street, district, city and postal code",
    total: "Total",
    placeOrder: "Place order",
    orderCreated: "Order placed",
    paymentPending:
      "Payment is not yet verified. Please contact the clinic for payment instructions.",
    supplementNotice:
      "Dietary supplements are not medicines and do not prevent or treat diseases. Check product labels and professional advice before buying.",
    myBookings: "My appointments",
    myOrders: "My orders",
    nothingBooked: "No appointments yet",
    nothingOrdered: "No orders yet",
    cancel: "Cancel booking",
    track: "Tracking",
    details: "Details",
    myAccount: "Member profile",
    edit: "Edit profile",
    save: "Save changes",
    lineMember: "LINE-connected member",
    demoMember: "Demo member",
    phoneVerify: "Verify phone",
    otp: "OTP code",
    sendOTP: "Send verification code",
    verify: "Verify code",
    phoneUnverified: "Phone number not verified",
    phoneVerified: "Phone number verified",
    signIn: "Sign in to Suwat Clinic",
    loginDesc:
      "Sign in with LINE to keep your appointments and purchases together.",
    loginLine: "Continue with LINE",
    demoLogin: "Try demo account",
    demoNote: "Demo mode: no real LINE messages or payments are sent.",
    logout: "Log out",
    contact: "Contact Suwat Clinic",
    contactDesc:
      "Need help or want to change a booking? Contact the clinic through its existing LINE OA.",
    protected: "Access to health details is limited by staff permissions",
    staffLogin: "Staff sign in",
    username: "Username",
    password: "Password",
    dashboard: "Dashboard",
    queue: "Appointments",
    staffOrders: "Orders",
    inventory: "Inventory",
    addProduct: "Add a product",
    settings: "Booking settings",
    tasks: "Tasks to acknowledge",
    ack: "Acknowledge",
    ackDone: "Acknowledged",
    noTasks: "No pending tasks",
    bookingsToday: "Appointments on selected day",
    capacity: "Daily capacity",
    remaining: "Open slots",
    sales: "Verified payments",
    newTasks: "Pending tasks",
    bookingRef: "Booking ref",
    orderRef: "Order ref",
    actions: "Actions",
    paid: "Payment verified",
    unpaid: "Payment pending",
    markPaid: "Verify payment",
    packing: "Packing",
    shipped: "Shipped",
    delivered: "Delivered",
    checkedIn: "Checked in",
    completed: "Completed",
    approved: "Confirm",
    noShow: "No-show",
    mark: "Save",
    slotSetting: "Capacity per time window",
    dateOverride: "One-day capacity override",
    mode: "Booking approval mode",
    auto: "Confirm automatically",
    manual: "Require staff approval",
    saveSettings: "Save settings",
    restock: "Add inventory lot",
    product: "Product",
    lot: "Batch/lot",
    expiry: "Expiry date",
    quantity: "Quantity",
    addStock: "Add stock",
    allSales: "Verified sales",
    overview: "Your clinic at a glance",
    intro: "Designed for every age and ability",
    powered: "Suwat Clinic • Simple care, every day",
    demoLabel: "DEMO / PREVIEW",
    verifyLine: "Existing LINE OA compatible",
    loginToBook: "Sign in before continuing",
    reviewData: "Check your details before submitting",
    wait: "Processing...",
    ok: "OK",
    active: "Active",
    shipProvider: "Carrier",
    trackingNumber: "Tracking number",
    notConfigured: "Not connected",
    reserved: "Reserved",
    newOrder: "New order",
    why: "Designed around you",
    designed: "Clear labels, readable type and easy steps for everyone",
    policy: "Personal and health information is access-controlled",
    summary: "Summary",
    signInFirst: "Please sign in first",
    currentLang: "Language",
    notAvailable: "Not available yet",
    clinicPickup: "Pick up at clinic",
    orderInfo: "Orders are marked as awaiting payment verification",
    previewOnly: "Sample data for testing",
  },
};
Object.assign(dictionary.th, {
  phoneSaveTitle: "หมายเลขโทรศัพท์สำหรับการติดต่อ",
  phoneSaveHelp: "กรอกเบอร์โทรที่ติดต่อได้จริง เพื่อให้พนักงานยืนยันนัดหมาย ไม่ต้องรับ SMS OTP",
  phoneSave: "บันทึกเบอร์โทร",
  phoneMissing: "กรุณาบันทึกเบอร์โทรก่อนจองคิวหรือสั่งซื้อ",
  phoneSelfReported: "เบอร์นี้กรอกด้วยตนเอง ยังไม่ได้ยืนยันว่าเป็นเจ้าของเบอร์",
  phoneSaved: "บันทึกเบอร์โทรเรียบร้อย",
  phoneNoSms: "ไม่มีค่า SMS OTP · เจ้าหน้าที่อาจโทรตรวจสอบเมื่อจำเป็น",
  phonePreviouslyVerified: "หมายเลขที่เคยยืนยันแล้ว",
  bookingPendingNote: "คำขอจองคิวรอพนักงานตรวจสอบและยืนยัน",
});
Object.assign(dictionary.en, {
  phoneSaveTitle: "Contact phone number",
  phoneSaveHelp:
    "Enter a reachable number so staff can confirm your appointment. No SMS OTP is needed.",
  phoneSave: "Save phone",
  phoneMissing: "Please save a phone number before booking or ordering",
  phoneSelfReported:
    "This number is self-reported; ownership has not been verified",
  phoneSaved: "Phone number saved",
  phoneNoSms: "No SMS OTP fees · Staff may call if confirmation is needed",
  phonePreviouslyVerified: "Previously verified number",
  bookingPendingNote:
    "Your booking request requires staff review and confirmation",
});
const t = (k) => dictionary[lang][k] || k;
const loc = (th, en) => (lang === "th" ? th : en);
dictionary.th.medications = "ประวัติการจ่ายยา";
dictionary.en.medications = "Medication history";
let busy = false;
let lineChecking = false;
let lineInClient = null;
let lineError = null;
let lineAuthentication;
const touchDevice =
  matchMedia("(pointer: coarse)").matches ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
async function sending(work, title = loc("กำลังบันทึก…", "Saving…")) {
  if (busy) return;
  busy = true;
  const opened = performance.now();
  if (globalThis.Swal) {
    void globalThis.Swal.fire({
      title,
      text: loc("กรุณารอสักครู่", "Please wait a moment"),
      showConfirmButton: false,
      allowOutsideClick: false,
      allowEscapeKey: false,
      returnFocus: false,
      didOpen: () => globalThis.Swal.showLoading(),
    });
  } else showToast(t("wait"));
  try {
    return await work();
  } finally {
    const remaining = 240 - (performance.now() - opened);
    if (remaining > 0)
      await new Promise((resolve) => setTimeout(resolve, remaining));
    globalThis.Swal?.close();
    busy = false;
  }
}

function statusText(v) {
  const map = {
    pending: lang === "th" ? "รอยืนยัน" : "Pending",
    confirmed: lang === "th" ? "ยืนยันแล้ว" : "Confirmed",
    checked_in: t("checkedIn"),
    completed: t("completed"),
    cancelled: lang === "th" ? "ยกเลิกแล้ว" : "Cancelled",
    no_show: t("noShow"),
    awaiting_payment: t("unpaid"),
    packing: t("packing"),
    shipped: t("shipped"),
    delivered: t("delivered"),
  };
  return map[v] || v;
}
function statusTag(v) {
  const bad = ["cancelled", "no_show"],
    warn = ["pending", "awaiting_payment"];
  return `<span class="tag ${bad.includes(v) ? "red" : warn.includes(v) ? "warn" : ""}">${esc(statusText(v))}</span>`;
}
const displayDate = (s) => {
  if (!s) return "-";
  return new Date(s + "T12:00:00+07:00").toLocaleDateString(
    lang === "th" ? "th-TH" : "en-GB",
    {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Bangkok",
    },
  );
};
const pName = (p) => (lang === "th" ? p.title_th : p.title_en);
const pDesc = (p) => (lang === "th" ? p.desc_th : p.desc_en);
const sLabel = (s) => (lang === "th" ? s.label_th : s.label_en);
function q(url) {
  const oldPage = page;
  history.pushState({}, "", url);
  page = pageFromLocation();
  if (oldPage !== page) {
    care.resetVisit();
    adminTab = new URLSearchParams(location.search).get("tab") || "overview";
    workError = false;
    workAccessDenied = false;
  }
  care.closeModal(false);
  orderResult = null;
  cartOpen = false;
  render();
  refreshForPage();
  window.scrollTo(0, 0);
}
function updateWorkFilter(name, value) {
  const url = new URL(location.href);
  if (value) url.searchParams.set(name, value);
  else url.searchParams.delete(name);
  history.replaceState(history.state, "", url);
}
function selectedWorkDate() {
  const date = new URLSearchParams(location.search).get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return today();
  const parsed = new Date(date + "T00:00:00Z");
  return !Number.isNaN(+parsed) && parsed.toISOString().slice(0, 10) === date
    ? date
    : today();
}
function clearWorkSession(expired = false) {
  workRev++;
  me.staff = null;
  staffData = managerData = null;
  workSession = "signed-out";
  sessionExpired = expired;
  workError = workAccessDenied = false;
  care.closeModal(false);
  care.resetWork();
  render();
}
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => el.classList.remove("visible"), 3200);
}
async function request(
  url,
  body,
  method = body === undefined ? "GET" : "POST",
) {
  const r = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({}));
  if (
    r.status === 401 &&
    isWorkPage(page) &&
    me.staff &&
    (url.startsWith("/api/staff/") || url.startsWith("/api/manager/")) &&
    url !== "/api/staff/login"
  )
    clearWorkSession(true);
  if (!r.ok)
    throw Object.assign(new Error(data.error || `HTTP ${r.status}`), {
      code: data.code,
      status: r.status,
    });
  return data;
}
async function post(url, data = {}) {
  return request(url, data, "POST");
}
function cartCount() {
  return Object.values(cart).reduce((a, b) => a + Number(b), 0);
}
function cartPrice() {
  return Object.entries(cart).reduce(
    (a, [id, qty]) =>
      a + (allProducts.find((p) => p.id === Number(id))?.price || 0) * qty,
    0,
  );
}
function saveCart() {
  localStorage.setItem("sc_cart", JSON.stringify(cart));
  render();
}
function navItem(path, label, iconName) {
  const active = page === path;
  return `<a href="${path}" class="nav-btn ${active ? "active" : ""}" data-nav="${path}" ${active ? 'aria-current="page"' : ""}>${ico(iconName)}<span>${label}</span></a>`;
}
function shell(content) {
  if (isWorkPage(page)) return workShell(content);
  const mainLinks = [
    ["/", t("home"), "home"],
    ["/booking", t("booking"), "calendar"],
    ["/appointments", t("appointments"), "clock"],
    ["/medications", t("medications"), "pill"],
    ["/shop", t("shop"), "shop"],
    ["/orders", t("orders"), "package"],
    ["/account", t("account"), "user"],
  ];
  const mobile = [
    mainLinks[0],
    mainLinks[1],
    ["/appointments", loc("ดูนัด", "Visits"), "clock"],
    ["/medications", loc("ประวัติยา", "My meds"), "pill"],
    ["/account", loc("บัญชี", "Account"), "user"],
  ];
  const link = (links) =>
    links.map(([path, label, icon]) => navItem(path, label, icon)).join("");
  const brand = `<span class="brand-logo">${ico("cross")}</span><span>Suwat <b>Clinic</b></span>`;
  const shortPage = page === "/" ? loc("หน้าหลัก", "Home") : t(page.slice(1));
  return `<a class="skip-link" href="#main-work">${loc("ข้ามไปเนื้อหาหลัก", "Skip to content")}</a><div class="shell patient-shell"><aside class="sidebar"><a class="brand" href="/" data-nav="/">${brand}</a><div class="nav-items">${link(mainLinks)}</div></aside>
    <div class="main"><header class="topbar"><a class="brand mobile-brand" href="/" data-nav="/">${brand}</a>
      <div class="top-left"><span class="eyebrow">SUWAT CLINIC</span><h2>${shortPage}</h2></div>
      <div class="top-actions"><div class="lang-switch" aria-label="${t("currentLang")}"><button data-lang="th" class="${lang === "th" ? "active" : ""}" aria-pressed="${lang === "th"}">ไทย</button><button data-lang="en" class="${lang === "en" ? "active" : ""}" aria-pressed="${lang === "en"}">EN</button></div>
      <button type="button" class="avatar" data-nav="/account" aria-label="${t("account")}">${ico("user")}</button></div></header>
      <main class="main-content" id="main-work" tabindex="-1">${content}<footer class="footer"><span>© ${new Date().getFullYear()} Suwat Clinic</span><button type="button" class="btn outline text-size-toggle" data-action="text-size" aria-pressed="${largeText}">${largeText ? loc("ตัวอักษรขนาดปกติ", "Default text size") : loc("ขยายตัวอักษร", "Larger text")}</button></footer></main>
    </div></div><nav class="mobile-bar" aria-label="${t("navMenu")}">${link(mobile)}</nav>`;
}
function sectionHeader(title, sub, tail = "") {
  return `<div class="section-header"><div><span class="eyebrow">SUWAT CLINIC</span><h2>${title}</h2>${sub ? `<p>${sub}</p>` : ""}</div>${tail}</div>`;
}
function confirmation() {
  const r = orderResult;
  return `<div class="card confirmation"><div class="big-check">${ico("check")}</div><h2>${t("orderCreated")}</h2><p>${t("paymentPending")}</p><div class="divider"></div><span class="mini-title">${t("ref")}</span><h2>${esc(r.order_ref)}</h2><p>${fmtTHB(r.amount)}</p>${statusTag(r.status)}<div class="care-actions"><button class="btn primary" data-nav="/orders">${t("myOrders")} ${ico("arrow")}</button><button class="btn outline" data-nav="/">${t("home")}</button></div></div>`;
}
function shop() {
  if (orderResult) return confirmation();
  return `${sectionHeader(t("shopTitle"), t("shopSub"), `<button class="btn primary" data-action="cart">${ico("shop")} ${t("cart")} (${cartCount()})</button>`)}<div class="product-grid">${allProducts.map((p) => `<article class="product-card"><div class="product-art"><span class="pill">${t("product")}</span><img src="/assets/${esc(p.image)}" alt="${esc(pName(p))}" loading="lazy"></div><div class="product-info"><h3>${esc(pName(p))}</h3><p>${esc(pDesc(p))}</p><span class="tiny-muted">${p.stock > 0 ? `${t("stock")} ${p.stock}` : t("outOfStock")}</span><div class="price-line"><span class="price">${fmtTHB(p.price)}</span><button class="add-btn" ${p.stock < 1 ? "disabled" : ""} data-add="${p.id}" aria-label="${t("add")} ${esc(pName(p))}">${ico("plus")}</button></div></div></article>`).join("") || `<div class="empty">${ico("shop")}<h3>${t("notAvailable")}</h3></div>`}</div><p class="caption-note" style="margin-top:18px">${ico("info")} ${t("supplementNotice")}</p>${cartOpen ? cartModal() : ""}`;
}
function cartModal() {
  const entries = Object.entries(cart).filter(
    ([id, qty]) => qty > 0 && allProducts.some((p) => p.id === Number(id)),
  );
  return `<div class="modal-backdrop" role="presentation"><section class="modal" role="dialog" aria-modal="true" aria-label="${t("cart")}"><button class="modal-close" data-action="cart-close" aria-label="Close">${ico("close")}</button><h2>${t("cart")} <span class="tag">${cartCount()}</span></h2>${
    entries.length
      ? `<div>${entries
          .map(([id, qty]) => {
            const p = allProducts.find((p) => p.id === Number(id));
            return `<div class="cart-row"><img src="/assets/${esc(p.image)}" alt=""><div style="flex:1"><strong style="font-size:12px">${esc(pName(p))}</strong><div style="color:var(--green);font-size:12px;font-weight:800">${fmtTHB(p.price)}</div></div><div class="qty"><button data-qty="${id}:-1" aria-label="Subtract">${ico("minus")}</button><strong>${qty}</strong><button data-qty="${id}:1" aria-label="Add" ${qty >= p.stock ? "disabled" : ""}>${ico("plus")}</button></div></div>`;
          })
          .join(
            "",
          )}</div><div class="summary-row" style="margin-top:18px"><span>${t("total")}</span><strong style="font-size:22px">${fmtTHB(cartPrice())}</strong></div><form data-form="checkout"><div class="field"><label for="delivery">${t("delivery")}</label><select class="select" id="delivery" name="delivery"><option value="pickup">${t("pickup")}</option><option value="shipping">${t("shipping")}</option></select></div><div class="field"><label for="address">${t("address")} (${lang === "th" ? "กรณีจัดส่ง" : "shipping only"})</label><textarea class="textarea" id="address" name="address" placeholder="${t("addressPlaceholder")}" style="min-height:80px"></textarea></div><p class="caption-note">${t("orderInfo")}</p><button class="btn primary" style="width:100%" ${loading ? "disabled" : ""}>${t("placeOrder")} ${ico("arrow")}</button></form>`
      : `<div class="empty">${ico("shop")}<h3>${t("emptyCart")}</h3></div>`
  }</section></div>`;
}
function orderList() {
  return `${sectionHeader(t("myOrders"), t("trackDesc"))}${!me.customer ? loginPrompt() : orders.length ? orders.map((o) => `<div class="list-card"><div><span class="eyebrow">${esc(o.order_ref)}</span><h3>${fmtTHB(o.amount)}</h3><p>${o.items.map((i) => esc(lang === "th" ? i.title_th : i.title_en) + " ×" + i.qty).join(" · ")}</p>${o.tracking_no ? `<p>${t("track")}: ${esc(o.carrier)} · ${esc(o.tracking_no)}</p>` : ""}</div><div>${statusTag(o.status)}<p class="tiny-muted">${o.payment_status === "verified" ? t("paid") : t("unpaid")}</p></div></div>`).join("") : `<div class="card empty">${ico("package")}<h3>${t("nothingOrdered")}</h3><button class="btn primary" data-nav="/shop">${t("browse")}</button></div>`}`;
}
function loginPrompt() {
  const available = config.liffId && config.lineReady !== false;
  const error =
    lineError ||
    (!available && !config.demo
      ? lineSignInError("LINE_NOT_CONFIGURED")
      : null);
  const launch =
    available && lineEntryUrl(location.href, page.slice(1), config.liffId);
  const reopenInLine =
    lineInClient &&
    [
      "LINE_LOGIN_INCOMPLETE",
      "LINE_TOKEN_MISSING",
      "LINE_TOKEN_EXPIRED",
      "LINE_TOKEN_INVALID",
      "LINE_SESSION_NOT_SAVED",
    ].includes(error?.code);
  const showLineApp =
    launch && ((touchDevice && !lineInClient) || reopenInLine);
  const openLine = showLineApp
    ? `<a class="btn primary" href="${esc(launch)}" data-line-open>${reopenInLine ? loc("เปิดคลินิกใน LINE ใหม่", "Reopen clinic in LINE") : loc("เปิดในแอป LINE", "Open in LINE")} ${ico("arrow")}</a>`
    : "";
  const browserButton =
    available && !reopenInLine
      ? `<button class="btn ${showLineApp ? "outline" : "primary"}" data-action="line-login">${showLineApp ? loc("เข้าสู่ระบบบนเว็บ", "Sign in on the web") : t("loginLine")} ${ico("arrow")}</button>`
      : "";
  const problem = error
    ? `<div class="member-login-error" role="alert" tabindex="-1"><strong>${loc("ยังเข้าใช้งานไม่ได้", "Couldn't sign in")}</strong><p>${esc(care.errorText(error))}</p></div>`
    : "";
  const support =
    error && config.lineOaUrl
      ? `<a class="btn outline" href="${esc(config.lineOaUrl)}">${t("help")}</a>`
      : "";
  const controls = lineChecking
    ? `<p class="member-login-status" role="status">${loc("กำลังเชื่อมบัญชี LINE กรุณารอสักครู่", "Connecting to LINE. Please wait.")}</p>`
    : `${problem}<div class="member-login-actions">${openLine}${browserButton}${support}${config.demo ? `<button class="btn primary" data-action="demo-login">${t("demoLogin")}</button>` : ""}</div>`;
  return `<section class="card login-card member-login"><div class="profile-badge">${ico("user")}</div><h3>${t("signIn")}</h3><p>${t("loginDesc")}</p>${controls}</section>`;
}
function account() {
  if (!me.customer) return `${sectionHeader(t("myAccount"))}${loginPrompt()}`;
  return `${sectionHeader(t("myAccount"), t("lineMember"))}<div class="account-grid">${care.accountCards()}<div class="card account-card"><div class="profile-badge">${ico("user")}</div><h3>${esc(me.customer.display_name)}</h3><p class="muted" style="font-size:12px">${config.demo ? t("demoMember") : t("lineMember")}</p><div class="divider"></div><form data-form="profile"><div class="field"><label>${t("name")}</label><input class="input" name="name" required minlength="2" maxlength="100" value="${esc(me.customer.display_name)}"></div><div class="field"><label>${t("currentLang")}</label><select class="select" name="language"><option value="th" ${lang === "th" ? "selected" : ""}>ภาษาไทย</option><option value="en" ${lang === "en" ? "selected" : ""}>English</option></select></div><button class="btn primary">${t("save")} ${ico("check")}</button></form><div class="divider"></div><h3>${t("phoneSaveTitle")}</h3><p class="muted" style="font-size:13px">${t("phoneSaveHelp")}</p><div class="alert">${ico("info")} ${me.customer.phone_verified ? t("phonePreviouslyVerified") : t("phoneSelfReported")}</div><form data-form="phone-save"><div class="field"><label for="member_phone">${t("phone")}</label><input id="member_phone" class="input" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="08XXXXXXXX" pattern="0[0-9]{9}" maxlength="10" value="${esc(me.customer.phone || "")}" required></div><button class="btn primary">${t("phoneSave")} ${ico("check")}</button></form><p class="caption-note">${t("phoneNoSms")}</p><div class="divider"></div><button class="btn outline" data-action="logout">${ico("logout")} ${t("logout")}</button></div></div>`;
}
function staffLogin() {
  return `<section class="card login-card work-login"><h2>${loc("เข้าสู่ระบบด้วยบัญชีที่ทำงาน", "Sign in with your work account")}</h2>
    ${sessionExpired ? `<p role="status">${loc("หมดเวลาใช้งาน เข้าสู่ระบบอีกครั้งเพื่อกลับมาทำงานเดิม", "Your session expired. Sign in to return to your work.")}</p>` : ""}
    ${loginError ? `<p class="member-login-error" role="alert">${esc(loginError)}</p>` : ""}
    <form data-form="staff-login">
    <label class="field">${loc("อีเมลพนักงาน", "Work email")}<input class="input" type="email" name="username" autocomplete="username" required></label>
    <label class="field">${t("password")}<input class="input" name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit" class="btn primary">${loc("เข้าสู่ระบบ", "Sign in")} ${ico("arrow")}</button></form></section>`;
}
function workShell(content) {
  const manager = page === "/manager";
  return `<a class="skip-link" href="#main-work">${loc("ข้ามไปเนื้อหาหลัก", "Skip to content")}</a>
  <div class="work-shell ${manager ? "manager-shell" : "staff-shell"}">
    <header class="work-header"><div><span>Suwat Clinic</span><h1>${manager ? loc("ระบบผู้บริหาร", "Manager workspace") : loc("ระบบสตาฟ", "Staff workspace")}</h1></div>
      <div class="work-actions"><div class="lang-switch" aria-label="${t("currentLang")}"><button data-lang="th" aria-pressed="${lang === "th"}" class="${lang === "th" ? "active" : ""}">ไทย</button><button data-lang="en" aria-pressed="${lang === "en"}" class="${lang === "en" ? "active" : ""}">EN</button></div>
      <button class="btn outline" data-action="text-size" aria-pressed="${largeText}">${largeText ? loc("ขนาดปกติ", "Default text") : loc("ขยายตัวอักษร", "Larger text")}</button>
      ${me.staff?.role === "owner" || (manager && me.staff) ? navItem(manager ? "/staff" : "/manager", manager ? loc("ไปหน้าสตาฟ", "Open staff workspace") : loc("ไปหน้าผู้บริหาร", "Open manager workspace"), manager ? "users" : "chart") : ""}
      ${me.staff ? `<button class="btn outline" data-action="staff-logout">${t("logout")}</button>` : ""}</div>
    </header><main id="main-work" tabindex="-1" class="work-content">${content}</main>
  </div>`;
}
function workNotice(message, retry = false) {
  return `<section class="card work-notice" role="${retry ? "alert" : "status"}"><p>${message}</p>
    ${retry ? `<button class="btn primary" data-action="work-retry">${loc("ลองอีกครั้ง", "Try again")}</button>` : ""}</section>`;
}
function managerOverview() {
  if (!managerData) return workNotice(t("wait"));
  const { date, branches, tasks, reschedules } = managerData;
  return `<section class="work-summary"><div class="care-heading"><h2>${loc("ภาพรวมสองสาขา", "Branch overview")}</h2>
    <label class="care-field"><span>${loc("วันที่ดูคิว", "Appointment date")}</span><input type="date" class="input" id="staffDate" value="${esc(date)}"></label></div>
    <div class="manager-branches">${branches
      .filter((b) => b.branch_id || b.visits)
      .map(
        (
          b,
        ) => `<article class="card branch-summary"><h3>${b.branch_id ? esc(care.branchName(b.branch_id)) : loc("ยังไม่ระบุสาขา", "Branch not assigned")}</h3>
      <strong class="large-number">${b.visits}</strong><span>${loc("นัดในวันที่เลือก", "Appointments on this date")}</span>
      <p>${loc("รอกดยืนยัน", "Awaiting confirmation")} <strong>${b.pending}</strong></p></article>`,
      )
      .join("")}</div>
    <div class="manager-branches"><article class="card"><h3>${loc("งานที่ยังไม่เสร็จ", "Open tasks")}</h3><strong class="large-number">${tasks}</strong><a class="btn outline" href="/staff?tab=tasks" data-nav="/staff?tab=tasks">${loc("ดูงานที่ต้องทำ", "View tasks")}</a></article>
    <article class="card"><h3>${loc("คำขอเลื่อนนัด", "Reschedule requests")}</h3><strong class="large-number">${reschedules}</strong><a class="btn outline" href="/staff#desk-requests" data-nav="/staff#desk-requests">${loc("ไปหน้าคิว", "Open appointments")}</a></article></div>
  </section>`;
}
function workTabs(user) {
  if (page === "/manager")
    return [
      ["overview", loc("ภาพรวม", "Overview")],
      ["settings", loc("ตั้งค่าคิวและสาขา", "Appointments and branches")],
      ["people", loc("บัญชีและสิทธิ์", "Accounts and access")],
      ["inventory", t("inventory")],
    ];
  return [
    [
      "overview",
      user.role === "store"
        ? t("dashboard")
        : loc("คิวและเช็กอิน", "Queue and check-in"),
    ],
    ...(user.clinical_access && user.role !== "store"
      ? [
          ["med-stock", loc("สต็อกยา", "Medication stock")],
          ["refills", loc("คำขอชุดยาเดิม", "Medication requests")],
        ]
      : []),
    ["tasks", t("tasks")],
    ["orders", t("staffOrders")],
  ].filter(
    ([key]) =>
      user.role === "owner" ||
      (user.role === "store"
        ? ["overview", "orders", "tasks"].includes(key)
        : key !== "orders"),
  );
}
const metric = (icoName, value, label) =>
  `<div class="metric"><span class="metric-icon">${ico(icoName)}</span><div class="metric-value">${value}</div><div class="metric-label">${label}</div></div>`;
function staff() {
  if (workError)
    return workNotice(
      loc(
        "โหลดข้อมูลไม่ได้ กรุณาลองอีกครั้ง",
        "Could not load information. Please try again.",
      ),
      true,
    );
  if (!me.staff)
    return workSession === "checking" ? workNotice(t("wait")) : staffLogin();
  if (page === "/manager" && (me.staff.role !== "owner" || workAccessDenied))
    return workNotice(
      loc("หน้านี้สำหรับบัญชีผู้บริหาร", "This page is for manager accounts."),
    );
  const user = me.staff;
  const tabs = workTabs(user);
  const tabNav = `<nav class="work-tabs" aria-label="${loc("เมนูงาน", "Workspace menu")}">${tabs.map(([key, label]) => `<button class="btn ${adminTab === key ? "primary" : "outline"}" aria-pressed="${adminTab === key}" data-tab="${key}">${label}</button>`).join("")}</nav>`;
  const role = {
    owner: loc("ผู้บริหาร", "Manager"),
    reception: loc("หน้าคลินิก", "Reception"),
    store: loc("ร้านค้า", "Store"),
  }[user.role];
  const header = `<p class="work-user">${esc(user.name)} · ${role}</p>${tabNav}`;
  if (page === "/manager" && adminTab === "overview")
    return header + managerOverview();
  if (page === "/manager" && adminTab === "people")
    return header + care.staffPermissions();
  if (!staffData) return header + workNotice(t("wait"));
  const {
    metrics,
    orders: orows,
    tasks,
    slots: slotData,
    products: prd,
  } = staffData;
  const owner = user.role === "owner",
    store = user.role === "store";
  let content = "";
  if (adminTab === "overview" && !store) content = care.staffOverview(user);
  if (adminTab === "med-stock" && user.clinical_access)
    content = care.staffStock();
  if (adminTab === "refills" && user.clinical_access)
    content = care.staffRefills();
  if (adminTab === "overview" && store)
    content = `<div class="metric-grid">${metric("calendar", metrics.bookings_today, t("bookingsToday"))}${metric("clock", metrics.remaining_today, t("remaining"))}${metric("wallet", fmtTHB(metrics.order_sales), t("sales"))}${metric("bell", metrics.pending_tasks, t("newTasks"))}</div><div class="two-col"><div class="card"><h3>${t("tasks")}</h3>${
      tasks
        .slice(0, 6)
        .map((x) => taskRow(x))
        .join("") || `<div class="empty">${t("noTasks")}</div>`
    }</div><div class="side-summary"><h3>${loc("LINE ของฉัน", "My LINE")}</h3>${care.staffLine(user)}<div class="divider"></div><h3>${t("slotSetting")}</h3>${slotData.map((s) => `<div class="day-row"><span>${s.start}–${s.end}</span><strong>${s.used}/${s.capacity}</strong></div><div class="bar"><span style="width:${s.capacity ? Math.min(100, (s.used / s.capacity) * 100) : 0}%"></span></div>`).join("")}</div></div>`;
  if (adminTab === "tasks")
    content = `<div class="card"><h3>${t("tasks")}</h3>${tasks.map((x) => taskRow(x)).join("") || `<div class="empty">${t("noTasks")}</div>`}</div>`;
  if (adminTab === "orders")
    content = `<div class="card"><h3>${t("staffOrders")}</h3><div class="table-wrap"><table><thead><tr><th>${t("orderRef")}</th><th>${t("total")}</th><th>${t("status")}</th><th>${t("actions")}</th></tr></thead><tbody>${orows.map((o) => `<tr><td><strong>${esc(o.order_ref)}</strong><br><span class="tiny-muted">${esc(o.delivery_method)}</span></td><td>${fmtTHB(o.amount)}<br><span class="tiny-muted">${o.payment_status === "verified" ? t("paid") : t("unpaid")}</span></td><td>${statusTag(o.status)}</td><td>${orderActions(o, owner)}</td></tr>`).join("") || `<tr><td colspan="4">${t("nothingOrdered")}</td></tr>`}</tbody></table></div></div>`;
  if (adminTab === "inventory")
    content = `<div class="card"><h3>${t("inventory")}</h3><div class="table-wrap"><table><thead><tr><th>SKU</th><th>${t("product")}</th><th>${t("stock")}</th><th>${t("total")}</th></tr></thead><tbody>${prd.map((p) => `<tr><td>${esc(p.sku)}</td><td>${esc(pName(p))}</td><td><span class="tag ${p.stock < 5 ? "warn" : ""}">${p.stock}</span></td><td>${fmtTHB(p.price)}</td></tr>`).join("")}</tbody></table></div><div class="divider"></div><h3>${t("restock")}</h3><form data-form="restock" class="stock-form"><div class="field"><label>${t("product")}</label><select class="select" name="product_id">${prd.map((p) => `<option value="${p.id}">${esc(pName(p))}</option>`).join("")}</select></div><div class="field"><label>${t("lot")}</label><input class="input" name="lot_no" required placeholder="LOT-001"></div><div class="field"><label>${t("quantity")}</label><input class="input" name="qty" type="number" min="1" max="100000" value="10" required></div><div class="field"><label>${t("expiry")}</label><input class="input" name="expiry_date" type="date" min="${today()}" value="${later(365)}" required></div><button class="btn primary">${t("addStock")}</button></form><div class="divider"></div><h3>${t("addProduct")}</h3><form data-form="product-create" class="stock-form"><div class="field"><label>SKU</label><input class="input" name="sku" required maxlength="32"></div><div class="field"><label>ชื่อภาษาไทย</label><input class="input" name="title_th" required></div><div class="field"><label>English name</label><input class="input" name="title_en" required></div><div class="field"><label>ราคา (฿)</label><input class="input" type="number" name="price" min="0" required></div><button class="btn primary">${t("addProduct")}</button></form></div>`;
  if (adminTab === "settings")
    content = `<div class="config-grid"><div class="card"><h3>${t("slotSetting")}</h3><p class="muted">${t("capacity")}</p><form data-form="slots">${slotData.map((s) => `<div class="field"><label>${s.start}–${s.end} (${esc(sLabel(s))})</label><input class="input" name="capacity_${esc(s.key)}" type="number" min="0" max="500" value="${s.capacity}" required></div>`).join("")}<button class="btn primary">${t("saveSettings")}</button></form></div><div class="card"><h3>${t("mode")}</h3><form data-form="mode"><div class="field"><select class="select" name="mode"><option value="auto" ${staffData.booking_mode === "auto" ? "selected" : ""}>${t("auto")}</option><option value="manual" ${staffData.booking_mode === "manual" ? "selected" : ""}>${t("manual")}</option></select></div><button class="btn primary">${t("saveSettings")}</button></form><div class="divider"></div><h3>${t("dateOverride")}</h3><form data-form="override">${care.branchSelect("branch_id", "", "", false, true)}<div class="field"><label>${t("date")}</label><input class="input" type="date" name="date" min="${today()}" value="${staffData.date}" required></div><div class="field"><label>${t("slot")}</label><select class="select" name="key">${slotData.map((s) => `<option value="${esc(s.key)}">${s.start}–${s.end}</option>`).join("")}</select></div><div class="field"><label>${t("capacity")}</label><input class="input" type="number" name="capacity" value="6" min="0" max="500" required></div><button class="btn outline">${t("saveSettings")}</button></form></div></div>`;
  if (adminTab === "settings" && owner) {
    content += care.locationSettings();
    content += `<div class="card" style="margin-top:17px"><h3>LINE Staff Group / กลุ่มแจ้งเตือนพนักงาน</h3><p class="muted">Invite the existing LINE OA to the staff group, enable webhooks and choose a verified group seen by the webhook. Do not use a patient group.</p><form data-form="line-group"><div class="field"><select class="select" name="group_id" required><option value="">${t("chooseSlot")}</option>${lineGroups.groups.map((g) => `<option value="${esc(g.group_id)}" ${g.group_id === lineGroups.active ? "selected" : ""}>${esc(g.group_id.slice(0, 16))}…</option>`).join("")}</select></div><button class="btn primary" ${lineGroups.groups.length < 1 ? "disabled" : ""}>${t("saveSettings")}</button></form></div>`;
  }
  return header + content;
}
function taskRow(x) {
  return `<div class="day-row"><div><strong style="display:block;font-size:12px">${esc(x.title)}</strong><span class="tiny-muted">${esc(x.kind)} · ${new Date(x.created_at).toLocaleString(lang === "th" ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })}</span>${x.acknowledged_by?.length ? `<div class="tiny-muted" style="color:#287a65">${ico("check")} ${esc(x.acknowledged_by.map((a) => a.display_name + " · " + new Date(a.acknowledged_at).toLocaleString(lang === "th" ? "th-TH" : "en-US", { timeZone: "Asia/Bangkok" })).join(" | "))}</div>` : ""}</div>${x.my_ack ? `<span class="tag">${ico("check")} ${t("ackDone")}</span>` : `<button class="btn soft small-btn" data-ack="${x.id}">${t("ack")}</button>`}</div>`;
}
function bookingActions(b) {
  const map = {
    pending: [
      ["confirmed", t("approved")],
      ["cancelled", t("cancel")],
    ],
    confirmed: [
      ["checked_in", t("checkedIn")],
      ["no_show", t("noShow")],
      ["cancelled", t("cancel")],
    ],
    checked_in: [["completed", t("completed")]],
  };
  const assign =
    !b.branch_id &&
    b.date >= today() &&
    ["pending", "confirmed", "checked_in"].includes(b.status)
      ? `<button class="btn outline small-btn" data-care="assign-branch" data-value="${b.id}">${ico("location")}${loc("กำหนดสาขา", "Assign branch")}</button>`
      : "";
  return `<div class="btn-group">${
    (map[b.status] || [])
      .map(([status, label]) =>
        status === "checked_in"
          ? `<button class="btn soft small-btn" data-care="scanner">${ico("scan")} ${label}</button>`
          : `<button class="btn outline small-btn" data-book-status="${b.id}:${status}">${label}</button>`,
      )
      .join("") || ""
  }${assign}</div>`;
}
function orderActions(o, owner) {
  const map = {
    awaiting_payment: [["cancelled", t("cancel")]],
    confirmed: [
      ["packing", t("packing")],
      ["cancelled", t("cancel")],
    ],
    packing: [
      ["shipped", t("shipped")],
      ["cancelled", t("cancel")],
    ],
    shipped: [["delivered", t("delivered")]],
  };
  return `<div class="btn-group"><button class="btn outline small-btn" data-fulfillment="${o.id}">${t("details")}</button>${o.status === "awaiting_payment" && owner ? `<button class="btn soft small-btn" data-payment="${o.id}">${t("markPaid")}</button>` : ""}${(map[o.status] || []).map(([status, label]) => `<button class="btn outline small-btn" data-order-status="${o.id}:${status}">${label}</button>`).join("")}</div>`;
}
function render() {
  document.documentElement.lang = lang;
  document.documentElement.classList.toggle("large-text", largeText);
  document.title =
    page === "/manager"
      ? loc("ระบบผู้บริหาร · Suwat Clinic", "Manager · Suwat Clinic")
      : page === "/staff"
        ? loc("ระบบสตาฟ · Suwat Clinic", "Staff · Suwat Clinic")
        : "Suwat Clinic";
  if (lineChecking && new URLSearchParams(location.search).has("liff.state")) {
    $root.innerHTML = `<div class="loading-screen"><p class="member-login-status line-startup" role="status">${loc("กำลังเชื่อมบัญชี LINE กรุณารอสักครู่", "Connecting to LINE. Please wait.")}</p></div>`;
    return;
  }
  $root.innerHTML = shell(
    page === "/"
      ? care.home()
      : page === "/booking"
        ? care.bookingPage()
        : page === "/shop"
          ? shop()
          : page === "/appointments"
            ? care.appointmentsPage()
            : page === "/orders"
              ? orderList()
              : page === "/account"
                ? account()
                : isWorkPage(page)
                  ? staff()
                  : page === "/medications"
                    ? care.medicationsPage()
                    : care.home(),
  );
}
async function refreshForPage() {
  const current = page;
  if (isWorkPage(current)) return refreshWork(current);
  try {
    const work = [care.refresh(current, staffData?.date || today())];
    if (current === "/orders" && me.customer)
      work.push(
        request("/api/orders").then((r) => {
          orders = r.orders;
        }),
      );
    await Promise.all(work);
  } catch (e) {
    showToast(care.errorText(e));
  }
  if (page === current) {
    render();
    if (current === "/appointments")
      void care.followLink().catch(care.showError);
    if (current === "/medications")
      void care.followRefillLink().catch(care.showError);
  }
}

async function refreshWork(current) {
  const version = ++workRev;
  workError = false;
  workAccessDenied = false;
  try {
    if (!me.staff && workSession !== "signed-out") {
      const { staff: account } = await request("/api/staff/session");
      if (version !== workRev || page !== current) return;
      me.staff = account;
      workSession = account ? "signed-in" : "signed-out";
    }
    if (!me.staff || (current === "/manager" && me.staff.role !== "owner"))
      return;
    if (!workTabs(me.staff).some(([key]) => key === adminTab))
      adminTab = "overview";
    const date = selectedWorkDate();
    if (current === "/manager" && adminTab === "overview") {
      const [overview] = await Promise.all([
        request("/api/manager/overview?date=" + encodeURIComponent(date)),
        care.refresh(current, date),
      ]);
      if (version === workRev && page === current) managerData = overview;
      return;
    }
    if (current === "/manager" && adminTab === "people") {
      await care.loadPermissions();
      return;
    }
    const [overview, groups] = await Promise.all([
      request("/api/staff/overview?date=" + encodeURIComponent(date)),
      current === "/manager" && adminTab === "settings"
        ? request("/api/staff/line-groups")
        : null,
      care.refresh(current, date),
    ]);
    if (version !== workRev || page !== current) return;
    staffData = overview;
    me.staff = overview.staff;
    if (groups) lineGroups = groups;
  } catch (error) {
    if (version === workRev && page === current) {
      workAccessDenied = current === "/manager" && error.status === 403;
      workError = !workAccessDenied && error.status !== 401;
    }
  } finally {
    if (version === workRev && page === current) {
      render();
      if (location.hash === "#desk-requests")
        document.getElementById("desk-requests")?.scrollIntoView();
    }
  }
}

let lineReady;
async function getLiff() {
  if (!config.liffId || config.lineReady === false)
    throw lineSignInError("LINE_NOT_CONFIGURED");
  lineReady ||= (async () => {
    if (!window.liff)
      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
        const timer = setTimeout(() => {
          script.remove();
          reject(lineSignInError("LINE_SDK_UNAVAILABLE"));
        }, 8000);
        script.onload = () => {
          clearTimeout(timer);
          resolve();
        };
        script.onerror = () => {
          clearTimeout(timer);
          script.remove();
          reject(lineSignInError("LINE_SDK_UNAVAILABLE"));
        };
        document.head.append(script);
      });
    let timer;
    try {
      await Promise.race([
        window.liff.init({ liffId: config.liffId }),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(lineSignInError("LINE_SDK_UNAVAILABLE")),
            12000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    lineInClient = window.liff.isInClient();
    return window.liff;
  })().catch((e) => {
    lineReady = null;
    throw e;
  });
  return lineReady;
}

function resolveLineSignIn(interactive = false) {
  if (lineAuthentication) return lineAuthentication;
  if (me.customer) return Promise.resolve(true);
  const initialUrl = location.href;
  const returningFromLogin =
    !interactive && isReturningFromLine(initialUrl, sessionStorage);
  lineChecking = true;
  lineError = null;
  render();
  lineAuthentication = (async () => {
    let liff;
    try {
      liff = await getLiff();
      if (location.href !== initialUrl) page = pageFromLocation();
      const customer = await authenticateLineCustomer({
        liff,
        storage: sessionStorage,
        redirectUri: lineEntryUrl(location.href, page.slice(1)),
        verify: verifyLineCustomer,
        interactive,
        returningFromLogin,
      });
      if (customer) me.customer = customer;
      return Boolean(customer);
    } catch (error) {
      lineError =
        typeof error?.code === "string" && error.code.startsWith("LINE_")
          ? error
          : lineSignInError(
              liff ? "LINE_CLINIC_UNAVAILABLE" : "LINE_SDK_UNAVAILABLE",
            );
      return false;
    } finally {
      if (returningFromLogin) {
        sessionStorage.removeItem(lineLoginPendingKey);
        const callback = new URL(location.href);
        if (liff && callback.searchParams.has(lineReturnParam)) {
          callback.searchParams.delete(lineReturnParam);
          history.replaceState(history.state, "", callback.href);
        }
      }
    }
  })().finally(() => {
    lineChecking = false;
    lineAuthentication = null;
    if (interactive || me.customer) render();
  });
  return lineAuthentication;
}

async function lineLogin() {
  const signedIn = await sending(
    () => resolveLineSignIn(true),
    loc("กำลังเข้าสู่ระบบ LINE…", "Signing in with LINE…"),
  );
  if (signedIn) await refreshForPage();
  else if (lineError) {
    const notice = document.querySelector(".member-login-error");
    if (notice) notice.focus();
    else
      care.showError(
        lineError,
        loc("เข้าสู่ระบบ LINE ไม่สำเร็จ", "LINE sign-in failed"),
      );
  }
}

async function verifyLineCustomer(idToken) {
  const { customer } = await post("/api/auth/line", { idToken, lang });
  const session = (await request("/api/me/customer")).customer;
  if (!customer?.id || session?.id !== customer.id)
    throw lineSignInError("LINE_SESSION_NOT_SAVED");
  return session;
}

async function linkStaffLine() {
  if (!config.liffId) config = await request("/api/config");
  const liff = await getLiff();
  if (!liff.isLoggedIn() && !liff.isInClient()) {
    liff.login({
      redirectUri: new URL("/staff?link_line=1", location.origin).href,
    });
    return;
  }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error("LINE_TOKEN_MISSING");
  if (
    !(await care.confirmAction(
      loc(
        "ผูก LINE ที่กำลังเปิดอยู่กับบัญชีสตาฟนี้",
        "Link this LINE account to your staff profile",
      ),
    ))
  )
    return;
  await sending(() => post("/api/staff/clinic/line", { idToken }));
  await refreshForPage();
  showToast(loc("ผูก LINE สำเร็จ", "LINE linked"));
}
async function ensureLogin() {
  if (me.customer) return true;
  if (config.demo) {
    showToast(t("signInFirst"));
    q("/account");
    return false;
  }
  if (config.liffId) {
    await lineLogin();
    return !!me.customer;
  }
  showToast(t("notConfigured"));
  return false;
}
async function handleAction(el) {
  const action = el.dataset.action;
  if (action === "text-size") {
    const controls = [...$root.querySelectorAll("[data-action=text-size]")];
    const controlIndex = controls.indexOf(el);
    largeText = !largeText;
    localStorage.setItem("sc_large_text", largeText ? "1" : "0");
    render();
    $root.querySelectorAll("[data-action=text-size]")[controlIndex]?.focus();
    return;
  }
  if (action === "work-retry") {
    if (!me.staff) workSession = "checking";
    await refreshForPage();
    return;
  }
  if (action === "cart") {
    cartOpen = true;
    render();
    return;
  }
  if (action === "cart-close") {
    cartOpen = false;
    render();
    return;
  }
  if (action === "demo-login") {
    try {
      const r = await post("/api/auth/demo", { name: "Demo Customer" });
      me.customer = r.customer;
      showToast(t("success"));
      refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (action === "line-login") {
    await lineLogin();
    return;
  }
  if (action === "logout") {
    await sending(() => post("/api/auth/logout"));
    sessionStorage.setItem(lineSignedOutKey, "true");
    sessionStorage.removeItem(lineLoginPendingKey);
    const waitForLine = lineReady && lineInClient === null;
    lineChecking = Boolean(waitForLine);
    void lineReady
      ?.then((liff) => {
        if (sessionStorage.getItem(lineSignedOutKey))
          clearExternalLineSession(liff);
      })
      .catch(() => {})
      .finally(() => {
        if (waitForLine) {
          lineChecking = false;
          render();
        }
      });
    lineError = null;
    care.reset();
    me.customer = null;
    orders = [];
    render();
    return;
  }
  if (action === "staff-logout") {
    await sending(() => post("/api/staff/logout"));
    clearWorkSession();
    return;
  }
}
async function submit(form) {
  const type = form.dataset.form,
    d = Object.fromEntries(new FormData(form).entries());
  try {
    if (type === "profile") {
      const r = await post("/api/me/profile", {
        display_name: d.name,
        preferred_lang: d.language,
      });
      me.customer = r.customer;
      lang = d.language;
      localStorage.setItem("sc_lang", lang);
      showToast(t("success"));
      render();
    }
    if (type === "phone-save") {
      const r = await post("/api/me/phone", { phone: d.phone.trim() });
      me.customer = r.customer;
      showToast(t("phoneSaved"));
      render();
    }
    if (type === "checkout") {
      if (!(await ensureLogin())) {
        cartOpen = false;
        render();
        return;
      }
      if (!me.customer.phone && !config.demo) {
        cartOpen = false;
        q("/account");
        showToast(t("phoneMissing"));
        return;
      }
      const items = Object.entries(cart)
        .filter(([, qty]) => qty > 0)
        .map(([id, qty]) => ({ id: Number(id), qty }));
      if (!items.length) throw new Error(t("emptyCart"));
      loading = true;
      const r = await post("/api/orders", {
        items,
        delivery_method: d.delivery,
        shipping_address: d.address,
        request_id: crypto.randomUUID(),
      });
      orderResult = r.order;
      cart = {};
      localStorage.removeItem("sc_cart");
      cartOpen = false;
      showToast(t("orderCreated"));
      render();
    }
    if (type === "staff-login") {
      loginError = "";
      try {
        await post("/api/staff/login", {
          username: d.username,
          password: d.password,
        });
        workSession = "checking";
        sessionExpired = false;
        await refreshForPage();
        if (!me.staff && !workError) {
          loginError = loc(
            "เบราว์เซอร์บันทึกการเข้าสู่ระบบไม่ได้ ลองเปิดเว็บในเบราว์เซอร์หลัก",
            "Your browser could not save the session. Try your main browser.",
          );
          render();
        }
      } catch (error) {
        loginError =
          error.status === 403
            ? loc("บัญชีนี้ไม่มีสิทธิ์หลังบ้าน", "This account has no staff access.")
            : error.status === 400 || error.status === 401
              ? loc(
                  "ตรวจอีเมลและรหัสผ่านแล้วลองอีกครั้ง",
                  "Check your email and password.",
                )
              : loc("เชื่อมต่อไม่ได้ กรุณาลองอีกครั้ง", "Could not connect. Try again.");
        render();
      }
    }
    if (type === "slots") {
      const data = staffData.slots.map((s) => ({
        key: s.key,
        capacity: Number(d["capacity_" + s.key]),
      }));
      await post("/api/staff/slots", { slots: data });
      showToast(t("success"));
      await refreshForPage();
    }
    if (type === "mode") {
      await post("/api/staff/booking-mode", { mode: d.mode });
      showToast(t("success"));
      await refreshForPage();
    }
    if (type === "override") {
      await post("/api/staff/override", {
        date: d.date,
        key: d.key,
        capacity: Number(d.capacity),
        closed: Number(d.capacity) === 0,
        branch_id: d.branch_id,
      });
      showToast(t("success"));
      staffData.date = d.date;
      await refreshForPage();
    }
    if (type === "line-group") {
      await post("/api/staff/line-group", { group_id: d.group_id });
      showToast(t("success"));
      lineGroups = await request("/api/staff/line-groups");
      render();
    }
    if (type === "product-create") {
      await post("/api/staff/products", {
        sku: d.sku,
        title_th: d.title_th,
        title_en: d.title_en,
        price: Number(d.price),
      });
      showToast(t("success"));
      allProducts = (await request("/api/products")).products;
      await refreshForPage();
    }
    if (type === "restock") {
      await post("/api/staff/restock", {
        product_id: Number(d.product_id),
        lot_no: d.lot_no,
        qty: Number(d.qty),
        expiry_date: d.expiry_date,
      });
      showToast(t("success"));
      allProducts = (await request("/api/products")).products;
      await refreshForPage();
    }
  } catch (e) {
    showToast(care.errorText(e));
  } finally {
    loading = false;
  }
}
$root.addEventListener("click", async (e) => {
  const el = e.target.closest("button,[data-nav],a[data-line-open]");
  if (!el || el.dataset.care || busy) return;
  if (el.hasAttribute("data-line-open")) {
    rememberLineLogin(sessionStorage);
    return;
  }
  if (el.dataset.nav) {
    e.preventDefault();
    q(el.dataset.nav);
    return;
  }
  if (el.dataset.lang) {
    lang = el.dataset.lang;
    localStorage.setItem("sc_lang", lang);
    if (!isWorkPage(page) && me.customer) {
      post("/api/me/language", { lang }).catch(console.warn);
    }
    render();
    return;
  }
  if (el.dataset.tab) {
    if (
      !isWorkPage(page) ||
      !me.staff ||
      !workTabs(me.staff).some(([key]) => key === el.dataset.tab)
    )
      return;
    adminTab = el.dataset.tab;
    updateWorkFilter("tab", adminTab);
    workError = false;
    render();
    await refreshForPage();
    return;
  }
  if (el.dataset.add) {
    const p = allProducts.find((x) => x.id === Number(el.dataset.add));
    if (!p) return;
    if ((cart[p.id] || 0) >= p.stock) {
      showToast(t("outOfStock"));
      return;
    }
    cart[p.id] = (cart[p.id] || 0) + 1;
    saveCart();
    showToast(t("add"));
    return;
  }
  if (el.dataset.qty) {
    const [id, delta] = el.dataset.qty.split(":");
    const p = allProducts.find((x) => x.id === Number(id));
    cart[id] = Math.max(
      0,
      Math.min(p?.stock || 0, (cart[id] || 0) + Number(delta)),
    );
    if (!cart[id]) delete cart[id];
    saveCart();
    return;
  }
  if (el.dataset.cancelBooking) {
    if (!(await care.confirmAction(loc("ยกเลิกนัดนี้", "Cancel this appointment"))))
      return;
    try {
      await sending(() =>
        post("/api/bookings/" + el.dataset.cancelBooking + "/cancel"),
      );
      showToast(t("success"));
      await refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.ack) {
    try {
      await sending(() => post("/api/staff/tasks/" + el.dataset.ack + "/ack"));
      showToast(t("ackDone"));
      await refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.bookStatus) {
    const [id, status] = el.dataset.bookStatus.split(":");
    if (
      !(await care.confirmAction(
        loc("ยืนยันการอัปเดตสถานะ", "Confirm status update"),
      ))
    )
      return;
    try {
      await sending(() =>
        post("/api/staff/bookings/" + id + "/status", { status }),
      );
      showToast(t("success"));
      await refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.fulfillment) {
    try {
      const r = await request(
        "/api/staff/orders/" + el.dataset.fulfillment + "/fulfillment",
      );
      alert(
        r.order.order_ref +
          "\n" +
          (r.order.delivery_method === "shipping"
            ? r.order.shipping_address
            : t("clinicPickup")),
      );
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.payment) {
    if (!(await care.confirmAction(t("markPaid")))) return;
    try {
      await sending(() =>
        post("/api/staff/orders/" + el.dataset.payment + "/verify-payment"),
      );
      showToast(t("success"));
      await refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.orderStatus) {
    const [id, status] = el.dataset.orderStatus.split(":");
    let data = { status };
    if (status === "shipped") {
      const carrier = prompt(t("shipProvider"));
      if (!carrier) return;
      const tracking_no = prompt(t("trackingNumber"));
      if (!tracking_no) return;
      data = { status, carrier, tracking_no };
    }
    if (
      !(await care.confirmAction(
        loc("ยืนยันการอัปเดตสถานะ", "Confirm status update"),
      ))
    )
      return;
    try {
      await sending(() => post("/api/staff/orders/" + id + "/status", data));
      showToast(t("success"));
      await refreshForPage();
    } catch (e) {
      showToast(care.errorText(e));
    }
    return;
  }
  if (el.dataset.action) {
    try {
      await handleAction(el);
    } catch (e) {
      care.showError(e);
    }
    return;
  }
});
$root.addEventListener("change", async (e) => {
  if (e.target.id === "staffDate") {
    if (!e.target.value) return;
    updateWorkFilter("date", e.target.value);
    await refreshForPage();
  }
});
$root.addEventListener("submit", async (e) => {
  const form = e.target.closest("form[data-form]");
  if (form) {
    e.preventDefault();
    if (!busy) {
      if (form.dataset.form === "checkout" && !me.customer) await submit(form);
      else await sending(() => submit(form));
    }
  }
});
window.addEventListener("popstate", () => {
  care.closeModal(false);
  page = pageFromLocation();
  adminTab = new URLSearchParams(location.search).get("tab") || "overview";
  refreshForPage();
});
const care = createCareUI({
  root: $root,
  t,
  loc,
  ico,
  esc,
  today,
  later,
  displayDate,
  request,
  post,
  state: () => ({ ...me, config, page, busy, largeText }),
  setCustomer: (value) => {
    me.customer = value;
  },
  setWorkFilter: updateWorkFilter,
  render,
  navigate: q,
  sending,
  toast: showToast,
  statusTag,
  sectionHeader,
  loginPrompt,
  staffActions: bookingActions,
  linkStaffLine,
  refreshApp: refreshForPage,
});

(async function boot() {
  if (isWorkPage(page)) {
    render();
    await refreshForPage();
    if (
      page === "/staff" &&
      me.staff &&
      new URLSearchParams(location.search).get("link_line") === "1"
    ) {
      try {
        config = await request("/api/config");
        await getLiff();
        updateWorkFilter("link_line", "");
        await linkStaffLine();
      } catch (error) {
        care.showError(error);
      }
    }
    return;
  }
  const results = await Promise.allSettled([
    request("/api/config"),
    request("/api/products"),
    request("/api/me/customer"),
  ]);
  if (results[0].status === "fulfilled") config = results[0].value;
  if (results[1].status === "fulfilled")
    allProducts = results[1].value.products;
  if (results[2].status === "fulfilled")
    me.customer = results[2].value.customer;
  if (config.liffId && !me.customer) {
    await resolveLineSignIn();
  } else {
    render();
    if (config.liffId && me.customer) void getLiff().catch(() => {});
  }
  await refreshForPage();
})();

window.addEventListener("pageshow", (event) => {
  if (event.persisted && isWorkPage(page)) {
    me.staff = null;
    staffData = managerData = null;
    workSession = "checking";
    workError = false;
    care.resetWork();
    render();
    void refreshForPage();
    return;
  }
  if (
    event.persisted &&
    config.liffId &&
    !isWorkPage(page) &&
    !me.customer &&
    isReturningFromLine(location.href, sessionStorage)
  ) {
    lineReady = null;
    void resolveLineSignIn().then(refreshForPage);
  }
});
