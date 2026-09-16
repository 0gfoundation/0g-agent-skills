import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import * as fs from 'fs';
import 'dotenv/config';

async function discover(): Promise<void> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  console.log('Listing all services...\n');
  // listService() is paginated: default limit 50, and the contract reverts with
  // LimitTooLarge above 50. It also hides providers whose TEE signer is not
  // acknowledged unless the third argument is true.
  const services = [];
  for (let offset = 0; ; offset += 50) {
    const page = await broker.inference.listService(offset, 50, true);
    services.push(...page);
    if (page.length < 50) break;
  }

  // Entries are hybrid tuple/objects — named access is clearer than s[0]/s[6].
  const chatbotServices = services.filter((s) => s.serviceType === 'chatbot');

  console.log(`Found ${chatbotServices.length} chatbot provider(s):\n`);

  const providers = chatbotServices.map((s) => ({
    address: s.provider,
    type: s.serviceType,
    model: s.model,
    teeVerified: s.teeSignerAcknowledged,
  }));

  for (const p of providers) {
    console.log(`  Address: ${p.address}`);
    console.log(`  Model:   ${p.model}`);
    console.log(`  TEE:     ${p.teeVerified ? 'verified' : 'unverified'}`);
    console.log();
  }

  fs.writeFileSync('providers.json', JSON.stringify(providers, null, 2));
  console.log('Saved to providers.json');
}

discover().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
