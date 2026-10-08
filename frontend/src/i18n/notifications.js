const copy = {
  en: { rentInvoices: 'Rent invoices created', rentCreated: 'Rent period reached · Invoice created', period: 'Rent period', empty: 'No recent rent invoices.', months: '{count} month(s)' },
  fa: { rentInvoices: 'صورت‌حساب‌های کرایه ایجادشده', rentCreated: 'موعد کرایه رسید · صورت‌حساب ایجاد شد', period: 'دورهٔ کرایه', empty: 'صورت‌حساب کرایهٔ جدیدی موجود نیست.', months: '{count} ماه' },
  ps: { rentInvoices: 'د کرایې جوړ شوي بلونه', rentCreated: 'د کرایې وخت راورسېد · بل جوړ شو', period: 'د کرایې موده', empty: 'د کرایې نوی بل نشته.', months: '{count} میاشتې' },
};
Object.assign(copy.en, { invoiceCreated: 'Invoice created', emptyNotifications: 'No notifications.' });
Object.assign(copy.fa, { invoiceCreated: 'صورت‌حساب ایجاد شد', emptyNotifications: 'اطلاعیه‌ای موجود نیست.' });
Object.assign(copy.ps, { invoiceCreated: 'بل جوړ شو', emptyNotifications: 'خبرتیا نشته.' });
export default copy;
