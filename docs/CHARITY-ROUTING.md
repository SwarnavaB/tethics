# Charity Routing: Legal and Technical Analysis

## Overview

The Shield contract's charity drain mechanism routes unauthorized token proceeds directly to verified charity addresses. This document explains the technical design and its implications.

---

## Technical Flow

```
1. Unauthorized token X deploys, gains liquidity
2. Proceeds (from buys) sent to Shield address (via watcher-triggered sends or direct transfers)
3. Shield.drainToken(X) called by anyone
4. Shield approves DEX router for token X balance
5. DEX swaps X → WETH (or USDC)
6. WETH transferred to charity address
7. FundsRoutedToCharity event emitted
```

**Key property:** The founder has zero custody of funds at any point. The path is:
```
Unauthorized Token → Shield → DEX → Charity
```

There is no step where a human can intercept or divert funds.

---

## Why This Works Economically

### For Scammers

If you launch an unauthorized token using "XYZ Project" branding:
- Buyers might send ETH/tokens to your wallet → you profit (can't stop this)
- BUT if the Shield address is known (from the public Registry), community members can:
  - Direct their purchases through contracts that route proceeds to Shield
  - Front-run your dump by triggering charity drains first
  - Notify buyers to sell immediately via `notifyBuyers()`

The economic upside of the scam is reduced, not eliminated. tethics is a deterrent, not a prevention.

### For Buyers

Buyers who discover they hold unauthorized tokens:
- Are notified via the `notifyBuyers()` mechanism
- Can verify the token's status at `https://tethics.eth/#/verify/<projectname>`
- Know that any proceeds that flow through the Shield go to charity, not the project

---

## Charity Address Selection

At Shield deployment, founders choose from a curated list of verified charity addresses:

| Charity | Address | Network |
|---------|---------|---------|
| GiveDirectly | `0x750EF1D7a0b4Ab1c97B7A623D7917CcEb5ea779c` | Mainnet/Base |
| Gitcoin Grants Matching | `0xde21F729137C5Af1b01d73aF1dC21eFfa2B8a0d6` | Mainnet |
| Protocol Guild | `0xF29Ff96aaEa6C9A1fBa851f74737f3c069d4f1a9` | Mainnet |
| The Giving Block (ETH) | *See their official site* | Mainnet |

**Important:** Verify current addresses directly from the charity's official channels before deployment. Addresses above are illustrative.

The charity address is immutable after Shield deployment. Founders cannot route funds to themselves.

---

## DEX Integration

The Shield uses Uniswap V3's `exactInputSingle` on Base:

- **Router:** Uniswap V3 Router on Base (`0x2626664c2603336E57B271c5C0b26F421741e481`)
- **Pool fee:** 0.3% tier (3000 bps): most liquid for new tokens
- **Slippage:** Accept any output (0 minimum): the goal is to route funds, not maximize value
- **Fallback:** If no liquidity exists (swap fails), tokens are held in Shield until `drainToken()` is called again

For tokens with extremely low liquidity, the swap may fail repeatedly. In this case, tokens accumulate in the Shield and wait for liquidity to develop.

**Alternative DEX (Aerodrome):** The `ShieldFactory.deployShieldWithRouter()` allows using a custom router, enabling integration with Aerodrome (Base's native DEX) for tokens with better Aerodrome liquidity.

---

## Immutability and Trust

The charity drain mechanism is trustless by design:

1. **No admin key:** Nobody can change the charity address after deployment
2. **No founder custody:** Single-transaction path from token to charity
3. **No pause mechanism:** The drain always works (when there's liquidity)
4. **Open source:** Anyone can audit the exact routing logic

This means founders cannot be coerced into routing funds elsewhere, and charities can trust that the funds are legitimate.

---

## Tax and Legal Considerations

*This is not legal or tax advice. Consult a qualified professional.*

**General observations:**

- The Shield contract is an autonomous smart contract. Neither the founder nor the tethics developers have custody of or control over funds routed through it.
- Charity addresses are public addresses that may or may not belong to 501(c)(3) organizations (US tax-exempt). Consult each charity's official guidance.
- The mechanism is designed to make unauthorized token proceeds economically worthless to scammers. It's not designed as a donation mechanism for founders.
- Founders are not "donating" funds: they never had custody. The funds flow from scam token buyers → Shield → charity, without the founder touching them.

---

## Event Trail

Every drain is fully auditable onchain:

```
FundsRoutedToCharity(
    address indexed tokenContract,   // What was drained
    uint256 amount,                  // How much
    address indexed charityAddress   // Where it went
)
```

This event trail allows:
- Charities to reconcile incoming funds
- Community to verify the mechanism is working
- Researchers to measure the economic impact of unauthorized tokens
- Journalists to quantify how much money scammers lost
