# Guarantors

Guarantors belong to an organization and are assigned to leases. A tenant has no direct guarantor relationship. A guarantor can guarantee multiple leases; leases created before this feature retain a null guarantor assignment.

Tenants and Guarantors share the Tenants navigation item, with topbar tabs following the Meters / Meter Readings pattern. The Guarantors tab is visible with `GUARANTOR_VIEW` permission. The Guarantors page supports search, creation, viewing, editing and soft deletion. Its document column opens an uploaded guarantor paper (a JPEG, PNG or WebP scan/photo, up to 5 MB). The same form is available from the optional lease selector. Saving in that nested modal selects the new guarantor while keeping the lease draft mounted. Searching uses the server and retains the selected guarantor even if it is outside the results.

Assigned guarantors appear in lease details, contract previews, browser prints and downloaded PDFs, with name, phone, national ID, address and a signature space. English, Dari and Pashto use the existing localization dictionaries and document direction rules. Contract paper remains A4.

Click a guarantor's name or the Details action in the table to open `/guarantors/:id`. The profile follows the tenant profile layout, showing identity/contact information, notes, the uploaded paper, registration date, and total/active/draft/closed lease counts. Users with `LEASE_VIEW` can also browse paginated guaranteed leases and open their tenant profiles, lease details and contracts. Users with `GUARANTOR_MANAGE` can edit the guarantor from the profile.

## Deployment

From the repository root, with `backend/.env` configured for the target MySQL database:

```powershell
cd backend
npx.cmd prisma migrate deploy
npx.cmd prisma generate
node scripts/seed-guarantor-permissions.js --apply
```

Restart the backend using the installation's normal process manager, then rebuild/deploy the frontend using its existing deployment workflow:

```powershell
cd ../frontend
npm.cmd run build
```

On shells other than Windows PowerShell, use `npx` and `npm` in place of `npx.cmd` and `npm.cmd`.

The migration `20261006000000_add_guarantors` adds one table, one nullable column to Lease, indexes and foreign keys. It contains no data deletion, table reset or changes to existing tenant columns. `migrate deploy` applies all pending migrations in order; check the installation's pending migrations before deployment. The migration was created and compared against Prisma's schema diff; it was not applied to the workspace database during implementation.

The permission script only updates Permission and RolePermission records. ADMIN receives `GUARANTOR_VIEW` and `GUARANTOR_MANAGE`; MANAGER receives `GUARANTOR_VIEW`. Custom roles need the relevant permissions granted using the installation's existing role administration process. The regular seed includes the new permissions for fresh installations. Do not run the full demo seed to upgrade an existing installation, as it also updates the demo administrator.

## Backend behavior

- `GET /api/guarantors`: scoped search and pagination (`page`, `pageSize`, `search`).
- `GET /api/guarantors/:id`: view a live guarantor.
- `GET /api/guarantors/:id/profile`: scoped identity, lease counts and paginated guaranteed leases (`page`, `pageSize`). Lease details require `LEASE_VIEW` in addition to `GUARANTOR_VIEW`.
- `POST /api/guarantors`: create with firstName, lastName and phone required; alternatePhone, nationalId, address, notes and documentUrl optional.
- `PUT /api/guarantors/:id`: partial update.
- `DELETE /api/guarantors/:id`: soft-delete, returning 409 `GUARANTOR_IN_USE` when any non-deleted lease references it, regardless of lease status.
- Lease create/update accepts optional `guarantorId`. Null or a blank string clears it; omission on update preserves the assignment.
- `POST /api/uploads?kind=guarantor-document` uploads a paper into the authenticated organization's directory. Guarantor document paths are validated for organization ownership and file existence before saving. Referenced papers cannot be deleted through the upload API.

Guarantor reads require `GUARANTOR_VIEW`; writes and paper uploads require `GUARANTOR_MANAGE`. Guarantor document downloads require authentication, view permission and matching organization ownership. Existing tenant upload behavior is preserved. Organization IDs come from the authenticated user and are never accepted from guarantor request bodies. Assignment rejects foreign and deleted guarantors. Assignment and deletion take the same MySQL row lock within Prisma transactions to avoid an assignment/deletion race.

## Verification

```powershell
cd backend
npx.cmd prisma validate
npx.cmd prisma generate
npm.cmd test
cd ../frontend
npm.cmd run build
npm.cmd test
npm.cmd run test:workflow-ui
```

During implementation, backend checks covered validation bounds, empty optional fields, ignored client organization IDs, scoped CRUD, authentication and permissions, assignment rejection, clearing/omitting assignments, deletion protection, and protected document access including encoded path bypass attempts. HTTP and service tests used mocked Prisma calls and did not write to the application database. The added guarantor tests were subsequently removed at the user's request; the project's existing tests remain.

Frontend checks performed during implementation included production compilation, translated PDF label validation, escaped guarantor text, compatibility with contracts that have no guarantor, and headless browser regressions for nested creation, lease draft preservation, automatic selection, clearing/changing, editing the current assignment, server search, RTL/LTR and A4 PDFs in all three languages. The guarantor additions to the existing frontend tests were subsequently removed at the user's request.

The build retains existing warnings for an unused SecurityDeposits CSS selector, Pagination's unused summary property, ImageUpload's drag/drop accessibility role, and bundle size. Browser execution and Prisma generation required execution outside the Windows sandbox; both completed without changing the project stack.

## Changed files

Database and permissions:

- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20261006000000_add_guarantors/migration.sql`
- `backend/prisma/seed.js`
- `backend/scripts/seed-guarantor-permissions.js`

APIs, upload handling and document audit:

- `backend/src/app.js`
- `backend/src/middleware/guarantorDocuments.js`
- `backend/src/modules/guarantors/guarantor.validation.js`
- `backend/src/modules/guarantors/guarantor.service.js`
- `backend/src/modules/guarantors/guarantor.controller.js`
- `backend/src/modules/guarantors/guarantor.routes.js`
- `backend/src/modules/leases/lease.validation.js`
- `backend/src/modules/leases/lease.service.js`
- `backend/src/lib/uploads.js`
- `backend/src/modules/uploads/upload.controller.js`
- `backend/src/modules/uploads/upload.routes.js`
- `backend/scripts/check-document-files.js`

Contracts:

- `backend/src/modules/lease-contracts/lease-contract.service.js`
- `backend/src/modules/lease-contracts/lease-contract.document.js`
- `backend/src/modules/lease-contracts/lease-contract.validation.js`
- `backend/src/modules/lease-contracts/contract-document.css`
- `frontend/src/pages/LeaseContract.svelte`
- `frontend/src/utils/contractDocumentLabels.js`

Frontend UI, routing and localization:

- `frontend/src/services/guarantors.js`
- `frontend/src/components/guarantors/GuarantorFormModal.svelte`
- `frontend/src/components/guarantors/GuarantorSelect.svelte`
- `frontend/src/pages/Guarantors.svelte`
- `frontend/src/pages/GuarantorProfile.svelte`
- `frontend/src/pages/Leases.svelte`
- `frontend/src/layouts/AuthenticatedApp.svelte`
- `frontend/src/components/Sidebar.svelte`
- `frontend/src/components/layout/Topbar.svelte`
- `frontend/src/navigation.js`
- `frontend/src/utils/routeMetadata.js`
- `frontend/src/i18n/en.js`
- `frontend/src/i18n/fa.js`
- `frontend/src/i18n/ps.js`

Documentation:

- `docs/guarantors.md`
