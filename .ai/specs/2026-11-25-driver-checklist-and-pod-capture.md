# Driver checklist templates and POD capture

**Status:** Implemented (2026-11-25)
**Module:** `freight_operations` (+ the platform `attachments` service)
**Related:** [`2026-11-22-driver-pwa.md`](./2026-11-22-driver-pwa.md), [`2026-11-21-freight-delivery-notes.md`](./2026-11-21-freight-delivery-notes.md), [`../plans/2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md)

## TLDR

Staff define ordered checklist templates; one active template can be the tenant/organization
default. When a default template exists, the driver workspace shows it in the deliver dialog and
the order/trip deliver command refuses delivery until every required item is checked and every
attachment-required item carries an uploaded file. The driver can also capture a POD photo or
document and a receiver signature; the deliver command stores the attachment ids, writes a
snapshotted checklist run, and emits a lifecycle event. Staff see the run and the proof documents
on the order, trip and delivery-note detail pages.

## Problem

The driver PWA recorded only a free-text POD reference. There was no way to enforce a delivery
checklist, no proof photo/signature capture, and the delivery-note POD/POP document columns had no
UI to populate them. LeanDispatcher parity calls for checklist templates with required attachments
per item and proof-of-delivery capture from the road.

## Solution

### Checklist templates and runs

- `FreightChecklistTemplate` stores an ordered JSONB item list
  (`key`, `label`, `description`, `required`, `requiresAttachment`) plus `isActive` and
  `isDefault`.
- Exactly one active default template is resolved per tenant/organization (`isDefault` and
  `isActive`, newest `updatedAt` first). Duplicate defaults are tolerated; the admin command
  clears other defaults when one is marked default.
- `FreightChecklistRun` is written inside the order/trip deliver transaction. It stores the
  template snapshot, normalized answers, attachment ids, the driver id and `completedAt`, so later
  template edits never rewrite history.
- A checklist is **mandatory for driver deliveries when a default template exists**. Staff order
  and trip deliver routes keep their previous behaviour; the driver actions route sets an internal
  `enforceChecklist` flag. A driver-supplied `templateId` that differs from the active default is
  rejected, so a driver cannot choose an easier template.

### POD/POP capture

- The driver deliver dialog accepts a POD reference, a photo/document and a canvas signature.
  `pod_document_id` carries the photo/document; the new `pod_signature_document_id` carries the
  signature PNG. A reference, document or signature is enough (the previous reference-only rule
  is relaxed).
- The `requirePodForBilling` gate and `orders.complete` / `trips.deliver` POD gates include the
  signature id.
- Staff delivery-note deliver dialogs upload POD and POP documents through the existing
  `/api/attachments` API; the delivery note detail page links the stored documents.

### Attachments

- Driver uploads use a freight-owned route (`POST /api/freight_operations/driver/attachments`)
  because a driver role holds only `freight.driver_app` and cannot call `/api/attachments`
  (`attachments.manage`). The route resolves the driver from the session, verifies the order/trip
  assignment, and calls the DI `attachmentService.readUploadForm` + `createScoped` with the full
  tenant/organization scope, the `privateAttachments` partition, and an image/PDF allowlist.
- The deliver commands verify attachment ownership with
  `attachmentTargetAccessService.canAccessLinkedTarget` (metadata-only; scope + owner check).
  No file bytes are read in the command and no cross-module ORM relation is created.
- Attachments are not exposed on the public delivery-note projection.

## Data models

| Entity | Table | Purpose |
|---|---|---|
| `FreightChecklistTemplate` | `freight_checklist_templates` | Ordered items, active/default flags, soft delete |
| `FreightChecklistRun` | `freight_checklist_runs` | Template snapshot + answers + attachments per order/trip |
| `FreightOrder` / `FreightTrip` | existing tables | New nullable `pod_signature_document_id` |

Both new tables carry `tenant_id`, `organization_id`, `created_by`, `created_at`, `updated_at`,
`deleted_at`. Partial unique indexes cover the template name and one run per order and per trip
(where `deleted_at is null`). The run table has a check constraint requiring exactly one of
`freight_order_id` / `freight_trip_id`.

## API contracts

| Method/path | Feature | Notes |
|---|---|---|
| `GET /api/freight_operations/checklist-templates` | `freight.read` | List with items and `itemCount` |
| `POST/PUT/DELETE /api/freight_operations/checklist-templates` | `freight.checklist_templates.manage` | CRUD commands, optimistic locking on update/delete |
| `GET /api/freight_operations/checklist-runs?orderId=…` or `?tripId=…` | `freight.read` | Staff evidence read |
| `POST /api/freight_operations/driver/attachments` | `freight.driver_app` | Multipart `file`, `targetKind`, `targetId`; driver ownership enforced |
| `GET/POST /api/freight_operations/driver/work`, `/driver/actions` | `freight.driver_app` | Work now returns the default `checklist`; deliver accepts `podDocumentId`, `podSignatureDocumentId`, `checklist` |
| `POST /api/freight_operations/orders|trips/deliver` | existing features | Additive optional `podSignatureDocumentId`, `checklist`, `enforceChecklist` |
| `POST /api/freight_operations/delivery-notes/deliver` | `freight.delivery_notes.manage` | Existing document/reference contract, now populated by the UI |

## Events and ACL

- Events: `freight_operations.checklist_template.created|updated|deleted`,
  `freight_operations.checklist_run.completed`.
- ACL: `freight.checklist_templates.manage` (depends on `freight.read`). Admin/superadmin already
  hold `freight.*`; tenants with explicit role feature lists need
  `yarn mercato auth sync-role-acls`.

## UI

- `/backend/freight/checklist-templates` list/create/edit (`CrudForm` with a custom ordered-items
  editor; optimistic locking is automatic from `updatedAt`).
- Driver workspace deliver dialog: checklist checkboxes, per-item file upload, POD photo/document
  capture, signature pad, optional reference.
- Staff evidence: a checklist-run section on order/trip detail, POD/signature links on the POD
  cards, POD/POP document links on the delivery-note detail, and document uploads in the
  delivery-note deliver dialog.
- Six-locale i18n (Arabic authored); no hard-coded user-facing strings.

## Migration and backward compatibility

- Additive tables and nullable columns only; no renames, narrowing or removals.
- The driver deliver schema is relaxed (POD reference becomes optional when a document or
  signature is present); existing callers that send a reference keep working.
- Staff order/trip deliver routes remain checklist-free unless a checklist is supplied.
- The public delivery-note projection is unchanged.
- Migration `Migration20261125003528_freight_operations` plus the module snapshot.

## Integration coverage

`TC-FREIGHT-021-checklist-and-pod-capture` covers: template creation, the driver work payload,
refusal without a checklist/incomplete checklist/missing attachment, driver attachment upload,
successful delivery with a signature-only POD, the persisted order signature and checklist run,
and a staff delivery note delivered with an uploaded POD document.

## Risks and impact

| Risk | Severity | Mitigation |
|---|---|---|
| A driver references another record's attachment | High | Driver upload verifies assignment; deliver validates ownership through the attachments target-access service |
| Drivers gain broad attachment access | High | The freight route is scoped to `freight.driver_app` and the private partition; drivers cannot call `/api/attachments` |
| A failed delivery leaves a checklist run | Medium | The run is written in the same transaction as the status change |
| Phone photos exceed limits | Medium | 10 MB client cap and the platform multipart limit with a 413 message |
| Orphaned uploads after a cancelled dialog | Low | Accepted for the pilot; owner-linked attachments do not affect delivery state |
| Default template blocks staff delivery | Low | Enforcement is driver-only; staff routes remain unchanged |
| Public share leaks proof documents | High | The public projection stays a strict whitelist; no attachment ids/URLs added |

## Final compliance report

- Tenant and organization scope on every query, command and attachment upload; driver ownership is
  checked per record.
- No cross-module ORM relations; attachments are reached through the platform service and the
  target-access service.
- All writes go through commands; the checklist run shares the deliver transaction and optimistic
  lock.
- New ACL feature is additive and covered by the existing `freight.*` admin wildcard.
- Six-locale i18n with authored Arabic; no hard-coded user-facing strings.
- Additive migration; `yarn db:generate` produced only the freight migration.
- Integration coverage ships in the same change (`TC-FREIGHT-021`).

## Changelog

- **2026-11-25** — Initial implementation: checklist templates and runs, driver checklist
  enforcement, driver attachment upload, POD photo/document and signature capture, staff proof
  views, six-locale copy, `TC-FREIGHT-021`.
- **2026-11-25 (validation)** — `yarn generate`, `yarn db:generate` (only the freight migration),
  `yarn typecheck`, `yarn lint` (0 errors), `yarn i18n:check-sync`, `yarn build:packages`,
  `yarn build:app` and the full app unit suite (1,261 passed) are green. The full freight
  integration suite passed 21/21, including `TC-FREIGHT-021` (4.9 s) and the TC-FREIGHT-010/013/019
  regressions.
