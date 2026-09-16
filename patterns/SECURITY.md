# Security Patterns

Cross-cutting security patterns for 0G development: key management, data integrity, contract
security, and TEE verification.

## Key Management

### Environment Variables Pattern

```bash
# .env — NEVER commit this file
PRIVATE_KEY=your_private_key_here
RPC_URL=https://evmrpc-testnet.0g.ai
```

```typescript
import 'dotenv/config';

// CORRECT — load from environment
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

// WRONG — hardcoded key (NEVER do this)
// const wallet = new ethers.Wallet("0xabc123...", provider);
```

### .gitignore Requirements

```gitignore
# MUST be in .gitignore
.env
.env.local
.env.*.local
*.key
*.pem
```

### Validation Pattern

```typescript
function validateEnv() {
  const required = ['PRIVATE_KEY', 'RPC_URL'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}
```

## Data Integrity (Storage)

### Verified Downloads

```typescript
// ALWAYS use verified=true in production
await indexer.download(rootHash, outputPath, true);
// Throws if Merkle proof verification fails
```

### Hash Verification

```typescript
import { ZgFile } from '@0gfoundation/0g-storage-ts-sdk';

async function verifyFile(filePath: string, expectedHash: string): Promise<boolean> {
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) return false;
    return tree.rootHash() === expectedHash;
  } finally {
    await file.close();
  }
}
```

## TEE Verification (Compute)

Always verify provider TEE attestation before sensitive workloads:

```typescript
const services = await broker.inference.listService();
const verifiedProviders = services.filter((s) => s.teeVerified === true);

if (verifiedProviders.length === 0) {
  throw new Error('No TEE-verified providers available');
}
```

## Smart Contract Security

### Access Control

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

contract SecureStorage is Ownable {
    mapping(bytes32 => address) public fileOwners;

    function registerFile(bytes32 rootHash) external {
        require(fileOwners[rootHash] == address(0), "Already registered");
        fileOwners[rootHash] = msg.sender;
    }

    function verifyOwner(bytes32 rootHash, address owner) external view returns (bool) {
        return fileOwners[rootHash] == owner;
    }
}
```

### Input Validation

```solidity
function store(bytes32 rootHash, string calldata metadata) external {
    require(rootHash != bytes32(0), "Invalid root hash");
    require(bytes(metadata).length > 0, "Empty metadata");
    require(bytes(metadata).length <= 1024, "Metadata too long");
    // ... storage logic
}
```

## API Security

### Rate Limiting Pattern

```typescript
const requestTimes: number[] = [];
const MAX_REQUESTS = 10;
const WINDOW_MS = 60_000;

function checkRateLimit(): boolean {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  // Remove old entries
  while (requestTimes.length > 0 && requestTimes[0] < windowStart) {
    requestTimes.shift();
  }
  if (requestTimes.length >= MAX_REQUESTS) return false;
  requestTimes.push(now);
  return true;
}
```

### Balance Check Before Operations

```typescript
async function ensureSufficientBalance(broker: any, minBalance: number) {
  // getLedger() -> [user, availableBalance, totalBalance, additionalInfo].
  // Use named access: index 1 is available, index 2 is total.
  const led = await broker.ledger.getLedger();
  const available = parseFloat(ethers.formatEther(led.availableBalance));
  if (available < minBalance) {
    throw new Error(`Insufficient balance: ${available} 0G available, ${minBalance} 0G required`);
  }
}
```

## Checklist

- [ ] Private keys loaded from `.env`, never hardcoded
- [ ] `.env` is in `.gitignore`
- [ ] All downloads use verified mode (`true`)
- [ ] TEE verification checked for compute providers
- [ ] Smart contracts use access control
- [ ] Input validation on all public functions
- [ ] Balance checked before operations
- [ ] No secrets in logs or error messages

## References

- [OWASP Smart Contract Top 10](https://owasp.org/www-project-smart-contract-top-10/)
- [OpenZeppelin Contracts](https://docs.openzeppelin.com/contracts)
- See also: [NETWORK_CONFIG.md](./NETWORK_CONFIG.md)
