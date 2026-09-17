---
name: 0g-pc-setup
argument-hint: ''
description:
  Put a project on 0G Private Computer (pc.0g.ai, router-api.0g.ai) as Claude Code's model backend —
  TEE-backed inference reached through an Anthropic-compatible router. Use when the user wants to
  set up, connect or start using 0G in a project for the first time. Triggers include "接入 0G",
  "配置 0G", "把 Claude Code 接到 0G", "用 0G 的模型", "0G 怎么配", "set up 0G PC", "connect Claude
  Code to 0G", "put this project on 0G", "use 0G models in Claude Code". Claude Code only. Not for
  changing models afterwards and not for turning 0G off.
---

# Put this project on 0G

## Metadata

- **Category**: private-computer
- **SDK**: Not applicable. This skill configures Claude Code to reach the 0G router; it uses no 0G
  SDK, no wallet and no `.env`.
- **Activation Triggers**: "接入 0G", "配置 0G", "把 Claude Code 接到 0G", "用 0G 的模型",
  "0G 怎么配", "set up 0G PC"
- **Supported Host**: Claude Code only. It configures a project's `.claude/` directory, which Cursor
  and GitHub Copilot do not read.
- **Source**: `skills/0g-pc-setup/SKILL.md` in the `0gfoundation/0g-pc-skills` repository, where it
  is tested and released. Changes are made there first.

One job: get `<project>/.claude/` configured so Claude Code talks to the 0G router.

The installer does the writing. What this skill adds is the decision in front of it — which model,
and on what basis — plus the two things people get wrong afterwards.

## Hard rules

1. **Never write `~/.claude/settings.json`.** The user's global file holds their hooks, plugins,
   status line and `/model` choice. Read it if you need to; everything installed here goes inside
   `<project>/.claude/`.
2. **The key never enters the conversation.** You do not ask for it, receive it, read it out of a
   file, or put it on a command line you run. Hand the user the command and let _them_ paste their
   own key into their own terminal. If they paste a key into the chat anyway, tell them to rotate it
   at pc.0g.ai — it is now in a transcript.
3. **You do not run the installer.** It takes the key as an argument, so running it is the user's
   step, not yours. Hard rule 2 is why.
4. **Do not touch the permission gate.** The shipped config points
   `modelOverrides["claude-sonnet-5"]` at `0gm-1.0-35b-a3b`. In auto mode the safety classifier
   resolves through the **Sonnet** tier, not Haiku; put a reasoning model there and every Bash, git
   and network call times out with "temporarily unavailable" while chat keeps working — which reads
   as "model fine, tools broken".
5. **Every place the user has to decide is a tool call, not a sentence.** This file is loaded into
   whatever model drives the session. "Let the user choose", written as prose, reads as narration
   and gets walked past. Use AskUserQuestion and let it block. That tool is Claude Code's; in a host
   without an equivalent blocking prompt, stop and hand the choice back to the user rather than
   deciding for them.

## 0 — The one precondition

> Run this from the **host project root** — the directory you want on 0G. These paths resolve
> against the working directory, so running it inside `.0g-skills/` or any other checkout of this
> repository would configure the wrong project.

```bash
python3 - <<'PY'
import json, pathlib

# "在不在 0G 上"看的是**生效配置里的接入点**，不是某个文件在不在。
# 文件可能因为别的原因存在（团队自己的 settings.json），也可能因为新布局而不存在；
# 两种情况下"文件在不在"都答错。Claude Code 后加载 local，所以 local 压过 project。
ROUTER_URL = "https://router-api.0g.ai"

def load(p):
    try:
        d = json.loads(pathlib.Path(p).read_text())
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}

proj = load(".claude/settings.json")
local = load(".claude/settings.local.json")
env = {**(proj.get("env") or {}), **(local.get("env") or {})}

if env.get("ANTHROPIC_BASE_URL") != ROUTER_URL:
    print("absent")
elif (local.get("env") or {}).get("ANTHROPIC_BASE_URL") == ROUTER_URL:
    print("present")
else:
    print("present-old-layout")
PY
```

`present` means this project is already configured. Do not reinstall over it: say so, and point at
`/0g-pc-switch-model` (`skills/private-computer/0g-pc-switch-model/SKILL.md` here) if what they
actually want is a different model, or `/0g-pc-uninstall`
(`skills/private-computer/0g-pc-uninstall/SKILL.md` here) if they want out. Reinstalling to change a
model throws away a key for no reason.

`present-old-layout` means the 0G config sits in `.claude/settings.json`, which is where an earlier
version of the installer put it. It still runs, but the current installer will not touch it and
`--uninstall` will not undo it — those fields have to be moved into `.claude/settings.local.json` by
hand. Say that; do not offer to do it, and do not reinstall.

This is a precondition, not a mode decision — the job never changes with what is on disk, the skill
either does it or refuses to start.

## 1 — Ask the router what it serves

```bash
curl -s https://router-api.0g.ai/v1/models | python3 -c "
import json,sys
rows=[m for m in json.load(sys.stdin)['data']
      if 'anthropic' in (m.get('supported_formats') or [])
      and m.get('type') == 'chatbot' and m.get('context_length')]
if not rows: sys.exit('router returned no anthropic-format chat model - stop and report')
for m in sorted(rows, key=lambda x:-(x.get('context_length') or 0)):
    v=m.get('verifiability') if m.get('tee_attested') else None
    tee={'TeeML':'TEE, model in enclave','TeeTLS':'TEE, proxied upstream'}.get(v,'NO TEE')
    a=m.get('architecture') or {}
    img='text+image' if 'image' in (a.get('input_modalities') or []) else 'text only'
    print(f\"{m['id']:22} ctx={m.get('context_length'):>8}  {tee:22} {img}\")"
```

Only what this prints can be reached. A model the router serves in `openai` format only needs a
local translation layer, which is
[a different setup](https://github.com/0gfoundation/0g-pc-skills/blob/main/docs/claude-code.md#openai-only-models-need-the-bridge)
and not this one. If the endpoint is unreachable, stop and report — do not fall back to a list
written down somewhere, which is how a model retired last month gets recommended today.

Read the three TEE tiers out loud and **do not merge them**. They are different promises:

| Column                  | What it means                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TEE, model in enclave` | The model runs inside the enclave and signs its responses. The strongest guarantee on offer.                                   |
| `TEE, proxied upstream` | The enclave terminates TLS and forwards to an upstream provider. The connection is attested; the model's own execution is not. |
| `NO TEE`                | Ordinary hosted inference, with the privacy properties of any hosted API.                                                      |

This column is the reason someone is here. Flattening it to "TEE ✓" tells them something false about
where their prompt gets processed — and TEE is what they are paying for.

Mention `text only` / `text+image` as well. The shipped default is text-only: it cannot take an
image at all, and `fallbackModel` does not rescue that, because it fires on the router being
overloaded rather than on the request being the wrong shape.

## 2 — Let them choose, and wait

Put the list to the user with **AskUserQuestion**, carrying context length, TEE tier and the image
column into what they see. Recommend the shipped default, `glm-5.3` — TEE with the model in the
enclave, the largest context among those, text only — but present it as the default, not as the
answer.

**Write nothing and suggest no command until the answer comes back.**

## 3 — Hand them the command

```bash
curl -fsSL https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main/install.sh | bash -s claude --key sk-…
```

Tell them, in this order:

1. **Run it from the project they want on 0G.** It writes into that folder and nowhere else, so the
   directory is the one thing that matters.
2. **Replace `sk-…` with their own key**, from pc.0g.ai → Dashboard → API Keys. This is their step;
   hard rule 3.
3. **`--key -` prompts for the key instead**, with echo off, so it stays out of shell history. Worth
   mentioning to anyone who shares a machine or keeps history in a synced dotfile.
4. It writes `.claude/settings.local.json` (mode 600) and one line in `.claude/.gitignore` to keep
   it out of git. `.claude/settings.json` is not touched — going on 0G is a personal, per-machine
   choice, and a committed config points teammates who have no 0G key at the 0G router. It checks
   the key against the router **before** writing anything, so a rejected key says so with nothing on
   disk instead of surfacing later as a failure to start. An account with no balance (402) is not a
   failure: the config is written and correct, and it says so.

If their chosen model is not the shipped default, they install first and then run
`/0g-pc-switch-model <model>` (`skills/private-computer/0g-pc-switch-model/SKILL.md` here). **Do not
rewrite the model fields from here.** That rewrite has one owner, and duplicating it in two skills
is how the two drift apart.

## 4 — Hand off

Restart Claude Code, then `/status`: the Base URL should read `https://router-api.0g.ai`. The
startup line `[claude-code:unrecognized_model]` is expected and harmless — Claude Code does not know
0G's model names.

To confirm the parts that are easy to get wrong:

```bash
curl -fsSL https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main/check-0g.sh | sh
```

Silence is the pass.

## When it goes wrong

| Symptom                                                                     | Cause → fix                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Not logged in · Please run /login`                                         | The project has a 0G config but no usable credential. **`/login` does not fix this** — it authenticates against Anthropic, and that token is useless once the base URL points at 0G. Re-run the installer so the key lands in `settings.local.json`; re-running is also how a key is rotated, and it no longer resets a model chosen with `/0g-pc-switch-model` (`skills/private-computer/0g-pc-switch-model/SKILL.md` here). |
| 401                                                                         | The router rejected the key. Check it at pc.0g.ai → Dashboard → API Keys. A 401 also takes down the auto-mode classifier, so fix it before diagnosing anything about tools.                                                                                                                                                                                                                                                   |
| 402                                                                         | The key is valid and the account is empty. Nothing in the config needs changing — top up at https://pc.0g.ai/dashboard/overview                                                                                                                                                                                                                                                                                               |
| Auto mode: "… is temporarily unavailable, cannot determine the safety of …" | Read the model named in the message. The gate resolves through the Sonnet tier, so this is the permission gate — hard rule 4. A `[1m]` suffix on the name is not the cause; measured on 2.1.273, the tag does not reach the gate.                                                                                                                                                                                             |
| The config seems ignored                                                    | Claude Code was launched from a different directory. Project config is scoped to the folder holding `.claude/`.                                                                                                                                                                                                                                                                                                               |
| Step 0 said `present-old-layout`                                            | The 0G config is in `.claude/settings.json`, where an earlier installer put it. It runs, but the current installer will not touch it and `--uninstall` will not undo it. Those fields have to be moved into `settings.local.json` by hand — say so; do not offer to do it.                                                                                                                                                    |
