## Summary

Clean the repository for open-source publication so contributors can understand the structure, build paths, and release surfaces without local cruft or stale layout assumptions.

## Why

- The repo now spans contracts, Solana, frontend, docs, and watcher packages.
- Open-source repos need an obvious structure and a single canonical frontend entry layout.
- Generated files and local machine artifacts should not leak into the public history.
- Public issue and commit history should explain why key decisions were taken.

## Scope

- remove duplicate web entry points
- tighten ignore rules for generated/local artifacts
- normalize package manager artifacts
- document the frontend entry structure
- add versioned GitHub issue drafts for public decision tracking

## Deliverables

- cleaned repo layout
- updated `.gitignore`
- updated README structure notes
- issue drafts under `docs/github-issues/`

## Decision Record

- all web-facing files live under `frontend/`
- the root of the repo is source/control-plane only, not a second web surface
- one workspace lockfile should be canonical
- issue rationale should be kept close to code/docs

## Related Files

- `.gitignore`
- `README.md`
- `frontend/index.html`
- `frontend/app.html`
- `docs/github-issues/`
