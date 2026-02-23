---
name: scaffold-project
description: |
  Initialize a new 0G dApp project with the correct SDK versions, TypeScript configuration, environment setup, and boilerplate code. Use this skill for "new project", "scaffold", "initialize", "create 0G app", "setup project".
---

# Scaffold 0G Project

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0, `@0glabs/0g-ts-sdk` ^0.3.3, `@0glabs/0g-serving-broker` ^0.6.5
- **Activation Triggers**: "new project", "scaffold", "initialize", "create 0G app", "setup project"

## Purpose

Initialize a new 0G dApp project with the correct SDK versions, TypeScript configuration,
environment setup, and boilerplate code for storage, compute, and/or chain interactions.

## Prerequisites

- Node.js >= 18
- npm or pnpm

## Quick Workflow

1. Create project directory and initialize npm
2. Install dependencies based on project type
3. Configure TypeScript
4. Create `.env` template and `.gitignore`
5. Create boilerplate source files
6. Initialize git repository

## Core Rules

### ALWAYS

- Use ethers v6 (^6.13.0), never v5
- Use `evmVersion: "cancun"` for Hardhat/Foundry configs
- Create `.env` with placeholder values (never real keys)
- Add `.env` to `.gitignore`
- Use `dotenv/config` for environment variable loading

### NEVER

- Install ethers v5
- Hardcode private keys in boilerplate
- Skip `.gitignore` creation
- Use CommonJS — prefer ES modules with TypeScript

## Code Examples

### Full-Stack 0G Project

```bash
# Create and initialize project
mkdir my-0g-app && cd my-0g-app
npm init -y

# Install all 0G SDKs
npm install @0glabs/0g-ts-sdk @0glabs/0g-serving-broker ethers dotenv

# Install dev dependencies
npm install -D typescript tsx @types/node
```

#### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

#### .env

```bash
# Network
RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602

# Wallet (NEVER commit real keys)
PRIVATE_KEY=your_private_key_here

# Storage
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

# Compute
PROVIDER_ADDRESS=your_provider_address
```

#### .gitignore

```gitignore
node_modules/
dist/
.env
.env.local
.env.*.local
*.log
```

#### package.json scripts

```json
{
  "scripts": {
    "build": "tsc",
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  }
}
```

### Storage-Only Project

```bash
npm install @0glabs/0g-ts-sdk ethers dotenv
npm install -D typescript tsx @types/node
```

```typescript
// src/index.ts
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  console.log('0G Storage client initialized');
  console.log('Wallet:', wallet.address);
}

main().catch(console.error);
```

### Compute-Only Project

```bash
npm install @0glabs/0g-serving-broker ethers dotenv
npm install -D typescript tsx @types/node
```

```typescript
// src/index.ts
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function main() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  console.log('0G Compute broker initialized');

  const services = await broker.inference.listService();
  console.log(`Available services: ${services.length}`);
}

main().catch(console.error);
```

### Hardhat Smart Contract Project

```bash
mkdir my-0g-contracts && cd my-0g-contracts
npm init -y
npm install -D hardhat @nomicfoundation/hardhat-toolbox dotenv typescript tsx
npx hardhat init  # Choose TypeScript project
```

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import 'dotenv/config';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: 'cancun', // REQUIRED for 0G Chain
    },
  },
  networks: {
    '0g-testnet': {
      url: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602,
      accounts: [process.env.PRIVATE_KEY!],
    },
    '0g-mainnet': {
      url: 'https://evmrpc.0g.ai',
      chainId: 16661,
      accounts: [process.env.PRIVATE_KEY!],
    },
  },
};

export default config;
```

## Project Type Reference

| Project Type    | Dependencies                          | Use Case        |
| --------------- | ------------------------------------- | --------------- |
| Full-Stack      | All 3 SDKs                            | Complete dApp   |
| Storage Only    | `@0glabs/0g-ts-sdk`, `ethers`         | File/KV storage |
| Compute Only    | `@0glabs/0g-serving-broker`, `ethers` | AI inference    |
| Smart Contracts | `hardhat`, toolbox, `ethers`          | On-chain logic  |

## Anti-Patterns

```bash
# BAD: Installing ethers v5
npm install ethers@5  # WRONG — use v6

# BAD: Missing evmVersion in Hardhat config
# solidity: { version: "0.8.24" }  # Missing evmVersion: "cancun"
```

```typescript
// BAD: Hardcoded credentials in boilerplate
const wallet = new ethers.Wallet('0xabc...', provider);

// BAD: ethers v5 pattern
import { providers } from 'ethers'; // v5 pattern!
```

## Common Errors & Fixes

| Error                    | Cause                      | Fix                            |
| ------------------------ | -------------------------- | ------------------------------ |
| `Cannot find module`     | Dependencies not installed | Run `npm install`              |
| `invalid opcode`         | Wrong evmVersion           | Set `evmVersion: "cancun"`     |
| `PRIVATE_KEY not set`    | Missing `.env` file        | Create `.env` with credentials |
| `ethers v5 import error` | Wrong ethers version       | `npm install ethers@^6.13.0`   |

## Related Skills

- [Deploy Contract](../deploy-contract/SKILL.md) — deploy after scaffolding
- [Upload File](../../storage/upload-file/SKILL.md) — storage operations
- [Streaming Chat](../../compute/streaming-chat/SKILL.md) — compute operations

## References

- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [Chain Patterns](../../../patterns/CHAIN.md)
- [Security Patterns](../../../patterns/SECURITY.md)
