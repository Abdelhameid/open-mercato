# Public delivery-note share links

**Created:** 2026-11-24
**Status:** Implemented
**Companions:** [`2026-11-21-leandispatcher-feature-parity.md`](../plans/2026-11-21-leandispatcher-feature-parity.md)

## Problem

The delivery note is the document a consignee, broker or customer needs at the
gate, but sharing it required a staff login or a manual PDF. The parity matrix
listed "public share link for a document" as missing.

## Design

- `freight_delivery_notes.share_token` (nullable, unique partial index where set
  and not deleted) holds an opaque URL-safe token created on demand.
- Only **issued** or **delivered** notes can be shared; draft and cancelled notes
  are refused.
- The staff share action (`freight_operations.delivery_notes.share`) reuses an
  existing token or mints one. It runs through the command bus with the normal
  optimistic-lock header and audit log.
- The public endpoint `GET /api/freight_operations/public/delivery-note?token=…`
  has no authentication: possession of the token is the authorization. It
  returns a deliberately limited projection — note number/status, seller and
  customer display names, consignee name, order/trip number, lane, cargo
  description/quantity/weight/volume/hazard flags/seal, driver name, vehicle
  plate, issued/delivered timestamps, receiver name and POD reference.
  It never returns ids, tenant/organization scope, prices, phone numbers or
  addresses.
- The public page `/track/note/<token>` renders a clean, print-friendly document
  with a Print button. It is `navHidden` and unauthenticated.
- Staff get a "Copy share link" row action on issued/delivered notes; the
  absolute `/track/note/…` URL is copied to the clipboard.

## API

| Route | Auth | Purpose |
|---|---|---|
| `POST /api/freight_operations/delivery-notes/share` | `freight.delivery_notes.manage` | Mint/reuse the token; returns `{ token, path }`. |
| `GET /api/freight_operations/public/delivery-note?token=…` | none | Limited read of an issued/delivered note. |

## Security and abuse

- 192 bits of randomness (`randomBytes(24).base64url`), so guessing is
  infeasible.
- The token is not enumerable and only exists after a staff action.
- A soft-deleted or cancelled note is no longer served.
- The projection is allow-listed field by field; unknown/added internal fields
  never leak automatically.
- `Cache-Control: no-store` on the public read.

## Tests

- Integration `TC-FREIGHT-019`: order → issued delivery note → share → public
  fetch without auth returns the document fields and omits internal ids/contact
  fields; an invalid token returns 404.

## Risks

| Risk | Mitigation |
|---|---|
| Link shared too broadly | Limited projection; staff can cancel the note to revoke; token rotation can be added later. |
| Token in referrer/logs | Token is in a query string; the public page has no external assets and `no-store`. A future hardening can move it to a path segment. |
| Stale document view | The page reads live row state; a cancelled note stops resolving. |
