require('dotenv').config();
const prisma = require('../src/lib/prisma');
async function main() {
  if (!process.argv.includes('--apply')) { console.log('Dry run: add GUARANTOR_VIEW / GUARANTOR_MANAGE to ADMIN and view to MANAGER. Use --apply to write.'); return; }
  await prisma.$transaction(async tx => {
    for (const code of ['GUARANTOR_VIEW', 'GUARANTOR_MANAGE']) {
      const permission = await tx.permission.upsert({ where: { code }, update: { deletedAt: null }, create: { code, name: code.replaceAll('_', ' ') } });
      const roles = await tx.role.findMany({ where: { name: { in: code === 'GUARANTOR_VIEW' ? ['ADMIN', 'MANAGER'] : ['ADMIN'] }, deletedAt: null } });
      for (const role of roles) await tx.rolePermission.upsert({ where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } }, update: { deletedAt: null }, create: { roleId: role.id, permissionId: permission.id } });
    }
  });
  console.log('Guarantor permissions installed.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
