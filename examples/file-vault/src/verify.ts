import { ZgFile } from '@0gfoundation/0g-storage-ts-sdk';
import * as fs from 'fs';

async function verify(filePath: string): Promise<string> {
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);
    return tree!.rootHash()!;
  } finally {
    await file.close();
  }
}

// CLI entrypoint
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: npx tsx src/verify.ts <file-path>');
  process.exit(1);
}

verify(filePath)
  .then((hash) => console.log('Root hash:', hash))
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
