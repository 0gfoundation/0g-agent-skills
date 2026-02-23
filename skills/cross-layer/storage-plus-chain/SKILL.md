---
name: storage-plus-chain
description: |
  Combine 0G Storage with 0G Chain smart contracts to create on-chain references to off-chain data. Use this skill for on-chain reference, NFT metadata on 0G, store hash on-chain, registry contract, chain and storage.
---

# Storage + Chain Integration

## Metadata

- **Category**: cross-layer
- **SDK**: `@0glabs/0g-ts-sdk` ^0.3.3, `ethers` ^6.13.0
- **Activation Triggers**: "on-chain reference", "NFT metadata on 0G", "store hash on-chain",
  "registry contract", "chain and storage"

## Purpose

Combine 0G Storage with 0G Chain smart contracts to create on-chain references to off-chain data.
Common patterns include NFT metadata storage, content registries, and verifiable document systems.

## Prerequisites

- Node.js >= 18
- `@0glabs/0g-ts-sdk` and `ethers` installed
- Hardhat configured with `evmVersion: "cancun"`
- Funded wallet with 0G tokens
- `.env` with `PRIVATE_KEY`, `RPC_URL`, `STORAGE_INDEXER`

## Quick Workflow

1. Upload data to 0G Storage (get root hash)
2. Deploy or interact with registry contract on 0G Chain
3. Store the root hash on-chain
4. Later: read root hash from chain, download from storage

## Core Rules

### ALWAYS

- Upload to storage BEFORE registering on-chain
- Store the root hash on-chain (not the full data)
- Use `evmVersion: "cancun"` for contract compilation
- Verify downloaded data matches on-chain root hash
- Use ethers v6 syntax

### NEVER

- Store large data directly on-chain (expensive)
- Register a root hash before upload completes
- Hardcode private keys
- Skip Merkle verification when downloading referenced data

## Code Examples

### Registry Contract

```solidity
// contracts/StorageRegistry.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract StorageRegistry {
    struct FileRecord {
        bytes32 rootHash;
        address uploader;
        uint256 timestamp;
        string metadata;
    }

    mapping(uint256 => FileRecord) public files;
    uint256 public fileCount;

    event FileRegistered(uint256 indexed id, bytes32 rootHash, address uploader);

    function registerFile(bytes32 rootHash, string calldata metadata) external returns (uint256) {
        uint256 id = fileCount++;
        files[id] = FileRecord({
            rootHash: rootHash,
            uploader: msg.sender,
            timestamp: block.timestamp,
            metadata: metadata
        });
        emit FileRegistered(id, rootHash, msg.sender);
        return id;
    }

    function getFile(uint256 id) external view returns (FileRecord memory) {
        return files[id];
    }

    function verifyUploader(uint256 id, address uploader) external view returns (bool) {
        return files[id].uploader == uploader;
    }
}
```

### Upload and Register

```typescript
import { ZgFile, Indexer } from '@0glabs/0g-ts-sdk';
import { ethers } from 'ethers';
import 'dotenv/config';

async function uploadAndRegister(
  filePath: string,
  metadata: string,
  registryAddress: string,
  registryAbi: any[],
): Promise<{ rootHash: string; fileId: number }> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

  // Step 1: Upload to 0G Storage
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  const file = await ZgFile.fromFilePath(filePath);

  let rootHash: string;
  try {
    const [tree, err] = await file.merkleTree();
    if (err) throw new Error(`Merkle tree error: ${err}`);
    rootHash = tree!.rootHash();
    const [, uploadErr] = await indexer.upload(file, process.env.RPC_URL!, wallet);
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);
    console.log('Uploaded to storage, root hash:', rootHash);
  } finally {
    await file.close();
  }

  // Step 2: Register on-chain
  const registry = new ethers.Contract(registryAddress, registryAbi, wallet);
  const tx = await registry.registerFile(rootHash, metadata);
  const receipt = await tx.wait();

  // Extract file ID from event
  const event = receipt.logs.find((log: any) => log.fragment?.name === 'FileRegistered');
  const fileId = Number(event?.args?.[0] ?? 0);

  console.log('Registered on-chain, file ID:', fileId);
  return { rootHash, fileId };
}
```

### Retrieve from Chain + Storage

```typescript
async function retrieveFile(
  fileId: number,
  outputPath: string,
  registryAddress: string,
  registryAbi: any[],
): Promise<void> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const registry = new ethers.Contract(registryAddress, registryAbi, provider);

  // Step 1: Get root hash from chain
  const record = await registry.getFile(fileId);
  const rootHash = record.rootHash;
  console.log('Root hash from chain:', rootHash);
  console.log('Uploader:', record.uploader);
  console.log('Timestamp:', new Date(Number(record.timestamp) * 1000));

  // Step 2: Download from storage with verification
  // Note: download() can throw or return errors — handle both
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);
  try {
    const dlErr = await indexer.download(rootHash, outputPath, true);
    if (dlErr) throw dlErr;
  } catch (error: any) {
    throw new Error(`Download failed: ${error.message}`);
  }
  console.log('Downloaded and verified:', outputPath);
}
```

### NFT Metadata Pattern

```typescript
async function storeNFTMetadata(
  imageFilePath: string,
  name: string,
  description: string,
): Promise<string> {
  const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
  const indexer = new Indexer(process.env.STORAGE_INDEXER!);

  // Upload image to 0G Storage
  const imageFile = await ZgFile.fromFilePath(imageFilePath);
  let imageRootHash: string;
  try {
    const [tree, err] = await imageFile.merkleTree();
    if (err) throw err;
    imageRootHash = tree!.rootHash();
    const [, imgErr] = await indexer.upload(imageFile, process.env.RPC_URL!, wallet);
    if (imgErr) throw new Error(`Image upload failed: ${imgErr.message}`);
  } finally {
    await imageFile.close();
  }

  // Create metadata JSON pointing to 0G Storage
  const metadata = {
    name,
    description,
    image: `0g://${imageRootHash}`,
    properties: {
      storageLayer: '0G',
      imageRootHash,
    },
  };

  // Upload metadata to 0G Storage
  const fs = await import('fs');
  const os = await import('os');
  const path = await import('path');
  const tempPath = path.join(os.tmpdir(), `metadata-${Date.now()}.json`);
  fs.writeFileSync(tempPath, JSON.stringify(metadata, null, 2));

  const metadataFile = await ZgFile.fromFilePath(tempPath);
  let metadataRootHash: string;
  try {
    const [tree, err] = await metadataFile.merkleTree();
    if (err) throw err;
    metadataRootHash = tree!.rootHash();
    const [, metaErr] = await indexer.upload(metadataFile, process.env.RPC_URL!, wallet);
    if (metaErr) throw new Error(`Metadata upload failed: ${metaErr.message}`);
  } finally {
    await metadataFile.close();
    fs.unlinkSync(tempPath);
  }

  console.log('Image root hash:', imageRootHash);
  console.log('Metadata root hash:', metadataRootHash);
  return metadataRootHash;
}
```

## Architecture

```text
┌──────────────────────┐     ┌──────────────────────┐
│    0G Chain           │     │    0G Storage         │
│                       │     │                       │
│  Registry Contract    │────▶│  Files (root hashes)  │
│  - rootHash (bytes32) │     │  - Data chunks        │
│  - uploader (address) │     │  - Merkle proofs      │
│  - metadata (string)  │     │                       │
└──────────────────────┘     └──────────────────────┘
       On-chain                    Off-chain
     (small refs)               (large data)
```

## Anti-Patterns

```typescript
// BAD: Storing full file data on-chain
await contract.storeFile(fileBuffer); // Extremely expensive!

// BAD: Registering before upload completes
const rootHash = tree.rootHash();
await registry.registerFile(rootHash, metadata);
await indexer.upload(file, process.env.RPC_URL!, wallet); // Upload AFTER register — data not available!

// BAD: Skipping verification on download
await indexer.download(rootHash, outputPath, false); // Unverified!
```

## Common Errors & Fixes

| Error                 | Cause                    | Fix                         |
| --------------------- | ------------------------ | --------------------------- |
| `invalid opcode`      | Wrong evmVersion         | Set `evmVersion: "cancun"`  |
| `file not found`      | Registered before upload | Upload first, then register |
| `verification failed` | Data tampered            | Re-download from 0G Storage |
| `insufficient funds`  | Wallet empty             | Fund wallet                 |

## Related Skills

- [Upload File](../../storage/upload-file/SKILL.md) — storage upload
- [Download File](../../storage/download-file/SKILL.md) — storage download
- [Deploy Contract](../../chain/deploy-contract/SKILL.md) — deploy registry
- [Interact Contract](../../chain/interact-contract/SKILL.md) — read/write registry

## References

- [Storage Patterns](../../../patterns/STORAGE.md)
- [Chain Patterns](../../../patterns/CHAIN.md)
- [Security Patterns](../../../patterns/SECURITY.md)
