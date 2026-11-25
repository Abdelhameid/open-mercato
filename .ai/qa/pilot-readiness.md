# Pilot QA matrix and readiness checklist

**Status:** Living document — automated gates recorded 2026-10-20; environment-bound gates remain open
**Created:** 2026-10-20
**Scope:** the Saudi ERP pilot (fleet/operations, CRM, finance, HR)

## Automated gates (run on 2026-10-19/20)

| Gate | Command | Result |
|---|---|---|
| Generators | `yarn generate` | pass |
| Migrations generated | `yarn db:generate` | pass (new migrations reviewed) |
| Migrations applied (local) | `yarn db:migrate` | pass 2026-10-20 — financial ×3, HR ×4, fleet_operations, sales, saudi_localization, student_transport, transport_operations ×2, vehicle_rentals. The `query_index` reindex-declaration reader warned about `src`/`dist` paths; it did not block the migration |
| Typecheck | `tsc --noEmit` (workspace) | pass |
| Lint | `yarn lint` | pass (0 errors, warnings unchanged) |
| Package build | `yarn build:packages` | pass (39 tasks) |
| App build | `yarn build:app` | pass |
| Unit tests (app) | `yarn workspace @open-mercato/app test` | 1 235 passed / 169 suites |
| Unit tests (core) | `yarn workspace @open-mercato/core test` | run separately; `yarn test` stops at the known Windows-only `@open-mercato/queue` EPERM failure |
| i18n sync / usage / Arabic audit | `yarn i18n:check-sync`, `yarn i18n:check-usage`, `ar-audit/verify.mjs` | sync pass; usage has 4 pre-existing financial keys missing and advisory unused keys; Arabic audit OK for `hr_management` (573 keys) and `transport_operations` (183 keys) |
| Template sync | `yarn template:sync` | pass — app-local modules ignored on both sides and stripped from the template registrations |
| Integration suite | `yarn test:integration` | not run in this environment — needs the Playwright stack + a running app; CI must run it |

## Pilot smoke flows

Each flow names the spec that covers it. They must be green in CI before the pilot starts.

1. **Invoice → GL → VAT return** — `saudi_localization/__integration__/TC-SL-FIN-001`
2. **Sales posting** — `financial/__integration__/TC-FINANCIAL-003`
3. **AR aging / statement** — `financial/__integration__/TC-FINANCIAL-004`
4. **AP + withholding** — `financial/__integration__/TC-FINANCIAL-005`
5. **Bank reconciliation** — `financial/__integration__/TC-FINANCIAL-006`
6. **Hire → payroll → payslip → GL** — `hr_management/__integration__/TC-HR-007`
7. **Leave entitlement → balance refusal → accrual → unpaid payslip** — `hr_management/__integration__/TC-HR-008`
8. **Lead → duplicate check → convert → deal** — `customers/__integration__/TC-CRM-LEAD-001`
8. **Deal → quote/order/invoice** — `sales/__integration__/TC-SALES-DEAL-001`
9. **WhatsApp inbound → CRM timeline** — `customers/__integration__/TC-CRM-WA-001` (requires `OM_ENABLE_TEST_CHANNEL_SEEDING`)
10. **Vehicle → schedule → work order → complete → GL** — `fleet_operations/__integration__/TC-FLEET-OPS-001`
11. **Trip → dispatch → cancel → driver release** — `transport_operations/__integration__/TC-TRANSPORT-002`
12. **Freight abstract → customer portal accept/dispute → invoice** — `freight_operations/__integration__/TC-FREIGHT-006`, `TC-FREIGHT-007`, plus the portal route checks in this cycle
13. **Rental return → invoice** — extend `vehicle_rentals/__integration__/TC-RENTAL-001` or add the invoice assertion to the same fixture
14. **Student subscription → invoice period** — extend `student_transport/__integration__/TC-STUDENT-001`
15. **Driver checklist → POD photo/signature → deliver** — `freight_operations/__integration__/TC-FREIGHT-021`

## 2026-11-23 consolidation pass

- **HR driver register** executed locally: `transport_drivers` was backfilled into
  `hr_employees` + `hr_driver_profiles`, every `driver_id` reference was repointed
  (0 unknown after the migration), and the duplicate table was dropped. Backup:
  `.mercato/backups/driver-consolidation-before.sql`.
- **Operator actions after deploy:**
  - `yarn mercato auth sync-role-acls` — roles with explicit feature lists need the
    new `freight.adjustment_notes.manage` feature (`freight.*` admins already have it).
  - Reindex the HR driver register:
    `yarn mercato query_index rebuild --entity hr_management:hr_driver_profile --global`.
    The migration purges the retired `transport_operations:transport_driver` docs.
  - The credit/debit-note ledger posting needs the financial posting accounts
    (AR, revenue, output VAT) configured; without them the note still issues, but
    the posting subscriber logs a 409 and skips the entry.
  - Keep an **open accounting period covering today**. The note posts on its
    issue date and a cancellation posts its reversal on the current date; a
    missing period leaves the note issued without a ledger entry (the subscriber
    logs `posting_period_missing` and the worker job completes).
- **Gates on 2026-11-23/24:** `yarn generate`, `yarn db:generate`,
  `yarn typecheck`, `yarn lint` (0 errors), `yarn i18n:check-sync`,
  `yarn build:app`, `yarn build:packages` and the full app unit suite
  (1,249 tests) are green. Integration results:
  - `TC-HR-009` (driver register) passed end-to-end.
  - `TC-TRANSPORT-001/002`, `TC-FREIGHT-013/015` passed in the affected batch.
  - `TC-FREIGHT-018` passed: a note issues, posts a balanced standard entry,
    cancels and posts the reversing entry.
  - `TC-RENTAL-001` passed after correcting its test inputs (it previously
    expected three billed days from a two-day window and used a with-driver
    contract without a driver).
  - `TC-FREIGHT-005` asserts the new `RV-#####` receipt number on a recorded
    payment; `TC-FREIGHT-019` covers the public delivery-note share link.
  - `TC-FREIGHT-020` covers the portal contract/invoice views and the 403 for
    a customer role without `portal.freight.view`.
  - The first attempts timed out because the dev runtime was serving stale
    generated chunks/worker registries. A clean `yarn dev` restart picks up new
    commands, subscribers and pages; production deploys start fresh.
  - The worker's local queue did not restart itself after a manual kill; in dev,
    restart the runtime (or start `yarn mercato queue worker --all
    --with-scheduler`) so persistent subscribers run.
- **Remaining duplication decision:** the core `staff` team-member/leave roster
  is not removed yet. HR now exposes the shared `userId` link and leads the nav;
  a durable roster link is documented in
  `.ai/specs/2026-11-23-resource-register-consolidation.md`. Disabling staff
  without that link would break time tracking, planner availability and
  warranty-claim assignment.

## 2026-11-25 driver checklist and POD capture

- Create the pilot's checklist template at
  `/backend/freight/checklist-templates` and mark it **Use for driver deliveries**. While an
  active default template exists, driver deliveries are refused until every required item is
  checked and every attachment-required item has a file; deactivate or unset the default to
  suspend enforcement.
- Staff delivery-note delivery now accepts POD/POP document uploads through
  `/api/attachments` (`attachments.manage`). Roles that manage delivery notes but lack that
  permission can still record a reference; grant `attachments.manage` if they must upload.
- Sync the new `freight.checklist_templates.manage` feature for tenants with explicit role
  feature lists: `yarn mercato auth sync-role-acls` (admin/superadmin wildcards already cover it).
- Gates on 2026-11-25: `yarn generate`, `yarn db:generate` (only the freight migration),
  `yarn typecheck`, `yarn lint` (0 errors), `yarn i18n:check-sync`, `yarn build:packages`,
  `yarn build:app`, the full app unit suite (1,261 passed), and the full freight integration
  suite (21/21 passed, including `TC-FREIGHT-021` at 4.9 s). The suite pass also fixed partial
  contract/order/trip/rate-line updates that nulled stored dates, and corrected
  `TC-FREIGHT-009`'s second trip setup.

## Deployment (Railway)

Follow `.ai/specs/2026-05-12-railway-one-command-deploy.md` and `apps/docs/docs/deployment/railway.mdx`.

- [ ] Postgres and object storage provisioned; `DATABASE_URL`, `JWT_SECRET`, `APP_URL`, `OM_ENCRYPTION_*`/KMS set.
- [ ] `yarn db:migrate` run once on the target database after a verified backup.
- [ ] Health checks green: `/api/health`, integrations health, WhatsApp channel health.
- [ ] Error reporting and structured logs shipped (see `runtime/error-reporting`).
- [ ] Backup + restore exercised once.
- [ ] `OM_ENABLE_TEST_CHANNEL_SEEDING` unset in production (route returns 404).

## Pilot readiness checklist

- [x] Migrations applied and every module snapshot reviewed (local 2026-10-20).
- [ ] Default role ACLs synced (`yarn mercato auth sync-role-acls`), portal ACLs synced (`yarn mercato customer_accounts sync-customer-role-acls`).
- [ ] Arabic audit green for every enabled module (`ar-audit/verify.mjs`, app dictionary parity).
- [ ] Saudi CoA seeded and VAT settings confirmed.
- [ ] Opening balances imported and reconciled against the trial balance.
- [ ] Data import plan for customers, vehicles, employees and vendors executed.
- [ ] ZATCA CSID onboarding scheduled; issuance remains in preview mode until sandbox validation succeeds.
- [ ] WPS/SIF format confirmed with the bank; Mudad/Qiwa access requested.
- [ ] GOSI/EOSB rates and the payroll deduction ceiling confirmed with counsel.
- [x] Fleet master-data consolidation (M4.1) executed: `transport_vehicles` is the single register, `fleet_vehicles` dropped, pre-migration backup verified.
- [ ] Security review of the diff completed before go-live.
