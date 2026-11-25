import { Migration } from '@mikro-orm/migrations';

export class Migration20261125003528_freight_operations extends Migration {

  override name = 'Migration20261125003528';

  override up(): void | Promise<void> {
    this.addSql(`create table "freight_checklist_runs" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "freight_order_id" uuid null, "freight_trip_id" uuid null, "template_id" uuid null, "template_name_snapshot" text not null, "template_snapshot" jsonb not null default '{}', "items" jsonb not null default '[]', "status" text not null default 'completed', "completed_at" timestamptz null, "driver_id" uuid null, "created_by" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "freight_checklist_runs_trip_unique_idx" on "freight_checklist_runs" ("organization_id", "tenant_id", "freight_trip_id") where freight_trip_id is not null and deleted_at is null;`);
    this.addSql(`create unique index "freight_checklist_runs_order_unique_idx" on "freight_checklist_runs" ("organization_id", "tenant_id", "freight_order_id") where freight_order_id is not null and deleted_at is null;`);
    this.addSql(`create index "freight_checklist_runs_trip_idx" on "freight_checklist_runs" ("organization_id", "freight_trip_id");`);
    this.addSql(`create index "freight_checklist_runs_order_idx" on "freight_checklist_runs" ("organization_id", "freight_order_id");`);
    this.addSql(`create index "freight_checklist_runs_scope_idx" on "freight_checklist_runs" ("tenant_id", "organization_id");`);

    this.addSql(`create table "freight_checklist_templates" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "name" text not null, "description" text null, "items" jsonb not null default '[]', "is_active" boolean not null default true, "is_default" boolean not null default false, "created_by" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "freight_checklist_templates_name_unique_idx" on "freight_checklist_templates" ("organization_id", "tenant_id", "name") where deleted_at is null;`);
    this.addSql(`create index "freight_checklist_templates_scope_idx" on "freight_checklist_templates" ("tenant_id", "organization_id");`);

    this.addSql(`alter table "freight_orders" add "pod_signature_document_id" uuid null;`);

    this.addSql(`alter table "freight_trips" add "pod_signature_document_id" uuid null;`);

    this.addSql(`alter table "freight_checklist_runs" add constraint "freight_checklist_runs_status_check" check ("status" in ('pending', 'completed'));`);
    this.addSql(`alter table "freight_checklist_runs" add constraint "freight_checklist_runs_target_check" check ((freight_order_id is not null) <> (freight_trip_id is not null));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "freight_orders" drop column "pod_signature_document_id";`);

    this.addSql(`alter table "freight_trips" drop column "pod_signature_document_id";`);

    this.addSql(`drop table if exists "freight_checklist_runs" cascade;`);
    this.addSql(`drop table if exists "freight_checklist_templates" cascade;`);
  }

}
