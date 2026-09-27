# Kakau Lab Shared Capability Audit — 2026-09-27

## Audit scope and rule

This is a docs-first architecture audit, not a refactor plan. The governing rule is the current Kakau Lab principle: a capability becomes a shared primitive only after a second real consumer demonstrates substantially the same semantics. Visual resemblance, matching control labels, or the possibility of a generic API is not enough.

The primary Kakau Lab repository is `qavit/AstroLab`. Three audited implementations live here: Projectile (`/projectile`), Sun / celestial sphere (`/solar`), and Electrostatics (`/electrostatics`). The catalogue entry for `two-source-interference` explicitly declares `implementation.app = "kakau-web"` and links to `https://kakau.tw/lab/interference`; its implementation therefore lives in the separate first-party repository `qavit/kakau-front`, principally `src/components/labs/InterferenceLab.astro` and `src/lib/labs/interference/*`. This audit treats it as a real Kakau Lab product consumer, but **not** as evidence that React/Next code in AstroLab should be extracted into a cross-repository framework.

Classification follows the requested three buckets:

- **A — Keep local:** do not extract now.
- **B — Candidate shared:** there is at least a credible second consumer or a stable boundary worth recording, but no extraction should happen yet.
- **C — Extract now:** the semantics are already almost identical, duplicate implementation or drift is visible, and a very small extraction would reduce real risk. This document still does not implement it.

## 1. Executive summary

1. **The codebase is healthier than a component-name inventory suggests.** Existing architecture already distinguishes generic runtime infrastructure (`lib/render`, shared MathJax) from model-owned geometry and state. The audited Labs frequently look similar in the UI while intentionally implementing different scientific clocks, selection rules, evidence policies, and view semantics.
2. **The strongest positive precedent is `components/layers/LabLayerDrawer.tsx`.** Solar and Electrostatics are two real consumers of the same presentation-only drawer, while each keeps layer names, state, availability and model meaning local. Its source comment explicitly states that boundary. This is the architecture principle working as intended; it should not be widened into a generic layer-state framework.
3. **Playback is the clearest false similarity.** Projectile moves a cursor over a closed-form trajectory; Interference advances wave phase `t/T`; Solar advances a day or year clock; Electrostatics advances or replays a deterministic fixed-step simulation with bounded history. A shared Play/Pause icon does not imply a shared transport state machine.
4. **Guided exploration has three genuine product consumers but not one learning engine.** Projectile, Interference and Electrostatics all implement prediction / manipulation / observation / feedback loops. However their phases, evidence gating, completion rules, state transitions and scientific actions differ. The only credible shared boundary today is thin navigation/chrome around model-owned task content.
5. **Projectile and Electrostatics independently implement 2D pan/zoom/world↔screen math, but the semantics are not yet identical.** Projectile couples the view to equal-axis chart geometry, auto-fit and pointer-anchored manual view; Electrostatics treats the camera as transient presentation over a fixed physical domain. This is a good boundary to watch, not a safe extraction now.
6. **There is one new capability that reaches the high C threshold: the theory/info modal shell.** Projectile's local `TheoryOverlay` and Electrostatics' `ModelInfoOverlay` use the same `theory-*` CSS grammar, backdrop close, Escape close, scroll lock and model-owned `TheoryNotes`. Electrostatics has since added focus entry, Tab containment and focus return while Projectile has not, creating observable accessibility drift inside otherwise identical modal semantics. A tiny shared modal shell would remove duplicate behavior without touching theory content.
7. **Accessibility is mostly semantic and model-owned, not a generic summary component.** Interference announces a selected measurement point and activity feedback; Electrostatics exposes draggable scientific objects through an SVG accessibility layer and announces runtime/tool status; Solar exposes semantic numeric metrics; Projectile relies mainly on semantic controls, guided live content and SVG/HTML. The scientific sentences and focusable objects are part of each model's interaction grammar.
8. **State serialization has only one audited implementation.** Electrostatics schema v1 serializes validated physical initial setup only; runtime, trail, camera and guided state are intentionally excluded. Interference only persists minor UI preferences such as dismissed hints/sidebar state in `localStorage`; no equivalent shareable model-state contract was found in Projectile or Solar. There is no second consumer for a shared serialization layer.
9. **Canvas / DOM boundaries are an architectural pattern, not a component to extract.** Solar is Three.js canvas + DOM; Interference is Canvas field + SVG geometry/measurement overlay + DOM; Electrostatics is static/dynamic Canvas + accessible SVG object overlay + DOM; Projectile is primarily SVG + DOM. The useful shared rule is separation of scientific state from rendering and keeping accessible interaction in DOM/SVG where needed.
10. **For FBD, reuse only proven infrastructure and let the new interaction grammar stay local first.** Shared MathJax and the existing layer drawer may be reused when the FBD product spec actually needs those exact semantics. Selection, keyboard movement, object manipulation, guided tasks, 2D camera rules and serialization should begin local unless the FBD spec independently lands on an already-proven contract.

## 2. Capability matrix

| Capability | Projectile | Interference / two-source wave | Sun / Sky | Electrostatics | Classification |
| --- | --- | --- | --- | --- | --- |
| Layer / visibility controls | Local control-panel group in `components/ProjectileLab.tsx`; flags such as complementary trajectory, safety envelope and acceleration layers are model state. | Local Astro `<fieldset>` toggles constructive/destructive conditions and wavefronts; field-view radios also change the scientific representation. | `components/solar/LayerDrawer.tsx` consumes shared `LabLayerDrawer` / `LayerGroup` / `LayerToggle`; `LayerState` and appearance semantics stay in Solar. | `components/electrostatic/ElectrostaticLayerDrawer.tsx` consumes the same shared drawer; availability is gated by model/learning evidence policy. | **B** — minimal presentation boundary already proven/shared; do not extract layer semantics. |
| Viewport pan / zoom / reset | Local SVG `ManualView`, equal-scale domain fitting, pointer-anchored zoom/pan and auto-fit behavior in `ProjectileLab.tsx`. | No equivalent general pan/zoom camera found; plot coordinates are fixed model coordinates with responsive display and draggable point P. | Three.js `OrbitControls` through `lib/render/viewport.ts`; reset restores 3D camera position/target. | Local 2D `CameraView` and transforms in `components/electrostatic/viewport.ts`; pan is empty-canvas drag, zoom is transient and never serialized. | **B** — only the pure 2D transform boundary between Projectile/Electrostatics is worth watching; full viewport behavior stays local. |
| Playback / time controls | Cursor time over closed-form or precomputed trajectory; fixed learner step and model duration semantics. | Wave phase/time-cycle animation; `t/T` controls instantaneous displacement while interference-condition lines remain spatially fixed. | `PlaybackMode` is `day` or `year`; `advanceSolarState` advances calendar/solar-time state. | Fixed-step deterministic dynamics plus history, seek/replay, terminal states, behind-realtime auto-pause and wall-clock speed multiplier. | **A** — same transport vocabulary, different model clocks and invariants. |
| Model / theory notes content | `components/projectile/TheoryNotes.tsx`; one content component serves overlay and `/projectile/notes`. | Theory is embedded in formula rails, activity explanations and `<dialog>` modals inside `InterferenceLab.astro`; no equivalent standalone notes component found. | Header links to `/about`; no model-specific theory overlay with the Projectile/Electrostatics contract. | `components/electrostatic/TheoryNotes.tsx`; same content serves in-lab overlay and `/electrostatics/notes`. | **A** for content — scientific structure and wording remain model-owned. |
| Theory / info modal shell | Local `TheoryOverlay` inside `ProjectileLab.tsx`, using global `theory-*` CSS, backdrop/Escape close and body scroll lock. | Native `<dialog>` explanations with Interference-local content and triggers. | No corresponding modal shell. | `ModelInfoOverlay.tsx` explicitly reuses Projectile's `theory-*` grammar and adds focus entry, Tab trap, Escape, scroll lock and focus return. | **C** — two near-identical AstroLab consumers plus real accessibility drift; extract only the modal behavior/chrome. |
| Quick configurations / presets | `PROJECTILE_PRESETS` / scenario defaults drive model-specific launch situations. | Reset and activity-specific buttons change parameters, but no generalized preset catalogue contract was found. | Latitude/date presets and 24 solar terms are embedded in `ControlDeck.tsx`; they are meaningful calendar/location shortcuts. | `QuickPresetsMenu.tsx` renders categorized `PresetId` setups backed by `ELECTROSTATIC_PRESETS`. | **A** — "preset" payload and selection meaning are model semantics. |
| Selection / deselection interaction | No persistent scientific-object selection contract comparable to Electrostatics; chart interactions are view/cursor oriented. | `selectedPoint` represents one measurement point P; click/drag places it, Delete/Backspace/Escape clear it, snapping changes measurement semantics. | Direct manipulation patches solar state; no general selected-object state. | `SelectedObject` distinguishes source/probe/particle; empty backdrop clears selection; tool mode changes pointer meaning; visibility can invalidate selection. | **A** — selection targets and consequences are model grammar. |
| Keyboard interaction | Primarily native controls plus local menu/modal Escape behavior; no shared canvas-object keyboard contract found. | Arrow keys move P; Delete/Backspace clear P; Escape clears it unless a dialog/form owns the key. | OrbitControls/native form controls plus shared drawer Escape behavior; no domain object keyboard contract found. | Global tool shortcuts and playback shortcut plus focusable SVG object handles; arrows move selected objects, Enter/Space select/delete according to tool, Escape deselects/exits tool. | **A** — identical keys map to different model actions and focus rules. |
| Responsive shell / mobile controls | `ResizeObserver` drives chart geometry; side panel and SVG layout adapt to measured width rather than scaling a fixed viewBox. | Component-local media queries reorder learning activity, plot/rail and controls; phone controls become full width. | `.lab-shell` / stage grid plus resize-aware Three.js viewport; control deck/layer drawer have Solar-specific layout. | CSS-module shell plus measured app-bar offset, responsive canvas sampling and `ResizeObserver`; time controls wrap independently. | **A** for a React shell now; reuse existing CSS primitives, but the information architecture still differs. |
| Accessibility summary / live information | Guided phase uses live content and semantic controls; theory uses HTML/MathJax; no generic scientific summary object found. | Dedicated `sr-only` geometry/measurement text, activity feedback `aria-live`, global live status and keyboard-operable P. | Semantic `metrics` section labelled "計算結果"; canvas scenes remain visual while controls/readouts are DOM. | Status/live regions, clock announcements, semantic panels, plus `AccessibleObjects.tsx` SVG overlay for focusable sources/probe/particle. | **A** — sentences, objects and announcement priority are model-specific; a generic live-region wrapper would add little value. |
| Guided exploration / learning-task shell | `projectile/GuidedActivities.tsx` plus `models/projectile-learning.ts`: predict → manipulate/observe → explain → complete, with hints and activity progress. | Embedded activities sidebar plus `src/lib/labs/interference/activities.ts`; activities have their own attempt/reveal/check logic and may directly configure parameters. | None. | `electrostatic/GuidedActivities.tsx` plus `models/electrostatic-learning.ts`: activity/subtask/phase hierarchy with evidence gating, committed predictions and model-specific focus semantics. | **B** — genuine repeated product grammar, but only thin activity navigation/phase chrome is a plausible boundary today. |
| Canvas / DOM interaction boundary | Primary scientific views are SVG; HTML/MathJax handles controls/readouts/theory. | Canvas renders the field, SVG overlays condition lines/sources/measurement, DOM owns controls/readouts/activities. | Three.js canvas owns scenes; DOM owns controls, metrics, layers and export UI. | Static/dynamic Canvas render field and particle visuals; SVG `AccessibleObjects` owns interactive/focusable objects; DOM owns tools/readouts/guided UI. | **A** — document the architectural rule; do not invent one rendering abstraction across SVG, Canvas 2D and Three.js. |
| State serialization / shareable state | No share-state implementation found in audited Projectile code. | No URL/model serialization found; `localStorage` is used only for UI preferences such as plot hint/sidebar. | No share-state implementation found. | `components/electrostatic/share.ts` + `models/electrostatic-serialization.ts`: versioned physical initial setup only; runtime, learning state and camera are excluded. | **A** — only one audited real consumer. |
| Formula rendering runtime | Projectile compatibility module re-exports shared `components/math/MathJax.tsx`. | Server-rendered KaTeX in the Astro component; client updates numeric slots without shipping KaTeX. | No major formula-rendering consumer in the audited Solar shell. | Uses shared `components/math/MathJax.tsx` in theory, guided tasks and field UI. | **B** — already proven inside AstroLab; cross-repo KaTeX is intentionally different runtime infrastructure. |

## 3. Evidence

### 3.1 Layer controls: the correct shared boundary already exists

**Sources**

- `components/layers/LabLayerDrawer.tsx` — `LabLayerDrawer`, `LayerGroup`, `LayerToggle`
- `components/solar/LayerDrawer.tsx` — Solar consumer
- `components/electrostatic/ElectrostaticLayerDrawer.tsx` — Electrostatics consumer
- `components/ProjectileLab.tsx` — Projectile-local layer controls
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — Interference-local line/view controls

`LabLayerDrawer.tsx` says exactly what its architecture should be: **"Shared presentation only: each lab keeps its layer names and state locally."** Solar passes `LayerState` and model-specific appearance selectors into that shell. Electrostatics passes `ElectrostaticLayerState` and a model/learning-derived availability map, with its own comment that evidence availability remains model-owned. This is two real consumers with almost identical drawer presentation and intentionally different semantics.

Projectile is useful counter-evidence: it has a visible "圖層" group, but those toggles live inside the model's side controls and directly expose trajectory concepts. Interference similarly has line visibility and field representations in its own control strip. Moving those state shapes into `LabLayerDrawer` would make the abstraction worse, not more reusable.

**Coupling:** shared drawer = Lab-specific UI / generic presentation; layer state = science/model-specific.

### 3.2 Viewports: three different meanings under one word

**Sources**

- `lib/render/viewport.ts` — generic Three.js `createViewport`, `resetCamera`, resize lifecycle
- `components/SolarLab.tsx`, `components/solar/scene.ts` — Solar scene owner and reset
- `components/ProjectileLab.tsx` — `ManualView`, `domainFromView`, `recenterOn`, wheel/pan/pinch behavior
- `components/electrostatic/viewport.ts` — `CameraView`, `cameraForView`, `worldToScreen`, `screenToWorld`, `zoomView`
- `components/electrostatic/AccessibleObjects.tsx` — empty-space drag pans the camera
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — fixed model plot with responsive presentation

The shared Three.js viewport is already a real runtime primitive, but among the four audited models only Solar uses that 3D contract. It would be a category error to make a 2D SVG chart or Canvas field pretend to be a Three.js viewport just to reuse reset/resize naming.

Projectile and Electrostatics do have a meaningful duplicate seam: both map world/model coordinates to pixels, maintain transient pan/zoom state and preserve a consistent physical scale. Their invariants still differ. Projectile's camera participates in equal-axis chart fitting, settled auto-domain behavior and pointer-anchored zoom; Electrostatics starts from a fixed physical domain, letterboxes it, and explicitly keeps `CameraView` outside setup/runtime/share state. That is enough evidence to document a future pure transform boundary, not enough to move either implementation today.

**Coupling:** 3D viewport = runtime/infrastructure; 2D camera rules = Lab-specific UI with model-view semantics.

### 3.3 Playback/time: do not share the state machine

**Sources**

- `components/ProjectileLab.tsx`, `models/projectile.ts` — closed-form trajectory + cursor, `STEP_SECONDS`
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — `timeCycle`, play/pause/reset-time and wave phase
- `components/SolarLab.tsx`, `components/solar/ControlDeck.tsx`, `models/solar.ts` — `PlaybackMode`, day/year playback, date/time seek
- `components/electrostatic/TimeControls.tsx`, `models/electrostatic-history.ts`, `components/ElectrostaticFieldLab.tsx` — fixed macro steps, history horizon, replay, terminal events and speed

The visible controls overlap — Play, Pause, Reset, slider, sometimes a speed — but the contract underneath does not. In Projectile the cursor can move without recomputing the closed-form flight. In Interference time changes instantaneous phase while stationary condition lines remain stationary. In Solar "play" chooses which astronomical/calendar coordinate advances. In Electrostatics a seek may restore a checkpoint and replay positive fixed steps; physics is never integrated backward. A generic transport reducer would either erase these invariants or become a switchboard full of model exceptions.

**Coupling:** science/model-specific.

### 3.4 Theory notes: content is local; modal behavior has drifted

**Sources**

- `components/projectile/TheoryNotes.tsx` — model-owned theory content reused by overlay and route
- `components/ProjectileLab.tsx` — local `TheoryOverlay`
- `components/electrostatic/TheoryNotes.tsx` — model-owned theory content reused by overlay and route
- `components/electrostatic/ModelInfoOverlay.tsx` — Electrostatics modal shell
- `components/math/MathJax.tsx`, `components/projectile/mathjax.tsx` — already-shared formula runtime

Both models made the same product decision: the theory text exists once, can be opened over the running Lab, and is also directly linkable as a standalone notes route. That does **not** imply shared theory content or a theory data schema.

The overlay behavior, however, is now a genuine duplicate. `ModelInfoOverlay.tsx` explicitly says it reuses Projectile's global `theory-*` classes and grammar. Both close on backdrop/Escape and lock page scroll. Electrostatics additionally moves focus into the dialog, contains Tab, and restores focus to the invoker. Projectile's local `TheoryOverlay` currently only implements the simpler Escape/scroll-lock behavior. This is not speculative neatness: two consumers already intend the same modal contract and have drifted on accessibility.

**Smallest extraction surface:** a presentation-only modal component accepting an accessible label/title, `onClose`, and children; focus trap/return, Escape, backdrop and scroll lock belong inside. `TheoryNotes` remains entirely local.

**Coupling:** generic/Lab UI, not science.

### 3.5 Presets: the payload is the product

**Sources**

- `components/ProjectileLab.tsx`, `models/projectile.ts` — `PROJECTILE_PRESETS`, scenario defaults
- `components/solar/ControlDeck.tsx`, `models/solar.ts` — latitude/date presets, solar terms
- `components/electrostatic/QuickPresetsMenu.tsx`, `components/electrostatic/presets.ts`, `models/electrostatic.ts` — categorized physical setups
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — reset and activity-specific parameter shortcuts

All four can put "quick choices" on screen, but they encode different pedagogy. A Solar latitude button is a reference location; a solar-term choice is a calendar/astronomy concept; an Electrostatics preset is a whole validated physical configuration; a Projectile scenario establishes a launch/ground model; an Interference activity button may deliberately set one ratio to expose a boundary case. The repeated code needed to render a handful of buttons is cheaper than a generic preset schema that would conceal these meanings.

**Coupling:** science/model-specific with small generic UI fragments.

### 3.6 Selection and keyboard: same gestures, different verbs

**Sources**

- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — `selectedPoint`, `setPoint`, `clearPoint`, arrow/Delete/Escape handlers
- `components/electrostatic/AccessibleObjects.tsx` — `DraggableObject`, backdrop deselection, pointer/tool routing, keyboard movement
- `components/ElectrostaticFieldLab.tsx` — `SelectedObject`, tool state, edit policy and learning gates
- `components/SolarLab.tsx`, `components/solar/scene.ts` — direct manipulation patches model state

Interference selection means "there is one measurement point P". Its arrows move that point, Delete/Backspace remove it, and snapping to a condition line changes the measurement evidence. Electrostatics selection means one of several object kinds is active, while a separate persistent tool mode decides whether a pointer places, deletes, selects, drags or pans. Guided evidence policy can also make an object visible but immovable. Solar's direct manipulation is not selection at all: it modifies the synchronized astronomical state.

A shared `useSelection()` or keyboard map would therefore be misleading. The reusable idea is only the accessibility principle — pointer-operable scientific objects need equivalent keyboard access — while the actual verbs stay local.

**Coupling:** model-specific interaction grammar.

### 3.7 Responsive layout: repeated concern, not repeated shell

**Sources**

- `components/ProjectileLab.tsx` — `useElementSize`, measured chart geometry
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — component-local desktop/tablet/phone media queries
- `lib/render/viewport.ts` — resize-aware WebGL viewport used by Solar
- `components/ElectrostaticFieldLab.tsx`, `components/electrostatic/FieldCanvas.tsx`, `components/electrostatic/TimeControls.tsx`, `components/electrostatic/ElectrostaticFieldLab.module.css` — measured app bar/canvas and model-specific wrapping

Responsive behavior is real in every Lab, but each model protects different information. Projectile refuses to scale a fixed viewBox because that would shrink labels and distort its chart presentation. Interference moves the activity region ahead of the experiment on tablet/phone. Electrostatics changes field sampling density and keeps a compact time dock usable. Solar must resize WebGL cameras and preserve two synchronized views. A generic page shell cannot decide these priorities.

The existing global classes and small shared primitives can continue to provide visual consistency. A larger shell should wait for a future Lab whose information architecture genuinely matches an existing one.

**Coupling:** Lab-specific UI; low-level resize observers are generic platform APIs, not a useful Kakau abstraction by themselves.

### 3.8 Accessibility and live information: keep scientific language close to the model

**Sources**

- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — screen-reader geometry/measurement summaries, `data-live-status`, `aria-live` activity feedback
- `components/electrostatic/AccessibleObjects.tsx` — SVG focusable handles and object labels
- `components/ElectrostaticFieldLab.tsx` — notice/share/clock live regions and priority
- `components/electrostatic/TimeControls.tsx` — accessible timeline/help text
- `components/solar/SolarLab.tsx` — semantic `metrics` region
- `components/projectile/GuidedActivities.tsx` — guided phase/live content

This is another strong false similarity. A generic `<LiveRegion>` component could save only a few attributes while moving message priority and timing away from the code that knows why the message matters. Electrostatics' stop/error/auto-pause priority is runtime semantics. Interference announcements describe a point measurement or answer feedback. Solar's outputs are stable calculated metrics rather than transient alerts. The shared standard should be documented accessibility expectations, not centralized wording/state.

**Coupling:** model-specific semantics over generic DOM accessibility primitives.

### 3.9 Guided exploration: three consumers prove a product pattern, not an engine

**Sources**

- `components/projectile/GuidedActivities.tsx`, `models/projectile-learning.ts`
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro`, `qavit/kakau-front/src/lib/labs/interference/activities.ts`
- `components/electrostatic/GuidedActivities.tsx`, `models/electrostatic-learning.ts`
- `components/electrostatic/guidedProgress.ts`, `guidedFocus.ts`, `guidedPrediction.ts`, `guidedCanvasSemantics.ts`

There is enough evidence to call the **learning-task shell** a real recurring Kakau product capability. All three guide a learner through a small number of named tasks, solicit a prediction or answer, make the learner interact with the model, expose evidence, then give feedback/explanation. That pattern is more substantial than visual coincidence.

The state machines are nevertheless not the same. Projectile has a compact `predict → manipulate/observe → explain → complete` flow and can embed model controls/charts inside the activity panel. Interference has per-activity attempt counters, staged reveals and task-specific parameter actions. Electrostatics deliberately gates model evidence and coordinates guided focus/prediction markers with the Canvas; its activity → subtask → phase hierarchy is part of the pedagogical contract. Extracting a common reducer would flatten the very differences that make each activity scientifically honest.

**Candidate boundary only:** activity navigation, current-task heading/phase badge, restart/exit controls, and a slot for model-owned phase content. Require FBD (or another new Lab) to reproduce that exact shell before extracting it.

**Coupling:** Lab-specific UI shell around science/model-specific learning state.

### 3.10 Canvas / DOM boundaries: preserve the rule, not the renderer

**Sources**

- `docs/architecture.md` — one-way science/model/render/component layering
- `components/ProjectileLab.tsx` — SVG scientific views
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — Canvas + SVG overlay + DOM
- `components/solar/scene.ts`, `lib/render/viewport.ts` — Three.js canvas
- `components/electrostatic/FieldCanvas.tsx`, `AccessibleObjects.tsx`, `render.ts` — layered Canvas + SVG interaction overlay

These are deliberately different render stacks. The common architectural value is that scientific calculations do not depend on DOM/rendering, and that Canvas pixels are supplemented with semantic DOM/SVG when a learner must focus, select, drag or hear an object. A universal "LabCanvas" would either be too weak to matter or grow renderer-specific branches immediately.

**Coupling:** runtime/infrastructure at the lowest level; model-specific above it.

### 3.11 Serialization: Electrostatics is intentionally a one-off until another model proves the contract

**Sources**

- `components/electrostatic/share.ts` — route query parsing and deterministic permalink creation
- `models/electrostatic-serialization.ts` — encoded schema
- `components/electrostatic/viewport.ts` — camera explicitly excluded from setup/runtime/share
- `docs/architecture.md` — schema v1 records physical initial setup only
- `qavit/kakau-front/src/components/labs/InterferenceLab.astro` — `localStorage` for UI-only hint/sidebar persistence

Electrostatics has a carefully bounded share contract: a single `s` query parameter, fail-closed decoding, validated physical initial setup, and a URL-length limit. Runtime, timeline history, trail, guided progress and camera are excluded by design. That is a model product decision, not yet a Lab platform contract.

A second model must first answer the same product question — "what does a shareable state mean here?" — before any common envelope/versioning utility is justified. FBD should not inherit Electrostatics schema assumptions by default.

**Coupling:** model-specific serialization with generic URL mechanics.

## 4. False similarities

These are the highest-risk places for premature abstraction because the UI is visually familiar while the semantics are different.

1. **Play / Pause / Reset does not mean one clock.** Projectile cursor time, Interference phase, Solar calendar motion and Electrostatics numerical dynamics cannot share one transport reducer without leaking model rules into it.
2. **A checkbox labelled as a layer does not imply shared layer state.** Solar coordinate systems, Electrostatics evidence-gated field representations, Projectile analytic overlays and Interference condition lines have different dependencies and educational meaning. Only drawer chrome is truly shared.
3. **Dragging on a scientific diagram is not one interaction.** Interference drags a measurement point, Solar direct manipulation edits astronomical state, Electrostatics routes the same pointer gesture through select/add/delete/pan tool semantics, and Projectile can use drag for viewport navigation.
4. **"Preset" is not a neutral data type.** Some presets are canonical physics setups, some are geographic/date references, some are scenarios, and some are deliberate edge-case interventions inside a learning task.
5. **"Accessible summary" is not generic prose.** Announcing a terminal simulation event, a snapped interference measurement, a current solar altitude or a prediction verdict has different urgency, timing and source of truth.
6. **Canvas + overlay is a pattern, not a renderer API.** Interference uses SVG for geometric condition lines and measurement over a wave-field Canvas; Electrostatics uses SVG primarily to make model objects accessible/interactive over layered Canvas rendering. Sharing the stacking mechanism would not share the semantics.
7. **Guided activities are not one state machine.** Their common educational rhythm is real, but evidence gating, allowed controls, retries, hints, model mutations and completion conditions remain activity-specific.
8. **Reset view is not reset model.** Solar's camera reset is a Three.js orbit reset; Projectile's view reset returns to auto-fit chart framing; Electrostatics' camera is transient and independent of the physical setup; Interference's main reset also resets scientific controls/time/measurement.

## 5. Smallest useful abstractions

Only three boundaries are worth carrying forward. None should become a framework.

### 5.1 Shared modal shell — **C: Extract now**

**Consumers:** Projectile `TheoryOverlay`; Electrostatics `ModelInfoOverlay`.

**Evidence:** same global `theory-*` presentation grammar and same intended modal semantics; duplicated Escape/backdrop/scroll-lock code; Electrostatics has added focus management that Projectile lacks.

**Smallest interface:** accessible label/title, `onClose`, children. The component owns backdrop click, Escape, focus entry/containment/return and body scroll lock. It knows nothing about theory, MathJax or any model.

**Why now:** this removes an actual accessibility drift with a small presentation-only extraction. No science or product state crosses the boundary.

### 5.2 2D world/screen transform — **B: Candidate shared**

**Consumers:** Projectile and Electrostatics.

**Evidence:** both maintain transient world↔screen mapping, pan/zoom and reset-like behavior; both preserve physical aspect rather than stretching axes.

**Possible minimum boundary:** pure functions/types for rectangular world domain ↔ screen transform and perhaps zoom-around-point. Do **not** include auto-fit settling, chart axes/ticks, tool routing, Canvas/SVG events or share state.

**Missing evidence:** a third 2D interaction grammar — potentially FBD — must need the same metric world-space mapping. If FBD is primarily diagram-space rather than metric world-space, even this boundary may be the wrong abstraction.

### 5.3 Guided task chrome — **B: Candidate shared**

**Consumers:** Projectile, Interference and Electrostatics at the product level; only Projectile/Electrostatics share the React runtime.

**Possible minimum boundary:** named activity navigation, current activity/subtask heading, phase/status badge, restart/exit chrome, and a children slot.

**Explicitly excluded:** learning reducer/state machine, answer schema, hint policy, evidence gating, model mutations, progress persistence, Canvas focus targets and scientific feedback.

**Missing evidence:** FBD or another new AstroLab consumer must independently need substantially the same shell. Cross-repo Interference proves the product pattern, but by itself does not justify a React extraction.

## 6. Implications for Free-Body Diagram

This audit does **not** specify FBD behavior. If FBD entered implementation tomorrow, the safe default would be:

### Safe to reuse immediately when the product spec actually calls for it

- **Shared MathJax (`components/math/MathJax.tsx`)** for formula rendering inside AstroLab.
- **`LabLayerDrawer` presentation primitive** only if FBD genuinely has a drawer with the same open/close/focus semantics. FBD's layer names and state stay local.
- **Existing generic visual/runtime infrastructure** only where the renderer actually matches. For example, do not choose Three.js merely to reuse `lib/render/viewport.ts`.
- **The theory/info modal shell once the small C extraction exists**; until then, duplicating the model content but not introducing another modal implementation is preferable.

### Implement locally first

- Diagram object selection and deselection.
- Pointer modes, drag meaning, snapping, handles and deletion semantics.
- Keyboard verbs and movement increments.
- FBD-specific accessibility labels/live summaries.
- Guided exploration state and evidence gating.
- 2D coordinate/camera behavior unless the FBD spec clearly uses the same metric world-space transform as Projectile/Electrostatics.
- Presets/configuration schema.
- Shareable/serialized state.
- Any force-vector/domain logic, because those are the new interaction grammar and science semantics that this audit intentionally does not design.

The important architectural constraint is negative: **do not make FBD conform to an existing Electrostatics or Projectile API merely to create a second consumer.** Let its real product/science specification decide whether it naturally reproduces one of the candidate boundaries above.

## 7. Recommended next actions

1. **Record this audit as the baseline and stop.** Do not convert the B items into implementation work before FBD's product/science specification exists.
2. **When the next small architecture-maintenance window opens, extract only the theory/info modal shell (C).** Keep the change presentation-only and verify focus containment/return in both Projectile and Electrostatics. This is the only new extraction this audit recommends now.
3. **During FBD specification, explicitly answer two boundary questions:** does its diagram use a metric world↔screen camera equivalent to Projectile/Electrostatics, and does its guided UX naturally need the same activity-navigation chrome? Treat "no" as a valid outcome.
4. **Keep selection, keyboard mapping, accessibility wording and share-state semantics local in the first FBD implementation.** Re-audit only after real behavior exists.
5. **Do not create a cross-repository Kakau Lab UI package because Interference resembles AstroLab.** The `kakau-web` boundary is real; share product conventions first, code only after a concrete cross-repo maintenance problem appears.

## Verification note

This audit intentionally changes documentation only. The repository exposes `npm run lint`, `npm test`, Playwright and deployment scripts, but no dedicated Markdown/docs validation script. Because no source/configuration/runtime file is changed, the minimum verification for this task is the branch diff: it must contain only this document. No production behavior, science code, component extraction, FBD code or Electrostatics feature work belongs in this audit branch.
