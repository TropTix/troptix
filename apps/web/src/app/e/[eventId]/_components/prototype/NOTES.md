# PROTOTYPE — checkout sign-in step (OTP gate)

**Question:** What should the required-sign-in step look like inside the
checkout sheet? (Plan: `docs/plans/2026-08-otp-login-checkout.md`. UI only —
auth is mocked, any 6-digit code verifies.)

**How to view:** run the `web` dev server, open any event page with
`?variant=A` (or `B`/`C`), tap Get Tickets, pick tickets, continue. Flip
variants with the floating pill or ←/→.

- **D — Email-first branch**: enter email → account lookup. Existing →
  "Welcome back" + code. New → in-sheet "Create your account" (first/last
  name, email echoed with change link) → code to confirm. Contact step lands
  prefilled (signup names or account profile), names editable, email fixed.
  Mock rule: an email containing "new" acts as a first-time buyer.
- **A — Separate step**: sheet-style header; email → code as its own step, no
  branch, no name capture.
- **B — Merged into contact**: one "Your details" screen; the code panel
  appears under the email after Continue. (If B wins, the real build absorbs
  the contact step into it — names + email + code on one screen.)
- **C — Focused takeover**: selection summary pinned on top for reassurance;
  sign-in is the hero; "Change tickets" text link instead of header chrome.

**Verdict:** Direction chosen in design review (2026-08-25): **D**, built to
the described flow and folded into `docs/plans/2026-08-otp-login-checkout.md`
(decisions 5, 6, 9). A/B/C kept for comparison until final confirmation — then
delete this folder and the `PROTOTYPE`-marked lines in `CheckoutSheet.tsx`.
