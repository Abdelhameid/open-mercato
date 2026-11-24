# LeanDispatcher feature parity — gap matrix and program plan

**Created:** 2026-11-21
**Status:** Active — Phases 1–5 core implemented; Phase 6 largely implemented (credit/debit notes, product links, Gulf currencies); provider-gated items pending
**Source of truth for the comparison:** LeanDispatcher marketing site
(`https://leandispatcher.ertikaz-tech.com/`, feature copy extracted from its production JS
bundle), its App Store listing, and a read-only audit of this repository on 2026-11-21.

## TLDR

Our freight vertical already covers most of LeanDispatcher's commercial and financial
backbone: order lifecycle, contracts and rates, trips, customer-approved abstracts,
invoicing, payments, fleet maintenance, ZATCA e-invoicing, Arabic RTL and RBAC. The gaps are
the **dispatch-product layer**: delivery notes/waybills, the driver workflow, live tracking
and route optimization, customer self-service order intake, automated customer messaging
and driver ratings.

Phase 1 (this change) closes the most visible document gap with a first-class delivery note
and a manual Bayan Naql reference. The remaining phases are ordered below; several depend on
external providers (TGA/Bayan, SMS, maps, telematics) and are explicitly gated.

## How to read the matrix

- **Shipped** — present in this repository and usable today.
- **Partial** — the data/API exists but the product loop or UI is incomplete.
- **Missing** — no implementation found.
- **External gate** — the code can be built, but activation needs a provider account,
  credentials or an approval we do not have.

## Feature matrix

### Orders and dispatch

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| Single order creation with cargo, route, dates, price | **Shipped** | `freight_operations` `FreightOrder` + create/edit form |
| Order statuses: confirm → assign → dispatch → deliver → complete → invoice | **Shipped** | `commands/orders.ts` |
| Assign driver + vehicle, availability and overlap checks | **Shipped** | `orders.assign`, `lib/assignment.ts` |
| Bulk order creation from Excel/CSV | **Shipped (Phase 2)** | Customer-scoped dry-run/commit importer |
| Customer-created orders (“External Orders” review queue) | **Shipped (Phase 2)** | Portal submit + `/backend/freight/external-orders` review queue |
| Trips auto-created from orders | **Shipped (Phase 2b)** | Confirming an order auto-creates a linked trip with assignment mirroring; a setting keeps the manual workflow |
| Dispatching to own or contracted fleet | **Partial** | Own fleet assignment exists; subcontractor/carrier master does not |
| Long-term contracts with negotiated per-route rates | **Shipped** | `FreightContract` + `FreightContractRoute` |
| Vehicle types and plates | **Partial** | Plates are first-class and unique; vehicle type is free text |
| Bulk driver/vehicle upload | **Shipped (Phase 6)** | CSV/XLSX dry-run/commit importer on both transport list screens |
| Products with weight/package units | **Partial (Phase 6)** | Freight orders link a catalog product + package count and copy the product onto the invoice line; catalog package hierarchy is still deferred |
| Order sealing | **Partial** | Seal number captured on the delivery note; no order/trip seal lifecycle |
| Late/completed trips visually flagged | **Partial** | Statuses exist; no lateness calculation or colour rule |
| Dashboard totals (orders, trips, vehicles, waybills) | **Partial** | Freight/transport/fleet dashboards exist; no waybill KPI yet |

### Delivery notes and compliance

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| Delivery note / transport document generated from an order or trip | **Shipped (Phase 1)** | `FreightDeliveryNote`, state machine, API, list/detail, print layout |
| Numbered document with seller, consignee, cargo, lane, driver and vehicle snapshots | **Shipped (Phase 1)** | Snapshots frozen at issue |
| POD/POP reference on the document | **Shipped (Phase 1)** | References and attachment ids; upload UI still missing |
| Bayan Naql waybill number, status and link | **Partial (Phase 1)** | Manual recording; no TGA API submission |
| Direct Bayan/TGA API integration | **External gate** | Needs TGA approval and credentials; adapter seam is ready |
| TGA/Bayan logos on documents | **Intentionally not used** | No authorisation to reproduce official marks |
| Print / hand-over receipt | **Shipped (Phase 1)** | Browser print layout with signature lines |
| Public share link for a document | **Shipped (Phase 5)** | `/track/note/<token>` public delivery-note page + staff "Copy share link" action; token minted on demand, limited projection |

### Driver workflow

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| Dedicated driver app (Android/iOS) | **Partial (Phase 3)** | Staff-linked driver PWA at `/backend/driver`; no native shell/offline |
| Driver sees assigned deliveries and navigates to pickup/drop-off | **Shipped (Phase 3)** | Assigned orders/trips list with Google Maps and Waze deep links for pickup/drop-off and origin/destination |
| Driver changes order status from the road | **Shipped (Phase 3)** | Driver start/deliver actions with ownership checks |
| Driver checklist with required attachments | **Missing** | No checklist model |
| POD/POP photo, signature, voice note or video capture | **Partial** | Fields accept attachment ids; no capture/upload flow |
| Rest breaks / hours of service | **Partial (Phase 3)** | Rest break start/end records; HOS rules not modelled |
| SOS | **Shipped (Phase 3)** | Driver alert with optional geolocation; dispatch notification wiring remains |
| Driver–dispatcher chat and calls | **Partial** | WhatsApp/email hub and call ingestion exist; not wired to freight |
| Driver rating by customer | **Shipped (Phase 5)** | `FreightDriverRating` + portal rate action |

### Tracking and routing

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| Live fleet map (“Eagle Eye”) | **Partial (Phase 4)** | Leaflet board at `/backend/transport/tracking` over latest positions |
| GPS/telematics ingestion, geofencing | **Partial (Phase 4)** | Position ingestion + store; geofences/retention remain |
| Route optimization and ETAs | **Partial (Phase 4)** | Local Haversine + optional OSRM estimate API; multi-stop optimization and geocoding remain |
| Predictive operational alerts | **Missing** | Dashboards only |
| Real-time status visibility for staff | **Partial** | SSE/DOM event bridge exists; freight events are not marked for broadcast |

### Customer experience

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| Customer portal to raise and schedule orders | **Shipped (Phase 2)** | Portal submit endpoint + External Orders queue |
| Customer order approval queue (“External Orders”) | **Shipped (Phase 2)** | Submitted → approved/rejected review queue at `/backend/freight/external-orders` |
| Customer tracking link | **Shipped (Phase 5)** | `/track/<token>` public status page + copy action |
| Customer views contracts and invoices | **Shipped (Phase 5)** | `/portal/freight/contracts` (contracts + negotiated route rates) and `/portal/freight/invoices` (sales invoices reached through the order); both RBAC-gated by `portal.freight.view` |
| Customer approves/disputes trip abstracts | **Shipped** | `api/portal/freight/abstracts/*` + portal pages |
| Automated customer SMS/WhatsApp on delivery time, bill, waybill | **Partial** | WhatsApp adapter + notifications exist; no freight subscriber, no SMS adapter |
| Instant document sharing via SMS/WhatsApp/link | **Partial (Phase 5)** | Order tracking links ship; public delivery-note links and messaging remain |
| Driver rating / feedback | **Shipped (Phase 5)** | 1–5 star rating after delivery, portal display |
| Multilingual customer/driver app (AR/EN/UR/HI/ZH) | **Partial** | App serves en/ar; module dictionaries have de/es/ko/pl; no UR/HI/ZH |

### Finance, inventory and platform

| LeanDispatcher capability | Our status | Evidence / gap |
|---|---|---|
| ZATCA e-invoicing (Phase 2 issuance, VAT) | **Shipped** | `saudi_localization` + financial posting; signing/CSID gated |
| Invoices, receipts, credit/debit notes, receipt vouchers | **Shipped (Phase 6)** | Freight credit/debit notes issue and post/reverse in the GL; every freight payment allocates an `RV-` receipt number and prints from `/backend/freight/payments/<id>/receipt` |
| Automatic billing and settlement | **Shipped** | Freight abstracts → sales invoice → payments → AR aging |
| Customer statements | **Shipped** | `financial` AR statements |
| Inventory, warehouses | **Shipped** | Core `wms` (inventory, lots, movements, locations) |
| Purchasing / purchase orders | **Decision (Phase 6)** | Use `financial` AP vendor invoices + expense lines for the pilot; a dedicated PO/procurement module is deferred until three-way matching or stock purchasing is required |
| Sales | **Shipped** | Core `sales` |
| Expenses | **Partial** | AP vendor-invoice expense lines; no expense-claim module |
| Fleet maintenance / fuel / insurance / violations | **Shipped** | `fleet_operations` |
| 11 currencies / multi-currency | **Partial (Phase 6)** | USD/EUR/SAR plus AED, KWD, BHD, OMR and QAR seeded; FX still posts at rate 1 |
| Per-user permissions | **Shipped** | Role + user ACLs, feature wildcards |
| Customisable field labels | **Partial** | Custom fields carry labels; built-in UI labels are not tenant-renamable |
| API integrations with ERPs | **Shipped** | API keys, OpenAPI, webhooks, `data_sync` |
| Secure cloud hosting | **Platform** | Deployment concern, not a module feature |
| Modular build | **Shipped** | Module system |

## Phase plan

### Phase 1 — Delivery notes and Bayan Naql reference (shipped in this change)

- `FreightDeliveryNote` entity + migration + snapshot.
- Create from a confirmed/executed spot order or a freight trip.
- Draft → issued → delivered / cancelled state machine with optimistic locking.
- Seller, driver and vehicle snapshots frozen at issue.
- POD/POP reference and receiver capture.
- Manual Bayan Naql number/status/link recording; cancellation blocked while the external
  waybill is live.
- Numbering prefix setting, ACL feature, events, six-locale i18n, list/detail pages, print
  layout, order and trip detail panels, unit + integration coverage.

### Phase 2 — Order intake parity (shipped 2026-11-21)

1. Bulk order import (CSV/XLSX) with dry-run → commit, mirroring the contract-rate importer.
2. Customer/portal order submission with a staff “External Orders” review queue
   (`submitted` → `approved`/`rejected`), reusing portal auth and RBAC.
3. Auto-create a draft freight trip (and optionally a delivery note) when an order is
   confirmed, with a setting to keep the manual workflow.
4. Publish the missing order fields in the list projection (POD received-by/at, notes,
   requested delivery, invoice number) and enforce the documented POD rule on `complete`.

### Phase 3 — Driver workflow (PWA core shipped 2026-11-22)

1. Driver identity: link `transport_drivers` to a staff user or a new driver credentials
   model; decide staff-user vs dedicated driver auth with the product owner.
2. Driver console (mobile-first PWA) or native shell: assigned trips, navigation links,
   status updates, rest breaks, SOS.
3. Checklist templates with required attachments per item.
4. POD/POP capture (photo, signature, document) writing attachment ids.
5. Driver notifications through push (devices + APNS/FCM/Expo already exist).

### Phase 4 — Tracking and routing (core shipped 2026-11-22)

1. Telematics ingestion adapter (provider-agnostic, SSRF-safe webhooks), vehicle positions,
   trip actuals and odometer reconciliation.
2. Operations map board (“Eagle Eye”) over Leaflet, with vehicle/trip filters and last-seen
   state.
3. Geofence and lateness alerts; mark freight events `clientBroadcast` for live refresh.
4. Route optimization/ETA adapter behind a provider interface (Google Routes, OSRM or
   equivalent); keep the provider choice and key external.

### Phase 5 — Customer experience

1. Portal order creation, tracking, contract/invoice views and delivery-note download —
   **shipped**: orders and abstracts (earlier phases), contracts and invoices 2026-11-24.
2. Tokenised public tracking page for customers without a portal account.
3. Automated event-driven customer messages (SMS/WhatsApp) for assignment, dispatch,
   delivery ETA and waybill sharing; requires an SMS provider and template management.
4. Document share links with expiring tokens — **delivery-note share links shipped
   2026-11-24** (`share_token`, staff mint/reuse action, `/track/note/<token>`
   public document, limited projection). Expiring/rotating tokens remain a
   hardening option.
5. Driver rating and customer feedback on delivered orders — shipped 2026-11-22.

### Phase 6 — Remaining parity and polish

1. Freight credit/debit notes — **shipped 2026-11-23**: draft → issued → cancelled state
   machine, sequential `AN-` numbering, per-tenant prefix setting, list/create/edit
   screens, and an event-driven GL posting (credit reduces revenue/VAT/AR; debit
   increases them; cancelling reverses the entry). Posting needs an open
   accounting period on the note's issue date; a cancellation reverses on the
   current date, so the current month must also be open. Receipt vouchers —
   **shipped 2026-11-24**: each freight payment allocates an `RV-` receipt
   number inside the recording transaction and prints from a dedicated receipt
   page.
2. SAR and Gulf currencies — **shipped 2026-11-23**: AED, KWD, BHD, OMR and QAR added
   to the seed (SAR was already present).
3. Purchasing/PO — **decision 2026-11-23**: use AP vendor invoices + expense lines for
   the pilot; a PO/procurement module is deferred until three-way matching or stock
   purchasing is required.
4. Product/package links on freight orders — **shipped 2026-11-23**: a catalog product
   combobox and package count on the order, with the product copied onto the sales
   invoice line. Catalog package hierarchy remains deferred.
5. Bulk driver/vehicle import — **shipped 2026-11-22**.
6. Tenant-renamable built-in labels and additional locales (UR/HI/ZH) — deferred; not
   needed for the Saudi pilot.

## External gates

| Gate | Needed for | Owner |
|---|---|---|
| TGA Bayan API approval, credentials and sandbox | Direct waybill issuance/cancellation | Business/compliance |
| SMS provider account (e.g. Unifonic/Msegat/Twilio) | Automated customer messages | Business + new provider package |
| Maps/routing provider key | Geocoding, ETAs, route optimization | Business |
| Telematics provider selection | Live GPS, geofencing | Business |
| Native app vs PWA decision | Driver mobile surface | Product |
| Local legal confirmation | Any statutory document wording | Counsel |

## Recommendation

The core dispatch loop (intake → trip → delivery note → tracking → rating) is in place, and
Phase 6 is largely closed: credit/debit notes, product/package links, Gulf currencies and
bulk imports, receipt vouchers and the portal contract/invoice views are shipped. The
remaining product work is depth rather than parity: geofencing and predictive alerts
(Phase 4), checklist templates and POD capture (Phase 3), automated customer messages and
expiring document share links (Phase 5), and tenant-renamable labels.
Provider-gated work (TGA Bayan, SMS, maps key, telematics) should start only once the
corresponding business approvals are in hand.

The 2026-11-23 consolidation pass also made HR the single driver/person register, linked the
freight trip to the transport schedule, unified insurance expiry on the policy master and
made the transport odometer register authoritative. See
[`2026-11-23-resource-register-consolidation.md`](../specs/2026-11-23-resource-register-consolidation.md).

## Changelog

- **2026-11-21** — Initial matrix and phase plan; Phase 1 delivery notes implemented.
- **2026-11-21 (later)** — Phase 2 shipped: bulk order import with dry-run/commit, customer
  portal order submission, external-order review queue, order `source`/`submitted_at`.
  Auto-created trips and the POD-on-complete fix remain in Phase 2b. Validation: TC-FREIGHT-011
  and TC-FREIGHT-012 pass; typecheck, lint, i18n sync, unit tests and the app build are green.
- **2026-11-22** — Phase 3 PWA core shipped: staff-linked driver identity, `/backend/driver`
  workspace, start/deliver, rest breaks, SOS, manifest/service worker. Phase 4 core shipped:
  vehicle position ingestion, Leaflet tracking board with late flags, local/OSRM routing
  estimate. TC-FREIGHT-013 and TC-TRANSPORT-014 pass.
- **2026-11-22 (later)** — Phase 2b shipped: optional auto-trip on confirm with assignment
  mirroring, POD gate on completion, delivered-order POD update. Phase 5 core shipped: public
  tracking token/page, driver ratings in the portal. Phase 6 partial: SAR added to the currency
  seed. TC-FREIGHT-015/016/017 cover the new paths.
- **2026-11-22 (validation)** — Final slice verified: TC-FREIGHT-015/016/017 pass; new
  `deliveryNote`/`orderImport`/`documentNumber` and transport `routing` unit suites pass;
  `yarn typecheck`, `yarn lint`, `yarn i18n:check-sync` and `yarn build:app` are green. Lint
  surfaced a conditional `useCallback` in the order-detail tracking-link action, now moved above
  the loading/error early returns.
- **2026-11-22 (Phase 6)** — Bulk driver/vehicle upload shipped: CSV/XLSX dry-run/commit
  importer on the transport drivers and vehicles screens, reusing the entity create schemas and
  commands. The dependency-free spreadsheet reader moved to
  `@open-mercato/shared/lib/browser/spreadsheet` for both modules. Spec:
  `2026-11-22-transport-bulk-import.md`; coverage: TC-TRANSPORT-015 plus new parser unit suites.
- **2026-11-23 (consolidation + Phase 6)** — HR became the single driver/person register
  (`transport_drivers` backfilled and dropped; transport API preserved; transport screen is a
  projection; bulk import writes HR records). The freight trip link to the transport schedule
  is validated, uniquely indexed and status-mirrored. Insurance expiry is owned solely by the
  policy master; odometer readings from rentals/fuel/work orders advance the transport register
  via events; HR exposes the staff `userId` link and leads the nav. Phase 6 shipped freight
  credit/debit notes with GL posting/reversal (`AN-` numbering, list/create/edit screens),
  catalog product + package links on freight orders (copied to the invoice line), and the Gulf
  currencies. Driver navigation deep links (Google Maps/Waze) shipped. Purchasing uses AP
  vendor invoices (decision). Specs:
  `2026-11-23-hr-driver-register-consolidation.md`,
  `2026-11-23-resource-register-consolidation.md`; coverage: TC-HR-009, TC-FREIGHT-018,
  driver-roster/odometer/posting unit suites.
- **2026-11-24 (validation)** — `TC-FREIGHT-018` passes end-to-end: the note
  issues with an `AN-` number, a balanced standard GL entry is posted, cancelling
  marks it cancelled and posts the balanced reversing entry. `TC-RENTAL-001`
  passes after correcting its stale test inputs (two-day window billed as three
  inclusive days; the overlap test now uses a driverless contract). The full app
  unit suite (1,249), typecheck, lint (0 errors), i18n sync, `build:packages` and
  `build:app` are green. Local migrations applied after
  `.mercato/backups/driver-consolidation-before.sql`.
- **2026-11-24 (Phase 5)** — Public delivery-note share links shipped:
  `freight_delivery_notes.share_token`, staff mint/reuse command and "Copy share
  link" row action, unauthenticated `/api/freight_operations/public/delivery-note`
  limited projection, and the print-friendly `/track/note/<token>` page.
  `TC-FREIGHT-019` passes. Spec: `2026-11-24-delivery-note-share-links.md`.
- **2026-11-24 (Phase 6)** — Receipt vouchers shipped: `freight_payments.receipt_number`
  (unique per tenant/org, `RV-` prefix from settings) is allocated inside the payment
  recording transaction and printed from `/backend/freight/payments/<id>/receipt`.
  `TC-FREIGHT-005` asserts the `RV-#####` number.
- **2026-11-24 (Phase 5)** — Portal contract and invoice views shipped:
  `/api/portal/freight/contracts` (active/suspended/terminated contracts with their
  negotiated route rates) and `/api/portal/freight/invoices` (the customer's sales
  invoices, reached through the sales order). Both require `portal.freight.view` and
  appear in the portal nav (orders 61/62); `TC-FREIGHT-020` covers visibility and the
  403 for a role without the feature.
