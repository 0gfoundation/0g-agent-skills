# Model Fine-Tuning

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0 (CLI-based workflow)
- **Activation Triggers**: "fine-tune", "train model", "custom model", "model training", "LoRA",
  "adapter", "deploy adapter"

## Purpose

Fine-tune AI models on 0G's distributed GPU network. Upload training data, configure parameters,
monitor training, and download the resulting model. Then deploy the result as a **LoRA adapter** on
an inference provider and chat with it. **Training is currently testnet only.**

## Prerequisites

- Node.js >= 20 (the SDK declares `engines.node >= 20.0.0`)
- `@0gfoundation/0g-compute-ts-sdk` installed (ships a `0g-compute-cli` binary)
- Testnet wallet with 0G tokens
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

- Use testnet (fine-tuning not yet on mainnet)
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
- Use mainnet for fine-tuning (not yet supported)
- Hardcode private keys
- Use ethers v5 syntax

## Task Status Lifecycle

```
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
# Official testnet provider: 0xf07240Efa67755B5311bc75784a061eDB47165Dd
```

### 2. List Available Models

```bash
0g-compute-cli fine-tuning list-models
# Available: distilbert-base-uncased (Text Classification)
```

### 3. Upload Dataset

```bash
0g-compute-cli fine-tuning upload --data-path ./my_dataset.json
# Output: Root hash: 0xabc123...
```

### 4. Calculate Size

```bash
0g-compute-cli fine-tuning calculate-token \
  --model distilbert-base-uncased \
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
  --model distilbert-base-uncased \
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
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function checkFineTuningAccount(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Transfer funds for fine-tuning
  await broker.ledger.transferFund(providerAddress, 'fine-tuning', ethers.parseEther('1'));

  // IMPORTANT: fineTuning.getAccountWithDetail() resolves to an OBJECT
  //   { account, refunds }
  // It is NOT a tuple. Array-destructuring it throws "is not iterable".
  // (The *inference* broker's method of the same name DOES return a tuple —
  // the two are not interchangeable.)
  const { account, refunds } = await broker.fineTuning.getAccountWithDetail(providerAddress);

  console.log(`Fine-tuning balance: ${ethers.formatEther(account.balance)} 0G`);
  console.log(`Pending refund:      ${ethers.formatEther(account.pendingRefund)} 0G`);
  console.log(`Acknowledged:        ${account.acknowledged}`);
  console.log(`Pending refunds:     ${refunds.length}`);
}
```

> `account` is a hybrid tuple/object whose positional layout is
> `[user, provider, nonce, balance, pendingRefund, refunds, additionalInfo, deliverables, ...]` —
> note `balance` is at index **3**, not 2. Use named access.

## Deploying the Result as a LoRA Adapter

Training produces an adapter, not a standalone model. To actually use it, deploy it onto an
inference provider's GPU and then chat against it. These calls live on `broker.inference`, not
`broker.fineTuning`.

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function deployAndChat(providerAddress: string, taskId: string, baseModel: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // The broker may name the adapter differently from your local convention,
  // so resolve the real name from the task id before deploying.
  const adapterName = await broker.inference.resolveAdapterName(providerAddress, taskId, baseModel);

  // Deploy and wait for it to become active
  const deployment = await broker.inference.deployAdapter(providerAddress, baseModel, taskId, {
    wait: true,
    timeoutSeconds: 600,
    onProgress: (state) => console.log(`  adapter state: ${state}`),
  });
  console.log('deploy response:', deployment);

  // Confirm status before sending traffic
  const status = await broker.inference.getAdapterStatus(providerAddress, adapterName);
  console.log('adapter status:', status);

  // Chat against the fine-tuned adapter
  const reply = await broker.inference.chatWithFineTunedModel(
    providerAddress,
    adapterName,
    'Summarise what you were fine-tuned to do.',
  );
  console.log('reply:', reply);

  return reply;
}
```

List what is already deployed on a provider:

```typescript
async function listAdapters(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const adapters = await broker.inference.listAdapters(providerAddress);
  for (const a of adapters) console.log(a);
  return adapters;
}
```

If you already know the adapter's exact name, skip task/model resolution entirely with
`deployAdapterByName(providerAddress, adapterName, options)`.

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
