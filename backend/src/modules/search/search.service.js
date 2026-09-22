const prisma = require('../../lib/prisma');

const RESULT_LIMIT = 5;

async function globalSearch(organizationId, query) {
  const term = query.trim();
  if (!term) return { results: [] };

  const [buildings, tenants, apartments, leases] = await Promise.all([
    prisma.building.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { name: { contains: term } },
          { code: { contains: term } },
          { address: { contains: term } },
        ],
      },
      select: { id: true, name: true, code: true, address: true, status: true },
      take: RESULT_LIMIT,
    }),

    prisma.tenant.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { firstName: { contains: term } },
          { lastName: { contains: term } },
          { phone: { contains: term } },
          { email: { contains: term } },
          { nationalId: { contains: term } },
        ],
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        status: true,
      },
      take: RESULT_LIMIT,
    }),

    prisma.apartment.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { apartmentNumber: { contains: term } },
          { name: { contains: term } },
        ],
      },
      select: {
        id: true,
        apartmentNumber: true,
        name: true,
        type: true,
        status: true,
        floor: {
          select: {
            name: true,
            floorNumber: true,
            building: { select: { name: true } },
          },
        },
      },
      take: RESULT_LIMIT,
    }),

    prisma.lease.findMany({
      where: {
        organizationId,
        deletedAt: null,
        OR: [
          { contractNumber: { contains: term } },
        ],
      },
      select: {
        id: true,
        contractNumber: true,
        monthlyRent: true,
        status: true,
        tenant: { select: { firstName: true, lastName: true } },
        apartment: {
          select: {
            apartmentNumber: true,
            floor: {
              select: {
                name: true,
                building: { select: { name: true } },
              },
            },
          },
        },
      },
      take: RESULT_LIMIT,
    }),
  ]);

  const results = [];

  for (const b of buildings) {
    results.push({
      type: 'building',
      id: b.id,
      title: b.name,
      subtitle: [b.code, b.address].filter(Boolean).join(' · '),
      href: `/buildings/${b.id}`,
      status: b.status,
    });
  }

  for (const t of tenants) {
    results.push({
      type: 'tenant',
      id: t.id,
      title: `${t.firstName} ${t.lastName}`,
      subtitle: [t.phone, t.email].filter(Boolean).join(' · '),
      href: '/tenants',
      status: t.status,
    });
  }

  for (const a of apartments) {
    const loc = [a.floor?.building?.name, a.floor?.name || `F${a.floor?.floorNumber}`]
      .filter(Boolean)
      .join(' › ');
    results.push({
      type: 'apartment',
      id: a.id,
      title: a.apartmentNumber + (a.name ? ` (${a.name})` : ''),
      subtitle: loc,
      href: `/floors/${a.floorId}`,
      status: a.status,
    });
  }

  for (const l of leases) {
    const tenantName = `${l.tenant.firstName} ${l.tenant.lastName}`;
    const loc = [
      l.apartment?.floor?.building?.name,
      l.apartment?.apartmentNumber,
    ]
      .filter(Boolean)
      .join(' › ');
    results.push({
      type: 'lease',
      id: l.id,
      title: l.contractNumber,
      subtitle: [tenantName, loc].filter(Boolean).join(' · '),
      href: '/leases',
      status: l.status,
    });
  }

  return { results };
}

module.exports = { globalSearch };
