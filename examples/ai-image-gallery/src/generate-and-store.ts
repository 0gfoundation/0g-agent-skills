import { ethers } from 'ethers';
import { createZGComputeNetworkBroker } from '@0gfoundation/0g-compute-ts-sdk';
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import 'dotenv/config';

async function generateAndStore(providerAddress: string, prompt: string, size = '512x512'): Promise<string> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');

  const ethersProvider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, ethersProvider);

  // --- Step 1: Generate image with AI ---
  console.log('Initializing compute broker...');
  const broker = await createZGComputeNetworkBroker(wallet);
  const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
  console.log(`Using model: ${model}`);

  const requestBody = { model, prompt, n: 1, size };

  // Include body for request signing (required for images)
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

  // CRITICAL: processResponse for fee settlement
  // ChatID from header ONLY for images (no body fallback)
  const chatID = response.headers.get('ZG-Res-Key') || response.headers.get('zg-res-key');
  if (chatID) {
    await broker.inference.processResponse(providerAddress, chatID);
  }

  // Save to temp file
  const tempPath = path.join(os.tmpdir(), `0g-image-${Date.now()}.png`);
  const imageData = data.data[0];
  if (imageData.b64_json) {
    fs.writeFileSync(tempPath, Buffer.from(imageData.b64_json, 'base64'));
  } else if (imageData.url) {
    const imgResponse = await fetch(imageData.url);
    fs.writeFileSync(tempPath, Buffer.from(await imgResponse.arrayBuffer()));
  }

  console.log('Image generated successfully');

  // --- Step 2: Upload to 0G Storage ---
  console.log('Uploading to 0G Storage...');
  const indexer = new Indexer(process.env.STORAGE_INDEXER);
  const file = await ZgFile.fromFilePath(tempPath);

  let rootHash: string;
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);
    rootHash = tree!.rootHash()!;

    const [result, uploadErr] = await indexer.upload(file, process.env.RPC_URL, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    // upload() returns a union: the singular shape for one file, the plural
    // shape ({ txHashes, rootHashes, txSeqs }) when the file was fragmented.
    const txHash = 'txHash' in result ? result.txHash : result.txHashes[0];
    console.log('Upload tx:', txHash);
  } finally {
    await file.close();
    fs.unlinkSync(tempPath); // Clean up temp file
  }

  console.log(`\nImage generated and stored on 0G!`);
  console.log(`Root hash: ${rootHash}`);
  return rootHash;
}

// CLI entrypoint
const providerAddress = process.argv[2];
const prompt = process.argv[3];
if (!providerAddress || !prompt) {
  console.error('Usage: npx tsx src/generate-and-store.ts <provider-address> "your prompt"');
  process.exit(1);
}

generateAndStore(providerAddress, prompt).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
