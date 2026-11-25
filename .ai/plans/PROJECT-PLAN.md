# Saudi ERP — overall project plan

**Status:** Living document — the single source of truth for scope, status, roadmap and decisions
**Updated:** 2026-11-25
**Branch:** `personal/saudi-erp`
**Supersedes for status:** [`2026-10-19-saudi-erp-mvp-execution-plan.md`](./2026-10-19-saudi-erp-mvp-execution-plan.md), [`2026-11-21-leandispatcher-feature-parity.md`](./2026-11-21-leandispatcher-feature-parity.md), [`2026-09-26-app-modules-completion.md`](./2026-09-26-app-modules-completion.md), [`2026-09-26-fleet-hr-handoff.md`](./2026-09-26-fleet-hr-handoff.md)

## One source of truth

| Document | Authoritative for | Must not contain |
|---|---|---|
| **`.ai/plans/PROJECT-PLAN.md` (this file)** | Scope, current status, roadmap, decision log, external gates | Contract detail |
| `.ai/specs/{date}-{title}.md` | Behaviour and contracts of one change: entities, APIs, ACL ids, events, UI paths, migration notes | Cross-project status |
| [`2026-11-21-leandispatcher-feature-parity.md`](./2026-11-21-leandispatcher-feature-parity.md) | Feature-by-feature evidence and gap detail for freight parity | A competing status tracker |
| [`../qa/pilot-readiness.md`](../qa/pilot-readiness.md) | Gate evidence and pilot smoke-flow list | Roadmap |
| `2026-10-19-saudi-erp-mvp-execution-plan.md`, `2026-09-26-*.md` | History: how M0–M5 and the module-completion programme were executed | Current status |

**Rule:** when work ships, update the status tables in **this file** plus that change's spec changelog. No other document keeps a second status tracker. If a detail document disagrees with this file, this file wins for status; the spec wins for behaviour.

## Product scope

**In scope:** the Saudi ERP product built on the `apps/mercato` app — fleet, transport, freight,
financial, HR/payroll, CRM, rentals, student transport and Saudi localization (VAT, ZATCA,
Arabic/RTL), plus the productization needed for a pilot.

**Platform:** upstream `@open-mercato/*` packages are consumed, not owned by this plan. Change
them only when a product requirement cannot be met through the module system.

**Out of scope for the pilot:** a custom CRM/WMS/POS/e-commerce; enterprise-only overlays;
multi-country localization beyond Saudi; a native mobile shell until the PWA decision is made.

## Where the product stands — 2026-11-24

### Shipped pillars

| Pillar | Modules | State | Evidence |
|---|---|---|---|
| Fleet master data and operations | `transport_operations` (vehicles), `fleet_operations` | Shipped | M4.1–M4.3 tracker; `TC-FLEET-OPS-001`; fleet dashboard |
| Transport operations | `transport_operations` | Shipped | Schedules, trips, dispatch/cancel, custody, odometer, bulk driver/vehicle import, live tracking board; `TC-TRANSPORT-002/014/015` |
| Freight operations | `freight_operations` | Shipped through parity Phases 1–6 core | Orders, contracts/rates, trips, abstracts, invoicing, delivery notes, driver PWA, tracking, ratings, portal views, credit/debit notes, receipt vouchers, driver checklist templates and POD photo/signature capture; `TC-FREIGHT-001…021` |
| Financial | `financial`, `saudi_localization` | Shipped | GL, posting bridges, AR, AP + WHT, bank reconciliation, cash/payments, opening balances, ZATCA Phase 2 issuance (signing/CSID gated); `TC-FINANCIAL-003…006`, `TC-SL-FIN-001` |
| HR and payroll | `hr_management` | Shipped | Employees, driver register (single person/licence owner), approvals, leave balances, compensation, payroll, payslips, GOSI/WPS/EOSB, ledger posting; `TC-HR-005…009` |
| CRM | `customers`, `sales` links | Shipped | Leads/pipeline, duplicate check, conversion, WhatsApp channel, telephony → timeline, deal ↔ sales documents, Arabic dictionaries; `TC-CRM-LEAD-001`, `TC-CRM-WA-001`, `TC-SALES-DEAL-001` |
| Adjacent verticals | `vehicle_rentals`, `student_transport` | Shipped | Rental handover/return and extra-km; school transport; sales-bridge invoicing; `TC-RENTAL-001` |
| Productization | app-local modules + template sync | In progress | Packaging decision: stay app-local through the pilot; pilot readiness checklist maintained |

### Verification status

| Gate | Result | Date |
|---|---|---|
| App unit suite | 1,261 passed / 176 suites | 2026-11-25 |
| `yarn typecheck`, `yarn lint`, `yarn i18n:check-sync` | Green (0 lint errors) | 2026-11-25 |
| `yarn build:packages`, `yarn build:app` | Green | 2026-11-25 |
| Targeted integration set (M1–M4) | 12 files / 14 tests passed against local dev | 2026-10-20 |
| Driver PWA (`TC-FREIGHT-013`) | Passed, 24.5 s, local dev on `:3000` | 2026-11-24 |
| Freight integration suite (all 21 specs) | 21 passed, 1.1 m, local dev on `:3000` | 2026-11-25 |
| Driver checklist + POD (`TC-FREIGHT-021`) | Passed, 4.9 s | 2026-11-25 |
| Full Playwright suite in one clean run | **Open** — required before pilot | — |
| `yarn test` (all packages) | Known Windows-only failures in `@open-mercato/queue` and others; not a product signal on this machine | — |

## Roadmap

### Now — pilot blockers

| # | Item | Why | Done when |
|---|---|---|---|
| 1 | Full Playwright suite green in one CI run | M5.3 is the last automated gate | CI run with zero failures/retries needed for evidence |
| 2 | Close [`pilot-readiness.md`](../qa/pilot-readiness.md) operators' gates | Deploy, credentials, legal wording, smoke flows | Every row signed off |
| 3 | Freight parity depth: geofencing + predictive alerts | Tracking is position-only today | Phase 4 items in the parity plan |
| 4 | Automated customer messages (SMS/WhatsApp) | Needs an SMS provider; WhatsApp adapter exists | Provider package + freight subscriber + templates |
| 5 | Expiring/rotating document share tokens | Current tokens do not expire | Hardening item from Phase 5 |
| 6 | Tenant-renamable built-in labels | Not required for pilot, but blocks non-technical setup | Deferred unless the pilot asks |

### Gated — code ready, activation needs an external input

| Gate | Unblocks | Owner |
|---|---|---|
| ZATCA CSID onboarding + sandbox | Live clearance (issuance already ships behind config) | Compliance |
| TGA Bayan approval/credentials | Direct waybill issuance/cancellation | Business/compliance |
| SMS provider account | Automated customer messages | Business |
| Maps/routing provider key | Geocoding, ETAs, route optimization | Business |
| Telematics provider selection | Live GPS, geofencing, predictive alerts | Business |
| Native app vs PWA decision | Driver mobile surface beyond the PWA | Product |
| Local legal confirmation | Statutory document wording | Counsel |

### Next — after the pilot

- Multi-currency revaluation (M1.6), only if the pilot has material FX exposure; FX currently posts at rate 1.
- Employee self-service (M2.5) once the staff identity/portal decision is made.
- Mudad/Qiwa (M2.6) once API access exists.
- CRM/sales portal self-service (M3.6) if the pilot moves from operator-led to customer-led.
- Telematics adapter (M4.5) with the selected provider.
- Module packaging into `packages/*` after a full production cycle.

### Explicitly not now

A dedicated purchasing/PO module (AP vendor invoices + expense lines are the pilot decision),
catalog package hierarchy, UR/HI/ZH locales, a custom CRM/WMS/POS/e-commerce, and moving
app-local modules into packages before the MVP stabilizes.

## Decision log

| Date | Decision | Record |
|---|---|---|
| 2026-10-19 | Stay app-local through the pilot; revisit after a production cycle | [`../specs/2026-10-19-module-packaging-decision.md`](../specs/2026-10-19-module-packaging-decision.md) |
| 2026-10-19 | `transport_vehicles` is the single vehicle register; `fleet_vehicles` retired | [`../specs/2026-10-19-fleet-master-data-ownership.md`](../specs/2026-10-19-fleet-master-data-ownership.md) |
| 2026-10 | Payroll uses configurable Saudi statutory calculators; no live statutory filing in the pilot | [`../specs/2026-10-19-hr-payroll-and-statutory.md`](../specs/2026-10-19-hr-payroll-and-statutory.md) |
| 2026-10 | Purchasing uses `financial` AP vendor invoices + expense lines; PO module deferred | [`../specs/2026-11-23-purchasing-expenses-decision.md`](../specs/2026-11-23-purchasing-expenses-decision.md) |
| 2026-11-22 | Driver auth is a staff-linked user; driver surface is a PWA, not a native app | [`../specs/2026-11-22-driver-pwa.md`](../specs/2026-11-22-driver-pwa.md) |
| 2026-11-23 | HR owns the person and licence; transport/freight project over it | [`../specs/2026-11-23-hr-driver-register-consolidation.md`](../specs/2026-11-23-hr-driver-register-consolidation.md), [`../specs/2026-11-23-resource-register-consolidation.md`](../specs/2026-11-23-resource-register-consolidation.md) |
| 2026-11-23 | Insurance expiry owned by the policy master; odometer by the transport register | [`../specs/2026-11-23-resource-register-consolidation.md`](../specs/2026-11-23-resource-register-consolidation.md) |
| 2026-11-25 | Driver checklists are enforced only when an active default template exists; staff order/trip deliveries stay checklist-free | [`../specs/2026-11-25-driver-checklist-and-pod-capture.md`](../specs/2026-11-25-driver-checklist-and-pod-capture.md) |

## System register map — one owner per domain

This is the data-level "single point of truth" the modules follow. A register is written by one
module; every other module reads it tolerantly (events, projections, id + snapshot, or a guarded
cross-module read) and never opens a cross-module ORM relation.

| Register | Owner | Consumers |
|---|---|---|
| People, employees, drivers, licences | `hr_management` | freight, transport, fleet, payroll, approvals |
| Vehicles | `transport_operations` | fleet operations, freight, rentals, student transport |
| Customers, leads, interactions | `customers` | sales, freight, portal |
| Sales documents and payments | `sales` | financial posting, freight invoicing, portal |
| Ledger, AR, AP, tax | `financial` (+ `saudi_localization` for VAT/ZATCA) | every billing surface |
| Freight orders, contracts, trips, abstracts | `freight_operations` | portal, financial posting |
| Transport schedules and trips | `transport_operations` | freight trips, driver workspace |
| Tenant configuration and dictionaries | `configs` / `dictionaries` | all modules |

## How to keep this plan true

1. **Before work:** find the row in *Roadmap*; create or update the spec first.
2. **On merge:** update *Where the product stands* and *Verification status* here, plus the spec's changelog. Do not add status to other plans.
3. **On a decision:** add one row to *Decision log* and link the spec/decision record.
4. **On a gate change:** update *Gated* and the parity plan's external-gates table together.
5. **On a new plan document:** it must state "status lives in PROJECT-PLAN.md" and link here.
