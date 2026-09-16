# Storage Patterns

Architecture, SDK reference, and best practices for 0G decentralized storage.

## Architecture Overview

```
┌─────────────────────────────────┐
│          Log Layer              │
│   (Raw file / blob storage)    │
├─────────────────────────────────┤
│       0G Consensus              │
│   (Data availability proofs)   │
└─────────────────────────────────┘
```

## Log Layer (File Storage)

### Core Concepts

- **ZgFile**: Represents a file in the 0G storage system
- **Merkle Tree**: Every file is split into chunks and organized as a Merkle tree
- **Root Hash**: The Merkle root — unique identifier for the file content
- **Indexer**: Service that locates data across storage nodes

### File Upload Lifecycle

1. Create a `ZgFile` from local file path or buffer
2. Generate the Merkle tree (computes root hash)
3. Upload via the Indexer (distributes chunks to storage nodes)
4. Store the root hash for later retrieval
5. **Close the file handle** (critical — prevents memory leaks)

### Upload Pattern

```typescript
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const indexer = new Indexer(process.env.STORAGE_INDEXER!);
const file = await ZgFile.fromFilePath(filePath);

try {
  const [tree, err] = await file.merkleTree();
  if (err) throw err;

  const rootHash = tree!.rootHash();
  console.log('Root hash:', rootHash);

  const [result, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  console.log('Upload tx:', result.txHash);

  return rootHash;
} finally {
  await file.close();
}
```

### Download Pattern

```typescript
import { Indexer } from '@0gfoundation/0g-storage-ts-sdk';

const indexer = new Indexer(process.env.STORAGE_INDEXER!);

// download() can throw OR return an error — always use try/catch
try {
  const err = await indexer.download(rootHash, outputPath, /* verified */ true);
  if (err) throw err;
} catch (error: any) {
  throw new Error(`Download failed: ${error.message}`);
}
```

### Upload from Buffer

```typescript
import { ZgFile } from '@0gfoundation/0g-storage-ts-sdk';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// Write buffer to temp file (SDK requires file path)
const tempPath = path.join(os.tmpdir(), `0g-upload-${Date.now()}`);
fs.writeFileSync(tempPath, buffer);

const file = await ZgFile.fromFilePath(tempPath);
try {
  const [tree, err] = await file.merkleTree();
  if (err) throw err;
  const rootHash = tree!.rootHash();
  const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
  if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
  return rootHash;
} finally {
  await file.close();
  fs.unlinkSync(tempPath); // Clean up temp file
}
```

## Merkle Verification

### Computing Root Hash

```typescript
import { ZgFile } from '@0gfoundation/0g-storage-ts-sdk';

const file = await ZgFile.fromFilePath(filePath);
try {
  const [tree, err] = await file.merkleTree();
  if (err) throw err;
  console.log('Root hash:', tree.rootHash());
} finally {
  await file.close();
}
```

### Verified Download

```typescript
// The third parameter enables Merkle proof verification
// Note: download() can throw or return errors — always use try/catch
try {
  const err = await indexer.download(rootHash, outputPath, true);
  if (err) throw err;
} catch (error: any) {
  throw new Error(`Download failed: ${error.message}`);
}
```

## Critical Rules

### ALWAYS

- Generate the Merkle tree before uploading
- Close file handles after upload (`file.close()`)
- Store root hashes — they are the ONLY way to retrieve files
- Use verified downloads in production (third param = `true`)
- Clean up temp files when uploading from buffers

### NEVER

- Skip Merkle tree generation before upload
- Forget to close `ZgFile` handles (causes memory leaks)
- Lose the root hash (data becomes irretrievable)
- Upload without a funded wallet (transaction will fail)

## Common Errors

| Error                   | Cause                      | Fix                                 |
| ----------------------- | -------------------------- | ----------------------------------- |
| `merkle tree error`     | File is empty or corrupted | Verify file exists and has content  |
| `insufficient funds`    | Wallet has no 0G           | Fund wallet from faucet (testnet)   |
| `indexer not available` | Wrong indexer URL          | Check STORAGE_INDEXER in .env       |
| `file not found`        | Root hash doesn't exist    | Verify root hash is correct         |
| `connection refused`    | RPC endpoint down          | Try alternative RPC or check status |

## References

- [0G Storage SDK Docs](https://docs.0g.ai/build-with-0g/storage-network/sdk)
- [0G Storage Architecture](https://docs.0g.ai/learn/0g-storage)
- See also: [NETWORK_CONFIG.md](./NETWORK_CONFIG.md), [SECURITY.md](./SECURITY.md)
