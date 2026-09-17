---
name: 0g-pc-uninstall
argument-hint: ''
description:
  Take this project off 0G Private Computer and back onto the normal Anthropic API, restoring
  whatever Claude Code configuration was there before. Use when the user wants to stop using 0G in a
  project, undo the setup, or return to their ordinary Claude Code. Triggers include "不用 0G 了",
  "退回原生", "退回原来的 API", "卸载 0G", "关掉 0G", "撤销 0G 配置", "uninstall 0G", "turn 0G off",
  "go back to Anthropic", "back to the normal API". Not for switching between 0G models and not for
  setting 0G up.
---

# Take this project off 0G

## Metadata

- **Category**: private-computer
- **SDK**: Not applicable. This skill configures Claude Code to reach the 0G router; it uses no 0G
  SDK, no wallet and no `.env`.
- **Activation Triggers**: "不用 0G 了", "退回原生", "退回原来的 API", "卸载 0G", "关掉 0G",
  "撤销 0G 配置"
- **Supported Host**: Claude Code only. It configures a project's `.claude/` directory, which Cursor
  and GitHub Copilot do not read.
- **Source**: `skills/0g-pc-uninstall/SKILL.md` in the `0gfoundation/0g-pc-skills` repository, where
  it is tested and released. Changes are made there first.

One job: return `<project>/.claude/` to the state it was in before 0G arrived.

If the user wants a _different_ 0G model rather than no 0G at all, that is `/0g-pc-switch-model`
(`skills/private-computer/0g-pc-switch-model/SKILL.md` here) — say so and stop. People reach for
"undo" when they mean "change", and uninstalling to reinstall loses their key for no reason.

## Hard rules

1. **Only this project's `.claude/`.** Never delete or rewrite `~/.claude/settings.json`. The user's
   global file holds their hooks, plugins, status line and `/model` choice, and it has nothing to do
   with 0G.
2. **Removing the key is irreversible, so confirm before you start.** The key lives in
   `<project>/.claude/settings.local.json`. Once it is out, it is out — 0G keys are shown at
   creation and not retrievable afterwards, so getting it back means issuing a new one at pc.0g.ai.
   Show what is about to change, wait for an answer, and only then run anything.
3. **Let the installer do the removing.** Run `install.sh --uninstall`; do not compose your own
   `rm`. The removal has moving parts that live in that script — deciding whether this project is
   bound to 0G at all, taking a named set of fields out of `settings.local.json` without disturbing
   anything else in it, refusing the old layout instead of guessing at it, and leaving the ignore
   rule in place. A hand-written `rm` skips all four and silently does more damage than the install
   ever did.
4. **Nothing takes effect until the next launch.** Finish by telling the user to restart.
5. **Every place the user has to decide is a tool call, not a sentence.** This file is loaded into
   whatever model drives the session, which in a project on 0G is a 0G model rather than Claude.
   "Ask the user first" written as prose reads as narration and gets walked past — which here means
   deleting a key nobody agreed to delete. Use AskUserQuestion and let it block. That tool is Claude
   Code's; in a host without an equivalent blocking prompt, stop and hand the choice back to the
   user rather than deciding for them.

## 1 — Say exactly what will happen

The removal is not "delete two files". What it does depends on what the install found when it
arrived, so read the project and report rather than guess:

> Run this from the **host project root** — the directory you want on 0G. These paths resolve
> against the working directory, so running it inside `.0g-skills/` or any other checkout of this
> repository would configure the wrong project.

```bash
python3 - <<'PY'
import json, pathlib

# 卸载看的是同一把钥匙：待修改的那个文件自己的接入点，逐字相等。
# 不看"文件在不在"——那答不出归属，只答得出巧合。
ROUTER_URL = "https://router-api.0g.ai"
MANAGED = ["env.ANTHROPIC_AUTH_TOKEN", "env.ANTHROPIC_BASE_URL", "env.ANTHROPIC_API_KEY",
           "env.ANTHROPIC_MODEL", "env.ANTHROPIC_DEFAULT_FABLE_MODEL",
           "env.ANTHROPIC_DEFAULT_OPUS_MODEL", "env.ANTHROPIC_DEFAULT_HAIKU_MODEL",
           "env.CLAUDE_CODE_MAX_CONTEXT_TOKENS", "fallbackModel", "modelOverrides"]

S = pathlib.Path(".claude/settings.json")
L = pathlib.Path(".claude/settings.local.json")
B = pathlib.Path(".claude/settings.json.0g-backup")

def load(p):
    try:
        d = json.loads(p.read_text())
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

proj, local = load(S), load(L)

if B.exists() or (proj.get("env") or {}).get("ANTHROPIC_BASE_URL") == ROUTER_URL:
    print("this project is on the layout an earlier installer wrote: the 0G config is in")
    print(".claude/settings.json. The installer will refuse to undo it automatically, and")
    print("it is right to - that file and its backup are not enough to rebuild what that")
    print("install wrote, so restoring the backup would silently drop anything added to")
    print("settings.json afterwards. Those fields have to be moved out by hand.")
    print("NOTHING WILL BE CHANGED. Stop here and say this.")
    raise SystemExit(0)

if (local.get("env") or {}).get("ANTHROPIC_BASE_URL") != ROUTER_URL:
    print("nothing to undo - this project is not on 0G")
    raise SystemExit(0)

def present(path):
    node = local
    parts = path.split(".")
    for part in parts[:-1]:
        node = node.get(part) if isinstance(node, dict) else None
        if not isinstance(node, dict):
            return False
    return parts[-1] in node

going = [p for p in MANAGED if present(p)]
rest = [k for k in local if k != "env"] + \
       ["env." + k for k in (local.get("env") or {}) if "env." + k not in MANAGED]

print("settings.local.json-> these fields come out:")
for p in going:
    print("                      " + p)
if rest:
    print("                      your own settings stay:", ", ".join(sorted(rest)))
else:
    print("                      nothing else is in the file, so the file goes too")
print(".claude/.gitignore -> KEPT. That one line keeps Claude Code's personal settings out")
print("                      of git whether or not you use 0G; removing it is the harmful act.")
print("settings.json      -> NOT TOUCHED. It is not on the install path, so it is not on")
print("                      the uninstall path either.")
print()
print("YOUR 0G KEY IS REMOVED. 0G shows a key once, at creation - if you want this project")
print("back on 0G later you will need to issue a new one at")
print("https://pc.0g.ai -> Dashboard -> API Keys")
PY
```

If it prints `nothing to undo`, say so and stop. There is nothing here to remove and no confirmation
to ask for.

## 2 — Get a real answer

Put that output to the user with **AskUserQuestion**. Not a summary of it — the lines themselves, so
they can see whether their own settings survive and that the key does not.

**Run nothing until the answer comes back.** If they decline, stop there and change nothing.

## 3 — Hand it to the installer

```bash
curl -fsSL https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main/install.sh | bash -s claude --uninstall
```

This one you may run yourself: it carries no key and takes no key. It prints what it did.

If `curl` cannot reach GitHub, stop and say so rather than improvising the removal by hand — hard
rule 3 is about exactly this moment.

## 4 — Hand off

Tell the user to restart Claude Code. The running session keeps the 0G configuration until it exits.

**There is nothing to unset.** This used to be the step everyone missed, back when the key lived in
the shell: it survived the deletion of the config, and Claude Code kept sending it to
`api.anthropic.com`, where it is not valid — an authentication failure that reads like a broken
account. The key travels with the file now. If the user still sees

```
⚠ another auth source is set and takes precedence over your claude.ai login
```

then something really is exporting `ANTHROPIC_AUTH_TOKEN` — an old `.zshrc` line, most likely, left
over from the way this used to be set up.

## When it goes wrong

| Symptom                                                   | Cause → fix                                                                                                                                       |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code still talks to 0G                             | The old session is still running. Restart it.                                                                                                     |
| `/status` still shows the 0G base URL after a restart     | `claude` was launched from a different directory, or a parent directory also has a `.claude/`. Project config is scoped to the folder it sits in. |
| `nothing to undo`, but the user is sure they installed it | They installed it in a different project. `install.sh` writes into the directory it is run from and nowhere else.                                 |
| The previous config came back but looks wrong             | The backup is what was there before the install, byte for byte. If it looks unfamiliar, it predates 0G — this skill did not write it.             |
