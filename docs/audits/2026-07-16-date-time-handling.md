# Date & Time Handling — Product-Wide Audit

**Date:** 2026-07-16
**Scope:** every read and write of a date or time across `apps/web`, `apps/organizer`, `apps/organizer-v2`, `packages/api`, `packages/db`, `packages/transactional`, `supabase/`.
**Status:** point-in-time snapshot. Frozen on write.

---

## Summary

The storage and service layers are correct and timezone-agnostic. **Every defect is in the display layer**, and they all trace to one root cause:

> **TropTix has no concept of an event's timezone.** Nothing in the schema records where — in wall-clock terms — an event happens. So every rendering site invents an answer, and they disagree.

Three different answers are in production simultaneously:

| Answer                                | Mechanism                                                                                    | Where                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **America/New_York**, hard-pinned     | `dateUtils.ts` (`formatInTimeZone`), and a _separately duplicated_ copy in the email package | Order pages, receipt, public event meta row, confirmation email               |
| **The server's zone** = UTC on Vercel | `date-fns` `format()` / `toLocale*` inside async Server Components                           | Nearly all of the organizer dashboard, platform admin, orders list            |
| **The viewer's device zone**          | `toLocale*` inside `'use client'` components                                                 | Public event page hero, checkout sheet, success screen, **the ticket itself** |

The same `Events.startDate` instant is rendered in all three zones in different places — sometimes **within a single page**.

---

## Layer 1 — Storage: sound

Every `DateTime` column is Postgres `TIMESTAMP(3)` — _without_ time zone. No `timestamptz` anywhere; `@db.Timestamptz` is never used.

Despite the no-tz column type, **stored values are unambiguous UTC instants**, guaranteed by the Prisma 7.8 `@prisma/adapter-pg` round trip (verified in `node_modules/@prisma/adapter-pg/dist/index.js`):

- **Write** — `formatDateTime()` (line 389-392) serializes the JS `Date`'s **UTC** digits: `date.getUTCFullYear()`, `getUTCMonth()`, `getUTCHours()`…
- **Read** — `normalize_timestamp()` (line 307-309) takes the bare digits back and appends `+00:00` before parsing.

Write-UTC / read-as-UTC ⇒ lossless, instant-preserving. **This is the load-bearing fact that makes the rest fixable:** no data is currently wrong at rest.

### Column inventory

| Model                            | Column                                | Nullable  | Default                    | Meaning                                            |
| -------------------------------- | ------------------------------------- | --------- | -------------------------- | -------------------------------------------------- |
| Events                           | `startDate`, `endDate`                | No        | app-supplied               | Full event start/end instant (ADR 0020)            |
| Events                           | `createdAt`, `updatedAt`, `deletedAt` | No/No/Yes | `now()` / `@updatedAt` / — | Row lifecycle                                      |
| TicketTypes                      | `saleStartDate`, `saleEndDate`        | No        | app-supplied               | Sale window (legacy split date)                    |
| TicketTypes                      | `saleStartTime`, `saleEndTime`        | Yes       | —                          | **Dead** — nothing has written these since PR #192 |
| TicketTypes                      | `saleStartsAt`, `saleEndsAt`          | Yes       | —                          | Sale window (single-DateTime, roadmap 2.10)        |
| TicketTypes                      | `createdAt`, `updatedAt`              | No        | `now()` / `@updatedAt`     |                                                    |
| Reservation                      | `expiresAt`                           | No        | app-supplied               | Hold TTL deadline                                  |
| Reservation                      | `createdAt`, `updatedAt`              | No        | `now()` / `@updatedAt`     |                                                    |
| Tickets                          | `checkinTimestamp`                    | Yes       | —                          | Set when scanned at the door                       |
| Tickets                          | `createdAt`, `updatedAt`              | No/Yes    | `now()` / `@updatedAt`     |                                                    |
| Orders                           | `createdAt`, `updatedAt`              | **Yes**   | `now()` / `@updatedAt`     |                                                    |
| Organization                     | `paidTicketingRequestedAt`            | Yes       | —                          | ADR 0019 capability gate                           |
| Organization / Spotlight / Users | `createdAt`, `updatedAt`              | No        | `now()` / `@updatedAt`     |                                                    |
| OutboxMessage                    | `createdAt`, `processedAt`            | No/Yes    | `now()` / —                |                                                    |
| ProcessedStripeEvent             | `processedAt`                         | No        | `now()`                    | Webhook idempotency                                |

### Two storage caveats

1. **`DEFAULT CURRENT_TIMESTAMP` bypasses the adapter.** Every `createdAt` default is evaluated inside Postgres. `CURRENT_TIMESTAMP` is `timestamptz`; casting it to `timestamp(3)` uses the session's `timezone` GUC. Nothing in this repo pins that GUC — it relies on the Supabase image defaulting to UTC. An environmental assumption, not a guarantee.
2. **`supabase/seed.sql` literals are ambiguous.** `'2026-08-15 18:00:00'` inserted into a no-tz column is stored verbatim — Postgres applies no interpretation. Given the app's UTC round trip, that value means **18:00 UTC** = 1:00 PM in Kingston. The seed's venues are in Kingston. Whether "18:00" meant UTC or local is unrecorded. The same file also mixes `now()` and `now() + interval '7 days'` (session-tz-dependent casts) with bare literals in the same rows.

---

## Layer 2 — Service: sound

`packages/api` and `apps/web/src/server` are **completely timezone-blind**, and that is correct. Every comparison is raw instant arithmetic (`Date.now()`, `.getTime()`, `<`/`>`), which is tz-agnostic by definition. No `America/…`, no fixed offset, no local-time accessor anywhere in this layer.

| Concern                      | Site                                                     | Mechanism                                         |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------- |
| Event lifecycle status       | `packages/api/src/services/_shared/eventStatus.ts:27-28` | `now < startDate` / `now > endDate`               |
| Sale window (checkout)       | `packages/api/src/services/checkout.ts:73`               | `now >= saleStartsAt && now <= saleEndsAt`        |
| Sale window (event detail)   | `packages/api/src/services/events.ts:140`                | **Duplicate** of the above, independently written |
| Discover listing filter      | `packages/api/src/services/events.ts:35`                 | `endDate: { gt: new Date() }`                     |
| Org page bucketing           | `packages/api/src/services/organizations.ts:242`         | `endDate.getTime() > now`                         |
| Reservation hold             | `packages/api/src/services/reservations.ts:126`          | `new Date(Date.now() + ttl*60_000)`               |
| Hold expiry sweep            | `packages/api/src/services/reservations.ts:672`          | `expiresAt: { lt: now }`                          |
| Payment guards / TTL refresh | `packages/api/src/services/payments.ts:64,95,293,330`    | epoch-ms compares                                 |
| Stripe session cap           | `packages/api/src/services/payments.ts:152`              | `Math.floor(Date.now()/1000) + 7200`              |
| Order invalidation cron      | `apps/web/src/app/api/cron/invalidate-orders/route.ts:9` | `new Date(Date.now() - 5*60000)`                  |
| Publish validation           | `apps/web/src/lib/validations/publishValidation.ts:125`  | `event.endDate <= now`                            |

**Nothing to fix here.** But note the flip side: this layer provides _no correction_ for an upstream mistake. Whatever instant the form sends is stored and compared verbatim.

---

## Layer 3 — Display: three timezones, no policy

### 3a. The event-creation input path

This is where the ambiguity originates.

| Site                                                    | Mechanism                                               | Zone              |
| ------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| `apps/web/src/lib/dateUtils.ts:39-50` `combineDateTime` | `newDate.setHours(h, m, 0, 0)`                          | **Browser-local** |
| `apps/web/src/lib/dateUtils.ts:52-55` `formatTime`      | `date.toTimeString().slice(0,5)`                        | **Browser-local** |
| `EventForm.tsx:395-461`                                 | date picker + `<input type="time">` → `combineDateTime` | Browser-local     |
| `AddTicketTypeDrawer.tsx:246-316`                       | same pattern for sale window                            | Browser-local     |
| `CreateTicketTypeForm.tsx:267-324`                      | same pattern                                            | Browser-local     |

**Consequence:** the instant stored for "7:00 PM" depends entirely on the timezone of the organizer's browser at the moment they typed it. An organizer in Kingston creating a Kingston event stores 19:00 America/Jamaica = 00:00Z — correct by luck. The same organizer travelling, or a team member abroad, silently stores a different instant for the same intended wall-clock time. There is no timezone selector anywhere in the event or ticket forms.

Note `dateUtils.ts` contains **two contradictory timezone philosophies in one file**: the display formatters hard-pin New York; `combineDateTime`/`formatTime` pin nothing.

### 3b. Fixed America/New_York (`TZ:FIXED-NY`)

| Site                                                                  | Field                    | Format                                                                            |
| --------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------- |
| `apps/web/src/lib/dateUtils.ts:3-6` `getDateFormatter`                | any                      | `'MMM dd, yyyy, h:mm a'` @ America/New_York                                       |
| `apps/web/src/lib/dateUtils.ts:8-25` `getDateRangeFormatter`          | start+end                | `'EEEE MMM dd, yyyy'` @ NY                                                        |
| `apps/web/src/lib/dateUtils.ts:27-29` `getTimeRangeFormatter`         | start+end                | `'h:mm a'` @ NY                                                                   |
| `orders/[orderId]/page.tsx:170,209`                                   | `startDate`, `createdAt` | `getDateFormatter`                                                                |
| `orders/[orderId]/receipt/page.tsx:216,265`                           | `createdAt`, `startDate` | `getDateFormatter`                                                                |
| `orders/page.tsx:98`                                                  | `startDate` (date only)  | `getDateFormatter(d,'MMM dd, yyyy')`                                              |
| `components/EventCard.tsx:20`                                         | `startDate` (fallback)   | `getDateFormatter(d,'MMM dd, yyyy')`                                              |
| `e/[eventId]/_components/EventPageClean.tsx:363-364`                  | `startDate`/`endDate`    | range formatters                                                                  |
| `packages/transactional/emails/EmailConfirmation.tsx:119,121,261-281` | `startDate`, `endDate`   | **own** `Intl.DateTimeFormat` + **own** `TIME_ZONE = 'America/New_York'` constant |

`packages/transactional` has **no `date-fns` dependency at all** — it re-implements the NY convention by hand. The two copies agree today; nothing keeps them in sync.

### 3c. Server-runtime = UTC on Vercel (`TZ:RUNTIME`, server)

Every one of these renders **UTC** in production.

| Site                                                      | Field                       | Mechanism                                          |
| --------------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| `organizer/events/page.tsx:18-19,130-133`                 | `startDate`                 | `toLocaleDateString` + `toLocaleTimeString`        |
| `organizer/events/[eventId]/page.tsx:121,128`             | `createdAt`, `startDate`    | `format(d,'PP')`, `format(d,"PPP 'at' p")`         |
| `organizer/platform/events/page.tsx:233,236`              | `startDate`                 | `format(d,'MMM d, yyyy')`, `format(d,'h:mm a')`    |
| `organizer/page.tsx:99-101,212-214`                       | order/event day strings     | `new Date(s+'T00:00:00').toLocaleDateString`       |
| `orders/page.tsx:99`                                      | `startDate` **time-of-day** | `formatTime` → `toTimeString()`                    |
| `orders/page.tsx:92`                                      | `startDate`                 | `.toDateString() === now.toDateString()` (isToday) |
| `orders/page.tsx:311`                                     | `createdAt`                 | `.toLocaleDateString()` bare                       |
| `organizer/events/[eventId]/_lib/getEventOverview.ts:288` | order `createdAt`           | `.toLocaleDateString()` — **no args at all**       |
| `organizer/_lib/getEventsData.ts:47-57`                   | `startDate`/`endDate`       | `setHours(0,0,0,0)` day-boundary status            |
| `organizer/platform/_lib/getPlatformEventsData.ts:88-98`  | `startDate`/`endDate`       | same                                               |
| `organizer/_lib/getDashboardData.ts:8-13,48,75`           | `endDate`, cutoffs          | `setHours(0,0,0,0)`                                |

### 3d. Viewer's device zone (`TZ:RUNTIME`, client)

| Site                                                                             | Field                         | Mechanism                                                          |
| -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------ |
| `e/[eventId]/_components/EventPageClean.tsx:218-226`                             | `startDate`                   | `toLocaleDateString` + `toLocaleTimeString` (hero chip)            |
| `e/[eventId]/_components/PaymentStep.tsx:41-49`                                  | `startDate`                   | `toLocaleDateString` + `toLocaleTimeString`                        |
| `e/[eventId]/_components/SuccessTicket.tsx:26-31`                                | `startDate`                   | `toLocaleDateString` + `toLocaleTimeString`                        |
| `orders/[orderId]/tickets/_components/TicketDisplay.tsx:32-38,156`               | `startDate`                   | `toLocaleString(undefined, …)` — **`undefined` locale too**        |
| `organizer/events/[eventId]/tickets/_components/TicketTable.tsx:110,121,266-267` | `saleStartDate`/`saleEndDate` | `.toLocaleDateString()` bare                                       |
| `organizer/.../orders/_components/OrderTable.tsx:93-95,192`                      | `createdAt`                   | `format(d,'MMM d, yyyy')`, `format(d, isMobile?'MM/dd/yy':'PPpp')` |
| `organizer/.../orders/_components/OrderDetails.tsx:31-32`                        | `createdAt`                   | `format(d,'PPP p')`                                                |
| `organizer/_components/TicketSalesChart.tsx:95-99`                               | chart ticks                   | `new Date(v+'T00:00:00').toLocaleDateString`                       |
| `organizer/.../DailyRevenueChart.tsx:34-40`                                      | chart ticks                   | `format(new Date(v+'T00:00:00'),'MMM d')`                          |
| `components/DatePicker.tsx:37`                                                   | picker label                  | `format(d,'LLL dd, y')`                                            |
| `components/EventCard.tsx:11-21`                                                 | `startDate`                   | `.toDateString()` day-bucket, then NY fallback                     |

### 3e. UTC-day bucketing in analytics

| Site                                                          | Mechanism                               |
| ------------------------------------------------------------- | --------------------------------------- |
| `organizer/_lib/getDashboardData.ts:126-165`                  | `.toISOString().split('T')[0]` day keys |
| `organizer/events/[eventId]/_lib/getEventOverview.ts:294-302` | `.toISOString().split('T')[0]` day keys |

Sales are bucketed into **UTC** calendar days. A 9pm Kingston sale lands on the next day's bar.

---

## Confirmed defects

Ordered by customer impact.

1. **The ticket shows the wrong time.** `TicketDisplay.tsx:32-38` renders event start with `toLocaleString(undefined, …)` — the _ticket holder's device_ zone, and their device _locale_. A visitor from London holding a Kingston ticket sees a start time 5-6 hours off, on the artifact they present at the door. Highest-risk finding in the product.

2. **One page, two different times.** `EventPageClean.tsx` renders the same `start` Date twice: line 220-226 (hero chip, browser zone) and line 363-364 (meta row, NY). Any non-Eastern visitor sees two different clock times for one event on one screen.

3. **An NY date beside a UTC time.** `orders/page.tsx:98-99` — `date:` via `getDateFormatter` (NY), `time:` via `formatTime` (server runtime = UTC), rendered adjacently on the same card. Off by 4-5 hours, always, in production.

4. **Three zones across one purchase funnel.** A non-Eastern buyer sees the event start in their own zone in the checkout sheet (`PaymentStep`), their own zone on the success screen (`SuccessTicket`), and NY in the confirmation email (`EmailConfirmation`) — three different clock times for one instant.

5. **The whole organizer dashboard renders UTC.** Every site in §3c. Evening events display on the wrong calendar day; Active/Past/Upcoming badges flip 4-5 hours early.

6. **`America/New_York` is wrong for Jamaica — for eight months a year.** `America/Jamaica` does not observe DST (UTC-5 year-round). `America/New_York` shifts to UTC-4 from March to November. Every NY-pinned rendering of a Jamaican event is **one hour late** for ~two-thirds of the year. The seed venues are all in Kingston.

7. **Revenue charts attribute evening sales to the wrong day** (§3e).

8. **Stored instants depend on the organizer's browser zone** (§3a). No timezone selector exists.

### Non-defects worth recording

- Reservation holds, Stripe session caps, sale-window comparisons, and the expiry sweep are all instant arithmetic — **correct**, and correct for the right reason.
- `supabase/migrations/20260716120000_events_single_datetime.sql` does `date_trunc`/`::time` on two no-tz values — no timezone involvement, safe by construction.

---

## Format sprawl

For **"an event's start date and time"** alone, the repo contains:

- **4 formatting mechanisms** — `date-fns` tokens, `date-fns-tz` via `dateUtils.ts`, native `Intl`/`toLocale*`, and a bespoke `Intl` wrapper in the email package.
- **~14 distinct format specs**, including: `'MMM dd, yyyy, h:mm a'`, `'MMM dd, yyyy'`, `'EEEE MMM dd, yyyy'`, `'h:mm a'`, `'MMM d, yyyy'`, `"PPP 'at' p"`, `'PP'`, `'PPpp'`, `'PPP p'`, `'MM/dd/yy'`, `'LLL dd, y'`, `{dateStyle:'medium'}`, `.toLocaleDateString()` bare, `.toDateString()`.
- **6+ independently written local helpers** named `formatDate` / `formatEventTime`, in `organizer/events/page.tsx:19`, `OrderDetails.tsx:31`, `DailyRevenueChart.tsx:34`, `TicketDisplay.tsx:32`, `EmailConfirmation.tsx:277`, `organizer-v2/app/event/[id].tsx:36`.
- **3 timezone behaviours** — pinned NY, unpinned local, and one explicit `undefined` locale.

Same instant, up to five renderings: `Jul 15, 2026, 6:00 PM` · `Wed, Jul 15 · 6:00 PM` · `July 15th, 2026 at 6:00 PM` · `7/15/2026` · `18:00`.

Adjacent finding: **three separate `formatCurrency` implementations** (`platform/events/page.tsx:54`, `DailyRevenueChart.tsx:27`, `OrderDetails.tsx:24`) plus a fourth exported from `dateUtils.ts` that **has no callers**. They disagree on fraction digits.

---

## Mobile apps

| App                 | Verdict                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/organizer`    | Real screens and hooks, own `yarn.lock`. Last _feature_ commit 2025-08-10; only touched since for a dependency patch (#339, 2026-06-17). Uses `date-fns`: `format(d,'MMM dd, yyyy') + ' at ' + format(d,'hh:mm a')` (`app/(tabs)/index.tsx:22`), `.toDateString()` (`app/event/scanner.tsx:53-54`). |
| `apps/organizer-v2` | Design prototype. 2 commits; every screen reads `data/stub.ts`. No `date-fns`; raw `Intl`/`toLocale*` (`app/(tabs)/index.tsx:54-61,146`, `app/event/[id].tsx:36-49`).                                                                                                                               |

Neither shares a formatting approach with the web app, or with each other.

---

## Dead code found in passing

- `apps/web/src/server/lib/eventHelper.ts` — both exports have zero callers.
- `packages/api/src/services/_shared/eventStatus.ts` — zero importers, despite its docstring claiming it is "shared by every organizer read". A second, independently written `getEventStatus` lives at `organizer/events/[eventId]/_lib/getEventOverview.ts:79`.
- `TicketTypes.saleStartTime` / `saleEndTime` — nothing has written them since PR #192. The `Events` equivalents were dropped in ADR 0020; the `TicketTypes` pair remains.
- `dateUtils.ts` `formatCurrency` — no callers.
- `organizer/events/[eventId]/page.tsx:37` — imports `differenceInDays`, `isValid`; neither used.
- `TicketTable.tsx:131-136` and `:386-388` — two identical "is on sale" implementations.
- Sale-window logic duplicated between `checkout.ts:73` and `events.ts:140`.
