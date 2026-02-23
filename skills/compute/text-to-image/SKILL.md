---
name: text-to-image
description: |
  Generate images from text prompts using 0G Compute Network providers (z-image model, mainnet). Use this skill for generate image, text-to-image, image generation, create image.
---

# Text-to-Image Generation

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `ethers` ^6.13.0
- **Activation Triggers**: "generate image", "text-to-image", "z-image", "image generation", "create
  image"

## Purpose

Generate images from text prompts using 0G Compute Network providers (model: `z-image`, mainnet
only). Supports multiple resolutions and batch generation. Text-to-image is not available on
testnet.

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` and `ethers` installed
- Funded and acknowledged provider with `text-to-image` service
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Get service metadata (endpoint, model)
3. Build request body with prompt, size, and count
4. Generate auth headers **with request body** (required for signing)
5. Make image generation request
6. Extract ChatID from `ZG-Res-Key` header ONLY (no body fallback)
7. **Call `processResponse(providerAddress, chatID)`** — no usage data needed

## Core Rules

### ALWAYS

- Include request body when generating auth headers (signing requirement)
- Get ChatID from `ZG-Res-Key` header only (no body fallback for images)
- Call `processResponse()` after every generation
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Acknowledge provider before first use
- Start with smaller dimensions for cost-effective testing

### NEVER

- Skip including the body in `getRequestHeaders()` for image requests
- Try to extract ChatID from the response body (images only have header)
- Generate large batches without checking balance first
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Basic Image Generation

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import * as fs from 'fs';
import 'dotenv/config';

async function generateImage(prompt: string, size = '1024x1024'): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const requestBody = { model, prompt, n: 1, size };

  // IMPORTANT: Include body for request signing
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    JSON.stringify(requestBody),
  );

  const response = await fetch(`${endpoint}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  const imageUrl = data.data[0].url;

  // ChatID from header ONLY for images
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

  if (chatID) {
    await broker.inference.processResponse(providerAddress, chatID);
  }

  return imageUrl;
}

// Usage
const imageUrl = await generateImage('A futuristic city skyline at sunset');
console.log('Image URL:', imageUrl);
```

### Generate and Save Locally

```typescript
async function generateAndSave(
  prompt: string,
  outputPath: string,
  size = '512x512',
): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const requestBody = { model, prompt, n: 1, size };
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    JSON.stringify(requestBody),
  );

  const response = await fetch(`${endpoint}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();

  // Process response for fee settlement
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (chatID) {
    await broker.inference.processResponse(providerAddress, chatID);
  }

  // Download and save image
  const imageData = data.data[0];
  if (imageData.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(imageData.b64_json, 'base64'));
  } else if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    const buffer = Buffer.from(await imgResponse.arrayBuffer());
    fs.writeFileSync(outputPath, buffer);
  }

  console.log(`Image saved to ${outputPath}`);
}
```

### Batch Generation

```typescript
async function batchGenerate(
  prompts: string[],
  outputDir: string,
  size = '512x512',
): Promise<string[]> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const results: string[] = [];

  for (let i = 0; i < prompts.length; i++) {
    console.log(`Generating ${i + 1}/${prompts.length}: "${prompts[i]}"`);

    const requestBody = { model, prompt: prompts[i], n: 1, size };
    const headers = await broker.inference.getRequestHeaders(
      providerAddress,
      JSON.stringify(requestBody),
    );

    const response = await fetch(`${endpoint}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
    if (chatID) {
      await broker.inference.processResponse(providerAddress, chatID);
    }

    const outputPath = `${outputDir}/image-${i + 1}.png`;
    if (data.data[0].url) {
      const imgResponse = await fetch(data.data[0].url);
      fs.writeFileSync(outputPath, Buffer.from(await imgResponse.arrayBuffer()));
    }

    results.push(outputPath);
  }

  return results;
}
```

### Error Handling

```typescript
async function safeGenerateImage(prompt: string, size = '512x512'): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;

  try {
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const requestBody = { model, prompt, n: 1, size };

    const headers = await broker.inference.getRequestHeaders(
      providerAddress,
      JSON.stringify(requestBody),
    );

    const response = await fetch(`${endpoint}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

    if (chatID) {
      await broker.inference.processResponse(providerAddress, chatID);
    }

    return data.data[0].url || null;
  } catch (error) {
    console.error('Image generation failed:', error);
    return null;
  }
}
```

## Supported Sizes

| Size        | Cost (approx.) | Best For            |
| ----------- | -------------- | ------------------- |
| `256x256`   | ~0.001 0G      | Thumbnails, testing |
| `512x512`   | ~0.002 0G      | Standard images     |
| `1024x1024` | ~0.003 0G      | High quality        |

## Anti-Patterns

```typescript
// BAD: Missing body in getRequestHeaders for images
const headers = await broker.inference.getRequestHeaders(providerAddress);
// Must include: getRequestHeaders(providerAddress, JSON.stringify(requestBody))

// BAD: Trying to get chatID from response body
const chatID = data.id; // WRONG for images — use header only

// BAD: Large batch without balance check
await batchGenerate(hundredPrompts, './out'); // May run out of funds

// BAD: Hardcoding private keys
const wallet = new ethers.Wallet('0xabc123...', provider); // NEVER do this

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
```

## Common Errors & Fixes

| Error                     | Cause                             | Fix                                   |
| ------------------------- | --------------------------------- | ------------------------------------- |
| `Insufficient balance`    | Sub-account empty                 | Transfer more funds                   |
| `Invalid request headers` | Missing body in header generation | Include body in `getRequestHeaders()` |
| `Fee verification failed` | Missing chatID                    | Ensure `ZG-Res-Key` header exists     |
| `invalid size`            | Unsupported dimensions            | Use 256x256, 512x512, or 1024x1024    |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find image providers
- [Account Management](../account-management/SKILL.md) — fund accounts
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — generate and store

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
