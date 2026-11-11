/**
 * Validate that the manifests agree with what is actually on disk.
 *
 * This exists because `kv-store` was deleted from the repo but stayed listed in
 * .claude-plugin/marketplace.json (which also claimed 15 skills and an
 * @0glabs/0g-ts-sdk version that never existed) for months — nothing checked it.
 *
 * Checks:
 *  - every skill directory containing a SKILL.md is listed in marketplace.json
 *  - every skill listed in marketplace.json exists on disk
 *  - marketplace.json's skills.count matches the real total
 *  - package.json's agentSkills.skillCount matches the real total
 *  - the category folders on disk match the categories declared in the manifest
 *  - SDK versions in marketplace.json match patterns/NETWORK_CONFIG.md canon
 *  - every SKILL.md opens with frontmatter whose `name` equals its directory and whose
 *    `description` is non-empty and at most 1024 characters. `npx skills add` skips a
 *    SKILL.md without both fields ("No valid skills found"), which went unnoticed for
 *    every skill except 0g-private-computer until it was tried by hand.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

import { CANONICAL_VERSIONS as CANONICAL_SDK_VERSIONS } from './canonical-versions.ts';

/** Discover skills on disk as category -> sorted skill names. */
function discoverSkills(): Map<string, string[]> {
  const skillsRoot = path.join(ROOT, 'skills');
  const found = new Map<string, string[]>();

  for (const category of fs.readdirSync(skillsRoot, { withFileTypes: true })) {
    if (!category.isDirectory()) continue;
    const categoryPath = path.join(skillsRoot, category.name);
    const names: string[] = [];

    for (const skill of fs.readdirSync(categoryPath, { withFileTypes: true })) {
      if (!skill.isDirectory()) continue;
      if (fs.existsSync(path.join(categoryPath, skill.name, 'SKILL.md'))) {
        names.push(skill.name);
      }
    }
    found.set(category.name, names.sort());
  }
  return found;
}

/**
 * Check the YAML frontmatter `npx skills add` requires. Deliberately small (no YAML
 * dependency): it reads top-level `key: value` lines and indented continuation lines,
 * which is the only shape prettier leaves these fields in.
 */
function checkFrontmatter(category: string, skill: string): string[] {
  const rel = `skills/${category}/${skill}/SKILL.md`;
  const text = fs.readFileSync(path.join(ROOT, rel), 'utf-8');
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match) return [`${rel} has no frontmatter (needs name and description)`];

  const fields: Record<string, string> = {};
  let current: string | null = null;
  for (const line of match[1].split('\n')) {
    const top = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (top) {
      current = top[1];
      fields[current] = top[2].trim();
    } else if (current && /^\s+\S/.test(line)) {
      fields[current] = `${fields[current]} ${line.trim()}`.trim();
    } else {
      current = null;
    }
  }

  const errors: string[] = [];
  if (fields.name !== skill) {
    errors.push(`${rel} frontmatter name is "${fields.name ?? ''}", expected "${skill}"`);
  }
  const description = fields.description ?? '';
  if (!description) errors.push(`${rel} frontmatter has no description`);
  if (description.length > 1024) {
    errors.push(`${rel} description is ${description.length} characters (max 1024)`);
  }
  return errors;
}

function main() {
  console.log('Validating manifests against the filesystem...\n');

  const errors: string[] = [];
  const onDisk = discoverSkills();
  const totalOnDisk = [...onDisk.values()].reduce((n, list) => n + list.length, 0);

  const marketplacePath = path.join(ROOT, '.claude-plugin', 'marketplace.json');
  const marketplace = JSON.parse(fs.readFileSync(marketplacePath, 'utf-8'));
  const declaredCategories: { name: string; skills: string[] }[] =
    marketplace.skills?.categories ?? [];

  // Categories present in exactly one place
  const diskCategories = new Set(onDisk.keys());
  const manifestCategories = new Set(declaredCategories.map((c) => c.name));
  for (const c of diskCategories) {
    if (!manifestCategories.has(c)) {
      errors.push(`marketplace.json is missing category "${c}" that exists on disk`);
    }
  }
  for (const c of manifestCategories) {
    if (!diskCategories.has(c)) {
      errors.push(`marketplace.json declares category "${c}" with no directory on disk`);
    }
  }

  // Per-category skill membership, both directions
  for (const { name: category, skills: declared } of declaredCategories) {
    const actual = onDisk.get(category) ?? [];
    for (const skill of declared) {
      if (!actual.includes(skill)) {
        errors.push(
          `marketplace.json lists ${category}/${skill}, but skills/${category}/${skill}/SKILL.md does not exist`
        );
      }
    }
    for (const skill of actual) {
      if (!declared.includes(skill)) {
        errors.push(
          `skills/${category}/${skill}/SKILL.md exists but is not listed in marketplace.json`
        );
      }
    }
  }

  // Frontmatter that `npx skills add` requires
  for (const [category, skills] of onDisk) {
    for (const skill of skills) errors.push(...checkFrontmatter(category, skill));
  }

  // Counts
  if (marketplace.skills?.count !== totalOnDisk) {
    errors.push(
      `marketplace.json skills.count is ${marketplace.skills?.count}, but ${totalOnDisk} skills exist on disk`
    );
  }

  const pkgPath = path.join(ROOT, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  if (pkg.agentSkills?.skillCount !== totalOnDisk) {
    errors.push(
      `package.json agentSkills.skillCount is ${pkg.agentSkills?.skillCount}, but ${totalOnDisk} skills exist on disk`
    );
  }

  // SDK versions declared in the marketplace manifest
  for (const sdk of marketplace.sdks ?? []) {
    const expected = CANONICAL_SDK_VERSIONS[sdk.name];
    if (!expected) {
      errors.push(`marketplace.json declares unknown SDK "${sdk.name}"`);
      continue;
    }
    if (sdk.version !== expected) {
      errors.push(
        `marketplace.json SDK ${sdk.name} is "${sdk.version}", expected "${expected}"`
      );
    }
  }
  for (const name of Object.keys(CANONICAL_SDK_VERSIONS)) {
    if (!(marketplace.sdks ?? []).some((s: { name: string }) => s.name === name)) {
      errors.push(`marketplace.json does not declare SDK "${name}"`);
    }
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(`  ${e}`);
    console.error(`\n${errors.length} manifest problem(s) found.`);
    process.exit(1);
  }

  const summary = [...onDisk.entries()]
    .map(([c, list]) => `${c}=${list.length}`)
    .join(', ');
  console.log(`${totalOnDisk} skills on disk (${summary}) — manifests agree!`);
}

main();
