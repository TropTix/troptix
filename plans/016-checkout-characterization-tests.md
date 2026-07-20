# Plan 016: Characterization tests for the `/e/` checkout client (the safety net for 017)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- apps/web/src/app/e/[eventId]/_components apps/web/jest.config.ts`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (adds tests only; touches no product code except a test-setup wire-up)
- **Depends on**: 008 (fixes root `yarn test`) — soft; these run via `yarn workspace web test`
- **Category**: tests
- **Planned at**: commit `abab1702`, 2026-07-18

## Why this matters

`CheckoutSheet.tsx` orchestrates the live buyer flow — ticket select → contact →
payment → success, plus resume-from-URL (3DS return / refresh), hold expiry, and
the sold-out release path. It has **zero test coverage today**, and there is no
React component test anywhere in `apps/web` (no `*.test.tsx`, and
`@testing-library/jest-dom` is not wired into the Jest setup). Plan 017 refactors
this component to a reducer + discriminated-union state; doing that safely
requires a behavior net **first**. This plan writes characterization tests that
pin the _current_ observable behavior of the checkout flow, so 017 can be proven
behavior-preserving transition-by-transition. It also closes the client half of
the test-coverage cliff (audit finding F12).

"Characterization" means: assert what the code does **today**, not what it
ideally should. If a scenario reveals a latent bug, record it in the plan's
report — do not "fix" it here (that would defeat the net).

## Current state

- `apps/web/jest.config.ts` — uses `next/jest`, `testEnvironment: 'jsdom'`,
  `moduleNameMapper` maps `^@/(.*)$` → `<rootDir>/src/$1`. **No
  `setupFilesAfterEnv`** — so `@testing-library/jest-dom` matchers
  (`toBeInTheDocument`, etc.) are not available yet:

```ts
const config: Config = {
  coverageDirectory: 'coverage',
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
};
export default createJestConfig(config);
```

- `@testing-library/react@^14.2.0`, `@testing-library/jest-dom` (root devDep),
  `@stripe/react-stripe-js@^6`, `@stripe/stripe-js@^9` are installed.
- Existing web tests are all non-component (`.ts`): e.g.
  `apps/web/src/app/organizer/events/[eventId]/tickets/_actions/ticketActions.test.ts`
  — read it for the repo's `jest.mock(...)` style. There is **no** `.tsx`
  component test to copy; this plan creates the first.

- `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx` — the component
  under test. Key dependencies it pulls, all of which the tests must control:
  - `trpc` from `@/lib/trpc` — a `createTRPCReact<AppRouter>()` client. The
    component calls: `trpc.checkout.createReservation.useMutation()`,
    `.completeFree.useMutation()`, `.beginPayment.useMutation()`,
    `.release.useMutation()`, and `trpc.checkout.getCheckoutState.useQuery(input, opts)`.
    Each mutation object exposes `{ mutateAsync, mutate, isPending, error, reset }`;
    the query exposes `{ data }`.
  - `useAuth` from `@/components/AuthProvider` — returns `{ user }` where `user`
    has `firstName`/`lastName`/`email` (used to prefill `ContactStep`).
  - `PaymentStep` (`./PaymentStep`) — renders Stripe Elements; see below.
  - `global.fetch` — fire-and-forget POSTs to `/api/checkout/confirmation` and
    `/api/checkout/refund-notice`.
  - `window.history.replaceState` / `window.location` — `setReservationParam`
    reads/writes the `?reservation=` param.

- The step machine and its transitions (what you're characterizing), from
  `CheckoutSheet.tsx`:
  - `Step = 'select' | 'contact' | 'payment' | 'finalizing' | 'success' | 'expired' | 'refunded'`.
  - `handleContact` (lines 218–276): calls `createReservation`; if all granted
    `=== 0` → sets error "Sorry — these tickets just sold out.", releases the
    hold, stays. If free → `completeFree` → `success` + POST confirmation. If
    paid → sets `?reservation=`, `beginPayment` → `payment`. On throw → releases
    the hold if `step !== 'payment'`.
  - Resume effect (101–106): `open && resumeReservationId` → `finalizing`.
  - Poll→step effect (109–159): maps `getCheckoutState` data →
    `order`→success (+confirmation POST), `refunded`→refunded (+refund-notice
    POST), `expired`→expired, `held`→(one-shot `resumeReopenRef`) `beginPayment`
    → `payment`.
  - `backFromPayment` (287): releases the hold, `startOver` → `select`.
  - `slowFinalize` effect (162–169): after 20s in `finalizing`, shows extra copy.

- `apps/web/src/app/e/[eventId]/_components/PaymentStep.tsx` — for the
  expiry-countdown scenario. It imports from `@stripe/react-stripe-js/checkout`
  (`CheckoutElementsProvider`, `PaymentElement`, `useCheckoutElements`) and
  `loadStripe` from `@stripe/stripe-js`. It runs a `useCountdown` on a
  soft deadline (`expiresAt − 2min`) via `setInterval(1000)`, and calls
  `onExpired()` when `secondsLeft <= 0 && !submitting`.

## Commands you will need

| Purpose           | Command                                 | Expected on success                      |
| ----------------- | --------------------------------------- | ---------------------------------------- |
| Web tests         | `yarn workspace web test`               | all pass (or `yarn test` after plan 008) |
| Just the new file | `yarn workspace web test CheckoutSheet` | new tests pass                           |
| Typecheck         | `yarn workspace web typecheck`          | exit 0                                   |

## Scope

**In scope**:

- `apps/web/jest.setup.ts` (new — wires `@testing-library/jest-dom`)
- `apps/web/jest.config.ts` (add `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`)
- `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.test.tsx` (new)
- Optionally `apps/web/src/app/e/[eventId]/_components/PaymentStep.test.tsx` (new)
  for the countdown-expiry unit, if cleaner than driving it through the sheet.

**Out of scope** (do NOT touch):

- Any product code under `_components/*.tsx` — this plan adds tests only. If a
  test can't be written without a change to the component (e.g. a missing
  `data-testid`), prefer querying by role/text; only if genuinely blocked, STOP
  and report rather than editing the component.
- The tRPC server, services, or contracts.
- Do NOT fix any bug the tests reveal — record it in your report.

## Git workflow

- Branch: `advisor/016-checkout-characterization-tests`
- Commit per logical unit (setup wire-up; then the test file); Conventional
  Commits, e.g. `test(checkout): characterization tests for CheckoutSheet`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Wire `@testing-library/jest-dom`

Create `apps/web/jest.setup.ts` with `import '@testing-library/jest-dom';`. Add
`setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']` to `apps/web/jest.config.ts`.

**Verify**: a throwaway trivial `render(<div>hi</div>)` + `expect(screen.getByText('hi')).toBeInTheDocument()` test passes under `yarn workspace web test`. Remove the throwaway before finishing.

### Step 2: Build the mock harness

In `CheckoutSheet.test.tsx`, mock the four external seams:

- `jest.mock('@/lib/trpc', () => ({ trpc: <fake> }))` where `<fake>` exposes
  `checkout.createReservation.useMutation`, `.completeFree.useMutation`,
  `.beginPayment.useMutation`, `.release.useMutation`, and
  `.getCheckoutState.useQuery`. Make each return a controllable object; drive
  mutation resolution and query `data` per test (e.g. `mutateAsync` returns a
  configured value; `useQuery` returns a `data` you set).
- `jest.mock('@/components/AuthProvider', () => ({ useAuth: () => ({ user: emptyUser }) }))`.
- `jest.mock('./PaymentStep', ...)` — for sheet-level tests, replace `PaymentStep`
  with a stub that renders a marker (e.g. `Payment step`) and exposes buttons that
  call the `onExpired`/`onBack` props, so you can characterize the sheet's
  transitions without real Stripe. (Test the real countdown separately in
  `PaymentStep.test.tsx` if you include it.)
- `global.fetch = jest.fn().mockResolvedValue({ ok: true })`.

Provide a minimal `event: EventDetail` fixture with one free tier and one paid
tier (enough for both flows). Render `<CheckoutSheet open event={event} onOpenChange={...} />`.

**Verify**: the harness renders the `select` step (`yarn workspace web test CheckoutSheet` compiles and the first render assertion passes).

### Step 3: Characterize the paid + free happy paths

- **Free**: select a free tier → continue → submit contact. Assert
  `completeFree.mutateAsync` was called, the `success` step renders, and
  `fetch` was called with `/api/checkout/confirmation`.
- **Paid**: select a paid tier → continue → submit contact. Assert
  `createReservation` then `beginPayment` were called, the payment step marker
  renders, and `window.history.replaceState` set `?reservation=<id>`.

**Verify**: both pass.

### Step 4: Characterize the exception + resume paths

- **Sold out**: `createReservation.mutateAsync` resolves with all items
  `granted: 0`. Assert the "sold out" error copy shows, `release.mutate` was
  called, and the step stayed `contact`.
- **Resume → order**: render with `resumeReservationId="R1"`; set
  `getCheckoutState` `data` to `{ kind: 'order', orderId, tickets }`. Assert
  `success` + confirmation POST.
- **Resume → refunded**: `data = { kind: 'refunded' }`. Assert `refunded` step +
  `/api/checkout/refund-notice` POST.
- **Resume → expired**: `data = { kind: 'expired' }`. Assert `expired` step.
- **Resume → held (reopen)**: `data = { kind: 'held', ... }`; `beginPayment`
  resolves with a client secret. Assert `beginPayment` called **once** (the
  `resumeReopenRef` one-shot) and the payment step renders.
- **Back from payment**: from the payment step, invoke the stub's `onBack`.
  Assert `release.mutate` called and step returns to `select` with the
  `?reservation=` param cleared.

**Verify**: all pass. Use `jest.useFakeTimers()` where the `finalizing`/poll
timing matters and advance with `act(() => jest.advanceTimersByTime(...))`.

### Step 5 (recommended): Characterize the countdown expiry in `PaymentStep`

In a separate `PaymentStep.test.tsx`, mock `@stripe/react-stripe-js/checkout`
(stub `CheckoutElementsProvider` to render children; `PaymentElement` to a
marker; `useCheckoutElements` to return `{ type: 'success', checkout: { canConfirm: true, confirm: jest.fn() } }`) and `@stripe/stripe-js`
(`loadStripe: () => Promise.resolve(null)`). With `jest.useFakeTimers()`, render
with an `expiresAt` ~2m10s out (so the soft deadline is ~10s), advance past it,
and assert `onExpired` fires.

**Verify**: passes.

## Test plan

- One `CheckoutSheet.test.tsx` covering the seven scenarios in Steps 3–4; one
  optional `PaymentStep.test.tsx` for the countdown. These are the behavior net
  for plan 017.
- Model the `jest.mock` style on
  `.../tickets/_actions/ticketActions.test.ts`; model React rendering on
  `@testing-library/react` `render`/`screen` usage.
- Verification: `yarn workspace web test` → all pass, N new tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `apps/web/jest.setup.ts` exists and is referenced by `setupFilesAfterEnv`
- [ ] `CheckoutSheet.test.tsx` exists and covers: free happy path, paid happy
      path, sold-out, resume→order, resume→refunded, resume→expired,
      resume→held-reopen, back-from-payment (8 scenarios)
- [ ] `yarn workspace web test` exits 0 with the new tests passing
- [ ] `yarn workspace web typecheck` exits 0
- [ ] No product component file under `_components/` was modified (`git status`)
- [ ] Any latent bug discovered is written into the executor's report, not fixed
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- A scenario cannot be tested without editing the component — report what's
  missing (e.g. an unqueryable state) rather than adding test hooks silently.
- The tRPC mock shape doesn't match what the component calls (the component
  drifted from the excerpt) — treat as drift.
- A characterization test reveals behavior that looks like a real bug (e.g. a
  double `beginPayment`, a missing release) — record it and continue; do not fix.

## Maintenance notes

- These tests assert **current** behavior. When plan 017 lands, they should pass
  unchanged (behavior-preserving) — that is their whole purpose. If 017 needs to
  change an assertion, that's a signal the refactor changed behavior; scrutinize it.
- Keep the mocks at the module seam (`@/lib/trpc`, `AuthProvider`, Stripe) so the
  reducer refactor in 017 (which changes internal state, not these seams) doesn't
  require touching the mocks.
- Follow-up (deferred): a fuller happy-path integration test with the real
  `PaymentStep` + a Stripe test key is out of scope; these unit-level tests are
  the net 017 needs.
