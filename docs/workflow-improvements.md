# Popup, lease reminder and electricity workflows

## Setup

An additive migration is included at `backend/prisma/migrations/20261003000000_utility_workflow/migration.sql`. Apply it before starting the updated backend:

```powershell
cd backend
npm.cmd exec -- prisma migrate deploy
npm.cmd exec -- prisma generate
```

Stop the running backend before generating the client on Windows if its Prisma engine DLL is locked. Restart the backend after migration and generation. The migration adds reading ownership, usage start date, currency, event kind and reset baseline, plus a nullable lease foreign key. It backfills currency from the organization and lease ownership only from an existing invoice. It does not guess the tenant responsible for unbilled historical usage. No existing money values, invoices or payments are rewritten.

Set `BUSINESS_TIMEZONE` to an IANA timezone such as `Asia/Kabul`; `Asia/Kabul` is the default. This config controls the reminder's current business date. Stored lease dates remain date-only values represented at UTC midnight.

The migration seeds `LEASE_VIEW`, `LEASE_MANAGE`, `UTILITY_VIEW`, `UTILITY_MANAGE`, `INVOICE_VIEW` and `INVOICE_MANAGE` and grants them to existing administrator/owner roles. Other roles need explicit grants through the existing `RolePermission` model. Utility operators selecting a lease need `LEASE_VIEW` in addition to their utility permission; issuing bills also requires `INVOICE_MANAGE`. Deleted roles, permissions and grants do not authorize access.

## Popups and numeric inputs

Shared modals, including Receive Payment, close from their outer empty area, Escape or close button. Modal forms prompt before discarding edits, including footer cancellation and date-picker changes. Busy forms stay open. The innermost popup owns Escape and modal focus returns to the previous control. Dropdowns keep inside clicks open and close from an outside pointer press or Escape.

Numeric inputs normalize leading padding before Svelte bindings read their values. The default zero is selected on focus. Persian and Arabic digits and their decimal separator are supported for typing and paste. Decimal zero prefixes and fractional precision are preserved. Text and telephone fields keep identifiers such as phone numbers, contract numbers and meter numbers intact.

## Lease reminders

The reminder window starts one **Gregorian calendar month** before the stored expiry date, clamping the day to the last day of a shorter month. Examples: March 31 → February 28 (February 29 in a leap year); May 31 → April 30. It includes the expiry date itself. The interface continues displaying dates through its existing Shamsi formatter.

The notification list is derived from current active, non-deleted leases belonging to the authenticated organization. Each notification uses `lease:<leaseId>:<expiryDate>` as its stable identity. This gives one entry per lease and expiry, catches up after the app was closed, and immediately removes obsolete reminders on renewal, end-date edits, termination or deletion when refreshed. The bell refreshes every minute, on focus, after lease changes and when opened. No scheduler or external email/SMS service is required. Both the bell and the dashboard's “Leases Expiring Soon” section open the selected lease's details.

## Electricity and existing utilities

The existing Meter, MeterReading, InvoiceItem, Invoice, PaymentAllocation, currency and financial ledger models are reused. Electricity meters still belong to one apartment. Water and gas follow the same reading workflow. No shared-meter allocation model was found; allocation among apartments would require a separately agreed business rule.

1. Install/assign a meter with its number, status, installation date and initial reading. New electricity meters require an initial reading, including an explicit zero.
2. Enter readings from the existing Meters quick-reading modal or Meter Readings page. Both use the same reusable terms component: usage start, responsible lease, rate, currency, reading purpose and charge preview. Reading history remains in the existing pages.
3. Monthly readings keep the existing **Shamsi-month** unique billing key. Handover and reset events have no monthly key, so they can split usage inside a month. Each reading can still link to only one invoice item.
4. Select the lease covering the entire usage interval. The previous reading date or installation date is the interval's authoritative start. A succeeding lease's start date is a hard boundary, even if the prior terminated contract still has its originally agreed end date. A reading spanning tenants is rejected.
5. At a tenant change, record the outgoing tenant's **Handover** reading. The incoming tenant's next charge starts at that exact reading. When the apartment was vacant, a **Move-in baseline** on the incoming lease's start date records a non-billable baseline. It cannot erase usage owed by an outgoing tenant. One shared handover reading is sufficient when move-out and move-in happen on the same date; the existing meter/date unique constraint is preserved.
6. A **Reset** records the final old-register reading, new register baseline and reason. Old-register usage is calculated normally; subsequent usage starts from the new baseline. For a physical replacement with another meter number, close the old meter's usage, mark it inactive/replaced and create the new meter with its initial reading. Meters with history cannot change their number, assignment, unit, type or initial baseline, or be deleted.
7. Review a saved charge and choose **Issue bill**. The existing invoice pipeline copies its saved readings, rate, amount and currency and freezes the invoice's exchange rate. Settle it using existing Payments/Receive Payment. Paid amounts use allocations in the charge's currency and exclude voided payments. The reading list shows paid and outstanding amounts.

Consumption and price calculations use Prisma Decimal, with reading precision of three places, rate precision of four places and monetary rounding to two places. Decreasing readings are rejected. Meter locks and read-committed write transactions serialize sequence changes with billing; existing unique monthly keys and unique invoice-item references provide database duplicate guards. Billed readings cannot be edited/deleted or restated by historical changes. Cancelling an invoice follows the existing financial reversal rules and retains its issued monetary snapshot.

For older unbilled readings, verify and set their responsible lease and usage start before issuing a bill. Existing billed rows keep their financial history. Terminated contracts should record their actual occupancy end date; successor start dates and explicit handover readings provide the tenant-change boundary. Vacancy consumption is retained in meter baselines and is not automatically charged to an incoming tenant.

## Printing invoices and meter readings

Choose **Print / Save PDF** from an invoice's row menu or its details, or from a meter reading's row menu. The shared preview shows an A4 document with organization name, tenant, contract, location, status and saved financial figures. Use its print button to open the browser's print dialog and select a printer or Save as PDF.

The reusable `DocumentPreview` and `FinancialDocument` components share typography, paper layout and totals. Printing copies the document into an isolated iframe, loads the self-hosted fonts and waits for them before printing. Application menus, modal controls and contract-specific print styles are excluded. English uses LTR; Dari and Pashto use RTL and localized numeric digits. Text references retain their original leading zeros. Each invoice line keeps its saved currency; totals use the invoice currency. Meter prices retain four decimal places, with charges rounded to two. Handover, reset and move-in purposes are identified; move-in baselines remain non-billable.

Print previews fetch the saved record using the existing permission-protected, organization-scoped detail endpoints. Printing does not create an invoice, change a payment or require a new migration. Browser checks verify isolation, fonts, precision, currencies, safe text rendering, language switching and a single-page A4 PDF for a representative meter reading.

## Verification commands

```powershell
cd backend
npm.cmd test
npm.cmd exec -- prisma validate
cd ../frontend
npm.cmd test
npm.cmd run build
npm.cmd run test:workflow-ui
```

The browser checks use installed Chrome or Edge in headless mode; set `TEST_BROWSER` to another Chromium executable if needed. They mount real Svelte components against a local Vite test harness. Tests cover outside/inside clicks, Escape, close buttons, discard prompts, nested date-picker Escape, dropdown dismissal, numeric normalization, identifier preservation and English/Dari/Pashto direction. Backend tests cover month-end reminders, timezone boundaries, renewal/termination, permission checks, decimal charges, historical lease ownership, handover, resets, move-in baselines, immutable billed readings, duplicate charges and frozen multi-currency invoice values.

Database deployment and concurrent integration checks against a migrated MySQL database are separate from these unit/service and browser checks. The migration has not been applied by this implementation session.
