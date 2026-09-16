import { Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function download(rootHash: string, outputPath: string): Promise<void> {
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');

  if (!rootHash.startsWith('0x') || rootHash.length < 10) {
    throw new Error('Invalid root hash format (must start with 0x)');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  console.log(`Downloading ${rootHash} to ${outputPath}...`);

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
const rootHash = process.argv[2];
const outputPath = process.argv[3] || `./download-${Date.now()}`;
if (!rootHash) {
  console.error('Usage: npx tsx src/download.ts <root-hash> [output-path]');
  process.exit(1);
}

download(rootHash, outputPath).catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
