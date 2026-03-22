# Frontend Domain Deployment

This document covers the production deployment path for the TETHICS frontend to:

- `tethics.eth`
- `tethics.sol`

The frontend is static. There is no backend deployment step.

## Canonical Frontend Path

Deploy the contents of:

- `frontend/`

The canonical web entry points are:

- `frontend/index.html` for the public landing page
- `frontend/app.html` for the application shell

Because the frontend is static, the recommended deployment pattern is:

1. publish `frontend/` to IPFS
2. point `tethics.eth` at that IPFS CID via ENS `contenthash`
3. point `tethics.sol` at the same IPFS CID via the SNS `IPFS` record

This gives both names the same immutable website build and keeps the site aligned with the protocol’s transparency model.

## Recommended Production Topology

Use one content-addressed frontend for both naming systems:

- artifact: one IPFS CID containing the `frontend/` directory
- ENS: `contenthash = ipfs://<CID>`
- SNS: `IPFS = <CID>`

Optional:

- also publish the same site to a normal HTTPS host such as `app.tethics.xyz`
- set SNS `url` to the HTTPS site if you prefer conventional browser compatibility

For protocol credibility, IPFS is the better primary record.

## Step 1: Publish `frontend/`

No build step is currently required for the frontend. It is already static.

For local verification:

```bash
npm run frontend:serve
```

Then open:

```text
http://127.0.0.1:8080/
http://127.0.0.1:8080/app.html
```

### IPFS publishing options

Use any production-grade pinning or deployment provider you trust. Good options include:

- Pinata
- 4EVERLAND
- an in-house IPFS node with pinning

The output you need is the CID for the published `frontend/` directory.

## Step 2: Bind `tethics.eth`

Set the ENS `contenthash` for `tethics.eth` to the frontend CID.

Example target:

```text
ipfs://bafy...
```

Operational notes:

- If you use the default public resolver, set this in the ENS Manager app.
- Browser-native `.eth` website support is limited; Brave and gateway access are still the most reliable paths.
- For general browser access, users can also use ENS gateways such as `eth.limo`.

Expected access pattern after setup:

```text
https://tethics.eth.limo/
https://tethics.eth.limo/app.html
```

## Step 3: Bind `tethics.sol`

Set the SNS website record for `tethics.sol`.

Recommended:

- `IPFS = <CID>`

Alternative:

- `url = https://<your-conventional-host>`

If both `url` and `IPFS` are set, SNS resolution prioritizes `url` first.

Expected access pattern after setup:

```text
https://tethics.sol-domain.org/
https://tethics.sol-domain.org/app.html
```

Depending on the resolver or browser, native `.sol` resolution may also work directly.

## Recommended Rollout

1. Publish `frontend/` to IPFS.
2. Open the CID through an IPFS gateway and verify:
   - `/`
   - `/app.html`
   - wallet-connect buttons
   - Base Sepolia and Solana Devnet config
3. Set ENS `contenthash` for `tethics.eth`.
4. Set SNS `IPFS` record for `tethics.sol`.
5. Verify public access through:
   - ENS gateway
   - SNS gateway
   - Brave native resolution if desired

## Production Notes

- Keep the site static. Do not introduce a private backend just to serve the frontend.
- If you publish a new version, you will get a new CID. Updating ENS/SNS records becomes the release step.
- Treat ENS/SNS record changes as governance-sensitive operational actions.
- Keep the EVM and Solana program addresses in `frontend/js/constants.js` current before publishing a new CID.

## Source References

- ENS decentralized web and `contenthash` docs:
  https://docs.ens.domains/dweb/intro/
- SNS website resolution docs:
  https://docs.sns.id/collection/sns-v2/using-sns
- SNS domain records reference:
  https://docs.sns.id/dev/domain-records
