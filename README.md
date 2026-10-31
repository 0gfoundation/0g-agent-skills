# 0G Agent Skills

**Give your AI coding assistant superpowers for building on 0G.**

This repo turns Claude Code, Cursor, and GitHub Copilot into expert 0G developers. Just say _"upload
a file to 0G Storage"_ or _"build a chatbot on 0G Compute"_ and get correct, working TypeScript code
every time.

**23 skills. 7 architecture references. 3 IDE setups. Zero build step.**

---

## Quick Start

### 1. Clone into your project

```bash
git clone https://github.com/0gfoundation/0g-agent-skills .0g-skills
```

### 2. Connect your IDE

| IDE             | How                                                                                       |
| --------------- | ----------------------------------------------------------------------------------------- |
| **Claude Code** | `cp .0g-skills/CLAUDE.md ./CLAUDE.md` (auto-detected next session)                        |
| **Cursor**      | Create `.cursorrules`. See the [setup guide](setups/cursor/README.md)                     |
| **Copilot**     | Create `.github/copilot-instructions.md`. See the [setup guide](setups/copilot/README.md) |

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
# .env (NEVER commit this file)
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

The 23 skills split into three groups. Pick the one that matches what you are trying to do.

| Group                                 | What it does                                                                                                                  | Count | Works in                                              |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------- |
| [Private Computer](#private-computer) | Use pc.0g.ai from your agent: connect coding tools through 0gpc, or call 0G models (text, image, video, speech) from your app | 1     | Any agent; connects Claude Code, OpenCode, Pi, Hermes |
| [Build on 0G](#build-on-0g)           | Teaches your assistant to write 0G code                                                                                       | 17    | Claude Code, Cursor, Copilot                          |
| [AgenticID](#agenticid)               | Gives AI agents a verifiable identity                                                                                         | 5     | Claude Code, Cursor, Copilot                          |

---

## Private Computer

**Use 0G Private Computer from your agent.**

One skill, `0g-private-computer`, covers what you do with [0G Private Computer](https://pc.0g.ai):
run your coding agent on 0G models, build with 0G models in your own code, or try them first. Every
model comes from the [live catalog](https://pc.0g.ai/models), under the trust mode you choose
(Standard, Verified or Private/TEE).

> **Your key stays out of the chat.** The agent never asks for it: you enter it in your own terminal
> or set it as an environment variable. Every config change is previewed first, and the agent asks
> before anything that costs money.

### Get started

Paste this into Claude Code, OpenCode or any agent that can run commands:

```
Read https://pc.0g.ai/skill and help me set up 0G Private Computer.
```

Or install the skill:

```
npx skills add 0gfoundation/0g-agent-skills/skills/private-computer/0g-private-computer
```

After installing, just ask in plain words (for example "connect Claude Code to 0G PC"), or type
`/0g-private-computer` in Claude Code. Restart the tool after installing.

### Run your coding agent on 0G models

Works with Claude Code, OpenCode V1, Pi and Hermes Agent through the
[`0gpc` CLI](https://www.npmjs.com/package/@0gfoundation/0gpc). Every change is previewed first and
saved only after you confirm; restart the tool afterwards so it picks up the new model.

| You want to                  | Say this                                                             | What happens                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Put your coding agent on 0G  | "connect Claude Code in this project to 0G PC"                       | Checks your setup; you add your key in your own terminal, pick a model and approve the exact change                                          |
| See which models you can use | "which models can Claude Code use on 0G PC?" · "is glm-5.3 on 0G?"   | Queries the live catalog right then, with price, context length, tool calling and Private support; no key, no cost                           |
| Pick a model for coding      | "which 0G model is best for coding with Claude Code?"                | Recommends one model from the live catalog, plus up to two alternatives, and says why                                                        |
| Keep your code private       | "make sure Claude Code only uses Private (TEE) inference"            | Has you set your key to Private on pc.0g.ai, then picks a model served by a TEE-attested provider                                            |
| Switch model                 | "switch to a cheaper 0G model" · "use a model with a longer context" | Shows the options, previews the change and saves it after you confirm                                                                        |
| Confirm it's working         | "am I on 0G now?" · "check my 0G connection"                         | Checks the local setup and points you to your requests in usage on pc.0g.ai; asks before a network check, which may cost a very small amount |
| See what you've spent        | "how much have I spent on 0G?"                                       | Points you to usage and balance on pc.0g.ai; topping up is always your call                                                                  |
| Replace your key             | "I need a new 0G key" · "I pasted my key into the chat"              | You create a new key on pc.0g.ai and enter it in your own terminal; every connected tool picks it up                                         |
| Use 0G in every project      | "use 0G PC for Claude Code in all my projects"                       | Explains that this changes your global settings, previews it and asks before saving                                                          |
| Go back to your usual setup  | "turn 0G off" · "go back to Anthropic"                               | Removes only what 0gpc added; your other settings and your key stay                                                                          |

Prefer to do it yourself? Run `npx @0gfoundation/0gpc@latest` for the setup wizard.

### Build with 0G models in your app

Describe what you want. The agent lists the live models for that feature, you pick a model and trust
mode, and it writes code that reads your key from the environment. It asks before any request that
costs money.

| Feature             | Say this                                                            | Before it runs                           | Try it                                       |
| ------------------- | ------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- |
| Chat Completions    | "add a streaming chat endpoint with 0G PC in Private mode"          | Picks a model with you                   | [chat](https://pc.0g.ai/playground/chat)     |
| Vision              | "extract the totals from these screenshots with 0G PC"              | Picks a vision model                     | [chat](https://pc.0g.ai/playground/chat)     |
| Image Generation    | "generate a 1024x1024 hero image with 0G PC"                        | Shows the per-image price                | [image](https://pc.0g.ai/playground/image)   |
| Image Editing       | "replace the background of photo.jpg with plain white using 0G PC"  | Shows the per-image price                | [image](https://pc.0g.ai/playground/image)   |
| Video Generation    | "turn hero.png into a 5-second clip with 0G PC"                     | Shows duration and estimated cost        | [video](https://pc.0g.ai/playground/video)   |
| Video Understanding | "summarize what happens in demo.mp4 with 0G PC"                     | Picks a model that accepts video         |                                              |
| Audio Transcription | "transcribe meeting.mp3 with 0G PC"                                 | Picks a speech-to-text model             | [speech](https://pc.0g.ai/playground/speech) |
| Text-to-Speech      | "read intro.md aloud with 0G PC and save it as intro.mp3"           | Shows character count and estimated cost | [speech](https://pc.0g.ai/playground/speech) |
| Embeddings          | "embed the Markdown files in ./docs with 0G PC for semantic search" | Shows estimated tokens and cost          |                                              |

The Router is at `https://router-api.0g.ai/v1` and is OpenAI-compatible.

### Try or ask before you build

- Ask _"which video models does 0G PC have, and which support Private?"_ The agent lists live models
  with prices and Private support; no key, no cost.
- Try any model without code in the Playground: [chat](https://pc.0g.ai/playground/chat),
  [image](https://pc.0g.ai/playground/image), [video](https://pc.0g.ai/playground/video),
  [speech](https://pc.0g.ai/playground/speech).

### When something breaks

Say _"my 0G setup stopped working"_. The agent diagnoses first, then suggests the smallest fix you
can undo.

---

`0g-pc-setup`, `0g-pc-switch-model` and `0g-pc-uninstall` have been merged into
`0g-private-computer`. The same skill is served at https://pc.0g.ai/skill. Compute Direct
(wallet-signed calls to individual providers, Advanced mode on pc.0g.ai, fine-tuning) is a separate
path covered by the Compute skills below.

---

## Build on 0G

**Teach your assistant to write 0G code.** These 17 skills produce working TypeScript against the 0G
SDKs. They work in Claude Code, Cursor, and GitHub Copilot.

### Storage: decentralized file and data storage

| Skill                                                              | What it does                                                                           | Say this to activate        |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | --------------------------- |
| [Upload File](skills/storage/upload-file/SKILL.md)                 | Upload files via ZgFile API + Merkle tree chunking. Returns a root hash for retrieval. | _"upload a file to 0G"_     |
| [Download File](skills/storage/download-file/SKILL.md)             | Download and verify files by root hash with Merkle proof validation.                   | _"download a file from 0G"_ |
| [Merkle Verification](skills/storage/merkle-verification/SKILL.md) | Compute root hashes and cryptographically verify file integrity.                       | _"verify file integrity"_   |

### Compute: AI inference on decentralized GPUs

These skills are Compute Direct: they call individual providers with a wallet and the broker SDK.
For API-key access through pc.0g.ai, use the 0g-private-computer skill.

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

### Chain: smart contracts on 0G's EVM L1

| Skill                                                        | What it does                                                                                  | Say this to activate            |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------- |
| [Deploy Contract](skills/chain/deploy-contract/SKILL.md)     | Deploy Solidity contracts via Hardhat, Foundry, or ethers v6. Prefers `evmVersion: "cancun"`. | _"deploy a contract to 0G"_     |
| [Interact Contract](skills/chain/interact-contract/SKILL.md) | Read state, send transactions, listen to events, estimate gas. All ethers v6.                 | _"call a contract on 0G Chain"_ |
| [Scaffold Project](skills/chain/scaffold-project/SKILL.md)   | Generate a new project with correct SDKs, TypeScript config, and boilerplate.                 | _"create a new 0G project"_     |

### Cross-Layer: full-stack decentralized apps

| Skill                                                                 | What it does                                                                                        | Say this to activate                     |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| [Storage + Chain](skills/cross-layer/storage-plus-chain/SKILL.md)     | On-chain smart contract references to off-chain storage. NFT metadata, registries, verifiable docs. | _"store NFT metadata on 0G"_             |
| [Compute + Storage](skills/cross-layer/compute-plus-storage/SKILL.md) | AI inference pipelines with persistent storage. Generate-then-store, load-then-process.             | _"generate an image and store it on 0G"_ |

---

## AgenticID

**Give an AI agent an identity anyone can verify.**

0G AgenticID anchors an agent's identity, its runtime config and its execution environment on chain,
so "this agent is what it claims to be" becomes checkable rather than asserted. Built on ERC-8004
(identity and reputation) and ERC-7857 (sealed, transferable agent data).

> **This group uses `viem`, not `ethers`**, because the SDK depends on it. Everything under
> [Build on 0G](#build-on-0g) uses ethers v6. Do not translate between them.

| Skill                                                           | What it does                                                                           | Say this to activate      |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------- |
| [Deploy Agent](skills/agentic-id/deploy-agent/SKILL.md)         | Mint an agent with a chain-anchored identity, optionally provisioning a TEE container. | _"deploy an agent on 0G"_ |
| [Manage Agent](skills/agentic-id/manage-agent/SKILL.md)         | Start, stop, reset, transfer and clone an existing agent.                              | _"stop my agent"_         |
| [Interact Agent](skills/agentic-id/interact-agent/SKILL.md)     | Call a running agent's signed services, chat with it, read its logs.                   | _"chat with my agent"_    |
| [Agent Reputation](skills/agentic-id/agent-reputation/SKILL.md) | Capture a TEE-signed serve-proof and submit verifiable ERC-8004 feedback.              | _"rate this agent"_       |
| [Agent Accounts](skills/agentic-id/agent-accounts/SKILL.md)     | Acknowledge the trust root, fund the sandbox balance, read costs and runway.           | _"fund my agent"_         |

```bash
npm install @0gfoundation/0g-agenticid-sdk viem
```

Two things to know before you start. The attestor URL picks the network, and the one in every
quickstart (`https://agenticid.0g.ai`) is **testnet** (16602); mainnet is
`https://agenticid-mainnet.0g.ai`. And **reputation is testnet-only today** — the reputation
registry is the one contract not yet deployed on mainnet. See
[patterns/AGENTIC_ID.md](patterns/AGENTIC_ID.md).

---

## Examples

Runnable example projects. Clone, install, and run against testnet:

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

| Workflow            | What gets activated                                                                 |
| ------------------- | ----------------------------------------------------------------------------------- |
| **New Project**     | `scaffold-project`                                                                  |
| **Upload Data**     | `upload-file` → auto: `merkle-verification`                                         |
| **Download Data**   | `download-file` → auto: `merkle-verification`                                       |
| **AI Inference**    | auto: `provider-discovery` → `account-management` → the skill for that service type |
| **Fine-Tune**       | auto: `provider-discovery` → `account-management` → `fine-tuning`                   |
| **Deploy Contract** | `deploy-contract`                                                                   |
| **Cross-Layer App** | `storage-plus-chain` / `compute-plus-storage`                                       |
| **Manage Funds**    | `account-management`                                                                |

---

## Architecture References

Deep-dive documents for when you need to understand _how_ things work:

| Document                                        | What's inside                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| [NETWORK_CONFIG.md](patterns/NETWORK_CONFIG.md) | RPC endpoints, chain IDs, SDK versions, `.env` template, initialization patterns             |
| [STORAGE.md](patterns/STORAGE.md)               | Log-layer architecture, ZgFile lifecycle, upload/download internals, Merkle verification     |
| [COMPUTE.md](patterns/COMPUTE.md)               | Broker lifecycle, `processResponse()` deep-dive, ChatID extraction rules, streaming patterns |
| [CHAIN.md](patterns/CHAIN.md)                   | Hardhat/Foundry configs, `evmVersion: "cancun"`, ethers v5 → v6 migration table              |
| [SECURITY.md](patterns/SECURITY.md)             | Key management, `.env` best practices, TEE verification, contract access control             |
| [TESTING.md](patterns/TESTING.md)               | Vitest mocks for all SDKs, Hardhat/Foundry contract tests, testnet integration testing       |
| [AGENTIC_ID.md](patterns/AGENTIC_ID.md)         | Trust chain, the three-identifier model, networks, balances, serve-proofs, viem              |

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
│   ├── agentic-id/                  # 5 skills (viem, not ethers)
│   │   ├── deploy-agent/SKILL.md
│   │   ├── manage-agent/SKILL.md
│   │   ├── interact-agent/SKILL.md
│   │   ├── agent-reputation/SKILL.md
│   │   └── agent-accounts/SKILL.md
│   └── private-computer/            # 1 skill
│       └── 0g-private-computer/SKILL.md
│
├── examples/                        # 4 runnable example projects
│   ├── file-vault/                  # Storage: upload, download, verify
│   ├── ai-chatbot/                  # Compute: discover, fund, chat
│   ├── nft-with-metadata/           # Cross-layer: contract + storage
│   └── ai-image-gallery/            # Cross-layer: AI + storage
│
├── patterns/                        # 7 architecture references
│   ├── NETWORK_CONFIG.md
│   ├── STORAGE.md
│   ├── COMPUTE.md
│   ├── CHAIN.md
│   ├── SECURITY.md
│   ├── TESTING.md
│   └── AGENTIC_ID.md
│
├── ci/                              # CI scripts
│   ├── extract-code-blocks.ts
│   ├── validate-sdk-versions.ts
│   ├── lint-critical-rules.ts
│   ├── validate-manifests.ts
│   └── canonical-versions.ts
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

MIT. See [LICENSE](LICENSE)
