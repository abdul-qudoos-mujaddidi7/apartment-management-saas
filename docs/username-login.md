# Username sign-in

The User model now has one required, unique username field and no email field.
New registrations ask only for a username. New usernames contain 3-64 letters,
numbers, dots, underscores or hyphens and are stored in lowercase.

The migration renames the existing email column in place. For example,
admin@example.com remains admin@example.com, now in the username column.
No existing user values, password hashes, IDs, organizations or roles change.
Login accepts these longer, email-shaped usernames. Existing users enter their
old email address and current password.

Existing sessions still resolve users by the token's subject (user ID).
Remembered email addresses still populate the username field. Legacy API
clients can still send an email login field, now looked up as a username.
Legacy registration similarly maps email to username without storing a
separate email. Responses retain a derived email alias for previous clients
whose usernames contain an email address. New tokens contain username and
subject, without an email claim.

## Deployment

The earlier draft adding a separate nullable username was never applied to
the workspace database. The pending migration now renames the email column
and unique index, preserving data. It requires the original schema containing
User.email and no User.username column.

Coordinate this upgrade: pause the old backend, apply the migration, generate
Prisma, then start the new backend and deploy the frontend. The old backend
cannot run after the column rename because it still queries email. Keep the
same JWT secret so existing sessions remain valid.

From backend:

```powershell
npx.cmd prisma migrate status
npx.cmd prisma migrate deploy
npx.cmd prisma generate
```

Check pending migrations before deployment. Do not use a database reset or
the demo seed to upgrade production. The seed supports SEED_ADMIN_USERNAME
and accepts SEED_ADMIN_EMAIL as an alias for existing configurations.

The migration has not been applied during implementation. Local Prisma
schema validation passed. Client generation previously encountered a locked
Windows query-engine DLL; stop the local backend before regenerating.

Validation: all 71 backend/frontend tests and the frontend production build
passed. The rename SQL also passed against a temporary MySQL table with sample
accounts, preserving exact username values, password hashes, IDs and ownership
values, and continuing to reject duplicate usernames. The real User table was
not modified.

## Changing your own account

Two routes let the signed-in user edit their own record; both take the account
from the session cookie, so neither accepts an id from the request body and
neither can reach another organization's user (`findActiveUser` resolves the
account inside the session's organization).

- `PATCH /api/auth/me` with `{ firstName, lastName }` rewrites the display name
  and answers with the same user shape as `GET /api/auth/me`, so the store can
  adopt it directly. The username and role are not editable here: the username is
  the login identifier and the role is the administrator's call.
- `POST /api/auth/change-password` with `{ currentPassword, newPassword }`
  replaces the password hash once the current password is proven. The new
  password must be at least 8 characters and different from the current one. A
  wrong current password is answered as a field error:
  `400 { code: 'INVALID_CURRENT_PASSWORD', errors: { currentPassword: [message] } }`.

Both are surfaced in the app under Settings › Profile
(`frontend/src/pages/Profile.svelte`), and both are covered by
`backend/src/modules/auth/auth.test.js`.
