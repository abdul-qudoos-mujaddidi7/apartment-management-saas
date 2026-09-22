# Payment accounting verification

Run the migration and regenerate Prisma before exercising these examples:

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
```

## Create a payment with allocations

```http
POST /api/payments
Content-Type: application/json

{
  "tenantId": "tenant-id",
  "leaseId": "lease-id",
  "paymentDate": "2026-09-14",
  "receiveAccountId": "cash-account-id",
  "paymentMethod": "CASH",
  "amount": 10000,
  "reference": "RCPT-001",
  "notes": null,
  "allocations": [
    { "invoiceId": "invoice-id", "amount": 10000 }
  ]
}
```

Expected accounting journal:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Cash (1000) | 10,000.00 | |
| Accounts Receivable (1100) | | 10,000.00 |

Expected invoice result: `paidAmount` increases by 10,000.00 and status becomes
`PARTIALLY_PAID` or `PAID` based on its total.

## Overpayment

For a 12,000.00 payment allocated 10,000.00 to outstanding invoices, verify:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Cash (1000) | 12,000.00 | |
| Accounts Receivable (1100) | | 10,000.00 |
| Tenant Advances (2100) | | 2,000.00 |

The invoice balance cannot become negative; the payment response reports
`unallocatedAmount: 2000`.

## Void a payment

```http
POST /api/payments/payment-id/void
Content-Type: application/json

{ "voidReason": "Incorrect receipt amount" }
```

Verify the payment is `VOIDED`, allocations have `voidedAt`, the original journal
is `VOIDED`, a `PAYMENT_VOID` journal has the debit/credit values reversed, and
each affected invoice has recalculated `paidAmount`, balance, and status.

## Invoice posting

Create an invoice containing rent 15,000.00, electricity 1,200.00, and water
500.00. Verify its `INVOICE` journal is balanced:

| Account | Debit | Credit |
| --- | ---: | ---: |
| Accounts Receivable (1100), with tenant ID | 16,700.00 | |
| Rent Income (4000) | | 15,000.00 |
| Electricity Income (4010) | | 1,200.00 |
| Water Income (4020) | | 500.00 |

The invoice service owns totals; API-provided totals and paid amounts are never accepted.
