const prisma = require('../lib/prisma');

async function hasPermission(user, code) {
  const roleId = user?.organizations?.[0]?.role?.id;
  if (!roleId) return false;
  return Boolean(await prisma.rolePermission.findFirst({ where: {
    roleId, deletedAt: null, role: { deletedAt: null }, permission: { code, deletedAt: null },
  } }));
}
function requirePermission(code) {
  return async (req, res, next) => {
    try {
      if (!await hasPermission(req.user, code)) return res.status(403).json({ success: false, code: 'FORBIDDEN', message: 'Permission required.' });
      next();
    } catch (error) { next(error); }
  };
}
module.exports = { hasPermission, requirePermission };
