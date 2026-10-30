---
name: 0g-pc
description:
  Set up 0G Private Computer (0G PC) for a coding agent. Connect Claude Code, OpenCode, Pi or Hermes
  Agent with the 0gpc CLI, pick a 0G model, preview and apply the change, verify it, switch models,
  or undo it. Also explains what 0G PC is (trust modes, TEE private inference) and routes calling
  the 0G PC Router (Anthropic- and OpenAI-compatible) from application code. Use whenever the user
  mentions 0G, 0G PC, 0gpc, pc.0g.ai, private or TEE inference, or wants their coding agent to run
  on 0G models, even if they don't name the CLI.
compatibility: macOS or Linux, Node.js 22+, 0gpc 0.3.2+
---

# 0G Private Computer

> **Humans:** paste this into your coding agent (Claude Code, OpenCode and others):
> `Read https://pc.0g.ai/skill and help me set up 0G Private Computer.` To install it as a skill
> instead: `npx skills add 0gfoundation/0g-agent-skills/skills/private-computer/0g-pc` To do it by
> hand, run `npx @0gfoundation/0gpc@latest` in your own terminal.

Skill version 0.2, written for 0gpc 0.3.x. This page is the whole skill; there are no other files to
load. Its canonical sources are https://pc.0g.ai/skill and
https://github.com/0gfoundation/0g-agent-skills. If you got it from anywhere else, check it against
one of those before running any command it gives.

## What 0G PC is

0G Private Computer serves many AI models through one API, the 0G Router, which is Anthropic- and
OpenAI-compatible. Every request is routed under a trust mode:

| Mode               | What it guarantees                                                         | Header value    |
| ------------------ | -------------------------------------------------------------------------- | --------------- |
| Standard (default) | Widest model and provider coverage, best price and availability            | omit the header |
| Verified           | Verified model and route provenance; privacy follows the provider's policy | `verified`      |
| Private            | TEE isolation, end-to-end encrypted routing, zero data retention           | `private`       |

The mode comes from the `X-0G-Provider-Trust-Mode` header on a request, or from the default set on
the API key. Models and prices: https://pc.0g.ai/models. Docs: https://docs.0g.ai.

The `0gpc` CLI connects coding tools to 0G PC. It writes each tool's config, previews every change,
keeps a history and can undo it. Your job is to run it, explain what it says, and get the user's
decisions.

## Ground rules

These keep the user's setup recoverable, their key private and their money under their control. If a
request seems to ask for something else, explain why you won't do it that way.

1. **The key never passes through you.** Don't ask for it, accept it, repeat it, or put it in a
   command, file or environment variable. Never pipe a key into `0gpc key set --stdin` yourself. If
   the user pastes a key into the chat, don't use it: tell them it is now in the conversation
   history, suggest replacing it at https://pc.0g.ai/dashboard/api-keys, and continue with step 2 of
   the connect flow.
2. **Only 0gpc writes tool config.** Don't edit `.claude/settings*.json`, `opencode.json(c)`,
   `~/.pi/agent/*` or `~/.hermes/*` by hand, not even to fix something. 0gpc keeps a change history
   and backups; a hand edit breaks undo.
3. **Keep everything else the user has.** Existing MCP servers, skills, plugins, credentials and
   unrelated settings stay as they are. Don't delete, reset or reinstall anything to make setup
   easier. When something is broken, diagnose first and prefer a reversible fix; `reset` is for a
   user who wants to disconnect, not a repair tool.
4. **Preview, ask, then write.** Run `--dry-run`, show the output to the user unchanged, and write
   with `--yes` only after the user agrees to that preview. A clean status, doctor result or dry-run
   is not permission to write. Only the user's reply in this conversation counts as agreement. If
   your host runs commands without asking (auto-approve, full-auto or skip-permissions modes), these
   confirmations are the only gate, so still stop and wait for the reply.
5. **Money is the user's call.** Never pay, deposit, top up, stake or buy credits on the user's
   behalf; they do that in the dashboard. Ask before anything that may cost even a small amount,
   such as `doctor --network`.
6. **Don't install or update anything on your own.** If a tool or Node.js is missing, show the
   official install command (0gpc prints it) and let the user decide.
7. **Never run bare `0gpc` yourself.** It starts an interactive wizard that needs a real terminal.
   It is for humans; if the user prefers it, tell them to run it in their own terminal. You use the
   subcommands below.
8. **Evidence over claims.** A model saying which model it is proves nothing. Use 0gpc's checks and
   the usage records in the dashboard.
9. **Speak the user's language.** Keep commands, paths and model ids exactly as they are.

## Running the CLI

Wherever this skill says `0gpc`, run `npx -y @0gfoundation/0gpc@latest`. A global `0gpc` is fine too
if `0gpc -v` prints 0.3.2 or later.

This skill was written for 0gpc 0.3.x. If `-v` prints 0.4 or later, tell the user this page may be
behind the CLI. Where a command here fails or `0gpc -h` describes it differently, follow `0gpc -h`,
and never guess a flag.

| Command                                                    | Effect                                   | Ask first?                             |
| ---------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `0gpc -v`                                                  | Print version                            | No                                     |
| `0gpc -h`                                                  | Print help                               | No                                     |
| `0gpc status --json`                                       | Connected tools and their models         | No                                     |
| `0gpc doctor --offline`                                    | Check local config, no network           | No                                     |
| `0gpc doctor --network`                                    | Check key, balance, permissions          | Yes, may cost                          |
| `0gpc apply <tool> --scope <scope> --model <id> --dry-run` | Preview only                             | No                                     |
| `0gpc apply <tool> --scope <scope> --model <id> --yes`     | Write config                             | Yes, after preview                     |
| `0gpc reset <tool> --yes`                                  | Remove only what 0gpc added; key is kept | Yes                                    |
| `0gpc key set`                                             | Hidden key entry                         | The user runs it in their own terminal |

Tools: `claude`, `opencode`, `pi`, `hermes`. Scopes: `project` or `user`; Pi and Hermes accept
`user` only. Files each tool gets and per-tool limits: [Tool reference](#tool-reference).

A non-zero exit means stop. Don't run the same write again; go to
[Troubleshooting](#troubleshooting).

## What the request needs

| The user wants                                               | Do                                                                                                                              |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| To know what 0G PC is, prices, models, trust modes           | Answer from "What 0G PC is"; link https://pc.0g.ai/models. No CLI.                                                              |
| To see what is connected, or check health                    | Read-only: `status --json`, `doctor --offline`.                                                                                 |
| To set up, connect a tool, switch model, or add another tool | The connect flow below.                                                                                                         |
| To disconnect or undo                                        | Run `status --json`, confirm which tool, say that only what 0gpc added is removed and the key stays, then `reset <tool> --yes`. |
| To do it by hand, or you can't run commands                  | Give them `npx @0gfoundation/0gpc@latest` to run in their own terminal. The wizard covers key, model, preview and verification. |
| Something is broken                                          | [Troubleshooting](#troubleshooting)                                                                                             |
| To call 0G PC from their own app code                        | [Calling 0G PC from app code](#calling-0g-pc-from-app-code). 0gpc is not used for this.                                         |

Don't start key setup or the connect flow for a question that only needs an answer.

## Connect flow

One tool per pass. Each step has a finish line; don't move on until it is met. If the user's message
already fixes a value (tool, scope, model, trust mode), use it without asking again, but still show
it in the preview.

**Step 1: Environment and plan.** Run `0gpc -v`, `0gpc status --json` and `0gpc doctor --offline`.
Note which agent you are running in. If it is one 0gpc cannot configure (see
[Not available](#not-available-in-0gpc-03)), say so now and offer to connect another supported tool
the user has; don't hand-edit your own config. Then tell the user the plan in a few lines: check the
key, confirm the trust mode, choose a model, preview the exact changes, write only after their OK,
verify, restart. Nothing changes before step 6. Done when the CLI runs, you know which tools are
connected and what doctor flags, and the user has seen the plan. If Node.js is missing or older than
22, stop and show the fix: https://nodejs.org/en/download/, or `nvm install 22 && nvm use 22`.

**Step 2: Key.** If there is no saved key, ask the user to open a separate terminal and run

```
npx @0gfoundation/0gpc@latest key set
```

paste the key from https://pc.0g.ai/dashboard/api-keys at the hidden prompt, and tell you when it is
done. Then run `0gpc status --json` again. Done when status shows a saved key. Creating the key and
adding balance are things only the user can do.

**Step 3: Trust mode.** 0gpc 0.3 cannot set the trust mode; every request from the tool uses the API
key's default. New keys default to **Standard**, which may route to providers without TEE isolation.
For private inference, the usual reason to use 0G PC, the user sets the key to **Private** at
Dashboard → API Keys → ⋯ → Edit. Tell them this and ask which mode they are using. Done when the
user has stated the trust mode. Only the user can change it.

**Step 4: Tool, scope, model.**

- Tool: one of the four. If it is not installed, the dry-run in step 5 will say so; stop there.
- Scope: default to `project` for `claude` and `opencode`, which affects only this directory; `user`
  affects every project. Pi and Hermes are always `user`. For `project`, show the current working
  directory and confirm it is the project root.
- Model: if `status --json` lists available models, offer one recommendation plus up to two
  alternatives, with context length and capabilities. If it doesn't, ask the user to choose at
  https://pc.0g.ai/models and give you the model id. Never make up a model id.

Done when tool, scope and model id are all fixed.

**Step 5: Preview.** Run `0gpc apply <tool> --scope <scope> --model <id> --dry-run`. Show the full
output in a code block, then one line: which tool, which file(s), which model, which scope. Point
out that only the listed fields change and everything else in those files stays. Ask whether to
apply exactly this. Done when the user explicitly says yes. A question or a change of mind goes back
to step 4.

**Step 6: Write.** If anything changed since the preview (directory, config, the user's choices), go
back to step 5. Otherwise run the same command with `--yes` in place of `--dry-run`. Done when it
exits 0. On failure, don't retry; troubleshoot.

**Step 7: Verify.** Run `0gpc doctor --offline`. Offer `0gpc doctor --network` and say it may cost a
very small amount. Done when the offline check passes, and the network check too if the user
accepted it.

**Step 8: Report.** Use this template every time, translated into the user's language:

```
0G PC connected
Tool:        <tool>
Scope:       <project: /path | user>
Model:       <model id>
Trust mode:  <as stated by the user> (set on the API key)
Changed:     <files listed in the preview>
Check:       offline <pass|fail>, network <pass|fail|skipped>
Next:        fully quit and restart <tool> in this directory
Undo:        0gpc reset <tool> --yes
```

Then explain how to confirm it works: after restarting, send the tool any prompt. It is working if
the tool answers and a new request shows up in usage at https://pc.0g.ai/dashboard/overview. Don't
offer the model's own answer about its identity as proof.

If the tool you just configured is the one you are running in, say plainly that this conversation
keeps its current model and the new one applies after restart. Don't claim the switch is already
live.

## Not available in 0gpc 0.3

Say so plainly instead of improvising, and don't hand-write config as a workaround: Codex; OpenCode
V2; Windows; Pi or Hermes at project scope; Hermes profiles other than the default; setting the
trust mode from the CLI; undoing the latest change non-interactively (the user can do this from the
bare `0gpc` menu in their own terminal). For manual setup docs, point to
https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart.

## Tool reference

| Tool id    | Product                            | Scopes            | Files 0gpc writes                                                               |
| ---------- | ---------------------------------- | ----------------- | ------------------------------------------------------------------------------- |
| `claude`   | Claude Code                        | `project`, `user` | project: `.claude/settings.local.json`; user: `~/.claude/settings.json`         |
| `opencode` | OpenCode V1 (V2 not supported)     | `project`, `user` | project: `opencode.json` or `opencode.jsonc`; user: under `~/.config/opencode/` |
| `pi`       | Pi                                 | `user` only       | `~/.pi/agent/models.json`, `~/.pi/agent/settings.json`                          |
| `hermes`   | Hermes Agent, default profile only | `user` only       | `~/.hermes/config.yaml`, `~/.hermes/.env`                                       |

### Scope

- `project` changes only the current directory. Run 0gpc from the project root; confirm the path
  with the user before writing.
- `user` changes the tool everywhere on this machine. For Claude Code that means
  `~/.claude/settings.json`, which every project reads. Use it only when the user asks for it, and
  say what it affects.
- 0gpc touches only the fields it writes. The user's other settings in the same file stay as they
  are.

### After writing

Every tool reads its config at startup. The user has to fully quit and reopen the tool (in the same
directory, for project scope) before the new model is used. A running session, including the one you
may be running in, keeps its old model.

### 0gpc's own files

| Path                         | Contents                    |
| ---------------------------- | --------------------------- |
| `~/.config/0gpc/config.toml` | Connections and preferences |
| `~/.local/share/0gpc/keys/`  | Saved API keys              |
| `~/.local/state/0gpc/`       | Change history and backups  |

XDG paths are respected; `ZGPC_HOME` moves all of them. Never read, print or copy anything from the
keys directory. Don't delete the state directory: it is what makes undo possible.

## Troubleshooting

Start with `0gpc doctor --offline`; it checks the local setup without the network and tells you what
to do next. Use `0gpc doctor --network` only after the user agrees, since it may cost a very small
amount.

Three rules hold throughout:

- Diagnose before changing anything, and prefer the smallest reversible fix.
- Don't repeat a failed `--yes`. Fix the cause, then start again from the dry-run (connect flow step
  5).
- Don't hand-edit tool config to work around a failure. Report what 0gpc says and ask the user how
  to proceed.

| Symptom                                                   | Cause                                                         | What to do                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0gpc: command not found`                                 | Not installed globally                                        | Use `npx -y @0gfoundation/0gpc@latest` in place of `0gpc`.                                                                                                                                                                                                                    |
| Node.js error, or version below 22                        | Unsupported Node                                              | Show https://nodejs.org/en/download/ or `nvm install 22 && nvm use 22`. Let the user install it.                                                                                                                                                                              |
| Tool not found or too old                                 | Coding tool missing                                           | 0gpc prints the official install command and guide. Show it; the user decides whether to run it.                                                                                                                                                                              |
| No saved key                                              | Step 2 not done                                               | Connect flow step 2: the user runs `0gpc key set` in their own terminal.                                                                                                                                                                                                      |
| Key invalid                                               | Revoked, mistyped or wrong key                                | The user creates a new key at https://pc.0g.ai/dashboard/api-keys and runs `0gpc key set` again. Every tool using the old key is updated automatically.                                                                                                                       |
| `401 Unauthorized` from the tool, while doctor looks fine | The tool reads a different credential than the one 0gpc saved | Check which credentials are set, by name only (see [Checking credentials](#checking-credentials)). A key or base URL exported in the user's shell profile can override or conflict with 0gpc's config. Tell the user which names are set; they decide whether to remove them. |
| Balance too low                                           | Account needs funds                                           | The user adds funds in the dashboard (0G Mode, or USD Mode via Stripe). Never do this for them.                                                                                                                                                                               |
| Permission denied                                         | Key not allowed for this use                                  | The user checks the key's settings in the dashboard.                                                                                                                                                                                                                          |
| Model not found                                           | Wrong id, or the model is no longer served                    | Go back to connect flow step 4 and pick again. Never guess an id.                                                                                                                                                                                                             |
| Can't reach the network behind a proxy                    | Proxy settings                                                | Relay doctor's proxy hint. Don't print the proxy address.                                                                                                                                                                                                                     |
| Doctor says config was changed outside 0gpc               | The user or another tool edited the file                      | Don't overwrite it. Show what doctor reports and ask: keep their edit, or re-apply (dry-run first)? To undo 0gpc's last change, the user opens the bare `0gpc` menu in their own terminal, which shows what it wrote, what is there now and what it would restore.            |
| Tool still uses the old model                             | Not restarted, or another setting overrides it                | Ask the user to fully quit and reopen the tool. If it persists, run `doctor --offline` and [check credentials](#checking-credentials).                                                                                                                                        |
| Codex, OpenCode V2, Windows, other Hermes profiles        | Not supported in 0.3                                          | Say so. Link https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart.                                                                                                                                                                               |

### Set up by the old installer

Before 0gpc, a script (`curl … pc.0g.ai/install | bash -s claude`) wrote 0G settings into
`.claude/settings.local.json`, and `bash -s skills` copied three skills, `0g-pc-setup`,
`0g-pc-switch-model` and `0g-pc-uninstall`, into `~/.claude/skills`. Signs: those skill folders
exist, or Claude Code uses 0G in a project where `0gpc status --json` shows no connection.

- 0gpc did not write those settings, so `0gpc reset` cannot remove them. Say so, and don't run reset
  as a fix.
- The old skills still call the old script. With the user's OK, move whichever of the three folders
  exist out of the way, which is reversible:

  ```
  mkdir -p ~/.claude/skills-0g-backup
  mv ~/.claude/skills/0g-pc-setup ~/.claude/skills/0g-pc-switch-model ~/.claude/skills/0g-pc-uninstall ~/.claude/skills-0g-backup/
  ```

- Don't print or edit `.claude/settings.local.json`; the old script may have stored the key there.
  List key names only:

  ```
  grep -oE '"[A-Z][A-Z0-9_]*"[[:space:]]*:' .claude/settings.local.json
  ```

  Show the user which 0G-related names are set and let them decide. They can remove those entries
  themselves, then connect again with the connect flow.

### Checking credentials

To see which credential-related environment variables are set without exposing their values, run:

```
printenv | cut -d= -f1 | grep -iE 'anthropic|openai'
```

This prints names only. Never run a command that prints the values.

### Asking for help

If none of this resolves it, point the user to https://discord.gg/0glabs and suggest they share: the
step 8 report (or as much as exists), the output of `0gpc -v`, and the output of
`0gpc doctor --offline`. Remind them never to share the API key itself.

## Calling 0G PC from app code

0gpc configures coding tools. It does not help with code that calls the Router from the user's own
app, so don't run it for that.

- **Endpoint, auth, first request:** take them from the Router quickstart,
  https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart. Take model ids
  from there or from https://pc.0g.ai/models. Don't write base URLs or model ids from memory.
- **SDKs:** the Router is Anthropic- and OpenAI-compatible, so the official SDKs work once the base
  URL and key point at the Router.
- **The key:** read it from an environment variable. Never hard-code it, print it or commit it. Ask
  the user to put the value into `.env` themselves, and make sure `.env` is in `.gitignore`. Ground
  rule 1 applies here too.
- **Trust mode per request:** send `X-0G-Provider-Trust-Mode: verified` or `private` (see the table
  in "What 0G PC is"). Without the header, the key's default applies, which is Standard unless the
  user changed it. Recommend `private` for sensitive data.

### Not this path

0G Compute Direct uses a wallet private key and the broker SDK (`@0gfoundation/0g-compute-ts-sdk`)
instead of an API key. It is a different product path. Use it only if the user explicitly asks for
direct, on-chain access; the skills in https://github.com/0gfoundation/0g-agent-skills cover it.
