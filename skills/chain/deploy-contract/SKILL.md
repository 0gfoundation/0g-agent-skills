# Deploy Contract to 0G Chain

## Metadata

- **Category**: chain
- **SDK**: `ethers` 6.13.1, Hardhat or Foundry
- **Activation Triggers**: "deploy contract", "Solidity", "0G Chain", "deploy smart contract"

## Purpose

Deploy Solidity smart contracts to 0G Chain using Hardhat, Foundry, or ethers v6 directly. Compile
with `evmVersion: "cancun"` — 0G Chain supports it and it produces the smallest bytecode.

## Prerequisites

- Node.js >= 18
- Hardhat or Foundry installed
- Funded wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

1. Write Solidity contract
2. Configure compiler with `evmVersion: "cancun"` (recommended — see below)
3. Compile contract
4. Deploy to 0G testnet
5. Verify on block explorer (optional)

## Core Rules

### ALWAYS

- Set `evmVersion: "cancun"` in compiler configuration — smallest bytecode on 0G Chain
- Use ethers v6 syntax (NOT v5)
- Test on testnet before deploying to mainnet
- Wait for deployment confirmation (`waitForDeployment()`)
- Store deployed contract addresses

### NEVER

- Use ethers v5 patterns (`.deployed()`, `contract.address`, etc.)
- Deploy to mainnet without testnet testing
- Hardcode private keys

## Code Examples

### Hardhat Deployment

```solidity
// contracts/MyContract.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MyContract {
    uint256 public value;
    address public owner;

    event ValueChanged(uint256 newValue);

    constructor(uint256 _initialValue) {
        value = _initialValue;
        owner = msg.sender;
    }

    function setValue(uint256 _value) external {
        value = _value;
        emit ValueChanged(_value);
    }
}
```

```typescript
// scripts/deploy.ts
import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const balance = await deployer.provider.getBalance(deployer.address);
  console.log('Balance:', ethers.formatEther(balance), '0G');

  const Contract = await ethers.getContractFactory('MyContract');
  const contract = await Contract.deploy(42);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('Deployed to:', address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

```bash
# Compile
npx hardhat compile

# Deploy to testnet
npx hardhat run scripts/deploy.ts --network 0g-testnet

# Verify
npx hardhat verify --network 0g-testnet <CONTRACT_ADDRESS> 42
```

### Foundry Deployment

```bash
# Compile
forge build

# Deploy
forge create src/MyContract.sol:MyContract \
  --rpc-url https://evmrpc-testnet.0g.ai \
  --private-key $PRIVATE_KEY \
  --constructor-args 42

# Verify
forge verify-contract <CONTRACT_ADDRESS> src/MyContract.sol:MyContract \
  --chain-id 16602 \
  --verifier-url https://chainscan-galileo.0g.ai/api
```

### Direct ethers v6 Deployment

```typescript
import { ethers, ContractFactory } from 'ethers';
import * as fs from 'fs';
import 'dotenv/config';

async function deploy() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  // Load compiled artifact
  const artifact = JSON.parse(
    fs.readFileSync('./artifacts/contracts/MyContract.sol/MyContract.json', 'utf8'),
  );

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(42);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('Deployed to:', address);

  return { address, abi: artifact.abi };
}
```

### Deploy with Constructor Arguments

```typescript
// Complex constructor
const contract = await Contract.deploy(
  'My Token', // string name
  'MTK', // string symbol
  ethers.parseEther('1000000'), // uint256 initialSupply
  wallet.address, // address owner
);
await contract.waitForDeployment();
```

## Anti-Patterns

```typescript
// SUBOPTIMAL: no evmVersion — solc may target an older EVM than 0G supports,
// producing larger, more expensive bytecode. It still deploys and runs.
// hardhat.config.ts
solidity: '0.8.24';

// BAD: ethers v5 deployment check
await contract.deployed(); // v5! Use waitForDeployment()

// BAD: Getting address v5 style
console.log(contract.address); // v5! Use await contract.getAddress()

// BAD: Deploying without balance check
await Contract.deploy(42); // May fail with insufficient funds
```

## Choosing an EVM Target

0G Chain is Cancun-capable, so `cancun` is the right default: solc can emit `MCOPY` for memory
copies, which shrinks the deployed bytecode and lowers deploy gas.

It is **not** a compatibility requirement. The same contract was compiled at four targets and
deployed to both 0G testnet (16602) and mainnet (16661); every one deployed successfully and
returned correct values from both a `pure` function and a memory-copy function:

| `evmVersion` | Deploys & runs on 0G | Bytecode |
| ------------ | -------------------- | -------- |
| `cancun`     | yes                  | 1437 B   |
| `shanghai`   | yes                  | 1479 B   |
| `paris`      | yes                  | 1527 B   |
| `london`     | yes                  | 1527 B   |

So prefer `cancun` to save gas, but an older target inherited from a dependency or an existing
toolchain will not break deployment. If you see `invalid opcode`, look for a cause other than
`evmVersion` — that symptom is not produced by targeting an older EVM here.

## Common Errors & Fixes

| Error                                       | Cause                   | Fix                     |
| ------------------------------------------- | ----------------------- | ----------------------- |
| `insufficient funds`                        | Wallet empty            | Fund from faucet        |
| `nonce too low`                             | Pending transaction     | Wait or increment nonce |
| `contract creation code storage out of gas` | Complex contract        | Increase gas limit      |
| `cannot estimate gas`                       | Constructor will revert | Check constructor args  |

## Related Skills

- [Interact Contract](../interact-contract/SKILL.md) — interact with deployed contracts
- [Scaffold Project](../scaffold-project/SKILL.md) — project setup
- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — on-chain references

## References

- [Chain Patterns](../../../patterns/CHAIN.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [Hardhat Docs](https://hardhat.org/docs)
- [Foundry Docs](https://book.getfoundry.sh)
