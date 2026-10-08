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

function createCodedError(code, message) {
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
    username: user.username,
    // Response alias for previously deployed clients. No email column remains.
    email: user.username.includes('@') ? user.username : null,
    firstName: user.firstName,
    lastName: user.lastName,
    // Every authenticated request is scoped from this server-derived value.
    // Keep the legacy organizations array for existing UI consumers.
    organizationId: user.organization.id,
    permissions: (user.role.rolePermissions || []).map(r => r.permission.code),
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
      role: { include: { rolePermissions: { where: { deletedAt: null, permission: { deletedAt: null } }, include: { permission: true } } } },
    },
  });
}

async function authenticateUser(identifier, password) {
  const normalized = identifier.trim().toLowerCase();
  const user = await findActiveUser({ username: normalized });

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return null;
  }

  return formatUser(user);
}

async function registerOrganizationAdmin({
  organizationName,
  firstName,
  lastName,
  username,
  password,
  currency,
}) {
  const normalizedUsername = username.trim().toLowerCase();
  const slug = createSlug(organizationName);
  // The workspace reports in this currency from its very first invoice; it
  // defaults to AFN for clients that do not choose one.
  const baseCurrency = (currency || 'AFN').trim().toUpperCase();

  const [existingUsername, existingOrganization] = await Promise.all([
    prisma.user.findUnique({ where: { username: normalizedUsername }, select: { id: true } }),
    prisma.organization.findUnique({ where: { slug }, select: { id: true } }),
  ]);

  if (existingUsername) {
    throw createCodedError('USERNAME_ALREADY_EXISTS', 'Username is already registered.');
  }

  if (existingOrganization) {
    throw createCodedError('SLUG_ALREADY_EXISTS', 'Organization slug already exists.');
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
        username: normalizedUsername,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        passwordHash,
        organizationId: organization.id,
        roleId: adminRole.id,
      },
      select: {
        id: true,
        username: true,
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
  return jwt.sign({ username: user.username }, getJwtSecret(), {
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

/**
 * Change the display name on the signed-in user's own record.
 *
 * The organization is part of the lookup, not a separate check: an account is
 * resolved inside its workspace or not at all, so a stray id can never reach
 * another organization's user. The updated record is re-read through
 * `getCurrentUser` rather than being echoed from the update, so the caller gets
 * the same shape — with permissions and organization — as `GET /auth/me`.
 */
async function updateOwnProfile(userId, organizationId, { firstName, lastName }) {
  const user = await findActiveUser({ id: userId, organizationId });

  if (!user) return null;

  await prisma.user.update({
    where: { id: user.id },
    data: { firstName: firstName.trim(), lastName: lastName.trim() },
  });

  return getCurrentUser(user.id);
}

/**
 * Replace the signed-in user's password after proving the current one.
 *
 * Returns false when there is no such account in this workspace and throws
 * `INVALID_CURRENT_PASSWORD` when the current password does not match, so the
 * caller can tell "wrong password" (a field error) from "no account".
 */
async function changeOwnPassword(userId, organizationId, { currentPassword, newPassword }) {
  const user = await findActiveUser({ id: userId, organizationId });

  if (!user) return false;

  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw createCodedError('INVALID_CURRENT_PASSWORD', 'Your current password is not correct.');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) },
  });

  return true;
}

module.exports = {
  authenticateUser,
  changeOwnPassword,
  createSlug,
  createAccessToken,
  getCurrentUser,
  registerOrganizationAdmin,
  updateOwnProfile,
  verifyAccessToken,
};
