---
name: merkle-verification
description: |
  Compute root hashes and verify data integrity for files stored on 0G Storage. Use this skill for verify file, merkle proof, data integrity, root hash, check file.
---

# Merkle Verification

## Metadata

- **Category**: storage
- **SDK**: `@0glabs/0g-ts-sdk` ^0.3.3
- **Activation Triggers**: "verify file", "merkle proof", "data integrity", "root hash", "check
  file"

## Purpose

Compute root hashes and verify data integrity for files stored on 0G Storage. Uses Merkle tree
proofs to cryptographically verify that downloaded data matches what was originally uploaded.

## Prerequisites

- Node.js >= 18
- `@0glabs/0g-ts-sdk` installed

## Quick Workflow

1. Create a `ZgFile` from the file to verify
2. Generate the Merkle tree
3. Extract the root hash
4. Compare against the expected root hash
5. **Close the file handle**

## Core Rules

### ALWAYS

- Close file handles after computing the Merkle tree
- Use verified downloads (`true` flag) for automatic verification
- Store root hashes securely — they are your proof of data identity

### NEVER

- Skip verification for production data
- Trust a root hash without verifying the source

## Code Examples

### Compute Root Hash

```typescript
import { ZgFile } from '@0glabs/0g-ts-sdk';

async function computeRootHash(filePath: string): Promise<string> {
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);
    return tree.rootHash();
  } finally {
    await file.close();
  }
}

// Usage
const hash = await computeRootHash('./my-file.pdf');
console.log('Root hash:', hash);
```

### Verify File Integrity

```typescript
import { ZgFile } from '@0glabs/0g-ts-sdk';

async function verifyFile(filePath: string, expectedHash: string): Promise<boolean> {
  const file = await ZgFile.fromFilePath(filePath);
  try {
    const [tree, err] = await file.merkleTree();
    if (err) return false;

    const actualHash = tree.rootHash();
    const isValid = actualHash === expectedHash;

    console.log(`Expected: ${expectedHash}`);
    console.log(`Actual:   ${actualHash}`);
    console.log(`Valid:    ${isValid}`);

    return isValid;
  } finally {
    await file.close();
  }
}

// Usage
const isValid = await verifyFile('./downloaded-file.pdf', '0xabc123...');
if (!isValid) {
  console.error('File integrity check failed!');
}
```

### Verified Download (Automatic Verification)

```typescript
import { Indexer } from '@0glabs/0g-ts-sdk';

async function downloadAndVerify(rootHash: string, outputPath: string): Promise<void> {
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  // The third parameter enables automatic Merkle proof verification
  // Throws an error if verification fails
  await indexer.download(rootHash, outputPath, true);
  console.log('Downloaded and verified successfully');
}
```

### Compare Two Files

```typescript
async function filesMatch(filePath1: string, filePath2: string): Promise<boolean> {
  const hash1 = await computeRootHash(filePath1);
  const hash2 = await computeRootHash(filePath2);
  return hash1 === hash2;
}
```

## Anti-Patterns

```typescript
// BAD: Not closing file handle
const file = await ZgFile.fromFilePath('data.txt');
const [tree] = await file.merkleTree();
const hash = tree.rootHash();
// file.close() never called — memory leak!

// BAD: Unverified download in production
await indexer.download(rootHash, outputPath, false); // No verification!

// BAD: Comparing hashes case-sensitively when format may differ
if (hash1 === hash2) // Could fail if one is checksummed
```

## Common Errors & Fixes

| Error                 | Cause                   | Fix                         |
| --------------------- | ----------------------- | --------------------------- |
| `Merkle tree error`   | Empty or corrupted file | Verify file has content     |
| `Verification failed` | Data was tampered with  | Re-download from 0G Storage |
| `ENOENT`              | File path doesn't exist | Check file path             |

## Related Skills

- [Upload File](../upload-file/SKILL.md) — generates root hash during upload
- [Download File](../download-file/SKILL.md) — can auto-verify during download

## References

- [Storage Patterns](../../../patterns/STORAGE.md)
- [Security Patterns](../../../patterns/SECURITY.md)
