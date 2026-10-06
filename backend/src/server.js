const app = require('./app');
const { startInvoiceScheduler } = require('./modules/invoice/invoice-generation.service');

const PORT = Number(process.env.PORT || 3001);

app.listen(PORT, () => {
  console.log(`Apartment Management API listening on port ${PORT}`);
});

// Raise the rent-cycle invoices that come due while the API is up. The pass is
// also idempotent and catches up, so nothing is lost across a restart.
startInvoiceScheduler();
