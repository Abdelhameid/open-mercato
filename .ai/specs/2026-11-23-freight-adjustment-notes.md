# Freight credit and debit notes

**Created:** 2026-11-23
**Status:** Implemented
**Companions:** [`2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md), [`2026-11-23-resource-register-consolidation.md`](2026-11-23-resource-register-consolidation.md)

## Problem

Freight orders, trips and abstracts can produce a sales invoice, but there is no
way to adjust a billed amount after the fact. LeanDispatcher (and any transport
finance team) needs a numbered credit note to reduce a customer's balance and a
debit note to increase it, each reaching the general ledger.

## Design

`freight_operations` owns a `FreightAdjustmentNote`:

- `note_type` is `credit` or `debit`; `status` is `draft` → `issued` → `cancelled`.
- A draft may reference a freight order (the common case) or an explicit customer.
  The order supplies the customer snapshot and currency when they are omitted.
- Amounts are computed once from `net_amount` + `vat_rate` using the Saudi VAT
  primitives; the stored net/tax/gross are what both the printed note and the GL
  entry use, so they cannot drift.
- `note_number` is provisional (`DRAFT-…`) until issue. Issuing allocates a
  sequential `adjustment_note` document number (`AN-00001` by default) from the
  existing freight sequence table. The prefix is tenant-configurable.
- Only drafts are editable/deletable; only issued notes can be cancelled.

### GL posting

The financial module subscribes to `freight_operations.adjustment_note.issued`
and `.cancelled` (persistent, enqueue-only, so the post runs in the events worker
with retry):

- credit: debit revenue (net), debit output VAT (tax), credit AR (gross);
- debit: debit AR (gross), credit revenue (net), credit output VAT (tax);
- cancel: reverse the existing entry.

The entry is created through the same `GlJournalEntry` source columns and
`createPostedEntry`/`reversePostedEntry` helpers as the sales postings, so the
partial unique source index makes a replay idempotent. The subscriber carries the
amounts in the event payload and never reads freight tables. A 4xx (for example
missing posting accounts or an unopened period) is logged and swallowed so the
persistent job does not retry forever; a 5xx is rethrown for retry.

**Operational prerequisite:** an open accounting period must cover the note's
issue date. Cancellation posts the reversal on the **current** date, so the
current month must be open as well. Without a period the note stays issued and
the worker logs `posting_period_missing`.

## API

| Route | Purpose |
|---|---|
| `GET/POST/PUT/DELETE /api/freight_operations/adjustment-notes` | List and draft CRUD (`freight.read` / `freight.adjustment_notes.manage`). |
| `POST /api/freight_operations/adjustment-notes/issue` | Draft → issued, allocate the number, emit the posting event. |
| `POST /api/freight_operations/adjustment-notes/cancel` | Issued → cancelled, emit the reversal event. |
| `GET /api/financial/journal-entries?sourceEntityType=freight_adjustment_note&sourceEntityId=…` | Verify the posted/reversing entries. |

Events: `freight_operations.adjustment_note.created|updated|deleted` (CRUD) and
`.issued|.cancelled` (lifecycle). ACL: new additive
`freight.adjustment_notes.manage`; `freight.*` roles already cover it.

## UI

`/backend/freight/adjustment-notes` lists notes with type/status filters, search,
and row actions (edit/issue/delete on drafts, cancel on issued). Create/edit use
`CrudForm` with a freight-order combobox, net amount, VAT rate and reason.
Issue/cancel writes run through `useGuardedMutation` with the optimistic-lock
header.

## Tests

- Unit: posting line directions and balanced envelopes
  (`financial/commands/__tests__/freightAdjustment.test.ts`).
- Integration `TC-FREIGHT-018`: create a note for an order, issue it (sequential
  number + standard GL entry), cancel it (note cancelled + reversing entry), with
  the test ensuring the current month is postable.
- Full app unit suite (1,249) and typecheck/lint/i18n green.

## Risks

| Risk | Mitigation |
|---|---|
| Double posting on retry | Source idempotency index + the command compares existing lines; same-amount replay is `unchanged`. |
| Note issued but posting skipped (no period/accounts) | The note remains `issued` and the worker logs the 4xx; opening the period/accounts and re-driving the event reconciles it. Documented in the pilot checklist. |
| Amount drift between document and GL | Both read the stored net/tax/gross; the event carries them. |
| Credit note used when the invoice is not identifiable | The note stores optional `sales_invoice_id`/`order_id`/`trip_id`/`abstract_id` references; it does not require them, so a goodwill/price adjustment can still be issued. |
