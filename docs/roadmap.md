# TropTix Technical Roadmap

## Why This Document Exists

TropTix is live and serving real events. As we grow, several issues in the codebase need to be addressed — some are bugs that directly affect revenue and trust, others are structural changes that will make the platform more reliable and easier to build on. This document lays out every planned change, why it matters, and the order we should tackle them.

---

## Priority 1 — Critical Bug Fixes

These are issues in the live system that can lose us money or break trust with organizers and attendees. No architectural changes required — just targeted fixes to existing code.

### 1.1 Two people can buy the last ticket at the same time

**The problem:** When someone checks out, the system reads the available ticket count, confirms there's stock, and creates the order. But if two buyers hit checkout at the exact same moment, they both read the same count, both see "1 remaining," and both get through. We've sold a ticket that doesn't exist.

**Why it matters:** Overselling means we either have to cancel a paid customer's order (terrible experience, potential chargeback) or allow more people into a venue than capacity permits (liability issue). This is especially likely during high-demand on-sale moments.

**The fix:** Add database-level locking so that checkout requests for the same ticket type are processed one at a time, not in parallel.

---

### 1.2 Payment confirmation can partially fail

**The problem:** When Stripe tells us a payment succeeded, we update the order status, update each ticket's status, and increment the sold count for each ticket type — but these are separate database operations. If one fails partway through (e.g., a network blip), some ticket types get updated and others don't. The data is now inconsistent.

**Why it matters:** Inconsistent data means our inventory counts drift from reality. An organizer might see "50 sold" when the real number is 48 or 52. Over time this erodes trust in the dashboard numbers and can cause overselling or underselling.

**The fix:** Wrap all payment confirmation database updates in a single transaction — either everything succeeds or nothing does.

---

### 1.3 Stripe API version mismatch

**The problem:** Different parts of our code talk to Stripe using different API versions (2020, 2023, and 2024). Stripe changes the shape of its responses between versions, so the data we send to Stripe in checkout might look different from what we expect to receive back in the webhook.

**Why it matters:** This can cause subtle, hard-to-debug issues — fields missing or renamed between versions. It's a ticking time bomb that will eventually cause a payment to not be recorded correctly.

**The fix:** Create a single shared Stripe client with one pinned API version used everywhere.

---

## Priority 2 — Database Redesign

These changes restructure our data model to be cleaner, more accurate, and ready for future features. We should do these after the bug fixes above, so we don't have to rewrite the fix code.

### 2.1 Remove unused tables

**What:** Delete the `SocialMediaAccounts`, `DelegatedUsers`, and `Promotions` tables.

**Why:** These tables are defined in the database but aren't used by any live feature. Keeping dead schema around adds confusion when reading the codebase and increases the surface area we have to maintain during migrations.

---

### 2.2 Standardize table names

**What:** Rename all tables from plural to singular form — `Users` → `User`, `Events` → `Event`, `Orders` → `Order`.

**Why:** Consistency. Singular names are the industry convention for database models (each row is one User, not many Users). This also makes the code read more naturally everywhere we query the database.

---

### 2.3 Clarify ticket model naming

**What:** Rename `TicketTypes` → `EventTicket` (the ticket offerings an organizer creates) and `Tickets` → `OrderTicket` (the actual tickets someone buys in an order).

**Why:** "TicketTypes" vs "Tickets" is confusing — both sound like they could be the same thing. `EventTicket` (what's for sale) vs `OrderTicket` (what was purchased) immediately communicates the distinction to anyone reading the code or the database.

---

### 2.4 Move order type to the order level

**What:** Remove the FREE/PAID/COMPLEMENTARY designation from individual tickets and add it as a `type` field on the Order instead.

**Why:** Whether a transaction is free, paid, or complementary is a property of the whole order, not each ticket line item. Storing it per-ticket is redundant and forces unnecessary conditional logic throughout the checkout code.

---

### 2.5 Meaningful ticket statuses

**What:** Replace the current ticket statuses (`AVAILABLE` / `NOT_AVAILABLE`) with `VALID`, `USED`, `CANCELLED`, and `REFUNDED`.

**Why:** The current statuses are confusing and overloaded. `NOT_AVAILABLE` currently means "payment hasn't been confirmed yet" during checkout but "this ticket was already scanned" at the door. There's also no way to distinguish a refunded ticket from one that was never paid for. The new statuses map directly to the real lifecycle of a ticket.

---

### 2.6 Rename discount code to password

**What:** Rename the `discountCode` field on ticket offerings to `password`.

**Why:** This field is used to gate access to password-protected ticket types (e.g., VIP tickets that only people with the code can see). Calling it "discountCode" is misleading — it doesn't apply a discount, it unlocks visibility. The name should match what it actually does.

---

### 2.7 Remove redundant name fields

**What:** Drop the `name` field from both the Order and User tables, keeping only `firstName` and `lastName`.

**Why:** Both tables already have `firstName` and `lastName`. The extra `name` field is redundant, sometimes out of sync, and creates ambiguity about which one is the source of truth.

---

### 2.8 Rename organizer to host name

**What:** Rename the `organizer` field on Events to `hostName`.

**Why:** `organizer` looks like it should be a reference to an organizer record, but it's actually just a display name string. `hostName` makes it immediately clear this is a label, not a relation.

---

### 2.9 Make audit timestamps mandatory

**What:** Ensure `createdAt` and `updatedAt` are required (non-nullable) on every table.

**Why:** On the Orders table, `createdAt` is currently optional. Our cleanup job compares against `createdAt` to find expired orders — if it's ever null, that order could slip through the cracks. Audit timestamps should never be missing.

---

### 2.10 Simplify date and time fields

**What:** Collapse the split date/time fields into single DateTime fields. On Events: `startDate` + `startTime` + `endDate` + `endTime` become `startsAt` and `endsAt`. On ticket offerings: same pattern becomes `saleStartsAt` and `saleEndsAt`.

**Why:** Having date and time in separate columns forces every piece of code that needs the actual moment to merge them together — and some places don't bother (our sale window check currently ignores the time columns entirely, meaning a ticket set to go on sale at 10am is actually available at midnight). A single DateTime field is what the database stores natively and eliminates this class of bugs.

---

### 2.11 Track when attendees check in

**What:** Add a `checkinTimestamp` field on each purchased ticket (OrderTicket).

**Why:** When a ticket is scanned at the door, we currently flip a status flag but don't record *when* it happened. Without timestamps, organizers can't see check-in patterns (e.g., "80% of attendees arrived in the first hour"), and we have no audit trail for disputes ("I was there on time but they said I wasn't").

---

### 2.12 Store money as whole cents

**What:** Change all price fields from decimal (Float) to integer cents. `$19.99` is stored as `1999`.

**Why:** Floating-point math causes rounding errors with currency. `$19.99 * 3` can equal `$59.96999...` in floating point. Our code already has workarounds for this (`Math.round`, `parseFloat(...toFixed(2))`) — storing in cents eliminates the problem at the source and removes those hacks. This is how Stripe stores money, so it also eliminates conversion bugs.

---

### 2.13 Compute availability instead of tracking a counter

**What:** Remove the `quantitySold` counter from ticket offerings. Instead, calculate availability by counting actual purchased tickets with active (non-cancelled) orders.

**Why:** The counter is the root cause of bug 1.1 — it drifts whenever the cleanup job or payment webhook partially fails. Counting real records is always accurate because it's the source of truth. Our checkout code already partially does this (it counts pending and completed tickets); we just need to make it the only method and remove the counter.

---

## Priority 3 — Codebase Cleanup

Quality-of-life improvements for development speed and reliability. Can be done alongside or after the schema work.

### 3.1 Remove Ant Design dependency

**What:** Replace the one Ant Design spinner component with a simple Tailwind CSS spinner. Uninstall `antd` and `@ant-design/icons`.

**Why:** We use Ant Design for exactly one component (a loading spinner), but it pulls in 30+ sub-packages into our bundle. This bloats our install size, slows builds, and increases the JavaScript shipped to users' browsers. Every other component already uses our Tailwind-based UI library.

---

### 3.2 Eliminate dual routing

**What:** Move the Stripe webhook from the legacy Pages Router (`src/pages/`) to the App Router (`src/app/`). Delete the `src/pages` directory entirely.

**Why:** Running both Next.js routers simultaneously causes confusing behavior, prevents full adoption of modern Next.js features, and means we have two different patterns for the same thing. The only file keeping the Pages Router alive is the Stripe webhook — once moved, we can delete the entire legacy directory.

---

### 3.3 Remove unsafe type annotations

**What:** Replace ~21 instances of `any` types with proper TypeScript types and enable strict `noImplicitAny`.

**Why:** `any` disables TypeScript's ability to catch bugs at compile time. Several of these are in critical paths — the order helper functions accept untyped parameters, meaning you could pass the wrong data shape and TypeScript wouldn't warn you. Fixing these makes refactoring safer and onboarding faster.

---

### 3.4 Validate all API inputs

**What:** Add Zod schema validation to every API route. Currently none of our 11 API routes validate incoming request data on the server.

**Why:** Without server-side validation, malformed or malicious requests hit the database directly. This can cause cryptic error messages, unexpected behavior, or in the worst case, data corruption. Validation is especially important for the checkout route where money is involved.

---

### 3.5 Add database indexes

**What:** Add indexes on frequently queried columns: order status, ticket status, and organizer user ID on events.

**Why:** As events grow, queries that filter by status (the cleanup job, availability checks, dashboard queries) will slow down without indexes. Adding them now is trivial; adding them after performance degrades means firefighting.

---

## Priority 4 — Future Migrations

These are larger architectural shifts to plan as separate projects once the above work stabilizes the current system.

### 4.1 Prisma → Drizzle ORM

Move from Prisma to Drizzle for database management. Drizzle gives us better control over database transactions (needed for the locking patterns in bug 1.2), native support for Postgres functions, and keeps schema definitions, queries, and migrations all in TypeScript. We should do this after the schema redesign is complete so we migrate to Drizzle with a clean data model.

### 4.2 Firebase → Supabase Authentication

Replace Firebase Authentication with Supabase Auth. This eliminates the custom JWT cookie bridge that causes auth flickering on page load (the full-screen spinner users see), removes the extra API call needed to check if a user is an organizer, and integrates natively with our Postgres database. Supabase Auth also comes included in our existing Supabase plan at no additional cost.

### 4.3 Reservation-based checkout

Replace the current checkout flow (create a full order upfront, clean up if abandoned) with a lightweight reservation system. A database function atomically reserves tickets with a time limit, and orders are only created after payment succeeds. This is the industry-standard approach for ticket inventory and completely eliminates the race conditions described in bugs 1.1–1.3. Depends on the Drizzle migration for Postgres function support.

### 4.4 Transactional email queue

Add a database-backed email queue instead of sending emails inline during request handling. Currently, if the email provider is slow or fails during checkout, it either delays the user's response or silently drops the confirmation email. A queue decouples email delivery from the checkout flow and enables automatic retries. Not urgent until we're processing ~50+ orders per hour during peak events.

---

## Priority 5 — Design System Standardization (Web)

The web app (`apps/web`) already has a solid foundation: a shadcn/ui component library, a complete set of semantic design tokens (brand color, text, background, border, etc.), Lucide icons, and a single toast system. The problem is **drift away from that foundation**, not its absence. Most pages hand-roll raw Tailwind colors instead of using the tokens (~570 instances, including two competing "gray" palettes used interchangeably), several styling config layers are inert or broken, and some dead/duplicate code lingers. The result is a UI that looks subtly inconsistent across the homepage, event pages, checkout, and organizer dashboard, and that is hard to restyle or theme because there is no single source of truth.

The goal is one color system (semantic tokens), one typography system, one standard page layout, a clean canonical component set, and an automated guardrail so the drift can't come back. Decisions made up front: stay **light-only** for now (we keep tokens theme-ready but won't build a dark-mode toggle yet); treat the existing **indigo brand color as canonical** (the stray cream/magenta on the landing pages is off-brand drift to consolidate); and **upgrade Tailwind to v4 first** as the foundation. These should be done after — or in parallel with — the bug and schema work; none of it touches revenue paths directly, but it makes every future feature faster to build and visually consistent.

### 5.1 Upgrade to Tailwind v4 (foundation)

**What:** Upgrade from Tailwind v3.3 to v4 as a standalone first step, using the official upgrade tool. Move the theme config out of the JavaScript config file and into CSS (v4's model), swap the build plugin (`@tailwindcss/postcss`, dropping `autoprefixer`), and replace `tailwindcss-animate` with its v4 equivalent.

**Why:** The codebase already contains a half-applied v4 setup — a v4-style theme block sits in our CSS today but does nothing because we're still on v3. Upgrading makes that block real and, in one move, fixes three latent problems: our font (Inter) isn't actually being applied because it's wired to a class Tailwind never generated; our shadow tokens are defined but never connected; and the theme block is dead. Doing the upgrade first means the later color work is built on the final system, not redone later. One thing to verify before committing: v4 requires modern browsers (Safari 16.4+, Chrome 111+, Firefox 128+) — we should confirm our buyers' browser mix supports this, especially on checkout.

---

### 5.2 Remove dead code and finish the Ant Design removal

**What:** Delete the unused second header component, the legacy button CSS (used in exactly one place), and the empty Ant Design config wrapper. Replace the one remaining Ant Design spinner with a Lucide/Tailwind spinner and uninstall `antd` + `@ant-design/icons`. This completes and expands Priority 3.1.

**Why:** These are leftovers that confuse anyone reading the code and, in Ant Design's case, bloat the bundle with 30+ sub-packages for a single spinner. Clearing them shrinks the surface area before the color migration so we're not migrating code that's about to be deleted.

---

### 5.3 Consolidate all colors onto design tokens

**What:** Replace the ~570 raw Tailwind color utilities (e.g. `text-slate-500`, `bg-gray-100`, `text-green-600`) with semantic tokens (`text-muted-foreground`, `bg-muted`, etc.). Collapse the two competing neutral palettes (`slate-*` and `gray-*`) onto one token set, add `success` and `warning` tokens to cover the states we currently express with raw greens and yellows, and fold the off-brand landing-page colors back to brand tokens. This is the largest item and runs in two passes: neutrals first, then semantic states.

**Why:** This is the headline inconsistency. Because colors are hardcoded everywhere, the same "muted gray" is expressed three different ways across pages, and changing the brand or fixing contrast means hunting through hundreds of files. Routing everything through tokens gives us one place to adjust the look, guarantees consistency across surfaces, and keeps the app theme-ready for the future.

---

### 5.4 Unify typography and page layout

**What:** Replace the three overlapping heading systems (a barely-used component, a parallel set of CSS classes, and ad-hoc inline styles) with a single heading/text primitive that uses tokens. Standardize every page on one container/spacing pattern (the one the organizer pages already use) instead of each page picking its own width and padding.

**Why:** Right now headings are styled inconsistently and public pages each invent their own max-width and spacing, so the homepage, event page, and checkout don't line up visually. One typography primitive and one page shell make new pages automatically consistent and remove a recurring source of guesswork.

---

### 5.5 Polish the shared components

**What:** Round out the canonical component set: give the alert component proper token-based variants (success/warning/info/error to match the toast system), add a reusable empty-state component (currently re-implemented on every page), tokenize the hardcoded brand color in the logo, and finish moving the last icons (including inline SVGs in the data table) to Lucide.

**Why:** These are the small inconsistencies users feel without being able to name them — an "info" alert that's a different blue than everything else, empty states that look slightly different on each page. Standardizing them is the finishing layer on top of the token work.

---

### 5.6 Add a guardrail against future drift

**What:** Add a lint rule that bans raw Tailwind palette colors in application code, and write a short design-system reference doc covering the tokens, the typography primitive, and the standard page layout.

**Why:** Without enforcement, the drift we're fixing here will simply creep back the next time someone reaches for `bg-gray-100` out of habit. A lint rule catches it at the point of writing, and the reference doc gives everyone the sanctioned way to do it instead.
