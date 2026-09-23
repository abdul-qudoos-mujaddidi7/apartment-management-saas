# Security deposits

A deposit is **held money, not earned money**. It belongs to the tenant until it
is refunded or kept for a reason, so it is a liability from the moment it is
received until it is discharged. Nothing about it is income.

## The shape of it

| record | what it holds |
| --- | --- |
| `Lease.securityDeposit` + `Lease.currency` | what was agreed: the amount, quoted in the lease's currency |
| `SecurityDepositTransaction` | what actually happened: `RECEIVED`, `DEDUCTION`, `REFUND`, each with its own currency, frozen rate and base mirror |
| `TenantAccount` / `TenantLedgerEntry` | only what a **rent-arrears** deduction settles: the tenant's receivable |

The bank of record for a deposit is the lease, not the tenant: a deposit is held
per tenancy, and it is returned when the tenancy ends. `SecurityDepositTransaction`
is therefore the deposit's own sub-ledger, and the deposit page is its statement.

## What each event posts

| event | ledger | why |
| --- | --- | --- |
| lease created with a deposit | *nothing* | a promise is not a transaction. The obligation is visible as `NOT_PAID → PARTIAL → HELD` on the deposit page |
| `RECEIVED` | **Dr** the cash/bank account · **Cr** `2000 Security Deposit Liability` | cash up, liability up |
| `DEDUCTION` for `RENT_ARREARS` | **Dr** `2000` · **Cr** `1100 Accounts Receivable`, tenant on both lines | the rent was already billed as income, so keeping the deposit settles a receivable — it earns nothing new |
| `DEDUCTION` for `DAMAGE` or `OTHER` | **Dr** `2000` · **Cr** `4050 Security Deposit Forfeited` | income that has never been recognised before, so it is recognised now |
| `REFUND` | **Dr** `2000` · **Cr** the cash/bank account | the liability is discharged |
| void | the original journal is marked `VOIDED` and an equal-and-opposite entry is posted | the ledger shows what was corrected, not just that something changed |

Only `RECEIVED` and `REFUND` name an account, and it must be an **asset**
account — money cannot be received into a liability. Omitting it means `1000
Cash`. `DEDUCTION` moves no cash of its own, so it names none.

The rent-arrears deduction also credits the tenant's ledger, because the sub-ledger
has to move with the control account it reconciles against. That is what makes the
ledger refuse a deduction larger than the tenant actually owes
(`TENANT_BALANCE_NEGATIVE`).

## Currencies

`Lease.securityDeposit` is quoted in the lease's currency; every transaction is
stored in base as well. The summary converts the quoted deposit into base before
comparing anything, at the rate in force on the reference date — the latest
posted movement, or the lease's start date when there are none.

Comparing the two currencies directly is what made a 500 USD deposit read as a
500 AFN requirement and refuse the first real receipt as an overpayment
(`DEPOSIT_OVERPAYMENT`) while a token 1 USD was accepted and reported as "436
still due". A lease in the reporting currency is unaffected: its rate is 1.

When a lease's currency has no rate at all, the summary says so (`rateMissing`,
with the quoted figure and `leaseCurrency` alongside) rather than adding dollars
to afghanis. A lease that merely started before the earliest rate exists uses
that earliest rate: the best information there is.

## Guards

| code | when |
| --- | --- |
| `DEPOSIT_OVERPAYMENT` | a receipt would take what is held past what was agreed |
| `DEDUCTION_EXCEEDS_BALANCE` / `REFUND_EXCEEDS_BALANCE` | keeping or returning more than is held |
| `DEDUCTION_REASON_REQUIRED` | a deduction without a reason, because the reason decides the account |
| `TENANT_BALANCE_NEGATIVE` | a rent-arrears deduction larger than the tenant owes |
| `DEPOSIT_ALREADY_USED` | voiding a receipt the deposit has already spent — void the movements that used it first |
| `DEPOSIT_ACCOUNT_NOT_FOUND` / `DEPOSIT_ACCOUNT_NOT_ASSET` | an account that cannot hold money |

## The audit rule

`npm run check:currency` reconciles, per organization, the deposits recorded as
held against the balance of account `2000`:

```
deposits held (1000) do not match the 2000 liability account (0)
```

That rule is the point. The deposit ledger could stop posting entirely — which
is exactly what it used to do — and nothing else in the system noticed, because
a deposit touched no report the accounting pages read.

## Known gaps

Two, both deliberate and both written down rather than half-done:

1. **A rent-arrears deduction does not allocate against individual invoice
   items.** It credits `1100` and the tenant's sub-ledger (which stay in step
   with each other), but the invoice keeps its own `paidAmount`, which is summed
   from `PaymentAllocation` rows — and an allocation belongs to a `Payment`,
   while `createPayment` only accepts an asset account as the money's source. A
   deposit-funded settlement therefore needs the payments module to accept a
   liability-funded receipt before it can settle invoices item by item.
2. **A refund is priced at its own date's rate.** The tenant still receives the
   same foreign amount, but if the rate has moved since the deposit was received,
   the base figure released differs from the base it was booked at. The
   difference belongs in `4900 Foreign Exchange Difference` as its own entry; it
   is not posted automatically yet.
