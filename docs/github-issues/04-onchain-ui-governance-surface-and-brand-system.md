## Summary

Ship a professional, static, no-backend TETHICS web experience for founders, reviewers, governance operators, and public verification.

## Why

- The product needs a coherent onchain operating surface, not just raw contract access.
- The UI should expose transparent governance and review flows across EVM and Solana.
- Wallet-connect, artifact hashing, IPFS upload, and verification all need to be first-class.
- Public trust depends on a polished, restrained brand system and clear information hierarchy.

## Scope

- build a landing page plus dedicated app shell
- add EVM and Solana wallet flows
- add artifact hashing and browser-side IPFS upload
- expose governance, review, charity, and verification surfaces
- add TETHICS brand assets and consistent UX treatment

## Deliverables

- `frontend/index.html` landing page
- `frontend/app.html` application shell
- governance and verification UI flows
- browser artifact / IPFS pipeline
- brand asset pack

## Decision Record

- no backend or hidden moderation state
- browser performs content hashing and artifact verification locally
- landing page and app shell are distinct surfaces
- live UI should use branding selectively, not decoratively

## Related Files

- `frontend/index.html`
- `frontend/app.html`
- `frontend/css/style.css`
- `frontend/js/app.js`
- `frontend/js/registry.js`
- `frontend/js/solana-program.js`
- `frontend/js/ipfs.js`
- `frontend/js/artifacts.js`
- `frontend/assets/`

