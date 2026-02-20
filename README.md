# 0G Agent Skills

**Give your AI coding assistant superpowers for building on 0G.**

This repo turns Claude Code, Cursor, and GitHub Copilot into expert 0G developers. Just say _"upload
a file to 0G Storage"_ or _"build a chatbot on 0G Compute"_ and get correct, working TypeScript code
— every time.

**14 skills. 6 architecture references. 3 IDE setups. Zero build step.**

---

## Quick Start

### 1. Clone into your project

```bash
git clone https://github.com/0gfoundation/0g-agent-skills .0g-skills
```

### 2. Connect your IDE

| IDE             | How                                                                                    |
| --------------- | -------------------------------------------------------------------------------------- |
| **Claude Code** | `cp .0g-skills/CLAUDE.md ./CLAUDE.md` — auto-detected on next session                  |
| **Cursor**      | Create `.cursorrules` — see [setup guide](setups/cursor/README.md)                     |
| **Copilot**     | Create `.github/copilot-instructions.md` — see [setup guide](setups/copilot/README.md) |

### 3. Install SDKs

```bash
# Everything
npm install @0glabs/0g-ts-sdk @0glabs/0g-serving-broker ethers dotenv

# Or just what you need
npm install @0glabs/0g-ts-sdk ethers dotenv          # Storage only
npm install @0glabs/0g-serving-broker ethers dotenv   # Compute only
```

### 4. Create `.env`

```bash
# .env — NEVER commit this file
PRIVATE_KEY=your_private_key_here
RPC_URL=https://evmrpc-testnet.0g.ai
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai
PROVIDER_ADDRESS=your_compute_provider_address
```

### 5. Start building

Ask your AI assistant anything. Try these:

```
"Upload a file to 0G Storage"
"Build a streaming chatbot with 0G Compute"
"Deploy a Solidity contract to 0G Chain"
"Generate an image with AI and store it on 0G"
"Create an NFT with metadata stored on 0G Storage"
```

---

## Skills Catalog

### Storage — Decentralized file and data storage

| Skill                                                              | What it does                                                                           | Say this to activate        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------- |
| [Upload File](skills/storage/upload-file/SKILL.md)                 | Upload files via ZgFile API + Merkle tree chunking. Returns a root hash for retrieval. | _"upload a file to 0G"_     |
| [Download File](skills/storage/download-file/SKILL.md)             | Download and verify files by root hash with Merkle proof validation.                   | _"download a file from 0G"_ |
| [Merkle Verification](skills/storage/merkle-verification/SKILL.md) | Compute root hashes and cryptographically verify file integrity.                       | _"verify file integrity"_   |

### Compute — AI inference on decentralized GPUs

| Skill                                                            | What it does                                                                                       | Say this to activate          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------- |
| [Streaming Chat](skills/compute/streaming-chat/SKILL.md)         | Conversational AI with DeepSeek V3.1, Qwen, Gemma, GPT-OSS. Streaming + non-streaming.             | _"build a chatbot with 0G"_   |
| [Text to Image](skills/compute/text-to-image/SKILL.md)           | Generate images from text prompts using Flux Turbo. Multiple resolutions, batch support.           | _"generate an image with 0G"_ |
| [Speech to Text](skills/compute/speech-to-text/SKILL.md)         | Transcribe audio with Whisper Large V3. Outputs JSON, plain text, or SRT subtitles.                | _"transcribe audio with 0G"_  |
| [Provider Discovery](skills/compute/provider-discovery/SKILL.md) | List providers, check TEE verification, acknowledge before first use.                              | _"find a compute provider"_   |
| [Account Management](skills/compute/account-management/SKILL.md) | Deposit, transfer, refund, and withdraw across the dual-account system.                            | _"deposit funds for compute"_ |
| [Fine-Tuning](skills/compute/fine-tuning/SKILL.md)               | Train custom models on distributed GPUs. Upload data, monitor, download results. **Testnet only.** | _"fine-tune a model on 0G"_   |

### Chain — Smart contracts on 0G's EVM L1

| Skill                                                        | What it does                                                                                   | Say this to activate            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------- |
| [Deploy Contract](skills/chain/deploy-contract/SKILL.md)     | Deploy Solidity contracts via Hardhat, Foundry, or ethers v6. Requires `evmVersion: "cancun"`. | _"deploy a contract to 0G"_     |
| [Interact Contract](skills/chain/interact-contract/SKILL.md) | Read state, send transactions, listen to events, estimate gas — all ethers v6.                 | _"call a contract on 0G Chain"_ |
| [Scaffold Project](skills/chain/scaffold-project/SKILL.md)   | Generate a new project with correct SDKs, TypeScript config, and boilerplate.                  | _"create a new 0G project"_     |

### Cross-Layer — Full-stack decentralized apps

| Skill                                                                 | What it does                                                                                        | Say this to activate                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [Storage + Chain](skills/cross-layer/storage-plus-chain/SKILL.md)     | On-chain smart contract references to off-chain storage. NFT metadata, registries, verifiable docs. | _"store NFT metadata on 0G"_             |
| [Compute + Storage](skills/cross-layer/compute-plus-storage/SKILL.md) | AI inference pipelines with persistent storage. Generate-then-store, load-then-process.             | _"generate an image and store it on 0G"_ |

---

## Examples

Runnable example projects — clone, install, and run against testnet:

| Example                                            | What it builds                                      | Layers            |
| -------------------------------------------------- | --------------------------------------------------- | ----------------- |
| [`file-vault`](examples/file-vault/)               | Upload, download, and verify files                  | Storage           |
| [`ai-chatbot`](examples/ai-chatbot/)               | Discover providers, fund account, chat              | Compute           |
| [`nft-with-metadata`](examples/nft-with-metadata/) | Deploy contract, upload metadata, register on-chain | Storage + Chain   |
| [`ai-image-gallery`](examples/ai-image-gallery/)   | Generate images with AI, store on 0G                | Compute + Storage |

```bash
cd examples/file-vault
npm install
cp .env.example .env
# Add your funded private key, then:
npx tsx src/upload.ts README.md
```

---

## How It Works

When you ask your AI assistant to build something on 0G, it follows an automated workflow:

```
You say: "Build a chatbot on 0G Compute"
                    |
        AGENTS.md matches triggers
                    |
    +---------------+----------------+
    |               |                |
Provider       Account          Streaming
Discovery    Management           Chat
 (auto)        (auto)           (primary)
    |               |                |
    +---------------+----------------+
                    |
          Working TypeScript code
        with correct SDK patterns
```

**8 built-in workflows** handle common tasks automatically:

| Workflow            | What gets activated                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| **New Project**     | `scaffold-project`                                                                                        |
| **Upload Data**     | `upload-file` → auto: `merkle-verification`                                                               |
| **Download Data**   | `download-file` → auto: `merkle-verification`                                                             |
| **AI Inference**    | auto: `provider-discovery` → `account-management` → `streaming-chat` / `text-to-image` / `speech-to-text` |
| **Fine-Tune**       | auto: `provider-discovery` → `account-management` → `fine-tuning`                                         |
| **Deploy Contract** | `deploy-contract`                                                                                         |
| **Cross-Layer App** | `storage-plus-chain` / `compute-plus-storage`                                                             |
| **Manage Funds**    | `account-management`                                                                                      |

---

## Architecture References

Deep-dive documents for when you need to understand _how_ things work:

| Document                                        | What's inside                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [NETWORK_CONFIG.md](patterns/NETWORK_CONFIG.md) | RPC endpoints, chain IDs, SDK versions, `.env` template, initialization patterns             |
| [STORAGE.md](patterns/STORAGE.md)               | Two-layer architecture (Log + KV), ZgFile lifecycle, upload/download internals, indexer API  |
| [COMPUTE.md](patterns/COMPUTE.md)               | Broker lifecycle, `processResponse()` deep-dive, ChatID extraction rules, streaming patterns |
| [CHAIN.md](patterns/CHAIN.md)                   | Hardhat/Foundry configs, `evmVersion: "cancun"`, ethers v5 → v6 migration table              |
| [SECURITY.md](patterns/SECURITY.md)             | Key management, `.env` best practices, TEE verification, contract access control             |
| [TESTING.md](patterns/TESTING.md)               | Vitest mocks for all SDKs, Hardhat/Foundry contract tests, testnet integration testing       |

---

## Networks

| Network             | RPC Endpoint                   | Chain ID | Explorer                          |
| ------------------- | ------------------------------ | -------- | --------------------------------- |
| Testnet (Galileo)   | `https://evmrpc-testnet.0g.ai` | 16602    | `https://chainscan-galileo.0g.ai` |
| Mainnet (Aristotle) | `https://evmrpc.0g.ai`         | 16661    | `https://chainscan.0g.ai`         |

**Faucet (testnet):** [https://faucet.0g.ai](https://faucet.0g.ai)

---

## SDKs

| Package                                                                                | Version | Layer                      |
| -------------------------------------------------------------------------------------- | ------- | -------------------------- |
| [`@0glabs/0g-ts-sdk`](https://www.npmjs.com/package/@0glabs/0g-ts-sdk)                 | ^0.3.3  | Storage                    |
| [`@0glabs/0g-serving-broker`](https://www.npmjs.com/package/@0glabs/0g-serving-broker) | ^0.6.5  | Compute                    |
| [`ethers`](https://docs.ethers.org/v6/)                                                | ^6.13.0 | Chain (v6 only — never v5) |

---

## Repository Structure

```
agent-skills-0g/
├── CLAUDE.md                        # Auto-loader for Claude Code
├── AGENTS.md                        # Orchestration: triggers, workflows, rules
│
├── skills/
│   ├── storage/                     # 3 skills
│   │   ├── upload-file/SKILL.md
│   │   ├── download-file/SKILL.md
│   │   └── merkle-verification/SKILL.md
│   ├── compute/                     # 6 skills
│   │   ├── streaming-chat/SKILL.md
│   │   ├── text-to-image/SKILL.md
│   │   ├── speech-to-text/SKILL.md
│   │   ├── provider-discovery/SKILL.md
│   │   ├── account-management/SKILL.md
│   │   └── fine-tuning/SKILL.md
│   ├── chain/                       # 3 skills
│   │   ├── deploy-contract/SKILL.md
│   │   ├── interact-contract/SKILL.md
│   │   └── scaffold-project/SKILL.md
│   └── cross-layer/                 # 2 skills
│       ├── storage-plus-chain/SKILL.md
│       └── compute-plus-storage/SKILL.md
│
├── examples/                        # 4 runnable example projects
│   ├── file-vault/                  # Storage: upload, download, verify
│   ├── ai-chatbot/                  # Compute: discover, fund, chat
│   ├── nft-with-metadata/           # Cross-layer: contract + storage
│   └── ai-image-gallery/            # Cross-layer: AI + storage
│
├── patterns/                        # 6 architecture references
│   ├── NETWORK_CONFIG.md
│   ├── STORAGE.md
│   ├── COMPUTE.md
│   ├── CHAIN.md
│   ├── SECURITY.md
│   └── TESTING.md
│
├── ci/                              # CI scripts
│   ├── extract-code-blocks.ts
│   ├── validate-sdk-versions.ts
│   └── lint-critical-rules.ts
│
├── setups/                          # IDE-specific guides
│   ├── claude-code/README.md
│   ├── cursor/README.md
│   └── copilot/README.md
│
├── INSTALL.md                       # Detailed installation guide
└── CONTRIBUTING.md                  # How to add new skills
```

---

## Contributing

Want to add a skill or improve an existing one? See [CONTRIBUTING.md](CONTRIBUTING.md).

Every skill follows a consistent template: Metadata, Purpose, Prerequisites, Quick Workflow, Core
Rules, Code Examples, Anti-Patterns, Common Errors, Related Skills, and References.

---

## Links

- [0G Documentation](https://docs.0g.ai)
- [0G Storage SDK](https://docs.0g.ai/build-with-0g/storage-network/sdk)
- [0G Compute SDK](https://docs.0g.ai/build-with-0g/compute-network/sdk)
- [0G Chain](https://docs.0g.ai/build-with-0g/0g-chain)
- [Testnet Faucet](https://faucet.0g.ai)
- [Discord](https://discord.gg/0glabs)

## License

MIT — see [LICENSE](LICENSE)
