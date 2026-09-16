# Compute Patterns

Architecture, broker lifecycle, processResponse() deep-dive, and best practices for 0G decentralized
compute.

## Architecture Overview

```
┌────────────────────────────────────┐
│         Your Application           │
├────────────────────────────────────┤
│     0G Serving Broker SDK          │
│  (@0gfoundation/0g-compute-ts-sdk)       │
├────────────────────────────────────┤
│      Provider Network              │
│  (TEE-verified GPU nodes)          │
├────────────────────────────────────┤
│       0G Chain                     │
│  (Settlement & verification)       │
└────────────────────────────────────┘
```

## Service Types

All paths are relative to the `endpoint` returned by `getServiceMetadata()` and are
OpenAI-compatible. Model ids change frequently — discover them with `listService()` and
`getProviderModels()` rather than hardcoding.

| `serviceType`      | Endpoint Path(s)                                                       | `processResponse()` |
| ------------------ | ---------------------------------------------------------------------- | ------------------- |
| `chatbot`          | `POST /chat/completions`                                               | supported           |
| `text-to-image`    | `POST /images/generations`                                             | supported           |
| `image-editing`    | `POST /images/edits`                                                   | supported           |
| `speech-to-text`   | `POST /audio/transcriptions`                                           | supported           |
| `embedding`        | `POST /embeddings`                                                     | **throws**          |
| `video-generation` | `POST /videos`, `GET /videos/{id}`, `GET /videos/{id}/content` (async) | **throws**          |

### `processResponse()` only covers four service types

SDK 0.9.0 builds a response extractor by switching on `serviceType`, and the switch has exactly four
arms — `chatbot`, `text-to-image`, `image-editing`, `speech-to-text`. Anything else hits the
`default` branch:

```
Error: Unknown service type
```

So for `embedding` and `video-generation` you must **not** call `processResponse()`. The request is
still billed and settled — the signed headers from `getRequestHeaders()` are the settlement proof —
but you forgo local fee caching (which auto-funding relies on) and response signature verification.
Manage those sub-account balances explicitly.

## Broker Lifecycle

### 1. Initialize Broker

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);
```

### 2. Discover Providers

```typescript
const services = await broker.inference.listService();

// Services are returned as tuple arrays:
//   [0] = providerAddress, [1] = serviceType, [2] = url,
//   [6] = model, [10] = teeVerified
const chatbotServices = services.filter((s: any) => s[1] === 'chatbot');
const imageServices = services.filter((s: any) => s[1] === 'text-to-image');
const speechServices = services.filter((s: any) => s[1] === 'speech-to-text');

// Access provider info: s[0] = address, s[6] = model, s[10] = TEE verified
```

### 3. Fund Account

```typescript
// Deposit to main account
await broker.ledger.depositFund(10);

// Transfer to provider sub-account
await broker.ledger.transferFund(providerAddress, 'inference', ethers.parseEther('5'));

// Acknowledge provider (one-time per provider)
await broker.inference.acknowledgeProviderSigner(providerAddress);
```

### 4. Get Service Metadata

```typescript
const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
```

### 5. Generate Auth Headers

```typescript
// For chatbot (no body needed)
const headers = await broker.inference.getRequestHeaders(providerAddress);

// For text-to-image (body MUST be included for signing)
const headers = await broker.inference.getRequestHeaders(
  providerAddress,
  JSON.stringify(requestBody),
);
```

### 6. Make Request & Process Response

See the processResponse() section below — this is the most critical step.

## processResponse() Deep-Dive

**This is the most important function in the 0G Compute SDK.** It MUST be called after every
inference request for fee settlement and response verification.

### Signature

```typescript
await broker.inference.processResponse(
  providerAddress, // string — provider's Ethereum address
  chatID, // string | undefined — response identifier
  usageData, // string | undefined — JSON-stringified usage stats
);
```

### Parameter Order is CRITICAL

```
processResponse(providerAddress, chatID, usageData)
                 ↑ FIRST           ↑ SECOND  ↑ THIRD
```

Getting the order wrong will cause silent fee miscalculation.

### ChatID Extraction Rules

| Service Type            | Primary Source                       | Fallback                        |
| ----------------------- | ------------------------------------ | ------------------------------- |
| Chatbot (non-streaming) | `response.headers.get("ZG-Res-Key")` | `data.id` from response body    |
| Chatbot (streaming)     | `response.headers.get("ZG-Res-Key")` | `message.id` from stream chunks |
| Text-to-Image           | `response.headers.get("ZG-Res-Key")` | None                            |
| Speech-to-Text          | `response.headers.get("ZG-Res-Key")` | None                            |

**ALWAYS check headers first, body as fallback (chatbot only):**

```typescript
let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
if (!chatID) {
  chatID = data.id; // Fallback for chatbot only
}
```

### Usage Data by Service Type

| Service Type   | Usage Data Required | Format                       |
| -------------- | ------------------- | ---------------------------- |
| Chatbot        | Yes                 | `JSON.stringify(data.usage)` |
| Text-to-Image  | No                  | Omit or pass `undefined`     |
| Speech-to-Text | Yes (if available)  | `JSON.stringify(data.usage)` |

### Complete Examples

#### Chatbot processResponse

```typescript
const data = await response.json();
let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
if (!chatID) chatID = data.id;

await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));
```

#### Text-to-Image processResponse

```typescript
const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

if (chatID) {
  await broker.inference.processResponse(providerAddress, chatID);
}
```

#### Speech-to-Text processResponse

```typescript
const data = await response.json();
const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

await broker.inference.processResponse(
  providerAddress,
  chatID,
  data.usage ? JSON.stringify(data.usage) : undefined,
);
```

## Streaming Pattern

```typescript
const response = await fetch(`${endpoint}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...headers },
  body: JSON.stringify({ messages, model, stream: true }),
});

let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
let usage = null;
let streamChatID = null;

const decoder = new TextDecoder();
const reader = response.body!.getReader();
let rawBody = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value, { stream: true });
  rawBody += chunk;
  process.stdout.write(chunk); // Real-time output
}

// Parse stream for chatID fallback and usage
for (const line of rawBody.split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed === 'data: [DONE]') continue;
  try {
    const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
    const message = JSON.parse(jsonStr);
    if (!streamChatID && message.id) streamChatID = message.id;
    if (message.usage) usage = message.usage;
  } catch {}
}

const finalChatID = chatID || streamChatID;
await broker.inference.processResponse(providerAddress, finalChatID, JSON.stringify(usage || {}));
```

## Account Structure

```
Your Wallet
    ↓ deposit
Main Account
    ↓ transfer-fund
Provider Sub-Accounts (one per provider)
    ↓ service usage (auto-deducted)
    ↓ retrieve-fund (24h lock)
Main Account
    ↓ refund
Your Wallet
```

## TEE Verification

Trusted Execution Environment verification ensures provider integrity:

```typescript
const services = await broker.inference.listService();
// Tuple: [0]=providerAddress, [1]=serviceType, [10]=teeVerified
for (const service of services) {
  if (service[0] === targetProvider) {
    console.log('TEE verified:', service[10]);
  }
}
```

## CLI Commands Reference

| Action               | Command                                                           |
| -------------------- | ----------------------------------------------------------------- |
| Setup network        | `0g-compute-cli setup-network`                                    |
| Login                | `0g-compute-cli login`                                            |
| Deposit              | `0g-compute-cli deposit --amount 10`                              |
| Check balance        | `0g-compute-cli get-account`                                      |
| Transfer to provider | `0g-compute-cli transfer-fund --provider <ADDR> --amount 5`       |
| Acknowledge provider | `0g-compute-cli inference acknowledge-provider --provider <ADDR>` |
| List providers       | `0g-compute-cli inference list-providers`                         |
| Start local proxy    | `0g-compute-cli inference serve --provider <ADDR>`                |
| Get API secret       | `0g-compute-cli inference get-secret --provider <ADDR>`           |

## Critical Rules

### ALWAYS

- Call `processResponse()` after EVERY inference request
- Use correct parameter order: `(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header first, body as fallback
- Acknowledge provider before first use
- Check balance before making requests

### NEVER

- Skip `processResponse()` — causes fee settlement failure
- Reverse the parameter order of `processResponse()`
- Hardcode private keys
- Use ethers v5 syntax (use v6)
- Skip provider acknowledgment

## Common Errors

| Error                       | Cause                            | Fix                                            |
| --------------------------- | -------------------------------- | ---------------------------------------------- |
| `Insufficient balance`      | Sub-account empty                | Transfer funds: `broker.ledger.transferFund()` |
| `Provider not acknowledged` | First-time use                   | `broker.inference.acknowledgeProviderSigner()` |
| `Invalid request headers`   | Stale auth                       | Re-call `getRequestHeaders()`                  |
| `Fee verification failed`   | Wrong `processResponse()` params | Check param order and chatID source            |
| `Connection refused`        | Wrong RPC URL                    | Verify RPC_URL in .env                         |

## References

- [0G Compute SDK Docs](https://docs.0g.ai/build-with-0g/compute-network/sdk)
- [0G Serving Broker](https://github.com/0gfoundation/0g-serving-broker)
- See also: [NETWORK_CONFIG.md](./NETWORK_CONFIG.md), [SECURITY.md](./SECURITY.md)
