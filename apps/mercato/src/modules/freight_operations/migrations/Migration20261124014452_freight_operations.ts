import { Migration } from '@mikro-orm/migrations';

export class Migration20261124014452_freight_operations extends Migration {

  override name = 'Migration20261124014452';

  override up(): void | Promise<void> {
    this.addSql(`alter table "freight_document_sequences" drop constraint if exists "freight_document_sequences_kind_check";`);
    this.addSql(`alter table "freight_document_sequences" add constraint "freight_document_sequences_kind_check" check ("kind" in ('order', 'contract', 'trip', 'abstract', 'delivery_note', 'adjustment_note', 'receipt_voucher'));`);

    this.addSql(`alter table "freight_payments" add "receipt_number" text null;`);
    this.addSql(`create unique index "freight_payments_receipt_number_unique_idx" on "freight_payments" ("organization_id", "tenant_id", "receipt_number") where receipt_number is not null and deleted_at is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "freight_document_sequences" drop constraint if exists "freight_document_sequences_kind_check";`);
    this.addSql(`alter table "freight_document_sequences" add constraint "freight_document_sequences_kind_check" check ("kind" in ('order', 'contract', 'trip', 'abstract', 'delivery_note', 'adjustment_note'));`);

    this.addSql(`drop index "freight_payments_receipt_number_unique_idx";`);
    this.addSql(`alter table "freight_payments" drop column "receipt_number";`);
  }

}
