# Image Editing

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "edit image", "image editing", "modify image", "inpaint", "change this
  image", "image-to-image"

## Purpose

Apply prompt-driven edits to an **existing** image using 0G Compute Network providers
(`serviceType: image-editing`). The endpoint is OpenAI-compatible: `POST ${endpoint}/images/edits`.

Use [Text to Image](../text-to-image/SKILL.md) instead when creating an image from nothing.

## Models

Discover at runtime — never hardcode. At last verification the `image-editing` service type was
present on **testnet** (`qwen/qwen-image-edit-2511`, TEE-attested) and not on mainnet — the opposite
of most service types. Check both networks before assuming availability.

Supported request parameters: `prompt`, `image`, `n`, `size`, `response_format`. Defaults were
`n: 1`, `size: "1024x1024"`. Billing is **per output image** (`pricing.image`), with prompt and
completion priced at zero — so cost scales with `n`, not prompt length.

That provider also advertised a rate limit of 30 requests/minute; read `rate_limits` from its
`/v1/models` response rather than assuming.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
- Funded and acknowledged provider with an `image-editing` service
- A source image to edit
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Find an `image-editing` provider via `listService()` (paged, ≤ 50 per call)
3. Ensure the sub-account exists and is acknowledged
4. Get service metadata (endpoint, model)
5. Build the request with the source image and the edit prompt
6. Generate auth headers **with the prompt as the signed content**
7. `POST ${endpoint}/images/edits`
8. Extract ChatID from the `ZG-Res-Key` header
9. **Call `processResponse(providerAddress, chatID)`** — supported for this service type

## Core Rules

### ALWAYS

- Call `processResponse()` after every edit — `image-editing` **is** one of the four service types
  the SDK's extractor supports (`chatbot`, `text-to-image`, `image-editing`, `speech-to-text`)
- Get ChatID from the `ZG-Res-Key` header
- Include the prompt when generating auth headers (signing requirement)
- Keep `n` small — you are billed per output image
- Respect the provider's advertised `rate_limits`
- Page `listService()` in chunks of ≤ 50

### NEVER

- Assume this service type exists on mainnet — at last check it was testnet-only
- Send a huge image without checking the provider's limits
- Raise `n` to explore variations without accounting for per-image cost
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Edit an Image

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import * as fs from 'fs';
import 'dotenv/config';

async function editImage(sourcePath: string, prompt: string, outputPath: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

  // Inline the source image as a data URI
  const sourceB64 = fs.readFileSync(sourcePath).toString('base64');
  const body = JSON.stringify({
    model,
    prompt,
    image: `data:image/png;base64,${sourceB64}`,
    n: 1,
    size: '1024x1024',
    response_format: 'b64_json',
  });

  // Sign over the prompt
  const headers = await broker.inference.getRequestHeaders(providerAddress, prompt);

  const response = await fetch(`${endpoint}/images/edits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body,
  });
  if (!response.ok) {
    throw new Error(`Image edit failed: HTTP ${response.status} ${await response.text()}`);
  }

  const data = await response.json();

  // ChatID comes from the response header for image services
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');

  // Supported for image-editing — unlike embedding/video-generation
  await broker.inference.processResponse(providerAddress, chatID ?? undefined, '');

  const edited = data.data[0];
  if (edited.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(edited.b64_json, 'base64'));
  } else if (edited.url) {
    const img = await fetch(edited.url);
    fs.writeFileSync(outputPath, Buffer.from(await img.arrayBuffer()));
  } else {
    throw new Error('Response contained neither b64_json nor url');
  }

  console.log(`edited image written to ${outputPath}`);
  return outputPath;
}

// Usage
await editImage('./input.png', 'make the sky look like a sunset', './output.png');
```

### Find an Image-Editing Provider on Either Network

```typescript
import { createReadOnlyInferenceBroker } from '@0gfoundation/0g-compute-ts-sdk';

async function findImageEditor(rpcUrl: string) {
  const broker = await createReadOnlyInferenceBroker(rpcUrl);

  const services = [];
  for (let offset = 0; ; offset += 50) {
    const page = await broker.listService(offset, 50, true);
    services.push(...page);
    if (page.length < 50) break;
  }

  const editors = services.filter((s) => s.serviceType === 'image-editing');
  for (const s of editors) {
    console.log(
      `${s.provider} model=${s.model} perImage=${s.outputPrice} neuron tee=${s.teeSignerAcknowledged}`,
    );
  }
  return editors[0];
}

// image-editing was testnet-only at last check — try both
const onTestnet = await findImageEditor('https://evmrpc-testnet.0g.ai');
const onMainnet = await findImageEditor('https://evmrpc.0g.ai');
```

### Check Limits and Pricing First

```typescript
async function inspectEditor(providerAddress: string) {
  const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);
  const { models } = await broker.getProviderModels(providerAddress);

  for (const m of models) {
    console.log({
      id: m.id,
      supported: m.supported_parameters, // ['prompt','image','n','size','response_format']
      defaults: m.default_parameters, // { n: 1, size: '1024x1024' }
      perImage: m.pricing?.image,
      perImageUsd: m.pricing_usd?.image,
      inputs: m.architecture?.input_modalities, // ['text','image']
    });
  }
}
```

## Anti-Patterns

```typescript
// BAD: skipping processResponse() — it IS supported here, unlike embedding/video
const data = await response.json();
return data.data[0];

// BAD: signing without the prompt
const headers = await broker.inference.getRequestHeaders(providerAddress);

// BAD: cranking n to browse variations — billed per output image
body: JSON.stringify({ model, prompt, image, n: 10 });

// BAD: assuming mainnet has this service type
const editor = services.find((s) => s.serviceType === 'image-editing')!; // may be undefined
```

## Common Errors & Fixes

| Error                             | Cause                                       | Fix                                         |
| --------------------------------- | ------------------------------------------- | ------------------------------------------- |
| No `image-editing` provider found | Wrong network                               | At last check it was testnet-only           |
| HTTP 429                          | Exceeded the provider's rate limit          | Throttle; read `rate_limits` from the model |
| HTTP 413 / request too large      | Source image too big                        | Downscale before encoding                   |
| `AccountNotExists`                | `acknowledged()` before sub-account existed | Use `checkProviderSignerStatus()` first     |
| `LimitTooLarge`                   | `listService()` limit above 50              | Page in chunks of ≤ 50                      |

## Related Skills

- [Text to Image](../text-to-image/SKILL.md) — generate a new image from a prompt
- [Provider Discovery](../provider-discovery/SKILL.md) — find and verify providers
- [Account Management](../account-management/SKILL.md) — funding and balances
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — store originals and edits

## References

- [0G Compute SDK](https://docs.0g.ai/build-with-0g/compute-network/sdk)
- [OpenAI Image Edit API shape](https://platform.openai.com/docs/api-reference/images/createEdit)
