# AgenticID Reputation and Serve-Proofs

## Metadata

- **Category**: agentic-id
- **SDK**: `@0gfoundation/0g-agentdna` ^0.4.0, `viem` ^2.21.0
- **Activation Triggers**: "rate an agent", "agent reputation", "leave feedback", "serve proof",
  "verify a proof", "ERC-8004 feedback", "agent reviews"

## Purpose

Build verifiable reputation for an agent: capture the TEE-signed serve-proof an agent stamps on its
signed services, verify it before spending gas, and submit feedback that lands in the canonical
ERC-8004 registry with a TEE verification mark alongside it.

> **This layer uses `viem`, not `ethers`.** The repo-wide ethers rule does not apply to `agentic-id`
> skills.

## Check the network before building on it

Whether reputation is available is decided by the attestor's `GET /config`, not by which network you
are on. The SDK's reputation methods need a non-null `verified_feedback_addr`; it finds the
canonical ERC-8004 registry by asking that contract (`getCanonicalReputation`), so
`reputation_registry_addr` in `/config` is not used by the SDK. That field is present but `null` on
both networks (checked 2026-11-11), so never gate on its key existing, and do not treat it as proof
the registry is missing.

Checked on 2026-11-11: `verified_feedback_addr` and `feedback_batcher_addr` are set on testnet
(16602) and mainnet (16661), and `getCanonicalReputation()` returns a deployed contract on both. A
full `giveFeedback` write was not exercised on mainnet. Run it on testnet first.

```typescript
const cfg = await (await fetch('https://agentdna-testnet.0g.ai/config')).json();
if (!cfg.verified_feedback_addr) throw new Error('reputation not deployed on this network');
```

> **Mainnet (`https://agentdna.0g.ai`, 16661) spends real funds.** Examples here default to testnet;
> try feedback there first.

## Two registries, one call

| Registry                      | Holds                                    | Who reads it              |
| ----------------------------- | ---------------------------------------- | ------------------------- |
| Canonical ERC-8004 Reputation | the feedback itself, proof-backed or not | any ERC-8004 reader       |
| VerifiedFeedbackRegistry      | which entries were backed by a TEE proof | this SDK's verified reads |

`giveFeedback()` writes both. Intersect them when you want "only proof-backed ratings".

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-agentdna` and `viem` installed
- A network whose attestor advertises `verified_feedback_addr` in `/config`
- A wallet for writes; reads need none
- A serve-proof, which means having called a signed `/api/*` service

## Quick Workflow

1. Call one of the agent's signed `/api/*` services and capture the proof
2. `verifyProof(proof)` before spending gas
3. `giveFeedback({ agentId, value, serveProof })`
4. Await the returned `attestTx`
5. Read back with canonical or verified reads

## Core Rules

### ALWAYS

- Verify a proof with `verifyProof()` before submitting; it is a free read
- Await `waitForTransaction(fb.attestTx)`; `giveFeedback` mines the canonical write itself but
  returns the attestation as pending
- Capture proofs from signed `/api/*` services; chat and UI routes are unsigned by design
- Treat serve-proofs as sensitive regardless of transport
- Check `/config` has `verified_feedback_addr` before building on this

### NEVER

- Try to rate your own agent; the verified registry rejects an owner attesting their own
- Expect `capture()` to yield a proof from an unsigned route; it returns `null`
- Assume the proof's `submitter` is whoever submits; only that address can redeem it, and on-chain
  attribution is always `msg.sender`
- Hardcode which network has reputation; decide from the attestor's `/config` at runtime
- Hardcode a private key

## Code Examples

### Capture, verify, submit

```typescript
import { AgentDNA } from '@0gfoundation/0g-agentdna';
import 'dotenv/config';

async function rateAgent(agentId: bigint) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // 1. call a SIGNED service. A public handle is fine: attribution comes from
  //    msg.sender at submission, not from this call.
  const agent = await ag.agent.connect(agentId);
  const { response, proof } = await agent.fetchWithProof('/api/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: 'hello' }),
  });
  await response.json();

  if (!proof) throw new Error('no proof: that route is not a signed /api/* service');

  // 2. verify before spending gas — a free read
  const v = await ag.reputation.verifyProof(proof);
  console.log(v); // { ok, signerMatches, notExpired, dataOnChain, reasons }
  if (!v.ok) throw new Error(`proof rejected: ${v.reasons.join(', ')}`);

  // 3. canonical 8004 write + TEE verification mark, bundled
  const fb = await ag.reputation.giveFeedback({ agentId, value: 5n, serveProof: proof });

  // 4. the canonical write is mined; the attestation is still pending
  await ag.reputation.waitForTransaction(fb.attestTx);

  console.log('feedback index:', fb.feedbackIndex);
  return fb;
}
```

### Lower-level capture

`capture()` wraps any fetch and pulls the proof off the response.

```typescript
async function captureManually(agentUrl: string) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai');

  const { response, proof } = await ag.reputation.capture(() =>
    fetch(`${agentUrl}/api/summarize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ q: 'hi' }),
    }),
  );

  // Or pull it from a Response you already have:
  const alsoProof = ag.reputation.proofFromResponse(response);

  return proof ?? alsoProof;
}
```

### Richer feedback

```typescript
import { AgentDNA, type ServeProof } from '@0gfoundation/0g-agentdna';
import 'dotenv/config';

async function ratedWithDetail(agentId: bigint, proof: ServeProof) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  return ag.reputation.giveFeedback({
    agentId,
    value: 90n,
    valueDecimals: 1, // 90 with 1 decimal == 9.0
    tag1: 'summarization',
    tag2: 'fast',
    endpoint: '/api/summarize',
    serveProof: proof,
  });
}
```

### Reading reputation back

Canonical reads see every entry; verified reads see only proof-backed ones.

```typescript
async function readReputation(agentId: bigint, client: `0x${string}`) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai');

  // canonical ERC-8004 — permissionless, verified or not
  const summary = await ag.reputation.getSummary({ agentId });
  console.log('all entries    :', summary.count, 'avg', summary.summaryValue);
  console.log('clients        :', await ag.reputation.getClients(agentId));

  const last = await ag.reputation.getLastIndex(agentId, client);
  if (last > 0n) {
    const entry = await ag.reputation.readFeedback(agentId, client, last - 1n);
    console.log(
      'latest         :',
      JSON.stringify(entry, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
    );
  }

  // verified only — intersect these with the canonical entries
  const verified = await ag.reputation.getVerifiedSummary({ agentId });
  console.log('proof-backed   :', verified.count);
  console.log('verified client:', await ag.reputation.getVerifiedClients(agentId));
  console.log('their indexes  :', await ag.reputation.getVerifiedIndexes(agentId, client));

  // filtered canonical read
  const filtered = await ag.reputation.readAllFeedback({
    agentId,
    tag1: 'summarization',
    includeRevoked: false,
  });
  console.log('filtered       :', filtered.length);
  return { summary, verified };
}
```

### Per-endpoint reputation

Pass the rated interaction as `task` and the contract checks it against the proof's `taskHash`, then
records the URI as that entry's TEE-verified endpoint. That turns reputation from per-agent into
per-interface.

```typescript
async function perEndpoint(agentId: bigint, client: `0x${string}`) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai');

  const uri = await ag.reputation.getVerifiedEndpoint(agentId, client, 0n);
  console.log('endpoint for entry 0:', uri || '(unrevealed)');

  const perIface = await ag.reputation.getVerifiedSummaryForEndpoint(agentId, '/api/summarize');
  console.log('/api/summarize     :', perIface.count, 'entries');
  return perIface;
}
```

### Owner responds; client revokes

```typescript
import { AgentDNA } from '@0gfoundation/0g-agentdna';
import { keccak256, toBytes } from 'viem';
import 'dotenv/config';

async function respondAndRevoke(agentId: bigint, client: `0x${string}`, idx: bigint) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // the agent's owner replies to an entry
  await ag.reputation.appendResponse({
    agentId,
    clientAddress: client,
    feedbackIndex: idx,
    responseURI: 'ipfs://…',
    responseHash: keccak256(toBytes('thanks')),
  });

  // the client who left it can withdraw it
  await ag.reputation.revokeFeedback(agentId, idx);
}
```

### Attesting separately

If the canonical write already happened, mark it proof-backed on its own.

```typescript
import { AgentDNA, type ServeProof, type TaskReveal } from '@0gfoundation/0g-agentdna';
import 'dotenv/config';

async function attestLater(agentId: bigint, idx: bigint, proof: ServeProof, task?: TaskReveal) {
  const ag = await AgentDNA.fromAttestor('https://agentdna-testnet.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // Plain attestation, or the task-revealing form which also records the
  // entry's TEE-verified endpoint.
  const tx = task
    ? await ag.reputation.attestFeedbackWithTask(agentId, idx, proof, task)
    : await ag.reputation.attestFeedback(agentId, idx, proof);

  await ag.reputation.waitForTransaction(tx);
  return tx;
}
```

## On-chain types

`value` and `summaryValue` are `int128`; `feedbackIndex` is `uint64`. All arrive as `bigint`, so use
`5n`, not `5`.

## Anti-Patterns

```typescript
// BAD: submitting without verifying — pays gas to find out it was expired
await ag.reputation.giveFeedback({ agentId, value: 5n, serveProof: proof });

// BAD: not waiting on the attestation, then reading isVerified()
const fb = await ag.reputation.giveFeedback({ agentId, value: 5n, serveProof: proof });
await ag.reputation.isVerified(agentId, me, fb.feedbackIndex); // likely false: attestTx pending

// BAD: rating your own agent — the verified registry rejects it
// BAD: passing a JS number where int128/uint64 is expected
await ag.reputation.giveFeedback({ agentId, value: 5 as never, serveProof: proof });

// BAD: taking a proof from chat and expecting it to redeem
const { proof: p } = await agent.fetchWithProof('/v1/chat/completions', { method: 'POST' });

// BAD: assuming reputation exists without checking /config
// (mainnet writes cost real funds; test on agentdna-testnet.0g.ai first)
await ag.reputation.giveFeedback({ agentId, value: 5n, serveProof: proof });
```

## Common Errors & Fixes

| Error                             | Cause                                     | Fix                                              |
| --------------------------------- | ----------------------------------------- | ------------------------------------------------ |
| `proof` is `null`                 | Unsigned route                            | Call a signed `/api/*` service                   |
| `verifyProof` `notExpired: false` | Past the proof's `deadline`               | Re-call the service for a fresh proof            |
| `signerMatches: false`            | Signer is not the agent's `agentSeal`     | Confirm the agent id and its seal                |
| `isVerified` false after feedback | `attestTx` not awaited                    | `await waitForTransaction(fb.attestTx)`          |
| Attestation reverts               | Owner rating their own agent              | Use a different client address                   |
| `no VerifiedFeedbackRegistry`     | `/config` has no `verified_feedback_addr` | Check `/config` first; use a network that has it |

## Related Skills

- [Interact Agent](../interact-agent/SKILL.md) — where the proof comes from
- [Deploy Agent](../deploy-agent/SKILL.md) — mint an agent to rate
- [Manage Agent](../manage-agent/SKILL.md) — get an agent running
- [Agent Accounts](../agent-accounts/SKILL.md) — gas and balances

## References

- [patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md)
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004)
