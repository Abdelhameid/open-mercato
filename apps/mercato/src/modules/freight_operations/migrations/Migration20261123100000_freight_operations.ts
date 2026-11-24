import { Migration } from '@mikro-orm/migrations';

/**
 * A freight trip may be linked to exactly one transport schedule. The link is
 * what makes the transport board the dispatch authority for that job; the
 * partial unique index keeps two freight trips from mirroring the same schedule.
 * Billing-only/manual trips keep `transport_trip_id = null` and are unaffected.
 */
export class Migration20261123100000_freight_operations extends Migration {

  override name = 'Migration20261123100000';

  override up(): void | Promise<void> {
    this.addSql(`create unique index "freight_trips_transport_trip_unique_idx" on "freight_trips" ("organization_id", "tenant_id", "transport_trip_id") where transport_trip_id is not null and deleted_at is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "freight_trips_transport_trip_unique_idx";`);
  }

}
