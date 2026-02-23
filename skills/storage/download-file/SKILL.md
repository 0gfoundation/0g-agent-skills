---
name: download-file
description: |
  Download and verify files from 0G decentralized storage using a root hash. Use this skill for download file, retrieve from 0G, get file, fetch from storage.
---

# Download File from 0G Storage

## Metadata

- **Category**: storage
- **SDK**: `@0glabs/0g-ts-sdk` ^0.3.3, `ethers` ^6.13.0
- **Activation Triggers**: "download file", "retrieve from 0G", "get file", "fetch from storage"

## Purpose

Download and verify files from 0G decentralized storage using a root hash. Supports verified
downloads with Merkle proof validation to ensure data integrity.

## Prerequisites

- Node.js >= 18
- `@0glabs/0g-ts-sdk` installed
- Root hash of the file to download
- `.env` with `STORAGE_INDEXER`

## Quick Workflow

1. Create an `Indexer` instance
2. Call `indexer.download()` with the root hash, output path, and verified flag
3. The file is downloaded and optionally verified via Merkle proofs

## Core Rules

### ALWAYS

- Use verified downloads in production (third param = `true`)
- Validate root hash format before downloading
- Check output directory exists before download
- Handle download errors gracefully

### NEVER

- Use unverified downloads for critical data
- Assume a root hash is valid without checking
- Download to paths without write permissions

## Code Examples

### Basic Download

```typescript
import { Indexer } from '@0glabs/0g-ts-sdk';
import 'dotenv/config';

async function downloadFile(rootHash: string, outputPath: string): Promise<void> {
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  // Download with Merkle verification (recommended)
  // Note: download() can throw errors (e.g., JsonRpcError) in addition to returning them
  try {
    const err = await indexer.download(rootHash, outputPath, true);
    if (err) throw err;
  } catch (error: any) {
    throw new Error(`Download failed: ${error.message}`);
  }
  console.log(`Downloaded to ${outputPath}`);
}

// Usage
await downloadFile('0xabc123...', './downloads/my-file.pdf');
```

### Download with Validation

```typescript
import { Indexer } from '@0glabs/0g-ts-sdk';
import * as fs from 'fs';
import * as path from 'path';
import 'dotenv/config';

async function downloadWithValidation(rootHash: string, outputPath: string): Promise<void> {
  if (!process.env.STORAGE_INDEXER) {
    throw new Error('STORAGE_INDEXER not set in .env');
  }

  // Validate root hash format
  if (!rootHash.startsWith('0x') || rootHash.length < 10) {
    throw new Error('Invalid root hash format');
  }

  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  try {
    // download() can throw OR return an error — handle both
    const err = await indexer.download(rootHash, outputPath, true);
    if (err) throw err;
    console.log(`Downloaded and verified: ${outputPath}`);

    const stats = fs.statSync(outputPath);
    console.log(`File size: ${stats.size} bytes`);
  } catch (error: any) {
    if (error.message?.includes('not found') || error.message?.includes('JsonRpc')) {
      throw new Error(`File not found for root hash: ${rootHash}`);
    }
    throw error;
  }
}
```

### Batch Download

```typescript
async function downloadBatch(
  files: Array<{ rootHash: string; outputPath: string }>,
): Promise<void> {
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  const results = await Promise.allSettled(
    files.map(async ({ rootHash, outputPath }) => {
      const err = await indexer.download(rootHash, outputPath, true);
      if (err) throw err;
    }),
  );

  results.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      console.log(`Downloaded: ${files[i].outputPath}`);
    } else {
      console.error(`Failed: ${files[i].rootHash} — ${result.reason}`);
    }
  });
}
```

## Anti-Patterns

```typescript
// BAD: Unverified download in production
await indexer.download(rootHash, outputPath, false);

// BAD: No error handling — download() can THROW in addition to returning errors
await indexer.download(rootHash, outputPath, true);
// If file doesn't exist, throws JsonRpcError!

// GOOD: Proper error handling
try {
  const err = await indexer.download(rootHash, outputPath, true);
  if (err) throw err;
} catch (error) {
  console.error('Download failed:', error);
}

// BAD: Downloading to non-existent directory
await indexer.download(rootHash, '/nonexistent/path/file.txt', true);
```

## Common Errors & Fixes

| Error                   | Cause                             | Fix                                  |
| ----------------------- | --------------------------------- | ------------------------------------ |
| `file not found`        | Invalid or non-existent root hash | Verify the root hash is correct      |
| `verification failed`   | Data integrity check failed       | Re-download or report issue          |
| `ENOENT`                | Output directory doesn't exist    | Create directory with `fs.mkdirSync` |
| `EACCES`                | No write permission               | Check file system permissions        |
| `indexer not available` | Wrong indexer URL                 | Check `STORAGE_INDEXER` in `.env`    |

## Related Skills

- [Upload File](../upload-file/SKILL.md) — upload files to get root hashes
- [Merkle Verification](../merkle-verification/SKILL.md) — verify data integrity
- [Compute + Storage](../../cross-layer/compute-plus-storage/SKILL.md) — AI with storage I/O

## References

- [Storage Patterns](../../../patterns/STORAGE.md)
- [Network Config](../../../patterns/NETWORK_CONFIG.md)
- [0G Storage SDK Docs](https://docs.0g.ai/build-with-0g/storage-network/sdk)
