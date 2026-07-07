# Landing page — shader background explorations

Throwaway design prototypes for a new TropTix marketing landing page, exploring
**live animated backgrounds** ([Paper Shaders](https://paper.design) / [React Bits](https://reactbits.dev) style)
paired with the Caribbean-first brand.

These are self-contained HTML files — no build step, no dependencies. **Open in a
browser, or use the hosted links below** (the backgrounds are live WebGL, so a
browser is required — they won't render in GitHub's file preview).

## Live previews

- **Hero options (toggle between 6)** — https://claude.ai/code/artifact/0a8a1803-2983-4b92-8cc8-9fd8a77d7066
- **Sunset landing (fuller page)** — https://claude.ai/code/artifact/e750c8ad-7890-4680-bc73-0f400bf79eec

## Files

| File                                           | What it is                                                                                                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hero-options.html`](./hero-options.html)     | One hero, six switchable background engines. Use the pill switcher at the bottom, or keys **1–6** / **← →**.                                         |
| [`sunset-landing.html`](./sunset-landing.html) | A more complete single landing page (nav → hero → category marquee → organizer features → CTA → footer) using the "Sunset" mesh-gradient background. |

## The six background options

Each maps to a different shader style from the Paper Shaders catalog and retunes
palette, type, and layout to match:

1. **Sunset** — domain-warped mesh gradient; warm tropical, split layout with a glass ticket card.
2. **Aurora** — glowing wave ribbons on midnight; minimal, centered.
3. **Dither** — 8×8 Bayer 1-bit duotone; brutalist, mono type.
4. **Liquid** — saturated swirling warp; expressive, oversized gradient headline.
5. **Halftone** — pulsing dot / metaball field; playful, centered.
6. **Map** — a live Caribbean map (islands + animated event pins on major cities) over an ocean shader.

## Notes / caveats

- **Brand-accurate:** indigo `#6366F1`, real headline copy, Caribbean positioning — pulled from `apps/web`.
- **Prototype-grade:** built to compare visual directions, not production code. Fonts use the system stack (SF Pro on macOS); a real build would inline Inter.
- The **Map** islands are stylized approximations positioned in roughly correct relative geography — recognizable, but not survey-accurate.
- All variants respect `prefers-reduced-motion` (render a single frozen frame) and fall back to a CSS gradient if WebGL is unavailable.

Picking a favorite here tells us which actual Paper Shaders component to pull into
`apps/web` when we port the winner to a real Next.js route.
