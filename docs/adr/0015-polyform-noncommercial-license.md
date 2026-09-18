# 15. PolyForm Noncommercial License (source-available, no business use)

- **Status:** Accepted
- **Date:** 2026-06-10

## Context

The repository had no `LICENSE` file and the root `package.json` declared
`"license": "ISC"` — a permissive OSI open-source license that grants anyone,
including competitors, unrestricted commercial use. That does not match the
intent for TropTix: the source should be public and readable, but **business /
commercial use should require a separate paid license** from the maintainer.

A few models can express "no business use":

- **PolyForm Noncommercial 1.0.0** — purpose-built source-available license;
  permits any noncommercial purpose (personal, hobby, study, research,
  nonprofit, government), forbids commercial use. Cleanly drafted, SPDX-listed
  (`PolyForm-Noncommercial-1.0.0`).
- **Business Source License 1.1** — time-delayed open source; each version
  auto-converts to a true OSS license after N years. Adds ongoing maintenance
  (per-version change dates) and still eventually grants commercial rights.
- **Functional Source License** — permits internal business use, only forbids
  building a competing product; more permissive than we want.
- **Fully proprietary** — grants no use/modify/share rights at all; more
  restrictive than the goal of letting noncommercial users build on TropTix.

Important framing: a license that discriminates against commercial use is **not
OSI "open source"** (the Open Source Definition forbids restricting fields of
endeavor). The correct term is **source-available**.

## Decision

License TropTix under **PolyForm Noncommercial License 1.0.0**, dual-licensed:

- `LICENSE.md` contains the verbatim PolyForm text, a plain-language summary, a
  `Required Notice:` copyright line, and a pointer to obtain a commercial
  license.
- Root `package.json` `license` field set to the SPDX id
  `PolyForm-Noncommercial-1.0.0` (replacing `ISC`); `author` set to the
  maintainer.
- The maintainer **reserves the right to sell separate commercial licenses**
  (open-core / dual-licensing). Commercial use is available by contacting
  emmanuel.sylvester22@gmail.com.

## Consequences

- **Good** — source is public and contributable for noncommercial use; for-profit
  use requires a paid license, preserving a commercialization path; the chosen
  license is standard, SPDX-recognized, and well understood.
- **Trade-off** — TropTix is **not** "open source" and must not be marketed as
  such (it is source-available); it is ineligible for OSI/"open source"
  ecosystems, some package registries, and certain corporate OSS programs.
- **Trade-off** — noncommercial-only deters some contributors who will not
  assign work to a commercially-licensable project; inbound contributions should
  be covered by a CLA/DCO if commercial relicensing is to stay clean (future
  work, not decided here).
- **Care needed** — the PolyForm text must stay verbatim; only the surrounding
  notice/preamble is ours to edit. The `Required Notice:` line propagates to all
  redistributions per the Notices section.
