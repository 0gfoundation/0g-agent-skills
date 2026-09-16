import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import 'dotenv/config';

async function chat(providerAddress: string, userMessage: string): Promise<string> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  // Get provider endpoint and model
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`Using model: ${model}`);

  // Generate auth headers
  const headers = await broker.inference.getRequestHeaders(providerAddress);

  const messages = [{ role: 'user', content: userMessage }];

  const response = await fetch(`${endpoint}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ messages, model }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const answer = data.choices[0].message.content;

  // CRITICAL: Extract ChatID — header first, body fallback (chatbot only)
  let chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (!chatID) chatID = data.id;

  // CRITICAL: processResponse for fee settlement
  // Param order: (providerAddress, chatID, usageData)
  await broker.inference.processResponse(
    providerAddress,
    chatID ?? undefined,
    JSON.stringify(data.usage)
  );

  return answer;
}

// CLI entrypoint
const providerAddress = process.argv[2];
const userMessage = process.argv[3];
if (!providerAddress || !userMessage) {
  console.error('Usage: npx tsx src/chat.ts <provider-address> "your prompt"');
  process.exit(1);
}

chat(providerAddress, userMessage)
  .then((answer) => {
    console.log('\nAI:', answer);
  })
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
