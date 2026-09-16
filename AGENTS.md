# 0G Agent Skills — Orchestration Guide

Master orchestration file for AI coding assistants. Defines activation triggers, workflow sequences,
critical rules, and common mistakes for all 17 skills across 4 categories.

> **SDK rename (breaking).** `@0glabs/0g-ts-sdk` and `@0glabs/0g-serving-broker` are deprecated on
> npm. Use `@0gfoundation/0g-storage-ts-sdk` (^1.2.12) and `@0gfoundation/0g-compute-ts-sdk`
> (^0.9.0), and pin `ethers` to exactly `6.13.1`.

## Skill Index

### Storage Skills

| Skill               | Path                                          | Triggers                                                              |
| ------------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| Upload File         | `skills/storage/upload-file/SKILL.md`         | "upload file", "store on 0G", "ZgFile", "save to storage"             |
| Download File       | `skills/storage/download-file/SKILL.md`       | "download file", "retrieve from 0G", "get file", "fetch from storage" |
| Merkle Verification | `skills/storage/merkle-verification/SKILL.md` | "verify file", "merkle proof", "data integrity", "root hash"          |

### Compute Skills

| Skill              | Path                                         | Triggers                                                         |
| ------------------ | -------------------------------------------- | ---------------------------------------------------------------- |
| Provider Discovery | `skills/compute/provider-discovery/SKILL.md` | "list providers", "find provider", "verify provider", "TEE"      |
| Account Management | `skills/compute/account-management/SKILL.md` | "deposit", "transfer funds", "refund", "check balance"           |
| Streaming Chat     | `skills/compute/streaming-chat/SKILL.md`     | "chatbot", "inference", "LLM", "GLM", "Claude", "GPT", "AI chat" |
| Text to Image      | `skills/compute/text-to-image/SKILL.md`      | "generate image", "text-to-image", "create image"                |
| Image Editing      | `skills/compute/image-editing/SKILL.md`      | "edit image", "image-editing", "inpaint", "modify image"         |
| Video Generation   | `skills/compute/video-generation/SKILL.md`   | "generate video", "text-to-video", "MiniMax", "Seedance"         |
| Embeddings         | `skills/compute/embeddings/SKILL.md`         | "embedding", "vector", "semantic search", "RAG"                  |
| Speech to Text     | `skills/compute/speech-to-text/SKILL.md`     | "transcribe", "speech-to-text", "Whisper", "audio transcription" |
| Fine-Tuning        | `skills/compute/fine-tuning/SKILL.md`        | "fine-tune", "train model", "LoRA", "adapter", "custom model"    |

### Chain Skills

| Skill             | Path                                      | Triggers                                                       |
| ----------------- | ----------------------------------------- | -------------------------------------------------------------- |
| Scaffold Project  | `skills/chain/scaffold-project/SKILL.md`  | "new project", "scaffold", "initialize", "create 0G app"       |
| Deploy Contract   | `skills/chain/deploy-contract/SKILL.md`   | "deploy contract", "Solidity", "0G Chain"                      |
| Interact Contract | `skills/chain/interact-contract/SKILL.md` | "call contract", "read contract", "interact", "write contract" |

### Cross-Layer Skills

| Skill             | Path                                               | Triggers                                               |
| ----------------- | -------------------------------------------------- | ------------------------------------------------------ |
| Storage + Chain   | `skills/cross-layer/storage-plus-chain/SKILL.md`   | "on-chain reference", "NFT metadata on 0G", "registry" |
| Compute + Storage | `skills/cross-layer/compute-plus-storage/SKILL.md` | "AI with storage", "generate and store", "AI pipeline" |

---

## Workflow Sequences

### 1. Create New Project

**Trigger**: "new project", "scaffold", "initialize", "setup", "create app"

```
scaffold-project
```

Load `skills/chain/scaffold-project/SKILL.md` and follow project type selection.

### 2. Upload / Store Data

**Trigger**: "upload", "store", "save to 0G"

```
upload-file → AUTO: merkle-verification
```

1. Use `upload-file` for all data storage
2. After successful upload, automatically verify using `merkle-verification`
3. Return root hash to user

### 3. Download / Retrieve Data

**Trigger**: "download", "retrieve", "get file", "fetch"

```
download-file → AUTO: merkle-verification
```

1. Use `download-file` to retrieve data by root hash
2. Use verified download (third param = `true`)
3. Optionally verify with `merkle-verification`

### 4. Run AI Inference

**Trigger**: "chatbot", "inference", "generate image", "transcribe"

```
AUTO: provider-discovery → AUTO: account-management → streaming-chat | text-to-image | speech-to-text
```

1. **Auto-activate** `provider-discovery` — find appropriate provider for service type
2. **Auto-activate** `account-management` — verify balance, fund if needed
3. Run the specific inference skill based on request:
   - Chat/LLM → `streaming-chat` (`serviceType: chatbot`)
   - Image from a prompt → `text-to-image` (`serviceType: text-to-image`)
   - Edit an existing image → `image-editing` (`serviceType: image-editing`)
   - Video → `video-generation` (`serviceType: video-generation`)
   - Embeddings / semantic search / RAG → `embeddings` (`serviceType: embedding`)
   - Audio → `speech-to-text` (`serviceType: speech-to-text`)

### 5. Fine-Tune Model

**Trigger**: "fine-tune", "train model", "custom model"

```
AUTO: provider-discovery → AUTO: account-management → fine-tuning
```

1. **Auto-activate** `provider-discovery` — find fine-tuning providers
2. **Auto-activate** `account-management` — fund fine-tuning sub-account
3. Run `fine-tuning` workflow (testnet only)

### 6. Deploy Contract

**Trigger**: "deploy contract", "Solidity", "smart contract"

```
deploy-contract
```

Load `skills/chain/deploy-contract/SKILL.md`. Ensure `evmVersion: "cancun"`.

### 7. Cross-Layer Application

**Trigger**: "on-chain reference", "AI with storage", "NFT metadata", "full pipeline"

```
storage-plus-chain | compute-plus-storage
```

1. Determine if pattern is storage+chain or compute+storage
2. Load appropriate cross-layer skill
3. Follow multi-step workflow in skill

### 8. Manage Funds

**Trigger**: "deposit", "transfer", "refund", "balance", "withdraw"

```
account-management
```

Load `skills/compute/account-management/SKILL.md`.

---

## Critical ALWAYS Rules

These rules must be followed in EVERY interaction. Violations cause bugs, data loss, or financial
errors.

### Compute — processResponse()

```
ALWAYS call processResponse() after EVERY inference request.
ALWAYS use correct parameter order: processResponse(providerAddress, chatID, usageData)
ALWAYS extract ChatID from ZG-Res-Key header FIRST, body (data.id) as fallback (chatbot only).
```

Param order reminder:

```typescript
await broker.inference.processResponse(
  providerAddress, // 1st: provider address
  chatID, // 2nd: response identifier
  usageData, // 3rd: JSON-stringified usage (optional for images)
);
```

### Compute — Provider Setup

```
ALWAYS call checkProviderSignerStatus(provider) BEFORE acknowledged(provider).
  acknowledged() reverts with AccountNotExists when no sub-account exists yet.
ALWAYS acknowledge provider before first use (acknowledgeProviderSigner).
ALWAYS fund provider sub-accounts with at least 1 0G.
ALWAYS check availableBalance (NOT totalBalance) before making inference requests.
ALWAYS verify TEE status for security-sensitive workloads (s.teeSignerAcknowledged).
```

### Compute — Listing Services

```
ALWAYS page listService() in chunks of <= 50 — the contract reverts with LimitTooLarge above 50.
ALWAYS pass includeUnacknowledged explicitly when you need the full picture; it defaults to false.
ALWAYS use getProviderModels(provider) to enumerate a multi-model provider's catalog;
  the on-chain `model` field is only that provider's DEFAULT model.
ALWAYS pass the model id to getServiceMetadata(provider, model) when targeting a
  specific model on a multi-model provider.
```

### Storage — File Handles

```
ALWAYS generate Merkle tree BEFORE uploading.
ALWAYS close file handles after operations (file.close()).
ALWAYS use try/finally to ensure handles are closed.
ALWAYS store root hashes — they are the ONLY way to retrieve files.
```

### Chain — Compilation

```
PREFER evmVersion: "cancun" for 0G Chain contract compilation — it is supported on both
  mainnet and testnet and produces the smallest bytecode (it can emit MCOPY).
  This is a gas optimisation, NOT a compatibility requirement: shanghai, paris and
  london compile, deploy and execute correctly on 0G Chain as well.
ALWAYS use ethers v6 syntax (NOT v5).
ALWAYS wait for transaction confirmation (tx.wait()).
```

### Security

```
ALWAYS load private keys from .env files.
ALWAYS add .env to .gitignore.
ALWAYS use verified downloads in production (third param = true).
```

---

## Critical NEVER Rules

### Compute

```
NEVER skip processResponse() — causes fee settlement failure and potential fund lock.
NEVER reverse processResponse() parameter order.
NEVER skip provider acknowledgment — requests will fail.
NEVER call acknowledged() before the provider sub-account exists — it reverts.
NEVER call listService() with limit > 50 — the contract reverts with LimitTooLarge.
NEVER treat getLedger()[2] as availableBalance — index 2 is totalBalance.
NEVER assume a provider serves exactly one model — check getProviderModels().
NEVER use ethers v5 syntax (ethers.providers, ethers.utils, BigNumber).
NEVER install @0glabs/0g-ts-sdk or @0glabs/0g-serving-broker — both are deprecated.
```

### Storage

```
NEVER forget to close ZgFile handles — causes memory leaks.
NEVER lose root hashes — data becomes irretrievable.
NEVER upload without generating Merkle tree first.
```

### Chain

```
NEVER use ethers v5 patterns — they won't work with v6.
NEVER pin ethers with a caret range (^6.13.0) — the storage SDK requires EXACTLY 6.13.1.
```

### Security

```
NEVER hardcode private keys in source code.
NEVER commit .env files to version control.
NEVER use unverified downloads for production data.
```

---

## Common Mistakes & Fixes

### #1: Missing processResponse()

**Symptom**: Funds locked, fee settlement fails

```typescript
// WRONG
const data = await response.json();
return data.choices[0].message.content;

// RIGHT
const data = await response.json();
let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
if (!chatID) chatID = data.id;
await broker.inference.processResponse(providerAddress, chatID, JSON.stringify(data.usage));
return data.choices[0].message.content;
```

### #2: Wrong processResponse() Parameter Order

**Symptom**: Fee verification fails silently

```typescript
// WRONG
await broker.inference.processResponse(chatID, providerAddress, usage);

// RIGHT — providerAddress FIRST
await broker.inference.processResponse(providerAddress, chatID, usage);
```

### #3: ChatID from Wrong Source

**Symptom**: Verification mismatch

```typescript
// WRONG — using body without checking header
const chatID = data.id;

// RIGHT — header first, body fallback (chatbot only)
let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
if (!chatID) chatID = data.id; // Fallback for chatbot only
```

### #4: Not pinning evmVersion

**Symptom**: larger bytecode and higher deploy gas than necessary

0G Chain supports Cancun, so targeting it lets solc emit `MCOPY` for memory copies. Measured on the
same contract: `cancun` → 1437 bytes, `paris` → 1527 bytes. Older targets are **not** broken — they
deploy and run correctly — so this is an optimisation, not a compatibility fix.

```typescript
// SUBOPTIMAL — solc default target may be older than the chain supports
solidity: { version: "0.8.24" }

// BETTER — smallest bytecode on 0G Chain
solidity: {
  version: "0.8.24",
  settings: { evmVersion: "cancun" }
}
```

### #5: ethers v5 Syntax

**Symptom**: Import errors, undefined methods

```typescript
// WRONG (v5)
const provider = new ethers.providers.JsonRpcProvider(url);
const amount = ethers.utils.parseEther('1');

// RIGHT (v6)
const provider = new ethers.JsonRpcProvider(url);
const amount = ethers.parseEther('1');
```

### #6: Unclosed File Handles

**Symptom**: Memory leaks, file locks

```typescript
// WRONG
const file = await ZgFile.fromFilePath(path);
const [tree] = await file.merkleTree();
await indexer.upload(file, process.env.RPC_URL!, wallet);
// file.close() never called!

// RIGHT
const file = await ZgFile.fromFilePath(path);
try {
  const [tree, err] = await file.merkleTree();
  if (err) throw err;
  const [tx, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
} finally {
  await file.close();
}
```

### #7: Hardcoded Private Key

**Symptom**: Security vulnerability

```typescript
// WRONG
const wallet = new ethers.Wallet('0xabc123...', provider);

// RIGHT
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
```

### #8: Reading the Wrong Ledger Balance

**Symptom**: top-ups get skipped, then inference fails mid-run with an insufficient-balance error

`getLedger()` returns `[user, availableBalance, totalBalance, additionalInfo]`. Index 1 is
**available**, index 2 is **total**. Reading index 2 as "available" over-reports spendable funds by
whatever is already locked in provider sub-accounts.

```typescript
// WRONG — this is totalBalance, which includes locked sub-account funds
const available = parseFloat(ethers.formatEther(account[2]));

// RIGHT — named access removes all doubt
const led = await broker.ledger.getLedger();
const available = parseFloat(ethers.formatEther(led.availableBalance));
```

### #9: Unpaginated listService()

**Symptom**: providers silently missing from discovery; `LimitTooLarge` revert if you raise the
limit

```typescript
// WRONG — returns only the first 50, and hides unacknowledged providers
const services = await broker.inference.listService();

// WRONG — the contract reverts: LimitTooLarge(500, 50)
const services = await broker.inference.listService(0, 500, true);

// RIGHT — page in chunks of <= 50
const services = [];
for (let offset = 0; ; offset += 50) {
  const page = await broker.inference.listService(offset, 50, true);
  services.push(...page);
  if (page.length < 50) break;
}
```

### #10: Destructuring fineTuning.getAccountWithDetail()

**Symptom**: `TypeError: ... is not iterable` at runtime

The **inference** broker's `getAccountWithDetail()` returns a tuple, but the **fine-tuning**
broker's returns an object. They are not interchangeable.

```typescript
// WRONG — fineTuning returns an object, not a tuple
const [account, refunds] = await broker.fineTuning.getAccountWithDetail(providerAddress);

// RIGHT
const { account, refunds } = await broker.fineTuning.getAccountWithDetail(providerAddress);
console.log(`Balance: ${ethers.formatEther(account.balance)} 0G`);
```

### #11: Calling acknowledged() Before a Sub-Account Exists

**Symptom**: `AccountNotExists` revert on a provider's very first use

```typescript
// WRONG — reverts when the user has never funded this provider
if (!(await broker.inference.acknowledged(providerAddress))) {
  await broker.inference.acknowledgeProviderSigner(providerAddress);
}

// RIGHT — checkProviderSignerStatus works before the sub-account exists
const status = await broker.inference.checkProviderSignerStatus(providerAddress);
if (!status.isAcknowledged) {
  await broker.inference.acknowledgeProviderSigner(providerAddress);
}
```

### #12: Assuming One Model Per Provider

**Symptom**: you can only reach a provider's default model; its other models look unavailable

```typescript
// INCOMPLETE — s.model is only the provider's on-chain DEFAULT
const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);

// RIGHT — enumerate, then select
const { multiModel, models } = await broker.inference.getProviderModels(providerAddress);
const target = models.find((m) => m.id === 'openai/gpt-5.4')?.id;
const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress, target);
```

---

## Pattern Documents

For deep architectural context, reference these pattern documents:

| Pattern        | Path                         | When to Reference                   |
| -------------- | ---------------------------- | ----------------------------------- |
| Network Config | `patterns/NETWORK_CONFIG.md` | Setting up any 0G connection        |
| Storage        | `patterns/STORAGE.md`        | Any storage operation               |
| Compute        | `patterns/COMPUTE.md`        | Any compute/inference operation     |
| Chain          | `patterns/CHAIN.md`          | Any smart contract operation        |
| Security       | `patterns/SECURITY.md`       | Key management, TEE, data integrity |
| Testing        | `patterns/TESTING.md`        | Writing tests for 0G apps           |

---

## SDK Quick Reference

| SDK             | Import                                                                            | Version |
| --------------- | --------------------------------------------------------------------------------- | ------- |
| Storage         | `import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk'`               | ^1.2.12 |
| Compute         | `import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk'`  | ^0.9.0  |
| Compute (no-op) | `import { createReadOnlyInferenceBroker } from '@0gfoundation/0g-compute-ts-sdk'` | ^0.9.0  |
| Chain           | `import { ethers } from 'ethers'`                                                 | 6.13.1  |

`createReadOnlyInferenceBroker(rpcUrl)` needs no wallet and no signing — use it for provider and
model discovery before a user connects a wallet.

## Live Service Types

Verified against 0G mainnet. Use these `serviceType` values when filtering `listService()`:

| `serviceType`      | Skill                                      |
| ------------------ | ------------------------------------------ |
| `chatbot`          | `skills/compute/streaming-chat/SKILL.md`   |
| `text-to-image`    | `skills/compute/text-to-image/SKILL.md`    |
| `image-editing`    | `skills/compute/image-editing/SKILL.md`    |
| `video-generation` | `skills/compute/video-generation/SKILL.md` |
| `embedding`        | `skills/compute/embeddings/SKILL.md`       |
| `speech-to-text`   | `skills/compute/speech-to-text/SKILL.md`   |

Model ids change frequently. NEVER hardcode a model name from documentation — discover it at runtime
via `listService()` and `getProviderModels()`.
