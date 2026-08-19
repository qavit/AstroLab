# AstroLab architecture

AstroLab is a thin teaching-model platform. It keeps scientific calculations independent from rendering so the same model state can drive 2D diagrams, 3D scenes, charts, and exports.

## Layers

1. `lib/science` — pure calculations, units, and coordinate transforms. No DOM or rendering dependencies. Ephemeris data enters through exactly one adapter here (see below); nothing else in the platform may import an ephemeris library.
2. `lib/render` — model-agnostic Three.js infrastructure: viewport lifecycle, drawing primitives, pointer-drag wiring, and PNG export mechanics. Knows nothing about any specific model, and imports neither `lib/science` nor `models`.
3. `models` — model state, parameters, derived values, and time evolution. Imports `lib/science`; imports neither Three.js nor React.
4. `components` — synchronized interactive views and control surfaces. The only layer allowed to combine all of the above.
5. `app` — routes, page metadata, and future model catalog navigation.

The direction of dependency is one-way: `app` → `components` → (`models` → `lib/science`, `lib/render`). Tests in `tests/rendered-html.test.mjs` assert these boundaries directly, so a violation fails the build rather than merely reading badly.

## The ephemeris layer

`lib/science/ephemeris.ts` is the platform's only contact with `astronomy-engine`. It takes a Julian Day and returns AstroLab's own plain types — degrees, AU, and `{ julianDay, kind }` events — so no library object escapes it. A test walks `app`, `components`, `lib`, and `models` and fails if any other file imports the package, which keeps switching ephemeris source, or offering an approximate/precise mode, a change to one file.

Two supporting modules sit beside it and depend on nothing external. `lib/science/time.ts` makes Julian Day the canonical instant, because a day-of-year cannot carry the moon or the planets across a year boundary; the solar-sphere model's 1–365 clock is derived from it. `lib/science/frames.ts` writes out the ecliptic ↔ equatorial ↔ horizontal conversions explicitly rather than delegating them, so the chain shown to a student is the chain the code runs — and a test checks that chain against the ephemeris' independent path to the same answer.

Two conventions differ from the older `solar.ts` and are worth knowing before editing: the new modules work in **degrees** throughout (`solar.ts` works in radians, and its `degrees()` helper converts *to* radians), and geocentric and topocentric positions are named separately. The second matters: for the moon they differ by up to a degree of diurnal parallax, so no function silently defaults an observer position.

`tests/science.test.mjs` covers this layer numerically. It deliberately avoids asserting values that could only have come from the library itself; instead it checks physical invariants (an eclipse requires the moon within ~1.6° of a node; an outer planet retrogrades only near opposition; Mercury and Venus never exceed their greatest elongations) and independently known events (the total solar eclipse of 12 August 2026). It also records what the solar-sphere model's smooth declination approximation costs: under 2° all year, worst in early October.

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

`/atmosphere` — an idealized global planetary-wind model. A single solar-declination, rotation-rate, and surface-drag state drives both the 3D near-surface wind belts and a latitude–height cross-section of the Hadley, Ferrel, and polar cells. `lib/science/atmosphere.ts` owns the pressure-belt, ITCZ, Coriolis, and surface-wind calculations; the globe geometry remains model-owned in `components/PlanetaryWindLab.tsx`.

The model is intentionally zonally averaged. It excludes continents, topography, monsoons, and weather-scale transients so the pressure belts and three-cell circulation remain legible. Its animated surface flow uses one batched point-and-streak geometry rather than one mesh per particle, allowing four density tiers up to 2,400 particles and independent playback speed without changing the science state.

## Fourth model

`/geology` — a synchronized topographic-map and 3D block model for the valley rule. `lib/science/geology.ts` owns the terrain surface, planar bedding, strike/dip conventions, outcrop test, and marching-squares contour extraction. Both views therefore show the exact same contact rather than two hand-drawn approximations. The question preset isolates the downstream-pointing outcrop V, the east–west strike, and the south-dipping layer used in the classroom problem.

## The Coriolis-force model

`/coriolis` (catalogue number 06) pulls the mechanism the wind model only used as an ingredient — `coriolisParameter` in `lib/science/atmosphere.ts` — out into its own topic. `lib/science/coriolis.ts` is now the one place that owns it; `atmosphere.ts` keeps its own `coriolisParameter(latitude, rotationRate)` signature but delegates to the shared implementation, so both models compute the same number instead of maintaining two formulas.

The model's core move is a coordinate transform, not a simulation: a launched object always moves in a straight line in the inertial frame, and `rotatingFramePosition` re-expresses that same straight line in coordinates that co-rotate with a disc or a patch of ground. No fictitious-force ODE is integrated anywhere — the curvature a rotating observer sees falls straight out of the rotation matrix, which is also why it's exact rather than a small-angle approximation.

One engine serves two scenarios. A turntable's angular velocity is a direct slider; a latitude on a spinning planet supplies the same quantity indirectly, as the local vertical component Ω sinφ — so "turntable" and "earth" differ only in where that one number comes from, not in how the trajectory is drawn. Real Earth's rate is too slow to show visible curvature at a legible disc size in a few seconds of animation, so the earth scenario's *animation* uses an exaggerated angular velocity (`EARTH_VISUAL_SCALE` in `models/coriolis.ts`); the readout panel's Coriolis parameter and Foucault-pendulum period are computed separately from the real `EARTH_ANGULAR_VELOCITY`, so the exaggeration never leaks into the numbers shown as fact.

The two synchronized views split the same launch into "what actually happened" and "what it looks like from here": the 3D view keeps one ball in true straight-line motion in a non-rotating world group while a disc group spins beneath it, and the 2D view is the flattened diagram a rider on that disc would draw — the aim line, the curved trace, and how far the two disagree by the time the object leaves the disc.
