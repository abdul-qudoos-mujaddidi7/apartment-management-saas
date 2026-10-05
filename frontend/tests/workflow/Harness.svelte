<script>
  import Modal from '../../src/components/ui/Modal.svelte';
  import RowActions from '../../src/components/ui/RowActions.svelte';
  import ShamsiDatePicker from '../../src/components/ui/ShamsiDatePicker.svelte';
  import { setLanguage } from '../../src/i18n';
  import UtilityReadingTerms from '../../src/components/meters/UtilityReadingTerms.svelte';
  import { currencies } from '../../src/stores/currency';
  import DocumentPreview from '../../src/components/printing/DocumentPreview.svelte';
  import { preparePrintDocument } from '../../src/utils/printDocument';
  let printRecord = null;
  let printKind = 'invoice';
  const apartment = { apartmentNumber:'005', floor:{ floorNumber:1, building:{name:'Test residence'} } };
  const lease = { contractNumber:'0009', tenant:{firstName:'Test',lastName:'Tenant'}, apartment };
  const invoiceFixture = { invoiceNumber:'INV-005', invoiceDate:'2026-02-01', status:'PARTIALLY_PAID', lease, currency:'AFN', total:8000, paidAmount:1000, items:[{description:'Monthly rent',type:'RENT',quantity:1,unitPrice:100,amount:100,paidAmount:10,balance:90,currency:'USD'},{description:'Electricity',type:'ELECTRICITY',quantity:50,unitPrice:2.2515,amount:112.58,balance:112.58,currency:'AFN',meterReadingId:'r1'}] };
  const readingFixture = { meter:{meterNumber:'M-005',utilityType:'ELECTRICITY',unit:'kWh',apartment}, lease, currency:'AFN', readingDate:'2026-02-01',periodStart:'2026-01-01',previousReading:100,currentReading:150,consumption:50,unitPrice:2.2515,amount:112.58,paidAmount:0,outstanding:112.58,readingKind:'HANDOVER',billingStatus:'UNBILLED',notes:'<script>must stay text</' + 'script>' };
  window.prepareTestPrint = async () => {
    window.testPrintFrame?.remove();
    window.testPrintFrame = await preparePrintDocument(document.querySelector('.document-sheet'), {title:'Test print',language:document.documentElement.lang});
    return { text:window.testPrintFrame.contentDocument.body.textContent, dir:window.testPrintFrame.contentDocument.documentElement.dir, styles:window.testPrintFrame.contentDocument.querySelector('style').textContent, fonts:window.testPrintFrame.contentDocument.fonts.check('13px Vazirmatn'), chrome:!!window.testPrintFrame.contentDocument.querySelector('button,[role=dialog]') };
  };
  const paymentFixture = { paymentNumber: 'PAY-005', paymentDate: '2026-02-01', status: 'POSTED', currency: 'AFN', amount: 1500, allocatedAmount: 1200, unallocatedAmount: 300, tenant: lease.tenant, lease: { contractNumber: lease.contractNumber, apartment }, paymentMethod: 'CASH', receiveAccount: { name: 'Cash account' }, reference: 'REF-005', notes: 'Payment received', allocations: [{ id: 'allocation-1', amount: 1200, invoiceItem: { description: 'Monthly rent', type: 'RENT', currency: 'USD', invoice: { invoiceNumber: 'INV-005' } } }] };
  window.setPaymentVoid = () => { printRecord = { ...paymentFixture, status: 'VOIDED', voidReason: 'Duplicate payment', allocatedAmount: 0, unallocatedAmount: 1500 }; };
  window.setPaymentWithoutLease = () => { printRecord = { ...paymentFixture, lease: null, allocations: [], allocatedAmount: 0, unallocatedAmount: 1500 }; };
  let open = false;
  let count = 0;
  let identifier = '005';
  let date = '';
  let utilityOpen = false;
  let utilityForm = { periodStart: '', readingDate: '2026-02-01', leaseId: 'l1', currentReading: 150, unitPrice: 2.25, currency: 'AFN', readingKind: 'BILLING', resetBaseline: '', notes: '' };
  currencies.set([{ code: 'AFN', isActive: true }]);
  setLanguage('en');
  window.setTestLanguage = setLanguage;
  window.confirmCalls = 0;
  window.allowDiscard = false;
  window.confirm = () => { window.confirmCalls++; return window.allowDiscard; };
</script>
<button id="open" on:click={() => { open = true; count = 0; date = ''; }}>Open</button>
<button id="utility-open" on:click={() => utilityOpen = true}>Electricity</button>
<button id="invoice-print" on:click={() => {printKind='invoice';printRecord=invoiceFixture;}}>Invoice print</button>
<button id="reading-print" on:click={() => {printKind='reading';printRecord=readingFixture;}}>Reading print</button>
<button id="payment-print" on:click={() => {printKind='payment';printRecord=paymentFixture;}}>Payment print</button>
<DocumentPreview record={printRecord} kind={printKind} on:close={() => printRecord=null} />
<RowActions label="Actions"><button id="menu-action">Action</button></RowActions>
<Modal {open} title="Test form" on:close={() => open = false}>
  <form><label for="number">Number</label><input id="number" type="number" bind:value={count} /><label for="identifier">Identifier</label><input id="identifier" bind:value={identifier} /><ShamsiDatePicker id="date" bind:value={date} /></form>
  <div slot="footer"><button id="cancel" class="btn btn-light" on:click={() => open = false}>Cancel</button></div>
</Modal>
<Modal open={utilityOpen} title="Electricity test" on:close={() => utilityOpen = false}>
  <form><div class="row"><UtilityReadingTerms bind:form={utilityForm} expectedStart="2026-01-01" previewPrevious={100} unit="kWh" leaseOptions={[{ id: 'l1', contractNumber: '005', startDate: '2026-01-01', endDate: '2026-12-31', tenant: { firstName: 'Test', lastName: 'Tenant' } }]} /></div></form>
</Modal>

