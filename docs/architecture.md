# AstroLab architecture

AstroLab is a thin teaching-model platform. It keeps scientific calculations independent from rendering so the same model state can drive 2D diagrams, 3D scenes, charts, and exports.

## Layers

1. `lib/science` — pure calculations, units, and coordinate transforms. No DOM or rendering dependencies.
2. `models` — model state, parameters, derived values, and time evolution. This layer is the next extraction target as the second model arrives.
3. `components` — synchronized interactive views and control surfaces.
4. `app` — routes, page metadata, and future model catalog navigation.

## First model

The solar-sphere model validates shared time, latitude, coordinate conversion, dual 3D views, shadow geometry, representative seasonal paths, and PNG export.

## Next architecture test

Add the existing Kepler project as model 02. Extract its orbital calculation into pure functions first, then attach a 2D orbit view, velocity vector, swept-area overlay, and shared playback clock. Avoid moving its legacy UI wholesale.
