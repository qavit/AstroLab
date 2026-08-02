# AstroLab architecture

AstroLab is a thin teaching-model platform. It keeps scientific calculations independent from rendering so the same model state can drive 2D diagrams, 3D scenes, charts, and exports.

## Layers

1. `lib/science` — pure calculations, units, and coordinate transforms. No DOM or rendering dependencies.
2. `lib/render` — model-agnostic Three.js infrastructure: viewport lifecycle, drawing primitives, pointer-drag wiring, and PNG export mechanics. Knows nothing about any specific model, and imports neither `lib/science` nor `models`.
3. `models` — model state, parameters, derived values, and time evolution. Imports `lib/science`; imports neither Three.js nor React.
4. `components` — synchronized interactive views and control surfaces. The only layer allowed to combine all of the above.
5. `app` — routes, page metadata, and future model catalog navigation.

The direction of dependency is one-way: `app` → `components` → (`models` → `lib/science`, `lib/render`). Tests in `tests/rendered-html.test.mjs` assert these boundaries directly, so a violation fails the build rather than merely reading badly.

## First model

The solar-sphere model validates shared time, latitude, coordinate conversion, dual 3D views, shadow geometry, representative seasonal paths, and PNG export.

## Second model

The magnetic-field model (`/magnetism`) validates the same shared-state pattern with a physics topic instead of astronomy: `lib/science/magnetism.ts` computes Ampere's-law superposition for infinite straight wires, and `components/MagneticFieldLab.tsx` drives a synchronized 3D perspective view and a classic 2D ⊙/⊗ diagram from one wire/point state. It also validates that a model doesn't need dual 3D scenes — one 3D view plus one plain SVG 2D view is enough when the underlying geometry is planar. Each model still owns its rendering code independently; nothing has been factored into a shared render layer yet.

## Shared render and model layers

The signal that used to sit here — a third model about to repeat the vanilla-Three.js scene-setup boilerplate — has been acted on. `lib/render` now owns what both existing models had duplicated: renderer/camera/`OrbitControls`/resize wiring (`viewport.ts`), line, circle, sprite, capsule, and arrow builders plus group disposal (`primitives.ts`), pointer-capture drag gestures (`interaction.ts`), and the material snapshot, compositing, line-art thresholding, and directory-write steps of PNG export (`export.ts`).

`models/` was created at the same time, realizing the layer this document had only described. `models/solar.ts` holds the shared clock state, layer and appearance defaults, presets, playback advance, and every derived readout; `models/magnetism.ts` holds the wire configuration and the contribution and cut-comparison tables.

Deliberately *not* extracted: geometry whose meaning is specific to one model. Horizon arcs, solar path segmentation, and the field-ring construction stayed with their models, because a generically named version of each would obscure what the lines mean.

The solar model, being the largest, is split further under `components/solar/`: `geocentricScene.ts` and `observerScene.ts` each build and update one view; `frame.ts` computes the single `SolarFrame` per update that both consume, which is what makes the two views structurally unable to drift apart; `scene.ts` owns the viewports, direct manipulation, the render loop, and PNG capture; `geometry.ts` holds the model's own geometry helpers; and `ControlDeck`, `LayerDrawer`, and `ExportDialog` are the control surfaces. `components/SolarLab.tsx` is left holding state, effects, and layout only.

## Third model

`/orrery` — heliocentric coordinates and the sun-earth-moon orrery. One route, one Julian-day clock, and three scale-tiered synchronized views: the heliocentric planetary system, the earth-moon system, and the ground-level observer sky that links back to model 01. Ephemeris precision comes from `astronomy-engine`, reached only through a single adapter module in `lib/science` so the rest of the platform stays independent of it.
