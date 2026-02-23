---
name: provider-discovery
description: |
  Discover, filter, and verify compute providers on the 0G network. Use this skill for "list providers", "find provider", "verify provider", "TEE", "available models".
---

# Provider Discovery

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `ethers` ^6.13.0
- **Activation Triggers**: "list providers", "find provider", "verify provider", "TEE", "available
  models"

## Purpose

Discover, filter, and verify compute providers on the 0G network. List available services by type
(chatbot, text-to-image, speech-to-text), check TEE verification status, and acknowledge providers
before first use.

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` and `ethers` installed
- Funded wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

1. Initialize broker with wallet
2. List all services with `broker.inference.listService()`
3. Filter by service type
4. Check TEE verification status
5. Acknowledge provider before first use

## Core Rules

### ALWAYS

- Verify TEE status for security-sensitive workloads
- Acknowledge provider before first use (`acknowledgeProviderSigner`)
- Check provider availability before making requests
- Filter services by type to find relevant providers

### NEVER

- Skip provider acknowledgment (requests will fail)
- Assume all providers support all service types
- Use unverified providers for sensitive data
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### List All Providers

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function listProviders() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const services = await broker.inference.listService();

  // Services are returned as tuple arrays:
  //   [0] = providerAddress, [1] = serviceType, [2] = url,
  //   [6] = model, [10] = teeVerified
  const chatbotServices = services.filter((s: any) => s[1] === 'chatbot');
  const imageServices = services.filter((s: any) => s[1] === 'text-to-image');
  const speechServices = services.filter((s: any) => s[1] === 'speech-to-text');

  console.log(`Chatbot providers: ${chatbotServices.length}`);
  chatbotServices.forEach((s: any) => {
    console.log(`  ${s[0]} — model: ${s[6]}, TEE: ${s[10]}`);
  });
  console.log(`Image providers: ${imageServices.length}`);
  console.log(`Speech providers: ${speechServices.length}`);

  return { chatbotServices, imageServices, speechServices };
}
```

### Find and Verify a Provider

```typescript
async function findVerifiedProvider(serviceType: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const services = await broker.inference.listService();

  // Filter by type and TEE status (tuple: [0]=addr, [1]=type, [6]=model, [10]=tee)
  const filtered = services.filter((s: any) => s[1] === serviceType && s[10] === true);

  if (filtered.length === 0) {
    throw new Error(`No TEE-verified ${serviceType} providers found`);
  }

  const selected = filtered[0];
  const providerAddress = selected[0];
  const model = selected[6];
  console.log(`Selected provider: ${providerAddress}`);
  console.log(`Model: ${model}`);
  console.log(`TEE verified: ${selected[10]}`);

  return { providerAddress, model, raw: selected };
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

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Model: ${model}`);

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
    const services = await broker.inference.listService();

    // Tuple: [0]=providerAddress, [1]=serviceType, [6]=model
    const filtered = services.filter((s: any) => s[1] === serviceType);

    if (filtered.length === 0) {
      throw new Error(`No ${serviceType} providers available`);
    }

    const selected = filtered[0];
    const providerAddress = selected[0];

    try {
      await broker.inference.acknowledgeProviderSigner(providerAddress);
      console.log('Provider acknowledged successfully');
    } catch (ackError) {
      console.warn('Acknowledgment failed (may already be acknowledged):', ackError);
    }

    return { providerAddress, model: selected[6], raw: selected };
  } catch (error) {
    console.error('Provider discovery failed:', error);
    throw error;
  }
}
```

## Available Models

### Mainnet

| Provider | Service Type   | Models                                                                                                 |
| -------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| Various  | chatbot        | deepseek/deepseek-chat-v3-0324, openai/gpt-oss-120b, zai-org/GLM-5-FP8, qwen/qwen3-vl-30b-a3b-instruct |
| Various  | text-to-image  | z-image                                                                                                |
| Various  | speech-to-text | openai/whisper-large-v3                                                                                |

### Testnet (Galileo)

> Provider availability varies. Use `listService()` to check current providers.

| Service Type   | Status                                  |
| -------------- | --------------------------------------- |
| chatbot        | Available (qwen/qwen-2.5-7b-instruct)   |
| image-editing  | Available (qwen/qwen-image-edit-2511)   |
| text-to-image  | Not available on testnet (mainnet only) |
| speech-to-text | Not available on testnet (mainnet only) |

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
