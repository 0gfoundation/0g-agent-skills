# 0G Agent Skills

**Give your AI coding assistant superpowers for building on 0G.**

This repo turns Claude Code, Cursor, and GitHub Copilot into expert 0G developers. Just say _"upload
a file to 0G Storage"_ or _"build a chatbot on 0G Compute"_ and get correct, working TypeScript code
— every time.

**20 skills. 6 architecture references. 3 IDE setups. Zero build step.**

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
npm install @0gfoundation/0g-storage-ts-sdk @0gfoundation/0g-compute-ts-sdk ethers@6.13.1 dotenv

# Or just what you need
npm install @0gfoundation/0g-storage-ts-sdk ethers@6.13.1 dotenv   # Storage only
npm install @0gfoundation/0g-compute-ts-sdk ethers@6.13.1 dotenv   # Compute only
```

> **Pin `ethers` to exactly `6.13.1`.** The storage SDK declares an exact peer dependency on that
> version, so a caret range resolves to a newer ethers and `npm install` fails with `ERESOLVE`.
>
> The older `@0glabs/0g-ts-sdk` and `@0glabs/0g-serving-broker` packages are **deprecated** on npm
> and renamed to the `@0gfoundation/*` packages above.

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

| Skill                                                            | What it does                                                                                             | Say this to activate          |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------- |
| [Streaming Chat](skills/compute/streaming-chat/SKILL.md)         | Conversational AI across GLM, Claude, GPT, Qwen, DeepSeek and 0GM models, including multi-model routers. | _"build a chatbot with 0G"_   |
| [Text to Image](skills/compute/text-to-image/SKILL.md)           | Generate images from text prompts. Multiple resolutions, batch support.                                  | _"generate an image with 0G"_ |
| [Image Editing](skills/compute/image-editing/SKILL.md)           | Prompt-driven edits to an existing image.                                                                | _"edit this image with 0G"_   |
| [Video Generation](skills/compute/video-generation/SKILL.md)     | Text-to-video and image-to-video clips via an async submit/poll/download flow.                           | _"generate a video with 0G"_  |
| [Embeddings](skills/compute/embeddings/SKILL.md)                 | Dense vectors for semantic search, clustering and RAG.                                                   | _"embed text with 0G"_        |
| [Speech to Text](skills/compute/speech-to-text/SKILL.md)         | Transcribe audio with Whisper Large V3. Outputs JSON, plain text, or SRT subtitles.                      | _"transcribe audio with 0G"_  |
| [Provider Discovery](skills/compute/provider-discovery/SKILL.md) | List providers and their full model catalogs, check TEE verification and live health metrics.            | _"find a compute provider"_   |
| [Account Management](skills/compute/account-management/SKILL.md) | Deposit, transfer, refund, withdraw, auto-fund, and revoke API keys.                                     | _"deposit funds for compute"_ |
| [Fine-Tuning](skills/compute/fine-tuning/SKILL.md)               | Train custom models on distributed GPUs, then deploy the result as a LoRA adapter.                       | _"fine-tune a model on 0G"_   |

### Chain — Smart contracts on 0G's EVM L1

| Skill                                                        | What it does                                                                                  | Say this to activate            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------- |
| [Deploy Contract](skills/chain/deploy-contract/SKILL.md)     | Deploy Solidity contracts via Hardhat, Foundry, or ethers v6. Prefers `evmVersion: "cancun"`. | _"deploy a contract to 0G"_     |
| [Interact Contract](skills/chain/interact-contract/SKILL.md) | Read state, send transactions, listen to events, estimate gas — all ethers v6.                | _"call a contract on 0G Chain"_ |
| [Scaffold Project](skills/chain/scaffold-project/SKILL.md)   | Generate a new project with correct SDKs, TypeScript config, and boilerplate.                 | _"create a new 0G project"_     |

### Cross-Layer — Full-stack decentralized apps

| Skill                                                                 | What it does                                                                                        | Say this to activate                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [Storage + Chain](skills/cross-layer/storage-plus-chain/SKILL.md)     | On-chain smart contract references to off-chain storage. NFT metadata, registries, verifiable docs. | _"store NFT metadata on 0G"_             |
| [Compute + Storage](skills/cross-layer/compute-plus-storage/SKILL.md) | AI inference pipelines with persistent storage. Generate-then-store, load-then-process.             | _"generate an image and store it on 0G"_ |

### Private Computer — Run Claude Code itself on 0G

Everything above is about building _on_ 0G. These three are the other direction: they point Claude
Code's own model backend at [0G Private Computer](https://pc.0g.ai) — TEE-backed inference through
an Anthropic-compatible router. They need no Compute SDK, no wallet and no `.env`, and they are
**Claude Code only**: they configure a project's `.claude/` directory, which Cursor and Copilot do
not read.

| Skill                                                               | What it does                                                                                                                | Say this to activate       |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| [Setup](skills/private-computer/0g-pc-setup/SKILL.md)               | Ask the router which models it serves right now, choose one on its TEE tier and context, and put the current project on it. | _"put this project on 0G"_ |
| [Switch Model](skills/private-computer/0g-pc-switch-model/SKILL.md) | Move a project already on 0G to a different router model, context ceiling included.                                         | _"switch 0G model"_        |
| [Uninstall](skills/private-computer/0g-pc-uninstall/SKILL.md)       | Take the project back off 0G and onto the normal Anthropic API.                                                             | _"turn 0G off"_            |

The installer is [`skills/private-computer/install.sh`](skills/private-computer/install.sh), POSIX
`sh`. Note that the copy here is for reading and review: the skills hand users a `curl` command
pointing at `0g-pc-skills/main/install.sh`, and `pc.0g.ai/install` serves its own copy, so what
actually runs on a user's machine comes from upstream rather than from this file.

`claude` writes only into the current project — `.claude/settings.local.json` (mode 600) and one
line in `.claude/.gitignore`. It never touches `.claude/settings.json`, nor your global
`~/.claude/settings.json`. The one subcommand that writes outside the project is `skills`, which
puts the three slash commands in `~/.claude/skills` where Claude Code looks for them; it takes no
key.

```bash
curl -fsSL https://pc.0g.ai/install | bash -s claude --key -      # config: install, prompt for the key
curl -fsSL https://pc.0g.ai/install | bash -s claude --key sk-…   # config: install, key inline
curl -fsSL https://pc.0g.ai/install | bash -s claude --uninstall  # config: undo, needs no key
curl -fsSL https://pc.0g.ai/install | bash -s skills              # slash commands: install
curl -fsSL https://pc.0g.ai/install | bash -s skills --uninstall  # slash commands: remove
```

Prefer `--key -`. It reads the key from the terminal with echo off, keeping it out of your shell
history. `--key sk-…` puts the credential in the argv of the command you typed, which other users on
the same machine can read.

After a successful install the script prints a `check-0g.sh` command. Running it is a separate,
deliberate step — the installer does not fetch and execute it for you.

### Provenance

These four files originate in
[0gfoundation/0g-pc-skills](https://github.com/0gfoundation/0g-pc-skills), where they are
maintained, tested and released. Refreshing them is a manual step, so read that repository as the
source.

`install.sh` **is no longer a byte-for-byte copy.** It forked from `bf8751e` with two security
changes made during review here:

- the API key goes to `curl` on stdin (`--config -`) instead of in its argv, where process arguments
  are readable by any other user on the machine;
- the post-install self-check is no longer fetched from `$BASE_URL` and run. Executing remote code
  moments after writing a credential gave away more than the endpoint pin — which the script
  maintains for exactly this class of risk — buys back.

Both belong upstream, and **until they land there users are not protected by them** — the skills and
`pc.0g.ai/install` both serve the upstream file, so that is what actually runs. The fixes here make
the reviewed copy correct and record what needs upstreaming; they are not a substitute for it.

Until the two are reconciled, treat them as divergent: do not overwrite this file with `bf8751e`.

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

| Package                                                                                            | Version | Layer                      |
| -------------------------------------------------------------------------------------------------- | ------- | -------------------------- |
| [`@0gfoundation/0g-storage-ts-sdk`](https://www.npmjs.com/package/@0gfoundation/0g-storage-ts-sdk) | ^1.2.12 | Storage                    |
| [`@0gfoundation/0g-compute-ts-sdk`](https://www.npmjs.com/package/@0gfoundation/0g-compute-ts-sdk) | ^0.9.0  | Compute                    |
| [`ethers`](https://docs.ethers.org/v6/)                                                            | 6.13.1  | Chain (v6 only, exact pin) |

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
│   ├── compute/                     # 9 skills
│   │   ├── streaming-chat/SKILL.md
│   │   ├── text-to-image/SKILL.md
│   │   ├── speech-to-text/SKILL.md
│   │   ├── provider-discovery/SKILL.md
│   │   ├── account-management/SKILL.md
│   │   ├── image-editing/SKILL.md
│   │   ├── video-generation/SKILL.md
│   │   ├── embeddings/SKILL.md
│   │   └── fine-tuning/SKILL.md
│   ├── chain/                       # 3 skills
│   │   ├── deploy-contract/SKILL.md
│   │   ├── interact-contract/SKILL.md
│   │   └── scaffold-project/SKILL.md
│   ├── cross-layer/                 # 2 skills
│   │   ├── storage-plus-chain/SKILL.md
│   │   └── compute-plus-storage/SKILL.md
│   └── private-computer/            # 3 skills, and the installer they hand you
│       ├── install.sh
│       ├── 0g-pc-setup/SKILL.md
│       ├── 0g-pc-switch-model/SKILL.md
│       └── 0g-pc-uninstall/SKILL.md
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
│   ├── lint-critical-rules.ts
│   └── validate-manifests.ts
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
