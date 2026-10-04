// Stored lease dates are date-only values encoded at UTC midnight. Only "today"
// is resolved in the business timezone; never shift a stored date through it.
const timeZone = process.env.BUSINESS_TIMEZONE || 'Asia/Kabul';
function dateKey(value) { return new Date(value).toISOString().slice(0, 10); }
function businessToday(now = new Date(), zone = timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = type => parts.find(p => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
function previousCalendarMonth(value) {
  const [year, month, day] = dateKey(value).split('-').map(Number);
  const last = new Date(Date.UTC(year, month - 1, 0));
  return dateKey(new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), Math.min(day, last.getUTCDate()))));
}
function reminderFor(lease, today = businessToday()) {
  const expiry = dateKey(lease.endDate);
  if (lease.status !== 'ACTIVE' || lease.deletedAt || today > expiry || today < previousCalendarMonth(lease.endDate)) return null;
  return { ...lease, notificationId: `lease:${lease.id}:${expiry}`, daysLeft: Math.round((Date.parse(expiry) - Date.parse(today)) / 86400000) };
}
module.exports = { timeZone, dateKey, businessToday, previousCalendarMonth, reminderFor };
