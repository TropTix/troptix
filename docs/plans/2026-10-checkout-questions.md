---
title: Checkout questions
status: proposed
created: 2026-10-28
tracking-issue: TBD
---

# Checkout questions

Let an Organizer add a few questions to an event. A buyer answers them on the
"Your details" step, before the hold is taken. The Organizer reads the answers
on a Questions tab for the event, on each order's detail page, and as a CSV.

That is the whole feature. Four field types, one answer set per order, no
branching, no per-attendee forms.

## Why

Organizers ask for this to collect what a ticket alone does not tell them:
meal choice, T-shirt size, "how did you hear about us", a waiver tick, a
company name for a networking event. Today they chase it by email after the
sale or run a second form elsewhere. Both lose people and split the data from
the order it belongs to.

## Non-goals

- **Per-attendee answers.** One answer set per order, not one per ticket.
  Buyer contact is already per order and copied onto every ticket
  (`materializeOrder`); answers follow the same shape. A per-ticket
  attendee form is its own later initiative.
- **Per-ticket-type questions.** Questions belong to the event and every
  buyer sees them.
- **Branching, conditional or paged forms.** A flat list.
- **File, date, number or phone fields.** Text, long text, single choice,
  checkbox. More types are additive later.
- **Editing answers after purchase**, by the buyer or the Organizer.
- **Showing answers to the buyer.** Not in the confirmation email and not on
  the attendee Order page. That page is unauthenticated for now
  ([ADR 0022](../adr/0022-attendee-order-pages-unauthenticated-interim.md)),
  so free-text answers should not render there yet.
- **The mobile and organizer apps.** Web only.

## Vocabulary

New terms for CONTEXT.md when this ships:

- **Checkout question**: a question an Organizer attaches to an Event, shown
  to every buyer on the details step. Has a type, a label, a required flag
  and, for single choice, options. _Avoid_: custom field, form field,
  attendee question (per-attendee is not modeled).
- **Answer**: a buyer's response to one Checkout question, stored on the
  Order with a snapshot of the question's label and type as it read at
  purchase time. _Avoid_: response (that is the organizer-facing view, below).
- **Responses**: the Organizer's view of answers across an event's orders,
  one row per order.

## The buyer experience

The checkout sheet keeps its steps: `select → contact → payment → success`.
Questions render on the `contact` step, under the first name, last name and
email fields, in the Organizer's order. Required questions carry the same
inline error style the contact fields use. A `checkbox` question renders as a
checkbox with the label beside it; required means it must be ticked, which is
how a waiver or rules acknowledgment works.

Answers travel with the hold. `createReservation` already takes
`{ eventId, items, accessCode?, contact, analytics? }`; it gains
`answers: Array<{ questionId, value }>`. The server validates the answers
against the event's current questions **before** it takes inventory, so a
failed answer never costs the buyer a hold or the event a reserved seat.

An event with no questions renders exactly what it does today. No flag is
needed on the buyer side: nothing shows until an Organizer adds a question.

## The organizer experience

### Questions tab

A new tab in `EventManagementNav`
([event-management-nav.tsx](../../apps/web/src/components/ui/event-management-nav.tsx))
after Tickets: **Questions**, at `/organizer/events/[eventId]/questions`.
Two sections on one page.

**Edit questions.** A table of the event's questions: label, type, required,
with Edit and Remove per row and Move up / Move down. "Add question" opens a
Sheet with a small form (type, label, required, options for single choice),
the same shape as `AddTicketTypeDrawer`. Every change saves the whole list
through one server action, `updateCheckoutQuestions`, so there is one write
path and no partial state. Removing a question with answers already collected
asks for confirmation and says the answers stay on their orders.

Up to 10 questions per event. Labels up to 120 characters. Single choice has
2 to 20 options of up to 80 characters each.

**Responses.** Below the editor, a table with one row per `COMPLETED` order:
Order, Customer, Placed (a `<LocalTime>`), then one column per current
question. Blank cells where an order predates a question. Capped at the newest
200 orders, the same cap as the Orders tab. A "Download CSV" button fetches
`/organizer/events/[eventId]/questions/export`, a route handler that streams
every completed order with the same columns and no cap. Timestamps in the CSV
are ISO 8601 UTC; a file cannot know the viewer's zone.

### Order detail

[The organizer order page](../../apps/web/src/app/organizer/events/[eventId]/orders/[orderId]/page.tsx)
gains an "Answers" card after Customer, listing every answer stored on the
order by its snapshot label, including answers to questions since removed.
The attendee list and the Orders tab are unchanged.

### Rollout

A PostHog flag `CHECKOUT_QUESTIONS` (`'checkout-questions'`) in
`packages/api/src/contracts/featureFlags.ts` gates the Questions tab, the
Questions page (`notFound()` when off, as the payouts page does) and the write
action. Buyer rendering and the order-detail card are ungated: they only show
data that exists. The flag comes out once the first few organizers have used
it, per the feature-flags runbook.

## Data model

Three nullable `jsonb` columns, one migration, no new tables.

```prisma
// Events
checkoutQuestions Json?   // CheckoutQuestion[]; null = no questions

// Reservation
checkoutAnswers   Json?   // CheckoutAnswer[]; written at reserve

// Orders
checkoutAnswers   Json?   // copied from the Reservation in materializeOrder
```

Contracts, in a new `packages/api/src/contracts/checkoutQuestions.ts`:

```ts
export const checkoutQuestionTypeSchema = z.enum([
  'text',
  'textarea',
  'select',
  'checkbox',
]);

export const checkoutQuestionSchema = z.object({
  id: z.string().min(1), // uuidv7, minted by the write service
  type: checkoutQuestionTypeSchema,
  label: z.string().trim().min(1).max(120),
  required: z.boolean(),
  options: z.array(z.string().trim().min(1).max(80)).min(2).max(20).optional(),
});
export const checkoutQuestionsSchema = z.array(checkoutQuestionSchema).max(10);

export const checkoutAnswerSchema = z.object({
  questionId: z.string().min(1),
  label: z.string(),
  type: checkoutQuestionTypeSchema,
  value: z.union([z.string(), z.boolean()]),
});
export const checkoutAnswersSchema = z.array(checkoutAnswerSchema);

export function parseStoredCheckoutQuestions(
  value: unknown
): CheckoutQuestion[];
export function parseStoredCheckoutAnswers(value: unknown): CheckoutAnswer[];
export function checkoutAnswersFormSchema(
  questions: CheckoutQuestion[]
): ZodType;
```

The stored readers follow `parseStoredFlyerPalette`
([contracts/events.ts](../../packages/api/src/contracts/events.ts)): tolerant,
`.catch([])`, so a malformed row degrades to "no questions" rather than a 500
on the event page.

`checkoutAnswersFormSchema(questions)` builds the per-event zod object both
sides use: the `ContactStep` form resolver on the client and
`createReservation` on the server. One function, one set of rules:

| Type       | Value     | Required means     | Also                     |
| ---------- | --------- | ------------------ | ------------------------ |
| `text`     | `string`  | trimmed length ≥ 1 | max 500 characters       |
| `textarea` | `string`  | trimmed length ≥ 1 | max 2000 characters      |
| `select`   | `string`  | one option chosen  | must be one of `options` |
| `checkbox` | `boolean` | must be `true`     |                          |

An optional question may be omitted or sent empty. An answer to a
`questionId` the event does not have is rejected. The server builds the
stored `CheckoutAnswer[]` from its own copy of the questions, so the label and
type snapshot are never trusted from the client.

### Why snapshots

An Organizer may rename or remove a question after sales start. If answers
stored only `{ questionId, value }`, a removed question would leave orphan
values the order page could not name. Storing `label` and `type` alongside
the value makes every order self-describing, which is what the order-detail
card renders. The Responses table and CSV still key columns by `questionId`,
so a relabelled question keeps its column and its old answers.

### Why JSON, not tables

Two tables (`CheckoutQuestion`, `CheckoutAnswer`) would be the textbook
shape. They buy per-question SQL (filter orders by an answer) and foreign
keys. Neither is needed here: the Responses view is "every order's answers
for one event", which is one query on `Orders` either way, and the only
consumer that pivots by question is app code over at most a few thousand rows
per event. JSON also keeps the hold path to one row write, and the organizer
write to one column update, with no diff-and-sync of child rows. If
per-answer querying ever matters, a generated column or a GIN index on the
`jsonb` is available before a table split is.

This is a durable choice; it gets an ADR (0036) in the first PR.

## Service and web changes

### `@troptix/api`

- `contracts/checkoutQuestions.ts` as above; export from `contracts/index.ts`.
- `contracts/events.ts`: `eventDetailSchema` gains
  `questions: z.array(checkoutQuestionSchema)`. `shapeEventDetail` in
  `services/events.ts` fills it from `parseStoredCheckoutQuestions`.
- `contracts/reservations.ts`: `createReservationInputSchema` gains
  `answers: z.array(z.object({ questionId, value })).max(10).default([])`.
- `services/reservations.ts`:
  - `createReservation` loads the event's questions with the ticket types it
    already loads, validates `answers` with `checkoutAnswersFormSchema`,
    builds the snapshot array, and passes it to `reserve`.
  - `ReserveInput` gains `answers?: CheckoutAnswer[]`; `reserve` writes it to
    `Reservation.checkoutAnswers`.
  - `materializeOrder` copies `reservation.checkoutAnswers` onto the order.
- `contracts/organizer.ts`: `orderDetailSchema` gains
  `answers: z.array(checkoutAnswerSchema)`; a new `checkoutResponseRowSchema`
  `{ orderId, customerDisplay, email, createdAt, answers }`.
- `services/organizer-orders.ts`: `getOrderDetail` selects and parses
  `checkoutAnswers`.
- New `services/organizer-checkout-questions.ts`:
  - `updateCheckoutQuestions(prisma, actor, eventId, questions)`: parse with
    the input schema (ids optional on input), `resolveOrganizerScope`,
    `requireOwnedEvent`, mint ids for new questions with `generateId`, write
    the column (`Prisma.DbNull` for an empty list), return
    `organizationSlug` so the action can call `revalidateEventPublicPages`.
    The event page is served from the data cache (`getEventDetailRaw`), so
    forgetting that revalidation means buyers see stale questions.
  - `listCheckoutResponses(prisma, actor, eventId, { viewAsOrganizerUserId, limit? })`:
    completed orders in `eventsInScope`, newest first, answers parsed.
- `server.ts`: export both services.
- `contracts/featureFlags.ts`: add `CHECKOUT_QUESTIONS`.
- Tests next to the existing reservation and organizer tests: answer
  validation (required, option membership, unknown id, length), snapshot
  building, copy onto the order, the organizer write's ownership check.

### `apps/web`

- `app/e/[eventId]/_components/ContactStep.tsx`: takes `questions`, renders
  them under the contact fields, resolver becomes
  `reservationContactSchema.extend({ answers: checkoutAnswersFormSchema(questions) })`.
  `select` uses the existing `Select` primitive; `checkbox` needs the shadcn
  `Checkbox`, which the UI folder does not have yet (add it).
- `app/e/[eventId]/_components/CheckoutSheet.tsx`: `handleContact` passes
  `answers` through to `createReservation`. This file is also touched by the
  open motion PR (#630); land that first or rebase onto it.
- `app/organizer/events/[eventId]/questions/page.tsx` plus `_components/`
  (`QuestionsManager`, `QuestionDrawer`, `ResponsesTable`) and
  `_actions/questionActions.ts`; `questions/export/route.ts` for the CSV.
  Reads pass `viewAsOrganizerUserId`; the write never does.
- `app/organizer/events/[eventId]/orders/[orderId]/page.tsx`: the Answers
  card.
- `components/ui/event-management-nav.tsx`: the Questions tab, shown when the
  flag is on.

### Database

- One migration from `pnpm --filter web db:new add_checkout_questions`, after
  editing `schema.prisma`: three `ADD COLUMN ... jsonb` statements.
- `supabase/seed.sql`: `seed_event_1` gets two questions (a required
  `select` and an optional `text`); its seeded orders get matching answers so
  the Responses table and order-detail card have something to show on a
  preview branch. The column lists are explicit, so the other events need no
  change.

## Phases

Three PRs, each leaving a working product.

1. **Schema, contracts, services.** Migration, seed, contracts,
   `createReservation` validation and storage, `materializeOrder` copy,
   `EventDetail.questions`, the organizer write and read services, the flag,
   ADR 0036, tests. Buyers and organizers see no change yet; the event page
   DTO carries an empty array.
2. **Buyer side.** `ContactStep` renders questions and sends answers. One
   seeded event with questions, and a free-checkout e2e case in
   `e2e/tests/free-checkout.spec.ts` that answers a required question, leaves
   an optional one blank, and checks the order's stored answers.
3. **Organizer side.** Questions tab (editor and Responses), CSV export, the
   order-detail card, the nav entry behind the flag. CONTEXT.md gains the
   three terms. The flag is turned on for the first organizers.

Phase 2 before phase 3 is deliberate: the e2e suite proves the whole data
path end to end before any organizer can create a question, and phase 3 then
has real rows to render against.

## Alternatives considered

- **Questions in the Edit form.** The Edit page is event fields only; ticket
  types already moved to their own tab for existing events. A list with its
  own add/edit Sheet fits the Tickets-tab pattern, not a Card inside a
  754-line form.
- **Responses on the Orders tab.** Adding N dynamic columns to a table that
  already filters and searches makes both worse. Keeping Responses beside the
  questions they answer also means one place to look.
- **A separate "Questions" step in the checkout sheet.** One more screen
  between a buyer and payment, for what is usually two or three fields. The
  contact step already holds a form with validation; extending it is less
  friction and less code.
- **Normalized tables.** Discussed above.
- **Answers on every Ticket as well as the Order.** Tickets get the buyer's
  name and email copied today so a scanner can show them. Nothing at the door
  needs the answers; copying them would only widen the rows the check-in slice
  reads.

## Open questions for review

1. **Reorder in v1?** Move up / Move down is two buttons and one list write.
   It is in; cut it if "very simple" should mean creation order only.
2. **CSV in v1?** The Orders tab is capped at 200 with a comment pointing at
   a CSV export that does not exist. This plan builds the first one, for
   Responses only. It is the easiest piece to drop to a follow-up.
3. **Should the checkbox type be named for its main use?** A `checkbox` with
   `required` is how an organizer gets a waiver tick. A later `acknowledge`
   type with a link to terms would be additive.
