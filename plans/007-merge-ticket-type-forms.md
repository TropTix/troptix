# Plan 007: Merge the two ticket-type forms onto one shared form component

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 7f9a947f..HEAD -- apps/web/src/app/organizer/events/_components 'apps/web/src/app/organizer/events/[eventId]/tickets/new/_components'`
> Compare "Current state" excerpts on drift; mismatch = STOP.

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: MED (event-creation funnel touches revenue; test both entry points manually)
- **Depends on**: none (if plan 005 Stage B landed, the actions the page form calls moved — imports only)
- **Category**: tech-debt
- **Planned at**: commit `7f9a947f`, 2026-07-01

## Why this matters

The same entity — a ticket type — is edited through two fully independent form implementations: `AddTicketTypeDrawer` (a Sheet used inside `EventForm` during event creation, ~411 lines) and `CreateTicketTypeForm` (the standalone page at `/organizer/events/[eventId]/tickets/new` and the edit page, ~458 lines). Both build `useForm<TicketTypeFormValues>` on `ticketTypeSchema`, but they've diverged: the page form has the fee-mode RadioGroup with a live fee preview and a password (`discountCode`) toggle; the drawer has neither and its own collapsible layout. The code admits the debt — `AddTicketTypeDrawer.tsx:66`: `// TODO: We have a CreateTicketTypeForm component that is used for the new ticket form. We should use that instead of this component or merge them.` Every schema field added (e.g. the reservation-era columns, or the upcoming roadmap 2.6 discountCode→password rename) must currently be wired twice, and organizers get different capabilities depending on which door they entered through.

## Current state

- `apps/web/src/app/organizer/events/_components/AddTicketTypeDrawer.tsx` — Sheet-based form. Key facts: props `{ open, setOpen, onSubmit, initialData, ticketSchema, eventStartDate, paidEventsEnabled }`; it does NOT call server actions — it hands the validated `TicketTypeFormValues` back to `EventForm` via `onSubmitProp(dataToSubmit)` (lines 93–99), because during event creation ticket types are batched into the `createEvent` transaction. Invalid handler types `errors: any` (line 101).
- `apps/web/src/app/organizer/events/[eventId]/tickets/new/_components/CreateTicketTypeForm.tsx` — page form. Calls `createTicketType`/`updateTicketType` server actions directly via `useTransition` (lines 26–29 imports; submit handler further down). Has `showPasswordField` state (line ~70), fee RadioGroup + `getFeeBreakdown` preview (imports `FeeConfig, getFeeBreakdown` from `@/lib/fees`), uses `formatCurrency, combineDateTime, formatTime` from `@/lib/dateUtils`.
- Consumer: `apps/web/src/app/organizer/events/_components/EventForm.tsx:18` imports the drawer; renders it at line ~639.
- Shared schema: `apps/web/src/lib/schemas/ticketSchema.ts` (`ticketTypeSchema`, `TicketTypeFormValues`).
- Convention: shadcn/ui primitives (`Form`, `FormField`, `FormMessage`, `Sheet`), `react-hook-form` + `zodResolver`, sonner toasts. Match `CreateTicketTypeForm`'s field composition — it is the newer, more complete implementation.

The architectural difference to preserve: **the drawer returns values; the page persists them.** The shared component must therefore be persistence-agnostic.

## Commands you will need

| Purpose   | Command                         | Expected                       |
| --------- | ------------------------------- | ------------------------------ |
| Typecheck | `yarn --cwd apps/web typecheck` | exit 0                         |
| Lint      | `yarn --cwd apps/web lint`      | exit 0                         |
| Tests     | `yarn --cwd apps/web test`      | pass                           |
| Dev run   | `yarn --cwd apps/web dev`       | serves on :3000 (manual smoke) |

## Scope

**In scope**:

- New `apps/web/src/app/organizer/events/_components/TicketTypeFields.tsx` (the shared fields component)
- `AddTicketTypeDrawer.tsx` (rewrite as a thin Sheet wrapper)
- `CreateTicketTypeForm.tsx` (rewrite as a thin page wrapper)
- `EventForm.tsx` (only if the drawer's props must change — keep the change minimal)
- Component test file(s) if the repo has a component-testing setup (check `apps/web/jest.config.ts` for a jsdom environment; if tests are node-only, skip component tests and say so in the report)

**Out of scope**:

- `ticketSchema.ts` — no schema changes.
- Server actions (`ticketActions.ts`) — plan 001/005 territory; call them as they exist.
- Visual redesign — reuse the page form's field order/copy as-is.
- The `discountCode` → `password` rename (roadmap 2.6).

## Git workflow

- Branch: `advisor/007-merge-ticket-forms`.
- Conventional commit, e.g. `refactor(organizer): single TicketTypeFields form shared by drawer and page`.
- No push/PR unless instructed. No `--no-verify`.

## Steps

### Step 1: Extract `TicketTypeFields`

Create `TicketTypeFields.tsx`: a client component receiving `{ form: UseFormReturn<TicketTypeFormValues>, paidEventsEnabled: boolean, eventStartDate?: Date }` and rendering ALL fields from `CreateTicketTypeForm` (name, description, price, quantity, maxPurchasePerUser, sale start/end date+time, fee-mode RadioGroup with `getFeeBreakdown` preview, password toggle + `discountCode` field). It owns no `useForm` and no submit — fields only.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0.

### Step 2: Rebuild `CreateTicketTypeForm` on it

Keep its `useForm`, defaults, `useTransition` + server-action submit, toasts, and edit-mode handling; replace the inline field JSX with `<TicketTypeFields form={form} ... />`.

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; manual smoke: `/organizer/events/[eventId]/tickets/new` renders, create + edit still work against a dev DB if available (otherwise note untested).

### Step 3: Rebuild `AddTicketTypeDrawer` on it

Keep the Sheet shell, `open/setOpen`, and the values-return contract (`onSubmitProp(dataToSubmit)` including the `initialData?.id` passthrough at lines 93–99). Replace its field JSX with `<TicketTypeFields form={form} paidEventsEnabled={paidEventsEnabled} eventStartDate={eventStartDate} />`. Type the invalid handler `errors: FieldErrors<TicketTypeFormValues>` (from `react-hook-form`) — removes the `any` at line 101. The drawer thereby GAINS the fee preview and password field — this is intended capability convergence; confirm the drawer's returned values flow into `createEvent`'s batch (`eventActions.ts` reads `ticketingFees`, `discountCode` — check `eventActions.ts:64–87`: the ticket create currently maps `ticketingFees` but NOT `discountCode`; if `discountCode` is missing there, add it to the create mapping so the new field isn't silently dropped).

**Verify**: `yarn --cwd apps/web typecheck` → exit 0; `grep -n ": any" apps/web/src/app/organizer/events/_components/AddTicketTypeDrawer.tsx` → no matches.

### Step 4: Smoke both funnels

With `yarn --cwd apps/web dev`: (a) create a new event and add a ticket via the drawer — verify fee mode and password fields appear and the created event's ticket carries them; (b) add and edit a ticket via `/tickets/new` and `/tickets/[ticketId]`. If no dev database is configured, run `yarn --cwd apps/web build` instead and state in the report that runtime smoke needs the operator.

**Verify**: `yarn --cwd apps/web lint && yarn --cwd apps/web test` → exit 0.

## Test plan

- If jsdom testing exists: render `TicketTypeFields` inside a `FormProvider` harness; assert the password field toggles and the fee preview updates on price change. Otherwise: rely on typecheck + the step-4 smoke, and record the gap.
- Regression guard: existing `ticketActions` tests (plan 001) keep passing — the actions' inputs are unchanged.

## Done criteria

- [ ] `yarn --cwd apps/web typecheck`, `lint`, `test` all exit 0
- [ ] `grep -c "FormField" apps/web/src/app/organizer/events/_components/AddTicketTypeDrawer.tsx` → 0 (fields live only in `TicketTypeFields`)
- [ ] The `TODO` comment at the top of `AddTicketTypeDrawer.tsx` is removed
- [ ] Both entry points render the fee-mode RadioGroup and password toggle
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back if:

- `EventForm`'s `createEvent` batching cannot accept the two new fields without changing `eventFormSchema` (check `apps/web/src/lib/schemas/eventSchema.ts` — if its nested ticket schema differs from `ticketTypeSchema`, the convergence needs a schema decision; report, don't fork the shared component).
- The spotlight/org-brand plan's EventForm changes (removal of the `organizer` field) have landed and restructured `EventForm.tsx` beyond recognition — re-verify the drawer's mount point before editing.
- Drawer UX (collapsible "advanced" section) turns out to be load-bearing for mobile ergonomics — if the merged fields overflow the Sheet on a 375px viewport, report with a screenshot rather than redesigning.

## Maintenance notes

- Future schema fields for ticket types get added in exactly one place (`TicketTypeFields`) — that's the point; reviewers should reject any PR re-adding fields to a wrapper.
- The roadmap 2.6 rename (discountCode→password) now touches one form file.
- Deferred: unifying the two submit UXes (drawer-returns-values vs page-persists) onto a single drawer-based flow — bigger product decision, backlog.
