import { Migration } from '@mikro-orm/migrations';

/** The retired transport-driver index documents are replaced by the HR profile register. */
export const queryIndexReindexEntityTypes = ['hr_management:hr_driver_profile'];

/**
 * HR driver register consolidation.
 *
 * `transport_drivers` duplicated the person and licence fields HR already owns.
 * This migration creates (or reuses) an `hr_employees` person and an
 * `hr_driver_profiles` licence for every transport driver, reuses the old
 * transport driver UUID as the profile id whenever no profile exists, repoints
 * every `driver_id` reference, and drops the duplicate table.
 *
 * This file lives in `transport_operations` on purpose: module migrations run in
 * alphabetical order, so `hr_management` (and its tables) is processed first.
 * A temporary map keeps the old-id → employee/profile relation available while
 * the backfill runs.
 */
export class Migration20261123090000_transport_operations extends Migration {

  override name = 'Migration20261123090000';

  override up(): void | Promise<void> {
    this.addSql(`create temporary table tmp_transport_driver_employee as
      select td.id as old_id,
        td.tenant_id, td.organization_id,
        td.user_id, td.full_name, td.national_id,
        td.license_number, td.license_expiry, td.phone, td.status,
        td.created_by, td.created_at, td.updated_at, td.deleted_at,
        coalesce(
          (
            select e.id from hr_employees e
            where e.id = td.employee_id
              and e.tenant_id = td.tenant_id
              and e.organization_id = td.organization_id
              and e.deleted_at is null
          ),
          (
            select e.id from hr_employees e
            where e.tenant_id = td.tenant_id
              and e.organization_id = td.organization_id
              and e.national_id = td.national_id
              and e.deleted_at is null
            order by e.created_at asc
            limit 1
          )
        ) as employee_id
      from transport_drivers td;`);

    this.addSql(`create temporary table tmp_transport_driver_new_employee as
      select gen_random_uuid() as id, t.*
      from tmp_transport_driver_employee t
      where t.employee_id is null;`);

    this.addSql(`insert into hr_employees (
        id, tenant_id, organization_id, employee_number,
        first_name, last_name, identity_type, national_id, national_id_expiry,
        department_id, manager_employee_id, job_title, employment_type, status,
        hire_date, termination_date, email, phone, bank_iban, user_id,
        created_by, created_at, updated_at, deleted_at
      )
      select
        n.id, n.tenant_id, n.organization_id,
        'DRV-' || replace(n.old_id::text, '-', ''),
        split_part(trim(n.full_name), ' ', 1),
        coalesce(
          case
            when strpos(trim(n.full_name), ' ') > 0
              then nullif(trim(substr(trim(n.full_name), strpos(trim(n.full_name), ' ') + 1)), '')
            else null
          end,
          '-'
        ),
        'national_id', n.national_id, null,
        null, null, 'Driver', 'full_time',
        case n.status
          when 'suspended' then 'suspended'
          when 'on_leave' then 'on_leave'
          else 'active'
        end,
        n.created_at::date, null, null, n.phone, null, n.user_id,
        n.created_by, n.created_at, n.updated_at, n.deleted_at
      from tmp_transport_driver_new_employee n;`);

    this.addSql(`update tmp_transport_driver_employee t
      set employee_id = n.id
      from tmp_transport_driver_new_employee n
      where n.old_id = t.old_id;`);

    this.addSql(`create temporary table tmp_transport_driver_profile as
      select t.old_id, t.employee_id,
        coalesce(
          (
            select p.id from hr_driver_profiles p
            where p.employee_id = t.employee_id
              and p.tenant_id = t.tenant_id
              and p.organization_id = t.organization_id
              and p.deleted_at is null
            order by p.created_at asc
            limit 1
          ),
          (
            select p.id from hr_driver_profiles p
            where p.id = t.old_id and p.employee_id = t.employee_id
          ),
          case
            when exists (select 1 from hr_driver_profiles p where p.id = t.old_id)
              then gen_random_uuid()
            else t.old_id
          end
        ) as profile_id
      from tmp_transport_driver_employee t;`);

    this.addSql(`insert into hr_driver_profiles (
        id, tenant_id, organization_id, employee_id,
        license_number, license_type, license_expiry, medical_check_expiry,
        years_of_experience, notes, created_by, created_at, updated_at, deleted_at
      )
      select
        m.profile_id, t.tenant_id, t.organization_id, m.employee_id,
        t.license_number, null, t.license_expiry, null,
        null, null, t.created_by, t.created_at, t.updated_at, t.deleted_at
      from tmp_transport_driver_profile m
      join tmp_transport_driver_employee t on t.old_id = m.old_id
      where not exists (select 1 from hr_driver_profiles p where p.id = m.profile_id);`);

    const referencingTables = [
      'transport_trip_schedules',
      'transport_vehicle_positions',
      'freight_orders',
      'freight_trips',
      'freight_delivery_notes',
      'freight_driver_rest_breaks',
      'freight_driver_alerts',
      'freight_driver_ratings',
      'rental_contracts',
      'student_subscriptions',
      'student_trip_attendance',
    ];
    for (const table of referencingTables) {
      this.addSql(`update "${table}" r
        set "driver_id" = m.profile_id
        from tmp_transport_driver_profile m
        where r."driver_id" = m.old_id and m.profile_id <> m.old_id;`);
    }

    this.addSql(`drop table tmp_transport_driver_profile;`);
    this.addSql(`drop table tmp_transport_driver_new_employee;`);
    this.addSql(`drop table tmp_transport_driver_employee;`);
    this.addSql(`drop table "transport_drivers";`);
    this.addSql(`do $$
    begin
      if to_regclass('entity_indexes') is not null then
        delete from "entity_indexes" where "entity_type" = 'transport_operations:transport_driver';
      end if;
    end $$;`);
  }

  override down(): void | Promise<void> {
    // Best-effort rollback: recreate the legacy table from the HR register. The
    // authoritative rollback for a destructive consolidation is the pre-migration
    // backup (see the M4.1 fleet consolidation for the same policy).
    this.addSql(`create table "transport_drivers" (
      "id" uuid not null default gen_random_uuid(),
      "tenant_id" uuid not null, "organization_id" uuid not null,
      "employee_id" uuid null, "user_id" uuid null,
      "full_name" text not null, "national_id" text not null,
      "license_number" text not null, "license_expiry" date not null,
      "phone" text not null, "status" text not null default 'available',
      "created_by" uuid null, "created_at" timestamptz not null,
      "updated_at" timestamptz not null, "deleted_at" timestamptz null,
      primary key ("id")
    );`);
    this.addSql(`create index "transport_drivers_tenant_org_idx" on "transport_drivers" ("tenant_id", "organization_id");`);
    this.addSql(`create index "transport_drivers_status_idx" on "transport_drivers" ("organization_id", "status");`);
    this.addSql(`create unique index "transport_drivers_national_id_unique_idx" on "transport_drivers" ("organization_id", "tenant_id", "national_id") where deleted_at is null;`);
    this.addSql(`create unique index "transport_drivers_license_unique_idx" on "transport_drivers" ("organization_id", "tenant_id", "license_number") where deleted_at is null;`);
    this.addSql(`create unique index "transport_drivers_user_unique_idx" on "transport_drivers" ("organization_id", "tenant_id", "user_id") where user_id is not null and deleted_at is null;`);
    this.addSql(`insert into "transport_drivers" (
        "id", "tenant_id", "organization_id", "employee_id", "user_id",
        "full_name", "national_id", "license_number", "license_expiry",
        "phone", "status", "created_by", "created_at", "updated_at", "deleted_at"
      )
      select p."id", p."tenant_id", p."organization_id", p."employee_id", e."user_id",
        trim(e."first_name" || ' ' || e."last_name"), e."national_id",
        p."license_number", p."license_expiry", coalesce(e."phone", ''),
        case
          when e."status" in ('suspended', 'terminated') then 'suspended'
          when e."status" = 'on_leave' then 'on_leave'
          when exists (
            select 1 from "transport_trip_schedules" t
            where t."driver_id" = p."id" and t."status" = 'in_progress' and t."deleted_at" is null
          ) then 'on_trip'
          else 'available'
        end,
        p."created_by", p."created_at", p."updated_at", p."deleted_at"
      from "hr_driver_profiles" p
      join "hr_employees" e
        on e."id" = p."employee_id"
       and e."tenant_id" = p."tenant_id"
       and e."organization_id" = p."organization_id"
      where e."deleted_at" is null;`);
  }

}
