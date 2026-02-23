---
name: interact-contract
description: |
  Read from and write to deployed smart contracts on 0G Chain using ethers v6. Use this skill for "call contract", "read contract", "interact", "write contract", "contract function".
---

# Interact with 0G Chain Contracts

## Metadata

- **Category**: chain
- **SDK**: `ethers` ^6.13.0
- **Activation Triggers**: "call contract", "read contract", "interact", "write contract", "contract
  function"

## Purpose

Read from and write to deployed smart contracts on 0G Chain using ethers v6. Covers view functions,
state-changing transactions, event listening, and gas estimation.

## Prerequisites

- Node.js >= 18
- `ethers` ^6.13.0 installed
- Contract ABI and address
- `.env` with `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

### Read (View Functions)

1. Create provider (no wallet needed for reads)
2. Create contract instance with ABI and address
3. Call view function

### Write (State Changes)

1. Create provider and wallet
2. Create contract instance with wallet as signer
3. Call state-changing function
4. Wait for transaction confirmation

## Core Rules

### ALWAYS

- Use ethers v6 syntax throughout
- Use `await contract.getAddress()` (not `contract.address`)
- Use `await contract.waitForDeployment()` (not `.deployed()`)
- Wait for transaction confirmation with `tx.wait()`
- Use native `BigInt` (not `BigNumber`)

### NEVER

- Use ethers v5 patterns
- Skip transaction confirmation for important operations
- Hardcode contract addresses in source (use `.env`)

## Code Examples

### Read Contract State

```typescript
import { ethers } from 'ethers';
import 'dotenv/config';

const ABI = [
  'function getValue() view returns (uint256)',
  'function balanceOf(address) view returns (uint256)',
  'function owner() view returns (address)',
];

async function readContract() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, provider);

  const value = await contract.getValue();
  console.log('Value:', value.toString());

  const balance = await contract.balanceOf(process.env.WALLET_ADDRESS!);
  console.log('Balance:', ethers.formatEther(balance));

  const owner = await contract.owner();
  console.log('Owner:', owner);
}
```

### Write to Contract

```typescript
async function writeContract() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  const ABI = [
    'function setValue(uint256) external',
    'function transfer(address, uint256) external returns (bool)',
  ];
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);

  // Simple write
  const tx = await contract.setValue(42);
  const receipt = await tx.wait();
  console.log('Tx hash:', receipt.hash);
  console.log('Gas used:', receipt.gasUsed.toString());

  // Write with value
  const tx2 = await contract.transfer('0xRecipient...', ethers.parseEther('1.0'));
  await tx2.wait();
}
```

### Listen for Events

```typescript
async function listenForEvents() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const ABI = [
    'event Transfer(address indexed from, address indexed to, uint256 amount)',
    'event ValueChanged(uint256 newValue)',
  ];
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, provider);

  // Real-time listener
  contract.on('ValueChanged', (newValue) => {
    console.log('Value changed to:', newValue.toString());
  });

  contract.on('Transfer', (from, to, amount) => {
    console.log(`Transfer: ${from} → ${to}: ${ethers.formatEther(amount)}`);
  });

  // Query past events
  const filter = contract.filters.Transfer();
  const events = await contract.queryFilter(filter, -1000); // Last 1000 blocks
  console.log(`Found ${events.length} transfer events`);
}
```

### Gas Estimation

```typescript
async function estimateGas() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  const ABI = ['function setValue(uint256) external'];
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, ABI, wallet);

  const gasEstimate = await contract.setValue.estimateGas(42);
  console.log('Estimated gas:', gasEstimate.toString());

  // Execute with gas buffer
  const tx = await contract.setValue(42, {
    gasLimit: (gasEstimate * 120n) / 100n, // 20% buffer
  });
  await tx.wait();
}
```

### Using Full ABI (from compilation)

```typescript
import * as fs from 'fs';

async function interactWithArtifact() {
  const artifact = JSON.parse(
    fs.readFileSync('./artifacts/contracts/MyContract.sol/MyContract.json', 'utf8'),
  );

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS!, artifact.abi, wallet);

  // Now use any function from the contract
  const value = await contract.getValue();
  console.log('Value:', value.toString());
}
```

## ethers v6 Quick Reference

| Operation    | v5 (DO NOT USE)                        | v6 (CORRECT)                         |
| ------------ | -------------------------------------- | ------------------------------------ |
| Parse ether  | `ethers.utils.parseEther("1")`         | `ethers.parseEther("1")`             |
| Format ether | `ethers.utils.formatEther(x)`          | `ethers.formatEther(x)`              |
| Big numbers  | `BigNumber.from(42)`                   | `42n` (native BigInt)                |
| Get address  | `contract.address`                     | `await contract.getAddress()`        |
| Wait deploy  | `await contract.deployed()`            | `await contract.waitForDeployment()` |
| Provider     | `new ethers.providers.JsonRpcProvider` | `new ethers.JsonRpcProvider`         |

## Anti-Patterns

```typescript
// BAD: ethers v5 patterns
const value = ethers.utils.parseEther('1.0'); // v5!
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
const big = BigNumber.from(42); // v5!

// BAD: Not waiting for confirmation
await contract.setValue(42); // Fire and forget — bad!

// BAD: Hardcoded addresses
const contract = new ethers.Contract('0x123...', abi, wallet);
```

## Common Errors & Fixes

| Error                   | Cause                    | Fix                            |
| ----------------------- | ------------------------ | ------------------------------ |
| `execution reverted`    | Require/revert condition | Check function parameters      |
| `insufficient funds`    | Wallet empty             | Fund wallet                    |
| `nonce too low`         | Pending tx               | Wait or set nonce manually     |
| `cannot estimate gas`   | Function will revert     | Check args and contract state  |
| `call revert exception` | View function reverted   | Check function exists and args |

## Related Skills

- [Deploy Contract](../deploy-contract/SKILL.md) — deploy contracts first
- [Scaffold Project](../scaffold-project/SKILL.md) — project setup
- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — on-chain + storage

## References

- [Chain Patterns](../../../patterns/CHAIN.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [ethers v6 Docs](https://docs.ethers.org/v6/)
