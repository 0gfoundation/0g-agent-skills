# Interact with a Running AgenticID Agent

## Metadata

- **Category**: agentic-id
- **SDK**: `@0gfoundation/0g-agenticid-sdk` ^0.1.6, `viem` ^2.21.0
- **Activation Triggers**: "call an agent", "chat with an agent", "talk to my agent", "agent
  endpoints", "agent services", "agent logs"

## Purpose

Call a deployed AgenticID agent: discover what it exposes, chat with it as its owner, invoke its
signed `/api/*` services, and read its logs. The SDK resolves the agent's URL from chain, so an
`agentId` is enough.

> **This layer uses `viem`, not `ethers`.** The repo-wide ethers rule does not apply to `agentic-id`
> skills.

## Two kinds of surface, and the difference matters

| Surface    | Shape                           | Signed with a serve-proof? | Who can call it       |
| ---------- | ------------------------------- | -------------------------- | --------------------- |
| `services` | `/api/*`                        | **yes**                    | anyone (attributable) |
| `routes`   | framework prefixes, e.g. `/v1/` | no                         | owner-authenticated   |

Only `/api/*` services carry `X-Agent-Proof`. Chat and UI routes deliberately do not: signing an
owner-authenticated channel would let an owner manufacture their own reputation. If you need a proof
to leave feedback, call a **service**, not chat.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-agenticid-sdk` and `viem` installed
- An agent in phase `running`
- A wallet only for owner-scoped calls (`chat`, `chatStream`, `logs`); public calls need none

## Quick Workflow

1. Build the client; pass `account` only if you need owner-scoped calls
2. `client(agentId)` to get a handle, or `connect(agentId)` to force a public one
3. Inspect `agent.services` and `agent.routes` to see what exists
4. Call it: `fetchWithProof()` for services, `chat()` for chat routes

## Core Rules

### ALWAYS

- Use `fetchWithProof()` on `/api/*` services when you intend to leave feedback afterwards
- Check `agent.chat` and `agent.logs` exist before calling them; they are present only with an owner
  key and a declared route
- Read `agent.services` / `agent.routes` rather than guessing paths
- Use `connect()` when you explicitly want a public handle with no token attached
- Remember `model` on `chat()` is the **framework's** selector, not an LLM name; the LLM is fixed at
  deploy time

### NEVER

- Expect a serve-proof from a chat or UI route; `proof` comes back `null`
- Assume `chat` is available on a handle built without an owner key
- Hardcode the agent URL when an `agentId` will resolve it
- Pass an LLM model name to `chat()`'s `model` option
- Hardcode a private key

## Code Examples

### Discover what an agent exposes

`sayHi()` needs only the URL and no wallet.

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';
import 'dotenv/config';

async function discover(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai');

  // connect() is the explicit PUBLIC handle: never attaches a token.
  const agent = await ag.agent.connect(agentId);

  console.log('signed services (attributable, /api/*):');
  for (const s of agent.services) {
    console.log(`  ${s.method} ${s.path}  ${s.description ?? ''}`);
  }

  console.log('framework routes (chat/UI, unsigned):');
  for (const r of agent.routes) {
    console.log(`  ${r.prefix}  kind=${r.kind ?? '?'} auth=${r.auth ?? 'none'} signed=${r.signed}`);
  }

  return { services: agent.services, routes: agent.routes };
}
```

Or straight from a URL, without touching chain:

```typescript
async function greet(agentUrl: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai');
  const { hello, verification } = await ag.agent.sayHi(agentUrl);
  console.log(hello.agent, hello.owner, hello.message);
  console.log('verification:', JSON.stringify(verification));
  return hello;
}
```

### Call a signed service and keep the proof

This is the call that produces a redeemable serve-proof.

```typescript
async function summarize(agentId: bigint, text: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai');
  const agent = await ag.agent.connect(agentId);

  const { response, proof } = await agent.fetchWithProof('/api/summarize', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ q: text }),
  });

  const body = await response.json();

  // proof is null when the route is not a signed /api/* service.
  if (proof) {
    console.log(`proof for agent ${proof.agentId}, redeemable by ${proof.submitter}`);
  }

  return { body, proof };
}
```

### Chat as the owner

`chat` and `chatStream` appear on the handle only when the client holds the owner key **and** the
agent declares a chat route.

```typescript
async function chat(agentId: bigint, message: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const agent = await ag.agent.client(agentId);

  if (!agent.chat) {
    console.log('no chat route, or this handle is not the owner');
    return null;
  }

  // `model` selects the FRAMEWORK, not an LLM. openclaw wants "openclaw".
  const { choices } = await agent.chat([{ role: 'user', content: message }], {
    model: 'openclaw',
  });

  return choices[0]?.message?.content;
}
```

Streaming yields content deltas:

```typescript
async function streamChat(agentId: bigint, message: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const agent = await ag.agent.client(agentId);
  if (!agent.chatStream) return;

  for await (const delta of agent.chatStream([{ role: 'user', content: message }], {
    model: 'openclaw',
  })) {
    process.stdout.write(delta);
  }
}
```

### Plain fetch, and owner-only logs

```typescript
async function inspect(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const agent = await ag.agent.client(agentId);

  // fetch() attaches the bearer token when the route asks for auth.
  const models = await agent.fetch('/v1/models');
  console.log(await models.json());

  // logs() is owner-only, so it may be absent.
  if (agent.logs) {
    console.log(await agent.logs({ tail: 200 }));
  }
}
```

### Choosing a handle

```typescript
async function handles(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  // client(): owner ops present when the key matches; accepts an id OR a url
  const auto = await ag.agent.client(agentId);

  // authenticate(): mint the owner token up front; fails without a wallet
  const owner = await ag.agent.authenticate(agentId);

  // connect(): explicitly public, never attaches a token
  const publicHandle = await ag.agent.connect(agentId);

  return { auto, owner, publicHandle };
}
```

## Anti-Patterns

```typescript
// BAD: expecting a proof from a chat route — chat is deliberately unsigned
const agent = await ag.agent.client(agentId);
const { proof } = await agent.fetchWithProof('/v1/chat/completions', { method: 'POST' });
// proof === null; call an /api/* service instead

// BAD: calling chat() without checking it exists
await agent.chat!([{ role: 'user', content: 'hi' }]); // undefined on a public handle

// BAD: passing an LLM name as the framework selector
await agent.chat(msgs, { model: 'claude-opus-5' }); // the LLM is fixed at deploy

// BAD: hardcoding the URL when the id resolves it
await fetch('https://8080-abc.art.0g.ai/api/summarize', { method: 'POST' });

// BAD: guessing paths instead of reading the manifest
await agent.fetch('/api/summarise'); // check agent.services for the real spelling
```

## Common Errors & Fixes

| Error                       | Cause                                    | Fix                                           |
| --------------------------- | ---------------------------------------- | --------------------------------------------- |
| `proof` is `null`           | Route is not a signed `/api/*` service   | Call a service from `agent.services`          |
| `agent.chat` is `undefined` | Public handle, or no chat route declared | Build with `account`; check `agent.routes`    |
| `agent.logs` is `undefined` | Not the owner                            | Owner key required                            |
| 404 on a path you expected  | Path guessed rather than read            | Enumerate `agent.services` / `agent.routes`   |
| Agent unreachable           | Phase is not `running`                   | `start(sealId, …)`, then `waitForRunning()`   |
| Chat rejects the model      | Passed an LLM name, not the framework's  | Use the framework selector, e.g. `"openclaw"` |

## Related Skills

- [Agent Reputation](../agent-reputation/SKILL.md) — redeem the proof this skill captures
- [Manage Agent](../manage-agent/SKILL.md) — get an agent into `running`
- [Deploy Agent](../deploy-agent/SKILL.md) — mint and provision
- [Agent Accounts](../agent-accounts/SKILL.md) — keep the runtime funded

## References

- [patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md)
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
