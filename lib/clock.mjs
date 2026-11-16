export function bangkokToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
export function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0,10) === s; }
export function dayOfWeek(s) { return new Date(s + 'T12:00:00Z').getUTCDay(); }
export function timestamp() { return new Date().toISOString(); }
export function localDateDaysFromNow(days=0) { const d = new Date(bangkokToday() + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate()+days); return d.toISOString().slice(0,10); }
