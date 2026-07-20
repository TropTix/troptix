# Plan 017: Refactor `CheckoutSheet` to a reducer + discriminated-union state

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`, and post a short progress comment on the
> tracking issue (#462) when you start and finish.
>
> **Drift check (run first)**: `git diff --stat abab1702..HEAD -- apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx`
> If the file changed since this plan was written, compare the "Current state"
> excerpts against the live code before proceeding; on a mismatch, treat it as a
> STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (live buyer flow — but executed behind the plan-016 test net)
- **Depends on**: **016 (hard)** — the characterization tests MUST exist and pass
  before you start, and must still pass after every step.
- **Category**: tech-debt / maintainability
- **Planned at**: commit `abab1702`, 2026-07-18
- **Issue**: https://github.com/TropTix/troptix/issues/462

## Why this matters

`CheckoutSheet.tsx` (409 lines) manages the buyer flow with **11 `useState` + 1
`useRef`** and **3 `useEffect`s**, and drives a 7-value `Step` string union
imperatively from _both_ effects and mutation handlers. Two concrete costs: (1)
transitions are scattered — "what can follow `finalizing`?" isn't answerable in
one place — and (2) the state shape permits **impossible combinations** (a
`payment` step with no `clientSecret`), guarded only by defensive JSX
(`step === 'payment' && clientSecret && expiresAt && paymentSummary &&`) and a
one-shot `resumeReopenRef`. This refactor models state as a **discriminated
union keyed on `step`**, where each variant carries exactly the data valid for
it (so impossible states are unrepresentable), and moves transitions into a
single `useReducer`. Presentational steps and the external seams (tRPC, Stripe,
auth) are unchanged; only the orchestrator's internal state changes. This is a
**behavior-preserving** refactor — the plan-016 tests are the proof.

Deliberately NOT using a state-machine library (XState) or a store (Zustand):
the state is sheet-scoped and ephemeral (it's reset on close), there's no
cross-component sharing, and the one piece that must survive a remount already
lives in the URL (`?reservation=`). `useReducer` + a union fits exactly, adds no
dependency, and keeps lifecycle-bound cleanup for free.

## Current state

- `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx` — the flat state
  today (lines ~63–85):

```ts
const [step, setStep] = useState<Step>('select');
const [selection, setSelection] = useState<Record<string, number>>({});
const [localError, setLocalError] = useState<string | null>(null);
const [reservationId, setReservationId] = useState<string | null>(null);
const [clientSecret, setClientSecret] = useState<string | null>(null);
const [expiresAt, setExpiresAt] = useState<string | null>(null);
const [paymentSummary, setPaymentSummary] = useState<
  | {
      /* items,... */
    }
  | null
>(null);
const [successData, setSuccessData] = useState<SuccessData | null>(null);
const [slowFinalize, setSlowFinalize] = useState(false);
const resumeReopenRef = useRef(false);
```

- The impossible-state guard in the JSX (lines ~347–350):

```tsx
{step === 'payment' && clientSecret && expiresAt && paymentSummary && (
  <PaymentStep clientSecret={clientSecret} ... />
)}
```

- Transitions live in: `handleContact` (218–276), the resume effect (101–106),
  the poll→step effect (109–159), `backFromPayment` (287–290), `startOver`
  (278–281), `resetState` (171–185), and the `slowFinalize` effect (162–169).
- External seams (do not change): `trpc` (`@/lib/trpc`), `useAuth`
  (`@/components/AuthProvider`), `PaymentStep`, `global.fetch`, and
  `window.history`/`location` via `setReservationParam`.

## Target design (do this, don't improvise)

Introduce a discriminated union — each `step` carries only its valid data:

```ts
type Selection = Record<string, number>;
type PaymentData = {
  reservationId: string;
  clientSecret: string;
  expiresAt: string;
  summary: PaymentSummary;
};

type CheckoutState =
  | { step: 'select'; selection: Selection; error: string | null }
  | { step: 'contact'; selection: Selection; error: string | null }
  | { step: 'payment'; payment: PaymentData }
  | { step: 'finalizing'; reservationId: string; slow: boolean }
  | { step: 'success'; order: SuccessData }
  | { step: 'expired' }
  | { step: 'refunded'; reservationId: string };
```

Drive it with a **pure reducer** and explicit actions, e.g.:
`RESET`, `ADJUST_SELECTION`, `GO_CONTACT`, `GO_SELECT`, `RESERVATION_FAILED`
(carries error), `PAYMENT_READY` (carries `PaymentData`), `START_FINALIZING`
(carries reservationId), `POLL_RESULT` (carries the `getCheckoutState` data),
`SLOW_FINALIZE`, `SUCCEEDED` (carries order), `EXPIRED`, `REFUNDED`.

Rules:

- **Side effects stay out of the reducer.** Keep the tRPC mutation calls, the
  `fetch` confirmation/refund POSTs, and `setReservationParam` in the component's
  handlers/effects; those handlers just `dispatch(...)` on completion. The poll
  effect maps `getCheckoutState` data to a single `dispatch({ type: 'POLL_RESULT', data })`.
- **The `resumeReopenRef` one-shot** becomes representable in state or a guard on
  the `payment` variant — but keep its behavior identical (a resumed `held` state
  triggers `beginPayment` exactly once). If you can't make it a pure reducer
  transition cleanly, keeping a single ref for "reopen already fired" is
  acceptable; do not add new refs beyond that.
- **The JSX ladder** switches on `state.step` and reads variant fields directly —
  the `step === 'payment' && clientSecret && ...` conjunction disappears because
  `state.step === 'payment'` guarantees `state.payment` exists.
- `resetState`/`handleOpenChange` dispatch `RESET`; keep the 250ms close-reset
  timing and the `?reservation=` clearing behavior identical.

## Commands you will need

| Purpose                       | Command                                   | Expected on success |
| ----------------------------- | ----------------------------------------- | ------------------- |
| The 016 net (must stay green) | `yarn workspace web test CheckoutSheet`   | all pass, unchanged |
| Reducer unit test             | `yarn workspace web test checkoutReducer` | all pass            |
| Full web tests                | `yarn workspace web test`                 | all pass            |
| Typecheck                     | `yarn workspace web typecheck`            | exit 0              |

## Scope

**In scope**:

- `apps/web/src/app/e/[eventId]/_components/CheckoutSheet.tsx` (state → reducer)
- `apps/web/src/app/e/[eventId]/_components/checkoutReducer.ts` (new — the pure
  reducer + types)
- `apps/web/src/app/e/[eventId]/_components/checkoutReducer.test.ts` (new — pure
  reducer unit tests)

**Out of scope** (do NOT touch):

- `SelectStep.tsx`, `ContactStep.tsx`, `PaymentStep.tsx`, `SuccessTicket.tsx` —
  their props and behavior are unchanged. If a step's props would need to change,
  STOP and report (it means the state model diverged from today's data flow).
- The tRPC contracts/services, Stripe wiring, `AuthProvider`, and
  `setReservationParam`'s effect on the URL.
- The **plan-016 test files** — they are the oracle. Do NOT edit them to make
  them pass. If a 016 test fails, either your reducer changed behavior (fix the
  reducer) or the test encoded a bug 017 legitimately changes — in the latter
  case STOP and report; do not quietly edit the test.

## Git workflow

- Branch: `advisor/017-checkout-reducer-refactor`
- Commit per step (reducer + its unit test; then component swap); Conventional
  Commits, e.g. `refactor(checkout): model CheckoutSheet state as a reducer union`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 0: Confirm the net is green before touching anything

Run `yarn workspace web test CheckoutSheet`. If plan 016's tests are absent or
failing, STOP — 017 must not proceed without them.

**Verify**: 016 tests pass.

### Step 1: Extract the pure reducer + types (no wiring yet)

Create `checkoutReducer.ts` with the `CheckoutState` union, the action type, the
initial state (`{ step: 'select', selection: {}, error: null }`), and a pure
`checkoutReducer(state, action)`. No React, no side effects.

**Verify**: `yarn workspace web typecheck` → exit 0.

### Step 2: Unit-test the reducer (pure, fast)

Create `checkoutReducer.test.ts` asserting each transition in isolation:
select→contact, contact→payment (PAYMENT_READY), RESERVATION_FAILED keeps step
`contact` with error set, POLL_RESULT('order')→success, ('refunded')→refunded,
('expired')→expired, ('held')→payment reopen, EXPIRED→expired, RESET→select. This
is where the transition logic becomes individually verifiable (the whole point).

**Verify**: `yarn workspace web test checkoutReducer` → all pass.

### Step 3: Swap the component onto the reducer

Replace the 11 `useState` with `const [state, dispatch] = useReducer(checkoutReducer, initialState)`.
Convert each handler/effect to compute its side effects then `dispatch(...)`:

- `handleContact`: unchanged tRPC calls + fetch + `setReservationParam`; replace
  the `setStep`/`setX` calls with dispatches (`RESERVATION_FAILED`,
  `PAYMENT_READY`, `SUCCEEDED`).
- Resume effect → `dispatch(START_FINALIZING)`.
- Poll effect → `dispatch(POLL_RESULT)`; keep the confirmation/refund fetch and
  the one-shot `beginPayment`-on-`held` behavior identical.
- `slowFinalize` effect → `dispatch(SLOW_FINALIZE)`.
- `backFromPayment`/`startOver`/`resetState` → `dispatch(RESET)` (+ the existing
  `release.mutate` and `setReservationParam(null)` side effects, unchanged).
- JSX: `switch`/conditionals on `state.step`, reading variant fields.

**Verify**: `yarn workspace web typecheck` → exit 0.

### Step 4: Run the net

**Verify**: `yarn workspace web test CheckoutSheet` → **all 016 tests pass
unchanged**. Then `yarn workspace web test` → full suite green. If any 016 test
fails, your refactor changed behavior — fix the reducer/wiring until green (do
not edit the test).

## Test plan

- New `checkoutReducer.test.ts` (pure) covering every transition individually.
- The plan-016 `CheckoutSheet.test.tsx` is the integration regression net and
  must pass **unchanged**.
- Verification: `yarn workspace web test` → all pass, including the new reducer
  unit tests and the untouched 016 tests.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `checkoutReducer.ts` exports a pure reducer + the `CheckoutState` union
- [ ] `CheckoutSheet.tsx` uses `useReducer` (grep: no more than the one allowed
      `resumeReopenRef` ref remains; the 11 `useState` slots are gone —
      `grep -c "useState" CheckoutSheet.tsx` is 0 or only unrelated local UI state)
- [ ] The JSX no longer guards `step === 'payment' && clientSecret && ...`
      (`grep -n "clientSecret &&" CheckoutSheet.tsx` → no match)
- [ ] `checkoutReducer.test.ts` passes
- [ ] **All plan-016 tests pass unchanged** (no edits to `CheckoutSheet.test.tsx`)
- [ ] `yarn workspace web typecheck` exits 0
- [ ] Presentational step components unmodified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any plan-016 test would need editing to pass — that means behavior changed;
  report the diff in behavior rather than editing the oracle.
- Making a transition pure would require changing a presentational step's props.
- The one-shot resume-reopen behavior can't be preserved without adding multiple
  new refs — report your approach before proceeding.
- `grep -c "useState"` can't reach ~0 because a genuinely-local piece of UI state
  (unrelated to the step machine) exists — that's fine; note it and proceed.

## Maintenance notes

- Adding a new step is now a **local** change: add a union variant, an action,
  one reducer case, and one JSX branch — no longer 5 lockstep edits across a
  `Step` union, `STEP_TITLE`, an effect, `resetState`, and the JSX ladder.
- If payment sub-states ever multiply (3DS-pending, delayed/async methods, retry
  — all deferred in ADR 0018), _that_ is when to reconsider XState; the reducer
  union is the right precursor and migrates cleanly.
- A reviewer should diff behavior via the 016 tests, and confirm the reducer is
  pure (no `fetch`/tRPC/`window` inside it) — side effects belong in the
  component.
