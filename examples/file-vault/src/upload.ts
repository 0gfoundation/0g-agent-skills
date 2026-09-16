import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import 'dotenv/config';

async function upload(filePath: string): Promise<string> {
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');

  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
  const stats = fs.statSync(filePath);
  if (stats.size === 0) throw new Error('Cannot upload empty file');

  console.log(`Uploading ${filePath} (${stats.size} bytes)...`);

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  const indexer = new Indexer(process.env.STORAGE_INDEXER);

  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, treeErr] = await file.merkleTree();
    if (treeErr) throw new Error(`Merkle tree error: ${treeErr}`);

    const rootHash = tree!.rootHash()!;
    console.log('Root hash:', rootHash);

    console.log('Uploading to 0G Storage...');
    const [result, uploadErr] = await indexer.upload(file, process.env.RPC_URL, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    // upload() returns a union: the singular shape for one file, the plural
    // shape ({ txHashes, rootHashes, txSeqs }) when the file was fragmented.
    const txHash = 'txHash' in result ? result.txHash : result.txHashes[0];
    console.log('Upload complete! Tx:', txHash);
    return rootHash;
  } finally {
    await file.close();
  }
}

// CLI entrypoint
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx src/upload.ts <file-path>');
  process.exit(1);
}

upload(filePath)
  .then((hash) => console.log('\nStored with root hash:', hash))
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
