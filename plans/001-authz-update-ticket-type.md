# Plan 001: Add authentication + ownership check to the `updateTicketType` server action

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- 'apps/web/src/app/organizer/events/[eventId]/tickets/_actions/ticketActions.ts' apps/web/src/server/accessControl.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

The `updateTicketType` server action performs a Prisma `update` on any `ticketTypes` row by id with **no authentication and no ownership check** — it never resolves the current user at all. Next.js server actions are HTTP-callable endpoints (their action IDs ship in the client bundle), so any visitor who obtains the action ID can change the price, quantity, sale dates, or fee mode of any ticket type on the platform. The sibling `createTicketType` action in the same file does check ownership, so this is an omission, not a design choice. This is the same vulnerability class as the organizer-orders IDOR already fixed in commit `443c937c`.

## Current state

- `apps/web/src/app/organizer/events/[eventId]/tickets/_actions/ticketActions.ts` — both ticket-type server actions. `createTicketType` (lines 20–79) authenticates and verifies ownership; `updateTicketType` (lines 81–139) does neither.
- `apps/web/src/server/authUser.ts` — exports `getUserFromIdTokenCookie()`, returns `{ uid, email, ... } | null`.
- `apps/web/src/server/accessControl.ts` — exports `isPlatformOwner(email)`, `canAccessEvent(userId, userEmail, eventId)`, `verifyEventAccess(...)`, `getEventWhereClause(...)`. Platform owners are emails ending `@usetroptix.com`.

`updateTicketType` as it exists today (`ticketActions.ts:81–120`, abridged):

```ts
export async function updateTicketType(
  ticketId: string,
  formData: TicketTypeFormValues
): Promise<ActionResult> {
  const validationResult = ticketTypeSchema.safeParse(formData);
  // ... validation error handling ...
  const data = validationResult.data;
  let eventIdForRevalidation: string | undefined;
  try {
    const ticketTypeEnum = data.price === 0 ? 'FREE' : 'PAID';
    const updatedTicket = await prisma.ticketTypes.update({
      where: {
        id: ticketId,          // ← no auth, no ownership constraint
      },
      data: { /* name, price, quantity, ... */ },
      select: { eventId: true },
    });
```

The pattern to match — `createTicketType` in the same file (`ticketActions.ts:36–46`):

```ts
const user = await getUserFromIdTokenCookie();
if (!user) {
  redirect('/auth/signin');
}
// Verify user is the organizer of the event
const event = await prisma.events.findUnique({
  where: { id: eventId, organizerUserId: user.uid },
});
if (!event) {
  return { success: false, error: 'Unauthorized' };
}
```

Note a nuance in `createTicketType`'s check: it does NOT allow platform owners (`@usetroptix.com`) to create ticket types on events they don't own, whereas page-level access (`verifyEventAccess`) does allow platform owners. The exemplar for the _full_ convention is `apps/web/src/app/organizer/events/[eventId]/attendees/_actions/attendeeActions.ts:9–35` (`toggleTicketStatus`), which calls `verifyEventAccess(userId, userEmail, eventId)` and then constrains the row query with `getEventWhereClause(...)`. Prefer the attendeeActions pattern so platform owners keep working.

Repo conventions: Prettier auto-formats on commit via husky (`lint-staged`); keep code comment-light (no narration comments); TypeScript strict.

## Commands you will need

| Purpose   | Command                         | Expected on success |
| --------- | ------------------------------- | ------------------- |
| Install   | `yarn install` (repo root)      | exit 0              |
| Typecheck | `yarn --cwd apps/web typecheck` | exit 0              |
| Lint      | `yarn --cwd apps/web lint`      | exit 0              |
| Tests     | `yarn --cwd apps/web test`      | all pass            |

Never use npm anywhere in this repo (Yarn v1 workspaces — see `CLAUDE.md`).

## Scope

**In scope** (the only files you should modify):

- `apps/web/src/app/organizer/events/[eventId]/tickets/_actions/ticketActions.ts`
- `apps/web/src/app/organizer/events/[eventId]/tickets/_actions/ticketActions.test.ts` (create)

**Out of scope** (do NOT touch, even though they look related):

- `apps/web/src/app/api/organizer/tickets/**` — REST routes are covered by plan 002.
- `apps/web/src/server/accessControl.ts` — use it, don't change it.
- The form components calling these actions (`CreateTicketTypeForm.tsx`) — the action signature must not change.

## Git workflow

- Branch: `advisor/001-authz-update-ticket-type` off the current branch.
- Commit style: conventional commits, e.g. `fix(organizer): require event ownership in updateTicketType action` (matches `git log` style like `fix(events): revalidate public event pages on edit`).
- Do NOT push or open a PR unless the operator instructed it.
- Do NOT bypass the pre-commit hook with `--no-verify`.

## Steps

### Step 1: Add auth + ownership to `updateTicketType`

In `ticketActions.ts`, at the top of the `try` block in `updateTicketType` (before the `prisma.ticketTypes.update` call):

1. Resolve the user: `const user = await getUserFromIdTokenCookie();` — if null, `redirect('/auth/signin');` (matching `createTicketType`).
2. Fetch the ticket type's event and verify access. Target shape:

```ts
const existing = await prisma.ticketTypes.findUnique({
  where: { id: ticketId },
  select: { eventId: true },
});
if (!existing) {
  return { success: false, error: 'Ticket type not found.' };
}
const hasAccess = await canAccessEvent(user.uid, user.email, existing.eventId);
if (!hasAccess) {
  return { success: false, error: 'Unauthorized' };
}
```

Import `canAccessEvent` from `@/server/accessControl`. (`canAccessEvent` grants platform owners access — consistent with the page-level check that gates the edit form at `apps/web/src/app/organizer/events/[eventId]/tickets/[ticketId]/page.tsx`.)

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 2: Align `createTicketType` with the same helper

Replace `createTicketType`'s inline ownership query (lines 41–46) with the same `canAccessEvent(user.uid, user.email, eventId)` call, so both actions authorize identically (and platform owners can manage any event, consistent with page-level access). Keep the return shape `{ success: false, error: 'Unauthorized' }` on failure.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0. `yarn --cwd apps/web lint` → exit 0.

### Step 3: Add tests

Create `ticketActions.test.ts` next to the actions file. Jest is configured in `apps/web/jest.config.ts`. Mock `@/server/authUser` (`getUserFromIdTokenCookie`), `@/server/prisma` (default-export mock object with `ticketTypes.update/findUnique/create` and `events.findUnique` jest.fn()s), `next/cache` (`revalidatePath`), and `next/navigation` (`redirect` that throws, matching Next semantics). Cases:

1. `updateTicketType` with no session → redirects to signin (assert `redirect` called, `prisma.ticketTypes.update` NOT called).
2. `updateTicketType` when `canAccessEvent` resolves false (mock a non-owner: `events.findUnique` → null and non-platform email) → returns `{ success: false, error: 'Unauthorized' }`, no update executed.
3. `updateTicketType` happy path (owner) → update executed with `where: { id: ticketId }`, returns `{ success: true }`.
4. `createTicketType` non-owner → `{ success: false, error: 'Unauthorized' }`, no create executed.

**Verify**: `yarn --cwd apps/web test --testPathPattern=ticketActions` → all pass.

## Done criteria

- [ ] `yarn --cwd apps/web typecheck` exits 0
- [ ] `yarn --cwd apps/web lint` exits 0
- [ ] `yarn --cwd apps/web test` exits 0; the 4 new tests exist and pass
- [ ] In `ticketActions.ts`, `updateTicketType` calls `getUserFromIdTokenCookie` and `canAccessEvent` before `prisma.ticketTypes.update`
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `updateTicketType` in the live code already contains an auth check (drift — someone fixed it).
- `canAccessEvent`'s signature differs from `(userId: string, userEmail: string | undefined, eventId: string)`.
- The jest mocks require changing `jest.config.ts` — report instead of editing config.

## Maintenance notes

- Plan 005 (service-layer cutover) will eventually move these actions into `packages/api` services with `actor`-based authz (ADR 0013); this fix is the stopgap that must not wait for it.
- Reviewer should scrutinize: that the `redirect()` in a server action still behaves correctly when called from `useTransition` in `CreateTicketTypeForm.tsx` (the create path already does this — behavior unchanged).
- Deferred: zod-validating `ticketId` as a UUID (low value; Prisma rejects malformed ids).
