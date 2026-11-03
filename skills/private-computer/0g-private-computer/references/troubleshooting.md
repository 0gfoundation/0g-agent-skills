# 0G PC: Troubleshooting

Part of the 0g-private-computer skill. Read [SKILL.md](../SKILL.md) first: its ground rules apply
here, and it decides whether this is the right flow. Use this file when something fails in either
flow.

Diagnose before changing anything, and prefer the smallest reversible fix. Don't repeat a failed
write or job submission; fix the cause first. Don't hand-edit tool config to work around a failure.

| Symptom                                     | Cause                                               | What to do                                                                                                                                                                                                               |
| ------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0gpc: command not found`                   | Not installed globally                              | Use `npx -y @0gfoundation/0gpc@latest` in place of `0gpc`.                                                                                                                                                               |
| Node.js error, or version below 22          | Unsupported Node                                    | Show https://nodejs.org/en/download/ or `nvm install 22 && nvm use 22`. Let the user install it.                                                                                                                         |
| Tool not found or too old                   | Coding tool missing                                 | 0gpc prints the official install command and guide. Show it; the user decides whether to run it.                                                                                                                         |
| No saved key                                | Connect step 2 not done                             | The user runs `0gpc key set` in their own terminal.                                                                                                                                                                      |
| Key invalid                                 | Revoked, mistyped or wrong key                      | The user creates a new key at https://pc.0g.ai/dashboard/api-keys and runs `0gpc key set` again (or updates their environment variable). Every tool using the old saved key is updated automatically.                    |
| `401 Unauthorized` while the key looks fine | The client sends a different credential             | [Check credentials](#checking-credentials). A key or base URL exported in the user's shell can override config. Tell the user which names are set; they decide whether to remove them.                                   |
| Balance too low, or looks empty             | Account needs funds, or funds are in Compute Direct | The user adds funds on pc.0g.ai. Funds shown in Advanced mode on pc.0g.ai or deposited on compute-marketplace.0g.ai belong to Compute Direct, not the Router balance. Never move money for them.                         |
| Permission denied                           | Key not allowed for this use                        | The user checks the key's settings on pc.0g.ai.                                                                                                                                                                          |
| Model not found                             | Wrong id, or the model is no longer served          | Pick again from https://pc.0g.ai/models. Never guess an id.                                                                                                                                                              |
| Errors or rate limits from the Router       | Request or provider issue                           | See https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/errors and https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/rate-limits. Retry only errors documented as safe to retry. |
| Image or video job seems stuck              | Long generation, or a client timeout                | Keep polling the same job as the model's page describes. Don't submit again.                                                                                                                                             |
| Can't reach the network behind a proxy      | Proxy settings                                      | Relay doctor's proxy hint. Don't print the proxy address.                                                                                                                                                                |
| Doctor says config was changed outside 0gpc | The user or another tool edited the file            | Don't overwrite it. Show what doctor reports and ask: keep their edit, or re-apply (dry-run first)? To undo 0gpc's last change, the user opens the bare `0gpc` menu in their own terminal.                               |
| Tool still uses the old model               | Not restarted, or another setting overrides it      | Ask the user to fully quit and reopen the tool. If it persists, run `doctor --offline` and [check credentials](#checking-credentials).                                                                                   |

## Set up by the old installer

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
  themselves, then connect again with the [connect flow](connect.md).

## Checking credentials

To see which credential-related environment variables are set without exposing their values, run:

```
printenv | cut -d= -f1 | grep -iE 'anthropic|openai'
```

This prints names only. Never run a command that prints the values.

## Asking for help

If none of this resolves it, point the user to https://discord.gg/0glabs and suggest they share the
report template (connect or build, as much as exists), the output of `0gpc -v` and
`0gpc doctor --offline` if relevant, and the model id. Remind them never to share the API key
itself.
