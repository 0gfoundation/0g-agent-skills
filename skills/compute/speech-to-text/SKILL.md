---
name: speech-to-text
description: |
  Transcribe audio files using 0G Compute Network providers running openai/whisper-large-v3 (mainnet only). Use this skill for "transcribe", "speech-to-text", "Whisper", "audio transcription".
---

# Speech-to-Text Transcription

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `ethers` ^6.13.0
- **Activation Triggers**: "transcribe", "speech-to-text", "Whisper", "audio transcription"

## Purpose

Transcribe audio files using 0G Compute Network providers running `openai/whisper-large-v3` (mainnet
only — not available on testnet). Supports multiple audio formats and output types (JSON, text, SRT
subtitles). Use mainnet RPC (`https://evmrpc.0g.ai`).

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` and `ethers` installed
- Funded and acknowledged provider with `speech-to-text` service
- Audio file in supported format (mp3, wav, ogg, flac, webm)
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Get service metadata (endpoint, model)
3. Create FormData with audio file and parameters
4. Generate auth headers
5. Make transcription request
6. Extract ChatID from `ZG-Res-Key` header ONLY
7. **Call `processResponse(providerAddress, chatID, usageData)`**

## Core Rules

### ALWAYS

- Use FormData for audio upload (not JSON)
- Get ChatID from `ZG-Res-Key` header (no body fallback for speech)
- Call `processResponse()` after every transcription
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Include usage data if available in response
- Acknowledge provider before first use

### NEVER

- Send audio as base64 in JSON body (use FormData)
- Skip `processResponse()` after transcription
- Try to get ChatID from response body for speech-to-text
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Basic Transcription

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import * as fs from 'fs';
import 'dotenv/config';

async function transcribe(audioPath: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioPath);
  const audioBlob = new Blob([audioBuffer]);
  formData.append('file', audioBlob, audioPath.split('/').pop());
  formData.append('model', model);
  formData.append('response_format', 'json');

  const response = await fetch(`${endpoint}/audio/transcriptions`, {
    method: 'POST',
    headers: { ...headers },
    body: formData,
  });

  const data = await response.json();

  // ChatID from header ONLY for speech-to-text
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

  await broker.inference.processResponse(
    providerAddress,
    chatID,
    data.usage ? JSON.stringify(data.usage) : undefined,
  );

  return data.text;
}

// Usage
const text = await transcribe('./audio/podcast.mp3');
console.log('Transcription:', text);
```

### Transcription with Format Options

```typescript
type OutputFormat = 'json' | 'text' | 'srt' | 'verbose_json';

async function transcribeWithFormat(
  audioPath: string,
  format: OutputFormat = 'json',
  language?: string,
): Promise<any> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const formData = new FormData();
  const audioBuffer = fs.readFileSync(audioPath);
  formData.append('file', new Blob([audioBuffer]), audioPath.split('/').pop());
  formData.append('model', model);
  formData.append('response_format', format);
  if (language) formData.append('language', language);

  const response = await fetch(`${endpoint}/audio/transcriptions`, {
    method: 'POST',
    headers: { ...headers },
    body: formData,
  });

  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

  if (format === 'text' || format === 'srt') {
    const text = await response.text();
    if (chatID) {
      await broker.inference.processResponse(providerAddress, chatID);
    }
    return text;
  }

  const data = await response.json();
  await broker.inference.processResponse(
    providerAddress,
    chatID,
    data.usage ? JSON.stringify(data.usage) : undefined,
  );

  return data;
}

// Usage
const srt = await transcribeWithFormat('./audio/meeting.mp3', 'srt', 'en');
fs.writeFileSync('./output/meeting.srt', srt);
```

### Error Handling

```typescript
async function safeTranscribe(audioPath: string): Promise<string | null> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const providerAddress = process.env.PROVIDER_ADDRESS!;

  try {
    // Validate file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Validate file size (most providers have limits)
    const stats = fs.statSync(audioPath);
    const maxSize = 25 * 1024 * 1024; // 25MB typical limit
    if (stats.size > maxSize) {
      throw new Error(`File too large (${stats.size} bytes). Max: ${maxSize} bytes`);
    }

    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(providerAddress);

    const formData = new FormData();
    const audioBuffer = fs.readFileSync(audioPath);
    formData.append('file', new Blob([audioBuffer]), audioPath.split('/').pop());
    formData.append('model', model);
    formData.append('response_format', 'json');

    const response = await fetch(`${endpoint}/audio/transcriptions`, {
      method: 'POST',
      headers: { ...headers },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

    await broker.inference.processResponse(
      providerAddress,
      chatID,
      data.usage ? JSON.stringify(data.usage) : undefined,
    );

    return data.text;
  } catch (error) {
    console.error('Transcription failed:', error);
    return null;
  }
}
```

## Supported Audio Formats

| Format | Extension | Notes        |
| ------ | --------- | ------------ |
| MP3    | `.mp3`    | Most common  |
| WAV    | `.wav`    | Uncompressed |
| OGG    | `.ogg`    | Compressed   |
| FLAC   | `.flac`   | Lossless     |
| WebM   | `.webm`   | Web native   |

## Output Formats

| Format         | Description                      |
| -------------- | -------------------------------- |
| `json`         | `{ "text": "..." }`              |
| `text`         | Plain text string                |
| `srt`          | SubRip subtitle format           |
| `verbose_json` | Includes timestamps and segments |

## Cost Estimate

~0.0001 0G per minute of audio (varies by provider).

## Anti-Patterns

```typescript
// BAD: Sending audio as JSON
const response = await fetch(endpoint, {
  body: JSON.stringify({ audio: base64Data }), // WRONG — use FormData
});

// BAD: Getting chatID from body
const chatID = data.id; // WRONG for speech — header only

// BAD: Missing processResponse
const data = await response.json();
return data.text; // processResponse() never called!

// BAD: Hardcoding private keys
const wallet = new ethers.Wallet('0xabc123...', provider); // NEVER do this

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
```

## Common Errors & Fixes

| Error                       | Cause               | Fix                              |
| --------------------------- | ------------------- | -------------------------------- |
| `Insufficient balance`      | Sub-account empty   | Transfer more funds              |
| `unsupported format`        | Wrong audio format  | Use mp3, wav, ogg, flac, or webm |
| `file too large`            | Audio file too big  | Split into smaller segments      |
| `Fee verification failed`   | Missing chatID      | Check `ZG-Res-Key` header        |
| `Provider not acknowledged` | First-time provider | `acknowledgeProviderSigner()`    |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find speech providers
- [Account Management](../account-management/SKILL.md) — fund accounts
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — transcribe and store

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
