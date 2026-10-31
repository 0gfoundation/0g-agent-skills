# 0G PC: Connect flow

Part of the 0g-pc skill. Read [SKILL.md](../SKILL.md) first: its ground rules apply here, and it
decides whether this is the right flow. This flow connects a coding tool to 0G models through the
0gpc CLI.

## Running the CLI

Wherever this section says `0gpc`, run `npx -y @0gfoundation/0gpc@latest`. A global `0gpc` is fine
too if `0gpc -v` prints 0.3.2 or later.

This flow was written for 0gpc 0.3.x. If `-v` prints 0.4 or later, tell the user this page may be
behind the CLI. Where a command here fails or `0gpc -h` describes it differently, follow `0gpc -h`,
and never guess a flag. Never run bare `0gpc` yourself: it starts an interactive wizard that needs a
real terminal. If the user prefers the wizard, or you can't run commands, tell them to run
`npx @0gfoundation/0gpc@latest` in their own terminal.

| Command                                                    | Effect                                   | Ask first?                             |
| ---------------------------------------------------------- | ---------------------------------------- | -------------------------------------- |
| `0gpc -v` / `0gpc -h`                                      | Version / help                           | No                                     |
| `0gpc status --json`                                       | Connected tools and their models         | No                                     |
| `0gpc doctor --offline`                                    | Check local config, no network           | No                                     |
| `0gpc doctor --network`                                    | Check key, balance, permissions          | Yes, may cost                          |
| `0gpc apply <tool> --scope <scope> --model <id> --dry-run` | Preview only                             | No                                     |
| `0gpc apply <tool> --scope <scope> --model <id> --yes`     | Write config                             | Yes, after preview                     |
| `0gpc reset <tool> --yes`                                  | Remove only what 0gpc added; key is kept | Yes                                    |
| `0gpc key set`                                             | Hidden key entry                         | The user runs it in their own terminal |

Tools: `claude`, `opencode`, `pi`, `hermes`. Scopes: `project` or `user`; Pi and Hermes accept
`user` only. A non-zero exit means stop: don't run the same write again; go to
[Troubleshooting](troubleshooting.md).

To check health, run `status --json` and `doctor --offline` and report; nothing else. To disconnect,
run `status --json`, confirm which tool, say that only what 0gpc added is removed and the key stays,
then run `reset <tool> --yes` after the user agrees.

## Steps

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

**Step 2: Key.** If there is no saved key, ask the user to create one at
https://pc.0g.ai/dashboard/api-keys if needed, open a separate terminal and run

```
npx @0gfoundation/0gpc@latest key set
```

paste the key at the hidden prompt, and tell you when it is done. Then run `0gpc status --json`
again. Done when status shows a saved key. Creating the key and adding balance happen on pc.0g.ai
and only the user can do them.

**Step 3: Trust mode.** 0gpc 0.3 cannot set the trust mode; every request from the tool uses the API
key's default. New keys default to **Standard**. For private inference, the usual reason to use 0G
PC, the user sets the key to **Private** at Dashboard → API Keys → ⋯ → Edit on pc.0g.ai. Tell them
this and ask which mode they are using. Done when the user has stated the trust mode. Only the user
can change it.

**Step 4: Tool, scope, model.**

- Tool: one of the four. If it is not installed, the dry-run in step 5 will say so; stop there.
- Scope: default to `project` for `claude` and `opencode`, which affects only this directory; `user`
  affects every project. Pi and Hermes are always `user`. For `project`, show the current working
  directory and confirm it is the project root.
- Model: if `status --json` lists available models, offer one recommendation plus up to two
  alternatives, with context length and capabilities. If it doesn't, ask the user to choose at
  https://pc.0g.ai/models and give you the model id. If they chose Private, pick a model the catalog
  lists for Private.

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
the tool answers and a new request shows up in usage at https://pc.0g.ai/dashboard/overview.

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

- `project` changes only the current directory; `user` changes the tool everywhere on this machine
  (for Claude Code, `~/.claude/settings.json`, which every project reads). Use `user` only when the
  user asks for it, and say what it affects.
- 0gpc touches only the fields it writes. Every tool reads its config at startup, so the user has to
  fully quit and reopen it (in the same directory, for project scope).
- 0gpc's own files: `~/.config/0gpc/config.toml` (connections), `~/.local/share/0gpc/keys/` (saved
  keys), `~/.local/state/0gpc/` (history and backups). XDG paths are respected; `ZGPC_HOME` moves
  all of them. Never read, print or copy anything from the keys directory, and don't delete the
  state directory: it is what makes undo possible.
