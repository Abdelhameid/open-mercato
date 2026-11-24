import { Migration } from '@mikro-orm/migrations';

export class Migration20261123200737_freight_operations extends Migration {

  override name = 'Migration20261123200737';

  override up(): void | Promise<void> {
    this.addSql(`create table "freight_adjustment_notes" ("id" uuid not null default gen_random_uuid(), "tenant_id" uuid not null, "organization_id" uuid not null, "note_number" text not null, "note_type" text not null, "status" text not null default 'draft', "order_id" uuid null, "trip_id" uuid null, "abstract_id" uuid null, "sales_invoice_id" uuid null, "customer_id" uuid not null, "customer_snapshot" jsonb null, "currency_code" text not null default 'SAR', "net_amount" numeric(18,4) not null, "tax_amount" numeric(18,4) not null, "gross_amount" numeric(18,4) not null, "vat_rate" numeric(7,4) null, "reason" text null, "issue_date" date null, "issued_at" timestamptz null, "cancelled_at" timestamptz null, "created_by" uuid null, "created_at" timestamptz not null, "updated_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create unique index "freight_adjustment_notes_number_unique_idx" on "freight_adjustment_notes" ("organization_id", "tenant_id", "note_number") where deleted_at is null;`);
    this.addSql(`create index "freight_adjustment_notes_status_idx" on "freight_adjustment_notes" ("organization_id", "note_type", "status");`);
    this.addSql(`create index "freight_adjustment_notes_order_idx" on "freight_adjustment_notes" ("organization_id", "order_id");`);
    this.addSql(`create index "freight_adjustment_notes_scope_idx" on "freight_adjustment_notes" ("organization_id", "tenant_id");`);

    this.addSql(`alter table "freight_document_sequences" drop constraint if exists "freight_document_sequences_kind_check";`);
    this.addSql(`alter table "freight_document_sequences" add constraint "freight_document_sequences_kind_check" check ("kind" in ('order', 'contract', 'trip', 'abstract', 'delivery_note', 'adjustment_note'));`);

    this.addSql(`alter table "freight_adjustment_notes" add constraint "freight_adjustment_notes_note_type_check" check ("note_type" in ('credit', 'debit'));`);
    this.addSql(`alter table "freight_adjustment_notes" add constraint "freight_adjustment_notes_status_check" check ("status" in ('draft', 'issued', 'cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "freight_adjustment_notes";`);
    this.addSql(`alter table "freight_document_sequences" drop constraint if exists "freight_document_sequences_kind_check";`);
    this.addSql(`alter table "freight_document_sequences" add constraint "freight_document_sequences_kind_check" check ("kind" in ('order', 'contract', 'trip', 'abstract', 'delivery_note'));`);
  }

}
