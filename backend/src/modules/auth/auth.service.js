const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const prisma = require('../../lib/prisma');
const currencyService = require('../currency/currency.service');

function createSlug(value) {
  const slug = value
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    // Keep letters and numbers from every writing system. The previous ASCII-
    // only expression removed an entire Dari/Pashto name, making every such
    // organization fall back to the same `organization` slug.
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'organization';
}

function createConflictError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function getJwtSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }

  return process.env.JWT_SECRET;
}

function formatUser(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    // Every authenticated request is scoped from this server-derived value.
    // Keep the legacy organizations array for existing UI consumers.
    organizationId: user.organization.id,
    organizations: [
      {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
        // The currency this workspace reports in, so the UI can state amounts
        // without waiting for the currency list to load.
        baseCurrency: user.organization.baseCurrency,
        role: { id: user.role.id, name: user.role.name },
      },
    ],
  };
}

async function findActiveUser(where) {
  return prisma.user.findFirst({
    where: {
      ...where,
      deletedAt: null,
      organization: { is: { deletedAt: null } },
      role: { is: { deletedAt: null } },
    },
    include: {
      organization: true,
      role: true,
    },
  });
}

async function authenticateUser(email, password) {
  const user = await findActiveUser({ email });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return null;
  }

  return formatUser(user);
}

async function registerOrganizationAdmin({
  organizationName,
  firstName,
  lastName,
  email,
  password,
  currency,
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const slug = createSlug(organizationName);
  // The workspace reports in this currency from its very first invoice; it
  // defaults to AFN for clients that do not choose one.
  const baseCurrency = (currency || 'AFN').trim().toUpperCase();

  const [existingUser, existingOrganization] = await Promise.all([
    prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } }),
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  if (existingUser) {
    throw createConflictError('EMAIL_ALREADY_EXISTS', 'Email is already registered.');
  }

  if (existingOrganization) {
    throw createConflictError('SLUG_ALREADY_EXISTS', 'Organization slug already exists.');
  }

  const passwordHash = await bcrypt.hash(password, 12);

  return prisma.$transaction(async (transaction) => {
    const adminRole = await transaction.role.upsert({
      where: { name: 'ADMIN' },
      update: { deletedAt: null },
      create: { name: 'ADMIN' },
    });

    const organization = await transaction.organization.create({
      data: {
        name: organizationName.trim(),
        slug,
        baseCurrency,
      },
    });

    // Seed the catalogue with the chosen currency straight away, so Settings ›
    // Currencies opens with the workspace's own currency already in place and
    // every later rate has something to be quoted against.
    await currencyService.ensureBaseCurrency(transaction, organization.id);

    return transaction.user.create({
      data: {
        email: normalizedEmail,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
        organizationId: organization.id,
        roleId: adminRole.id,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            baseCurrency: true,
          },
        },
        role: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  });
}

function createAccessToken(user) {
  return jwt.sign({ email: user.email }, getJwtSecret(), {
    subject: user.id,
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

async function getCurrentUser(userId) {
  const user = await findActiveUser({ id: userId });
  return user ? formatUser(user) : null;
}

module.exports = {
  authenticateUser,
  createSlug,
  createAccessToken,
  getCurrentUser,
  registerOrganizationAdmin,
  verifyAccessToken,
};
