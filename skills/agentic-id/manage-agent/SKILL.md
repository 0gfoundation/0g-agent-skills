# Manage an AgenticID Agent

## Metadata

- **Category**: agentic-id
- **SDK**: `@0gfoundation/0g-agenticid-sdk` ^0.1.6, `viem` ^2.21.0
- **Activation Triggers**: "stop an agent", "start an agent", "restart agent", "transfer an agent",
  "clone an agent", "fork an agent", "agent lifecycle", "list my agents"

## Purpose

Control an agent after it exists: start and stop its container, recover a failed deploy, list what
you own, transfer ownership (ERC-7857), and clone an agent to a new owner.

> **This layer uses `viem`, not `ethers`.** The repo-wide ethers rule does not apply to `agentic-id`
> skills.

## Runtime control is keyed by `sealId`, not `agentId`

The container operations take the **`sealId`** (the attestor's deployment key), while chain reads
and transfers take the **`agentId`**. Convert with `getSealId()` / `getAgentIdBySealId()`. See
[patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md) for the three-identifier model.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-agenticid-sdk` and `viem` installed
- Ownership of the agent for owner-signed operations
- `.env` with `PRIVATE_KEY`

## Quick Workflow

1. Build the client with `AgenticID.fromAttestor(url, { account })`
2. Find the agent: `listMyDeployments()` for full detail, or convert an `agentId` to a `sealId`
3. Act: `stop` / `start` / `reset` / `retry`, or `transferFrom` / `clone`

## Core Rules

### ALWAYS

- Use `sealId` for `stop` / `start` / `reset` / `retry`, and `agentId` for reads and transfers
- Call `retry(sealId)` to recover a deploy in phase `failed`
- Use `start(sealId, { apiKey })` for the **first** provision of a mint-only agent, and
  `start(sealId, sandboxId)` to resume a **stopped** container
- Use `listMyDeployments()` when you need `sandboxId`, `owner` or `lastProvisionError`
- Await `waitForTransaction()` after a transfer before reading ownership back

### NEVER

- Call `deploy()` again to fix a failed deploy; it orphans the paid mint
- Expect `listDeployments()` to include `owner`, `sandboxId` or `lastProvisionError`; that listing
  is public and returns them as `null`
- Gate logic on the container phase immediately after a transfer; the old container is reaped
  asynchronously by the indexer
- Hardcode a private key

## Code Examples

### List what you own

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';
import 'dotenv/config';

async function listMine() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Owner-signed: full detail. listDeployments() is the public variant and
  // returns owner / sandboxId / lastProvisionError as null.
  const rows = await ag.agent.listMyDeployments();

  for (const r of rows) {
    // phase: 'deploying' | 'running' | 'stopped' | 'offline' | 'failed'
    console.log(`${r.agentId}  ${r.phase}  ${r.name}  ${r.url ?? '(no url)'}`);
    if (r.lastProvisionError) console.log(`   last error: ${r.lastProvisionError}`);
  }
  return rows;
}
```

### Stop and resume a container

The on-chain identity is untouched by either; only the runtime stops.

```typescript
async function stopThenResume(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const sealId = await ag.agent.getSealId(agentId);
  const row = (await ag.agent.listMyDeployments()).find(
    (r) => String(r.agentId) === String(agentId),
  );
  if (!row?.sandboxId) throw new Error('no container to stop (mint-only or never provisioned)');

  await ag.agent.stop(sealId, row.sandboxId);
  console.log('stopped; billing for runtime ends');

  // Resuming a STOPPED container takes the sandboxId.
  await ag.agent.start(sealId, row.sandboxId);
  console.log('resumed');
}
```

### First provision of a mint-only agent

A mint-only agent has an identity and no container. Its first `start()` takes options, not a
`sandboxId` — there is no container id yet.

```typescript
async function bringOnline(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const sealId = await ag.agent.getSealId(agentId);

  // FIRST provision: pass the api key, not a sandboxId.
  await ag.agent.start(sealId, { apiKey: process.env.AGENT_API_KEY! });

  const url = await ag.agent.waitForRunning(sealId);
  console.log('now reachable at', url);
  return url;
}
```

### Recover a failed deploy

```typescript
async function recover(sealId: `0x${string}`) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const row = (await ag.agent.listMyDeployments()).find((r) => r.sealId === sealId);
  if (row?.phase !== 'failed') {
    console.log(`phase is ${row?.phase}; retry is for 'failed' only`);
    return;
  }
  console.log('failure was:', row.lastProvisionError);

  // retry() resumes THIS deploy. deploy() would mint a second agent and
  // strand the one you already paid for.
  await ag.agent.retry(sealId, { apiKey: process.env.AGENT_API_KEY! });
  return ag.agent.waitForRunning(sealId);
}
```

### Recreate a container from scratch

`reset()` rebuilds an existing container, optionally on a different framework, keeping the on-chain
identity.

```typescript
async function recreate(agentId: bigint, framework: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const sealId = await ag.agent.getSealId(agentId);
  await ag.agent.reset(sealId, { framework, apiKey: process.env.AGENT_API_KEY! });
  return ag.agent.waitForRunning(sealId);
}
```

### Transfer ownership

ERC-7857, so the familiar ERC-721 shape. The attestor re-keys the sealed data for the new owner.

```typescript
async function transfer(agentId: bigint, to: `0x${string}`) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const from = await ag.agent.ownerOf(agentId);
  const tx = await ag.agent.safeTransferFrom(from, to, agentId);
  await ag.agent.waitForTransaction(tx);

  console.log('new owner:', await ag.agent.ownerOf(agentId));
  // The old container is torn down asynchronously by the indexer, so do not
  // assert on phase right after this returns.
}
```

### Clone to another owner

The source owner mints a copy for someone else; the attestor re-keys the sealed data.

```typescript
async function cloneTo(sourceAgentId: bigint, targetOwner: `0x${string}`) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const res = await ag.agent.clone({ sourceAgentId, targetOwner }, { wait: 'minted' });
  console.log('clone agentId:', res.agentId);

  // Trace lineage later:
  console.log('cloned from:', await ag.agent.cloneSourceOf(res.agentId));
  return res;
}
```

### Marketplace fork: the buyer initiates

Here the **buyer** signs, and the source owner's on-chain `ICloneAuthorizer` decides whether to
allow it. Useful when the right to fork is sold rather than granted by hand.

```typescript
async function buyerFork(sourceAgentId: bigint, buyer: `0x${string}`, receipt: `0x${string}`) {
  // The connected wallet must BE the buyer / targetOwner here.
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.BUYER_PRIVATE_KEY as `0x${string}`,
  });

  // Who decides, if you want to inspect it first. Omit `authorizer` below and
  // the SDK reads it live.
  console.log('authorizer:', await ag.agent.cloneAuthorizerOf(sourceAgentId));

  return ag.agent.clone(
    { sourceAgentId, targetOwner: buyer, authorization: { authData: receipt } },
    { wait: 'minted' },
  );
}
```

Owner-side controls for the same flow:

```typescript
async function ownerGrants(sourceAgentId: bigint, buyer: `0x${string}`) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  await ag.agent.grantClone(sourceAgentId, buyer); // allow this buyer
  console.log(await ag.agent.cloneGrantOf(sourceAgentId, buyer));
  await ag.agent.revokeClone(sourceAgentId, buyer); // and withdraw it

  // Or install a policy contract that decides for you.
  await ag.agent.setCloneAuthorizer(sourceAgentId, process.env.AUTHORIZER as `0x${string}`);
}
```

## Anti-Patterns

```typescript
// BAD: deploy() to recover a failure — mints a second agent, strands the first
await ag.agent.deploy(params, { wait: 'minted' });

// BAD: sealId where an agentId belongs (and vice versa)
await ag.agent.ownerOf(sealId as never); // ownerOf takes a bigint agentId

// BAD: resuming a stopped container with the first-provision form
await ag.agent.start(sealId, { apiKey }); // that is for mint-only agents

// BAD: expecting owner/sandboxId from the public listing
const rows = await ag.agent.listDeployments();
await ag.agent.stop(rows[0].sealId, rows[0].sandboxId!); // sandboxId is null here

// BAD: asserting the container is gone the moment a transfer returns
await ag.agent.safeTransferFrom(from, to, agentId);
```

## Common Errors & Fixes

| Error                                 | Cause                                  | Fix                                                       |
| ------------------------------------- | -------------------------------------- | --------------------------------------------------------- |
| `sandboxId` is `null`                 | Mint-only, or you used the public list | Use `listMyDeployments()`; provision via `start`          |
| `start()` does nothing useful         | Wrong overload for the state           | `{ apiKey }` for first provision, `sandboxId` to resume   |
| Retry refuses                         | Phase is not `failed`                  | Check `phase` first; `reset()` recreates a working one    |
| Ownership unchanged after transfer    | Read before the receipt                | `await waitForTransaction(tx)` first                      |
| Clone reverts for a buyer-signed fork | Authorizer rejected the `authData`     | Check `cloneAuthorizerOf()` and the policy's expectations |

## Related Skills

- [Deploy Agent](../deploy-agent/SKILL.md) — mint and provision
- [Interact Agent](../interact-agent/SKILL.md) — call a running agent
- [Agent Accounts](../agent-accounts/SKILL.md) — balances and costs
- [Agent Reputation](../agent-reputation/SKILL.md) — serve-proofs and feedback

## References

- [patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md)
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
