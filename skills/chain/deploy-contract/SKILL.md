---
name: deploy-contract
description: |
  Deploy Solidity smart contracts to 0G Chain using Hardhat, Foundry, or ethers v6 directly. Use this skill for "deploy contract", "Solidity", "0G Chain", "deploy smart contract".
---

# Deploy Contract to 0G Chain

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0, Hardhat or Foundry
- **Activation Triggers**: "deploy contract", "Solidity", "0G Chain", "deploy smart contract"

## Purpose

Deploy Solidity smart contracts to 0G Chain using Hardhat, Foundry, or ethers v6 directly. All
contracts must be compiled with `evmVersion: "cancun"`.

## Prerequisites

- Node.js >= 18
- Hardhat or Foundry installed
- Funded wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

1. Write Solidity contract
2. Configure compiler with `evmVersion: "cancun"`
3. Compile contract
4. Deploy to 0G testnet
5. Verify on block explorer (optional)

## Core Rules

### ALWAYS

- Set `evmVersion: "cancun"` in compiler configuration
- Use ethers v6 syntax (NOT v5)
- Test on testnet before deploying to mainnet
- Wait for deployment confirmation (`waitForDeployment()`)
- Store deployed contract addresses

### NEVER

- Use any evmVersion other than `"cancun"` for 0G Chain
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
// BAD: Missing evmVersion
// hardhat.config.ts
solidity: '0.8.24'; // WRONG — needs cancun setting

// BAD: ethers v5 deployment check
await contract.deployed(); // v5! Use waitForDeployment()

// BAD: Getting address v5 style
console.log(contract.address); // v5! Use await contract.getAddress()

// BAD: Deploying without balance check
await Contract.deploy(42); // May fail with insufficient funds
```

## Common Errors & Fixes

| Error                                       | Cause                   | Fix                        |
| ------------------------------------------- | ----------------------- | -------------------------- |
| `invalid opcode`                            | Wrong evmVersion        | Set `evmVersion: "cancun"` |
| `insufficient funds`                        | Wallet empty            | Fund from faucet           |
| `nonce too low`                             | Pending transaction     | Wait or increment nonce    |
| `contract creation code storage out of gas` | Complex contract        | Increase gas limit         |
| `cannot estimate gas`                       | Constructor will revert | Check constructor args     |

## Related Skills

- [Interact Contract](../interact-contract/SKILL.md) — interact with deployed contracts
- [Scaffold Project](../scaffold-project/SKILL.md) — project setup
- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — on-chain references

## References

- [Chain Patterns](../../../patterns/CHAIN.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [Hardhat Docs](https://hardhat.org/docs)
- [Foundry Docs](https://book.getfoundry.sh)
