export function invoiceItemTitle(item, printing) {
  if (item?.type === 'ELECTRICITY') return printing.electricityBill;
  return `${printing.bill} - ${item?.description || printing.invoiceItem}`;
}
