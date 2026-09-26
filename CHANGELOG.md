# Changelog

This file records changes that matter to users of Kakau Lab and its individual Lab products. It is not a
per-commit log; git history and PRs remain the source for engineering detail. Version vocabulary is defined
in [`VERSIONING.md`](VERSIONING.md).

History is intentionally not backfilled beyond the recent milestones below.

## Unreleased

## Electrostatics v0.2A

Field representations, in free exploration only (guided activities are unchanged). Shipped to production
2026-09-25.

- Field-strength colormap of `|E|` with a nonlinear scale legend (default off).
- Electric field lines with direction arrowheads, 12 deterministic seeds per non-zero source (default off).
- Theory Notes explain field lines versus test-particle trajectories, and the zero-field saddle point of a
  four-equal-charge square.
- No change to the science model or share schema.

## Electrostatics v0.1

First public release of the Electrostatics Lab (`/electrostatics`).
