Account codes are removed by this migration. Existing FinancialAccount IDs, names,
balances, journal lines, payments and deposit relationships remain intact. Built-in
accounts receive semantic systemKey roles; custom accounts receive NULL.

Production deployment requires a short maintenance window because the old API
requires code and the new API requires systemKey. Deploy the matching backend and
frontend together; do not apply the migration while the old API accepts requests.

1. Confirm the production database target with `node scripts/account-code-preflight.js`.
2. Stop the API and all jobs that write to this database.
3. Take and verify a restorable full database backup, including schema. Also save
   a copy of FinancialAccount containing its original codes. The existing
   `node scripts/dump-database.js` can save a supplementary JSON snapshot before
   generating the new Prisma client. Keep backup files outside version control.
4. Review `npx prisma migrate status` for unrelated pending migrations. Resolve
   any failed migration before continuing. Never use migrate reset or db push.
5. Deploy this source, apply `npx prisma migrate deploy`, and generate its client
   with `npx prisma generate`. Restart the API with the newly generated client.
6. Repeat the preflight. FinancialAccount must have systemKey and no code;
   account and transaction counts must match the preflight. Verify account IDs
   against the backup and posted base debit/credit totals against the snapshot.
7. Check Accounts, Journals, receiving payments, tenant balances, invoicing, and
   security deposits. Remove maintenance mode only after these checks pass.

MySQL DDL auto-commits. If deployment fails, keep writers stopped and restore the
verified database backup plus the previous application build. Do not attempt a
schema reset or recreate accounts to recover; that would break existing links.
