import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function setup(providerAddress: string): Promise<void> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Step 1: Deposit to main account (depositFund takes a number in 0G)
  const depositAmount = 0.05;
  console.log(`Depositing ${depositAmount} 0G to main account...`);
  await broker.ledger.depositFund(depositAmount);

  // getLedger() -> [user, availableBalance, totalBalance, additionalInfo]
  const ledger = await broker.ledger.getLedger();
  console.log(`Main account balance: ${ethers.formatEther(ledger.availableBalance)} 0G available`);

  // Step 2: Transfer to provider sub-account.
  // transferFund(provider, serviceType, amount)
  // The SDK warns below 1 0G — providers may reject requests against an
  // underfunded sub-account, so raise this for real use.
  const transferAmount = ethers.parseEther('1');
  console.log(`\nTransferring 1 0G to provider ${providerAddress}...`);
  await broker.ledger.transferFund(providerAddress, 'inference', transferAmount);

  // Step 3: Acknowledge provider (required before first use).
  // Use checkProviderSignerStatus() rather than acknowledged(): the latter
  // reverts with AccountNotExists when the sub-account does not exist yet.
  const status = await broker.inference.checkProviderSignerStatus(providerAddress);
  if (status.isAcknowledged) {
    console.log(`Already acknowledged (TEE signer ${status.teeSignerAddress})`);
  } else {
    console.log('Acknowledging provider signer...');
    await broker.inference.acknowledgeProviderSigner(providerAddress);
  }

  console.log('\nSetup complete! You can now chat with this provider.');
}

// CLI entrypoint
const providerAddress = process.argv[2];
if (!providerAddress) {
  console.error('Usage: npx tsx src/setup.ts <provider-address>');
  process.exit(1);
}

setup(providerAddress).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
