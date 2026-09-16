/**
 * Validate that SDK version references across all markdown files match
 * the canonical versions defined in NETWORK_CONFIG.md.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Canonical SDK versions (source of truth — must match patterns/NETWORK_CONFIG.md).
// Compared verbatim, so the caret is significant: `ethers` has NO caret because
// @0gfoundation/0g-storage-ts-sdk declares an exact peer dep on ethers@6.13.1.
const CANONICAL_VERSIONS: Record<string, string> = {
  '@0gfoundation/0g-storage-ts-sdk': '^1.2.12',
  '@0gfoundation/0g-compute-ts-sdk': '^0.9.0',
  ethers: '6.13.1',
};

// Packages that must never be referenced again — renamed upstream and deprecated.
const FORBIDDEN_PACKAGES: Record<string, string> = {
  '@0glabs/0g-ts-sdk': '@0gfoundation/0g-storage-ts-sdk',
  '@0glabs/0g-serving-broker': '@0gfoundation/0g-compute-ts-sdk',
  '@0gfoundation/0g-ts-sdk': '@0gfoundation/0g-storage-ts-sdk',
};

// Lines that intentionally quote a non-canonical version (failure transcripts,
// "wrong way" examples) and so must not be flagged.
const IGNORE_LINE_PATTERNS: RegExp[] = [/npm error/i, /sdk-version-ignore/];

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

function main() {
  console.log('Validating SDK version references...\n');

  const mdFiles = [
    ...globMarkdown(path.join(ROOT, 'skills')),
    ...globMarkdown(path.join(ROOT, 'patterns')),
  ];

  let errors = 0;

  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(mdFile, 'utf-8');
    const relPath = path.relative(ROOT, mdFile);

    for (const [pkg, expectedVersion] of Object.entries(CANONICAL_VERSIONS)) {
      // Match patterns like: `@0gfoundation/0g-storage-ts-sdk` ^1.2.12 or `@0gfoundation/0g-storage-ts-sdk ^1.2.12`
      const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const versionPattern = new RegExp(
        `\`${escapedPkg}\`\\s+\\^?\\d+\\.\\d+\\.\\d+|${escapedPkg}[\\s@]+\\^?(\\d+\\.\\d+\\.\\d+)`,
        'g'
      );

      let match;
      while ((match = versionPattern.exec(content)) !== null) {
        const matchedText = match[0];
        // Compare the version range EXACTLY as written, caret included. `ethers`
        // is pinned to a bare 6.13.1 because the storage SDK declares an exact
        // peer dep, so we must not normalise `6.13.1` and `^6.13.1` together.
        const versionMatch = matchedText.match(/(\^?\d+\.\d+\.\d+)/);
        if (!versionMatch) continue;

        const foundVersion = versionMatch[1];
        if (foundVersion === expectedVersion) continue;

        const line = content.substring(0, match.index).split('\n').length;
        const lineText = content.split('\n')[line - 1] ?? '';

        // Some docs deliberately quote a WRONG version — e.g. the ERESOLVE
        // transcript that explains why ethers is pinned. Skip those.
        if (IGNORE_LINE_PATTERNS.some((p) => p.test(lineText))) continue;

        console.error(
          `${relPath}:${line} — ${pkg} version mismatch: found ${foundVersion}, expected ${expectedVersion}`
        );
        errors++;
      }
    }
  }

  // Deprecated package names must not reappear anywhere.
  for (const mdFile of mdFiles) {
    const content = fs.readFileSync(mdFile, 'utf-8');
    const relPath = path.relative(ROOT, mdFile);
    const lines = content.split('\n');

    for (const [bad, good] of Object.entries(FORBIDDEN_PACKAGES)) {
      lines.forEach((lineText, i) => {
        if (!lineText.includes(bad)) return;
        // A line that names the old package AND its replacement is a migration
        // note (e.g. the deprecation table in NETWORK_CONFIG.md), not a usage.
        if (lineText.includes(good)) return;
        // Prose that explicitly warns against the package is also fine.
        if (/deprecated|NEVER use|do not use|migrate/i.test(lineText)) return;
        console.error(
          `${relPath}:${i + 1} — deprecated package "${bad}" referenced; use "${good}" instead`
        );
        errors++;
      });
    }
  }

  if (errors > 0) {
    console.error(`\n${errors} problem(s) found. Update to match NETWORK_CONFIG.md.`);
    process.exit(1);
  }

  console.log(
    `Checked ${mdFiles.length} files — SDK versions consistent, no deprecated packages!`
  );
}

main();
