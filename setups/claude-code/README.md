# Claude Code Setup

Use 0G Agent Skills with [Claude Code](https://claude.ai/claude-code) for AI-assisted 0G
development.

## Installation

### Option A: Clone into Your Project

```bash
# From your project root
git clone https://github.com/0gfoundation/agent-skills-0g .0g-skills

# Claude Code auto-loads CLAUDE.md from the repo root
```

### Option B: Copy Skills into Existing Project

```bash
# Copy the CLAUDE.md to your project root
cp agent-skills-0g/CLAUDE.md ./CLAUDE.md

# Copy skills and patterns directories
cp -r agent-skills-0g/skills ./skills
cp -r agent-skills-0g/patterns ./patterns
cp agent-skills-0g/AGENTS.md ./AGENTS.md
```

### Option C: Reference as Submodule

```bash
git submodule add https://github.com/0gfoundation/agent-skills-0g .0g-skills
```

Then add to your project's `CLAUDE.md`:

```markdown
For 0G development guidance, reference .0g-skills/CLAUDE.md
```

## How It Works

Claude Code automatically reads `CLAUDE.md` from the root of your project directory. This file
serves as the entry point, directing Claude to:

1. `AGENTS.md` — Orchestration rules, activation triggers, workflow sequences
2. `skills/*/SKILL.md` — Individual skill instructions with code examples
3. `patterns/*.md` — Deep architectural reference documents

## Verification

Open your project in Claude Code and try:

```
"Help me upload a file to 0G Storage"
```

Claude should:

1. Reference the upload-file skill
2. Generate code using `@0gfoundation/0g-storage-ts-sdk`
3. Include proper Merkle tree generation and file handle cleanup
4. Use `.env` for private keys (never hardcoded)

## Tips

- Ask Claude to "scaffold a new 0G project" for quick setup
- Claude will auto-chain skills (e.g., upload → merkle-verification)
- Say "deploy a contract to 0G Chain" and Claude handles the cancun evmVersion
- For compute, Claude auto-includes `processResponse()` after every inference
