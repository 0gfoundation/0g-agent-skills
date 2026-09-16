# Provider Discovery

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "list providers", "find provider", "verify provider", "TEE", "available
  models", "which models"

## Purpose

Discover, filter, and verify compute providers on the 0G network. List available services by type,
enumerate the models each provider actually serves, inspect live health metrics, check TEE
verification status, and acknowledge providers before first use.

## Service Types

Verified live on 0G mainnet. Filter on the `serviceType` field:

| `serviceType`      | Meaning                        |
| ------------------ | ------------------------------ |
| `chatbot`          | Chat / text completion         |
| `text-to-image`    | Image generation from a prompt |
| `image-editing`    | Editing an existing image      |
| `video-generation` | Video generation               |
| `embedding`        | Text embedding vectors         |
| `speech-to-text`   | Audio transcription            |

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
- `.env` with `RPC_URL` (and `PRIVATE_KEY` only for the authenticated calls)

## Quick Workflow

1. Create a broker — use `createReadOnlyInferenceBroker(rpcUrl)` if you only need discovery
2. Page through `listService(offset, 50, includeUnacknowledged)` in chunks of **≤ 50**
3. Filter by `serviceType`
4. Call `getProviderModels(provider)` to see every model a provider serves
5. Check TEE status via `teeSignerAcknowledged`
6. Acknowledge the provider before first use

## Core Rules

### ALWAYS

- Page `listService()` in chunks of **≤ 50** — the contract reverts with `LimitTooLarge` above that
- Pass `includeUnacknowledged` explicitly when you want the complete picture (it defaults to
  `false`, which hides providers whose TEE signer is not acknowledged)
- Treat the on-chain `model` field as the provider's **default** model only — call
  `getProviderModels()` to enumerate the rest
- Discover model ids at runtime; they change often
- Verify TEE status for security-sensitive workloads
- Call `checkProviderSignerStatus()` before `acknowledged()` on first use
- Prefer named field access (`s.provider`, `s.model`) over positional indices

### NEVER

- Call `listService()` with `limit > 50` — it reverts
- Assume a bare `listService()` returned everything
- Assume a provider serves exactly one model
- Hardcode a model id copied from documentation
- Call `acknowledged(provider)` before that provider's sub-account exists — it reverts with
  `AccountNotExists`
- Use unverified providers for sensitive data
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### List All Providers (no wallet required)

Discovery is a read-only operation, so use the read-only broker — it needs no private key and can
run before a user connects a wallet.

```typescript
import { createReadOnlyInferenceBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

// listService() is paginated. Default limit is 50 and the contract REVERTS
// with LimitTooLarge above 50, so always page in chunks of <= 50.
async function listAllServices(includeUnacknowledged = true) {
  const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);

  const services = [];
  for (let offset = 0; ; offset += 50) {
    const page = await broker.listService(offset, 50, includeUnacknowledged);
    services.push(...page);
    if (page.length < 50) break;
  }
  return services;
}

async function listProviders() {
  const services = await listAllServices();

  // Entries are hybrid tuple/objects — named access is clearer and safer.
  // Positional equivalents: s[0]=provider, s[1]=serviceType, s[2]=url,
  // s[6]=model, s[10]=teeSignerAcknowledged.
  const byType = new Map<string, typeof services>();
  for (const s of services) {
    if (!byType.has(s.serviceType)) byType.set(s.serviceType, []);
    byType.get(s.serviceType)!.push(s);
  }

  for (const [type, list] of byType) {
    console.log(`\n${type} (${list.length})`);
    for (const s of list) {
      console.log(`  ${s.provider}  default=${s.model}  tee=${s.teeSignerAcknowledged}`);
    }
  }

  return byType;
}
```

### Enumerate Every Model a Provider Serves

The on-chain `model` field is only the provider's **default**. Multi-model providers route to many
models behind one address — some serve dozens.

```typescript
async function enumerateModels(providerAddress: string) {
  const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);

  const { multiModel, defaultModel, models } = await broker.getProviderModels(providerAddress);
  console.log(`multiModel=${multiModel} default=${defaultModel} count=${models.length}`);

  for (const m of models) {
    const ctx = m.context_length ? `ctx=${m.context_length}` : '';
    const modalities = m.architecture?.input_modalities?.join('+') ?? '';
    // m.canonical_id groups equivalent endpoints under one router-owned id
    console.log(`  ${m.id}  ${m.canonical_id ?? ''}  ${ctx}  ${modalities}`);
  }

  return models;
}
```

`getProviderModels()` reads the provider's public `/v1/models` endpoint, so it needs no auth — but
it is a live network call and can fail if a provider is down. Wrap it in try/catch when sweeping
every provider.

### Find and Verify a Provider

```typescript
async function findVerifiedProvider(serviceType: string) {
  const services = await listAllServices(true);

  // teeSignerAcknowledged is the TEE trust signal. Note `verifiability` is a
  // separate field whose live values include 'TeeML', 'standard' and '' —
  // don't treat it as a boolean.
  const filtered = services.filter(
    (s) => s.serviceType === serviceType && s.teeSignerAcknowledged === true,
  );

  if (filtered.length === 0) {
    throw new Error(`No TEE-verified ${serviceType} providers found`);
  }

  // Cheapest first. Prices are bigint, in neuron (the smallest unit).
  filtered.sort((a, b) => Number(a.inputPrice + a.outputPrice - b.inputPrice - b.outputPrice));

  const selected = filtered[0];
  console.log(`Selected provider: ${selected.provider}`);
  console.log(`Default model:     ${selected.model}`);
  console.log(`Verifiability:     ${selected.verifiability}`);
  console.log(`Input/output:      ${selected.inputPrice} / ${selected.outputPrice} neuron`);

  return { providerAddress: selected.provider, model: selected.model, raw: selected };
}
```

### Pick a Provider by Health

`listServiceWithDetail()` joins the on-chain records with live uptime and latency from the
monitoring API.

```typescript
async function findHealthiestProvider(serviceType: string) {
  const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);

  const detailed = [];
  for (let offset = 0; ; offset += 50) {
    const page = await broker.listServiceWithDetail(offset, 50, false);
    detailed.push(...page);
    if (page.length < 50) break;
  }

  const candidates = detailed
    .filter((s) => s.serviceType === serviceType && s.healthMetrics)
    .sort((a, b) => b.healthMetrics!.checks.uptime - a.healthMetrics!.checks.uptime);

  for (const s of candidates) {
    const h = s.healthMetrics!;
    console.log(
      `${s.provider} uptime=${h.checks.uptime}% ` +
        `latency=${h.performance.response_time?.avg ?? '?'}ms status=${h.status}`,
    );
  }

  return candidates[0];
}
```

### Acknowledge Provider

```typescript
async function acknowledgeProvider(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // One-time setup per provider
  await broker.inference.acknowledgeProviderSigner(providerAddress);
  console.log(`Provider ${providerAddress} acknowledged`);
}
```

### Get Service Metadata

```typescript
async function getServiceInfo(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Omit the second arg to get the provider's on-chain default model.
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${model}`);

  // For a multi-model provider, pass a model id from getProviderModels() to
  // select it. The id is forwarded as-is and validated by the provider, which
  // bills that model's price and rejects an unknown id server-side.
  const specific = await broker.inference.getServiceMetadata(providerAddress, 'openai/gpt-5.4');
  console.log(`Selected model: ${specific.model}`);

  return { endpoint, model };
}
```

### Error Handling

```typescript
async function safeProviderSetup(serviceType: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  try {
    const services = [];
    for (let offset = 0; ; offset += 50) {
      const page = await broker.inference.listService(offset, 50, true);
      services.push(...page);
      if (page.length < 50) break;
    }

    const filtered = services.filter((s) => s.serviceType === serviceType);

    if (filtered.length === 0) {
      throw new Error(`No ${serviceType} providers available`);
    }

    const selected = filtered[0];
    const providerAddress = selected.provider;

    // checkProviderSignerStatus() is safe before a sub-account exists;
    // acknowledged() would revert with AccountNotExists here.
    const status = await broker.inference.checkProviderSignerStatus(providerAddress);
    if (!status.isAcknowledged) {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
      console.log('Provider acknowledged successfully');
    }

    return { providerAddress, model: selected.model, raw: selected };
  } catch (error) {
    console.error('Provider discovery failed:', error);
    throw error;
  }
}
```

## Available Models

**Do not hardcode model ids from this section.** The roster changes frequently — treat this as a
snapshot and always discover at runtime with `listService()` + `getProviderModels()`.

At the last verification, 0G mainnet carried 14 services across 6 service types, and the two
multi-model routers between them advertised well over 100 model ids. Representative default models:

| Service Type     | Example default models                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| chatbot          | `zai-org/GLM-5-FP8`, `claude-opus-5`, `qwen3.7-plus`, `glm-5.3`, `0GM-1.0-35B-A3B`, `openai/gpt-5.4-mini` |
| text-to-image    | `z-image-turbo`                                                                                           |
| video-generation | `MiniMax-H3`, `dreamina-seedance-2-5-260628`                                                              |
| embedding        | `qwen3.7-text-embedding`                                                                                  |
| speech-to-text   | `openai/whisper-large-v3`                                                                                 |
| image-editing    | `qwen/qwen-image-edit-2511` (testnet)                                                                     |

Testnet carries far fewer services than mainnet and its set differs — notably, testnet has no
`text-to-image`, `embedding` or `video-generation` provider. Develop against mainnet when you need
those service types, or check testnet at runtime before assuming availability.

## CLI Commands

```bash
# List inference providers
0g-compute-cli inference list-providers

# List fine-tuning providers
0g-compute-cli fine-tuning list-providers

# Acknowledge a provider
0g-compute-cli inference acknowledge-provider --provider <ADDR>
```

## Anti-Patterns

```typescript
// BAD: Skipping acknowledgment
const headers = await broker.inference.getRequestHeaders(providerAddress);
// Will fail if provider not acknowledged

// BAD: Not checking TEE for sensitive workloads
const services = await broker.inference.listService();
const anyProvider = services[0]; // Could be unverified! Check s[10] for TEE status

// BAD: Hardcoding provider addresses without verification
const PROVIDER = '0x123...'; // May be offline or decommissioned

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
```

## Common Errors & Fixes

| Error                       | Cause                    | Fix                                |
| --------------------------- | ------------------------ | ---------------------------------- |
| `Provider not acknowledged` | First-time use           | Call `acknowledgeProviderSigner()` |
| `No providers found`        | Wrong network or filters | Check RPC_URL and service type     |
| `TEE verification failed`   | Provider not TEE-enabled | Choose a different provider        |
| `Service unavailable`       | Provider offline         | Try another provider               |

## Related Skills

- [Account Management](../account-management/SKILL.md) — fund accounts for providers
- [Streaming Chat](../streaming-chat/SKILL.md) — use chatbot providers
- [Text to Image](../text-to-image/SKILL.md) — use image providers

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [Security Patterns](../../../patterns/SECURITY.md)
