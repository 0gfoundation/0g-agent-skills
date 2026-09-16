import { Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function retrieve(fileId: number, outputPath: string): Promise<void> {
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');
  if (!process.env.REGISTRY_ADDRESS) throw new Error('REGISTRY_ADDRESS not set in .env');

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);

  // Step 1: Read from chain
  const artifactPath = path.resolve(__dirname, '../artifacts/StorageRegistry.json');
  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
  const registry = new ethers.Contract(process.env.REGISTRY_ADDRESS, artifact.abi, provider);

  console.log(`Reading file record #${fileId} from chain...`);
  const record = await registry.getFile(fileId);

  const rootHash = record.rootHash;
  console.log('Root hash:', rootHash);
  console.log('Uploader:', record.uploader);
  console.log('Timestamp:', new Date(Number(record.timestamp) * 1000).toISOString());
  console.log('Metadata:', record.metadata);

  // Step 2: Download from 0G Storage with verification
  console.log(`\nDownloading from 0G Storage...`);

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const indexer = new Indexer(process.env.STORAGE_INDEXER);

  // download() can THROW in addition to returning errors — handle both
  try {
    const err = await indexer.download(rootHash, outputPath, true);
    if (err) throw err;
  } catch (error: any) {
    throw new Error(`Download failed: ${error.message}`);
  }

  const stats = fs.statSync(outputPath);
  console.log(`Downloaded and verified: ${outputPath} (${stats.size} bytes)`);
}

// CLI entrypoint
const fileId = Number(process.argv[2]);
const outputPath = process.argv[3] || `./retrieved-${Date.now()}`;
if (isNaN(fileId)) {
  console.error('Usage: npx tsx src/retrieve.ts <file-id> [output-path]');
  process.exit(1);
}

retrieve(fileId, outputPath).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
