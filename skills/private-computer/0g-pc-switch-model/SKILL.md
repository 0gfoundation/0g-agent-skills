---
name: 0g-pc-switch-model
argument-hint: '[model name]'
description:
  Switch which 0G Private Computer model Claude Code uses in this project, among the models the 0G
  router (router-api.0g.ai) actually serves in Anthropic format. Use when the user wants to change,
  switch or pick a different 0G model for a project that is already on 0G. Triggers include
  "换模型", "换个模型", "切到 glm-5.3", "换成别的 0G 模型", "switch 0G model", "change the 0G
  model", "use a different 0G model", "which 0G models can I use". Not for first-time setup and not
  for turning 0G off.
---

# Switch the 0G model for this project

## Metadata

- **Category**: private-computer
- **SDK**: Not applicable. This skill configures Claude Code to reach the 0G router; it uses no 0G
  SDK, no wallet and no `.env`.
- **Activation Triggers**: "换模型", "换个模型", "切到 glm-5.3", "换成别的 0G 模型", "switch 0G
  model", "change the 0G model"
- **Supported Host**: Claude Code only. It configures a project's `.claude/` directory, which Cursor
  and GitHub Copilot do not read.
- **Source**: `skills/0g-pc-switch-model/SKILL.md` in the `0gfoundation/0g-pc-skills` repository,
  where it is tested and released. Changes are made there first.

This skill does one thing: change which model `<project>/.claude/settings.local.json` points at.

It does not install, and it does not uninstall. If the user wants either, say so and stop —
`/0g-pc-setup` (`skills/private-computer/0g-pc-setup/SKILL.md` here) and `/0g-pc-uninstall`
(`skills/private-computer/0g-pc-uninstall/SKILL.md` here) are the ones, and doing their job from
here produces a half-configured project that looks finished.

## Hard rules

1. **Never write `~/.claude/settings.json`.** The user's global file holds their hooks, plugins,
   status line and `/model` choice. Read it if you need to; write only
   `<project>/.claude/settings.local.json`.
2. **Do not touch the permission gate.** `modelOverrides["claude-sonnet-5"]` must stay on
   `0gm-1.0-35b-a3b`. In auto mode the safety classifier resolves through the **Sonnet** tier, not
   Haiku; point it at a reasoning model and every Bash, git and network call times out with
   "temporarily unavailable" while chat keeps working — which reads as "model fine, tools broken"
   and sends people looking in the wrong place. `ANTHROPIC_DEFAULT_HAIKU_MODEL` and `fallbackModel`
   are likewise left alone; both are deliberately pinned to the fast model.
3. **Nothing takes effect until the next launch.** Finish by telling the user to restart. Never say
   the running session is now on the new model — it is not, and `/model` cannot get it there.
4. **Every place the user has to decide is a tool call, not a sentence.** This file is loaded into
   whatever model is driving the session, which in a project on 0G is a 0G model rather than Claude.
   A written instruction like "let the user choose" is read as narration and walked straight past.
   Use AskUserQuestion and let it block. That tool is Claude Code's; in a host without an equivalent
   blocking prompt, stop and hand the choice back to the user rather than deciding for them. This is
   the defect that made the skill this one was split out of non-interactive.

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

`absent` means this project is not on 0G at all, so there is no model to switch. Say that, point at
`/0g-pc-setup` (`skills/private-computer/0g-pc-setup/SKILL.md` here), and stop. Do not install
anything from here.

This is a precondition, not a mode decision: the skill's job never changes based on what it finds on
disk. It either does that job or refuses to start.

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

Never offer a model that is not in this output. A model the router serves in `openai` format only
cannot be reached by this config at all — it is a direct connection, with nothing in between to
translate. If the endpoint is unreachable, stop and report; do not fall back to a list written down
somewhere, which is how a model that was retired last month ends up recommended today.

Read the three TEE tiers out loud and **do not merge them**. They are different promises:

| Column                  | What it means                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `TEE, model in enclave` | The model runs inside the enclave and signs its responses. The strongest guarantee on offer.                                   |
| `TEE, proxied upstream` | The enclave terminates TLS and forwards to an upstream provider. The connection is attested; the model's own execution is not. |
| `NO TEE`                | Ordinary hosted inference.                                                                                                     |

Someone may be choosing a model precisely because of that column. Flattening it to "TEE ✓" tells
them something false about where their prompt gets processed.

Mention the `text only` / `text+image` column too. A text-only main model cannot take an image at
all — `fallbackModel` does not rescue that, because it fires on the router being overloaded, not on
the request being the wrong shape.

## 2 — Let the user pick, and wait

Put the models from step 1 to the user with **AskUserQuestion**, carrying the context length, the
TEE tier and the image column into what they see. Then stop.

**Write nothing until the answer comes back.** Not the config, not a draft, not "I'll assume glm-5.3
for now". When installed as a slash command, an argument may carry the answer: if one was passed
(`/0g-pc-switch-model glm-5.3` (`skills/private-computer/0g-pc-switch-model/SKILL.md` here)), that
is the answer and this step is already done — go to step 3 without asking.

If the user names a model the router serves in `openai` format only — `kimi-k3` and `glm-5.2` are
the ones people ask for — say plainly that a direct config cannot reach it, point at
[the reference](https://github.com/0gfoundation/0g-pc-skills/blob/main/docs/claude-code.md#openai-only-models-need-the-bridge),
and **stop there**. Do not start building a local translation layer inside this conversation. That
path exists and is documented; it is not this skill.

## 3 — Rewrite the four fields together

Put the id the user chose on the command line. **It has no default**: this file is loaded into
whatever model is driving the session, and a placeholder that happens to be a working model name is
a placeholder that gets left in place. With nothing to fall back on, forgetting it is a hard stop
instead of a confident report about a model nobody picked.

> Run this from the **host project root** — the directory you want on 0G. These paths resolve
> against the working directory, so running it inside `.0g-skills/` or any other checkout of this
> repository would configure the wrong project.

```bash
MODEL=          # ← the id from step 1, e.g. MODEL=glm-5.3
python3 - "$MODEL" <<'PY'
import json, pathlib, sys, urllib.request

TARGET = (sys.argv[1] if len(sys.argv) > 1 else "").strip()
if not TARGET:
    sys.exit("no model given - put the id the user chose in MODEL= and run it again. "
             "Nothing has been changed.")

with urllib.request.urlopen("https://router-api.0g.ai/v1/models", timeout=15) as r:
    live = {m["id"]: m for m in json.load(r)["data"]}
m = live.get(TARGET)
if m is None:
    sys.exit(f"{TARGET} is not on the router right now - check the list again")
if "anthropic" not in (m.get("supported_formats") or []):
    sys.exit(f"{TARGET} speaks {'+'.join(m.get('supported_formats') or ['no'])} only; "
             "a direct config cannot reach it. Pick one from the step 1 list.")

p = pathlib.Path(".claude/settings.local.json")
cfg = json.loads(p.read_text())          # fails loudly rather than clobbering
env = cfg["env"]
for k in ("ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_FABLE_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"):
    env[k] = TARGET
ceiling = m["context_length"] * 15 // 16
env["CLAUDE_CODE_MAX_CONTEXT_TOKENS"] = str(ceiling)

text = json.dumps(cfg, indent=2) + "\n"
json.loads(text)                          # validate before touching disk
p.write_text(text)
print(f"{TARGET}  context {m['context_length']}  ceiling {ceiling}")
PY
```

Four fields, one write. Three of them name the model; the fourth is the context ceiling, and it has
to move with it. Leave it at a larger model's value and nothing fails until the session grows long —
an error hours later, with nothing visibly connecting it to this switch.

The model name and the ceiling both come from the router in the same call that validates the choice.
Neither is typed into this file: a model name written down here would outlive its presence on the
router and turn every switch into a confident report about a model that is gone.

## 4 — Confirm, then hand off

```bash
curl -fsSL https://raw.githubusercontent.com/0gfoundation/0g-pc-skills/main/check-0g.sh | sh
```

Silence is the pass. It reads the effective model, the permission gate and the context ceiling, and
says nothing when all three agree.

Then tell the user to restart Claude Code, and to run `/status` afterwards to see the Model line.
The running session keeps the old model: `/model` switches tiers inside a session, but it cannot
reach a 0G model name — the client rejects the name before any request leaves the machine — so a
restart is the only way through.

## When it goes wrong

| Symptom                                                                     | Cause → fix                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auto mode: "… is temporarily unavailable, cannot determine the safety of …" | Read the model named in the message. If it is `0gm-1.0-35b-a3b`, the gate was changed — put `modelOverrides["claude-sonnet-5"]` back (hard rule 2). If it is the model just switched to, the Sonnet tier resolved to nothing and the classifier fell back to the main model.                                                     |
| That message names a model ending in `[1m]`                                 | Not the cause. Measured on 2.1.273 on both the settings-file and the in-session path: the tag does not reach the derived classifier. Diagnose the gate itself.                                                                                                                                                                   |
| The user picked `Sonnet` in `/model` and got a different model              | Expected. That entry advertises Anthropic's Sonnet 5 and its price, and resolves to `modelOverrides["claude-sonnet-5"]` — `0gm-1.0-35b-a3b` on the shipped config. `ANTHROPIC_DEFAULT_*` values rename their menu entries; `modelOverrides` does not.                                                                            |
| A `/model` switch is gone after restart                                     | Expected. `ANTHROPIC_MODEL` is always set by the shipped config, and a new session uses it. Change the config, not `/model`, for a lasting switch.                                                                                                                                                                               |
| Long sessions fail hours after a switch                                     | The ceiling did not move with the model. Re-run step 3 rather than editing the number by hand.                                                                                                                                                                                                                                   |
| The switch appears to do nothing                                            | The old session is still running, or `claude` was launched from a different directory — project config is scoped to the folder holding `.claude/`. If step 0 said `present-old-layout`, the 0G config is in `settings.json` and this skill does not write there: those fields have to be moved into `settings.local.json` first. |
| 402 from the router                                                         | The key is valid and the account is empty. Nothing in the config needs changing — top up at https://pc.0g.ai/dashboard/overview                                                                                                                                                                                                  |
