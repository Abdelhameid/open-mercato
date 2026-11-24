# Resource register consolidation

**Created:** 2026-11-23
**Status:** Implemented (phase 1); staff/leave linkage deferred
**Companions:** [`2026-11-23-hr-driver-register-consolidation.md`](2026-11-23-hr-driver-register-consolidation.md), [`../plans/2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md)

## Principle

Every real-world resource has **one owning module** (the system of record). Other
modules may list the same rows over the same table; they must not keep a second
master. HR is the owner for people, including drivers, regardless of whether the
tenant uses payroll/attendance.

A second **screen** is fine when it reads the owner's table. A second **table** for
the same resource is not.

## Audit and decisions

| Resource | Duplicate found | Decision in this change |
|---|---|---|
| Driver / person | `transport_drivers` vs `hr_employees` + `hr_driver_profiles` | **Merged into HR.** See the driver consolidation spec. Transport's driver screen is a compatibility projection; writes go through HR roster commands. |
| Vehicle | `fleet_vehicles` vs `transport_vehicles` | Already consolidated (M4.1); `/backend/fleet/vehicles` and `/backend/transport/vehicles` read the same table. No action. |
| Trip / dispatch | `transport_trip_schedules` vs `freight_trips` | **Linked, transport is the dispatch authority for linked trips.** `freight_trips.transport_trip_id` is now validated on assign/create/update, uniquely indexed, and mirrored from the transport schedule by a subscriber. Billing-only/manual freight trips with no schedule remain valid. Moving vehicle/driver/actual-time columns out of `freight_trips` and delegating every freight transition to a transport command is deferred (see below). |
| Vehicle insurance | `fleet_vehicle_documents` type `insurance` vs `fleet_insurance_policies` | **Policy is the master** (`fleet_operations`); the fleet document is the scanned paper. The fleet dashboard no longer counts insurance documents as a second expiry clock. |
| Odometer | `transport_vehicles.current_odometer` vs rental/fuel/work-order readings | **Register is the master.** Rentals, fuel logs and work orders carry the reading in their events; `transport_operations` subscribers advance `current_odometer` monotonically (`greatest`), so a late lower reading cannot roll it back. |
| Employee / staff | `hr_employees` vs core `staff_team_members` | **HR is the person center; staff stays as the time-tracking/planner surface.** HR's employee form now exposes `userId`, the identity both modules already share. A durable roster link is planned; see deferred work. |
| Leave | `hr_leave_requests` vs `staff_leave_requests` | Deferred with the staff decision. HR owns leave types, entitlements, accruals and the approval engine; staff leave is still used by the planner's unavailability flow. |
| Payment methods | `gl_payment_methods` vs `sales_payment_methods` | No merge: one is the GL/cash-account mapping, the other the tender catalogue. They are reference data for different concerns, not two masters of one resource. |
| Customer / vendor / product / warehouse | — | Already single-owner (core `customers`, `financial.ap_vendors`, `catalog`, `wms`). No action. |

## Driver consolidation (summary)

- HR owns the person (`hr_employees`) and licence (`hr_driver_profiles`).
- Contractors are ordinary employee records (`employment_type = contract`); payroll
  is optional.
- Operational availability is derived: employee status (`suspended`/`terminated`/
  `on_leave`) plus an in-progress transport trip. No stored duplicate status.
- `transport_drivers` backfilled and dropped; every `driver_id` reference repointed.
- Transport API shape and bulk import preserved; transport create/edit pages removed.

Full detail: [`2026-11-23-hr-driver-register-consolidation.md`](2026-11-23-hr-driver-register-consolidation.md).

## Trip/dispatch consolidation (phase 1)

- `findTransportScheduleReference` validates a link: the schedule must exist in
  scope, be open, and match the assigned vehicle/driver.
- A partial unique index `freight_trips_transport_trip_unique_idx` prevents two
  freight trips from mirroring one schedule.
- `freight_operations/subscribers/transportTripStatus.ts` mirrors transport
  `in_progress` → freight `dispatched` (or keeps `in_transit`), `completed` →
  `delivered`, `cancelled` → `cancelled`. Billing status is never touched by the
  mirror, and a billed trip is not cancelled from the transport board.
- Billing-only/contract trips without a schedule keep their own execution state;
  the freight module continues to work when transport is disabled.

**Deferred:** moving `vehicle_id`, `driver_id`, `vehicle/driver_snapshot`,
`actual_*` and `execution_status` out of `freight_trips`; making freight
dispatch/deliver/cancel delegate to the transport commands; adding
`delivered_at/cancelled_at`; a route picker at assign. These need a dedicated
change with the integration suite green (the trip lifecycle, abstracts, POD,
driver PWA and tracking all read `freight_trips`).

## Odometer sync

- `transport_operations/lib/odometerSync.ts` + subscribers on
  `vehicle_rentals.rental.*`, `fleet_operations.fuel_log.*` and
  `fleet_operations.work_order.completed`.
- Event payloads were extended (additive) with `vehicleId` and `odometer`.
- The register update is tenant/org scoped, tolerant of a disabled source module,
  and monotonic.

## Staff / HR (safe first step)

- `hr_employees.user_id` was already the shared identity; the HR employee form now
  exposes it with a hint, so operators can link a person to their staff login.
- HR's nav group is ordered first; the staff screens remain available.
- Staff and HR are **not** hidden or merged yet: staff owns the only UI that
  maintains timesheet project membership and the only flow that creates planner
  unavailability from approved leave.

**Deferred durable plan:**

1. App-local link table (HR-owned) mapping `employee_id` → `staff_member_id` by
   tenant/org, plus an idempotent backfill by `user_id`.
2. Show employee number/department on the staff roster via a response enricher.
3. HR leave approval creates/removes planner unavailability through the link.
4. Only then hide `/backend/staff/team-members*` and the staff leave screens, or
   disable the staff module if time tracking is not used.

Disabling staff tonight would remove time tracking, break planner availability
writes (403 `staff_module_not_loaded`) and warranty-claim assignment (400
`invalidAssignee`); that is why it is deferred.

## Validation

- Driver: unit tests (`driverRoster`, `odometerSync`), integration `TC-HR-009`
  passes against the local server; migration applied and all `driver_id`
  references verified (0 unknown).
- Trip link: migration applied; `freight_trips_transport_trip_unique_idx` present;
  the index is in the snapshot.
- Credit/debit notes: detail in the LeanDispatcher plan; `TC-FREIGHT-018` covers
  issue → GL posting → cancel → reversal.
- `yarn generate`, `yarn typecheck`, `yarn lint` (0 errors), `yarn i18n:check-sync`,
  `yarn build:packages`, `yarn build:app` and the full app unit suite (1,249 tests)
  are green. `TC-HR-009`, `TC-TRANSPORT-001/002`, `TC-FREIGHT-013/015/018` and the
  corrected `TC-RENTAL-001` pass against the local runtime.

## Risks

| Risk | Mitigation |
|---|---|
| Driver backfill maps a transport driver onto an employee who already has a licence profile; the transport licence is dropped | The HR profile was already authoritative; the link/employee is preserved. Verified no unknown references after migration. |
| Transport driver events (`transport.driver.*`) are no longer emitted | HR `driver_profile`/`employee` events are canonical; the transport API and screens remain. Documented for integrations. |
| Transport schedule mirror races a simultaneous freight action | Mirror is idempotent; billing state is never changed; the unique link index prevents double-linking. |
| Odometer event lost | Persistent subscribers retry; the next reading re-advances the register. |
| Staff link ambiguity (`user_id` not unique) | Deferred design will choose deterministically and report unmapped members. |

## Changelog

- **2026-11-23** — Driver register merged into HR; insurance expiry unified on the
  policy; odometer register made authoritative via event subscribers; transport
  trip link validated/indexed/mirrored; HR↔staff identity exposed and HR nav
  ordered first. Full staff/leave merge deferred with a documented plan.
