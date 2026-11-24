# Purchasing and expenses — pilot decision

**Created:** 2026-11-23
**Status:** Decided (no code)
**Companions:** [`2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md)

## Decision

For the pilot, purchasing and operating expenses run through the existing
**`financial` accounts-payable** flow:

- a vendor bill is an `ApVendorInvoice` with expense lines;
- payment runs through `ApPayment` + allocations and posts to the GL;
- WHT is applied by the Saudi country plugin where configured.

No dedicated purchase-order, goods-receipt or expense-claim module is built now.

## Why

- The AP ledger, vendor master, withholding tax, AP aging and screens already ship
  and reconcile to the GL; a parallel procurement module would create a second
  commitment/expense path before the pilot has a three-way-match requirement.
- The freight fleet's maintenance, fuel and insurance costs already post through
  their own subscribers; those are the pilot's material purchasing flows.
- The LeanDispatcher comparison lists purchasing as a feature, not a
  differentiation the pilot depends on.

## Revisit when

- stock purchasing or three-way matching (PO ↔ receipt ↔ bill) becomes a
  requirement;
- expense claims with per-employee limits/approval routing are needed (the HR
  approval engine and payroll deductions are the intended building blocks);
- or a vendor portal/quote-to-PO workflow is sold.

Until then, an AP vendor invoice with an `expense` line is the supported way to
record a purchase, and `fleet_work_orders.vendor_name` remains free text rather
than a supplier master.
