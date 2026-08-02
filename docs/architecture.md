# AstroLab architecture

AstroLab is a thin teaching-model platform. It keeps scientific calculations independent from rendering so the same model state can drive 2D diagrams, 3D scenes, charts, and exports.

## Layers

1. `lib/science` — pure calculations, units, and coordinate transforms. No DOM or rendering dependencies.
2. `models` — model state, parameters, derived values, and time evolution. This layer is the next extraction target as the second model arrives.
3. `components` — synchronized interactive views and control surfaces.
4. `app` — routes, page metadata, and future model catalog navigation.

## First model

The solar-sphere model validates shared time, latitude, coordinate conversion, dual 3D views, shadow geometry, representative seasonal paths, and PNG export.

## Second model

The magnetic-field model (`/magnetism`) validates the same shared-state pattern with a physics topic instead of astronomy: `lib/science/magnetism.ts` computes Ampere's-law superposition for infinite straight wires, and `components/MagneticFieldLab.tsx` drives a synchronized 3D perspective view and a classic 2D ⊙/⊗ diagram from one wire/point state. It also validates that a model doesn't need dual 3D scenes — one 3D view plus one plain SVG 2D view is enough when the underlying geometry is planar. Each model still owns its rendering code independently; nothing has been factored into a shared render layer yet.

## Next architecture test

Add the existing Kepler project as model 03. Extract its orbital calculation into pure functions first, then attach a 2D orbit view, velocity vector, swept-area overlay, and shared playback clock. Avoid moving its legacy UI wholesale. If a third model repeats enough of the vanilla-Three.js scene-setup boilerplate (renderer/camera/OrbitControls/resize wiring, arrow/label helpers) now duplicated across `SolarLab.tsx` and `MagneticFieldLab.tsx`, that's the signal to extract a shared `lib/render` layer.
