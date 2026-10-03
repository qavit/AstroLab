# Mechanics recovery — 2026-10-03

## Phase A: inspected baseline

Main/origin main: `df154bf` (fetched). Working tree initially clean. PR #18 is open/draft, head `fdffaa1`, seven foundation commits and four files only: science, model, tests, design notes. Main has 23 commits absent from that head; head has seven absent from main. No FBD UI, route, or registry entry exists. The remote branch and PR are unchanged by this local recovery.

Read ProjectileLab, its guided/theory content and models/science, ElectrostaticFieldLab and its layer/inspector/preset/guided/theory/share modules, registry, and the shared-capability audit dated September 27. Existing Projectile includes pointer probing, timeline scrubbing, equal-axis pan/zoom, component charts, staircase/drag/complementary/envelope cases, seven presets and three activities. Activities reset their initial state but previously left that state behind on exit. Theory modal lacks Electrostatics' focus containment/return.

| Capability | Electrostatics | Projectile baseline | FBD foundation | Decision |
| --- | --- | --- | --- | --- |
| Free exploration | mature | implemented | model only | one constrained FBD scene |
| Direct manipulation | sources/probe/particle | probe/time/pan/zoom | force CRUD | local force editor |
| Layers | shared drawer | four local toggles | none | reuse drawer in Projectile |
| Measurement/probe | inspector | trajectory probe/charts/readout | known-force resolution | supplement cursor components |
| Presets | learning setups | seven | none | add horizontal/oblique/same-speed cases |
| Guided activities | evidence-gated | three existing activities | none | preserve Projectile; FBD local loop |
| Theory/model info | focus-managed modal + notes | modal + notes | design notes | tiny shared modal shell |
| Serializable state | validated versioned initial setup | none | none | Projectile-specific versioned schema |
| Responsive | implemented | existing breakpoints | none | verify both on mobile |
| Keyboard/a11y | canvas + controls | native controls; modal drift | none | focus management + native force editor |
| Tests | science/model/browser | science/learning | seven foundation tests | conceptual fixtures + browser flows |

Minimum files: FBD `models/fbd-table.ts`, `components/FbdLab.tsx`, local CSS, `/fbd`, unit/browser tests. No catalogue number assigned: registry currently ends at 09, and this first slice remains a directly accessible unlisted prototype. Projectile keeps engine, science, activities and notes; adds local layers/share state, supplements presets/readout and keyboard focus. Only modal presentation is newly extracted after two real consumers. No shared physics/state/viewport/selection/scenario framework.

## Baseline validation and branch health

Main `npm test`: build + 239 unit tests pass. Lint: zero errors, two existing StandardAtmosphere warnings. Raw `npx tsc --noEmit` fails on three existing Cloudflare ambient-type errors. Generating runtime types resolves these, but also exposes the existing missing D1 `DB` binding in wrangler config (two errors in db/index.ts). Neither FBD nor Projectile introduces database dependencies. This baseline limitation must be reported rather than masked by fake bindings.

FBD foundation rebased cleanly onto main, retaining all seven foundation commits and their semantics. After rebase: focused foundation 7/7, full build + tests 246/246 pass. Runtime types generated locally in ignored `.wrangler`; no deployment, global Git configuration change or push.

## FBD slice decisions

One smooth horizontal table and a hand continuously in contact, neglecting air resistance. Learner selects block, records interactions, adds forces through those interactions, chooses force kind/direction and qualitative length, commits a cloned snapshot, compares, then revises. Removing an interaction cascades its forces. Qualitative length is presentation-only and never becomes newtons. Canonical interactions/forces live separately from learner state; no canonical diagram is rendered before commit. Comparison uses agent/kind/target relations rather than IDs, labels, or vector-only equality. Tests include unknown magnitudes, missing/extra interaction and force, wrong direction/agent/target, Newton III, motion-force misconception, detached hand and conditional normal-force reasoning.

Foundation numerical helpers are retained, but the UI does not expose an equation or acceleration solver. Friction, torque, rigid bodies, accounts, authoring and FBD share are deferred.

## Completed validation

FBD focused tests: 18/18 (seven retained foundation plus eleven conceptual/commit fixtures). Full `npm test`: build + 257/257 pass. `npm run lint`: zero errors, two existing StandardAtmosphere warnings. Raw typecheck still reproduces the three baseline Cloudflare errors; with generated runtime types, the two existing DB-binding errors remain. Runtime declaration generated for investigation was removed afterward.

Desktop browser flow passes wrong-direction comparison, revise-to-PASS and interaction removal cascading its force. Mobile flow passes keyboard arrow control, visible restart control, no horizontal overflow and light/dark/system appearance. Both screenshots inspected; page errors absent in the desktop flow. Force ID allocation occurs in the event handler so React updater functions remain pure.

The requested first learning slice is implemented. `/fbd` is accessible directly and deliberately unlisted/noindex until catalogue/product publication is decided. Real classroom review and any future diagram drag refinement remain follow-up work; friction/torque/solvers are still deferred. No canonical answer is stored in learner state.

Projectile was implemented separately from the same main baseline on `feat/projectile-v0.2-uplift`: local layers/deep links/presets/readout, saved free exploration state across guided tasks, shared modal presentation, and responsive/a11y polish. That branch records its details in `docs/projectile-v0.2-uplift.md`, with 243/243 unit tests, four browser flows and two Electrostatics modal regressions passing. The two branches are intentionally not combined or pushed.
