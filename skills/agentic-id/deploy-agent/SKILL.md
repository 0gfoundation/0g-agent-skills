# Deploy an AgenticID Agent

## Metadata

- **Category**: agentic-id
- **SDK**: `@0gfoundation/0g-agenticid-sdk` ^0.1.6, `viem` ^2.21.0
- **Activation Triggers**: "deploy an agent", "mint an agent", "create an AgenticID agent", "agent
  identity", "AgenticID", "ERC-7857", "ERC-8004"

## Purpose

Mint an AI agent with a chain-anchored identity on 0G AgenticID, optionally provisioning a TEE
container to run it. Covers the deploy preflight, the asynchronous mint/provision phases, iData, and
mint-only deploys.

> **This layer uses `viem`, not `ethers`.** The SDK depends on `viem ^2.21.0`. Do not translate
> these examples to ethers; the repo-wide ethers rule does not apply to `agentic-id` skills.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-agenticid-sdk` and `viem` installed
- A funded wallet on the network your attestor pins
- `.env` with `PRIVATE_KEY`

```bash
npm install @0gfoundation/0g-agenticid-sdk viem
```

## Quick Workflow

1. Build the client with `AgenticID.fromAttestor(url, { account })`
2. Acknowledge the trust root: `ackStatus()`, then `ack()` if anything is missing
3. Fund the prepaid sandbox balance to at least **0.1 OG** via `deposit()`
4. Choose a framework from the attestor's `frameworks[]` and a model from `listModels()`
5. Call `deploy()` with a `wait` level
6. Read the identity back (`ownerOf`, `getAgentSeal`, `getSealId`)

## Core Rules

### ALWAYS

- Use `viem`, never `ethers`, in this category
- Let `fromAttestor()` fill contract addresses; never hardcode them
- Check the attestor URL before deploying: `https://agenticid.0g.ai` is **testnet** (16602)
- Acknowledge the trust root and fund the sandbox balance before deploying; `deploy()` preflights
  both and fails synchronously if either is missing
- Pick `framework` from the attestor's advertised `frameworks[]` and the model from `listModels()`
- Pass a `wait` level when you need `agentId` (`'minted'`) or `url` (`'running'`)
- Call `retry(sealId)` to recover a failed deploy

### NEVER

- Call `deploy()` again to recover a failed deploy; it orphans the mint you already paid for
- Hardcode a framework name or model id; both are read from the network at runtime
- Confuse `deposit()` (sandbox runtime) with `topUpAgentSeal()` (the agent's own gas)
- Assume the returned object has `agentId` without `wait: 'minted'`, or `url` without
  `wait: 'running'`
- Hardcode a private key

## Code Examples

### Deploy end to end

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';
import { parseEther, formatEther } from 'viem';
import 'dotenv/config';

async function deployAgent() {
  // The attestor URL pins the network. This one is TESTNET (chain 16602).
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Prerequisite 1: acknowledge the TEE trust-root components. A fresh wallet is
  // missing all of them; one ack() covers the set. It returns null if none were.
  const status = await ag.ackStatus();
  if (!status.allAcked) {
    console.log('acknowledging:', status.missing.join(', '));
    const ackTx = await ag.ack();
    if (ackTx) await ag.waitForTransaction(ackTx);
  }

  // Prerequisite 2: prepaid sandbox balance >= 0.1 OG.
  if ((await ag.getBalance()) < parseEther('0.1')) {
    const depositTx = await ag.deposit({ amountWei: parseEther('0.15') });
    await ag.waitForTransaction(depositTx);
  }
  console.log('sandbox balance:', formatEther(await ag.getBalance()), 'OG');

  // Discover what this deployment actually serves rather than hardcoding.
  const models = await ag.agent.listModels();
  console.log(`${models.length} models available`);

  const { sealId, agentSealAddr, agentId, url } = await ag.agent.deploy(
    {
      name: 'Sage',
      description: 'a helpful agent',
      framework: 'openclaw', // must be a name from the attestor's frameworks[]
      inference: { provider: '0g-compute', model: models[0] },
      sandbox: { apiKey: process.env.AGENT_API_KEY! },
    },
    { wait: 'running' }, // block until the container is reachable
  );

  console.log({ agentId, sealId, agentSealAddr, url });
  return agentId;
}
```

### Mint-only: an identity with no container

Omit `sandbox` entirely. The agent is minted on chain with no runtime, so it costs nothing per
minute. Bring it online later with `start()`.

```typescript
async function mintOnly() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // No `sandbox` key at all -> mint without provisioning.
  const res = await ag.agent.deploy(
    {
      name: 'Skills Probe',
      description: 'identity only, no runtime',
      framework: 'openclaw',
      inference: { provider: '0g-compute', model: '0gm-1.0-35b-a3b' },
    },
    { wait: 'minted' }, // 'running' would never resolve: there is no container
  );

  console.log('minted agentId:', res.agentId); // url is absent by design
  return res;
}
```

This is the cheapest way to exercise the identity path. Verified on testnet: it returns an
`agentId`, and `listMyDeployments()` reports the row with `url: null` until first provision.

### Fire and forget, then wait separately

`deploy()` without `wait` returns as soon as the request is accepted.

```typescript
async function deferredWait() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Returns { sealId, agentSealAddr } — no agentId yet.
  const accepted = await ag.agent.deploy({
    name: 'Sage',
    description: 'a helpful agent',
    framework: 'openclaw',
  });

  // Block later. Throws if the deploy reaches phase 'failed', or on timeout.
  const agentId = await ag.agent.waitForMint(accepted.sealId, { timeoutMs: 180_000 });
  const url = await ag.agent.waitForRunning(accepted.sealId);

  return { agentId, url };
}
```

### Supplying your own iData

`iData` is the encrypted functional data, an array of `{ role, plaintext, extra? }`. It must contain
a `role: "framework"` binding. What you sign is what gets sealed (WYSIWYS) — the attestor
synthesizes nothing. Omit it and the SDK builds a default from `name`/`description`/`framework`/
`inference`.

```typescript
async function deployWithCustomIData() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  return ag.agent.deploy(
    {
      name: 'Archivist',
      description: 'answers only from its own notes',
      iData: [
        { role: 'framework', plaintext: { name: 'openclaw', schema_version: 1 } },
        {
          role: 'persona',
          plaintext: {
            system: 'You answer strictly from supplied notes and say so when you cannot.',
            inference: { provider: '0g-compute', model: '0gm-1.0-35b-a3b' },
          },
        },
      ],
      sandbox: { apiKey: process.env.AGENT_API_KEY! },
    },
    { wait: 'minted' },
  );
}
```

### Idempotent retries

Pass a stable `idempotencyKey` so a retried call dedupes server-side instead of minting a duplicate.

```typescript
async function idempotentDeploy(key: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Same key -> returns the existing deploy rather than minting again.
  return ag.agent.deploy(
    { idempotencyKey: key, name: 'Sage', description: 'a helpful agent', framework: 'openclaw' },
    { wait: 'minted' },
  );
}
```

### Estimating cost first

```typescript
async function costs() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const est = await ag.agent.estimateCosts();
  // { pricing: { createFee, pricePerCPUPerMin, pricePerMemGBPerMin },
  //   costPerMinWei, prepaidBalanceWei, estimatedRunwayMinutes }
  console.log('create fee   :', formatEther(est.pricing.createFee), 'OG');
  console.log('cost per min :', formatEther(est.costPerMinWei), 'OG');
  console.log('runway       :', est.estimatedRunwayMinutes, 'min');
  return est;
}
```

`estimatedRunwayMinutes` is derived from the prepaid balance, so it reads 0 until you deposit.

## Anti-Patterns

```typescript
// BAD: retrying a failed deploy with deploy() — orphans the paid mint
const first = await ag.agent.deploy(params, { wait: 'minted' });
// ... deploy fails ...
await ag.agent.deploy(params, { wait: 'minted' }); // WRONG: use retry(sealId)

// BAD: reading agentId without waiting for the mint
const accepted = await ag.agent.deploy(params);
console.log(accepted.agentId); // undefined — needs wait: 'minted'

// BAD: waiting for 'running' on a mint-only deploy (no container will ever appear)
await ag.agent.deploy({ ...params, sandbox: undefined }, { wait: 'running' });

// BAD: hardcoding contract addresses instead of letting the attestor supply them
const ag2 = new AgenticID({ addresses: { agenticId: '0x3449...' } as never });

// BAD: assuming the default attestor is mainnet
await AgenticID.fromAttestor('https://agenticid.0g.ai'); // this is TESTNET 16602

// BAD: funding the wrong balance when a deploy is gated on the sandbox floor
await ag.agent.topUpAgentSeal(seal, parseEther('0.2')); // that is the agent's gas
```

## Common Errors & Fixes

| Error                               | Cause                                     | Fix                                                          |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| preflight fails naming missing acks | Trust root not acknowledged               | `await ag.ack()`, then wait for the receipt                  |
| preflight fails on balance          | Prepaid sandbox balance below 0.1 OG      | `ag.deposit({ amountWei: parseEther('0.15') })`              |
| Attestor rejects the framework      | Name not in the attestor's `frameworks[]` | Read `GET /config` / use an advertised name                  |
| `agentId` is `undefined`            | No `wait: 'minted'`                       | Pass the wait level, or use `waitForMint()`                  |
| `url` is `null`                     | Mint-only deploy, or not yet provisioned  | `start(sealId, { apiKey })` to provision                     |
| Deploy stuck in phase `failed`      | Provision error                           | `retry(sealId, { apiKey })`, never `deploy()`                |
| Wrote to the wrong network          | Attestor URL chose it                     | Testnet `agenticid.0g.ai`, mainnet `agenticid-mainnet.0g.ai` |

## Related Skills

- [Manage Agent](../manage-agent/SKILL.md) — lifecycle, transfer, clone
- [Interact Agent](../interact-agent/SKILL.md) — call a running agent
- [Agent Accounts](../agent-accounts/SKILL.md) — trust root, balances, costs
- [Agent Reputation](../agent-reputation/SKILL.md) — serve-proofs and feedback

## References

- [patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md) — trust chain, three IDs, networks
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
- [SDK guide](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/GUIDE.md)
