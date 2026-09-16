# Video Generation

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "generate video", "text-to-video", "image-to-video", "video generation",
  "MiniMax", "Seedance"

## Purpose

Generate video clips from a text prompt (optionally conditioned on a reference image) using 0G
Compute Network providers (`serviceType: video-generation`).

Unlike chat and image generation, this is an **asynchronous, three-call** flow: submit a job, poll
until it completes, then download the MP4.

## Models

Discover at runtime — never hardcode. At last verification 0G **mainnet** had two `video-generation`
providers; testnet had none.

| Model                          | Output                  | Billing unit   |
| ------------------------------ | ----------------------- | -------------- |
| `dreamina-seedance-2-5-260628` | 480p/720p/1080p, 4–30 s | `video_token`  |
| `MiniMax-H3`                   | 2K, 5–15 s              | `video_second` |

Both accept `text` and `image` input and emit `video`. Supported request parameters are `prompt`,
`seconds`, `size` and `input_reference`.

**Video is by far the most expensive service type on the network.** At last check `MiniMax-H3` was
priced at roughly 1.07 0G _per generated second_ — a 10-second clip is on the order of 10 0G. Always
read live pricing before submitting, and prefer the cheapest variant while developing.

Pricing is expressed in **variants**, because cost depends on resolution.

> **Types lag the API here.** The SDK's `ProviderModelInfo['pricing']` declares `prompt`,
> `completion`, `image`, `video`, `tiered_pricing` and `cache_token_billing` — but **not** the
> `variants` and `video_unit` fields that video providers actually return. Widen the type locally
> rather than reaching for `any`:

```typescript
interface VideoPricingVariant {
  dimensions?: Record<string, string>;
  unit: 'video_token' | 'video_second';
  unit_price: string;
}

interface VideoPricing {
  video?: string;
  video_unit?: 'video_token' | 'video_second';
  variants?: VideoPricingVariant[];
}

const { models } = await broker.inference.getProviderModels(providerAddress);
for (const m of models) {
  const pricing = m.pricing as VideoPricing | undefined;
  console.log(m.id, pricing?.video_unit); // 'video_token' | 'video_second'
  for (const v of pricing?.variants ?? []) {
    console.log('  ', JSON.stringify(v.dimensions), v.unit, v.unit_price);
  }
}
```

## ⚠️ `processResponse()` is not supported for video

In SDK 0.9.0 the response extractor recognises only `chatbot`, `text-to-image`, `image-editing` and
`speech-to-text`. Calling `processResponse()` against a `video-generation` provider throws:

```
Error: Unknown service type
```

The job is still billed and settled from the signed `getRequestHeaders()` headers. What you lose is
local fee caching and signature verification, so manage the sub-account balance explicitly — and
given the cost per clip, check `availableBalance` **before** submitting.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
- Funded and acknowledged provider — budget generously, see pricing above
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Find a `video-generation` provider and read its live pricing variants
3. Confirm `availableBalance` covers the clip you are about to request
4. Ensure the sub-account exists and is acknowledged
5. `POST ${endpoint}/videos` → returns a job with an `id`
6. Poll `GET ${endpoint}/videos/{id}` until `status` is `completed`
7. `GET ${endpoint}/videos/{id}/content` → MP4 bytes
8. **Do not** call `processResponse()`

## Core Rules

### ALWAYS

- Treat generation as asynchronous — submit, poll, then download
- Read live pricing variants before submitting; cost scales with resolution and duration
- Check `availableBalance` before submitting, since a single clip can cost many 0G
- Poll with a sensible interval and an overall timeout
- Request the smallest `size`/`seconds` that answers the question while developing
- Page `listService()` in chunks of ≤ 50

### NEVER

- Call `processResponse()` for a `video-generation` provider — it throws `Unknown service type`
- Expect the MP4 in the submit response — you get a job id
- Poll in a tight loop without a delay
- Assume a fixed price per clip — it depends on resolution and billing unit
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Generate a Clip End to End

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import * as fs from 'fs';
import 'dotenv/config';

interface VideoJob {
  id: string;
  status: string; // 'queued' | 'in_progress' | 'completed' | 'failed' | ...
  error?: { message?: string };
}

async function generateVideo(
  prompt: string,
  outputPath: string,
  opts: { seconds?: number; size?: string } = {},
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  // Video is expensive — refuse to submit if the ledger is thin.
  const led = await broker.ledger.getLedger();
  console.log(`available: ${ethers.formatEther(led.availableBalance)} 0G`);

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

  // 1. Submit
  const submit = await fetch(`${endpoint}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      prompt,
      seconds: opts.seconds ?? 5,
      size: opts.size ?? '720p',
    }),
  });
  if (!submit.ok) {
    throw new Error(`Video submit failed: HTTP ${submit.status} ${await submit.text()}`);
  }
  const job: VideoJob = await submit.json();
  console.log(`job ${job.id} submitted (status=${job.status})`);

  // 2. Poll. Generation takes minutes, so poll slowly with a hard timeout.
  const pollMs = 10_000;
  const timeoutMs = 15 * 60_000;
  const startedAt = Date.now();
  let current = job;

  while (current.status !== 'completed') {
    if (current.status === 'failed') {
      throw new Error(`Video job failed: ${current.error?.message ?? 'unknown error'}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Video job ${job.id} timed out after ${timeoutMs / 60_000} minutes`);
    }
    await new Promise((r) => setTimeout(r, pollMs));

    // Re-sign: headers are per-request
    const pollHeaders = await broker.inference.getRequestHeaders(providerAddress);
    const poll = await fetch(`${endpoint}/videos/${job.id}`, { headers: { ...pollHeaders } });
    if (!poll.ok) throw new Error(`Poll failed: HTTP ${poll.status}`);
    current = await poll.json();
    console.log(`  status=${current.status}`);
  }

  // 3. Download the MP4
  const dlHeaders = await broker.inference.getRequestHeaders(providerAddress);
  const content = await fetch(`${endpoint}/videos/${job.id}/content`, {
    headers: { ...dlHeaders },
  });
  if (!content.ok) throw new Error(`Download failed: HTTP ${content.status}`);

  const bytes = Buffer.from(await content.arrayBuffer());
  fs.writeFileSync(outputPath, bytes);
  console.log(`wrote ${bytes.length} bytes to ${outputPath}`);

  // NOTE: no processResponse() — it throws for `video-generation`.
  return outputPath;
}
```

### Image-to-Video

Pass a reference image via `input_reference`. The models accept `text` and `image` input.

```typescript
async function animateImage(prompt: string, referenceUrl: string, outputPath: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

  const submit = await fetch(`${endpoint}/videos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      model,
      prompt,
      input_reference: referenceUrl,
      seconds: 5,
      size: '720p',
    }),
  });
  if (!submit.ok) throw new Error(`Submit failed: HTTP ${submit.status}`);
  return submit.json();
}
```

### Estimate Cost Before Submitting

```typescript
// See the Models section above for why `pricing` needs widening.
interface VideoPricingVariant {
  dimensions?: Record<string, string>;
  unit: 'video_token' | 'video_second';
  unit_price: string;
}
interface VideoPricing {
  video_unit?: 'video_token' | 'video_second';
  variants?: VideoPricingVariant[];
}

async function estimateCost(providerAddress: string, seconds: number, resolution: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const { models } = await broker.inference.getProviderModels(providerAddress);
  const m = models[0];
  const pricing = m.pricing as VideoPricing | undefined;
  const variants = pricing?.variants ?? [];

  const variant = variants.find((v) => v.dimensions?.resolution === resolution);
  if (!variant) {
    console.log(
      `No variant for ${resolution}; known:`,
      variants.map((v) => v.dimensions?.resolution),
    );
    return null;
  }

  // 'video_second' bills per generated second; 'video_token' bills on the
  // vendor-reported token count, which you cannot know ahead of time.
  if (variant.unit === 'video_second') {
    const total = BigInt(variant.unit_price) * BigInt(seconds);
    console.log(`~${ethers.formatEther(total)} 0G for ${seconds}s at ${resolution}`);
    return total;
  }

  console.log(`${m.id} bills per ${variant.unit}; exact cost is known only after generation`);
  return null;
}
```

## Anti-Patterns

```typescript
// BAD: processResponse() for video — throws "Unknown service type"
await broker.inference.processResponse(providerAddress, chatID, '');

// BAD: expecting video bytes from the submit call
const submit = await fetch(`${endpoint}/videos`, { method: 'POST', ... });
fs.writeFileSync('out.mp4', Buffer.from(await submit.arrayBuffer())); // it's a JSON job

// BAD: tight polling loop — hammers the provider and can trip rate limits
while (job.status !== 'completed') {
  job = await (await fetch(`${endpoint}/videos/${job.id}`)).json();
}

// BAD: submitting a long 2K clip while developing (can cost tens of 0G)
body: JSON.stringify({ model, prompt, seconds: 15, size: '2K' });
```

## Common Errors & Fixes

| Error                   | Cause                                       | Fix                                          |
| ----------------------- | ------------------------------------------- | -------------------------------------------- |
| `Unknown service type`  | `processResponse()` on a video service      | Do not call it for `video-generation`        |
| Job `status: failed`    | Prompt rejected or vendor error             | Read `error.message`; simplify the prompt    |
| Poll never completes    | Clip still rendering                        | Poll slowly; allow many minutes, set timeout |
| HTTP 402 / insufficient | Sub-account cannot cover the clip           | Top up; video costs far more than chat       |
| `AccountNotExists`      | `acknowledged()` before sub-account existed | Use `checkProviderSignerStatus()` first      |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find providers and read pricing variants
- [Account Management](../account-management/SKILL.md) — funding (budget carefully here)
- [Text to Image](../text-to-image/SKILL.md) — cheaper, synchronous stills
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — archive clips on 0G Storage

## References

- [0G Compute SDK](https://docs.0g.ai/build-with-0g/compute-network/sdk)
- [OpenAI Video API shape](https://platform.openai.com/docs/api-reference/videos)
