# HR driver register consolidation

**Created:** 2026-11-23
**Status:** Implemented
**Companions:** [`2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md), [`2026-10-19-fleet-master-data-ownership.md`](2026-10-19-fleet-master-data-ownership.md)

## Problem

Two registers hold the same people:

- `hr_management` owns `hr_employees` (person, national id, phone, user link)
  and `hr_driver_profiles` (licence, medical, experience).
- `transport_operations` owns `transport_drivers` (full name, national id,
  licence, phone, availability status, optional employee id).

The transport table duplicates every person and licence attribute HR already
stores, and the app exposes two independent driver screens
(`/backend/hr/drivers` and `/backend/transport/drivers`) with separate write
paths. A change to a driver's licence or phone has to be made twice, and trip,
freight, rental and school-transport assignments can point at a person that no
longer matches the HR record.

## Decision

**HR is the single system of record for people.** A driver is an
`HrEmployee` plus an `HrDriverProfile`. All other modules reference the driver
profile id. Contractors are ordinary employee/person records with
`employment_type = contract`; payroll, attendance and leave remain optional,
so HR can be used in a "people directory only" mode.

The transport Drivers screen stays as a **dispatcher view over the same HR
rows** (the user's rule: a second listing is fine when it reads the same
database table). It is no longer a second write register.

## Data model after this change

| Concept | Owner | Storage |
|---|---|---|
| Person (name, national id, phone, user, employment status) | `hr_management` | `hr_employees` |
| Driver licence + medical compliance | `hr_management` | `hr_driver_profiles` |
| Operational availability | derived | `hr_employees.status` + in-progress `transport_trip_schedules` |
| Trip / freight / rental / school assignment | consumer module | `driver_id` = `hr_driver_profiles.id` |

Operational status is derived, not stored:

```sql
case
  when e.status in ('suspended', 'terminated') then 'suspended'
  when e.status = 'on_leave' then 'on_leave'
  when exists (
    select 1 from transport_trip_schedules t
    where t.driver_id = p.id and t.status = 'in_progress' and t.deleted_at is null
  ) then 'on_trip'
  else 'available'
end
```

No `transport_drivers` table remains.

## Migration

One migration in `transport_operations/migrations/` (it runs after the HR
migrations, which own the target tables):

1. For every `transport_drivers` row, resolve an employee:
   - reuse `employee_id` when it points at an in-scope employee;
   - otherwise match by `(organization_id, tenant_id, national_id)`;
   - otherwise create an employee with a generated `employee_number`,
     `job_title = 'Driver'`, `employment_type = full_time`,
     `hire_date = driver.created_at`, the driver's status mapped to the
     employee status, and the driver's phone/user link.
2. Resolve or create `hr_driver_profiles` for that employee. The profile
   **reuses the old transport driver UUID as its id** whenever no profile
   already exists, so existing `driver_id` references stay valid; when the
   employee already has a profile, a temporary map repoints references to the
   existing profile id.
3. Repoint `driver_id` in `transport_trip_schedules`,
   `transport_vehicle_positions`, `freight_orders`, `freight_delivery_notes`,
   `freight_driver_rest_breaks`, `freight_driver_alerts`,
   `freight_driver_ratings`, the vehicle-rental table and the two
   student-transport tables.
4. Drop `transport_drivers` and its indexes.

`down()` recreates the legacy table and copies the HR driver roster into it
(best effort, same policy as the M4.1 fleet consolidation); the authoritative
rollback is the pre-migration backup.

## API surface

| Route | Change |
|---|---|
| `GET /api/transport_operations/drivers` | Kept for compatibility. Reads `hr_driver_profiles` joined to `hr_employees`; returns the old field shape and the derived status. |
| `POST/PUT/DELETE /api/transport_operations/drivers` | Kept. Delegated to HR roster commands (`hr_management.driver_roster.*`) so the same invariants, events and audit apply. |
| `POST /api/transport_operations/drivers/import` | Kept. Command changed to `hr_management.driver_roster.create`; bulk rows create HR person records. |
| `GET/POST/PUT/DELETE /api/hr_management/driver-profiles` | Unchanged; still the licence-profile CRUD. |
| `GET /api/hr_management/employees` | Unchanged; person CRUD. |

`transport.driver.created|updated|deleted` events are retired;
`hr.driver_profile.*` and `hr.employee.*` are the canonical events. The
migration purges the old `transport_operations:transport_driver` query-index
documents and declares an HR driver-profile reindex; the entity type is retired.

## Cross-module coupling

Consumers (`freight_operations`, `vehicle_rentals`, `student_transport`) keep
their existing tolerant raw-SQL reference helpers and point them at
`hr_driver_profiles` + `hr_employees`. `transport_operations` reads the same
tables for its availability rules and tracking names. No ORM relation crosses
a module boundary. Writes go through HR commands; nothing writes the HR tables
directly.

## UI

- HR `/backend/hr/drivers` remains the management screen (create/edit/delete
  profiles; the employee must exist).
- Transport `/backend/transport/drivers` becomes a read view of the same
  roster: availability, licence expiry and compliance filters, import, and
  links that open the HR create/edit screens. The transport create/edit pages
  and form are removed.

## Integration coverage

- `TC-HR-009-driver-register-consolidation.spec.ts`:
  creating a driver through the transport API creates one HR employee and one
  driver profile; the HR and transport lists return the same row; updating the
  licence through either surface is visible on both; suspending the employee
  makes both the freight assignment and the transport dispatch refuse;
  deleting the profile removes the driver from both lists.
- Existing suites that create drivers through `/api/transport_operations/drivers`
  (`TC-TRANSPORT-*`, `TC-FREIGHT-*`, `TC-RENTAL-001`) continue to run without
  fixture changes.
- Unit: driver status derivation and the roster payload mapping.

## Backward compatibility

- The transport driver **API route and payload shape** are preserved.
- The `transport_drivers` table is removed; its data is migrated.
- `transport.driver.*` event IDs remain declared but are no longer emitted.
- The transport driver create/edit **pages** are removed (the list page
  remains). This is an app-local module UI change, documented in the plan
  changelog.

## Acceptance

- One driver row exists once: an HR employee + HR driver profile, visible from
  both screens.
- Creating a driver from transport creates an HR person record; creating one
  in HR makes it dispatchable in transport.
- Suspending/terminating the employee blocks assignment without editing a
  second register.
- Starting a trip makes the driver appear `on_trip`; completing/cancelling
  makes them `available` again, with no stored duplicate status.
- Typecheck, lint, i18n sync, unit tests and the targeted integration suites
  are green.
