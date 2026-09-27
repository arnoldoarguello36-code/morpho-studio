# Design improvements — Morpho Studio + Hótel Húsavík concept

**Date:** 2026-09-27

## Method

A `/design-review`-style audit (headless browser walkthrough + 21st.dev component search for comparable patterns) was run against `hellomorpho.com` (Morpho Studio's own site) and `husavik-concept.html` (a client-facing booking concept for Hótel Húsavík). This was followed by a source-level pass mapping every flagged screenshot finding back to the actual CSS/HTML/JS, since a couple of the audit's screenshot-only calls turned out to be wrong once the markup was inspected. This document reports what was actually changed, what was deliberately left alone, and why.

Both sites were already well-built going in: a real custom design-token system (not framework defaults), an intentional brand gradient, real photography, and an honest "illustrative data" disclosure on the concept. There was no generic AI-generated-slop pattern to strip out — the changes below are targeted fixes, not a redesign.

## Changes made

| # | Finding | Severity | Change | File : line |
|---|---|---|---|---|
| 1 | `input`/`select`/`textarea`/`button` had no explicit `font-family`, so browsers fell back to UA defaults (Times/Arial) instead of the declared brand stack. This is what the audit's computed-style scan picked up as stray serif/system fonts. | Medium (real bug) | Added `input, select, textarea, button{ font:inherit; color:inherit; }` to the shared reset block. `husavik-concept.html` already had an equivalent `button{ font:inherit; }` rule plus explicit `font-family` on its form fields, so no change was needed there. | [index.html:53](index.html#L53), [calculator.html:49](calculator.html#L49), [proposal-husavik.html:59](proposal-husavik.html#L59) |
| 2 | Arrival/departure were raw `<input type="date">` — the native picker is inconsistent across browsers and gives no visibility into length of stay before typing both ends. First interaction in the booking funnel. | High (UX) | Replaced the two visible date inputs with a single trigger button ("Feb 12 → Feb 14 · 2 nights") that opens a popover: month grid, prev/next navigation, click-start/click-end range selection, live night count, Escape/outside-click to close. The original `#bk-arrival`/`#bk-departure` inputs stay in the DOM (hidden) and are kept in sync, so nights calc, the sticky bar, discount codes, "Check availability" validation, and the booking wizard needed **zero changes** — same IDs, same `.value`, same `input` event. | [husavik-concept.html:706-724](husavik-concept.html#L706) (markup), CSS block after `.bk-search-grid` (~L165), JS block after `updateBookingPreview()` (~L1416) |
| 3 | `.demo-banner` was one long sentence that wrapped to 3 lines at 375px, pushing the hero below the fold on mobile. | Low (polish) | CSS-only: wrapped the "prepared by Morpho Studio… current site: hotelhusavik.is" clause in `<span class="banner-detail">`, hidden under a `max-width:640px` media query. Mobile now shows only "Design concept — not a live site · proposal & pricing →". | [husavik-concept.html:706-708](husavik-concept.html#L706) (markup), [husavik-concept.html:70](husavik-concept.html#L70) (media query) |

## Kept as-is (reviewed, not oversight)

- **Gradient CTA (`--m-grad`)** — Morpho's core brand metaphor (structural iridescence of a morpho butterfly's wing, not paint). It's used in exactly one button style plus a couple of small accents (`.calc-stat.hot dd` gradient text, `.eyebrow::after` accent line, `.contact` background) — six tightly-scoped uses across a 1400-line file, not the generic gradient-everywhere pattern the audit's screenshot pass first flagged it as.
- **"Case study" / examples section layout** — reads like a centered 3-column card grid in a scrolled screenshot, but the source (`index.html:1063-1113`) is actually an icon-left/content-right row layout (`grid-template-columns:200px 1fr` per row), already differentiated from a generic grid.
- **Pricing cards (`.eng-grid`)** — checked against 21st.dev's `pricing-16`/`pricing-01` patterns for comparison; structure, spacing, and hierarchy are already in line with well-built pricing card conventions. No change needed.
- **Everything else on the Húsavík concept** — room cards, admin dashboard (rates/promotions/codes/payments tabs), promotions, attractions, about section — reviewed against the audit findings and left as-is; no real gaps found beyond the three items above.

## Before / after

- `docs/design-audit-2026-09-27/morpho-first-impression.jpg`, `morpho-viewport-top.jpg`, `morpho-mobile-top.jpg` — Morpho Studio, pre-existing state (font-inherit fix is not visually distinguishable in a screenshot; verified via computed-style inspection instead, see Verification below).
- `docs/design-audit-2026-09-27/husavik-top.jpg`, `husavik-mobile-top-before.jpg` — Húsavík concept before this pass.
- `docs/design-audit-2026-09-27/husavik-date-picker-after.jpg` — new range-calendar popover, open state, showing the highlighted range and night count.
- `docs/design-audit-2026-09-27/husavik-banner-mobile-after.jpg` — condensed `.demo-banner` at 375px, hero no longer pushed below the fold.

## Verification

- `getComputedStyle(document.querySelector('button')).fontFamily` on `index.html` and `calculator.html` now returns `"Instrument Sans", system-ui, -apple-system, sans-serif` instead of a UA default serif/sans.
- Date-range popover: selected a new range (Feb 20 → Feb 25) via the calendar, confirmed `#bk-arrival`/`#bk-departure` values updated to `2026-02-20`/`2026-02-25`, the booking preview updated to "5 nights · from 109,500 ISK total", and "Check availability" still returns the same success message as before the change — no regression in downstream logic.
- Mobile banner: at 375×812 viewport, `.banner-detail` computes to `display:none` and the banner now wraps to 2 lines instead of 3.

## Execution notes

Each change above landed as its own local commit (not pushed — this repo deploys via GitHub Pages, so pushing is a separate decision):
1. `fix(style): form controls inherit brand fonts instead of UA default`
2. `feat(husavik): replace native date inputs with range-calendar popover`
3. `style(husavik): condense internal-review banner on mobile`
4. `docs: add design-improvements proposal` (this file + screenshots)
