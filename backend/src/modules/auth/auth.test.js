const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../../lib/prisma');
const currencyService = require('../currency/currency.service');
const service = require('./auth.service');
const controller = require('./auth.controller');
const { loginSchema, passwordChangeSchema, profileSchema, registrationSchema } = require('./auth.validation');

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

test('profile and password schemas trim the name, enforce a usable password and reject a no-op change', () => {
  assert.deepEqual(profileSchema.parse({ firstName: '  Zahra ', lastName: ' Ahmadi ' }),
    { firstName: 'Zahra', lastName: 'Ahmadi' });
  for (const body of [{ firstName: '', lastName: 'Ahmadi' }, { firstName: 'Zahra' },
    { firstName: 'a'.repeat(81), lastName: 'Ahmadi' }]) {
    assert.equal(profileSchema.safeParse(body).success, false);
  }
  assert.equal(passwordChangeSchema.safeParse({ currentPassword: 'old-secret', newPassword: 'new-secret' }).success, true);
  for (const body of [
    { currentPassword: 'old-secret', newPassword: 'short' },
    { currentPassword: '', newPassword: 'new-secret' },
    { currentPassword: 'same-secret', newPassword: 'same-secret' },
  ]) {
    assert.equal(passwordChangeSchema.safeParse(body).success, false);
  }
});

test('a profile update resolves the account inside its organization and returns the session user shape', async () => {
  const original = { find: prisma.user.findFirst, update: prisma.user.update };
  const record = {
    id: 'user1', username: 'manager', passwordHash: 'hash', firstName: 'Zahra', lastName: 'Ahmadi',
    organization: { id: 'org1', name: 'Building', slug: 'building', baseCurrency: 'AFN' },
    role: { id: 'role1', name: 'ADMIN', rolePermissions: [] },
  };
  let lookup;
  let written;
  prisma.user.findFirst = async ({ where }) => {
    lookup = where;
    assert.equal(where.deletedAt, null);
    assert.equal(where.organization.is.deletedAt, null);
    // The re-read after the write carries no organization, so only a lookup
    // that names a *different* workspace resolves nobody.
    return where.organizationId && where.organizationId !== 'org1' ? null : record;
  };
  prisma.user.update = async ({ where, data }) => { written = { where, data }; return record; };
  try {
    const updated = await service.updateOwnProfile('user1', 'org1', { firstName: ' Zahra ', lastName: ' Ahmadi ' });
    assert.equal(written.where.id, 'user1');
    assert.deepEqual(written.data, { firstName: 'Zahra', lastName: 'Ahmadi' });
    assert.equal(updated.id, 'user1');
    assert.equal(updated.organizationId, 'org1');
    assert.equal(updated.organizations[0].role.name, 'ADMIN');
    // Another organization's id resolves no user, so nothing is written.
    written = null;
    assert.equal(await service.updateOwnProfile('user1', 'org2', { firstName: 'Zahra', lastName: 'Ahmadi' }), null);
    assert.equal(written, null);
    assert.equal(lookup.organizationId, 'org2');
  } finally {
    prisma.user.findFirst = original.find;
    prisma.user.update = original.update;
  }
});

test('changing a password proves the current one and stores a fresh hash', async () => {
  const original = { find: prisma.user.findFirst, update: prisma.user.update };
  const record = {
    id: 'user1', username: 'manager', passwordHash: await bcrypt.hash('existing-password', 4),
    organization: { id: 'org1', name: 'Building', slug: 'building', baseCurrency: 'AFN' },
    role: { id: 'role1', name: 'ADMIN', rolePermissions: [] },
  };
  let written;
  prisma.user.findFirst = async ({ where }) => (where.organizationId === 'org1' ? record : null);
  prisma.user.update = async ({ data }) => { written = data; return record; };
  try {
    assert.equal(await service.changeOwnPassword('user1', 'org1',
      { currentPassword: 'existing-password', newPassword: 'brand-new-password' }), true);
    assert.equal(await bcrypt.compare('brand-new-password', written.passwordHash), true);
    assert.notEqual(written.passwordHash, record.passwordHash);
    written = null;
    await assert.rejects(
      service.changeOwnPassword('user1', 'org1', { currentPassword: 'wrong-password', newPassword: 'brand-new-password' }),
      { code: 'INVALID_CURRENT_PASSWORD' });
    assert.equal(written, null);
    // A password is never changed on an account outside the session's workspace.
    assert.equal(await service.changeOwnPassword('user1', 'org2',
      { currentPassword: 'existing-password', newPassword: 'brand-new-password' }), false);
  } finally {
    prisma.user.findFirst = original.find;
    prisma.user.update = original.update;
  }
});

test('the profile and password endpoints answer field errors without leaking a wrong password as a server fault', async () => {
  const original = { update: service.updateOwnProfile, password: service.changeOwnPassword };
  let status;
  let body;
  const res = { status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  const next = error => { throw error; };
  const request = { user: { id: 'user1', organizationId: 'org1' } };
  let scoped;
  service.updateOwnProfile = async (id, organizationId, data) => { scoped = { id, organizationId, data }; return { id: 'user1', username: 'manager' }; };
  try {
    await controller.updateProfile({ ...request, body: { firstName: 'Zahra', lastName: 'Ahmadi' } }, res, next);
    assert.equal(status, 200);
    assert.deepEqual(scoped, { id: 'user1', organizationId: 'org1', data: { firstName: 'Zahra', lastName: 'Ahmadi' } });
    assert.equal(body.user.id, 'user1');

    await controller.updateProfile({ ...request, body: { firstName: '', lastName: '' } }, res, next);
    assert.equal(status, 400);
    assert.equal(body.code, 'INVALID_PROFILE_DATA');
    assert.equal(body.errors.firstName.length, 1);

    // A body-supplied id must never redirect the write to another account.
    scoped = null;
    await controller.updateProfile({ ...request, body: { firstName: 'Zahra', lastName: 'Ahmadi', id: 'someone-else' } }, res, next);
    assert.equal(scoped.id, 'user1');

    service.changeOwnPassword = async () => true;
    await controller.changePassword({ ...request, body: { currentPassword: 'old-secret', newPassword: 'new-secret' } }, res, next);
    assert.equal(status, 200);

    await controller.changePassword({ ...request, body: { currentPassword: 'old-secret', newPassword: 'short' } }, res, next);
    assert.equal(status, 400);
    assert.equal(body.code, 'INVALID_PASSWORD_DATA');
    assert.equal(body.errors.newPassword.length, 1);

    service.changeOwnPassword = async () => { throw Object.assign(new Error('Your current password is not correct.'), { code: 'INVALID_CURRENT_PASSWORD' }); };
    await controller.changePassword({ ...request, body: { currentPassword: 'wrong', newPassword: 'new-secret' } }, res, next);
    assert.equal(status, 400);
    assert.equal(body.code, 'INVALID_CURRENT_PASSWORD');
    assert.equal(body.errors.currentPassword.length, 1);

    service.changeOwnPassword = async () => false;
    await controller.changePassword({ ...request, body: { currentPassword: 'old-secret', newPassword: 'new-secret' } }, res, next);
    assert.equal(status, 404);
  } finally {
    service.updateOwnProfile = original.update;
    service.changeOwnPassword = original.password;
  }
});
