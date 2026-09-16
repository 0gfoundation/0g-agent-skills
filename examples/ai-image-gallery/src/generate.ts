import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import * as fs from 'fs';
import 'dotenv/config';

async function generate(providerAddress: string, prompt: string, size = '512x512'): Promise<string> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const broker = await createZGComputeNetworkBroker(wallet);

  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`Using model: ${model}`);

  const requestBody = { model, prompt, n: 1, size };

  // IMPORTANT: Include body for request signing (required for images)
  const headers = await broker.inference.getRequestHeaders(
    providerAddress,
    JSON.stringify(requestBody),
  );

  console.log(`Generating image: "${prompt}"...`);
  const response = await fetch(`${endpoint}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();

  // ChatID from header ONLY for images (no body fallback)
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (chatID) {
    await broker.inference.processResponse(providerAddress, chatID);
  }

  // Save image locally
  if (!fs.existsSync('./output')) fs.mkdirSync('./output', { recursive: true });
  const outputPath = `./output/image-${Date.now()}.png`;

  const imageData = data.data[0];
  if (imageData.b64_json) {
    fs.writeFileSync(outputPath, Buffer.from(imageData.b64_json, 'base64'));
  } else if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    fs.writeFileSync(outputPath, Buffer.from(await imgResponse.arrayBuffer()));
  }

  console.log(`Image saved to ${outputPath}`);
  return outputPath;
}

// CLI entrypoint
const providerAddress = process.argv[2];
const prompt = process.argv[3];
if (!providerAddress || !prompt) {
  console.error('Usage: npx tsx src/generate.ts <provider-address> "your prompt"');
  process.exit(1);
}

generate(providerAddress, prompt).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
