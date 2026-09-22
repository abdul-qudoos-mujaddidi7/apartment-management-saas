const prisma = require('../../lib/prisma');

function createApartmentError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function apartmentSelect() {
  return {
    id: true,
    organizationId: true,
    floorId: true,
    apartmentNumber: true,
    name: true,
    type: true,
    area: true,
    bedrooms: true,
    bathrooms: true,
    monthlyRent: true,
    rentCurrency: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    spaces: {
      where: { deletedAt: null },
      select: { id: true, name: true, quantity: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    },
    floor: {
      select: {
        id: true,
        floorNumber: true,
        name: true,
        building: { select: { id: true, name: true, code: true } },
      },
    },
  };
}

function formatApartment(apartment) {
  if (!apartment) return apartment;
  return {
    ...apartment,
    area: apartment.area === null || apartment.area === undefined ? null : Number(apartment.area),
    monthlyRent: Number(apartment.monthlyRent),
    rentCurrency: apartment.rentCurrency || 'AFN',
  };
}

function normalizeSpaces(spaces = []) {
  return spaces.map((space, sortOrder) => ({
    name: space.name.trim(),
    quantity: Number(space.quantity),
    sortOrder,
  }));
}

function legacySpaces(data) {
  const spaces = [];
  if (Number(data.bedrooms) > 0) spaces.push({ name: 'Bedroom', quantity: Number(data.bedrooms) });
  if (Number(data.bathrooms) > 0) spaces.push({ name: 'Bathroom', quantity: Number(data.bathrooms) });
  return normalizeSpaces(spaces);
}

function legacyCounts(spaces) {
  return spaces.reduce((counts, space) => {
    const name = space.name.toLocaleLowerCase('en-US');
    if (name === 'bedroom') counts.bedrooms = space.quantity;
    if (name === 'bathroom') counts.bathrooms = space.quantity;
    return counts;
  }, { bedrooms: 0, bathrooms: 0 });
}

function splitApartmentData(data, fallbackSpaces) {
  const { spaces: requestedSpaces, bedrooms: requestedBedrooms, bathrooms: requestedBathrooms, ...apartmentData } = data;
  let spaces;
  if (requestedSpaces !== undefined) {
    spaces = normalizeSpaces(requestedSpaces);
  } else if (fallbackSpaces && (requestedBedrooms !== undefined || requestedBathrooms !== undefined)) {
    const kept = fallbackSpaces.filter((space) => !['bedroom', 'bathroom'].includes(space.name.toLocaleLowerCase('en-US')));
    const currentBedrooms = fallbackSpaces.find((space) => space.name.toLocaleLowerCase('en-US') === 'bedroom')?.quantity || 0;
    const currentBathrooms = fallbackSpaces.find((space) => space.name.toLocaleLowerCase('en-US') === 'bathroom')?.quantity || 0;
    const bedrooms = requestedBedrooms === undefined ? currentBedrooms : Number(requestedBedrooms);
    const bathrooms = requestedBathrooms === undefined ? currentBathrooms : Number(requestedBathrooms);
    spaces = normalizeSpaces([
      ...(bedrooms > 0 ? [{ name: 'Bedroom', quantity: bedrooms }] : []),
      ...(bathrooms > 0 ? [{ name: 'Bathroom', quantity: bathrooms }] : []),
      ...kept,
    ]);
  } else if (fallbackSpaces) {
    spaces = null;
  } else {
    spaces = legacySpaces({ bedrooms: requestedBedrooms, bathrooms: requestedBathrooms });
  }

  return {
    apartmentData: spaces ? { ...apartmentData, ...legacyCounts(spaces) } : apartmentData,
    spaces,
  };
}

/**
 * The currency an apartment's rent is stated in: one of the currencies the
 * organization trades in, or its reporting currency.
 *
 * A code it does not trade in is refused rather than stored, because a rent in a
 * currency the workspace keeps no rate for could not be billed: the lease raised
 * for this apartment could not be priced in it.
 */
async function resolveRentCurrency(organizationId, requested, client = prisma) {
  const organization = await client.organization.findFirst({
    where: { id: organizationId, deletedAt: null },
    select: { baseCurrency: true },
  });
  const base = String(organization?.baseCurrency || 'AFN').trim().toUpperCase();

  if (requested === undefined || requested === null || requested === '') return base;

  const code = String(requested).trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) {
    throw createApartmentError('INVALID_CURRENCY_CODE', 'Use a three-letter currency code such as USD.');
  }
  if (code === base) return code;

  const currency = await client.currency.findFirst({
    where: { organizationId, code, deletedAt: null, isActive: true },
    select: { id: true },
  });
  if (!currency) {
    throw createApartmentError('CURRENCY_NOT_SUPPORTED', `${code} is not an active currency for this organization.`);
  }
  return code;
}

async function assertFloorInOrganization(organizationId, floorId, client = prisma) {
  const floor = await client.floor.findFirst({
    where: { id: floorId, deletedAt: null, building: { organizationId, deletedAt: null } },
    select: { id: true },
  });
  if (!floor) throw createApartmentError('FLOOR_NOT_FOUND', 'Floor not found.');
  return floor;
}

async function replaceSpaces(transaction, apartmentId, spaces) {
  const deletedAt = new Date();
  await transaction.apartmentSpace.updateMany({
    where: { apartmentId, deletedAt: null },
    data: { deletedAt },
  });
  if (spaces.length) {
    await transaction.apartmentSpace.createMany({
      data: spaces.map((space) => ({ apartmentId, ...space })),
    });
  }
}

async function listApartments(organizationId, { page, pageSize, search, floorId }) {
  const where = {
    organizationId,
    deletedAt: null,
    ...(floorId ? { floorId } : {}),
    ...(search ? { OR: [{ name: { contains: search } }, { apartmentNumber: { contains: search } }] } : {}),
  };
  const [items, total] = await prisma.$transaction([
    prisma.apartment.findMany({
      where,
      select: apartmentSelect(),
      orderBy: [{ apartmentNumber: 'asc' }, { createdAt: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.apartment.count({ where }),
  ]);
  return {
    items: items.map(formatApartment),
    pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
  };
}

async function getApartment(organizationId, apartmentId) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: apartmentSelect(),
  });
  if (!apartment) throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  return formatApartment(apartment);
}

async function createApartment(organizationId, data) {
  await assertFloorInOrganization(organizationId, data.floorId);
  const { apartmentData, spaces } = splitApartmentData(data);
  apartmentData.rentCurrency = await resolveRentCurrency(organizationId, apartmentData.rentCurrency);
  try {
    return await prisma.$transaction(async (transaction) => {
      const apartment = await transaction.apartment.create({
        data: { ...apartmentData, organizationId },
        select: { id: true },
      });
      await replaceSpaces(transaction, apartment.id, spaces);
      return formatApartment(await transaction.apartment.findUnique({ where: { id: apartment.id }, select: apartmentSelect() }));
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    const removed = await prisma.apartment.findFirst({
      where: { floorId: data.floorId, apartmentNumber: data.apartmentNumber, organizationId, deletedAt: { not: null } },
      select: { id: true },
    });
    if (!removed) throw createApartmentError('APARTMENT_NUMBER_EXISTS', 'Apartment number already exists on this floor.');
    return prisma.$transaction(async (transaction) => {
      await transaction.apartment.update({
        where: { id: removed.id },
        data: { ...apartmentData, organizationId, deletedAt: null },
      });
      await replaceSpaces(transaction, removed.id, spaces);
      return formatApartment(await transaction.apartment.findUnique({ where: { id: removed.id }, select: apartmentSelect() }));
    });
  }
}

async function updateApartment(organizationId, apartmentId, data) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: { id: true, spaces: { where: { deletedAt: null }, select: { name: true, quantity: true } } },
  });
  if (!apartment) throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  if (data.floorId) await assertFloorInOrganization(organizationId, data.floorId);
  const { apartmentData, spaces } = splitApartmentData(data, apartment.spaces);
  // Only resolve what was sent, so a partial update cannot reset the currency.
  if (apartmentData.rentCurrency !== undefined) {
    apartmentData.rentCurrency = await resolveRentCurrency(organizationId, apartmentData.rentCurrency);
  }
  try {
    return await prisma.$transaction(async (transaction) => {
      await transaction.apartment.update({ where: { id: apartmentId }, data: apartmentData });
      if (spaces) await replaceSpaces(transaction, apartmentId, spaces);
      return formatApartment(await transaction.apartment.findUnique({ where: { id: apartmentId }, select: apartmentSelect() }));
    });
  } catch (error) {
    if (error.code === 'P2002') throw createApartmentError('APARTMENT_NUMBER_EXISTS', 'Apartment number already exists on this floor.');
    throw error;
  }
}

async function softDeleteApartment(organizationId, apartmentId) {
  const apartment = await prisma.apartment.findFirst({
    where: { id: apartmentId, organizationId, deletedAt: null },
    select: { id: true },
  });
  if (!apartment) throw createApartmentError('APARTMENT_NOT_FOUND', 'Apartment not found.');
  const deletedAt = new Date();
  await prisma.$transaction([
    prisma.apartment.update({ where: { id: apartmentId }, data: { deletedAt } }),
    prisma.apartmentSpace.updateMany({ where: { apartmentId, deletedAt: null }, data: { deletedAt } }),
  ]);
  return { id: apartmentId };
}

module.exports = {
  assertFloorInOrganization,
  createApartment,
  getApartment,
  listApartments,
  softDeleteApartment,
  updateApartment,
};
