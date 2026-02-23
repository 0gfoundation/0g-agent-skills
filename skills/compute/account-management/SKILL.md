---
name: account-management
description: |
  Manage funds across the 0G Compute Network's dual-account system: Main Account and Provider Sub-Accounts. Use this skill for "deposit", "transfer funds", "refund", "check balance", "account balance".
---

# Account Management

## Metadata

- **Category**: compute
- **SDK**: `@0glabs/0g-serving-broker` ^0.6.5, `ethers` ^6.13.0
- **Activation Triggers**: "deposit", "transfer funds", "refund", "check balance", "account balance"

## Purpose

Manage funds across the 0G Compute Network's dual-account system: Main Account (receives deposits)
and Provider Sub-Accounts (one per provider, funds locked for that provider's services).

## Prerequisites

- Node.js >= 22
- `@0glabs/0g-serving-broker` and `ethers` installed
- Wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`

## Quick Workflow

1. Deposit from wallet to Main Account
2. Transfer from Main Account to Provider Sub-Account
3. Use services (fees auto-deducted from sub-account)
4. Request refund (24-hour lock period)
5. Complete refund after lock expires
6. Withdraw from Main Account to wallet

## Fund Flow

```text
Your Wallet
    | deposit
    v
Main Account
    | transfer-fund
    v
Provider Sub-Accounts (one per provider)
    | service usage (auto-deducted)
    | retrieve-fund (24h lock)
    v
Main Account
    | refund
    v
Your Wallet
```

## Core Rules

### ALWAYS

- Check balance before making inference requests
- Transfer funds to provider sub-account before using their services
- Wait 24 hours between refund request and completion
- Keep buffer in sub-accounts for uninterrupted service
- Acknowledge provider before first use (`acknowledgeProviderSigner`)
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header first, body as fallback (chatbot only)

### NEVER

- Initiate refund during active fine-tuning jobs
- Lock all funds in sub-accounts (keep Main Account balance)
- Forget the 24-hour lock period for refunds
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Check Balance

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0glabs/0g-serving-broker';
import 'dotenv/config';

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // getLedger() returns a tuple array: [address, totalBalance, availableBalance, ...]
  const account = await broker.ledger.getLedger();

  console.log(`Address: ${account[0]}`);
  console.log(`Total Balance: ${ethers.formatEther(account[1])} 0G`);
  console.log(`Available: ${ethers.formatEther(account[2])} 0G`);

  return account;
}
```

### Deposit and Transfer

```typescript
async function fundProvider(providerAddress: string, amount: number) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Deposit to Main Account
  await broker.ledger.depositFund(amount);
  console.log(`Deposited ${amount} 0G to Main Account`);

  // Transfer to provider sub-account
  const transferAmount = ethers.parseEther(String(amount));
  await broker.ledger.transferFund(providerAddress, 'inference', transferAmount);
  console.log(`Transferred ${amount} 0G to provider ${providerAddress}`);
}
```

### Check Sub-Account

```typescript
async function checkSubAccount(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // getAccountWithDetail() returns [subAccountTuple, refundsArray]
  // subAccount tuple: [0]=user, [1]=provider, [2]=balance, [3]=pendingRefund, ...
  const [subAccount, refunds] = await broker.inference.getAccountWithDetail(providerAddress);
  console.log(`Sub-account user: ${subAccount[0]}`);
  console.log(`Sub-account provider: ${subAccount[1]}`);
  console.log(`Sub-account balance: ${ethers.formatEther(subAccount[2])} 0G`);

  if (refunds.length > 0) {
    refunds.forEach((refund: any, i: number) => {
      console.log(`Pending refund ${i + 1}:`, refund);
    });
  }
}
```

### Request Refund (Two-Step)

```typescript
async function requestRefund() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Step 1: Initiate refund (starts 24h lock)
  await broker.ledger.retrieveFund('inference');
  console.log('Refund requested — 24h lock period started');

  // Step 2: After 24 hours, complete the refund
  // await broker.ledger.retrieveFund('inference');
  // console.log('Refund completed — funds returned to Main Account');
}
```

### Withdraw to Wallet

```typescript
async function withdrawToWallet(amount: number) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  await broker.ledger.refund(amount);
  console.log(`Withdrew ${amount} 0G to wallet`);
}
```

### Complete Account Setup

```typescript
async function setupForProvider(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // 1. Check current balance (tuple: [0]=addr, [1]=total, [2]=available)
  const account = await broker.ledger.getLedger();
  const available = parseFloat(ethers.formatEther(account[2]));
  console.log(`Available balance: ${available} 0G`);

  // 2. Deposit if needed
  if (available < 5) {
    await broker.ledger.depositFund(10);
    console.log('Deposited 10 0G');
  }

  // 3. Transfer to provider
  await broker.ledger.transferFund(providerAddress, 'inference', ethers.parseEther('5'));
  console.log('Transferred 5 0G to provider');

  // 4. Acknowledge provider
  await broker.inference.acknowledgeProviderSigner(providerAddress);
  console.log('Provider acknowledged');

  console.log('Account setup complete — ready for inference');
}
```

### Error Handling

```typescript
async function safeFundProvider(providerAddress: string, amount: number) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  try {
    // Tuple: [0]=address, [1]=totalBalance, [2]=availableBalance
    const account = await broker.ledger.getLedger();
    const available = parseFloat(ethers.formatEther(account[2]));

    if (available < amount) {
      const depositNeeded = amount - available + 1; // +1 buffer
      console.log(`Insufficient balance. Depositing ${depositNeeded} 0G...`);
      await broker.ledger.depositFund(depositNeeded);
    }

    await broker.ledger.transferFund(
      providerAddress,
      'inference',
      ethers.parseEther(String(amount)),
    );
    console.log(`Successfully funded provider with ${amount} 0G`);
  } catch (error) {
    console.error('Funding failed:', error);
    throw error;
  }
}
```

## CLI Commands Reference

| Action            | CLI Command                                                 |
| ----------------- | ----------------------------------------------------------- |
| Setup network     | `0g-compute-cli setup-network`                              |
| Login             | `0g-compute-cli login`                                      |
| Deposit           | `0g-compute-cli deposit --amount 10`                        |
| Check balance     | `0g-compute-cli get-account`                                |
| Check sub-account | `0g-compute-cli get-sub-account --provider <ADDR>`          |
| Transfer          | `0g-compute-cli transfer-fund --provider <ADDR> --amount 5` |
| Refund (2-step)   | `0g-compute-cli retrieve-fund`                              |
| Withdraw          | `0g-compute-cli refund --amount 5`                          |

## Anti-Patterns

```typescript
// BAD: Not checking balance before operations
await broker.inference.getRequestHeaders(providerAddress);
// May fail with "insufficient balance"

// BAD: Trying to complete refund immediately
await broker.ledger.retrieveFund('inference'); // Start lock
await broker.ledger.retrieveFund('inference'); // Won't work — 24h lock!

// BAD: Locking all funds in one provider
await broker.ledger.transferFund(addr, 'inference', entireBalance);
// No flexibility to use other providers

// BAD: Hardcoding private keys
const wallet = new ethers.Wallet('0xabc123...', provider); // NEVER do this

// BAD: ethers v5 syntax
const provider = new ethers.providers.JsonRpcProvider(url); // v5!
```

## Common Errors & Fixes

| Error                             | Cause                | Fix                                 |
| --------------------------------- | -------------------- | ----------------------------------- |
| `Insufficient balance`            | Main account empty   | `broker.ledger.depositFund(amount)` |
| `Not enough funds in sub-account` | Sub-account empty    | `broker.ledger.transferFund()`      |
| `Refund still locked`             | 24h lock not expired | Wait for lock period                |
| `Provider not acknowledged`       | First-time provider  | `acknowledgeProviderSigner()`       |

## Related Skills

- [Provider Discovery](../provider-discovery/SKILL.md) — find providers to fund
- [Streaming Chat](../streaming-chat/SKILL.md) — uses funded accounts
- [Fine-Tuning](../fine-tuning/SKILL.md) — uses funded accounts

## References

- [Compute Patterns](../../../patterns/COMPUTE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
