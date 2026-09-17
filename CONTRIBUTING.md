# Contributing to 0G Agent Skills

Thank you for contributing! This guide explains how to add new skills, update patterns, and maintain
quality.

## Adding a New Skill

### 1. Create the Skill Directory

```bash
mkdir -p skills/<category>/<skill-name>
```

### 2. Write SKILL.md

Every skill follows this template:

```markdown
# [Skill Name]

## Metadata

- **Category**: storage | compute | chain | cross-layer
- **SDK**: [package and version]
- **Activation Triggers**: "trigger1", "trigger2", "trigger3"

## Purpose

[1-2 sentences]

## Prerequisites

[What must be installed/configured]

## Quick Workflow

[Numbered happy-path steps]

## Core Rules

### ALWAYS

[Rules specific to this skill]

### NEVER

[Anti-rules specific to this skill]

## Code Examples

### Basic Usage

[Minimal working example]

### Advanced Pattern

[Production-ready example]

### Error Handling

[Example with validation and error handling]

## Anti-Patterns

[What NOT to do, with code examples]

## Common Errors & Fixes

[Table: Error | Cause | Fix]

## Related Skills

[Links to related skills]

## References

[Links to patterns and external docs]
```

### 3. Register in AGENTS.md

Add the skill to:

- The Skill Index table
- The appropriate Workflow Sequence
- Any relevant ALWAYS/NEVER rules

### 4. Register in CLAUDE.md

Add the skill to the Skill Map section.

## Code Example Requirements

These apply to skills that call a 0G SDK. A skill that configures a client rather than calling an
SDK — `skills/private-computer/` is the one category of those today — has no TypeScript examples to
hold to them: it writes `Not applicable` in the SDK metadata field, names its supported host
instead, and is exempt from the ethers, `processResponse()` and `evmVersion` items in the checklist
below.

All code examples must:

- Use TypeScript
- Use ethers v6 (never v5)
- Load private keys from `.env` (never hardcoded)
- Include proper error handling
- Work with current SDK versions
- Use `evmVersion: "cancun"` for any contract compilation
- Call `processResponse()` after any compute inference

## Updating Patterns

Pattern documents in `patterns/` are the architectural reference. When updating:

1. Keep them as the single source of truth
2. Update all skills that reference changed patterns
3. Verify cross-references are valid

## Formatting

```bash
# Install prettier
npm install

# Check formatting
npm run format:check

# Auto-fix formatting
npm run format
```

## CI Pipeline

CI runs automatically on PRs. You can run it locally:

```bash
npm install

# Run all CI checks
npm run ci:all

# Or run individually:
npm run ci:extract    # Extract and type-check code blocks from markdown
npm run ci:versions   # Validate SDK version references
npm run ci:lint       # Lint critical rules (processResponse, file.close, etc.)
```

### What CI Checks

| Check            | What it does                                                       |
| ---------------- | ------------------------------------------------------------------ |
| `format:check`   | Prettier formatting on all markdown                                |
| `ci:extract`     | Extracts ```typescript blocks from skills/ and patterns/, runs tsc |
| `ci:versions`    | Ensures SDK versions match NETWORK_CONFIG.md                       |
| `ci:lint`        | processResponse in compute, file.close in storage, cancun in chain |
| `build-examples` | `npm install && tsc --noEmit` for each example project             |

### Skipping CI for a Code Block

If a code block is intentionally incomplete (e.g., showing an anti-pattern), add `<!-- ci-skip -->`
before it:

```markdown
<!-- ci-skip -->

` ` `typescript // This block won't be type-checked const broken = something; ` ` `
```

## Pull Request Checklist

- [ ] Skill follows the template structure
- [ ] Code examples use TypeScript with ethers v6
- [ ] No hardcoded private keys or secrets
- [ ] `processResponse()` called after compute operations
- [ ] `evmVersion: "cancun"` used for contract compilation
- [ ] File handles closed in `finally` blocks
- [ ] Skill registered in `AGENTS.md` and `CLAUDE.md`
- [ ] Cross-references to related skills are valid
- [ ] `npm run format:check` passes
- [ ] `npm run ci:all` passes
