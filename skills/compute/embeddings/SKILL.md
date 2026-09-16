# Text Embeddings

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "embedding", "embeddings", "vector", "semantic search", "similarity",
  "RAG", "retrieval"

## Purpose

Turn text into dense vectors using 0G Compute Network providers (`serviceType: embedding`), for
semantic search, clustering, deduplication and retrieval-augmented generation. The endpoint is
OpenAI-compatible: `POST ${endpoint}/embeddings`.

## Models

Discover at runtime — never hardcode. At last verification 0G **mainnet** had one `embedding`
provider serving `qwen3.7-text-embedding` (1024 dimensions, up to 128K input tokens, 201 languages).
Testnet had **no** embedding provider, so target mainnet for this service type.

Embedding models are **input-billed only** — `outputPrice` is `0` and the response carries
`prompt_tokens` with no completion side. Supported request parameters are `dimensions` and
`encoding_format`.

## ⚠️ `processResponse()` is not supported for embeddings

This is the one service type where the repo-wide "ALWAYS call `processResponse()`" rule cannot be
followed. In SDK 0.9.0 the response extractor only recognises `chatbot`, `text-to-image`,
`image-editing` and `speech-to-text`; calling `processResponse()` against an `embedding` provider
throws:

```
Error: Unknown service type
```

Your request is still billed and settled — the signed headers from `getRequestHeaders()` are
themselves the settlement proof. What you lose by not calling it is local fee caching (used by
auto-funding) and response signature verification. So:

- **Do not** call `processResponse()` for `embedding` providers — it throws, and if you do not catch
  it, it will take down an otherwise successful request.
- **Do** manage the sub-account balance explicitly, since fee caching is unavailable. Check
  `availableBalance` yourself, or run `startAutoFunding()`.

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
- Funded and acknowledged provider (sub-account funded with at least 1 0G)
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `PROVIDER_ADDRESS`

## Quick Workflow

1. Initialize broker
2. Find an `embedding` provider via `listService()` (paged, ≤ 50 per call)
3. Ensure the sub-account exists and is acknowledged
4. Get service metadata (endpoint, model)
5. Generate auth headers
6. `POST ${endpoint}/embeddings` with `{ model, input }`
7. Read vectors from `data.data[i].embedding` — **do not** call `processResponse()`

## Core Rules

### ALWAYS

- Use the OpenAI-compatible path `${endpoint}/embeddings`
- Page `listService()` in chunks of ≤ 50
- Call `checkProviderSignerStatus()` before `acknowledged()` on first use
- Batch multiple strings into one request by passing an array as `input`
- Track `usage.prompt_tokens` yourself for cost accounting
- Monitor `availableBalance` explicitly, since fee caching is unavailable here

### NEVER

- Call `processResponse()` for an `embedding` provider — it throws `Unknown service type`
- Assume the vector length; read `embedding.length` (it was 1024 at last check, and `dimensions` can
  change it)
- Compare vectors produced by different models
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Embed a Single String

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function embed(input: string): Promise<number[]> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  const headers = await broker.inference.getRequestHeaders(providerAddress, input);

  const response = await fetch(`${endpoint}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ model, input }),
  });

  if (!response.ok) {
    throw new Error(`Embedding request failed: HTTP ${response.status}`);
  }

  const data = await response.json();

  // NOTE: no processResponse() call here — it throws for `embedding` services.
  console.log(`tokens billed: ${data.usage?.prompt_tokens}`);

  return data.data[0].embedding;
}

// Usage
const vector = await embed('decentralized AI operating system');
console.log(`${vector.length} dimensions`); // 1024 with qwen3.7-text-embedding
```

### Batch Many Strings in One Request

Batching is much cheaper per string than looping, and the response preserves input order via
`index`.

```typescript
async function embedBatch(inputs: string[]): Promise<number[][]> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);
  const providerAddress = process.env.PROVIDER_ADDRESS!;

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  // Sign over the concatenated content so the billing header covers the batch
  const headers = await broker.inference.getRequestHeaders(providerAddress, inputs.join('\n'));

  const response = await fetch(`${endpoint}/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ model, input: inputs }),
  });

  if (!response.ok) throw new Error(`Embedding batch failed: HTTP ${response.status}`);
  const data = await response.json();

  // Sort by `index` — do not rely on array order
  return data.data
    .slice()
    .sort((a: { index: number }, b: { index: number }) => a.index - b.index)
    .map((d: { embedding: number[] }) => d.embedding);
}
```

### Semantic Search

```typescript
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('vectors must share dimensionality');
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function search(query: string, documents: string[], topK = 3) {
  // One batched call for the corpus, one for the query
  const docVectors = await embedBatch(documents);
  const queryVector = await embed(query);

  return documents
    .map((text, i) => ({ text, score: cosineSimilarity(queryVector, docVectors[i]) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, topK);
}
```

### Find an Embedding Provider

```typescript
import { createReadOnlyInferenceBroker } from '@0gfoundation/0g-compute-ts-sdk';

async function findEmbeddingProvider() {
  const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);

  const services = [];
  for (let offset = 0; ; offset += 50) {
    const page = await broker.listService(offset, 50, true);
    services.push(...page);
    if (page.length < 50) break;
  }

  const embedders = services.filter((s) => s.serviceType === 'embedding');
  if (embedders.length === 0) {
    throw new Error(
      'No embedding providers on this network — mainnet carries them, testnet does not',
    );
  }

  for (const s of embedders) {
    console.log(`${s.provider} model=${s.model} inputPrice=${s.inputPrice} neuron/token`);
  }
  return embedders[0];
}
```

## Persisting Vectors on 0G Storage

Embeddings are just arrays of numbers, so a vector index can live in 0G Storage alongside the
documents it indexes. See [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) for
the upload/download pattern, and remember to keep the model id next to the vectors — vectors from
different models are not comparable.

## Anti-Patterns

```typescript
// BAD: processResponse() for embeddings — throws "Unknown service type"
const data = await response.json();
await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));

// BAD: one request per string — pays per-request overhead N times
for (const doc of documents) {
  vectors.push(await embed(doc));
}

// BAD: hardcoding dimensionality
const vector = new Array(1536); // wrong model's dimension count

// BAD: comparing across models
cosineSimilarity(vectorFromModelA, vectorFromModelB);
```

## Common Errors & Fixes

| Error                    | Cause                                   | Fix                                          |
| ------------------------ | --------------------------------------- | -------------------------------------------- |
| `Unknown service type`   | `processResponse()` on an embedding svc | Do not call it for `embedding`               |
| `AccountNotExists`       | `acknowledged()` before sub-account     | Use `checkProviderSignerStatus()` first      |
| `No embedding providers` | Running against testnet                 | Use mainnet, or re-check availability        |
| HTTP 402 / insufficient  | Sub-account balance too low             | `transferFund(provider, 'inference', 1 0G+)` |
| `LimitTooLarge`          | `listService()` limit above 50          | Page in chunks of ≤ 50                       |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find and verify providers
- [Account Management](../account-management/SKILL.md) — funding and balances
- [Streaming Chat](../streaming-chat/SKILL.md) — generate answers from retrieved context
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — persist a vector index

## References

- [0G Compute SDK](https://docs.0g.ai/build-with-0g/compute-network/sdk)
- [OpenAI Embeddings API shape](https://platform.openai.com/docs/api-reference/embeddings)
