# Saudi Ledger Status

**Date:** 2026-10-10 · **Branch:** `main` · **Commit:** `bebf4fb90` · **Committed:** 983 files, +123 006 / −67

---

## Blocked: the working tree is mid-merge and cannot build

A merge of `origin/main` (the branch is **266 commits behind**) stopped with **29 conflicts**
unresolved. Conflict markers sit inside source files, so the tree does not typecheck, five test
suites cannot run, and `packages/core/src/modules/auth/i18n/en.json` is **not valid JSON** at this
moment. Nothing below can be re-verified until it is resolved or aborted.

| | |
|---|---|
| Conflicts | 29 (21 both-modified, 8 deleted-by-us/modified-by-them) |
| Suites failing on conflict markers | 5 — `fleet_management` vehicle form, `saudi_localization` VAT settings page, 3 × `transport_operations` form |
| Conflicted files this work touched | 2 — `.ai/lessons.md`, `packages/core/src/modules/auth/i18n/{de,en,es,ko,pl}.json` |
| Conflicted files unrelated to it | 27 — upstream UI primitives, staff time-tracking, dictionaries |

Your commit `bebf4fb90` is intact in history; the merge sits in the working tree on top of it.
`git merge --abort` returns to a known-good state; resolving it keeps the 266 upstream commits.

---

## Three requests, all delivered

### 1. Saudi VAT settings could never be saved

**Root cause.** The screen was gated on `settings.view`, but its Save calls a `PUT` behind
`settings.manage`. A caller holding only `view` got a fully editable form whose save returned
`403 {"requiredFeatures":["saudi_localization.settings.manage"]}` — so the operator saw "Unable to
save" and the values reverted on reload. That is why `module_configs` had never held a row for this
module.

**Fix.** `GET` now reports `canManage`, decided by the same RBAC call the `PUT` guard makes in the
caller's own organization scope, and the screen renders read-only without it: inputs disabled, no Save
control, a note explaining why. Read access is what `view` promises, so nobody loses the screen.

### 2. Vehicle plate and sequence numbers were not unique

**Root cause — deeper than missing validation.** `@Index({ options: { unique: true, where } })`
compiles to a **plain** index under this MikroORM version. The live schema confirmed it: a name
ending in `_unique_idx` over a `CREATE INDEX` with no `UNIQUE`. The database accepted the duplicates
it was supposed to prevent, and two were really present in the fleet data.

**Fix.** Both halves: the index declared as an `expression` — the only form that carries a
partial-unique predicate through to SQL — plus before-write checks that return a `409` naming the
field instead of a driver-level `500`. Fifteen indexes repo-wide carry the same defect; the two
modules reported are corrected, the rest are recorded in
`.ai/lessons/partial-unique-indexes-need-the-expression-form.md`.

### 3. Finance was unfinished

The Phase 1 event gap is closed and the entire Saudi country plugin (Phase 1b) is built, along with
the cash, payment, opening-balance and statement features requested during the work.

---

## Architecture

Three layers, and the engine never learns about a country:

| Layer | Contents |
|---|---|
| **Engine** | Chart of accounts, journal entries, periods, post and reverse, trial balance, payments, statements. Jurisdiction-neutral; imports no country module. |
| **Contracts** | Types only, plus a registry that **never throws**: an unknown or absent country resolves to a generic fallback, so a deployment that installs no plugin still runs a working ledger. |
| **Plugin (SA)** | A thin adapter over the ZATCA primitives already pinned by this repository's own vectors. It adds no arithmetic of its own — a second implementation of 15% VAT would drift from the compliance contract, and a drifted e-invoice is a rejected one. |

---

## The delivery record

### Phase 1 — general ledger, completed

- The module's events are declared and the four action commands emit them. Posting previously emitted
  only `journal_entry.updated` — the same id a draft edit produces — so nothing could follow postings;
  `journal_entry.posted` is now its own signal, with reversal, close and reopen alongside.
- The account delete is a CRUD `deleted` rather than a bespoke `archived`, matching the id the platform
  actually emits.

### Phase 1b — Saudi country plugin, built from scratch

- 15% VAT with the S/Z/E/O category vocabulary, halala rounding delegated to the pinned primitives, and
  the rule that an untaxed line is *out of scope* unless the source states its exemption — never assumed
  zero-rated.
- A Saudi chart of accounts whose every account the tax codes reference, so posting a tax line cannot
  fail for a missing account.
- A withholding catalogue at the published rates, net-of-withholding arithmetic, and the zakat base as
  groundwork.
- Capability flags reported honestly: `signedDocuments: false` and `realtimeClearance: false`, because
  neither ships. Nothing in the product claims ZATCA clearance.

### Phase 1c — cash, payments and opening balances

- Opening balances post as one journal entry of type `opening`. A set that does not net to zero is
  refused rather than plugged with a number nobody entered, and a second set is refused because posting
  opening balances twice doubles the carried-in position.
- Payment methods carry the GL account money lands in — validated as an asset — with **Cash** seeded as
  the default, plus Bank transfer, Mada, Credit card, Cheque and STC Pay. Cash and bank accounts
  reference a GL account without being one, so a till can be re-pointed without rewriting the ledger.
- `payments.record` posts a two-line entry and refuses a non-positive amount, identical accounts, or a
  missing reference the method demands.
- Balance sheet and income statement. Section totals net the *presented* sides, so a contra account
  subtracts: summing each account's own-normal-side balance reported 1 250 for 1 000 of cash against
  250 of accumulated depreciation, and called a correct ledger unbalanced. That defect was found by
  review before it shipped.

---

## Evidence

| | |
|---|---|
| 363 | unit tests passing (37 suites) |
| 21 | new API routes (16 financial, 5 Saudi) |
| 20 | backend screens (18 financial, 2 Saudi) |
| 6 | locales in sync (financial 321 keys, Saudi 99) |
| 42 | repo-wide guard files passing |

Checks run against the **running application and its database**, not only the test runner:

| Check | Method | Result |
|---|---|---|
| VAT settings, view-only caller | Browser session, `employee` role | Reads values, fields disabled, `0` Save buttons, no `PUT` attempted |
| VAT settings, manager | Browser session, `superadmin` | Editable, `PUT` → `200` |
| Vehicle unique constraints | Duplicate insert, rolled back | `duplicate key value violates unique constraint` |
| VAT return | `GET /api/saudi_localization/vat-return` | Resolves the filing period, reads seller settings, delta `0.00` |
| Zakat base | 600 000 sources − 300 000 deductions | Base `300000.00`, at 2.5% due `7500.00` |
| All new routes and pages | HTTP probe | `401` / `307` — no server errors |

The zakat figure is the arithmetic check worth reading twice: 500 000 capital, 100 000 reserves and the
rest reconcile to a base and a due amount by hand — the read model is not merely returning zeroes.

---

## Database state

Three migrations are applied. The unique-index ones could not run until the duplicate vehicle rows were
resolved, which you did.

```sql
-- index type after the migrations
fleet_vehicles_plate_unique_idx       UNIQUE
fleet_vehicles_sequence_unique_idx    UNIQUE   (new)
transport_vehicles_plate_unique_idx   UNIQUE
transport_vehicles_vin_unique_idx     UNIQUE

-- entry_type check constraint
CHECK (entry_type = ANY (ARRAY['standard','adjusting','closing','reversing','opening']))

-- seeded for Acme Corp
gl_accounts         24 Saudi accounts (1150 Input VAT, 2100 Output VAT, 2110 WHT payable)
gl_payment_methods   6 methods, CASH default, each pointing at a real GL account
gl_cash_accounts     1 — Cash on hand, SAR, default
```

> **Your second organization** (`شركة ثانية`) is not seeded. Run
> `yarn mercato financial seed-defaults --org b13c3809-d2b8-4baf-b6c5-b177e5441f30 --country SA`
> if you want it to match.

---

## Open

1. **Resolve or abort the upstream merge.** Everything is unverifiable until it is settled, and it
   blocks the rest. Two of the twenty-nine conflicts are files this work touched and I can resolve
   those; the remaining twenty-seven are upstream UI and dictionary changes where you know the intent
   better than I do.
2. **ZATCA Phase 2 issuance.** The persisted XML, hash and ICV record, the submission-status record,
   and the e-invoicing screen. The chain primitives it needs already ship; it is deliberately absent so
   that nothing claims clearance it cannot deliver.
3. **Accounts payable and receivable.** Now unblocked — AP needs the withholding catalogue and
   net-of-withholding arithmetic, both of which exist.
4. **Twelve more misnamed indexes**, still plain across `hr_management`, `staff`, `entities`,
   `data_sync` and `checkout`. Left alone as a separate decision, since several live in packages with
   shipped migrations.

---

## Environment notes worth keeping

- The live app on `localhost:3000` talks to the **native Windows PostgreSQL** on `127.0.0.1:5432`, not
  the `mercato-postgres` Docker container — that container's `open-mercato` database is empty and will
  mislead you into thinking the schema was never migrated.
- Node 26 is installed while the repo pins 24.x. The OpenAPI generator's bundle step fails with
  `ERR_IMPORT_ATTRIBUTE_MISSING` and silently falls back to static extraction, so
  `openapi.generated.json` loses request/response schemas. Pre-existing, and not a symptom of a change.
- After adding an entity, the dev server must be **restarted**: HMR recompiles routes, but the ORM
  metadata is built at boot, so a new entity's routes answer `500` until then.
