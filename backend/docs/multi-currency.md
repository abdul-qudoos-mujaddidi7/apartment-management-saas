# Multi-currency

## The model

A currency is a **reporting** concept and a **document** concept, and the two are
kept apart on purpose.

* `Organization.baseCurrency` (default `AFN`) is the one currency every report,
  ledger balance and dashboard total is stated in.
* `Currency` lists the currencies an organization trades in, one row per code,
  with exactly one `isBase` row that mirrors `Organization.baseCurrency`.
* `ExchangeRate` is effective-dated history: **1 unit of the currency = `rate`
  units of the base currency**. `1 USD = 63 AFN` is stored as `63`, and the base
  currency resolves to exactly `1` without needing a rate row.

Every money document carries three things:

| column | meaning |
| --- | --- |
| `currency` | the currency the document is denominated in |
| `exchangeRate` | base units per 1 unit of `currency`, **frozen when the document was posted** |
| `base*` columns | the same amounts converted at that frozen rate |

Nothing is ever summed across currencies. Balances and reports read the `base*`
columns, so one number is correct for the whole portfolio, and editing a rate
today cannot restate what a document meant when it was posted.

### Where each figure lives

| record | document currency | base currency |
| --- | --- | --- |
| `Invoice` | `subtotal`, `total`, `paidAmount` | `baseSubtotal`, `baseTotal`, `basePaidAmount` |
| `Payment` | `amount` | `baseAmount` |
| `PaymentAllocation` | `amount` (the receipt's currency) | `baseAppliedAmount` |
| `Journal` | `currency` + `exchangeRate` | — |
| `JournalLine` | `debit`, `credit` | `baseDebit`, `baseCredit` |
| `TenantLedgerEntry` | `currency`, `exchangeRate` (provenance) | `debit`, `credit`, `balanceAfter` are all base |
| `SecurityDepositTransaction` | `currency`, `amount` | `baseAmount` |

The tenant sub-ledger is deliberately single-currency (base): a tenant's
receivable has to be one number, and it has to reconcile against account `1100`,
which is also summed from base amounts.

### Cross-currency payments

A receipt is stated in the currency the tenant actually handed over, and its
allocations stay in that currency so they still add up to the receipt. When an
allocation settles an item on an invoice in another currency, the amount applied
is converted **once** at the two frozen rates and stored in `appliedAmount`
(invoice currency) and `baseAppliedAmount`. The invoice's `paidAmount` and the
receivable control account then move together, and neither is re-converted later.

A rate mistake is not silently absorbed: an unknown currency is rejected
(`CURRENCY_NOT_SUPPORTED`) and a missing rate for the document's date fails the
write (`EXCHANGE_RATE_MISSING`). Defaulting to 1 would post a foreign-currency
document as if it were base currency with no trace of the mistake.

### Sub-cent settlement: the rounding residue

Converting a receipt into the invoice's currency rounds to cents, and converting
that rounded figure back to base does **not** return the money that was handed
over. `19,000 AFN` against a `300 USD` invoice at `64` is `296.875 USD`; rounded
to `296.88` it credits the tenant with `19,000.32 AFN` — `0.32` they never paid.
The invoice then reads as fully paid while the receivable keeps `0.32` open, and
no document can ever clear it: paying the `3.12 USD` the UI shows as remaining
leaves `0.32` behind all over again.

So an allocation that **closes** an item does not use the rounded figure. It
takes the item's remaining base balance, settling the item in both currencies at
once, and the sub-cent difference lands on the receipt:

| | `amount` | `appliedAmount` | `baseAmount` |
|---|---|---|---|
| `PAY-000001` — 19,000 AFN on a 300 USD item at 64 | 19,000 AFN | 296.88 USD | 19,000.00 AFN |
| `PAY-000002` — the 3.12 USD the UI shows as remaining | 3.12 USD | 3.12 USD | **200.00** AFN |

`PAY-000002` receives 199.68 AFN of value and settles 200.00 AFN of receivable,
so the receivable reaches exactly zero and the invoice is paid in both
currencies. The `0.32` is reported as `roundingAdjustment` on the receipt and
shown in the payment form before saving, so the absorption is visible rather than
silent. A **partial** allocation never applies more base than the money it
arrived with — the residue is only absorbed by the allocation that closes the
item.

One consequence worth knowing: when a closing allocation absorbs a residue, the
receipt's `baseAmount` is not exactly `amount × rate`. For a rate of 64 that is
at most `0.32`; the size is bounded by half a minor unit of the invoice currency
(`0.005 × invoiceRate`), which is the tolerance `check:currency` applies.

#### Repairing a residue written before the fix

Receipts written by the old rounding left the mirrors and the ledger `0.32`
apart. `npm run repair:settlement` reconciles them by raising the ledger to the
value the allocations actually applied — the receipt's base value, the journal's
cash and receivable lines, and the tenant sub-ledger credit, then recomputing the
affected invoices:

```bash
cd backend
node scripts/repair-settlement-rounding.js            # dry run, prints the plan
npm run repair:settlement                             # writes, in one transaction
```

It only touches receipts whose allocations applied more base than the ledger
credited, so it is safe to re-run: a second pass finds nothing and exits.

## Applying the migration

The migration is hand-written so the schema change and the backfill land
together. Existing rows are all base currency, so every backfill is the
identity conversion (rate 1, `base = original`).

```bash
cd backend
npx prisma migrate dev          # dev database, or:
npx prisma migrate deploy       # any other environment
npx prisma generate             # regenerate the client
npm run check:currency          # read-only audit of the backfill
```

`npm run check:currency` verifies that every base mirror matches its document at
the recorded rate, that each journal balances in base currency, and that each
organization's tenant sub-ledger matches its `1100` receivable account. It never
writes.

## API

| endpoint | purpose |
| --- | --- |
| `GET /api/currencies` | catalogue with each currency's rate history |
| `POST /api/currencies` | add a currency, optionally with its first rate |
| `PATCH /api/currencies/:id` | rename, retitle, activate/deactivate, or set a rate |
| `POST /api/currencies/:id/rates` | record a rate for an effective date |
| `DELETE /api/currencies/:id` | remove an unused currency |
| `POST /api/currencies/base` | change the reporting currency (see below) |
| `GET /api/currencies/rate?currency=USD&date=2026-09-22` | the rate the server would freeze |
| `GET /api/currencies/convert?amount=100&from=USD&to=AFN` | preview a conversion |
| `GET /api/currencies/catalogue?search=pound` | reference list for the pickers — **public**, see below |

Money documents take an optional `currency`; omitting it means the base
currency, so existing clients keep working unchanged.

### Setting up USD at 63 AFN

```http
POST /api/currencies
Content-Type: application/json

{
  "code": "USD",
  "name": "US Dollar",
  "symbol": "$",
  "rate": 63,
  "effectiveDate": "2026-09-22"
}
```

### A USD receipt settling an AFN invoice

```http
POST /api/payments
Content-Type: application/json

{
  "tenantId": "tenant-id",
  "leaseId": "lease-id",
  "paymentDate": "2026-09-22",
  "currency": "USD",
  "receiveAccountId": "cash-account-id",
  "paymentMethod": "CASH",
  "amount": 100,
  "allocations": [{ "invoiceItemId": "invoice-item-id", "amount": 100 }]
}
```

This credits the receivable with the base value actually applied (AFN 6,300 at
rate 63) while the receipt itself stays USD 100, and the invoice's `paidAmount`
advances in AFN — the currency it was billed in.

### Changing the reporting currency

`POST /api/currencies/base` only succeeds before the organization has any
invoice, payment, journal or deposit. Every stored base amount was converted to
the old base, so re-denominating them would silently restate history instead of
converting it; the endpoint answers `BASE_CURRENCY_LOCKED` after that point.

### Leases

A lease states the currency its rent is agreed in:

```
POST /api/leases
{ "tenantId": "…", "apartmentId": "…", "contractNumber": "C-1",
  "startDate": "2026-01-01", "endDate": "2027-01-01",
  "monthlyRent": 1200, "securityDeposit": 1200,
  "currency": "usd", "paymentDueDay": 1, "status": "ACTIVE" }
```

`currency` is uppercased and must be the organization's reporting currency or one
of its active currencies (`CURRENCY_NOT_SUPPORTED` otherwise); omitting it means
the reporting currency, which is what every lease agreed before this field
existed is in. The migration backfills each existing lease from its
organization's `baseCurrency`, so no stored amount changes meaning.

**A lease carries no exchange rate, deliberately.** Rent is billed month by
month, so each invoice is priced at the rate in force on *its own* date and
freezes that rate onto itself. A USD lease billed across an AFN rate change
stays historically correct, which a rate captured at lease signing would break.
The consequence to know: an invoice can only be raised once the lease's currency
has a rate on or before the invoice date, or `EXCHANGE_RATE_MISSING` is
returned.

An invoice raised from a lease inherits that lease's currency unless the caller
overrides it, so the dashboard's one-click invoice and the invoice form produce a
USD invoice for a USD lease without anyone choosing it again.

### The currency picker's reference list

`GET /api/currencies/catalogue` answers with the codes every currency field
suggests, each with the name and symbol to fill in:

```
GET /api/currencies/catalogue?search=pound

{ "success": true, "source": "api", "total": 160, "items": [
  { "code": "GBP", "name": "British Pound", "symbol": "£" },
  { "code": "EGP", "name": "Egyptian Pound", "symbol": "E£" }
] }
```

The names come from a public currency API
(`CURRENCY_CATALOGUE_URL`, default
`https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies.json`),
fetched once and cached in memory for a day; `?refresh=true` re-reads it.
Symbols are not in that payload, so they come from the table in
`src/lib/currency-catalogue.js`, which is also the fallback: if the request fails
— offline laptop, DNS, timeout, changed payload — the endpoint still answers
`200` with `source: "bundled"`. It never throws.

What the list leaves out: crypto tickers and precious metals (three letters, but
not billable as rent — see `NON_FIAT`) and withdrawn currencies such as the
Deutsche Mark (`RETIRED`). This is a suggestion list, **not** a validation gate.
`POST /api/currencies` still accepts any three-letter code, so a currency the
list has never heard of can be typed in by hand; the picker simply will not
suggest it.

**This is the one public endpoint in the currency module.** It holds nothing
about any organization — codes, names and symbols from a public list — and it has
to be reachable before a session exists, because the reporting currency is chosen
*while* a workspace is being created. Everything else under `/api/currencies`
still requires a session.

Both signup forms and Settings › Currencies use the same field,
`frontend/src/components/ui/CurrencyPicker.svelte`, so one list answers for all
three. Search works on the code and the name: typing `pound` finds GBP.

### The reporting currency chosen at signup

Registration accepts an optional `currency`, a three-letter code. Leaving it out
means AFN. The organization is created with it as `baseCurrency`, and its base
`Currency` row is seeded through the same catalogue, so a workspace registered in
USD opens Settings › Currencies showing `US Dollar ($)` rather than a bare `USD`:

```http
POST /api/auth/register

{ "organizationName": "…", "currency": "GBP", … }
```

```
Organization.baseCurrency  GBP
Currency                   GBP  British Pound  £  isBase=true
ExchangeRate               1    from 1970-01-01   (the base is always 1)
```

An existing workspace whose base row still carries the bare code as its name is
repaired the next time it reads its currencies — that is, on the next login — so
there is no migration to run for it.

Tuning, all optional in `backend/.env`:

| Variable | Default | Meaning |
|---|---|---|
| `CURRENCY_CATALOGUE_URL` | the jsDelivr list above | Set to an empty string to switch the network off and use the bundled list only. |
| `CURRENCY_CATALOGUE_TIMEOUT_MS` | `2500` | How long to wait before falling back. |
| `CURRENCY_CATALOGUE_CACHE_MS` | `86400000` | How long a fetched list stays fresh. |

Fetching needs Node's global `fetch`, so Node 18 or newer.
