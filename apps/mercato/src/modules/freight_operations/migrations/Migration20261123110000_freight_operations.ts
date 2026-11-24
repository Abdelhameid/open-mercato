import { Migration } from '@mikro-orm/migrations';

/**
 * Links a freight order's free-text cargo to the catalog product master and
 * records the package count. The product id is copied onto the sales invoice
 * line when the order is billed.
 */
export class Migration20261123110000_freight_operations extends Migration {

  override name = 'Migration20261123110000';

  override up(): void | Promise<void> {
    this.addSql(`alter table "freight_orders" add "catalog_product_id" uuid null, add "package_count" int null;`);
    this.addSql(`create index "freight_orders_product_idx" on "freight_orders" ("organization_id", "catalog_product_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "freight_orders_product_idx";`);
    this.addSql(`alter table "freight_orders" drop column "catalog_product_id", drop column "package_count";`);
  }

}
