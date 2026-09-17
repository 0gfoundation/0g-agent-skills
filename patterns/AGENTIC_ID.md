# AgenticID Architecture

Reference for the `agentic-id` skills. 0G AgenticID gives an AI agent a chain-anchored identity that
spans its whole lifecycle, so "this agent is what it claims to be" becomes verifiable rather than
asserted.

Source: [`0gfoundation/0g-agentic-id`](https://github.com/0gfoundation/0g-agentic-id). The
TypeScript client is
[`@0gfoundation/0g-agenticid-sdk`](https://www.npmjs.com/package/@0gfoundation/0g-agenticid-sdk).

## This layer uses viem, not ethers

Every other category in this repo is built on `ethers` v6. **AgenticID is built on `viem`**, because
that is what the SDK depends on (`viem ^2.21.0`). Do not translate its examples to ethers.

```typescript
import { parseEther, formatEther } from 'viem';
```

The repo-wide "always ethers v6" rule is scoped to the storage, compute, chain and cross-layer
skills. It does not apply here.

## The trust chain

Four layers, each independently verifiable, composing from the contract root down to a single
response:

| Layer           | Question it answers                       | Mechanism                              |
| --------------- | ----------------------------------------- | -------------------------------------- |
| Chain identity  | Which agent is this? Who owns it?         | ERC-8004 identity + ERC-7857 token     |
| Runtime config  | What is it actually running right now?    | Encrypted iData on 0G Storage          |
| Execution env   | Is the declared config the executing one? | TEE (Intel TDX) + image-hash allowlist |
| Model inference | Is the inference itself trustworthy?      | 0G Compute verifiable inference        |

The guarantee is not immutability. An agent can update its own iData; what the protocol gives you is
**verifiability at any point in time** — every response carries a signed proof of the iData version
that served it.

## One agent, three identifiers

This trips people up constantly. The same agent is addressed three different ways:

| Identifier  | Type                    | What it is                                       | Used by                                       |
| ----------- | ----------------------- | ------------------------------------------------ | --------------------------------------------- |
| `agentId`   | `bigint`                | ERC-7857 tokenId (ERC-721 compatible)            | reads, `transferFrom`, `clone`, costs         |
| `sealId`    | `0x${string}` (bytes32) | seal-binding hash; the attestor's deployment key | `stop`/`start`/`reset`/`retry`, `waitForMint` |
| `agentSeal` | `Address`               | the agent's **own wallet**                       | `topUpAgentSeal`, serve-proof signer checks   |

Convert freely:

```typescript
const sealId = await ag.agent.getSealId(agentId);
const agentId = await ag.agent.getAgentIdBySealId(sealId);
const agentSeal = await ag.agent.getAgentSeal(agentId);
```

Verified live on testnet: agent `418` round-trips `agentId → sealId → agentId` and reports
`isSealIdBound(sealId) === true`.

## The SDK surface

One entry point, two namespaces, plus top-level ops:

| Surface         | Covers                                                               |
| --------------- | -------------------------------------------------------------------- |
| `ag.agent`      | lifecycle (deploy / clone / transfer), reads, runtime control, costs |
| `ag.reputation` | serve-proof capture and verification, on-chain feedback              |
| top-level       | `ack()` trust root, `deposit()` sandbox balance, refunds, balances   |

### Construction

`fromAttestor` reads the attestor's `GET /config` and fills in every contract address, the RPC and
the appIds. **The attestor URL alone pins the network** — there is no separate chainId argument.

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';

// read-only: no account needed, and no wallet is ever created
const ro = await AgenticID.fromAttestor('https://agenticid.0g.ai');

// read-write
const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
  account: process.env.PRIVATE_KEY as `0x${string}`,
});
```

What you must pass grows with what you do: reads need only addresses, writes need `account`,
container management needs the attestor URL (which `fromAttestor` supplies by definition).

## Networks

Verified live against both attestors' `GET /config`:

| Attestor URL                      | Chain ID | RPC                            | Reputation registry |
| --------------------------------- | -------- | ------------------------------ | ------------------- |
| `https://agenticid.0g.ai`         | 16602    | `https://evmrpc-testnet.0g.ai` | deployed            |
| `https://agenticid-mainnet.0g.ai` | 16661    | `https://evmrpc.0g.ai`         | **not deployed**    |

Two things follow from this table:

- **The default URL in every quickstart is testnet.** `agenticid.0g.ai` is chain 16602. Reaching
  mainnet requires `agenticid-mainnet.0g.ai` explicitly, so it is hard to hit mainnet by accident
  and easy to believe you are on it when you are not.
- **Reputation is testnet-only today.** `reputation_registry_addr` is the one address absent from
  the mainnet config. Everything else (identity, sandbox, clone gate, TEE data verifier, verified
  feedback) is deployed on both. Skills that write or read canonical ERC-8004 feedback must say
  this.

Frameworks advertised on both networks: `openclaw`, `hermes`, `prime-agent`, `dsh`. Read them from
`GET /config`'s `frameworks[]` rather than hardcoding — the attestor rejects unsupported names
before mint.

## Two balances, easy to conflate

These are different accounts with different purposes. Funding the wrong one looks like the right fix
and changes nothing.

| Call                        | Funds                           | Pays for                         |
| --------------------------- | ------------------------------- | -------------------------------- |
| `ag.deposit({ amountWei })` | the prepaid **sandbox** balance | container runtime, pay-as-you-go |
| `ag.agent.topUpAgentSeal()` | the **agentSeal's** own gas     | the agent's own on-chain writes  |

A third, separate thing is your own wallet's native balance (`ag.nativeBalance()`), which pays gas
for _your_ transactions.

## Deploy preflight

`deploy()` and `clone()` check two prerequisites up front and fail synchronously with the fix named,
rather than being accepted and dying minutes later inside an async worker:

1. **All trust-root components acknowledged.** Verified live, a fresh wallet is missing three:
   `0g-agentic-id`, `0g-kms`, `0g-agentic-id-sandbox-provider`. One `ag.ack()` covers all of them.
2. **Prepaid sandbox balance ≥ 0.1 OG** (`MIN_SANDBOX_BALANCE_WEI`, exported by the SDK).

```typescript
const status = await ag.ackStatus();
if (!status.allAcked) {
  const tx = await ag.ack(); // null when nothing was missing
  if (tx) await ag.waitForTransaction(tx);
}
```

Opt out per call with `{ preflight: false }`, but the attestor re-checks at accept time regardless,
so opting out only moves where the failure surfaces.

### Live pricing

From `ag.agent.estimateCosts()` on testnet:

| Field                 | Value                              |
| --------------------- | ---------------------------------- |
| `createFee`           | 0.06 OG per container create       |
| `pricePerCPUPerMin`   | 0.001 OG                           |
| `pricePerMemGBPerMin` | 0.0005 OG                          |
| `costPerMinWei`       | 0.004 OG/min for the default shape |

`estimatedRunwayMinutes` is derived from your prepaid balance, so it reads 0 until you deposit.

## Deploy is asynchronous

`deploy()` submits, then a mint and a provision happen in the background. The `wait` option chooses
how far to block:

| `wait`      | Returns                                   |
| ----------- | ----------------------------------------- |
| omitted     | `{ sealId, agentSealAddr }` on acceptance |
| `'minted'`  | `+ agentId`                               |
| `'running'` | `+ url`                                   |

Deploy phases reported by `listDeployments()`: `deploying`, `running`, `stopped`, `offline`,
`failed`.

**Mint-only deploys.** Omit `sandbox` entirely and the agent is minted with no container: an
on-chain identity with no runtime, and therefore no per-minute cost. Bring it online later with
`start(sealId, { apiKey })`. This is the cheapest way to exercise the identity path — verified on
testnet, where a mint-only deploy returned `agentId 418` with `url === null`.

**On a failed deploy, call `retry(sealId)`, not `deploy()` again.** Redeploying orphans the mint you
already paid for.

## iData

`iData` is the agent's encrypted functional data: model, persona, framework binding. It is an array
of `{ role, plaintext, extra? }`, and it must contain a `role: "framework"` binding.

The rule is **WYSIWYS** — what you sign is what gets sealed. The attestor synthesizes nothing. Omit
`iData` and the SDK builds a default from `name` / `description` / `framework` / `inference` via
`defaultIData()`; pass your own for full control.

You never pass a sealed image: the SDK resolves it from the `framework` name via `GET /config`.

## Serve-proofs

The sealed proxy stamps `X-Agent-Proof` on the agent's **`/api/*` services** only — its outward,
attributable surface. It is deliberately not stamped on owner-authenticated chat and UI routes,
because signing those would let an owner manufacture their own reputation.

A proof is
`{ agentId, submitter, timestamp, deadline, taskHash, dataHashes, frameworkHash, signature }`. Each
is bound to a single `submitter`, the only address allowed to redeem it, and on-chain attribution is
always `msg.sender`. Treat proofs as sensitive regardless of transport.

Feedback lands in the canonical ERC-8004 Reputation Registry, so any ERC-8004 reader sees it
natively; the local VerifiedFeedbackRegistry separately records which entries were proof-backed.
`giveFeedback()` bundles both writes. An owner cannot attest feedback on their own agent.

## Critical rules

```
ALWAYS use viem for this layer, never ethers.
ALWAYS let fromAttestor() fill addresses; never hardcode contract addresses.
ALWAYS remember the attestor URL picks the network, and the common one is TESTNET.
ALWAYS ack the trust root and fund the sandbox balance (>= 0.1 OG) before deploying.
ALWAYS read frameworks and models from the attestor / router at runtime.
ALWAYS await waitForTransaction() after a bare write before reading state back.
ALWAYS call retry(sealId) on a failed deploy, never deploy() again.

NEVER confuse deposit() (sandbox runtime) with topUpAgentSeal() (the agent's own gas).
NEVER assume reputation works on mainnet; the registry is testnet-only today.
NEVER expect a serve-proof from chat/UI routes; only /api/* services are signed.
NEVER hardcode a private key; load it from the environment.
```

## References

- [0G AgenticID repo](https://github.com/0gfoundation/0g-agentic-id)
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
- [SDK guide](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/GUIDE.md)
- [viem docs](https://viem.sh)
