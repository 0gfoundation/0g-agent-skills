# Account Management

## Metadata

- **Category**: compute
- **SDK**: `@0gfoundation/0g-compute-ts-sdk` ^0.9.0, `ethers` 6.13.1
- **Activation Triggers**: "deposit", "transfer funds", "refund", "check balance", "account balance"

## Purpose

Manage funds across the 0G Compute Network's dual-account system: Main Account (receives deposits)
and Provider Sub-Accounts (one per provider, funds locked for that provider's services).

## Prerequisites

- Node.js >= 22
- `@0gfoundation/0g-compute-ts-sdk` and `ethers` installed
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

```
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

- Check `availableBalance` (not `totalBalance`) before making inference requests
- Read ledger fields by name: `led.availableBalance`, `led.totalBalance`
- Transfer funds to provider sub-account before using their services
- Fund each provider sub-account with at least **1 0G**
- Call `checkProviderSignerStatus()` before `acknowledged()` on a provider's first use
- Wait 24 hours between refund request and completion
- Keep buffer in sub-accounts for uninterrupted service
- Acknowledge provider before first use (`acknowledgeProviderSigner`)
- Use correct `processResponse()` param order: `(providerAddress, chatID, usageData)`
- Extract ChatID from `ZG-Res-Key` header first, body as fallback

### NEVER

- Treat `getLedger()[2]` as available balance — index 2 is **total**, index 1 is **available**
- Call `acknowledged(provider)` before that provider's sub-account exists — it reverts with
  `AccountNotExists`
- Initiate refund during active fine-tuning jobs
- Lock all funds in sub-accounts (keep Main Account balance)
- Forget the 24-hour lock period for refunds
- Hardcode private keys
- Use ethers v5 syntax

## Code Examples

### Check Balance

```typescript
import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function checkBalance() {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // getLedger() returns a hybrid tuple/object:
  //   [user, availableBalance, totalBalance, additionalInfo]
  // Index 1 is AVAILABLE and index 2 is TOTAL — prefer named access so the
  // order can never bite you.
  const led = await broker.ledger.getLedger();

  console.log(`Address:   ${led.user}`);
  console.log(`Total:     ${ethers.formatEther(led.totalBalance)} 0G`);
  console.log(`Available: ${ethers.formatEther(led.availableBalance)} 0G`);
  console.log(`Locked:    ${ethers.formatEther(led.totalBalance - led.availableBalance)} 0G`);

  return led;
}
```

`totalBalance` counts everything you have deposited, **including** funds already transferred into
provider sub-accounts. `availableBalance` is what remains unlocked and spendable. Always base
funding decisions on `availableBalance`.

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

  // 1. Check current balance — availableBalance, never totalBalance
  const led = await broker.ledger.getLedger();
  const available = parseFloat(ethers.formatEther(led.availableBalance));
  console.log(`Available balance: ${available} 0G`);

  // 2. Deposit if needed
  if (available < 5) {
    await broker.ledger.depositFund(10);
    console.log('Deposited 10 0G');
  }

  // 3. Transfer to provider. Use at least 1 0G — the SDK warns below that and
  //    providers may reject requests against an underfunded sub-account.
  await broker.ledger.transferFund(providerAddress, 'inference', ethers.parseEther('5'));
  console.log('Transferred 5 0G to provider');

  // 4. Acknowledge provider. checkProviderSignerStatus() is safe to call before
  //    a sub-account exists; acknowledged() reverts with AccountNotExists.
  const status = await broker.inference.checkProviderSignerStatus(providerAddress);
  if (!status.isAcknowledged) {
    await broker.inference.acknowledgeProviderSigner(providerAddress);
    console.log('Provider acknowledged');
  } else {
    console.log(`Already acknowledged (TEE signer ${status.teeSignerAddress})`);
  }

  console.log('Account setup complete — ready for inference');
}
```

### Background Auto-Funding

Instead of checking balances by hand before every request, let the broker top up the sub-account on
a timer. This runs in the background, so `getRequestHeaders()` takes no extra latency.

```typescript
async function withAutoFunding(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // requiredBalance = unsettledFee + bufferMultiplier * MIN_LOCKED_BALANCE
  await broker.inference.startAutoFunding(providerAddress, {
    interval: 30_000, // check every 30s (default)
    bufferMultiplier: 2, // keep 2x the minimum locked balance (default)
  });

  try {
    // ... issue as many inference requests as you like ...
  } finally {
    broker.inference.stopAutoFunding(providerAddress); // omit arg to stop all
  }
}
```

Auto-funding draws from the ledger's `availableBalance`. If that runs dry the SDK logs a warning
telling you to `broker.ledger.depositFund(n)` — it cannot invent funds.

### Revoking API Keys

`getRequestHeaders()` mints a bearer token for the provider. Tokens come in two kinds:

- **Persistent** — `tokenId` 0–254. Individually revocable; the slot stays occupied until you revoke
  everything.
- **Ephemeral** — `tokenId` 255. **Cannot** be revoked individually; only `revokeAllTokens()`
  invalidates them.

```typescript
async function revokeOne(providerAddress: string, tokenId: number) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Throws if tokenId is 255 (ephemeral) — use revokeAllTokens() for those.
  await broker.inference.revokeApiKey(providerAddress, tokenId);
  console.log(`Token ${tokenId} revoked; its API key is now invalid`);
}

async function revokeEverything(providerAddress: string) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Bumps the generation counter and resets the revocation bitmap: every key
  // (persistent AND ephemeral) becomes invalid and all 255 slots are reclaimed.
  await broker.inference.revokeAllTokens(providerAddress);
  console.log('All API keys for this provider revoked');
}
```

Reach for `revokeAllTokens()` if a key may have leaked, or when you have exhausted the 255
persistent slots and need to reclaim them.

### Error Handling

```typescript
async function safeFundProvider(providerAddress: string, amount: number) {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  try {
    // [user, availableBalance, totalBalance, additionalInfo] — use named access
    const led = await broker.ledger.getLedger();
    const available = parseFloat(ethers.formatEther(led.availableBalance));

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
