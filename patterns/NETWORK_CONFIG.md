# Network Configuration

Single source of truth for all 0G network endpoints, chain IDs, SDK versions, and environment setup.

All endpoints and chain IDs below were verified live against both networks: `eth_chainId` returns
`0x40da` (16602) on testnet and `0x4115` (16661) on mainnet, and both storage indexers completed a
full upload → verified-download round trip.

> Note: `https://rpc-testnet.0g.ai` appears in some upstream SDK docstrings but does **not**
> respond. The correct testnet RPC is `https://evmrpc-testnet.0g.ai`.

## Network Environments

### Testnet (Galileo — Recommended for Development)

| Parameter       | Value                                         |
| --------------- | --------------------------------------------- |
| Network Name    | 0G-Galileo-Testnet                            |
| RPC Endpoint    | `https://evmrpc-testnet.0g.ai`                |
| Chain ID        | `16602`                                       |
| Currency Symbol | 0G                                            |
| Block Explorer  | `https://chainscan-galileo.0g.ai`             |
| Storage RPC     | `https://storagerpc-testnet.0g.ai`            |
| Storage Indexer | `https://indexer-storage-testnet-turbo.0g.ai` |

### Mainnet (Aristotle)

| Parameter       | Value                                 |
| --------------- | ------------------------------------- |
| Network Name    | 0G Mainnet                            |
| RPC Endpoint    | `https://evmrpc.0g.ai`                |
| Chain ID        | `16661`                               |
| Currency Symbol | 0G                                    |
| Block Explorer  | `https://chainscan.0g.ai`             |
| Storage RPC     | `https://storagerpc.0g.ai`            |
| Storage Indexer | `https://indexer-storage-turbo.0g.ai` |

## SDK Versions

| Package                           | Version   | Purpose                                     |
| --------------------------------- | --------- | ------------------------------------------- |
| `@0gfoundation/0g-storage-ts-sdk` | `^1.2.12` | Storage operations (upload, download)       |
| `@0gfoundation/0g-compute-ts-sdk` | `^0.9.0`  | Compute operations (inference, fine-tuning) |
| `ethers`                          | `6.13.1`  | Chain interaction (exact pin — see below)   |
| `dotenv`                          | `^16.4.0` | Environment variable management             |

### Deprecated packages — do not use

| Deprecated                  | Replacement                       |
| --------------------------- | --------------------------------- |
| `@0glabs/0g-ts-sdk`         | `@0gfoundation/0g-storage-ts-sdk` |
| `@0glabs/0g-serving-broker` | `@0gfoundation/0g-compute-ts-sdk` |
| `@0gfoundation/0g-ts-sdk`   | `@0gfoundation/0g-storage-ts-sdk` |

Both `@0glabs/*` packages are marked deprecated on npm and receive no updates. The storage line
never went past `0.3.3` under the old name; it continues at `1.x` under the new name.

### Why `ethers` is pinned exactly

`@0gfoundation/0g-storage-ts-sdk` declares an **exact** peer dependency on `ethers@6.13.1`. A caret
range resolves to a newer ethers and `npm install` fails:

```
npm error ERESOLVE unable to resolve dependency tree
npm error Found: ethers@6.17.0
npm error Could not resolve dependency:
npm error peer ethers@"6.13.1" from @0gfoundation/0g-storage-ts-sdk@1.2.12
```

Use `"ethers": "6.13.1"` — no caret, no tilde.

### Install

```bash
# storage + compute + chain
npm install @0gfoundation/0g-storage-ts-sdk @0gfoundation/0g-compute-ts-sdk ethers@6.13.1 dotenv

# storage only
npm install @0gfoundation/0g-storage-ts-sdk ethers@6.13.1 dotenv

# compute only
npm install @0gfoundation/0g-compute-ts-sdk ethers@6.13.1 dotenv
```

## Environment Variables Template

```bash
# .env — NEVER commit this file

# Network Configuration
RPC_URL=https://evmrpc-testnet.0g.ai
CHAIN_ID=16602

# Wallet (NEVER hardcode in source files)
PRIVATE_KEY=your_private_key_here

# Storage Endpoints
STORAGE_INDEXER=https://indexer-storage-testnet-turbo.0g.ai

# Compute
PROVIDER_ADDRESS=your_provider_address

# Optional
OUTPUT_DIR=./output
```

## SDK Initialization Patterns

### ethers v6 Provider (Chain)

```typescript
import { ethers } from 'ethers';
import 'dotenv/config';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
```

### Storage Client

```typescript
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const indexer = new Indexer(process.env.STORAGE_INDEXER!);
```

### Compute Broker

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
const broker = await createZGComputeNetworkBroker(wallet);
```

### Read-Only Compute Broker (no wallet)

Use this for provider and model discovery before a wallet is connected. It cannot sign, so it cannot
run inference — but `listService`, `listServiceWithDetail` and `getProviderModels` all work.

```typescript
import { createReadOnlyInferenceBroker } from '@0gfoundation/0g-compute-ts-sdk';

const broker = await createReadOnlyInferenceBroker(process.env.RPC_URL!);

// page in chunks of <= 50 — the contract reverts above that
const services = [];
for (let offset = 0; ; offset += 50) {
  const page = await broker.listService(offset, 50, true);
  services.push(...page);
  if (page.length < 50) break;
}
```

### Browser Environment (Compute)

```typescript
import { BrowserProvider } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';

if (typeof window.ethereum === 'undefined') {
  throw new Error('Please install MetaMask');
}

const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const broker = await createZGComputeNetworkBroker(signer);
```

## Browser Polyfills

When using 0G SDKs in browser environments:

```bash
pnpm add -D vite-plugin-node-polyfills
```

```javascript
// vite.config.js
import { nodePolyfills } from 'vite-plugin-node-polyfills';

export default {
  plugins: [
    nodePolyfills({
      include: ['crypto', 'stream', 'util', 'buffer', 'process'],
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
};
```

## Network Selection Helper

```typescript
type Network = 'testnet' | 'mainnet';

function getNetworkConfig(network: Network) {
  const configs = {
    testnet: {
      rpcUrl: 'https://evmrpc-testnet.0g.ai',
      chainId: 16602,
      storageRpc: 'https://storagerpc-testnet.0g.ai',
      storageIndexer: 'https://indexer-storage-testnet-turbo.0g.ai',
      explorer: 'https://chainscan-galileo.0g.ai',
    },
    mainnet: {
      rpcUrl: 'https://evmrpc.0g.ai',
      chainId: 16661,
      storageRpc: 'https://storagerpc.0g.ai',
      storageIndexer: 'https://indexer-storage-turbo.0g.ai',
      explorer: 'https://chainscan.0g.ai',
    },
  };
  return configs[network];
}
```

## References

- [0G Testnet Info](https://docs.0g.ai/run-a-node/testnet-information)
- [0G Storage SDK](https://docs.0g.ai/build-with-0g/storage-network/sdk)
- [0G Compute SDK](https://docs.0g.ai/build-with-0g/compute-network/sdk)
