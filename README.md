# Adaptive Layout Engine

A framework-agnostic TypeScript layout resolver for multi-surface ads. One
ad spec resolves into visibly different absolute-pixel layouts for phone
portrait, phone landscape, broadcast lower-third, square kiosk, compact
widget, and custom surfaces pasted at runtime.

Time spent: ~18 hours over 4 days.

## Setup

```sh
npm install
npm run dev
```

The demo runs at `http://localhost:5173`.

Useful checks:

```sh
npm test
npm run build
npx tsc --noEmit
```

## Demo

Use the surface picker to switch between the preset surfaces:

- `mobilePortrait`
- `mobileLandscape`
- `broadcastLowerThird`
- `retailKiosk`
- `compactWidget`

The same ad spec is resolved every time. The compact widget is intentionally
too small for every element at full size, so the debug panel shows the
priority-based degradation trace. The Custom tab accepts an arbitrary
`SurfaceProfile` JSON object and sends it through the same
`defineSurfaceProfile()` -> `resolve()` path as the presets.

The renderer toggle switches between DOM and Canvas consumers of the same
`ResolvedLayout`. The resolver itself imports no React, DOM, or Canvas APIs.

## Resolution Flow

```text
Ad Spec + Surface Profile
  -> runtime validators
  -> constraint resolver
  -> ResolvedLayout
  -> DOM or Canvas renderer
```

## Layout Algorithm

1. Build the content box from the surface size minus `safeArea`.
2. Compute a continuous type base and gap from the content-box area, height,
   viewing distance, tap-target floor, and text floor.
3. Choose a template from numeric constraints, not `surface.id`:
   `stack` for portrait/narrow boxes, `split` for square or landscape boxes,
   `banner` for very wide strips, and `micro` for surfaces small in both
   dimensions.
4. Before committing to side-by-side templates, check whether the headline can
   fit the real copy column at its required text floor. If not, fall back to
   `stack` where the copy gets the full width.
5. Compose all currently visible elements into concrete rectangles. Hero
   images are elastic; they take the space left by the copy rather than a
   fixed percentage. Text wrapping is decided inside the resolver so renderers
   do not guess.
6. If the composition overflows, degrade exactly one element and recompose.
   Lower-priority elements degrade before higher-priority ones.
7. Return visible elements, dropped element IDs, and a plain-English warning
   trace. Run invariant checks for bounds, overlap, tap targets, text floors,
   accounting, and priority-drop correctness before returning.

Degradation stages are deterministic:

- text shrinks to its floor, then truncates if allowed, then drops if allowed
- non-hero images shrink, then drop
- hero images are elastic, then drop only if their role and priority allow it
- buttons never shrink below tap or text floors; they only drop if the spec
  explicitly allows it

## TypeScript Design

- `ElementSpec` is a discriminated union on `type`: `text | image | button`.
- `ElementRole` is a closed union: `headline | price | secondary |
  hero-image | branding | cta`.
- Runtime validation enforces the role/type pairing the templates assume:
  headline, price, and secondary are text; hero-image and branding are images;
  cta is a button.
- The validator rejects duplicate IDs and duplicate roles, so every semantic
  slot is placed once, dropped once, or reported as invalid.
- `SurfaceProfile` is a union where `{ touchOnly: true }` requires
  `minTapTarget`.
- `Validated<T>` is a branded type. `resolve()` only accepts validated specs
  and surfaces.
- `ResolvedLayout` is renderer-ready: each visible element has absolute
  `x/y/width/height`, plus text lines, font size, content, or image source as
  appropriate.

## Files To Review

- `src/spec.ts` - ad spec types and validation
- `src/surfaces.ts` - surface types, validation, and presets
- `src/resolver.ts` - framework-independent layout algorithm
- `src/invariants.ts` - bounds, overlap, constraint, and accounting checks
- `src/render-dom.tsx` - DOM renderer
- `src/render-canvas.ts` - Canvas renderer
- `src/App.tsx` - demo wiring
- `ARCHITECTURE.md` - detailed design walkthrough

## Bonuses Implemented

- Custom unknown-surface JSON input
- Decision-trace debug panel
- Animated transitions between resolved layouts
- Basic accessibility: real CTA buttons, tap-target constraints, image labels
- Canvas rendering backend using the same resolver output

AI tools (the Claude Code CLI, GPT-5.5) were used as assistants: I directed a
review pass against the assignment requirements, which surfaced a docs/code drift in
an earlier ARCHITECTURE.md, a CTA text-floor gap, and a silent-drop bug in
element accounting, then had the AI implement the fixes I specified. I also
had it write a fuzz test stress-testing the custom-surface path with 3,136
generated `SurfaceProfile`s crossing size (50-3000px, tall/wide/square/tiny/
huge), safe area, touch/tap-target (24-88px), text floor (including
broadcast-style 32px), and viewing distance — see `custom surface fuzz` in
`tests/resolver.test.ts`. Result: 2,036 resolved with zero invariant
violations, 1,100 correctly rejected as physically infeasible, 0 crashes of
any other kind. All final code was reviewed and verified locally with tests
and build checks.

## Limitations

- The text metrics are heuristic. The resolver uses a small glyph-width model
  so wrapping is deterministic without DOM measurement, but it is not a real
  browser `measureText()` pass.
- Degradation is monotonic. Once an element shrinks, truncates, or drops, it
  does not grow back if a later drop frees space.
- Degradation is global, not region-local. The next candidate is the least
  important surviving element even if another element is causing the local
  pressure.
- The element library is intentionally small: text, image, and button.
- Canvas is a bonus renderer. It consumes the same layout contract, but the
  DOM renderer is the primary demo path because it supports the richer 3D hero
  treatment.
- Extremely tiny surfaces can still throw if the undroppable headline and CTA
  cannot physically fit inside the safe area. That is reported as an explicit
  error rather than clipping.
