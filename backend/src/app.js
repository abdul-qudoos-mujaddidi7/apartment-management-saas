require('dotenv').config();

const cors = require('cors');
const cookieParser = require('cookie-parser');
const express = require('express');
const helmet = require('helmet');

const apartmentRoutes = require('./modules/apartments/apartment.routes');
const apartmentAssetRoutes = require('./modules/apartment-assets/apartment-asset.apartment.routes');
const apartmentAssetRecordRoutes = require('./modules/apartment-assets/apartment-asset.routes');
const assetRoutes = require('./modules/assets/asset.routes');
const assetCategoryRoutes = require('./modules/asset-categories/asset-category.routes');
const dashboardRoutes = require('./modules/dashboard/dashboard.routes');
const authRoutes = require('./modules/auth/auth.routes');
const buildingRoutes = require('./modules/building/building.routes');
const currencyRoutes = require('./modules/currency/currency.routes');
const floorRoutes = require('./modules/floors/floor.routes');
const tenantRoutes = require('./modules/tenants/tenant.routes');
const leaseRoutes = require('./modules/leases/lease.routes');
const securityDepositRoutes = require('./modules/security-deposits/security-deposit.routes');
const meterRoutes = require('./modules/meters/meter.routes');
const meterReadingRoutes = require('./modules/meter-readings/meter-reading.routes');
const invoiceRoutes = require('./modules/invoice/invoice.routes');
const paymentRoutes = require('./modules/payments/payment.routes');
const financialAccountRoutes = require('./modules/financials/financial-account.routes');
const accountRoutes = require('./modules/financials/account.routes');
const journalRoutes = require('./modules/financials/journal.routes');
const tenantAccountRoutes = require('./modules/tenant-accounts/tenant-account.routes');
const searchRoutes = require('./modules/search/search.routes');
const uploadRoutes = require('./modules/uploads/upload.routes');

const { UPLOAD_ROOT, ensureUploadRoot } = require('./lib/uploads');

const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || !process.env.CLIENT_URL)) {
  throw new Error('JWT_SECRET and CLIENT_URL must be configured in production.');
}

const developmentOrigins = process.env.NODE_ENV === 'production'
  ? []
  : ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = [process.env.CLIENT_URL, ...developmentOrigins].filter(Boolean);

function validateRequestOrigin(req, res, next) {
  const origin = req.get('origin');
  const stateChangingMethod = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);

  if (stateChangingMethod && origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      code: 'ORIGIN_NOT_ALLOWED',
      message: 'Request origin is not allowed.',
    });
  }

  return next();
}

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(validateRequestOrigin);

app.use('/api/auth', authRoutes);
app.use('/api/buildings', buildingRoutes);
app.use('/api/floors', floorRoutes);
// Apartment-scoped asset routes are mounted before the apartment router so the
// nested path never falls through to /api/apartments/:id.
app.use('/api/apartments/:apartmentId/assets', apartmentAssetRoutes);
app.use('/api/apartments', apartmentRoutes);
app.use('/api/apartment-assets', apartmentAssetRecordRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/asset-categories', assetCategoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/currencies', currencyRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/security-deposits', securityDepositRoutes);
app.use('/api/meters', meterRoutes);
app.use('/api/meter-readings', meterReadingRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/financial-accounts', financialAccountRoutes);
app.use('/api/accounts', accountRoutes);
app.use('/api/journals', journalRoutes);
app.use('/api/tenant-accounts', tenantAccountRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/uploads', uploadRoutes);

// Uploaded documents are served from the API's own origin. helmet's default
// Cross-Origin-Resource-Policy is `same-origin`, which would stop the frontend
// (on its own port) from drawing them, so it is widened for these files only.
// Names are unique and never rewritten, so they can be cached for a long time.
ensureUploadRoot();
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(UPLOAD_ROOT, { immutable: true, index: false, maxAge: '7d' }),
);

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Apartment Management API is running',
  });
});

app.use(notFound);
app.use(errorHandler);

module.exports = app;
