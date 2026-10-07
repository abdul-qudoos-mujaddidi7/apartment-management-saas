const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const currencyService = require('../currency/currency.service');
const service = require('./auth.service');
const controller = require('./auth.controller');
const { loginSchema, registrationSchema } = require('./auth.validation');

const signup = {
  organizationName: 'Test Building', firstName: 'Test', lastName: 'Admin',
  phone: '0700000000', password: 'test-password',
};

test('login accepts new usernames and existing email clients; signup keeps both API formats', () => {
  assert.equal(loginSchema.safeParse({ username: 'manager', password: 'secret' }).success, true);
  assert.equal(loginSchema.safeParse({ username: 'admin@example.com', password: 'secret' }).success, true);
  assert.equal(loginSchema.safeParse({ email: 'admin@example.com', password: 'secret' }).success, true);
  assert.equal(loginSchema.safeParse({ password: 'secret' }).success, false);
  assert.equal(registrationSchema.parse({ ...signup, username: ' Manager_1 ' }).username, 'manager_1');
  assert.equal(registrationSchema.safeParse({ ...signup, username: '\u0645\u062f\u06cc\u0631' }).success, true);
  const legacySignup = registrationSchema.parse({ ...signup, email: 'admin@example.com' });
  assert.equal(legacySignup.username, 'admin@example.com');
  assert.equal(Object.hasOwn(legacySignup, 'email'), false);
  for (const username of ['ab', 'a'.repeat(65), 'has space', 'admin@example.com']) {
    assert.equal(registrationSchema.safeParse({ ...signup, username }).success, false);
  }
  assert.equal(registrationSchema.safeParse(signup).success, false);
});

test('email and username logins verify the existing password and retain active-user filters', async () => {
  const original = prisma.user.findFirst;
  const hash = await bcrypt.hash('existing-password', 4);
  let lookup;
  let active = true;
  const user = {
    id: 'existing-user', username: 'admin@example.com', passwordHash: hash,
    organization: { id: 'org1', name: 'Building', baseCurrency: 'AFN' },
    role: { id: 'role1', name: 'ADMIN', rolePermissions: [] },
  };
  prisma.user.findFirst = async ({ where }) => {
    lookup = where;
    assert.equal(where.deletedAt, null);
    assert.equal(where.organization.is.deletedAt, null);
    assert.equal(where.role.is.deletedAt, null);
    return active ? user : null;
  };
  try {
    assert.equal((await service.authenticateUser(' ADMIN@EXAMPLE.COM ', 'existing-password')).id, user.id);
    assert.equal(lookup.username, 'admin@example.com');
    assert.equal(lookup.email, undefined);
    user.username = 'manager';
    assert.equal((await service.authenticateUser(' Manager ', 'existing-password')).username, 'manager');
    assert.equal(lookup.username, 'manager');
    assert.equal(lookup.email, undefined);
    assert.equal(await service.authenticateUser('manager', 'wrong-password'), null);
    active = false;
    assert.equal(await service.authenticateUser('manager', 'existing-password'), null);
  } finally { prisma.user.findFirst = original; }
});

test('existing email-only session tokens still resolve the same user by ID', async () => {
  const originalFind = prisma.user.findFirst;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'auth-test-secret';
  const user = { id: 'legacy-user', username: 'legacy@example.com',
    organization: { id: 'org1' }, role: { id: 'role1', rolePermissions: [] } };
  prisma.user.findFirst = async ({ where }) => {
    assert.equal(where.id, user.id);
    return user;
  };
  try {
    const oldToken = jwt.sign({ email: user.username }, process.env.JWT_SECRET, { subject: user.id });
    const payload = service.verifyAccessToken(oldToken);
    assert.equal((await service.getCurrentUser(payload.sub)).username, user.username);
    const token = service.createAccessToken({ ...user, username: 'manager' });
    assert.equal(service.verifyAccessToken(token).username, 'manager');
    assert.equal(Object.hasOwn(service.verifyAccessToken(token), 'email'), false);
  } finally {
    prisma.user.findFirst = originalFind;
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});

test('registration only writes username; legacy signup maps its email to username', async () => {
  const original = { userFind: prisma.user.findUnique, orgFind: prisma.organization.findUnique,
    transaction: prisma.$transaction, currency: currencyService.ensureBaseCurrency };
  let conflict = false;
  let created;
  prisma.user.findUnique = async ({ where }) => conflict && where.username ? { id: 'taken' } : null;
  prisma.organization.findUnique = async () => null;
  currencyService.ensureBaseCurrency = async () => {};
  prisma.$transaction = async callback => callback({
    role: { upsert: async () => ({ id: 'role1' }) },
    organization: { create: async () => ({ id: 'org1' }) },
    user: { create: async ({ data }) => { created = data; return data; } },
  });
  try {
    await service.registerOrganizationAdmin({ ...signup, username: ' Manager ' });
    assert.equal(created.username, 'manager');
    assert.equal(Object.hasOwn(created, 'email'), false);
    assert.equal(await bcrypt.compare(signup.password, created.passwordHash), true);
    await service.registerOrganizationAdmin(registrationSchema.parse({ ...signup, email: ' ADMIN@EXAMPLE.COM ' }));
    assert.equal(created.username, 'admin@example.com');
    assert.equal(Object.hasOwn(created, 'email'), false);
    conflict = true;
    await assert.rejects(service.registerOrganizationAdmin({ ...signup, username: 'manager' }),
      { code: 'USERNAME_ALREADY_EXISTS' });
  } finally {
    prisma.user.findUnique = original.userFind;
    prisma.organization.findUnique = original.orgFind;
    prisma.$transaction = original.transaction;
    currencyService.ensureBaseCurrency = original.currency;
  }
});

test('controller keeps the legacy email login API and reports username uniqueness races on the correct field', async () => {
  const original = { authenticate: service.authenticateUser, token: service.createAccessToken,
    register: service.registerOrganizationAdmin };
  let identifier;
  let status;
  let body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; }, cookie() {} };
  const next = error => { throw error; };
  service.authenticateUser = async value => { identifier = value; return { id: 'user1' }; };
  service.createAccessToken = () => 'test-token';
  try {
    for (const credentials of [{ email: 'admin@example.com' }, { username: 'manager' }, { username: 'admin@example.com' }]) {
      await controller.login({ body: { ...credentials, password: 'secret' } }, res, next);
      assert.equal(status, 200);
      assert.equal(identifier, credentials.username || credentials.email);
    }
    for (const target of ['User_username_key', ['username']]) {
      service.registerOrganizationAdmin = async () => { throw Object.assign(new Error('Duplicate'), { code: 'P2002', meta: { target } }); };
      await controller.register({ body: { ...signup, username: 'manager' } }, res, next);
      assert.equal(status, 409);
      assert.equal(body.code, 'USERNAME_ALREADY_EXISTS');
      assert.equal(body.field, 'username');
    }
  } finally {
    service.authenticateUser = original.authenticate;
    service.createAccessToken = original.token;
    service.registerOrganizationAdmin = original.register;
  }
});
