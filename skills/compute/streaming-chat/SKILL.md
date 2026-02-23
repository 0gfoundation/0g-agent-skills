---
name: streaming-chat
description: |
  Run conversational AI inference using 0G Compute Network providers. Use this skill for chatbot, inference, LLM, DeepSeek, streaming chat, AI chat.
---

# Streaming Chat Inference

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `ethers` ^6.13.0
- **Activation Triggers**: "chatbot", "inference", "LLM", "DeepSeek", "streaming chat", "AI chat"

## Purpose

Run conversational AI inference using 0G Compute Network providers. Supports streaming and
non-streaming modes. Available on both testnet and mainnet with different model sets. Testnet:
qwen/qwen-2.5-7b-instruct. Mainnet: deepseek/deepseek-chat-v3-0324, openai/gpt-oss-120b,
zai-org/GLM-5-FP8, qwen/qwen3-vl-30b-a3b-instruct. Models change frequently — use `listService()`
for current availability.

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` and `ethers` installed
- Funded and acknowledged provider
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Get service metadata (endpoint, model)
3. Generate auth headers
4. Make chat completion request
5. Extract ChatID from `ZG-Res-Key` header (body fallback)
6. **Call `processResponse(providerAddress, chatID, usageData)`** — CRITICAL

## Core Rules

### ALWAYS

- Call `processResponse()` after EVERY inference request
- Use correct param order: `processResponse(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header FIRST, use `data.id` as fallback (chatbot only)
- Acknowledge provider before first use
- Check balance before making requests

### NEVER

- Skip `processResponse()` — causes fee settlement failure
- Reverse the parameter order of `processResponse()`
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Non-Streaming Chat

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
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
