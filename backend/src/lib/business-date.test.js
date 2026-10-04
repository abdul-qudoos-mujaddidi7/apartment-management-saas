const test = require('node:test');
const assert = require('node:assert/strict');
const { previousCalendarMonth, businessToday, reminderFor } = require('./business-date');
test('calendar month subtraction clamps shorter months, including leap years and year rollover', () => {
  assert.equal(previousCalendarMonth('2026-03-31'), '2026-02-28');
  assert.equal(previousCalendarMonth('2024-03-31'), '2024-02-29');
  assert.equal(previousCalendarMonth('2026-05-31'), '2026-04-30');
  assert.equal(previousCalendarMonth('2027-01-31'), '2026-12-31');
});
test('today uses business timezone across UTC midnight', () => {
  assert.equal(businessToday(new Date('2026-10-02T20:00:00Z'), 'Asia/Kabul'), '2026-10-03');
  assert.equal(businessToday(new Date('2026-10-03T01:00:00Z'), 'America/New_York'), '2026-10-02');
});
test('reminders catch up, include expiry day, deduplicate by lease and end date, and follow renewal/termination', () => {
  const lease = { id: 'l1', endDate: '2026-03-31', status: 'ACTIVE' };
  assert.equal(reminderFor(lease, '2026-02-27'), null);
  assert.equal(reminderFor(lease, '2026-02-28').daysLeft, 31);
  assert.equal(reminderFor(lease, '2026-03-20').daysLeft, 11);
  assert.equal(reminderFor(lease, '2026-03-31').daysLeft, 0);
  assert.equal(reminderFor(lease, '2026-04-01'), null);
  assert.equal(reminderFor({ ...lease, status: 'TERMINATED' }, '2026-03-20'), null);
  assert.equal(reminderFor({ ...lease, deletedAt: new Date() }, '2026-03-20'), null);
  assert.equal(reminderFor(lease, '2026-03-20').notificationId, reminderFor(lease, '2026-03-21').notificationId);
  assert.notEqual(reminderFor(lease, '2026-03-20').notificationId, reminderFor({ ...lease, endDate: '2026-04-15' }, '2026-03-20').notificationId);
  assert.equal(reminderFor({ ...lease, endDate: '2027-03-31' }, '2026-03-20'), null);
});
