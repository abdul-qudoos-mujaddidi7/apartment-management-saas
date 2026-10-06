const path = require('path');
const { requireAuth } = require('../modules/auth/auth.middleware');
const { requirePermission } = require('./permission');

// Run before express.static, using its decoded, normalized path semantics too.
// Encoded slashes or parent segments must not bypass document authentication.
function guarantorDocuments(req, res, next) {
  let pathname;
  try { pathname = path.posix.normalize(decodeURIComponent(req.path).replaceAll('\\', '/')); }
  catch { return res.status(400).json({ success: false, message: 'Invalid document path.' }); }
  if (!pathname.startsWith('/guarantors/')) return next();
  return requireAuth(req, res, error => {
    if (error) return next(error);
    return requirePermission('GUARANTOR_VIEW')(req, res, error => {
      if (error) return next(error);
      if (pathname.split('/')[2] !== req.user.organizationId) return res.status(404).json({ success: false, message: 'Document not found.' });
      next();
    });
  });
}
module.exports = guarantorDocuments;
