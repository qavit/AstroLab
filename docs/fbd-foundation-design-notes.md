# FBD Foundation Design Notes

> Implementation-facing notes for the FBD foundation, now merged into local main with its first horizontal-table learning slice. The current Kakau Lab FBD Stage 0 page in Notion remains the product/design source of truth. This file exists to keep the code foundation aligned with that product baseline; it is not a second product spec.

## Product thesis

Kakau FBD is not a browser clone of Algodoo and not a force-vector viewer. Its first learning problem is model construction:

`Scene → System → Interaction → Force → Commit → Compare → Revise`

Coordinates, components, equations, and motion evidence can follow after the force inventory is sound.

The learner should first decide what system is being studied and which external agents interact with it. A force is then a representation of one of those interactions. The solver must not reveal the canonical force set before the learner has committed a model.

## v0.1 domain baseline

### One system at a time

The first grammar studies one selected body/system. Multi-body and composite-system modelling remain future scope.

System selection is a modelling act, not just UI focus.

### Interaction precedes force

A learner-authored force must be traceable to:

- a source agent;
- the selected target system;
- an interaction type;
- a direction;
- an optional numerical magnitude.

The pure vector helpers stay independent from this domain identity. `models/fbd.ts` now represents `FbdSystem`, `FbdAgent`, and `FbdInteraction` explicitly, while each `FbdForce` references an `interactionId`. This keeps agent/system semantics out of display labels and makes the relation structurally testable.

One interaction may support more than one force representation where the physics requires it. In particular, a contact interaction can later support normal and friction forces without duplicating the agent/system relation.

### Learner model is not the answer key

Learner-authored state and canonical scenario/reference state remain separate. `FbdLabState` contains only the learner diagram; `FbdReferenceModel` is a separate type for future scenario/reference answers and is not embedded in initial learner state.

A scenario may know the expected interactions and forces for comparison, but those answers are not part of the learner diagram state and must not be exposed automatically.

### Particle-model FBD

v0.1 uses a particle-model free-body diagram. Force arrows share a representational anchor on the selected system; arrow-tail location does not claim to be the real application point.

Torque, moment arms, line of action, and rigid-body application-point semantics are deliberately out of scope. They should become a later interaction grammar rather than being smuggled into the translational FBD model.

### Qualitative before quantitative is valid

A force direction may exist while its magnitude is unknown. Partial numerical information must never be reported as a complete net force. Components are representations of existing forces, not new interaction forces.

## Representation layers

Keep these layers conceptually and in state boundaries distinct:

1. **Physical scene** — bodies, surfaces, ropes, motion cues.
2. **Interaction** — relationships between the selected system and external agents; no magnitude required.
3. **Force** — learner-authored force vectors associated with interactions.
4. **Coordinates/components** — later representation of the same forces.
5. **Evidence/result** — net force, acceleration, equilibrium, or minimal motion feedback used to check the model.

Representation availability is pedagogical state. Do not add a generic "show all vectors" switch that reveals later layers early.

## First playable slice

The first UI prototype should be a constrained teaching scene rather than a blank drawing canvas.

Recommended first scene: a block on a horizontal table.

Minimal loop:

1. Render the physical scene without force answers.
2. Let the learner identify/select the block as the system.
3. Present plausible external agents from the scene, initially Earth and table/surface.
4. Let the learner assert interactions with those agents.
5. Turn committed interactions into learner-authored force entries and let the learner set directions.
6. Require an explicit `Commit` before comparison.
7. Return diagnostic categories such as missing force, spurious force, wrong agent, wrong system, Newton-III mixing, or wrong direction without immediately drawing the entire correct FBD.
8. Let the learner revise.

Coordinates/equations do not need to be in this first playable slice. Their sequencing is already defined by the product grammar and can be added after the interaction→force loop works.

## Scenario authoring direction

Algodoo's reusable-scene model is useful evidence, but it is not a reason to build an authoring framework now.

When the first real teaching scene is implemented, prefer a small internal declarative scenario contract that can grow around real needs. Candidate concepts include:

- scene objects;
- constraints/relationships;
- candidate systems;
- canonical interactions;
- canonical forces;
- allowed coordinate frames;
- misconception checks;
- prompts/explanations;
- optional perturbations/evidence.

Do not finalize a generic schema before the first scene exercises it. The goal is eventually to add a scientifically reviewed scenario rather than clone a new app, not to create a public scene editor in v0.1.

## Science invariants worth testing first

Science regression is a first-class contract. The current foundation already enforces and tests the first structural subset:

- interactions must reference an existing source agent;
- interactions must target the selected system;
- forces must reference an existing interaction rather than exist as anonymous arrows;
- learner state does not contain canonical/reference answer sets;
- when any force magnitude is unknown, the model does not pretend the resultant is complete.

The next scenario/reference layer should extend that contract to:

- every canonical force targets the selected system;
- canonical forces are backed by a valid external interaction;
- a Newton-III partner is not added to the same system's FBD;
- normal-force direction is derived from contact geometry, not hard-coded as upward;
- friction is not hard-coded as opposite velocity;
- force components are not serialized or counted as independent forces;
- when every magnitude and mass are known, resultant force and acceleration are consistent.

UI, keyboard, drag, screenshot, and accessibility tests should verify that representation layers expose this science state correctly; they do not replace these invariants.

## Current foundation status

Foundation retained in local main:

- pure 2D vector/force arithmetic in `lib/science/fbd.ts`;
- explicit `FbdSystem`, `FbdAgent`, and `FbdInteraction` identity;
- force-to-interaction references instead of free-text agent ownership;
- FBD-local learner model/state rather than shared selection/viewport abstractions;
- learner/reference state separation;
- unknown magnitude as a legitimate qualitative state;
- structural validation and focused unit tests.

The **first real scenario contract** for the horizontal-table scene is now implemented at `/fbd`, with canonical interactions/forces and comparison diagnostics that exercise the domain model without exposing answers before commit. The route remains unlisted/noindex; merging the feature does not publish it to the catalogue.

Still defer:

- multi-body/composite systems;
- arbitrary rigid-body sandbox physics;
- torque/application-point semantics;
- public scenario editor;
- serialization/share;
- guided-learning framework extraction;
- common viewport/selection framework;
- deployment.

## Open product questions

These remain intentionally unsettled and should be answered by prototype evidence rather than hidden in code:

- whether arrow length matters in qualitative mode;
- whether comparison feedback is per-force or only after full commit;
- when components unlock;
- whether v0.1 needs motion/equilibrium check;
- which friction regimes enter the first release;
- arrow-label conventions and exact anchor treatment;
- how much scenario state, if any, becomes shareable.
