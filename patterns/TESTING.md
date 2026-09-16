# Testing Patterns

Testing strategies, mock patterns, and testnet workflows for 0G applications.

## Testing Strategy

```
┌─────────────────────────────────────┐
│       Integration Tests             │
│   (Testnet, real transactions)      │
├─────────────────────────────────────┤
│         Unit Tests                  │
│   (Mocked SDK, local only)         │
├─────────────────────────────────────┤
│       Static Analysis               │
│   (TypeScript, Solhint, Slither)   │
└─────────────────────────────────────┘
```

## Unit Testing

### Mock Storage SDK

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock the 0G SDK
vi.mock('@0gfoundation/0g-storage-ts-sdk', () => ({
  ZgFile: {
    fromFilePath: vi.fn().mockResolvedValue({
      merkleTree: vi.fn().mockResolvedValue([{ rootHash: () => '0xabc123' }, null]),
      close: vi.fn(),
    }),
  },
  Indexer: vi.fn().mockImplementation(() => ({
    upload: vi.fn().mockResolvedValue('0xtxhash'),
    download: vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('Storage Upload', () => {
  it('should return root hash after upload', async () => {
    const { ZgFile, Indexer } = await import('@0gfoundation/0g-storage-ts-sdk');
    const file = await ZgFile.fromFilePath('test.txt');
    const [tree] = await file.merkleTree();
    expect(tree.rootHash()).toBe('0xabc123');
  });
});
```

### Mock Compute Broker

```typescript
vi.mock('@0gfoundation/0g-compute-ts-sdk', () => ({
  createZGComputeNetworkBroker: vi.fn().mockResolvedValue({
    inference: {
      listService: vi
        .fn()
        .mockResolvedValue([
          { providerAddress: '0x123', serviceType: 'chatbot', model: 'test-model' },
        ]),
      getServiceMetadata: vi.fn().mockResolvedValue({
        endpoint: 'http://localhost:3000',
        model: 'test-model',
      }),
      getRequestHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test' }),
      processResponse: vi.fn().mockResolvedValue(true),
      acknowledgeProviderSigner: vi.fn().mockResolvedValue(undefined),
    },
    ledger: {
      getLedger: vi.fn().mockResolvedValue({
        totalBalance: 10000000000000000000n,
        availableBalance: 5000000000000000000n,
      }),
      depositFund: vi.fn(),
      transferFund: vi.fn(),
    },
  }),
}));
```

### Mock ethers

```typescript
vi.mock('ethers', async () => {
  const actual = await vi.importActual('ethers');
  return {
    ...actual,
    JsonRpcProvider: vi.fn().mockImplementation(() => ({
      getNetwork: vi.fn().mockResolvedValue({ chainId: 16602n }),
    })),
    Wallet: vi.fn().mockImplementation(() => ({
      address: '0xTestAddress',
      provider: {},
    })),
  };
});
```

## Contract Testing

### Hardhat Tests

```typescript
import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('MyContract', function () {
  it('should deploy and set initial value', async function () {
    const Contract = await ethers.getContractFactory('MyContract');
    const contract = await Contract.deploy(42);
    await contract.waitForDeployment();

    expect(await contract.getValue()).to.equal(42);
  });

  it('should update value', async function () {
    const Contract = await ethers.getContractFactory('MyContract');
    const contract = await Contract.deploy(0);
    await contract.waitForDeployment();

    const tx = await contract.setValue(100);
    await tx.wait();

    expect(await contract.getValue()).to.equal(100);
  });
});
```

```bash
npx hardhat test
```

### Foundry Tests

```solidity
// test/MyContract.t.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MyContract.sol";

contract MyContractTest is Test {
    MyContract public myContract;

    function setUp() public {
        myContract = new MyContract(42);
    }

    function testGetValue() public view {
        assertEq(myContract.getValue(), 42);
    }

    function testSetValue() public {
        myContract.setValue(100);
        assertEq(myContract.getValue(), 100);
    }
}
```

```bash
forge test
```

## Testnet Integration Testing

### Test Workflow

1. Use testnet endpoints (never mainnet for tests)
2. Fund test wallet from faucet
3. Run operations against real infrastructure
4. Verify results on block explorer

### Integration Test Example

```typescript
import { describe, it, expect } from 'vitest';
import { ethers } from 'ethers';
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';

// Only run in integration test mode
describe.skipIf(!process.env.RUN_INTEGRATION)('Storage Integration', () => {
  const provider = new ethers.JsonRpcProvider('https://evmrpc-testnet.0g.ai');
  const wallet = new ethers.Wallet(process.env.TEST_PRIVATE_KEY!, provider);
  const indexer = new Indexer('https://indexer-storage-testnet-turbo.0g.ai');

  it('should upload and download a file', async () => {
    // Upload
    const file = await ZgFile.fromFilePath('./test-fixtures/sample.txt');
    try {
      const [tree, err] = await file.merkleTree();
      if (err) throw err;
      const rootHash = tree!.rootHash();
      const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
      if (uploadErr) throw uploadErr;

      // Download (can throw — use try/catch)
      const outputPath = './test-output/downloaded.txt';
      const dlErr = await indexer.download(rootHash, outputPath, true);
      if (dlErr) throw dlErr;

      // Verify
      expect(fs.existsSync(outputPath)).toBe(true);
    } finally {
      await file.close();
    }
  }, 120_000); // Long timeout for network operations
});
```

### Running Integration Tests

```bash
# Run unit tests only
npm test

# Run with integration tests
RUN_INTEGRATION=1 TEST_PRIVATE_KEY=0x... npm test
```

## Project Setup (vitest)

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30_000,
    include: ['test/**/*.test.ts'],
  },
});
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "RUN_INTEGRATION=1 vitest run"
  }
}
```

## Best Practices

1. **Mock external calls** in unit tests — never hit real networks
2. **Use testnet** for integration tests — never mainnet
3. **Set long timeouts** for network operations (60-120s)
4. **Fund test wallets** with small amounts only
5. **Clean up** test artifacts (uploaded files, deployed contracts)
6. **Use separate keys** for testing and production

## References

- [Vitest Documentation](https://vitest.dev)
- [Hardhat Testing](https://hardhat.org/tutorial/testing-contracts)
- [Foundry Testing](https://book.getfoundry.sh/forge/tests)
- See also: [NETWORK_CONFIG.md](./NETWORK_CONFIG.md)
