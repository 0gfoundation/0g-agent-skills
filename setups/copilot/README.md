# GitHub Copilot Setup

Use 0G Agent Skills with [GitHub Copilot](https://github.com/features/copilot) for AI-assisted 0G
development.

## Installation

### Step 1: Add Skills to Your Project

```bash
# Clone skills into your project
git clone https://github.com/0gfoundation/agent-skills-0g .0g-skills
```

### Step 2: Create .github/copilot-instructions.md

Create `.github/copilot-instructions.md` in your project root:

```markdown
# 0G Development Instructions

This project uses the 0G decentralized AI operating system. Reference files in `.0g-skills/` for
correct SDK patterns.

## Key SDKs

- @0gfoundation/0g-storage-ts-sdk ^1.2.12 — Storage (upload, download)
- @0gfoundation/0g-compute-ts-sdk ^0.9.0 — Compute (inference, fine-tuning)
- ethers 6.13.1 — Chain interaction (MUST be v6)

## Critical Rules

1. Call processResponse(providerAddress, chatID, usageData) after EVERY inference
2. Extract ChatID from ZG-Res-Key header first, data.id as fallback
3. Use evmVersion: "cancun" for all 0G Chain contract compilation
4. Use ethers v6 syntax only (JsonRpcProvider, parseEther, BigInt)
5. Close ZgFile handles with file.close() in finally blocks
6. Load private keys from .env, never hardcode

## Reference

- Storage patterns: .0g-skills/patterns/STORAGE.md
- Compute patterns: .0g-skills/patterns/COMPUTE.md
- Chain patterns: .0g-skills/patterns/CHAIN.md
- All skills: .0g-skills/skills/
```

### Step 3: Reference in Code Comments

Add hints in your source files to guide Copilot:

```typescript
// 0G Storage upload — see .0g-skills/skills/storage/upload-file/SKILL.md
```

## Copilot Chat

When using Copilot Chat in VS Code, you can reference specific skill files:

```
@workspace How do I upload a file to 0G Storage? See .0g-skills/skills/storage/upload-file/SKILL.md
```

## Verification

Open your project in VS Code with Copilot and try asking:

```
How do I use the 0G Compute Network for AI inference?
```

Copilot should reference the patterns and generate code matching the skill documentation.

## Tips

- Use `@workspace` in Copilot Chat to search across skill files
- Add code comments referencing specific skills for inline suggestions
- The `.github/copilot-instructions.md` file is loaded automatically
