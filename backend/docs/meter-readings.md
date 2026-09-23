# Meter readings

## One reading per meter per month

A meter is read **once a month, per meter**, so an apartment with an electricity,
a water and a gas meter is read three times a month and each of those meters once.
Nothing more is accepted:

```
POST /api/meter-readings   { "meterId": "…", "readingDate": "2026-09-10", … }

409 METER_READING_MONTH_EXISTS
"This meter already has a reading for Sunbula 1405. A meter is read once a month."
```

The rule is held by the database, not only by a check:

```
MeterReading_meterId_periodMonth_key(meterId, periodMonth)
MeterReading_meterId_readingDate_key(meterId, readingDate)   -- the older rule, still
```

`periodMonth` is set from the reading's date on every write, and clearing it is
how a month is released: **deleting a reading sets it to NULL**, and MySQL allows
many NULLs in a unique index, so the meter can be read again for that month.
Editing a reading is checked against the month it is moving *into*, and a reading
does not clash with the month it already owns.

## The month is a Shamsi month

`periodMonth` holds a Shamsi month as `YYYY-MM` — `1405-06` — because every date
this application shows is a Shamsi date, and a Shamsi month is not a Gregorian one:

| | |
| --- | --- |
| Sunbula 1405 | 2026-08-23 → 2026-09-22 |
| Mizan 1405 | 2026-09-23 → 2026-10-22 |

Keying the rule on the Gregorian month would therefore let a user record
`2026-08-25` and `2026-09-10` as two readings — one month, two readings — and
refuse `2026-09-25` after `2026-09-10` even though the second is a new Shamsi
month. The conversion lives in `src/lib/shamsi.js`, a deliberate twin of the
frontend's `src/utils/shamsiDate.js` (there is no shared package between the two
workspaces) and checked against it day by day for 2024–2028.

## Readings written before the column

A reading created before `periodMonth` existed has no month, and the unique index
cannot see it. The rule still counts it — the service falls back to the date on
the row — and its month is filled in with:

```bash
node scripts/backfill-meter-reading-months.js          # dry run, says what it would do
node scripts/backfill-meter-reading-months.js --apply
```

A meter with two readings in the same month cannot be repaired by filling in a
month, so the script skips that group and reports it rather than guessing which
reading the user meant.
