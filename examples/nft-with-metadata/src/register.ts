import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function register(filePath: string, metadata: string): Promise<{ rootHash: string; fileId: number }> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');
  if (!process.env.REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS not set in .env — deploy first');

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

  // Step 1: Upload file to 0G Storage
  console.log(`Uploading ${filePath} to 0G Storage...`);
  const indexer = new Indexer(process.env.STORAGE_INDEXER);
  const file = await ZgFile.fromFilePath(filePath);

  let rootHash: string;
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);
    rootHash = tree!.rootHash()!;
    console.log('Root hash:', rootHash);

    const [result, uploadErr] = await indexer.upload(file, process.env.RPC_URL, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    // upload() returns a union: the singular shape for one file, the plural
    // shape ({ txHashes, rootHashes, txSeqs }) when the file was fragmented.
    const txHash = 'txHash' in result ? result.txHash : result.txHashes[0];
    console.log('Upload tx:', txHash);
  } finally {
    await file.close();
  }

  // Step 2: Register root hash on-chain
  console.log('\nRegistering on-chain...');
  const artifactPath = path.resolve(__dirname, '../artifacts/StorageRegistry.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));

  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, artifact.abi, wallet);

  // Convert root hash to bytes32 (pad if needed)
  const rootHashBytes32 = ethers.zeroPadValue(rootHash, 32);
  const regTx = await registry.registerFile(rootHashBytes32, metadata);
  const receipt = await regTx.wait();

  // Extract file ID from event
  const event = receipt.logs.find((l: any) => l.fragment?.name === 'FileRegistered');
  const fileId = Number(event?.args?.[0] ?? 0);

  console.log(`Registered! File ID: ${fileId}`);
  console.log(`Retrieve with: npx tsx src/retrieve.ts ${fileId}`);

  return { rootHash, fileId };
}

// CLI entrypoint
const filePath = process.argv[2];
const metadata = process.argv[3] || '';
if (!filePath) {
  console.error('Usage: npx tsx src/register.ts <file-path> ["metadata description"]');
  process.exit(1);
}

register(filePath, metadata).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
