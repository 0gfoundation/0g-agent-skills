// Extract TypeScript code blocks from skill markdown files and type-check them.
//
// Algorithm:
// 1. Glob skills SKILL.md files (skip patterns — those are reference snippets)
// 2. Parse fenced typescript blocks (skip bash, json, solidity, etc.)
// 3. Skip anti-pattern sections and ci-skip blocks
// 4. Skip blocks that import non-SDK modules (hardhat, vitest, etc.)
// 5. Wrap all blocks in async functions + add import preamble as needed
// 6. Write to ci/.tmp/extracted-{file}-{index}.ts
// 7. Run tsc, map errors back to original .md file + block number

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TMP_DIR = path.join(__dirname, '.tmp');

// Imports to skip entirely (non-SDK external modules)
const SKIP_IMPORTS = ['hardhat', 'vitest', 'chai', 'mocha', 'solc'];

// Error codes to suppress.
//
// Only snippet artefacts belong here — errors caused by a doc block being a
// fragment rather than a whole program. NEVER suppress a type error coming
// from real SDK usage: TS2345 and TS2488 used to be listed here as "known SDK
// issues" and between them they hid a genuine runtime bug
// (fineTuning.getAccountWithDetail() destructured as a tuple when it resolves
// to an object) for as long as they were suppressed. Both are now clean under
// @0gfoundation/*, so if either reappears it is a real defect — fix the code.
const SUPPRESSED_ERRORS: string[] = [];

// Import preamble for blocks that don't have their own imports
const PREAMBLE = `
import { ethers } from 'ethers';
import { ZgFile, Indexer } from '@0gfoundation/0g-storage-ts-sdk';
import {
  createZGComputeNetworkBroker,
  createReadOnlyInferenceBroker,
} from '@0gfoundation/0g-compute-ts-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
`.trim();

interface CodeBlock {
  source: string;
  file: string;
  index: number;
  line: number;
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

function extractBlocks(filePath: string): CodeBlock[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const blocks: CodeBlock[] = [];

  let inBlock = false;
  let blockLines: string[] = [];
  let blockStart = 0;
  let blockIndex = 0;
  let skipNext = false;
  let currentSection = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Track section headings
    const headingMatch = line.match(/^#{1,4}\s+(.+)/);
    if (headingMatch) {
      currentSection = headingMatch[1].trim().toLowerCase();
    }

    // Check for ci-skip directive
    if (line.trim() === '<!-- ci-skip -->') {
      skipNext = true;
      continue;
    }

    // Auto-skip anti-pattern sections
    const isAntiPattern = currentSection.includes('anti-pattern');

    if (!inBlock && line.trim().startsWith('```typescript')) {
      if (skipNext || isAntiPattern) {
        skipNext = false;
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '```') {
            i = j;
            break;
          }
        }
        continue;
      }
      inBlock = true;
      blockLines = [];
      blockStart = i + 1;
      continue;
    }

    if (inBlock && line.trim() === '```') {
      inBlock = false;
      const source = blockLines.join('\n');
      if (source.trim()) {
        blocks.push({
          source,
          file: path.relative(ROOT, filePath),
          index: blockIndex++,
          line: blockStart,
        });
      }
      continue;
    }

    if (inBlock) {
      blockLines.push(line);
    }

    if (skipNext && line.trim() && !line.trim().startsWith('<!--')) {
      skipNext = false;
    }
  }

  return blocks;
}

function hasNonSdkImports(source: string): boolean {
  return SKIP_IMPORTS.some((mod) => source.includes(`from '${mod}`) || source.includes(`from "${mod}`));
}

function isAntiPatternBlock(source: string): boolean {
  // Blocks that are intentionally wrong code examples
  return source.includes('// BAD:') || source.includes('// WRONG') || source.includes('// NEVER');
}

function hasImports(source: string): boolean {
  return /^import\s/m.test(source);
}

function wrapBlock(block: CodeBlock): string {
  const source = block.source;
  const header = `// Extracted from ${block.file} (block ${block.index}, line ${block.line})\n`;

  if (!hasImports(source)) {
    // No imports: add preamble and wrap in async function
    return `${header}${PREAMBLE}\n\nasync function __block_${block.index}() {\n${source}\n}\n`;
  }

  // Has imports: separate imports from body, wrap body in async function
  const lines = source.split('\n');
  const imports: string[] = [];
  const body: string[] = [];
  let pastImports = false;

  for (const line of lines) {
    if (!pastImports && (line.startsWith('import ') || line.trim() === '' || line.startsWith('//'))) {
      imports.push(line);
    } else {
      pastImports = true;
      body.push(line);
    }
  }

  const importBlock = imports.join('\n');
  const bodyBlock = body.join('\n').trim();

  if (bodyBlock) {
    return `${header}${importBlock}\n\nasync function __block_${block.index}() {\n${bodyBlock}\n}\n`;
  }

  return `${header}${importBlock}\n`;
}

function main() {
  console.log('Extracting TypeScript code blocks from skill files...\n');

  // Clean and create tmp dir
  if (fs.existsSync(TMP_DIR)) {
    fs.rmSync(TMP_DIR, { recursive: true });
  }
  fs.mkdirSync(TMP_DIR, { recursive: true });

  // Only check skills/ (not patterns/ — those are reference snippets)
  const mdFiles = globMarkdown(path.join(ROOT, 'skills'));

  console.log(`Found ${mdFiles.length} skill files`);

  let totalBlocks = 0;
  let skippedBlocks = 0;
  const blockMap: Map<string, CodeBlock> = new Map();

  for (const mdFile of mdFiles) {
    const blocks = extractBlocks(mdFile);
    for (const block of blocks) {
      // Skip blocks with non-SDK imports or anti-pattern content
      if (hasNonSdkImports(block.source) || isAntiPatternBlock(block.source)) {
        skippedBlocks++;
        continue;
      }

      const safeName = block.file.replace(/[/\\]/g, '-').replace(/\.md$/, '');
      const outFile = `extracted-${safeName}-${block.index}.ts`;
      const outPath = path.join(TMP_DIR, outFile);

      fs.writeFileSync(outPath, wrapBlock(block));
      blockMap.set(outFile, block);
      totalBlocks++;
    }
  }

  console.log(`Extracted ${totalBlocks} TypeScript blocks (skipped ${skippedBlocks} with non-SDK imports)\n`);

  if (totalBlocks === 0) {
    console.log('No TypeScript blocks found. Done.');
    return;
  }

  // Run tsc
  const tsconfigPath = path.join(__dirname, 'tsconfig.ci.json');
  try {
    execSync(`npx tsc --project ${tsconfigPath}`, {
      cwd: ROOT,
      stdio: 'pipe',
      encoding: 'utf-8',
    });
    console.log('All code blocks type-check successfully!');
  } catch (error: any) {
    const output = error.stdout || error.stderr || '';
    const errorLines = output.split('\n').filter((l: string) => l.trim());

    let hasErrors = false;
    let suppressed = 0;
    for (const line of errorLines) {
      const match = line.match(/\.tmp\/(extracted-.*?\.ts)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)/);
      if (match) {
        const [, file, , , errorCode, message] = match;

        // Skip suppressed error codes
        if (SUPPRESSED_ERRORS.includes(errorCode)) {
          suppressed++;
          continue;
        }

        // Skip "Cannot find name" errors for snippet blocks (partial code)
        if (errorCode === 'TS2304' || errorCode === 'TS2552') {
          suppressed++;
          continue;
        }

        const block = blockMap.get(file);
        if (block) {
          console.error(`${block.file} (block ${block.index}, line ~${block.line}): error ${errorCode}: ${message}`);
        } else {
          console.error(line);
        }
        hasErrors = true;
      }
    }

    if (suppressed > 0) {
      console.log(`(Suppressed ${suppressed} known false-positive errors)`);
    }

    if (hasErrors) {
      console.error(`\nType-check failed. Fix the errors above.`);
      process.exit(1);
    } else {
      console.log('All code blocks type-check successfully!');
    }
  }
}

main();
