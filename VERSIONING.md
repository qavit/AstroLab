# Versioning

"Version" is used for several unrelated things in this repository. This document separates them so that
each question has exactly one place to be answered. The namespaces are **orthogonal but traceable**: a
change in one does not imply a change in another.

| Namespace | Answers | Identified by |
|---|---|---|
| A. Platform | What compatibility / release identity does Kakau Lab as a whole have? | *Not yet numbered* |
| B. Lab product | What does a student or teacher see as this Lab's release? | `Electrostatics v0.2A` |
| C. Science / model | What do the physics and maths of a given input mean? | `modelVersion` |
| D. Schema | What is the wire contract of persisted / shared data? | `schemaVersion` |
| E. Deployment | Which build is running in production? | commit SHA, Worker version ID |

## A. Platform / application version

The release identity or compatibility level of Kakau Lab as a whole: an app-wide contract, the cross-Lab
product shell, authoring / runtime compatibility, or a major public platform release.

**Status: the namespace is defined; numbering has not started.** There is no formal platform version, and
none should be invented to satisfy this document — in particular, do not declare `Kakau Lab v1.0` yet.
`package.json`'s `version` (`0.1.0`) is a private package placeholder, not the platform version and not any
Lab's version. A platform version is never a git SHA or a deployment ID.

## B. Individual Lab product version

The version a student or teacher can perceive for one Lab, e.g. `Electrostatics v0.1`, `Electrostatics v0.2A`.

- Each Lab owns its own sequence. Do not use the repository or package version in place of it.
- A Lab can be released without its science changing: UI, learning UX, and new representations of the same
  science can all be Lab releases.
- `v0.2A` is a **product roadmap / release identifier**. Slice letters (A/B/…) are allowed; it is not strict
  SemVer and should not be treated as such.
- Existing Labs are not backfilled with version numbers. A Lab gets a name when it next has a release worth
  naming, recorded in [`CHANGELOG.md`](CHANGELOG.md).

## C. Science / model version

Answers: *for the same inputs under the same model version, what are the physical / mathematical semantics?*
In code this is, for example, `MODEL_VERSION` in `models/electrostatic-validation.ts`
(`"electrostatic-point-charge-1"`).

Bump it only when the **model contract** changes:

- the equations change,
- a parameter's meaning changes,
- the units contract changes,
- the singularity / validity policy changes,
- numerical semantics change so that results no longer satisfy the same contract.

Do not bump it for CSS, layout, copy, Canvas style, purely visual representation, or guided-activity wording.
For Electrostatics, the field-strength colormap and electric field lines (v0.2A) are new representations of
the existing point-charge model; they do not alter it.

## D. Schema version

The wire contract of persisted or shared serialized data. For Electrostatics this is `schemaVersion` (`1`,
`SCHEMA_VERSION` in `models/electrostatic-validation.ts`) in the share payload.

Bump it only when the serialized structure, decoding semantics, required fields, or the backward-compatibility
contract change. Adding session-only UI state or a purely rendering layer does not require a bump. Example:
the v0.2A colormap and field lines are not part of the share schema, so going from Electrostatics v0.1 to
v0.2A did **not** require changing `schemaVersion`.

## E. Deployment identity

Which build is live: a git commit SHA, a Cloudflare Worker deployment / version ID (see the Deployment section
of the README), and a timestamp. It answers *"which artifact is production running?"*, not *"what is this
product called?"*. One Lab product version can have many maintenance deployments.

## What is not a version

These are delivery / governance vocabulary. They are **not** product versions:

- Stage (e.g. Stage 0)
- M1 … M5
- Gate, Owner review checkpoint
- PR number, branch name
- commit number or abbreviated SHA
- task-card status

`M5 PASS` does not mean `Electrostatics v5`, and it does not mean `Kakau Lab v5`. The registry's `status`
(`published` / `experimental` / `paused`) is a catalog visibility state, not a version either.

## Example: Electrostatics v0.2A

```text
Lab product      Electrostatics v0.2A
Science / model  existing point-charge model contract (modelVersion "electrostatic-point-charge-1")
Share schema     schemaVersion 1
Source           git commit 7b1aadc (main, 2026-09-25)
Production       Cloudflare Worker "kakau-lab", version 1f12ad31-1a3c-48e1-9057-4033cb6aa955
Delivery history M1–M5, later v0.2A gates and PRs (#12, #14, #15)
```

Each line can move independently: a later maintenance deployment changes only *Source* and *Production*;
a v0.2B representation release would change the Lab product line but not necessarily the model or schema.

## Which numbers change?

| Change | Lab version | Model version | Schema version | Deployment |
|---|---|---|---|---|
| CSS / layout fix | maybe patch, or no new named release | no | no | yes |
| New representation using the same science | likely a Lab release | no | usually no | yes |
| Physics equation semantics change | yes | yes | maybe | yes |
| Share payload incompatible change | yes | maybe | yes | yes |
| Copy typo | usually no | no | no | yes, if deployed |

This is a vocabulary for making the decision, not a release process. When unsure, ask which question in the
first table the change actually affects.
