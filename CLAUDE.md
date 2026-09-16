# 0G Agent Skills

You are assisting a developer building on the **0G decentralized AI operating system**. This
repository contains 17 agent skills across 4 categories: Storage, Compute, Chain, and Cross-Layer.

> **SDK packages were renamed.** The old `@0glabs/0g-ts-sdk` and `@0glabs/0g-serving-broker` are
> deprecated on npm. Always use `@0gfoundation/0g-storage-ts-sdk` and
> `@0gfoundation/0g-compute-ts-sdk`.

## How to Use

1. Read `AGENTS.md` for orchestration rules, activation triggers, and workflow sequences
2. Load the relevant `SKILL.md` file based on what the developer is building
3. Reference `patterns/*.md` for deep architectural context
4. Follow ALL ALWAYS/NEVER rules — they prevent common bugs

## Critical Rules (Memorize These)

- **SDK packages**: `@0gfoundation/0g-storage-ts-sdk` (storage) and
  `@0gfoundation/0g-compute-ts-sdk` (compute). The `@0glabs/*` packages are deprecated — NEVER use
  them
- **ethers pin**: use EXACTLY `6.13.1`. The storage SDK declares an exact peer dependency on
  `ethers@6.13.1`; a range like `^6.13.0` resolves to 6.17.x and fails install with `ERESOLVE`
- **processResponse()**: Call after EVERY compute inference. Param order:
  `(providerAddress, chatID, usageData)`
- **ChatID**: Extract from `ZG-Res-Key` header FIRST, `data.id` as fallback. These genuinely differ
  — the header is a bare UUID, `data.id` is prefixed (`chatcmpl-<uuid>`). Passing `data.id` when the
  header exists sends the WRONG id to `processResponse()`
- **ethers**: ALWAYS v6 (`ethers.JsonRpcProvider`, `ethers.parseEther`). NEVER v5
- **File handles**: ALWAYS close `ZgFile` with `file.close()` in a `finally` block
- **Private keys**: ALWAYS from `.env`, NEVER hardcoded
- **Upload signature**: `indexer.upload(file, rpcUrl, signer)` — returns `[result, error]`, where
  `result` is an OBJECT (not a tx-hash string) and is a UNION of `{ txHash, rootHash, txSeq }` for a
  single file and `{ txHashes, rootHashes, txSeqs }` for a fragmented one. Narrow it:
  `'txHash' in result ? result.txHash : result.txHashes[0]`. It already carries the root hash, so
  you need not re-derive it from the Merkle tree
- **TypeScript config**: use `moduleResolution: "bundler"`. Under `Node16`/`NodeNext` the storage
  SDK's `types/` resolve `ethers` as CJS while an ESM app resolves it as ESM, and every
  `Wallet`→`Signer` argument fails with `TS2345` (the dual-package hazard). `bundler` resolves this
  without any `as any` casts, even with `strict: true`
- **Download behavior**: `indexer.download()` can THROW in addition to returning errors — always
  wrap in try/catch
- **listService() is paginated**: signature is
  `listService(offset = 0, limit = 50, includeUnacknowledged = false)`. The contract REVERTS with
  `LimitTooLarge` above 50, so page in chunks of ≤50. A bare `listService()` silently returns only
  the first page AND hides unacknowledged providers
- **Service fields**: `listService()` entries are hybrid tuple/objects. Prefer named access
  (`s.provider`, `s.serviceType`, `s.model`, `s.teeSignerAcknowledged`). Positional access still
  works: `s[0]`, `s[1]`, `s[6]`, `s[10]` respectively
- **Ledger fields**: `getLedger()` returns `[user, availableBalance, totalBalance, additionalInfo]`
  — so `account[1]` is **availableBalance** and `account[2]` is **totalBalance**. Prefer
  `led.availableBalance` / `led.totalBalance`. Spend decisions MUST use availableBalance;
  totalBalance includes funds already locked in provider sub-accounts
- **Provider first use**: call `checkProviderSignerStatus(provider)` BEFORE
  `acknowledged(provider)`. `acknowledged()` reverts with `AccountNotExists` when no sub-account
  exists yet
- **Sub-account minimum**: fund provider sub-accounts with at least **1 0G**. The SDK warns below
  that and providers may reject requests
- **evmVersion**: `"cancun"` is the RECOMMENDED default — it is supported on 0G mainnet and testnet
  and emits the smallest bytecode (it can use `MCOPY`). It is NOT a hard requirement; `shanghai`,
  `paris` and `london` also deploy and execute correctly on 0G Chain

## Skill Map

### Storage

- `skills/storage/upload-file/SKILL.md` — Upload files to 0G Storage
- `skills/storage/download-file/SKILL.md` — Download & verify files
- `skills/storage/merkle-verification/SKILL.md` — Data integrity verification

### Compute

- `skills/compute/provider-discovery/SKILL.md` — Find & verify providers, enumerate models
- `skills/compute/account-management/SKILL.md` — Deposits, transfers, refunds, auto-funding
- `skills/compute/streaming-chat/SKILL.md` — LLM inference (GLM, Claude, GPT, Qwen, DeepSeek, 0GM)
- `skills/compute/text-to-image/SKILL.md` — Image generation (z-image-turbo)
- `skills/compute/image-editing/SKILL.md` — Edit an existing image from a prompt
- `skills/compute/video-generation/SKILL.md` — Video generation (MiniMax-H3, Seedance)
- `skills/compute/embeddings/SKILL.md` — Text embeddings for search & RAG
- `skills/compute/speech-to-text/SKILL.md` — Audio transcription (Whisper Large V3)
- `skills/compute/fine-tuning/SKILL.md` — Model training + LoRA adapter deployment

### Chain

- `skills/chain/scaffold-project/SKILL.md` — Initialize new 0G projects
- `skills/chain/deploy-contract/SKILL.md` — Deploy Solidity contracts
- `skills/chain/interact-contract/SKILL.md` — Read/write deployed contracts

### Cross-Layer

- `skills/cross-layer/storage-plus-chain/SKILL.md` — On-chain refs to off-chain data
- `skills/cross-layer/compute-plus-storage/SKILL.md` — AI inference + storage I/O

## Pattern Documents

- `patterns/NETWORK_CONFIG.md` — Endpoints, chain IDs, SDK versions, .env template
- `patterns/STORAGE.md` — Storage architecture & SDK reference
- `patterns/COMPUTE.md` — Compute architecture & processResponse() deep-dive
- `patterns/CHAIN.md` — EVM patterns, Hardhat/Foundry configs, ethers v6
- `patterns/SECURITY.md` — Key management, TEE, data integrity
- `patterns/TESTING.md` — Testing strategies & mock patterns

## Quick Start

When a developer asks to build something on 0G:

1. Check `AGENTS.md` workflow sequences to determine which skills to activate
2. Load the primary skill's `SKILL.md`
3. Load `patterns/NETWORK_CONFIG.md` for environment setup
4. Follow the skill's Quick Workflow section
5. Apply all ALWAYS/NEVER rules from `AGENTS.md`
