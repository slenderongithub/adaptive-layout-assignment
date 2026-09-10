# Adaptive Layout Engine

A single, framework-agnostic layout resolver that takes one abstract ad spec
and one surface profile and produces an absolute-pixel layout — adapting
composition (not just scaling) across a phone portrait screen, a phone
landscape screen, a broadcast lower-third, a retail kiosk, and a compact
widget, plus any unseen surface pasted in at runtime.

## Run it

```
npm install
npm run dev      # demo app at http://localhost:5173
npm run test     # vitest — invariant checks across presets + edge surfaces
npm run build    # production build
npx tsc --noEmit # strict type-check
```

## What to look at first

- `src/resolver.ts` — the algorithm. `resolve(spec, surface)`, ~400 lines,
  zero React/DOM imports.
- `src/spec.ts` / `src/surfaces.ts` — the input types and their runtime
  validators (`defineAdSpec`, `defineSurfaceProfile`).
- `src/invariants.ts` — the self-check (`checkInvariants`), called both
  inside `resolve()` and from the test suite.
- `ARCHITECTURE.md` — the algorithm walked through phase by phase, the type
  design, and why an unseen surface needs no code change.

## Demo app

Pick one of the 5 preset surfaces, or open **Custom Surface** and paste an
arbitrary `SurfaceProfile` as JSON — it runs through the exact same
`defineSurfaceProfile()` → `resolve()` call the presets use. The debug panel
below the preview shows the plain-English degradation trace (`warnings[]`)
and the raw `ResolvedLayout` JSON. A DOM / Canvas toggle swaps the renderer
without touching the resolver, to make the point that the two are decoupled.

## Bonuses implemented

- Custom-surface JSON input (see above)
- Warnings/decision-trace debug panel
- Animated transitions between surfaces (CSS transitions on the resolved
  geometry — the resolver still only ever emits absolute px, the animation
  is a pure rendering-layer add-on)
- Accessibility basics: real `<button>` elements for CTAs (enforcing
  `minTapTarget` gives them a real hit target too), `role="img"` +
  `aria-label` on image placeholders
- Canvas renderer (`src/render-canvas.ts`) as a second consumer of
  `ResolvedElement[]`, proving the resolver's output type is the actual
  contract, not the DOM renderer's JSX

Skipped: a `measureText`-aware sizing pass (would need a dependency injected
into an otherwise dependency-free resolver — legitimate, but explicitly
framed as optional polish); a general constraint solver (explicitly
discouraged by the assessment's own FAQ).

## Limitations (by design, not oversight)

- **Heuristic text truncation.** No real text-measurement is wired in;
  truncation estimates how many characters fit from `fontSize × 0.55` per
  character. Good enough to demonstrate the degradation stage; not
  pixel-accurate.
- **Fixed element type set.** `text | image | button` only — adding a new
  type means adding a case to the discriminated union and its two exhaustive
  switches (`resolver.ts` uses `assertNever` so a missing case is a compile
  error, not a silent runtime gap).
- **Monotonic degradation.** Once an element shrinks, truncates, or drops,
  it never grows back — even if a later drop on a different element frees
  up space that would have let it recover. This is a deliberate scoping
  choice: fully deterministic, no oscillation risk, no second pass needed.
- **Equal-priority tie-break = declaration order.** `headline` and `cta`
  both carry `priority: 1` in the demo spec; ties resolve by the order they
  appear in `AdSpec.elements` (JS's stable sort).
- **Degradation order is global, not region-local.** The candidate for the
  next degradation step is always the globally least-important surviving
  element, even if degrading it wouldn't relieve whichever region is
  actually overflowing. This is why `branding` (priority 5) degrades first
  in every cramped-surface demo even when the real pressure is a text stack
  it isn't part of — simple and deterministic beats "figure out which
  element is actually the problem."
- **`split`/`banner` have no fallback for an unbreakable headline word.** The
  demo spec's headline is deliberately undroppable and untruncatable (it
  auto-fits to 2 lines instead), so if a narrow `split`/`banner` copy column
  meets an unusually large `minTextSize`, a single word can end up wider
  than the column at the mandatory floor size with nowhere left to shrink —
  the resolver correctly throws rather than silently clipping, but it can't
  recompose around it. Confirmed independent of any other change: a
  240×120 touch surface with `minTextSize: 22` hits this in isolation.
  The new `micro` template (surfaces small in both dimensions, e.g. a
  220×220 "watch face") *does* guard against this — it measures the actual
  wrap width against the real column before committing, and falls back to a
  full-width `stack` if the split can't fit — `split`/`banner` don't yet have
  the equivalent check. Fixing it means generalizing that same
  measure-before-committing guard to the other two templates; scoped out
  here as a targeted, deliberately small change rather than reworking two
  well-tested code paths for a combination no preset or the assignment's own
  test surfaces ever produce.
- **Canvas renderer text fit.** `CanvasRenderingContext2D.fillText`'s
  `maxWidth` argument horizontally compresses text that doesn't fit rather
  than truncating it — a native canvas API quirk, visible if you toggle to
  the canvas renderer on a cramped surface. The DOM renderer instead relies
  on CSS `text-overflow: ellipsis`.


## Build order

1. Repo/tooling setup (Vite + React + TS strict), `spec.ts` / `surfaces.ts`
   types and runtime validators, the 5 preset surfaces, the demo ad spec.
2. `resolver.ts` phases A–C (natural sizing + region packing, no
   degradation yet) wired to a minimal DOM renderer and surface picker —
   first visible cross-surface milestone.
3. The priority-ordered degradation loop (phase D), `invariants.ts`,
   `tests/resolver.test.ts`, the Custom Surface JSON tab, the debug panel.
4. Verification pass (tsc, vitest, build, manual browser walkthrough of all
   presets + an unseen surface) — found and fixed two real geometry bugs in
   this pass (hero image height was being stretched instead of aspect-fit
   in row-mode layout; text elements had no visual fallback for content
   that overflowed their box, now handled with CSS ellipsis) — then the
   canvas renderer bonus, animation/accessibility polish, and this
   documentation.
