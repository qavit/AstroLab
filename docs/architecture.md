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

## The projectile-motion model

`/projectile` (catalogue number 07) is the platform's first model whose science is entirely closed
form. `lib/science/projectile.ts` evaluates every trajectory, range, apex, safety-parabola bound,
staircase landing, and curvature from an algebraic expression; nothing is stepped forward in time.
That is not an implementation preference but the model's subject: horizontal and vertical motion
are independent, so the answer is available directly, and the two companion charts (`x–t` straight,
`y–t` parabolic) are the visible form of that claim rather than a restatement of it.

Air drag is the single exception, and it is quarantined behind a marked section at the foot of the
same file, because quadratic drag has no elementary solution. A test asserts the quarantine
directly — no integration may appear above the marker — so "everything above here is exact" stays a
checkable property rather than a comment that decays. The integrator is validated against the
closed form it generalizes, by running it with the drag coefficient set to zero.

Three results the classroom usually leaves implicit are made first-class here. The optimal launch
angle is 45° *only* for a level launch; `optimalAngle` computes sin θ\* = 1/√(2 + 2gh/v²) and the
readout reports whatever that is. Complementary angles are an equal-range pair on the same grounds,
so once the launch point is raised the model reports both ranges separately instead of asserting an
equality that has stopped holding. And the safety parabola is drawn over the fan of trajectories it
bounds, because an envelope with nothing underneath it is just another curve.

The staircase scenario shares every equation with the field scenario and differs only in what
counts as the ground: each step is one algebraic test for whether the flight is still beyond that
tread's outer edge as it passes the tread's height. The classroom shortcut for a horizontal launch,
n = ⌈2v²·rise / (g·width²)⌉, is kept as its own function and checked against the general routine.

Both views are SVG. This model has no 3D view and does not need one — projectile motion is planar,
and the readings that matter here are numeric, which SVG places more precisely than a rendered
scene would. The time cursor is deliberately held outside `deriveProjectileModel`, in
`deriveCursor`, so animating the marker never re-samples the flight or re-runs the drag integration.

Its controls live in a side panel that takes width from the chart rather than covering it, and the
chart is drawn at whatever size it is then left with — the SVG's viewBox is set to the host
element's measured pixel size, so one viewBox unit is one CSS pixel and the chart's type is the
size it says it is at every width. Scaling a fixed viewBox instead had been shrinking every tick
label along with the drawing, on a phone to a third of its size.

The theory notes open as a centred overlay over the running model rather than as a destination:
reading a formula is something done *while* looking at the model, so navigating away would lose the
state the question came from. `components/projectile/TheoryNotes.tsx` holds the content once and
both the overlay and the standalone `/projectile/notes` route render it, so the two cannot drift.

Its mathematics is typeset with MathJax, self-hosted rather than pulled from a CDN:
`scripts/copy-mathjax.mjs` copies MathJax's standalone SVG bundle into `public/` before dev and
build, so the model has no third-party runtime dependency and works offline in a classroom. The SVG
output is chosen over CHTML because it carries no accompanying web fonts, making it a single file.
One stylesheet rule is load-bearing there: MathJax's SVG output is `display:block`, which turns
every inline formula into its own line, so inline math is forced back to `inline-block`.

`/projectile/notes` carries the model's formulas, the conditions each one needs, and an explicit
account of the one curve that is not a closed form: why quadratic drag has none, what the RK4
scheme and step size are, and how the integrator is calibrated against the exact solution it
generalizes. It follows the `/about` page's pattern, which until now the solar model alone used.

## The electrostatics model

`/electrostatics` (catalogue number 09, still `experimental` in the registry) is the
platform's first model that pairs a spatial field instrument with a deterministic stepped
particle, and its assumptions are deliberately narrow.

The sources are **ideal point charges at rest in a plane, and the field is the ordinary
three-dimensional inverse-square Coulomb field sampled on that plane** — not the logarithmic
potential of genuinely two-dimensional electrostatics. Sources never move in response to anything,
and the test particle does not back-react on them, so the field is a fixed function of position;
that is what makes velocity Verlet a legitimate integrator here rather than a convenience.

The point-charge model has no value at a source, and the product says so instead of hiding it.
Every source carries a 0.12 m **excluded core**: inside it a field query returns a typed invalid
result, the probe reports that the model is undefined, and a particle whose step would cross into
the core stops at the first intersection with the event recorded. Nothing is clamped, softened or
silently displaced. The world boundary works the same way — first intersection, no bounce, no wrap.

Dynamics are fixed-step and deterministic: a 1/960 s macro step with 1, 2 or 4 bounded substeps
chosen from the state at the start of the step. The browser only measures elapsed wall time; the
model converts it into whole macro steps, and a tick owing more than 64 of them auto-pauses as
behind-realtime rather than enlarging a step or discarding physics time. Simulation time therefore
only ever advances by steps that actually ran.

The learner transport deliberately hides that numerical step. Its visible ±0.1 s controls map to
exactly 96 macro steps, while sparse checkpoints are captured every 0.5 s (480 macro steps).
History is bounded, keeps the initial checkpoint, and never serializes into schema v1. A seek first
pauses, restores the latest checkpoint at or before the target, then replays positive fixed steps;
targets beyond `maxSimulatedSteps` are rejected. Playback speed changes wall-clock scheduling only.
Source or test-charge initial edits invalidate this history; measurement-point edits do not.

Playback distinguishes a cursor from the simulated extent. Behind the live edge, Play replays the
already-simulated trajectory with the same forward-only fixed steps (nothing is recorded); at the
live edge it extends the simulation and history. ±0.1 s forward steps use existing history first.
Physics never runs backward, a terminal event fixes the end of the timeline, and the scrubber's
track is a growing 5 s window so the thumb visibly advances instead of pinning to the right edge.

`/electrostatics/notes` serves the same `components/electrostatic/TheoryNotes.tsx` that the in-lab
「理論與計算」overlay renders (Projectile pattern: one content component, no second copy). The
overlay is a modal: focus moves in, Tab is contained, Escape closes and focus returns to the button.

`/electrostatics` opens with an intent choice between a guided task and free exploration. Once a
guided task begins, evidence is withheld until the learner commits a prediction. Gating is a
presentation decision only — `models/electrostatic-learning.ts` chooses what is visible, never
what a value is, and every number still comes from `lib/science/electrostatics`. The guided
hierarchy is activity (`1 合場方向` / `2 對稱` / `3 場與運動`) → subtask heading (`n-m｜name`,
from `guidedProgress`) → phase chip; `guidedFocusFor` derives the single "look here" target and
sentence for each step, purely as presentation. Any present `s`
parameter bypasses the choice and opens free-exploration
semantics instead; schema v1 carries the **physical initial setup only** (sources, probe, test
particle, domain, singularity, integrator, field scale), never the runtime, the trail or any
learning state, and an undecodable payload fails closed to a safe preset.

The electrostatics readouts reuse the same self-hosted MathJax provider as the projectile model.
The implementation now lives at `components/math/MathJax.tsx`; the old projectile module is only a
compatibility re-export, so there is one provider and no second math runtime.

## Kakau Lab integration (Stage 0)

This repo (`qavit/AstroLab`) is the technical foundation of **Kakau Lab**, the product's
user-facing name. The repository keeps its historical name; only the product identity shown to
users — catalog header, hero, footer, page metadata, `/about` copy, accessible labels — changed to
Kakau Lab. Renaming the GitHub repository is a future option, not something this stage requires.

### Model registry

`lib/labs/registry.ts` is the single source of truth for the catalog: a `LabManifest[]` of pure,
machine-readable data. It must never import React, Three.js, or `lucide-react` — presentation
details (icons, card art, preview images) are stored as string keys, and the mapping from a key
like `"orbit"` to the actual `Orbit` icon component lives in `components/ModelCatalog.tsx`, the
one layer allowed to combine data with rendering. `ModelCatalog.tsx` renders entirely from
`publishedLabs()` and, only when a server-side preview flag is enabled, a separate
`experimentalLabs()` section; there is no second, hard-coded model list anywhere in the app.

The registry also distinguishes *which app* implements a lab. `implementation.app` is either:

- `"kakau-lab"` — a model that lives in this repo, with a local `route` the catalog renders as a
  Next.js `<Link>`.
- `"kakau-web"` — a lab hosted on the Kakau Web property, with an absolute `url` the catalog
  renders as a plain `<a>`, navigated in the same tab and without a "leaving this site" warning,
  because both properties are first-party Kakau products. The catalog code still keeps the
  distinction explicit rather than pretending an external URL is an internal route.

Models 01–07 are all `kakau-lab`. Model 08 (`two-source-interference`, 雙點波源干涉) is
`kakau-web`, pointing at the already-published `https://kakau.tw/lab/interference` — it is not an
iframe, a proxy, or a port of that lab's code into this repo.

`LabManifest` reserves an optional `scientificQuality` block (`assumptions`, `approximations`,
`validity`, `verification`) for a future pedagogical-quality pass. Stage 0 does not backfill it for
the seven existing models; leaving it empty is intentional, not an oversight.

### Deployment boundary: Kakau Web vs. Kakau Lab app

Two Kakau properties, deliberately on separate runtimes:

- **Kakau Web** — `https://kakau.tw`. Brand, content, resources, lightweight native labs, and the
  SEO / acquisition surface. `kakau.tw/lab/interference` stays at that URL; Stage 0 does not move
  it to `lab.kakau.tw`.
- **Kakau Lab app** (this repo) — target origin `https://lab.kakau.tw`. Heavier interactive science
  models: stateful React applications with Three.js scenes and synchronized multi-view
  visualizations.

Integrating the product does not mean integrating the framework: the two apps stay separate
Next.js/Cloudflare-Workers and Kakau-Web runtimes, linked only through the registry's
`implementation` field and ordinary hyperlinks. Whether `lab.kakau.tw` can already be bound as a
custom domain has not been verified in this stage — the current deployment target (Cloudflare
Workers via `vinext`/`wrangler`, see `vite.config.ts` and `worker/index.ts`) has no custom-domain
configuration checked into the repo, so this should not be assumed to be ready without confirming
it in the Cloudflare dashboard first.
