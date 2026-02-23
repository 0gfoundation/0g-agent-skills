---
name: compute-plus-storage
description: |
  Combine 0G Compute (AI inference) with 0G Storage for end-to-end AI pipelines. Use this skill for AI with storage, generate and store, transcribe and store, inference with storage, AI pipeline.
---

# Compute + Storage Integration

## Metadata

- **Category**: cross-layer
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `@0glabs/0g-ts-sdk` ^0.3.3, `ethers` ^6.13.0
- **Activation Triggers**: "AI with storage", "generate and store", "transcribe and store",
  "inference with storage", "AI pipeline"

## Purpose

Combine 0G Compute (AI inference) with 0G Storage for end-to-end AI pipelines: generate content with
AI and persist results to decentralized storage, or load data from storage and process with AI.
Note: text-to-image and speech-to-text compute services are mainnet only. Chatbot inference is
available on both testnet and mainnet. Storage works on both networks.

## Prerequisites

- Node.js >= 18
- `@0glabs/0g-serving-broker`, `@0glabs/0g-ts-sdk`, and `ethers` installed
- Funded and acknowledged compute provider
- Funded wallet for storage operations
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `STORAGE_INDEXER`, `PROVIDER_ADDRESS`

## Quick Workflow

### Generate → Store

1. Run AI inference (chat, image, or transcription)
2. Call `processResponse()` (critical!)
3. Save output to temp file
4. Upload to 0G Storage
5. Return root hash

### Load → Process

1. Download data from 0G Storage
2. Feed data to AI inference
3. Call `processResponse()`
4. Return AI output

## Core Rules

### ALWAYS

- Call `processResponse()` after every inference request
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Close file handles after storage operations
- Clean up temp files
- Use verified downloads from storage

### NEVER

- Skip `processResponse()` between compute calls
- Forget to close `ZgFile` handles
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Generate Image and Store

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import 'dotenv/config';

async function generateAndStore(prompt: string): Promise<string> {
  const ethersProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethersProvider);

  // --- Compute: Generate image ---
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const requestBody = { model, prompt, n: 1, size: '512x512' };
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

  // CRITICAL: processResponse for fee settlement
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (chatID) {
    await broker.inference.processResponse(providerAddress, chatID);
  }

  // Download image to temp file
  const tempPath = path.join(os.tmpdir(), `0g-image-${Date.now()}.png`);
  if (data.data[0].b64_json) {
    fs.writeFileSync(tempPath, Buffer.from(data.data[0].b64_json, 'base64'));
  } else if (data.data[0].url) {
    const imgResponse = await fetch(data.data[0].url);
    fs.writeFileSync(tempPath, Buffer.from(await imgResponse.arrayBuffer()));
  }

  // --- Storage: Upload to 0G ---
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const file = await ZgFile.fromFilePath(tempPath);

  let rootHash: string;
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);
    rootHash = tree!.rootHash();
    const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  } finally {
    await file.close();
    fs.unlinkSync(tempPath); // Clean up
  }

  console.log(`Image generated and stored. Root hash: ${rootHash}`);
  return rootHash;
}

// Usage
const rootHash = await generateAndStore('A futuristic AI laboratory');
```

### Transcribe Audio from Storage

```typescript
async function transcribeFromStorage(audioRootHash: string): Promise<string> {
  const ethersProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethersProvider);

  // --- Storage: Download audio ---
  // Note: download() can throw or return errors — handle both
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const tempAudioPath = path.join(os.tmpdir(), `0g-audio-${Date.now()}.mp3`);
  try {
    const dlErr = await indexer.download(audioRootHash, tempAudioPath, true);
    if (dlErr) throw dlErr;
  } catch (error: any) {
    throw new Error(`Download failed: ${error.message}`);
  }
  console.log('Downloaded audio from storage');

  // --- Compute: Transcribe ---
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const formData = new FormData();
  const audioBuffer = fs.readFileSync(tempAudioPath);
  formData.append('file', new Blob([audioBuffer]), 'audio.mp3');
  formData.append('model', model);
  formData.append('response_format', 'json');

  const response = await fetch(`${endpoint}/audio/transcriptions`, {
    method: 'POST',
    headers: { ...headers },
    body: formData,
  });

  const data = await response.json();

  // CRITICAL: processResponse
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  await broker.inference.processResponse(
    providerAddress,
    chatID,
    data.usage ? JSON.stringify(data.usage) : undefined,
  );

  // Clean up
  fs.unlinkSync(tempAudioPath);

  return data.text;
}
```

### Chat about Stored Data

```typescript
async function chatAboutStoredData(dataRootHash: string, question: string): Promise<string> {
  const ethersProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethersProvider);

  // --- Storage: Download data ---
  // Note: download() can throw or return errors — handle both
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const tempPath = path.join(os.tmpdir(), `0g-data-${Date.now()}.txt`);
  try {
    const dlErr = await indexer.download(dataRootHash, tempPath, true);
    if (dlErr) throw dlErr;
  } catch (error: any) {
    throw new Error(`Download failed: ${error.message}`);
  }
  const fileContent = fs.readFileSync(tempPath, 'utf-8');
  fs.unlinkSync(tempPath);

  // --- Compute: Ask AI about the data ---
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const messages = [
    { role: 'system', content: `You are analyzing this data:\n\n${fileContent}` },
    { role: 'user', content: question },
  ];

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model }),
  });

  const data = await response.json();

  // CRITICAL: processResponse
  let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (!chatID) chatID = data.id;

  await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

  return data.choices[0].message.content;
}
```

### Full Pipeline: Generate → Store → Register On-Chain

```typescript
async function fullPipeline(
  prompt: string,
  registryAddress: string,
  registryAbi: any[],
): Promise<{ rootHash: string; fileId: number }> {
  const ethersProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, ethersProvider);

  // Step 1: Generate with AI
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  const requestBody = { model, prompt, n: 1, size: '512x512' };
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
  if (chatID) await broker.inference.processResponse(providerAddress, chatID);

  // Step 2: Store in 0G Storage
  const tempPath = path.join(os.tmpdir(), `pipeline-${Date.now()}.png`);
  if (data.data[0].url) {
    const imgRes = await fetch(data.data[0].url);
    fs.writeFileSync(tempPath, Buffer.from(await imgRes.arrayBuffer()));
  }

  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const file = await ZgFile.fromFilePath(tempPath);
  let rootHash: string;
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw err;
    rootHash = tree!.rootHash();
    const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  } finally {
    await file.close();
    fs.unlinkSync(tempPath);
  }

  // Step 3: Register on-chain
  const registry = new ethers.Contract(registryAddress, registryAbi, wallet);
  const tx = await registry.registerFile(rootHash, `AI generated: ${prompt}`);
  const receipt = await tx.wait();

  const event = receipt.logs.find((l: any) => l.fragment?.name === 'FileRegistered');
  const fileId = Number(event?.args?.[0] ?? 0);

  console.log('Pipeline complete!');
  console.log('Root hash:', rootHash);
  console.log('On-chain file ID:', fileId);

  return { rootHash, fileId };
}
```

## Architecture

```text
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│  0G Compute   │────▶│  0G Storage   │────▶│  0G Chain     │
│               │     │               │     │               │
│  AI Inference │     │  File Store   │     │  Registry     │
│  - Chat       │     │  - Root Hash  │     │  - On-chain   │
│  - Image Gen  │     │  - Merkle     │     │    reference  │
│  - Transcribe │     │  - Verified   │     │               │
└───────────────┘     └───────────────┘     └───────────────┘
    Generate              Persist              Record
```

## Anti-Patterns

```typescript
// BAD: Missing processResponse between compute calls
const data = await response.json();
const tempPath = '...';
fs.writeFileSync(tempPath, data); // processResponse() never called!

// BAD: Not closing file handles
const file = await ZgFile.fromFilePath(tempPath);
await indexer.upload(file, process.env.RPC_URL!, wallet);
// file.close() missing!

// BAD: Not cleaning up temp files
const tempPath = path.join(os.tmpdir(), 'temp.png');
fs.writeFileSync(tempPath, buffer);
await indexer.upload(file, process.env.RPC_URL!, wallet);
// fs.unlinkSync(tempPath) missing!
```

## Common Errors & Fixes

| Error                     | Cause                       | Fix                                    |
| ------------------------- | --------------------------- | -------------------------------------- |
| `Fee verification failed` | Missing processResponse     | Call processResponse() after inference |
| `Merkle tree error`       | Empty temp file             | Verify data was written before upload  |
| `insufficient funds`      | Wallet or sub-account empty | Fund wallet and transfer to provider   |
| `file not found`          | Storage download failed     | Check root hash is correct             |

## Related Skills

- [Streaming Chat](../../compute/streaming-chat/SKILL.md) — AI chat inference
- [Text to Image](../../compute/text-to-image/SKILL.md) — image generation
- [Upload File](../../storage/upload-file/SKILL.md) — storage upload
- [Storage + Chain](../storage-plus-chain/SKILL.md) — on-chain references

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Storage Patterns](../../../patterns/STORAGE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
