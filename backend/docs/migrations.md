# Migrations

## One baseline, created from scratch

`prisma/migrations/0_init/migration.sql` is the **entire schema in a single
file**: every table created complete, with its columns, its indexes and its
foreign keys in one statement.

```
28 CREATE TABLE
45 foreign keys        (inline, not appended afterwards)
 0 ALTER TABLE
```

Tables are ordered so that each one's parents already exist, which is why the
foreign keys can be written inline instead of being bolted on with
`ALTER TABLE ... ADD CONSTRAINT` at the end. No table is ever completed later:
a table appears once, finished.

This replaces the twenty incremental migrations that came before it, where the
schema was built up by adding a column here, dropping one there — and where the
history had drifted away from the actual database (one migration had never been
recorded as applied, another was recorded twice). A new environment now gets the
whole schema from one file, and `prisma migrate dev` works again.

## Applying it

```bash
cd backend
npx prisma migrate reset --force --skip-seed   # drop, recreate, apply 0_init
npm run seed                                   # optional: demo login
```

On a brand-new database it is just `npx prisma migrate deploy`.

`--skip-seed` matters on a reset you intend to restore into: seeding first would
occupy the tables the restore is about to fill.

## Rebuilding a dev database without losing the rows

The rows are the part that cannot be recovered from `schema.prisma`, so they are
dumped before anything is dropped.

| command | what it does |
| --- | --- |
| `npm run db:dump` | every row of every model to `.backup/full/<database>-<timestamp>.json` |
| `npm run db:restore` | dry run: prints what would be inserted, and what cannot be |
| `npm run db:restore -- --apply` | inserts it |
| `npm run db:rebuild` | dump, reset, restore — the whole cycle in one command |

`restore` inserts **parents first**, in an order derived from the foreign keys in
the generated client, so nothing is ever inserted ahead of what it points at. It
refuses to run against a database that already has rows: this is a restore onto a
fresh schema, not a merge.

A row whose required parent is missing from the dump is **not** inserted — the
fresh schema enforces the foreign keys an older, drifted database may have been
missing — and it is reported with the reason, so the loss is visible rather than
silent. A skipped row also strands its own children, so the plan is built in
insert order and only rows that will really exist count as parents.

## Verifying the baseline is still faithful

Two checks, both read-only:

```bash
# 1. The baseline must reproduce schema.prisma exactly (empty = identical).
#    Regenerate it and compare; useful after a squash.
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script

# 2. The live database must match the schema (empty = no drift).
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

The second one is worth running whenever something feels wrong: it detects the
exact condition that made the old history unusable, a database that has been
advanced outside the migration records.

## Changing the schema from now on

1. Edit `prisma/schema.prisma`.
2. `npx prisma migrate dev --name describe_the_change`.

That writes a normal incremental migration describing the *delta* — `ALTER TABLE`
and friends — which is correct for a change. `0_init` stays as it is: it is the
starting point, not a place to edit. If the history is ever squashed again,
regenerate `0_init` from the schema rather than editing it by hand:

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/0_init/migration.sql
```

## The old migrations

They are deleted. `0_init` is the only migration in the repository — one folder,
one file, the whole schema. `migration_lock.toml` sits beside it because Prisma
requires it; it is not a migration.

Nineteen of the twenty were committed, so their SQL is still recoverable — from
the current commit until this deletion is committed, and from history after
that:

```bash
# from the repository root, while the deletion is still an uncommitted change
git show HEAD:backend/prisma/migrations/20260922000000_add_multi_currency/migration.sql

# once the deletion is committed, list them and read any one of them
git log --diff-filter=D --name-only --oneline -- 'backend/prisma/migrations/2026*/migration.sql'
git show <commit>^:backend/prisma/migrations/20260922000000_add_multi_currency/migration.sql
```

The twentieth, `add_apartment_spaces`, was never committed, and it was the only
one that did more than describe a schema change: it copied `Apartment.bedrooms`
and `Apartment.bathrooms` into `ApartmentSpace` rows. Deleted migrations describe
changes that were already applied, so removing it loses nothing here — the
backfill has run and its rows exist (10 Bedroom, 10 Bathroom) and are part of
every dump. On a database created from `0_init` there is nothing to backfill in
the first place. Should it ever be needed again for a database restored from an
old dump, it belongs in `scripts/` as a `backfill-*` script, not in a migration.
