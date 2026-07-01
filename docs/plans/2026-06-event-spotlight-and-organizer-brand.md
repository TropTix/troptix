---
title: Event Spotlight & Organization Brand
status: proposed
created: 2026-06-30
tracking-issue: 'TropTix/troptix#385'
---

# Event Spotlight & Organization Brand

Two additions to the `/e/[eventId]` event page
([Event Page Redesign](2026-06-event-page-redesign.md)):

1. **Organization** — the "Hosted by" string becomes a real, **linkable** Organization (logo, bio,
   website, socials) with its own public page and an "events by" list. The Organization is the
   canonical organizer entity — the same "org" concept that will later own events and carry a
   member team; this initiative only introduces its **brand + public face**.
2. **Spotlight** — organizers add lightweight spotlight cards to an event: **image + title +
   external link + description**. A spotlight item can be a DJ, artist, speaker, sponsor, or
   collaborator — one generic thing that links _out_ (Instagram, LinkedIn, Spotify, a site).

This is a deliberate simplification of an earlier design (unified platform `Profile`, `EventCredit`
join, claimable performer profiles, backfill). That model was cut: only the **Organization** keeps
a real entity; everyone else is a link-out spotlight item.

## Goals

1. **Organization brand** — logo, bio, website, socials; linkable; powers "Hosted by".
2. **Spotlight** — per-event image/name/link/description cards (flat, ordered, generic).
3. **More events by this organization** cross-link (event page + organization page).

## Non-goals (cut or deferred)

- **Multi-org UI** — a user can _own_ many Organizations in the model, but v1 **exposes exactly
  one** (no org selector, no switcher, no "create another org"). Going multi later is UI-only
  because `Events.organizationId` already exists (see decision 2 — "model for multi, expose one").
- **Membership / teams** — multiple users in one Organization with dashboard roles. The
  Organization is the _home_ for this, but v1 is single-owner (`ownerUserId`); the `Membership`
  join, per-Organization Stripe, and the relationship to `Users.role = ORGANIZER` are all deferred
  and designed together later. (This is a _different_ axis from multi-org-per-user above.)
- **Platform profiles for performers/DJs/speakers** — external link-out spotlight items, not
  entities. No claiming, no `/p/[slug]`.
- **`EventCredit` join, `ProfileClaimRequest`, search-then-stub, performer backfill** — gone.
- **Per-item start/end times / schedule, Spotify integration, custom music, social graph** —
  deferred.
- **Custom links** on the Organization profile and **"display number of attendees"** — explicitly
  out (owner decision).
- **Country flag** beside the location — dropped for v1; location renders as **text only**
  ("City, Country"). Emoji flags break on Windows and SVG flags weren't worth the scope now.

## Decisions (resolved in design review)

1. **The organizer brand IS the `Organization`**, not a side "profile" table. Brand fields live on
   it; "Hosted by" links to its public page. Correctly named/positioned so it doesn't repaint when
   teams/tenancy land.
2. **Model for multi, expose one.** `Organization.ownerUserId` always set; a user _may_ own many
   Organizations in the schema (one-to-many), but **v1 exposes exactly one** per user (auto-created
   one-per-`organizerUserId`, backfilled from the `Events.organizer` display name). The `organizer`
   column stays but goes unread. **`Events` gains `organizationId` (nullable FK) now**, populated on
   create + in the backfill — this is the only piece painful to retrofit later, so we do it up front.
   **Ownership/auth still keys on `organizerUserId`** (per [ADR 0013](../adr/0013-authorization-in-the-service-layer.md));
   we dual-write so `organizerUserId == organization.ownerUserId`. Going multi-org later is then
   UI-only (selector + switcher + "create org") — no event migration, no auth rework.
   2b. **Lazy org creation; drop the per-event `organizer` field.** A new organizer's Organization is
   auto-created on their **first event save** (not a required setup step — never block the create
   funnel). Default `displayName` = the user's name, with a **nudge** ("Finish your organizer
   profile") to the Profile Info editor where they set the real brand name + slug. The free-text
   per-event `organizer` field is **removed** from `EventForm`; the form shows a read-only
   "Hosted by [Your Org] · edit" instead. Slug auto-generated from `displayName`, editable later.
3. **Never claimed** — the owner is always a real user. Optional admin `verified` flag for a trust
   tick.
   3a. **Organization editor fields** (per reference UI): logo, biography, **Instagram** (username),
   **Twitter** (username), **LinkedIn** (URL), **Website** (URL), and an **editable Organization
   Profile URL** (the `slug`, shown with the base prefix, e.g. `…/o/eman-events`). IG/Twitter store
   a username (URL built on render); LinkedIn/Website store a full URL. This makes the **slug
   user-editable** (vanity), so editing needs a uniqueness check. Socials are **plain columns on
   `Organization`** (`instagram`/`twitter`/`linkedin` + the existing `website`), not the
   `SocialMediaAccounts` join table — the set is fixed/small and custom links are out of scope.
   3b. **Slug rules.** Base path `/o/[slug]`. Format: lowercase `a–z`/`0–9`/hyphens, **3–32 chars**, no
   leading/trailing/double hyphen (slugify on input). **Globally unique, case-insensitive**, with a
   live available/taken check. Small **reserved list** (`new`, `edit`, `settings`, `admin`, `api`,
   …) to protect future `/o/*` sub-routes. Auto-generated on create as `slugify(displayName)` +
   numeric suffix on collision. **Rename is allowed and old links just 404** (inline warning in the
   editor); a `slug_history` redirect table is a purely-additive later upgrade if breakage bites.
4. **`Spotlight` = `title` (required) + optional `link`, `imageUrl`, `description` (≤350).** Flat
   ordered list, generic — no role/type/category. **`link` and `image` are both optional**
   (intentionally diverges from the reference UI's `Link*`): a no-link item renders as a static card
   (image/monogram + name + description); a link present makes it clickable with a ↗ affordance.
   Only `title` is required. **URL handling:** accept input without a scheme, store normalized,
   prepend `https://` on render, basic shape validation, **reject non-`http(s)` schemes**; open in a
   new tab with `rel="noopener noreferrer"` (no interstitial in v1). **Soft cap ~50 items/event.**
5. **"Hosted by" links to the Organization page;** spotlight items open their `link` in a new tab
   (`rel="noopener noreferrer"`).
6. **No country flag** — location renders as text only ("City, Country"). Dropped (Windows emoji
   breakage; SVG not worth the scope). `Events.countryCode` stays captured but unused for now.
7. **Authoring:** Organization brand edited in the dashboard; spotlight items added in `EventForm`
   via an "Add to spotlight" button → modal (per the reference UI). Persisted by extending the
   existing `createEvent`/`updateEvent` server actions.
8. Public reads via the service layer (ADR 0013); UUIDv7 PKs
   ([ADR 0014](../adr/0014-uuidv7-pks-and-public-codes.md)); images on Supabase Storage,
   path-not-URL ([ADR 0016](../adr/0016-supabase-storage-for-event-images.md)); shadcn + tokens +
   lucide, light-only + indigo ([ADRs 0002](../adr/0002-light-only-no-dark-toggle.md)/[0003](../adr/0003-indigo-canonical-brand.md)).

## Data model (additive Prisma — [ADR 0012](../adr/0012-prisma-7-instead-of-drizzle.md))

```prisma
model Organization {
  id          String   @id @default(uuid())   // uuidv7 per ADR 0014
  slug        String   @unique                 // readable, from displayName
  displayName String
  logoUrl     String?  @db.VarChar(2000)        // Supabase path (ADR 0016)
  bio         String?
  website     String?                           // full URL
  instagram   String?                           // username (URL built on render)
  twitter     String?                           // username
  linkedin    String?                           // full URL
  ownerUserId String                            // always set — single owner in v1
  verified    Boolean  @default(false)
  owner       Users    @relation(fields: [ownerUserId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([ownerUserId])
  // Deferred (teams/tenancy initiative): members Membership[], stripeAccountId, and
  // Events.organizationId so the Organization owns events instead of organizerUserId.
}

model Spotlight {
  id          String   @id @default(uuid())
  eventId     String
  title       String                            // the name (required)
  link        String?                           // external URL — IG / LinkedIn / Spotify / site
  imageUrl    String?  @db.VarChar(2000)         // Supabase path
  description String?  @db.VarChar(350)
  order       Int      @default(0)
  event       Events   @relation(fields: [eventId], references: [id])
  @@index([eventId])
}
```

`Events` gains a nullable `organizationId` FK → `Organization` (populated on create + backfill;
`organizerUserId` stays the ownership/auth key, dual-written to the org's owner).
Socials are **plain columns on `Organization`** (`instagram`/`twitter` usernames, `linkedin`/`website`
URLs), **not** the `SocialMediaAccounts` join table — the set is fixed and small, custom links are
out of scope, and that table is dormant with an ambiguous dual-FK. Promoting to a table later (if
open-ended links return) is a trivial migration.
`Events.organizer` / `organizerUserId` are untouched (the latter still drives ownership/auth;
the Organization is matched to it by `ownerUserId` for display).

## Surface specs (design source of truth)

Light-only, indigo, shadcn + tokens + lucide. Sections render only when populated.

- **F1 — "Hosted by" block.** The bare `organizer` string becomes a compact card: logo + name
  (+ verified tick), linking to the Organization page. Desktop: aside; mobile: "Hosted by" section.
- **F2 — Spotlight section.** A flat card grid of `Spotlight` items, each: image (fallback
  monogram), title, an external-link affordance, optional description. Tap → opens `link` in a new
  tab. Ordered by `order`. Public heading: **"Spotlight"**.
- **F3 — _(dropped)_** Country flag — location renders as text only.
- **F4 — "More events by [organization]"** rail (event page) + the same list on the org page.
- **F5 — Organization page** (`/o/[slug]`): header (logo, name, verified, bio, socials, website)
  - **published** events only (drafts never shown, even to the owner), **Upcoming** then **Past**
    (past = social proof). **Always public** (no privacy/hide toggle in v1 — the brand is already
    surfaced on event pages). **Degrades gracefully:** no logo → monogram; missing bio/socials rows
    omit; empty → quiet "No upcoming events" (skip Past if also empty), never a blank page. No claim
    states — always owned.
- **F6 — Authoring.** A **standalone `/organizer/profile`** route (the dashboard has no settings
  area today; this is its own page, with a "Profile" nav entry + an "Organization profile" link in
  the header "My Account" dropdown). "Profile Info" editor (per reference UI): logo + "View profile"
  (→ `/o/[slug]`), Biography, Instagram (username), Twitter (username), LinkedIn (URL), Website
  (URL), and the editable Organization Profile URL (slug + base prefix). **No** custom links, **no**
  attendee count. The Q2b "finish your profile" nudge deep-links here.
  Spotlight items are added separately inside `EventForm` ("Add to spotlight" modal).
  `EventForm`: an **"Add to spotlight"** button → modal (Upload image, Title\*, Link\*, Description
  0/350) → a reorderable/removable list of spotlight cards. Persisted via the existing server
  actions; image upload reuses Supabase (`spotlight/` + `organizations/` prefixes).

## Phases

- **Phase 0 — Schema + backfill (invisible).** `Organization`, `Spotlight`,
  socials as columns on `Organization`; slug generator; backfill one Organization per
  `organizerUserId` from the `organizer` string.
- **Phase 1 — Organization brand display.** "Hosted by" links to the org page (**F1**);
  Organization page (**F5**). Pure win from backfilled data.
- **Phase 2 — Spotlight.** `EventForm` "Add to spotlight" modal + list (**F6**); event-page
  spotlight grid (**F2**); spotlight image upload.
- **Phase 3 — Discovery + brand polish.** "More events by [organization]" (**F4**); dashboard brand
  editing polish; optional `verified` admin toggle.

## User stories

**Organization brand (organizer)**

1. As an organizer, I want a public organization page, so attendees can see who's behind my events.
2. As an organizer, I want to upload a logo, so my brand is recognizable on events and my page.
3. As an organizer, I want to write a biography, so attendees understand who I am and what I run.
4. As an organizer, I want to add Instagram and Twitter usernames, so attendees can follow me.
5. As an organizer, I want to add my LinkedIn and website URLs, so attendees can reach my other channels.
6. As an organizer, I want an editable, branded profile URL (`/o/<slug>`), so I can share a clean link.
7. As an organizer, I want a warning when I change my profile URL, so I know old links will stop working.
8. As an organizer, I want a "View profile" action, so I can preview my public page while editing.
9. As an organizer, I want my organization created automatically on my first event, so setup never blocks me.
10. As a new organizer, I want a nudge to finish my profile, so I know to set my real brand name and slug.
11. As an organizer, I don't want to retype my organizer name on every event, so the host is set once.

**Discovery (attendee)** 12. As an attendee, I want "Hosted by" on an event to link to the organizer's page, so I can explore them. 13. As an attendee, I want to see an organizer's upcoming events on their page, so I can find more to attend. 14. As an attendee, I want to see an organizer's past events, so I can judge their track record. 15. As an attendee, I want a "More events by this organizer" rail on the event page, so I discover related events. 16. As an attendee, I want a verified tick on established organizations, so I can gauge trust. 17. As an attendee viewing an organizer with no upcoming events, I want a graceful empty state, not a blank page. 18. As an attendee, I want a monogram when an organization has no logo, so the page still looks complete.

**Spotlight (organizer)** 19. As an organizer, I want to add spotlight items (DJs, artists, speakers, sponsors), so I can showcase who's involved. 20. As an organizer, I want each spotlight item to carry an image, name, link, and description. 21. As an organizer, I want to add a spotlight item without a link (e.g. a sponsor), so I'm not forced to provide one. 22. As an organizer, I want to reorder spotlight items, so the headliner appears first. 23. As an organizer, I want to edit and remove spotlight items, so I can keep the lineup accurate.

**Spotlight (attendee)** 24. As an attendee, I want to see the spotlight on the event page, so I know who's performing or involved. 25. As an attendee, I want to tap a spotlight item to open its external link in a new tab. 26. As an attendee, I want link-less spotlight items to still render as informative cards.

**Platform** 27. As a platform admin, I want to mark an organization as verified, so trusted brands get a tick.

## Testing seams (confirmed)

Primary seam is the **`@troptix/api` service layer** (Vitest + fake-prisma, [ADR 0010](../adr/0010-vitest-for-packages.md);
prior art: existing `getEventDetail` unit tests). Decision-rich logic lives in services so it's testable
at the highest seam; Next server actions stay thin orchestrators (no bespoke test harness).

- **`getOrganizationBySlug`** — header + published events split Upcoming/Past; tests cover draft
  exclusion, ordering, empty/incomplete states.
- **`getEventDetail` (extended)** — returns the Hosted-by org summary + ordered `spotlight[]`; tests
  cover shaping, ordering, link-absent items.
- **Pure helpers (no DB):** slug (slugify, format/length, reserved list, `generateUniqueSlug`
  collision) and spotlight link normalization (scheme prepend, reject non-`http(s)`).
- **`ensureOrganizationForUser`** (lazy create) + **backfill mapping** (one org per `organizerUserId`,
  name from most-recent `organizer` string) — fake-prisma tests.
- **Contracts:** zod DTOs `OrganizationDetail`, the `EventDetail` extension, `Spotlight`.
- **Not unit-tested:** the React surfaces (event page, org page, profile editor) — settled via a
  throwaway `?variant=` prototype built and reviewed in design, then removed (consistent with how
  the event-page redesign was handled).

## Open questions / risks

- **Organization ↔ ownership** — v1 matches an Organization to events by `ownerUserId`. When the
  tenancy initiative adds `Events.organizationId` + `Membership`, decide the migration and how
  `Users.role = ORGANIZER` and per-Organization Stripe fold in. (Carried into that initiative.)
- **External-link safety** — spotlight items link off-platform; render with
  `rel="noopener noreferrer"`; consider URL validation / a leaving-the-site interstitial.
- **Slug collisions** for organization names — generation appends a suffix.
- **Flag backfill** for old events — best-effort geocode from `address`, or accept missing flags.
- **`organizer` column retirement** — eventual dedicated migration once the org link is canonical.
