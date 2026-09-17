/**
 * Lint critical rules across skill markdown files:
 * - processResponse() in compute skills
 * - file.close() in storage skills
 * - evmVersion "cancun" in chain skills
 * - No hardcoded private keys
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

interface LintError {
  file: string;
  rule: string;
  message: string;
}

function globMarkdown(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...globMarkdown(fullPath));
    } else if (entry.name.endsWith('.md')) {
      results.push(fullPath);
    }
  }
  return results;
}

function extractTypeScriptBlocks(content: string): string[] {
  const blocks: string[] = [];
  const lines = content.split('\n');
  let inBlock = false;
  let blockLines: string[] = [];

  for (const line of lines) {
    if (!inBlock && line.trim().startsWith('```typescript')) {
      inBlock = true;
      blockLines = [];
      continue;
    }
    if (inBlock && line.trim() === '```') {
      inBlock = false;
      blocks.push(blockLines.join('\n'));
      continue;
    }
    if (inBlock) {
      blockLines.push(line);
    }
  }

  return blocks;
}

// Skills that do inference and MUST call processResponse
const INFERENCE_SKILLS = ['streaming-chat', 'text-to-image', 'speech-to-text'];

function lintComputeSkill(filePath: string, content: string): LintError[] {
  const errors: LintError[] = [];
  const relPath = path.relative(ROOT, filePath);

  // Only require processResponse in inference skills (not setup/discovery/management)
  const isInferenceSkill = INFERENCE_SKILLS.some((s) => filePath.includes(s));
  if (!isInferenceSkill) return errors;

  const blocks = extractTypeScriptBlocks(content);

  // Check that at least one code block calls processResponse
  const hasProcessResponse = blocks.some((b) => b.includes('processResponse'));
  if (!hasProcessResponse) {
    errors.push({
      file: relPath,
      rule: 'processResponse',
      message: 'Inference skill must include processResponse() in at least one code example',
    });
  }

  return errors;
}

function lintStorageSkill(filePath: string, content: string): LintError[] {
  const errors: LintError[] = [];
  const relPath = path.relative(ROOT, filePath);
  const blocks = extractTypeScriptBlocks(content);

  // Check blocks that create ZgFile also close them
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.includes('ZgFile.fromFilePath') && !block.includes('file.close()') && !block.includes('.close()')) {
      // Check if this is in an anti-pattern section (acceptable)
      const blockIndex = content.indexOf(block);
      const before = content.substring(Math.max(0, blockIndex - 200), blockIndex);
      if (!before.includes('Anti-Pattern') && !before.includes('BAD:')) {
        errors.push({
          file: relPath,
          rule: 'file.close',
          message: `Code block ${i} creates ZgFile but does not call file.close()`,
        });
      }
    }
  }

  return errors;
}

function lintChainSkill(filePath: string, content: string): LintError[] {
  const errors: LintError[] = [];
  const relPath = path.relative(ROOT, filePath);

  // "cancun" is the RECOMMENDED target for 0G Chain: it is supported on both
  // mainnet and testnet and yields the smallest bytecode. Older targets
  // (shanghai/paris/london) also deploy and run correctly — verified on-chain —
  // so this is a gas optimisation, not a compatibility requirement. We only
  // check that a skill discussing evmVersion actually recommends cancun.
  if (content.includes('evmVersion') && !content.includes('"cancun"') && !content.includes("'cancun'")) {
    errors.push({
      file: relPath,
      rule: 'evmVersion',
      message: 'Chain skill references evmVersion but never recommends "cancun"',
    });
  }

  return errors;
}

function lintNoHardcodedKeys(filePath: string, content: string): LintError[] {
  const errors: LintError[] = [];
  const relPath = path.relative(ROOT, filePath);
  const blocks = extractTypeScriptBlocks(content);

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    // Hardcoded private keys: a 64+ hex-char literal reaching anything that
    // takes a key. The ethers form was the only one checked until the
    // agentic-id category arrived on viem, where the same mistake wears a
    // different shape (privateKeyToAccount, or an `account:` config field) and
    // so sailed past this rule entirely.
    const hardcodedKeyPatterns = [
      /new ethers\.Wallet\s*\(\s*['"]0x[0-9a-fA-F]{64,}['"]/, // ethers
      /privateKeyToAccount\s*\(\s*['"]0x[0-9a-fA-F]{64,}['"]/, // viem
      /\baccount\s*:\s*['"]0x[0-9a-fA-F]{64,}['"]/, // viem / AgenticID config
      /\bPRIVATE_KEY\s*=\s*['"]0x[0-9a-fA-F]{64,}['"]/, // assigned straight into a const
    ];
    if (hardcodedKeyPatterns.some((p) => p.test(block))) {
      // Check if this is in an anti-pattern section
      const blockIndex = content.indexOf(block);
      const before = content.substring(Math.max(0, blockIndex - 200), blockIndex);
      if (!before.includes('Anti-Pattern') && !before.includes('BAD:') && !before.includes('NEVER')) {
        errors.push({
          file: relPath,
          rule: 'no-hardcoded-keys',
          message: `Code block ${i} contains a hardcoded private key`,
        });
      }
    }
  }

  return errors;
}

function main() {
  console.log('Linting critical rules...\n');

  const allErrors: LintError[] = [];

  // Compute skills
  const computeFiles = globMarkdown(path.join(ROOT, 'skills', 'compute'));
  for (const file of computeFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    allErrors.push(...lintComputeSkill(file, content));
  }

  // Storage skills
  const storageFiles = globMarkdown(path.join(ROOT, 'skills', 'storage'));
  for (const file of storageFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    allErrors.push(...lintStorageSkill(file, content));
  }

  // Chain skills
  const chainFiles = globMarkdown(path.join(ROOT, 'skills', 'chain'));
  for (const file of chainFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    allErrors.push(...lintChainSkill(file, content));
  }

  // Cross-layer skills
  const crossLayerFiles = globMarkdown(path.join(ROOT, 'skills', 'cross-layer'));
  for (const file of crossLayerFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    // Cross-layer may have compute + storage patterns
    if (content.includes('processResponse')) {
      allErrors.push(...lintComputeSkill(file, content));
    }
    if (content.includes('ZgFile')) {
      allErrors.push(...lintStorageSkill(file, content));
    }
  }

  // All files: check for hardcoded keys
  const allFiles = [
    ...globMarkdown(path.join(ROOT, 'skills')),
    ...globMarkdown(path.join(ROOT, 'patterns')),
  ];
  for (const file of allFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    allErrors.push(...lintNoHardcodedKeys(file, content));
  }

  // Report
  if (allErrors.length > 0) {
    for (const err of allErrors) {
      console.error(`[${err.rule}] ${err.file}: ${err.message}`);
    }
    console.error(`\n${allErrors.length} lint error(s) found.`);
    process.exit(1);
  }

  console.log(`Checked ${allFiles.length} files — all critical rules pass!`);
}

main();
