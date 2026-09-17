# AgenticID Accounts and Costs

## Metadata

- **Category**: agentic-id
- **SDK**: `@0gfoundation/0g-agenticid-sdk` ^0.1.6, `viem` ^2.21.0
- **Activation Triggers**: "fund an agent", "agent balance", "sandbox balance", "acknowledge trust
  root", "agent runtime cost", "withdraw agent funds", "agent refund"

## Purpose

Fund and account for an AgenticID agent: acknowledge the TEE trust root, top up the prepaid sandbox
balance that pays for container runtime, top up the agent's own gas, read costs and runway, and
withdraw prepaid funds.

> **This layer uses `viem`, not `ethers`.** The repo-wide ethers rule does not apply to `agentic-id`
> skills.

## Three balances, and they are not interchangeable

Funding the wrong one looks like the right fix and changes nothing.

| Balance                 | Read with                          | Funded by                   | Pays for                        |
| ----------------------- | ---------------------------------- | --------------------------- | ------------------------------- |
| Prepaid **sandbox**     | `ag.getBalance()`                  | `ag.deposit()`              | container runtime, per-minute   |
| The **agentSeal's** gas | native balance of the seal address | `ag.agent.topUpAgentSeal()` | the agent's own on-chain writes |
| **Your wallet**         | `ag.nativeBalance()`               | a faucet or a transfer      | gas for _your_ transactions     |

## Prerequisites

- Node.js >= 20
- `@0gfoundation/0g-agenticid-sdk` and `viem` installed
- `.env` with `PRIVATE_KEY`

## Quick Workflow

1. `ackStatus()`, then `ack()` if anything is missing
2. `deposit()` to at least **0.1 OG** so deploys pass preflight
3. `estimateCosts()` to see burn rate and runway
4. `topUpAgentSeal()` separately if the agent itself writes on chain

## Core Rules

### ALWAYS

- Acknowledge the trust root before deploying; a fresh wallet is missing all components
- Keep the prepaid sandbox balance at or above **0.1 OG** (`MIN_SANDBOX_BALANCE_WEI`)
- Await `waitForTransaction()` after `ack` / `deposit` / `topUpAgentSeal` before reading state back;
  these return before mining
- Use `getEffectiveBalance()` when you need what is genuinely spendable, not just the raw deposit
- Read pricing from `estimateCosts()` rather than assuming it

### NEVER

- Confuse `deposit()` with `topUpAgentSeal()`; they fund different accounts for different things
- Expect `requestRefund()` to pay out immediately; withdrawal is a time-locked two-step
- Treat `getBalance()` as spendable when refunds are pending or debt is outstanding
- Hardcode a private key

## Code Examples

### Acknowledge the trust root

The TEE trust root spans several components (attestor, KMS, sandbox provider). One `ack()` covers
whatever is missing, and returns `null` when nothing was.

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';
import 'dotenv/config';

async function acknowledge() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const status = await ag.ackStatus();
  console.log('allAcked:', status.allAcked);
  if (!status.allAcked) console.log('missing:', status.missing.join(', '));

  const tx = await ag.ack(); // null when there was nothing to acknowledge
  if (tx) {
    await ag.waitForTransaction(tx);
    console.log('acknowledged');
  }

  // Per-component detail, including the image hashes you are attesting to.
  for (const c of await ag.components()) {
    console.log(`${c.appId}  acked=${c.acked}  version=${c.ackVersion}`);
  }
  return ag.ackStatus();
}
```

On a fresh wallet this reported three missing components (`0g-agentic-id`, `0g-kms`,
`0g-agentic-id-sandbox-provider`), and a single `ack()` cleared all three.

### Fund the sandbox balance

```typescript
import { AgenticID } from '@0gfoundation/0g-agenticid-sdk';
import { parseEther, formatEther } from 'viem';
import 'dotenv/config';

async function fundSandbox() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  console.log('before:', formatEther(await ag.getBalance()), 'OG');

  // Deploys are gated at 0.1 OG; deposit more to buy runway.
  const tx = await ag.deposit({ amountWei: parseEther('0.5') });
  await ag.waitForTransaction(tx); // returns before mining without this

  console.log('after :', formatEther(await ag.getBalance()), 'OG');
}
```

### Read the full account, not just the deposit

`getBalance()` is the raw prepaid figure. `getEffectiveBalance()` nets off what is reserved, owed or
mid-settlement, which is what actually determines whether a deploy proceeds.

```typescript
async function accountView() {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const detail = await ag.getBalanceDetail();
  // { balance, pendingRefund, refundUnlockAt }
  console.log('balance       :', formatEther(detail.balance), 'OG');
  console.log('pendingRefund :', formatEther(detail.pendingRefund), 'OG');

  const eff = await ag.getEffectiveBalance();
  // { balanceWei, reservedWei, outstandingDebtWei, pendingSettlementWei, availableWei }
  console.log('available     :', formatEther(eff.availableWei), 'OG');
  console.log('reserved      :', formatEther(eff.reservedWei), 'OG');
  console.log('debt          :', formatEther(eff.outstandingDebtWei), 'OG');

  console.log('my wallet gas :', formatEther(await ag.nativeBalance()), 'OG');
  return { detail, eff };
}
```

### Costs and runway

```typescript
async function costs(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const est = await ag.agent.estimateCosts();
  console.log('create fee    :', formatEther(est.pricing.createFee), 'OG');
  console.log('per CPU/min   :', formatEther(est.pricing.pricePerCPUPerMin), 'OG');
  console.log('per GB mem/min:', formatEther(est.pricing.pricePerMemGBPerMin), 'OG');
  console.log('cost per min  :', formatEther(est.costPerMinWei), 'OG');
  console.log('runway        :', est.estimatedRunwayMinutes, 'min');

  // Per-agent view, including that agent's own evolution-gas balance.
  const rt = await ag.agent.runtimeCosts(agentId);
  console.log(
    'agent runtime :',
    JSON.stringify(rt, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)),
  );
  return est;
}
```

Runway is derived from the prepaid balance, so it reads 0 before you deposit.

### Top up the agent's own gas

Separate from the sandbox balance. This funds the `agentSeal` address so the agent can pay for its
own on-chain writes, such as committing an iData update.

```typescript
async function fundAgentGas(agentId: bigint) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const agentSeal = await ag.agent.getAgentSeal(agentId);
  const tx = await ag.agent.topUpAgentSeal(agentSeal, parseEther('0.01'));
  await ag.agent.waitForTransaction(tx);

  console.log(`topped up ${agentSeal}`);
}
```

### Withdraw prepaid funds

Two steps with a time lock between them: request, wait for the unlock, then withdraw.

```typescript
async function withdraw(amount: string) {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const reqTx = await ag.requestRefund({ amountWei: parseEther(amount) });
  await ag.waitForTransaction(reqTx);

  const { pendingRefund, refundUnlockAt } = await ag.getBalanceDetail();
  console.log(
    `${formatEther(pendingRefund)} OG unlocks at ${new Date(Number(refundUnlockAt) * 1000).toISOString()}`,
  );

  // Later, once the unlock time has passed:
  if (Date.now() / 1000 >= Number(refundUnlockAt)) {
    const wTx = await ag.withdrawRefund();
    await ag.waitForTransaction(wTx);
    console.log('withdrawn');
  } else {
    console.log('still locked; withdrawRefund() would revert');
  }
}
```

### Preflight before a batch of deploys

```typescript
async function ready(): Promise<boolean> {
  const ag = await AgenticID.fromAttestor('https://agenticid.0g.ai', {
    account: process.env.PRIVATE_KEY as `0x${string}`,
  });

  const { allAcked, missing } = await ag.ackStatus();
  const { availableWei } = await ag.getEffectiveBalance();
  const floor = parseEther('0.1');

  if (!allAcked) console.log('not acked:', missing.join(', '));
  if (availableWei < floor) console.log('available below 0.1 OG:', formatEther(availableWei));

  return allAcked && availableWei >= floor;
}
```

## Anti-Patterns

```typescript
// BAD: topping up the agent's gas when the deploy is gated on the sandbox floor
await ag.agent.topUpAgentSeal(agentSeal, parseEther('0.5')); // wrong account

// BAD: reading a balance straight after depositing, without the receipt
const tx = await ag.deposit({ amountWei: parseEther('0.5') });
console.log(await ag.getBalance()); // may still be the old value

// BAD: treating the raw deposit as spendable
if ((await ag.getBalance()) > parseEther('0.1')) {
  /* reserved funds and debt are not netted off here */
}

// BAD: withdrawing immediately after requesting
await ag.requestRefund({ amountWei: parseEther('0.2') });
await ag.withdrawRefund(); // reverts: still time-locked
```

## Common Errors & Fixes

| Error                               | Cause                        | Fix                                             |
| ----------------------------------- | ---------------------------- | ----------------------------------------------- |
| Deploy preflight names missing acks | Trust root not acknowledged  | `await ag.ack()` and wait for the receipt       |
| Deploy preflight fails on balance   | Prepaid balance below 0.1 OG | `ag.deposit({ amountWei: parseEther('0.15') })` |
| `withdrawRefund()` reverts          | Still inside the time lock   | Wait until `refundUnlockAt`                     |
| Balance looks unchanged             | Read before mining           | `await ag.waitForTransaction(tx)`               |
| Runway reads 0                      | No prepaid balance yet       | Deposit, then re-read `estimateCosts()`         |
| Agent cannot write on chain         | `agentSeal` has no gas       | `topUpAgentSeal(seal, amount)`                  |

## Related Skills

- [Deploy Agent](../deploy-agent/SKILL.md) — the preflight these calls satisfy
- [Manage Agent](../manage-agent/SKILL.md) — stopping a container to stop the burn
- [Interact Agent](../interact-agent/SKILL.md) — calling a running agent
- [Agent Reputation](../agent-reputation/SKILL.md) — serve-proofs and feedback

## References

- [patterns/AGENTIC_ID.md](../../../patterns/AGENTIC_ID.md)
- [SDK reference](https://github.com/0gfoundation/0g-agentic-id/blob/main/sdk/typescript/README.md)
