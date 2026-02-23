---
name: fine-tuning
description: |
  Fine-tune AI models on 0G's distributed GPU network. Use this skill for "fine-tune", "train model", "custom model", "model training".
---

# Model Fine-Tuning

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5 (CLI-based workflow)
- **Activation Triggers**: "fine-tune", "train model", "custom model", "model training"

## Purpose

Fine-tune AI models on 0G's distributed GPU network. Upload training data, configure parameters,
monitor training, and download the resulting model. Available on **both testnet and mainnet**.

> **Network note:** The `@0glabs/0g-serving-broker` SDK ^0.6.5 has a zero-address bug for the
> mainnet fine-tuning contract. Use the CLI (`0g-compute-cli`) for mainnet fine-tuning until the SDK
> is patched. The CLI's `setup-network` command handles network selection interactively.

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` CLI installed globally
- Wallet with 0G tokens (testnet or mainnet)
- Training dataset in required format
- Configuration file for training parameters

## Quick Workflow

1. List available providers and models
2. Prepare dataset and configuration
3. Upload dataset to 0G Storage
4. Calculate dataset size for cost estimation
5. Transfer funds to provider
6. Create fine-tuning task
7. Monitor progress
8. Download and decrypt model when complete

## Core Rules

### ALWAYS

- Use the CLI for mainnet fine-tuning (SDK has zero-address bug for mainnet contract)
- Verify provider availability before uploading data
- Save the root hash from dataset upload
- Save the task ID from task creation
- Wait for `Delivered` status before downloading
- Wait for `Finished` status before decrypting
- Acknowledge provider before first use
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header first, body as fallback (chatbot only)

### NEVER

- Create a new task while previous task is running
- Initiate refund during active fine-tuning
- Forget to decrypt the downloaded model
- Use the SDK for mainnet fine-tuning until the zero-address bug is fixed
- Hardcode private keys
- Use ethers v5 syntax

## Task Status Lifecycle

```text
Init -> SettingUp -> SetUp -> Training -> Trained -> Delivering -> Delivered -> UserAcknowledged -> Finished
                                                                                                     |
                                                                                                  Failed
```

| Status             | Description        | Action         |
| ------------------ | ------------------ | -------------- |
| `Init`             | Task submitted     | Wait           |
| `SettingUp`        | Provider preparing | Wait           |
| `Training`         | Model training     | Monitor logs   |
| `Delivered`        | Result uploaded    | Download model |
| `UserAcknowledged` | Download confirmed | Wait for key   |
| `Finished`         | Complete           | Decrypt model  |
| `Failed`           | Task failed        | Check logs     |

## Complete Workflow (CLI)

### 1. Find Provider

```bash
0g-compute-cli fine-tuning list-providers
# Testnet provider: 0xf07240Efa67755B5311bc75784a061eDB47165Dd
# Mainnet provider: 0x940b4a... (confirmed live, Feb 2026)
```

### 2. List Available Models

```bash
0g-compute-cli fine-tuning list-models
# Mainnet models (as of Feb 2026):
#   - Qwen2.5-0.5B-Instruct
#   - Qwen3-32B
```

### 3. Upload Dataset

```bash
0g-compute-cli fine-tuning upload --data-path ./my_dataset.json
# Output: Root hash: 0xabc123...
```

### 4. Calculate Size

```bash
0g-compute-cli fine-tuning calculate-token \
  --model Qwen2.5-0.5B-Instruct \
  --dataset-path ./my_dataset.json \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd
```

### 5. Fund Provider

```bash
0g-compute-cli transfer-fund \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --amount 1
```

### 6. Create Task

```bash
0g-compute-cli fine-tuning create-task \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --model Qwen2.5-0.5B-Instruct \
  --dataset 0xabc123... \
  --config-path ./config.json \
  --data-size 1000000
# Output: Created Task ID: 6b607314-88b0-4fef-91e7-43227a54de57
```

### 7. Monitor Progress

```bash
0g-compute-cli fine-tuning get-task \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --task 6b607314-88b0-4fef-91e7-43227a54de57

# View training logs
0g-compute-cli fine-tuning get-log \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --task 6b607314-88b0-4fef-91e7-43227a54de57
```

### 8. Download Model (when status = Delivered)

```bash
0g-compute-cli fine-tuning acknowledge-model \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --task-id 6b607314-88b0-4fef-91e7-43227a54de57 \
  --data-path ./encrypted_model.bin
```

### 9. Decrypt Model (when status = Finished)

```bash
0g-compute-cli fine-tuning decrypt-model \
  --provider 0xf07240Efa67755B5311bc75784a061eDB47165Dd \
  --task-id 6b607314-88b0-4fef-91e7-43227a54de57 \
  --encrypted-model ./encrypted_model.bin \
  --output ./my_model.zip

unzip ./my_model.zip -d ./my_fine_tuned_model/
```

## SDK Integration

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function checkFineTuningAccount(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Transfer funds for fine-tuning
  await broker.ledger.transferFund(providerAddress, 'fine-tuning', ethers.parseEther('1'));

  // Check sub-account (returns [subAccountTuple, refundsArray])
  const [account, refunds] = await broker.fineTuning.getAccountWithDetail(providerAddress);
  // Tuple: [0]=user, [1]=provider, [2]=balance, ...
  console.log(`Fine-tuning balance: ${ethers.formatEther(account[2])} 0G`);
}
```

### Error Handling

```typescript
async function monitorTask(providerAddress: string, taskId: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const pollInterval = 30000; // 30 seconds
  const maxAttempts = 120; // 1 hour max

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      // Check task status via CLI or SDK
      console.log(`Polling task ${taskId} (attempt ${attempt + 1})...`);

      // In practice, use CLI: 0g-compute-cli fine-tuning get-task
      // SDK integration for status checking may vary

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    } catch (error) {
      console.error('Status check failed:', error);
      if (attempt === maxAttempts - 1) throw error;
    }
  }
}
```

## Cost Estimation

- Price based on dataset size (bytes) x provider rate
- Typical rate: `0.000000000000000001 0G` per byte
- Calculate with `0g-compute-cli fine-tuning calculate-token`
- Always transfer 10-20% extra as buffer

## Anti-Patterns

```bash
# BAD: Creating task while another is running
0g-compute-cli fine-tuning create-task ... # Error: provider busy

# BAD: Downloading before Delivered status
0g-compute-cli fine-tuning acknowledge-model ... # Will fail

# BAD: Decrypting before Finished status
0g-compute-cli fine-tuning decrypt-model ... # Key not available yet
```

```typescript
// BAD: Hardcoding private keys
const wallet = new ethers.Wallet('0xabc123...', provider); // NEVER do this

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
```

## Common Errors & Fixes

| Error                       | Cause                 | Fix                            |
| --------------------------- | --------------------- | ------------------------------ |
| `Provider busy`             | Previous task running | Wait or use different provider |
| `Insufficient balance`      | Sub-account empty     | Transfer more funds            |
| `Dataset validation failed` | Wrong format          | Check dataset structure        |
| `Decryption failed`         | Wrong status or key   | Wait for `Finished` status     |
| `Task failed`               | Config or data issue  | Check logs for details         |
| `Provider not acknowledged` | First-time provider   | `acknowledgeProviderSigner()`  |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find fine-tuning providers
- [Account Management](../account-management/SKILL.md) — fund fine-tuning account

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [0G Serving Broker Releases](https://github.com/0gfoundation/0g-serving-broker/releases)
