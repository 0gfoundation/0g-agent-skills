# Streaming Chat Inference

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "chatbot", "inference", "LLM", "streaming chat", "AI chat", "GLM",
  "Claude", "GPT", "Qwen", "DeepSeek"

## Purpose

Run conversational AI inference using 0G Compute Network providers (`serviceType: chatbot`).
Supports streaming and non-streaming modes. Some providers serve a single model; others are
**multi-model routers** serving dozens behind one address.

## Models

Discover models at runtime — **never hardcode an id from this document**. The roster changes often.

```typescript
const { multiModel, defaultModel, models } =
  await broker.inference.getProviderModels(providerAddress);
```

At last verification 0G mainnet had 9 `chatbot` providers. Their on-chain defaults included
`zai-org/GLM-5-FP8`, `claude-opus-5`, `claude-fable-5`, `qwen3.7-plus`, `glm-5.3`,
`openai/gpt-5.4-mini`, `openai/gpt-oss-20b` and 0G's own `0GM-1.0-35B-A3B`. Two of those providers
are multi-model routers, together advertising well over 100 ids across the Claude, GPT, Gemini,
DeepSeek, Qwen, GLM, Kimi and ERNIE families, with context windows from 32K to ~1.4M.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
- Funded and acknowledged provider (sub-account funded with at least 1 0G)
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. (Optional) `getProviderModels(provider)` to pick a specific model
3. Get service metadata: `getServiceMetadata(provider, model?)`
4. Generate auth headers
5. Make chat completion request
6. Extract ChatID from the `ZG-Res-Key` header (body fallback)
7. **Call `processResponse(providerAddress, chatID, usageData)`** — CRITICAL

## Core Rules

### ALWAYS

- Call `processResponse()` after EVERY inference request
- Use correct param order: `processResponse(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header FIRST, use `data.id` as fallback
- Spread the headers from `getRequestHeaders()` (`...headers`) rather than naming individual headers
  — the exact set is an implementation detail and has changed between SDK versions
- Pass a model id to `getServiceMetadata(provider, model)` when targeting a multi-model provider
- Acknowledge provider before first use
- Check `availableBalance` before making requests
- Set a generous `max_tokens` for reasoning models — they spend budget on hidden reasoning tokens
  and will return empty `content` if the cap is too low

### NEVER

- Skip `processResponse()` — causes fee settlement failure
- Reverse the parameter order of `processResponse()`
- Use `data.id` when the `ZG-Res-Key` header is present — they differ (the header is a bare UUID,
  `data.id` is prefixed `chatcmpl-<uuid>`), and the wrong id fails verification
- Assume `getServiceMetadata()` gives you the only model a provider serves
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Non-Streaming Chat

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function chat(userMessage: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const messages = [{ role: 'user', content: userMessage }];

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model }),
  });

  const data = await response.json();
  const answer = data.choices[0].message.content;

  // CRITICAL: Process response for fee settlement
  let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (!chatID) chatID = data.id; // Fallback for chatbot

  await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

  return answer;
}

// Usage
const reply = await chat('What is 0G?');
console.log(reply);
```

### Selecting a Model on a Multi-Model Provider

Pass the model id as the second argument to `getServiceMetadata()`. The id is forwarded as-is; the
provider validates it, bills that model's price, and rejects an unknown id server-side.

```typescript
async function chatWithModel(userMessage: string, wantedModel: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  // Confirm the provider actually serves it before spending anything
  const { multiModel, models } = await broker.inference.getProviderModels(providerAddress);
  const match = models.find((m) => m.id === wantedModel || m.canonical_id === wantedModel);
  if (!match) {
    throw new Error(
      `${providerAddress} does not serve "${wantedModel}". ` +
        `multiModel=${multiModel}; available: ${models.map((m) => m.id).join(', ')}`,
    );
  }

  // Omitting the 2nd arg would silently use the provider's DEFAULT model
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress, match.id);
  const headers = await broker.inference.getRequestHeaders(providerAddress, userMessage);

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model, // the resolved model, not `wantedModel`
      messages: [{ role: 'user', content: userMessage }],
      max_tokens: 1024,
    }),
  });

  const data = await response.json();

  let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (!chatID) chatID = data.id;
  await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

  return data.choices[0].message.content;
}
```

Model metadata also tells you what a model can accept and what it costs, so you can choose without
trial and error:

```typescript
for (const m of models) {
  console.log({
    id: m.id,
    context: m.context_length,
    inputs: m.architecture?.input_modalities, // e.g. ['text', 'image']
    promptUsd: m.pricing_usd?.prompt, // decimal string per prompt token
    completionUsd: m.pricing_usd?.completion,
  });
}
```

### Streaming Chat

```typescript
async function streamingChat(userMessage: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const messages = [{ role: 'user', content: userMessage }];

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model, stream: true }),
  });

  // ChatID from header (primary source)
  let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  let usage = null;
  let streamChatID = null;
  let fullResponse = '';

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

  // Parse stream for fallback chatID and usage data
  for (const line of rawBody.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === 'data: [DONE]') continue;
    try {
      const jsonStr = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed;
      const message = JSON.parse(jsonStr);
      if (!streamChatID && message.id) streamChatID = message.id;
      if (message.usage) usage = message.usage;
      if (message.choices?.[0]?.delta?.content) {
        fullResponse += message.choices[0].delta.content;
      }
    } catch {}
  }

  // CRITICAL: processResponse with correct param order
  const finalChatID = chatID || streamChatID;
  await broker.inference.processResponse(providerAddress, finalChatID, JSON.stringify(usage || {}));

  return fullResponse;
}
```

### Multi-Turn Conversation

```typescript
async function conversation() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const history: Array<{ role: string; content: string }> = [
    { role: 'system', content: 'You are a helpful assistant.' },
  ];

  async function sendMessage(userMessage: string): Promise<string> {
    history.push({ role: 'user', content: userMessage });

    const headers = await broker.inference.getRequestHeaders(providerAddress);
    const response = await fetch(`${endpoint}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ messages: history, model }),
    });

    const data = await response.json();
    const answer = data.choices[0].message.content;
    history.push({ role: 'assistant', content: answer });

    let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
    if (!chatID) chatID = data.id;

    await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

    return answer;
  }

  const reply1 = await sendMessage('What is 0G?');
  console.log('Assistant:', reply1);

  const reply2 = await sendMessage('Tell me more about its storage layer.');
  console.log('Assistant:', reply2);
}
```

### Error Handling

```typescript
async function resilientChat(userMessage: string, maxRetries = 3): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const headers = await broker.inference.getRequestHeaders(providerAddress);
      const response = await fetch(`${endpoint}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ messages: [{ role: 'user', content: userMessage }], model }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const data = await response.json();
      const answer = data.choices[0].message.content;

      let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
      if (!chatID) chatID = data.id;

      await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

      return answer;
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) throw error;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  throw new Error('All retries exhausted');
}
```

## Anti-Patterns

```typescript
// BAD: Missing processResponse — fee settlement failure
const data = await response.json();
return data.choices[0].message.content;
// processResponse() never called!

// BAD: Wrong parameter order
await broker.inference.processResponse(
  chatID, // WRONG — should be providerAddress
  providerAddress, // WRONG — should be chatID
  usage,
);

// BAD: Using body ID without checking header first
const chatID = data.id; // Should check ZG-Res-Key header first!

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!

// BAD: Hardcoding private keys
const wallet = new ethers.Wallet('0xabc123...', provider); // NEVER do this
```

## Common Errors & Fixes

| Error                       | Cause                        | Fix                           |
| --------------------------- | ---------------------------- | ----------------------------- |
| `Insufficient balance`      | Sub-account empty            | Transfer funds to provider    |
| `Provider not acknowledged` | First-time provider          | `acknowledgeProviderSigner()` |
| `Invalid request headers`   | Stale auth headers           | Re-call `getRequestHeaders()` |
| `Fee verification failed`   | Wrong processResponse params | Check param order and chatID  |
| `stream error`              | Network interruption         | Implement retry logic         |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find chatbot providers
- [Account Management](../account-management/SKILL.md) — fund accounts
- [Text to Image](../text-to-image/SKILL.md) — image generation
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — AI with storage

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
