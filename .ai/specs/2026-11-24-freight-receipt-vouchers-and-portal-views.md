# Freight receipt vouchers and customer portal contract/invoice views

**Created:** 2026-11-24
**Status:** Implemented
**Companions:** [`2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md)

## TLDR

Recorded freight payments now allocate a per-tenant `RV-` receipt number inside
the payment transaction and print from a dedicated receipt page. Signed-in portal
customers get two new read-only views: their freight contracts (with negotiated
route rates) and the sales invoices raised for their company.

## Problem

- The parity matrix listed receipt vouchers as missing: staff could record a
  payment but not hand the payer a numbered, printable receipt.
- The portal listed orders, tracking and abstracts but not the commercial
  documents a customer asks about most: their contract rates and invoices.

## Design

### Receipt vouchers

- `freight_payments.receipt_number` (unique partial index per tenant/organization
  where not deleted) is allocated from the `receipt_voucher` document sequence.
  The default prefix is `RV` and is configurable per tenant in freight settings.
- The number is allocated **inside** the payment recording transaction, so a
  rolled-back payment never burns or exposes a number.
- Payments recorded before this change keep a `null` receipt number; the receipt
  page renders them without one rather than inventing a number.
- `/backend/freight/payments/<id>/receipt` renders a print-friendly receipt with
  seller, customer, order number, payment method/reference, amount, currency and
  the receipt number. The payments panel exposes a "Receipt" row action.

### Portal contracts

`GET /api/portal/freight/contracts` returns the customer's contracts in
`active`, `suspended` or `terminated` state (drafts stay internal) together with
their active routes: line number, origin, destination, rate basis, rate amount,
minimum charge, currency and toll/waiting flags. Reads use
`findWithDecryption` with the customer's tenant/organization scope.

### Portal invoices

`GET /api/portal/freight/invoices` returns the customer's sales invoices —
number, status, issue/due dates, currency, gross total, paid total and
outstanding amount. `sales_invoices` carries no customer column, so the query
joins `sales_orders` on `order_id` and filters `o.customer_entity_id` against the
signed-in user's company/person entity. Sales is a peer module: the read is a
scoped raw SQL query that returns an empty list when the sales tables are absent.

### Access control

Both portal endpoints require customer authentication, an organization context,
and `portal.freight.view` checked through `customerRbacService` — possession of a
portal session alone is not enough. The portal pages declare the same feature in
`page.meta.ts` and appear in the portal nav (orders 61 and 62).

## API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/portal/freight/contracts` | customer + `portal.freight.view` | Visible contracts with active route rates. |
| `GET /api/portal/freight/invoices` | customer + `portal.freight.view` | Sales invoices reached through the order. |

## Data model

| Column | Table | Notes |
|---|---|---|
| `receipt_number` | `freight_payments` | `text`, nullable; unique index `(tenant_id, organization_id, receipt_number)` where not deleted. |

## Tests

- `TC-FREIGHT-005` asserts the recorded payment carries an `RV-#####` number.
- `TC-FREIGHT-020` creates a contract with a route and an invoice for a portal
  company, then checks the customer sees both through the portal APIs and that a
  customer role without `portal.freight.view` receives 403 from both.

## Risks

| Risk | Mitigation |
|---|---|
| Invoice join leaks another customer's invoice | Join key is the order id; the filter is the signed-in customer entity within the same tenant/organization. |
| Receipt numbers skip on failure | Allocation happens inside the payment transaction. |
| Sales module disabled | The invoices read degrades to an empty list on a missing relation. |
| Historical payments have no receipt number | The receipt page omits the number instead of fabricating one. |

## Changelog

- **2026-11-24** — Implemented: receipt numbers and the receipt page; portal
  contract and invoice APIs plus pages; i18n keys in all six locales;
  `TC-FREIGHT-005` extended and `TC-FREIGHT-020` added.
