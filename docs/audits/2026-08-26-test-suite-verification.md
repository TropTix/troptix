# Test-suite verification — mutation review of every test file

**Date:** 2026-08-26
**Scope:** all 32 test files (370 tests): 23 vitest files in `packages/api` (241 tests, some against real Postgres), 9 jest files in `apps/web` (129 tests).
**Method:** for each file — read the test and the code it exercises, judge the design, then mutate the source (invert conditions, drop guards, hardcode returns, perturb constants) and confirm the tests fail. A mutant the suite kills proves the test can fail; a survivor is either dead/equivalent code or a coverage hole. ~130 mutants were run in total.

## Verdict

The suite is in very good shape. Roughly 90% of mutants died on the first try. The strongest files test contracts, not implementations: the reservation concurrency test catches a removed `FOR UPDATE` against live Postgres; the flyer-theme tests assert WCAG ratios over adversarial palettes rather than exact colors; the fee and checkout tests use literal expected values so a wrong formula can't agree with itself.

Eleven surviving mutants were real weaknesses. All were fixed by strengthening **existing** tests (no new tests added; suite counts unchanged; both suites green after every fix). Seven more survivors were analyzed and judged equivalent mutants — defense-in-depth code whose removal does not change observable behavior — and are documented, not patched.

## Fixes applied (existing tests strengthened)

| File                                      | Weakness proven by a surviving mutant                                                                    | Fix                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `_shared/fees.test.ts`                    | `Math.round → floor` survived; no input had fraction ≥ .5 despite the test claiming to pin rounding      | Added `calculateFeesCents(1049) === 134`                 |
| `services/events.test.ts`                 | `min(availability, maxPurchasePerUser)` clamp — only the availability side could fail                    | Added a `capped` tier (per-user cap below availability)  |
| `services/organizer-dashboard.test.ts`    | `status: 'COMPLETED'` dropped from the revenue aggregate went unnoticed                                  | The scoping test now asserts status + event scoping      |
| `services/organizer-dashboard.test.ts`    | `toCents` round → floor/ceil undetectable with the 59.9699… literal                                      | Added 123.456 → 12346 and 10.443 → 1044 cases            |
| `services/organizer-orders.test.ts`       | `eventId` dropped from the detail `where` (sibling-event read) invisible                                 | NotFound test now asserts the captured `where`           |
| `services/organizer-orders.test.ts`       | Cents-columns preference over legacy floats untestable (fixture values agreed)                           | Fixture cents now deliberately disagree (4001/251/4252)  |
| `services/organizer-orders.test.ts`       | `cardType && cardLast4` → `\|\|` survived (both always null together)                                    | Half-present card now asserted to give no payment method |
| `services/organizer-orders.test.ts`       | Stored order `name` preference in `fullName` untested                                                    | Grace Hopper case added to the full-name test            |
| `services/organizer-ticket-types.test.ts` | Summary `onSale` counted every type — both fixture types were on sale                                    | One fixture type made Scheduled; summary expects 1       |
| `trpc/routers/organizer.test.ts`          | Boundary test accepted ANY rejection, so a loosened input schema passed (service NOT_FOUND satisfied it) | Now asserts `code: 'BAD_REQUEST'`                        |
| `apps/web auth/callback/route.test.ts`    | `tokenHash && type` → `tokenHash` survived; token_hash-without-type untested                             | Case added to the incomplete-credentials test            |
| `apps/web attendeeActions.test.ts`        | Auth-guard removal survived — `userToActor(null)`'s TypeError was caught into the same `success:false`   | Test now pins `error === 'User not authenticated'`       |

## Coverage gaps (documented, not patched)

Ranked by how much they matter.

1. **`getEventDetail` draft gate** (`packages/api/src/services/events.ts`): the `&& !event.isDraft` gate on `maxAllowedToAdd` has no test — a draft event's tiers would show as buyable and nothing fails. The equivalent gate in `getCheckoutConfig` IS tested. Highest-value missing test in the suite.
2. **`applyCode` ILIKE escaping** (`services/checkout.ts`): the `%`/`_`/`\` escaping before the `mode: 'insensitive'` lookup is security-relevant per its own comment, but the fake's `findFirst` ignores `where`, so nothing pins the escaped string. Needs an arg-capture assertion or a DB test.
3. **Select-fragment blindness** (`organizer-events.test.ts`): the completed-only `_count` filter inside `eventCardSelect` can be deleted without a failure — result-canning fakes can't see select shapes. Same class as (2). The dashboard/orders tests avoid this for top-level `where`s by capturing args; select fragments are still unpinned.
4. **`updateOrganizationProfile` blank display name** (`services/organizations.ts`): the fallback that stops a blank `displayName` overwriting the brand name is untested.
5. **`getCheckoutState` terminal branches** (`services/payments.ts`): RELEASED → `expired` and REFUNDED → `refunded` mappings untested; `beginPayment`'s guard errors (not-HELD, past-expiry, free reservation) untested.
6. **Legacy organizer surface** (`services/organizer.ts`): `getEvents`/`getEvent` wholly untested, and the fake's `updateMany` shape-matches the `where` clause instead of evaluating it, so the check-in guard's query condition isn't really pinned. File is frozen and dies with the organizer-v2 migration — low priority.
7. **Small items:** `deriveReserveItems` quantity sanitization (`Math.max(0, floor)`) — zod blocks bad values upstream; `organizationLogoUrl` + Supabase upload/delete helpers untested; ticket routes' invalid-token 403 branch untested; `ticketActions`' NotFound/Unauthorized/ZodError mappings untested; `createReservationInputSchema` bounds (quantity 1–50, items 1–20) untested directly; contact firstName/lastName rules untested.

## Equivalent mutants (accepted, no action)

- `ensureOrganizationForUser` early-return removal — the P2002 owner-index recovery still returns the winner; the test rightly pins the contract, not the implementation.
- `taken.id !== org?.id` in the slug check — unreachable behind the `nextSlug !== org?.slug` guard.
- `actor.kind !== 'user'` guard in legacy `checkInTicket` — an anonymous actor still fails the ownership comparison.
- The void-ticket guard in `toggleTicketCheckIn` — the atomic write's status allow-list still refuses the flip with a ConflictError; only the message differs.
- flyerTheme's CTA candidate filter and the wash ink `solveL` — with fixed background lightness (0.94 wash / 0.10 dark) the guarded cases cannot occur.

## Per-file review notes

### packages/api — pure/unit

- **`_shared/fees.test.ts`** — rate card: 0 for non-positive, 8% + 50¢ rounded. Literal expectations. 3/3 mutants killed after fix.
- **`_shared/slug.test.ts`** — slugify normalization, isValidSlug format/length/reserved, generateUniqueSlug suffixing/lengthening/reserved-skip/max-cap. 5/5 killed. Injected `isTaken` predicate keeps it pure.
- **`_shared/eventStatus.test.ts`** — Draft/Upcoming/Active/Past with the inclusive bounds pinned at the exact instants. 4/4 killed.
- **`contracts/reservations.test.ts`** — contact email lowercase/trim/error message. 3/3 killed.
- **`services/checkout.test.ts`** — mapping to the cents contract (fee literal, not derived), availability netting, fee absorb/pass, draft + sale-window gating, sort, price fallback, empty vs NotFound, applyCode unlock/invalid. 10/10 killed. Gap (2) above.
- **`trpc/routers/checkout.test.ts`** — adapter wiring via `createCaller`: service call, zod boundary, output shape. 3/3 killed. Other checkout procedures' wiring (createReservation, beginPayment, …) untested at router level; services covered directly.
- **`services/events.test.ts`** — event page read: fromPrice, fallbacks, saleStatus derivation and precedence, ISO dates, palette degradation, hostedBy, list where-capture. 10/10 killed after fix. Gap (1) above.
- **`services/reservations-pricing.test.ts`** — the pure pricing authority: server-derived price/fees, clamps, window/draft gates, duplicate-tier aggregation (cap bypass), deterministic sort. 7/8 killed; survivor is the upstream-guarded sanitization (gap 7).
- **`services/organizations.test.ts`** — provisioning idempotency, slug uniqueness, fallbacks, race recovery via faithful stateful fakes that mirror both unique indexes; profile update validation-before-write and both P2002 races. 9/12 killed; 2 equivalent; gap (4).
- **`services/organizer.test.ts`** — legacy check-in/undo: status/ownership/error mapping. 4/6 killed; see gap (6).
- **`services/organizer-checkin.test.ts`** — the new seam: atomic scan flip, ownership as NotFound, VALID handling, void tickets never resurrected, read/write race conflict, undo. 6/7 killed; 1 near-equivalent. Its fake evaluates `where` semantics — the fidelity the legacy fake lacks.
- **`services/organizer-scope.ts`** — no dedicated file; anonymous/pin-to-self/View-as covered thoroughly through the dashboard, events, overview, orders, and ticket-types suites (mutated directly: 3/3 killed).
- **`services/organizer-dashboard.test.ts`** — auth seam, cents boundary, capacity/status shaping, zero-filled trend, all four range windows with boundary-instant behavior, revenue-window scoping, setup state. 14/14 killed after 2 fixes.
- **`services/organizer-events.test.ts`** — list read: scoping, status derivation, capacity, sold, empty. 4/5 killed; survivor is gap (3).
- **`services/organizer-event-overview.test.ts`** — vitals, per-type breakdown, the sold-vs-issued domain rule (orphaned tickets), 30-day capped zero-filled series with inclusive today, check-in summary, recent orders. 10/10 killed.
- **`services/organizer-orders.test.ts`** — list scoping/caps/PENDING exclusion, detail line-item grouping (paid price, not list price; deleted types; legacy fallback), payment method, name resolution. 11/11 killed after 4 fixes.
- **`services/organizer-ticket-types.test.ts`** — sale-state boundaries (inclusive edges), gross vs display price both fee structures, free-type invariant, per-type revenue, summary-equals-rows. 8/8 killed after 1 fix.
- **`services/organizer-event-write.test.ts`** + **`.db.test.ts`** — paid gate (including before-any-write ordering), draft creation, org brand mirror, verbatim dates (the matched-pair rule), cents+float rows, ownership scoping; the DB twin proves the same against real Postgres with the auto-provisioned org. 12/12 killed.
- **`services/organizer-ticket-type-write.test.ts`** + **`.db.test.ts`** — ownership through the event join, paid gate incl. missing org, grandfathering (cents and float-only rows), FREE/PAID derivation, immutable ids. 8/8 killed.
- **`trpc/routers/organizer.test.ts`** — legacy router error mapping. 3/3 killed after fix.

### packages/api — real Postgres

- **`services/reservations.test.ts`** — the headline guarantees: 8-way concurrent grab of the last ticket grants exactly once; clamp+wasAdjusted; confirm atomic + idempotent; release/expire idempotent; server pricing on createReservation; completeFree free-only + idempotent. 9/9 killed — including removing `FOR UPDATE`, which the concurrency test caught live.
- **`services/payments.test.ts`** — settle (HELD, concurrent webhook+poll, expiry re-acquire, needs_refund without leaking `reserved`), confirmPaid auto-refund idempotency + analytics capture gating, beginPayment session create/reuse/retry-key/hold refresh/statement descriptor, getCheckoutState, sweepExpiredHolds cancel-then-release. 13/13 killed. Gap (5).

### apps/web

- **`lib/appUrl.test.ts`** — env precedence and path joining. 4/4 killed.
- **`lib/flyerTheme.test.ts`** — WCAG invariants across adversarial palettes; chosen-accent and grayscale-dominant behavior; null contract. 2/4 killed, 2 equivalent. The best-designed file in the suite.
- **`lib/supabase/storage.test.ts`** — `eventFlyerUrl` contract (ADR 0016). 3/3 killed. Gap (7) for the sibling helpers.
- **`server/authUser.test.ts`** — the identity boundary: uid is `Users.id`, never the auth `sub`; null paths; env guard; token vs cookie. 7/7 killed.
- **`app/api/events/[eventId]/route.test.ts`** — status codes and the draft/soft-delete query filters (honestly commented as shape-only). 4/4 killed.
- **`app/api/organizer/__tests__/ticketRoutes.test.ts`** — deprecated REST adapters: auth, zod-before-service, error mapping, caller-as-actor. 6/6 killed.
- **`app/auth/callback/route.test.ts`** — open-redirect protection over 7 adversarial `next` shapes, both auth flows, failure redirects. Killed after 1 fix.
- **`attendeeActions.test.ts`** / **`ticketActions.test.ts`** — server-action adapters: session handling, dollars→cents at the edge, revalidate path from the mutation's own result, error mapping. 8/8 killed after 1 fix.

## Method notes

Mutants were applied with `sed` against the source, the relevant test file(s) run, and the source restored from git after each. DB-backed runs used the same per-run fixture ids and FK-scoped teardown the tests use, so failed runs left nothing behind. A handful of multiline sed expressions did not apply; each such behavior was covered by an alternate mutant or existing kill.
