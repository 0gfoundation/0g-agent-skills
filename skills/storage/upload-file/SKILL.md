---
name: upload-file
description: |
  Upload files to 0G decentralized storage using the ZgFile API and Indexer. Use this skill for upload file, store on 0G, ZgFile, save to storage.
---

# Upload File to 0G Storage

## Metadata

- **Category**: storage
- **SDK**: `@0glabs/0g-ts-sdk` ^0.3.3, `ethers` ^6.13.0
- **Activation Triggers**: "upload file", "store on 0G", "ZgFile", "save to storage"

## Purpose

Upload files to 0G decentralized storage using the ZgFile API and Indexer. Files are split into
chunks, organized as a Merkle tree, and distributed across storage nodes. Returns a root hash for
later retrieval.

## Prerequisites

- Node.js >= 18
- `@0glabs/0g-ts-sdk` and `ethers` installed
- Funded wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `STORAGE_INDEXER`

## Quick Workflow

1. Initialize ethers provider and wallet from `.env`
2. Create an `Indexer` instance
3. Create a `ZgFile` from the file path
4. Generate the Merkle tree (computes root hash)
5. Upload via the Indexer
6. **Close the file handle** (critical!)
7. Return/store the root hash

## Core Rules

### ALWAYS

- Generate the Merkle tree BEFORE uploading
- Close file handles after upload (`file.close()`)
- Store root hashes — they are the ONLY way to retrieve files later
- Use try/finally to ensure file handles are closed
- Load private keys from environment variables

### NEVER

- Skip Merkle tree generation before upload
- Forget to close `ZgFile` handles (causes memory leaks)
- Hardcode private keys in source code
- Lose the root hash (data becomes irretrievable)

## Code Examples

### Basic File Upload

```typescript
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

async function uploadFile(filePath: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);

    const rootHash = tree!.rootHash();
    console.log('Root hash:', rootHash);

    const [tx, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    console.log('Upload tx:', tx);

    return rootHash;
  } finally {
    await file.close();
  }
}

// Usage
const rootHash = await uploadFile('./my-document.pdf');
console.log('Stored with root hash:', rootHash);
```

### Upload from Buffer

```typescript
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import 'dotenv/config';

async function uploadBuffer(data: Buffer, filename: string): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  // SDK requires file path — write buffer to temp file
  const tempPath = path.join(os.tmpdir(), `0g-upload-${Date.now()}-${filename}`);
  fs.writeFileSync(tempPath, data);

  const file = await ZgFile.fromFilePath(tempPath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);

    const rootHash = tree!.rootHash();
    const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    return rootHash;
  } finally {
    await file.close();
    fs.unlinkSync(tempPath); // Clean up temp file
  }
}

// Usage
const jsonData = Buffer.from(JSON.stringify({ key: 'value' }));
const rootHash = await uploadBuffer(jsonData, 'data.json');
```

### Upload with Progress and Error Handling

```typescript
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import * as fs from 'fs';
import 'dotenv/config';

async function uploadWithValidation(filePath: string): Promise<string> {
  // Validate environment
  if (!process.env.PRIVATE_KEY) throw new Error('PRIVATE_KEY not set in .env');
  if (!process.env.RPC_URL) throw new Error('RPC_URL not set in .env');
  if (!process.env.STORAGE_INDEXER) throw new Error('STORAGE_INDEXER not set in .env');

  // Validate file exists
  if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);

  const stats = fs.statSync(filePath);
  if (stats.size === 0) throw new Error('Cannot upload empty file');
  console.log(`Uploading ${filePath} (${stats.size} bytes)...`);

  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  // Check wallet balance
  const balance = await provider.getBalance(wallet.address);
  if (balance === 0n) throw new Error('Wallet has no 0G tokens');

  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const file = await ZgFile.fromFilePath(filePath);

  try {
    console.log('Generating Merkle tree...');
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree generation failed: ${err}`);

    const rootHash = tree!.rootHash();
    console.log('Root hash:', rootHash);

    console.log('Uploading to 0G Storage...');
    const [tx, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    console.log('Upload complete! Tx:', tx);

    return rootHash;
  } finally {
    await file.close();
  }
}
```

## Anti-Patterns

```typescript
// BAD: Missing file.close() — memory leak
const file = await ZgFile.fromFilePath('data.txt');
const [tree] = await file.merkleTree();
await indexer.upload(file, process.env.RPC_URL!, wallet);
// file.close() never called!

// BAD: Uploading without Merkle tree
const file = await ZgFile.fromFilePath('data.txt');
await indexer.upload(file, process.env.RPC_URL!, wallet); // May fail or produce invalid upload
await file.close();

// BAD: Hardcoded private key
const wallet = new ethers.Wallet('0xabc123...', provider);

// BAD: Not storing root hash
await indexer.upload(file, process.env.RPC_URL!, wallet); // Root hash lost!

// BAD: Wrong upload signature (missing RPC URL)
await indexer.upload(file, wallet); // TypeError — must pass RPC URL as second arg
```

## Common Errors & Fixes

| Error                   | Cause                   | Fix                                 |
| ----------------------- | ----------------------- | ----------------------------------- |
| `Merkle tree error`     | Empty or corrupted file | Verify file exists and has content  |
| `insufficient funds`    | Wallet has no 0G tokens | Fund wallet from faucet (testnet)   |
| `indexer not available` | Wrong indexer URL       | Check `STORAGE_INDEXER` in `.env`   |
| `ENOENT: no such file`  | Invalid file path       | Verify file path is correct         |
| `connection refused`    | RPC endpoint down       | Check network status or try alt RPC |

## Related Skills

- [Download File](../download-file/SKILL.md) — retrieve uploaded files
- [Merkle Verification](../merkle-verification/SKILL.md) — verify data integrity
- [Storage + Chain](../../cross-layer/storage-plus-chain/SKILL.md) — on-chain references

## References

- [Storage Patterns](../../../patterns/STORAGE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [Security Patterns](../../../patterns/SECURITY.md)
- [0G Storage SDK Docs](https://docs.0g.ai/build-with-0g/storage-network/sdk)
