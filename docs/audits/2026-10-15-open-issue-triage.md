# Open issue triage (2026-10-15)

Every open issue on 2026-10-15, checked against `main` at `261615dd`
(#610). Frozen; the issues and PRs carry the live status.

The 70 open issues split five ways:

| Outcome                         | Count | Where                                                 |
| ------------------------------- | ----- | ----------------------------------------------------- |
| Closed as done or moot          | 9     | [Closed](#closed)                                     |
| Fix PR opened                   | 22    | [PRs opened](#prs-opened)                             |
| Needs a decision from you       | 30    | [Decisions](#decisions)                               |
| Needs a dashboard or a human    | 6     | [Dashboard and human work](#dashboard-and-human-work) |
| Umbrella in progress, no action | 3     | [Umbrellas](#umbrellas-in-progress)                   |

The rest of this file is the context for the decisions. Each entry says
what the code does today, the options, and a recommendation.

## Closed

| Issue | Why                                                                                                                                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| #603  | Access codes: #605, #606, #610 all merged; #604 closed.                                                                                       |
| #567  | Checkout verification phases 1–5 on main; phase 6 is #574, now unblocked.                                                                     |
| #485  | Feature flags: every planned phase shipped; the deferred items were never scoped.                                                             |
| #473  | No `prisma.organization.findFirst` left in `apps/web`; #599, #600, #602 moved the reads.                                                      |
| #430  | `_shared/eventTicket.ts` is the one shaping module; `checkout.ts` and `events.ts` both call it.                                               |
| #458  | `checkoutError` in the checkout router maps the three service errors to tRPC codes.                                                           |
| #532  | The stepper reveal is 200ms, strong ease-out, reduced-motion aware.                                                                           |
| #317  | Recharts is only imported under `/organizer`; the App Router already splits per route.                                                        |
| #380  | Under pnpm a worktree's `pnpm install` runs the Prisma postinstall; the yarn-era failure is gone.                                             |
| #431  | Closed, then reopened the same day: `dateUtils.ts` still exports `formatCurrency`, so two money helpers still disagree. Scoped to money only. |

## PRs opened

All against `main`, one issue per PR, each with a Why, What changed and
Testing section. None has run the browser suite locally; CI runs it.

| Issue      | PR   | Change                                                                                       |
| ---------- | ---- | -------------------------------------------------------------------------------------------- |
| #612       | #613 | `useEffectEvent` clears the two `exhaustive-deps` warnings in `CheckoutSheet`.               |
| #611       | #614 | Tooltip motion: ease-out, 4px slide, instant between triggers, 100ms exit, reduced motion.   |
| #608       | #615 | Mechanical rename tier → ticket type, 14 files, seed strings included.                       |
| #324       | #616 | `prompt=select_account` on Google sign-in.                                                   |
| #310       | #617 | Root `pnpm dev` works (it called the uninstalled `npm-run-all`). Last item of that issue.    |
| #527       | #618 | Checkout state resets when the close animation ends, not on a 250ms timer.                   |
| #447       | #619 | `TT-` display numbers use 8 hex characters instead of 6. Unit test added.                    |
| #529       | #620 | Hold countdown: tabular digits and a 300ms colour transition at 60s.                         |
| #405, #323 | #622 | Migration: provision `Users` at email confirmation; trigger never throws.                    |
| #399       | #621 | Migration enables `pg_cron` and `pg_net`; runbook points at it.                              |
| #342       | #623 | Flyer remove no longer deletes from storage; `gc:flyers` sweeps unreferenced objects.        |
| #528       | #624 | Empty-selection cue works under reduced motion and replays on repeat taps.                   |
| #486       | #625 | One-line Terms · Privacy footer on public pages.                                             |
| #511, #512 | #626 | Sign-out inspects the error and the route test asserts on `Set-Cookie`.                      |
| #531       | #627 | Sheet slide, Get Tickets bar and success poster keep only the fade under reduced motion.     |
| #322       | #629 | Missing Supabase env no longer 500s every request; one loud error names the variable.        |
| #314       | #628 | `.env.example` and a short root README.                                                      |
| #460       | #631 | Expiry sweep: `take: 200`, advisory lock, `(status, expiresAt)` index, chunked Stripe calls. |
| #530       | #630 | Sheet easing, overlay sync, desktop variant, motion tokens. Land after #627 and #618.        |
| #362       | #633 | knip job in CI; shadcn exports ignored; 3 dead exports deleted. Conflicts: #629, #623.       |

Three migration PRs carry 2026-10-15 stamps: #622 (212100), #621 (220000)
and the expiry-sweep index (223000, PR pending). Any merge order passes the
order check. #622 also adds ADR 0036; 0031 is unused and 0030 is taken twice.

Review notes worth a look:

- #622 changes when `Users` rows appear (at confirmation, not at OTP
  request). Verify on its preview branch before merging; the PR lists the
  four checks. It also closes the pre-verification email-link hijack from
  the September audit.
- #626's test proves the cookie deletions sit on the returned response.
  Whether Vercel's edge orders the proxy's refreshed cookies before the
  handler's deletions could not be verified from the repo. If you want that
  risk gone, skip `updateSession` for `/auth/signout` in `proxy.ts`.
- #618 resets on the sheet's `animationend`. If the sheet is reopened within
  the 300ms close, Radix cancels the exit and the reset does not run, so the
  sheet reopens on the prior step. Judged acceptable; noted on the PR.
- #633 fails CI on unused exports outside `components/ui`, not only on
  dead dependencies. It deletes `readClaimsFromCookies` (so does #629) and
  un-exports `EVENT_FLYERS_BUCKET` (which #623's script imports). Merge
  #629 and #623 first, then rebase #633 and re-export that one constant.
- #631 keeps the ADR 0018 order. It surfaced a pre-existing gap, filed as
  #632: a hold whose Session expired but whose release failed never releases.
- #622 does not add the ANON_KEY fallback #322 asked for; CLAUDE.md forbids
  compatibility fallbacks, and the loud error names the exact variable.

## Decisions

### Product calls

**#471 — paid ticketing for role-approved organizers.** No app write path
sets `Organization.paidTicketingEnabled`; the only source is the July
backfill for owners who already had a paid ticket type. The platform payouts
panel lists Organizations with the flag but never sets it. An organizer
approved by role with only free events so far cannot publish a paid event.
Options: (1) one-off `UPDATE` grandfathering every `role = 'ORGANIZER'`
owner; (2) accept re-approval through the payout onboarding flow (#579),
which is where the flag will be set going forward. Recommendation: (2), and
close this once #579's PR A lands, because the onboarding flow is the
approval path now. If any real organizer is stuck today, run (1) for them by
hand.

**#325 — collect a name at passwordless signup.** Confirmations, receipts
and attendee lists read the reservation contact name, so the impact is now
the header avatar initial and no profile name. Draft PR #551 (OTP inside
checkout) already asks for a name. Recommendation: fold into #551 if that
plan is approved; otherwise close as not worth a signup field.

**#450 — unlimited capacity** and **#451 — reorder ticket types.** Both
deferred by design in the dashboard plan. Neither is started. Both need a
migration (`capacity` nullable; `sortOrder` column). Recommendation: keep
#451 (customer-facing order on the event page) and decide #450 only when an
organizer asks; close it until then.

**#424 — guest ticket access via `Orders.accessToken`.** The column exists
with zero readers. The routes the body names (`TicketList`, receipt page,
legacy confirmation) are deleted; the surviving routes are `/orders`,
`/orders/[orderId]` and `/orders/[orderId]/tickets`. Guests today reach
tickets only by signing in with the buyer email. Recommendation: decide
whether guest access is wanted at all. If yes, build it on the three
surviving routes (smaller than the body says). If no, drop the column in the
next migration and close.

**#414 — unified notifications.** Ten files still import `sonner`
directly; there is no `lib/notify.ts`. The plan's PR 3 alert work landed by
other means. Recommendation: close the umbrella and the plan as superseded.
A domain catalog on top of ten call sites adds a layer the app does not
need yet.

**#385, #391, #392, #393, #394 — Spotlight.** The `Spotlight` table exists
with no readers or writers. The only implementation is draft PR #436,
untouched since 2026-08-05 and now conflicting. Phase 1 (Organization brand)
shipped. Recommendation: decide whether Spotlight is still a 2026 feature.
If yes, close #436 and restart from the plan on current main (the schema is
already there). If no, close the four phase issues and the umbrella, and
drop the empty table in a migration.

**#441 — organizer dashboard day boundary is UTC.** Still true; the day
rolls at 7pm Jamaica and 8pm New York. The issue recommended the viewer's
browser zone because Organizations were single-user; Memberships now exist,
so two team members in different zones would see different "today" totals.
Recommendation: still wanted. Use the event venue zone that ADR 0021 already
stores for event-scoped views, and the browser zone (cookie plus
`x-vercel-ip-timezone`) for the cross-event dashboard. Then it is a
ready-for-agent task.

**#454 — ticket type can sell past the event end.** All three gaps intact:
no write-side check in `organizer-ticket-type-write.ts` or `ticketSchema.ts`
(only `saleEndsAt > saleStartsAt`), `getSaleState` ignores the event end,
and shortening an event does not reconcile its ticket types. One call
blocks the fix: when an organizer moves the event end earlier than a sale
window, clamp the window or block the edit. Recommendation: clamp, with the
form showing which ticket types moved. Then the issue is ready-for-agent.

**#320 — refund and void spike.** No `REFUNDED` path exists beyond the
automatic paid-after-expiry refund; every refund is a founder DB edit. The
deliverable is a plan doc. Recommendation: schedule it after #579, because
the payouts plan lists refunds as unmodelled and the two have to agree on
who eats the fee.

### Engineering calls

**#481 and #587 — teams.** #587 (draft plan, ADR 0031) proposes superseding
#481's plan; #598 (open, +741/−294, 2026-09-29) implements capability-based
roles on top of it. Both wait on your review. Recommendation: review #587
first; on approval, close #481 in favour of a new umbrella and merge #598.

**#574 — paid-path e2e.** Unblocked, but written for real Stripe test mode
with `stripe listen`, while the suite fakes Stripe (ADR 0034). The happy
path and the declined-card retry are covered already. The dead-webhook,
dead-sync and both-dead cases need the fake to play the webhook, or a
separate non-hermetic job. Recommendation: extend the fake; keep one suite.

**#563 — anti-slop oxlint plugin.** oxlint landed (#564) without the
plugin. Adding it means vendoring 15 rules and fixing the fresh findings.
Recommendation: close. The rules it adds (shoehorn in tests, no module
mocking) are style preferences the repo has not asked for since.

**#461 and #462 — checkout characterization tests and reducer.** The
browser suite now covers free, paid, declined, access code and link resume
end to end, which is the safety net #461 wanted. `CheckoutSheet` still has
12 `useState` calls. Recommendation: close #461 as superseded by the e2e
suite; keep #462 only if the sheet grows again (it did not in the access
code work).

**#459 and #426 — logging and error tracking.** `packages/api/src` has one
`console.*` call; the refund path and the `needs_refund` backstop log
nothing; no logger module, no Sentry. Recommendation: one small PR adds a
logger seam in `@troptix/api` that writes JSON to stdout (Vercel keeps it),
instrumenting the four money paths the 2026-08-21 audit lists. Choose a
vendor (#426) only if stdout logs prove not enough.

**#431 — one money formatter.** Reopened today after a wrong close. Two
helpers disagree (`utils.ts#getFormattedCurrency`, 5 files; `dateUtils.ts`
`formatCents`/`formatPriceCents`, 15 files) plus two local copies. Dates are
settled by ADR 0021. Recommendation: ready-for-agent, money only, after #615.

**#453 and #432 — consolidation.** Live duplication: PASS/ABSORB rule 4
copies, `priceCents ??` shim 4 copies, stat card 4 copies, order read shape
2 copies. Not bugs. Recommendation: ready-for-agent as two PRs (fee rule
plus price shim in `_shared`; stat card and order read), after #615 lands
to avoid rename conflicts.

**#361 — `Tickets(eventId, status)` index.** The baseline changed:
`Tickets` now has `(eventId, createdAt)`. Needs `EXPLAIN ANALYZE` on
production-sized data, which only you can run. Recommendation: run the
attendees query with `EXPLAIN (ANALYZE, BUFFERS)` on prod once; if the
planner uses the existing index, close.

**#384 — store `place_id`.** Well specified, needs a migration plus seed,
form, DTO and map link changes. Not started. Recommendation: ready-for-agent
when the next organizer form PR is open; low priority.

**#465 — Screen D phase 2 (two-column form, RSVP toggle).** Phase 1 is
done. Phase 2 is pure presentation and no PR exists. Recommendation: keep
open only if the form redesign is still planned this quarter; else close.

**#334 — graduate email orchestration when a worker lands.** No email
worker is planned; the outbox (#425) was closed. Recommendation: close; the
notes live in ADR 0017 and the issue history if a worker ever appears.

**#533, #534, #535 — checkout CTA, step transitions, success entrance.**
Wait on the motion tokens from #530 (PR in progress) and on a real-device
feel check, which is yours. Keep open; sequence after #530 merges.

## Dashboard and human work

| Issue | What only you can do                                                                                                                                                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #404  | Supabase Dashboard → Auth → Attack protection: enable Turnstile; then the form change (`captchaToken` in `signInWithOtp` and `signInWithOAuth`) needs the site key. The October comment from an outside vendor is a sales pitch; the trigger change it suggests is PR #622. |
| #407  | Supabase Dashboard → Auth → Rate limits: `email_sent`, `sign_in_sign_ups`, `token_verifications`.                                                                                                                                                                           |
| #406  | After #622 is live: run the two count queries in the issue, then the guarded delete. Destructive; not for an agent.                                                                                                                                                         |
| #578  | Stripe Workbench: create the reservation webhook endpoint pinned to `2026-06-24.dahlia`, swap the secret, delete the old one, then upgrade the account default. Step 2 is moot (the legacy endpoint is gone).                                                               |
| #584  | Reinstall the Supabase ↔ Vercel integration so preview deploys read the PR's Supabase branch. Until then every schema-changing PR fails on its preview with `P2022`. Highest leverage item on this list.                                                                    |
| #361  | One `EXPLAIN ANALYZE` on production data (above).                                                                                                                                                                                                                           |

## Umbrellas in progress

| Issue | State                                                                                                        |
| ----- | ------------------------------------------------------------------------------------------------------------ |
| #580  | Stripe Connect: PR 1 and PR 2 merged (ticked today). Open: live event destination, staff $1 payout, rollout. |
| #579  | Payout onboarding: step 3 shipped early (#591). PR A and PR B not started.                                   |
| #558  | Manual payouts: everything shipped; only removing the `organizer-payouts` flag remains, after rollout.       |

## Open PRs that look stale

Not closed; your call.

| PR               | Since      | Note                                                                                                                                                   |
| ---------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #436             | 2026-08-05 | Spotlight display and authoring, draft, conflicting. Decide with #385 above.                                                                           |
| #551             | 2026-08-25 | Plan: sign-in at checkout with OTP in the sheet, draft, +1004 lines including prototypes. Decide with #325.                                            |
| #566             | 2026-09-22 | Plan: checkout payment verification. Everything it planned shipped (#567 closed today) but the plan file is not on main. Merge it with `status: done`. |
| #586             | 2026-09-23 | Targets `claude/oxlint-migration-eval-a191a2`, not main, and that branch's work merged as #564. Retarget to main or close.                             |
| #585             | 2026-09-22 | Runbook edit, +22/−19, mergeable. Needs a read.                                                                                                        |
| #582             | 2026-09-22 | Vercel ignore-build step, mergeable. Needs a read.                                                                                                     |
| #601             | 2026-10-08 | CI: Postgres in the background. Small; needs a read.                                                                                                   |
| #595, #596, #597 | 2026-09-28 | Global Payouts plan and two stacked drafts. #595 adds ADR 0034, but main already has ADR 0034 (hermetic e2e); renumber before merging.                 |

Also: main has two ADR 0030 files (`fulfilment-is-webhook-plus-one-sync-attempt` and `stripe-is-the-payout-rail`). One needs renumbering; the checkout one is the later merge.
