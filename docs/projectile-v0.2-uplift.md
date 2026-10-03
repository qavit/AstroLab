# Projectile v0.2 uplift — 2026-10-03

## Current baseline

Implementation baseline: main/origin main `df154bf`. Projectile was developed independently, then rebased onto main after FBD was merged. Both increments are now merged into local main. No physics engine or Electrostatics state rewrite. Science regression tests remain unchanged.

The recovery audit was reported before implementation. FBD PR #18 was draft/open, seven commits ahead and 23 behind main, with science/model/tests/docs only. Its local branch was rebased cleanly onto main and now contains the first horizontal-table learning loop. Full audit and FBD decisions are now included in main in `docs/mechanics-recovery-2026-10-03.md`. Remote branch and PR remain unchanged; nothing pushed.

## Product changes

- Reuse existing Lab shell, brand, ThemeToggle and responsive chart; keep visible text for mobile actions, wrapping transport, explicit keyboard focus and keyboard panel resizing.
- Use existing LabLayerDrawer/LayerGroup/LayerToggle; visibility is local presentation state. Trajectory, velocity, velocity components, guides, grid, labels and measurement markers can be changed individually. Existing acceleration/complementary/envelope/drag toggles move to this drawer, avoiding a parallel set of controls. Axes and moving primary particle stay visible for orientation. Comparison layers unavailable in staircase are disabled. Guided mode owns its evidence and does not expose free layer editing.
- Existing pointer trajectory probe and timeline are retained. Readout adds x/y, vx/vy and ax/ay for the vacuum main trajectory. The timeline follows all comparisons, while the main cursor clamps at its own impact; labels distinguish these clocks. No force or trajectory calculation moved into rendering.
- Add horizontal launch, general 30-degree oblique launch and same-speed angle family presets. Existing complementary, elevated, maximum-range, staircase, drag and Moon cases stay available. Presets apply from complete initial state, so previous Moon gravity/drag do not leak into Earth examples.
- Guided activities remain Predict → Manipulate → Observe → Measure → Explain. Entering captures free setup, visibility, cursor, view and preset; changing/restarting activities keeps that snapshot; exiting restores it.
- Keep `/projectile/notes` and full theory modal. Add short Model Info explaining vacuum/uniform gravity, separability, ax=0/ay=-g, and the separate quadratic-drag comparison.
- Add local version-1 share schema in `models/projectile-serialization.ts`: launch height/speed/angle/gravity/drag, scenario/stair geometry, visibility, comparison flags, selected preset and free mode. Horizontal launch origin stays x=0 as in the existing engine. No arbitrary launch x, activity answers, camera, runtime or playback position are serialized. Shared setups open paused; validation rejects repeated parameters, malformed/oversized data, unsupported versions and values beyond supported controls. A selectable URL remains available when clipboard permissions are unavailable.

## Shared capability decisions

Reused: shell CSS/brand, ThemeToggle, LabLayerDrawer family and MathJax.

New extraction: `components/overlays/LabInfoDialog.tsx` contains only close/backdrop, focus entry/containment/return and scroll lock. Projectile and Electrostatics both consume it; Electrostatics scientific content remains unchanged. This was the concrete two-consumer accessibility drift identified in the September 27 audit.

Kept local: physics, learning evidence, timeline, viewport, selection, probe/readout, presets, layer visibility and versioned serialization. No universal physics/ECS/schema/selection/viewport framework.

## Validation and remaining scope

Build + unit tests: 243/243 pass (239 baseline + four new state/model tests). Lint has zero errors and two existing StandardAtmosphere warnings. Four Projectile desktop/mobile browser flows cover presets, layers, dynamic hover probe and timeline readout, valid and repeated/bad share, full apex activity and restoring free state, model dialog focus and notes, keyboard and light/dark/system. Two Electrostatics modal accessibility/focus regressions pass after extraction. Desktop and mobile screenshots visually inspected.

Raw `npx tsc --noEmit` remains blocked by the same three baseline Cloudflare type errors. Generated runtime types reveal two baseline `env.DB` errors because checked-in wrangler config does not declare DB; no new mechanics errors appear. Runtime types were temporary and removed rather than committing a fabricated database binding.

This is a production-module uplift, not full Electrostatics parity: canvas-object keyboard manipulation and a persistent scientific-object inspector are still model-specific capabilities, and Projectile has no general object ontology. There is no reason to extract these based on visual similarity. Arbitrary horizontal origin, sharing activity answers and broader preset authoring remain outside this increment.
