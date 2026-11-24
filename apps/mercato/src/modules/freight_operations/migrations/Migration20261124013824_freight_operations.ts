import { Migration } from '@mikro-orm/migrations';

export class Migration20261124013824_freight_operations extends Migration {

  override name = 'Migration20261124013824';

  override up(): void | Promise<void> {
    this.addSql(`alter table "freight_delivery_notes" add "share_token" text null;`);
    this.addSql(`create unique index "freight_delivery_notes_share_token_unique_idx" on "freight_delivery_notes" ("share_token") where share_token is not null and deleted_at is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index "freight_delivery_notes_share_token_unique_idx";`);
    this.addSql(`alter table "freight_delivery_notes" drop column "share_token";`);
  }

}
