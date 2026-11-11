# 0G PC: Troubleshooting

Part of the 0g-private-computer skill. Read [SKILL.md](../SKILL.md) first: its ground rules apply
here, and it decides whether this is the right flow. Use this file when something fails in either
flow.

Diagnose before changing anything, and prefer the smallest reversible fix. Don't repeat a failed
write or job submission; fix the cause first. Don't hand-edit tool config to work around a failure.

## Find your symptom

| The user says                                     | Go to                                                |
| ------------------------------------------------- | ---------------------------------------------------- |
| An error, an HTTP status, `request_id`            | [Errors from the Router](#errors-from-the-router)    |
| `401`, "invalid key", "unauthorized"              | [401 and key problems](#401-and-key-problems)        |
| "Balance is empty", `402`, "insufficient balance" | [Balance and 402](#balance-and-402)                  |
| "Is the model down?", one model keeps failing     | [Model status](#model-status)                        |
| "Stuck", "hangs", "times out", job never finishes | [Stuck, slow or timed out](#stuck-slow-or-timed-out) |
| "Still on the old model", "didn't switch"         | [Still on the old model](#still-on-the-old-model)    |
| "Not working", command or tool won't run          | [Setup and tool problems](#setup-and-tool-problems)  |

## Errors from the Router

Every error body has `error.type` and `error.code`. Ask the user for the `request_id` in the error
body; it is what to quote when asking for help. Don't retry `400`, `401`, `402` or `403` until the
request has changed. Sources, checked on 2026-11-11:
[Errors](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/errors) and
[Rate Limits](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/rate-limits).

| Status | Common `code`                                                                                                                           | Cause                                                                                                 | What to do                                                                                                                                                                            |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_body`, `invalid_provider_header`, `no_provider_within_max_price`, `invalid_max_price_usd`, `pinned_provider_exceeds_max_price` | Bad model id, malformed body, unsupported feature, or a bad `X-0G-Provider-*` header or price ceiling | Fix the request: pick the model id from https://pc.0g.ai/models, check the body and headers. Don't resend as is.                                                                      |
| `401`  | `missing_authorization`, `invalid_api_key`, `api_key_revoked`                                                                           | No key, wrong key, or revoked key                                                                     | [401 and key problems](#401-and-key-problems)                                                                                                                                         |
| `402`  | `insufficient_balance`                                                                                                                  | Not enough balance                                                                                    | [Balance and 402](#balance-and-402)                                                                                                                                                   |
| `403`  | `access_denied`                                                                                                                         | The key isn't allowed to do this                                                                      | The user checks the key's permissions on https://pc.0g.ai/dashboard/api-keys, or uses another key.                                                                                    |
| `404`  | `api_key_not_found`, or a wrong path                                                                                                    | The thing you asked for doesn't exist                                                                 | Check the endpoint path and the model id. If the client adds `/v1` itself, don't add it twice.                                                                                        |
| `429`  | `rate_limit_exceeded`                                                                                                                   | Too many requests per minute                                                                          | Wait for the `Retry-After` header (seconds), then retry. Never retry in a tight loop. See below.                                                                                      |
| `500`  | `internal_error`                                                                                                                        | Problem on the 0G side                                                                                | Don't loop. Report it with the `request_id`.                                                                                                                                          |
| `502`  | `provider_error`                                                                                                                        | The provider failed after the Router tried others                                                     | Retrying once may help; a provider may have recovered.                                                                                                                                |
| `503`  | `no_available_provider`                                                                                                                 | No healthy provider for this model right now                                                          | Check https://pc.0g.ai/status ([Model status](#model-status)); use another model, or wait. If the user set Private or Verified, check on the model's page that it supports that mode. |

**Rate limits.** The limit depends on the account and may change; the docs publish no fixed numbers,
so don't quote any. Every inference response carries `X-RateLimit-Limit-Requests`,
`X-RateLimit-Remaining-Requests` and `X-RateLimit-Reset-Requests` (an ISO-8601 time). A `429` also
carries `Retry-After`. Slow the client down, or queue requests, instead of retrying fast.

## Model status

Before debugging a failing request, check whether the model itself is having trouble:
https://pc.0g.ai/status. Anyone can open it; no key is needed.

- **What it shows:** an overall banner (for example "Partial outage") and health by model group
  (Claude, GPT, Gemini, GLM, DeepSeek, Qwen, MiniMax, Image & Video, 0G models, Embeddings & Audio
  and others). A group is labeled "Operational", "Outage" or "No recent data"; one with problems
  also says how many of its models are affected (for example "2 of 4 models affected") and lists its
  models, with "Outage" on the affected ones. A listed model with no label has no problem flagged.
  The labels follow the page language.
- **How it is measured:** the success rate of real requests in the past 2 hours. When a model has no
  traffic, the page uses synthetic checks instead. It shows no uptime percentage and no latency.
- **What it doesn't show:** incident history, start and end times, or causes. "No recent data" means
  there is nothing to judge from, not that the model is down.

How to use it:

| What the page shows for the model                               | What to do                                                                                                                                                                                |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Outage" on the model, or "N of M models affected" on its group | The failure is likely not the user's setup. Don't change their config or key. Use another model, or wait and check the page again. `503` `no_available_provider` usually looks like this. |
| "Operational", or no label on a model in an affected group      | Look at the request instead: [Errors from the Router](#errors-from-the-router), [401 and key problems](#401-and-key-problems), [Balance and 402](#balance-and-402).                       |
| "No recent data"                                                | Treat it as unknown. Send one request the user agrees to, and read the error.                                                                                                             |

A model can look healthy on the page and still fail for one user, because the page reflects overall
success rates. Quote the `request_id` when reporting a single failing request.

## 401 and key problems

| Symptom                             | Cause                                               | What to do                                                                                                                                                                                            |
| ----------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No saved key                        | Connect step 2 not done                             | The user runs `0gpc key set` in their own terminal.                                                                                                                                                   |
| Key invalid or revoked              | Mistyped, deleted or revoked key                    | The user creates a new key at https://pc.0g.ai/dashboard/api-keys and runs `0gpc key set` again (or updates their environment variable). Every tool using the old saved key is updated automatically. |
| `401` while the key looks fine      | The client sends a different credential             | [Check credentials](#checking-credentials). A key or base URL exported in the user's shell can override config. Tell the user which names are set; they decide whether to remove them.                |
| `401` in application code           | Header or base URL wrong                            | The header is `Authorization: Bearer <key>`, and the base URL is `https://router-api.0g.ai/v1`. Check the code reads the right environment variable, and that `.env` was loaded.                      |
| Works in one tool, `401` in another | Each tool keeps its own copy of the key or variable | Update the variable or key in that tool; don't copy the key into the conversation.                                                                                                                    |
| `403` or "Permission denied"        | Key not allowed for this use                        | The user checks the key's settings on pc.0g.ai.                                                                                                                                                       |

If the user pastes a key into the chat, don't use it: tell them it is now in the conversation
history and they should replace it at https://pc.0g.ai/dashboard/api-keys.

## Balance and 402

| Symptom                                  | Cause                                                              | What to do                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `402` / `insufficient_balance`           | The account doesn't have enough funds for the request              | The user adds funds on https://pc.0g.ai. Don't retry until they have. Never pay, deposit or move money for them.                                                                                                                   |
| Balance looks empty, but they have funds | The funds are in Compute Direct, not the Router balance            | Funds shown in Advanced mode on pc.0g.ai, or deposited on compute-marketplace.0g.ai, belong to Compute Direct. They are separate from the Router balance, and don't pay for Router calls. Never move money for them.               |
| Balance dropped after a failed call      | Billing follows what the provider actually ran, not the connection | A timed-out call may still have run and been billed. Check usage at https://pc.0g.ai/dashboard/overview before retrying, and don't resend a paid job automatically.                                                                |
| Usage doesn't match the estimate         | The estimate was rough                                             | Compare with https://pc.0g.ai/dashboard/overview. Prices come from the model's page at `https://pc.0g.ai/models/<model-id>`: per token for text, per image, per second or character for audio, per the model's own unit for video. |

## Stuck, slow or timed out

| Symptom                                             | Cause                                       | What to do                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image or video job seems stuck                      | Long generation, or a client timeout        | Keep polling the same job as the model's page describes. Don't submit again.                                                                                                                                        |
| Video: `409` on download                            | The job isn't finished yet                  | Keep polling `GET /videos/{id}` until `status` is `completed`, then download once. `429` on download: too many at once, retry later.                                                                                |
| Video: `424` on download, or `status: "failed"`     | The job failed and has no output            | A failed job still answers 200 on poll, with `status: "failed"`. Tell the user; ask before submitting a new paid job.                                                                                               |
| Video: `429` `video_jobs_in_flight_limit` on submit | The account has the maximum unfinished jobs | Wait for earlier jobs to finish. Don't resubmit.                                                                                                                                                                    |
| Image call (synchronous) timed out                  | Generation takes tens of seconds            | Set a long client timeout. Don't resend automatically: the request may have run and been billed. Ask the user first.                                                                                                |
| Long text answer cuts off or times out              | A long non-streaming request                | Use `stream: true` for long outputs. Some models say so in their catalog description (for example, 0GM says non-streaming requests must finish within about 10 minutes).                                            |
| Everything is slow, or only one model is slow       | Busy provider, or a heavy model             | Check https://pc.0g.ai/status first ([Model status](#model-status)), then https://pc.0g.ai/models for a model with lower latency or a different provider; pinning a provider is optional (`X-0G-Provider-Address`). |
| Can't reach the network behind a proxy              | Proxy settings                              | Relay doctor's proxy hint. Don't print the proxy address.                                                                                                                                                           |

## Still on the old model

A model telling you which model it is proves nothing. Check evidence instead: the model id in the
`/v1/models` list, the `model` your tool sends, and the new request on
https://pc.0g.ai/dashboard/overview.

| Symptom                                      | Cause                                              | What to do                                                                                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tool still uses the old model                | Not restarted, or another setting overrides it     | Ask the user to fully quit and reopen the tool, in the same directory for project scope. If it persists, run `doctor --offline` and [check credentials](#checking-credentials).            |
| The agent you're talking to didn't switch    | You configured the tool you're running inside      | This conversation keeps its current model. The new one applies after a full restart. Don't claim the switch is already live.                                                               |
| Changed one project, another project didn't  | Scope: `project` changes one directory, `user` all | Run `0gpc status --json` to see which scope and model each tool has. Use `user` only if the user wants it everywhere.                                                                      |
| Switched model, but usage shows the old one  | The tool or app still sends the old `model` value  | In code, check the `model` string and the environment. In a tool, check `0gpc status --json`.                                                                                              |
| `Model not found`                            | Wrong id, or the model is no longer served         | Pick again from https://pc.0g.ai/models. Never guess an id.                                                                                                                                |
| Claude Code uses 0G where 0gpc shows nothing | Set up by the old installer                        | See [Set up by the old installer](#set-up-by-the-old-installer).                                                                                                                           |
| Doctor says config was changed outside 0gpc  | The user or another tool edited the file           | Don't overwrite it. Show what doctor reports and ask: keep their edit, or re-apply (dry-run first)? To undo 0gpc's last change, the user opens the bare `0gpc` menu in their own terminal. |

## Setup and tool problems

| Symptom                                                                                                       | Cause                                                                              | What to do                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0gpc: command not found`                                                                                     | Not installed globally                                                             | Use `npx -y @0gfoundation/0gpc@latest` in place of `0gpc`.                                                                                                                                                                                                                                                               |
| Node.js error, or version below 22                                                                            | Unsupported Node                                                                   | Show https://nodejs.org/en/download/ or `nvm install 22 && nvm use 22`. Let the user install it.                                                                                                                                                                                                                         |
| Tool not found or too old                                                                                     | Coding tool missing                                                                | 0gpc prints the official install command and guide. Show it; the user decides whether to run it.                                                                                                                                                                                                                         |
| A tool or platform 0gpc doesn't list (for example Codex, OpenCode V2, Windows, Pi or Hermes at project scope) | Not available in the installed 0gpc version; support may arrive in a newer release | Run `npx -y @0gfoundation/0gpc@latest -h` and check what the latest version supports before saying it's unavailable. If it still isn't listed, say so plainly and don't hand-write config as a workaround. For manual setup, point to https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/quickstart. |
| Tool answers, but nothing shows in usage                                                                      | Not actually going through 0G                                                      | Run `0gpc status --json` and `doctor --offline`; [check credentials](#checking-credentials). Then look for a new request on https://pc.0g.ai/dashboard/overview.                                                                                                                                                         |
| Image or video model rejects the request                                                                      | Wrong fields, size or reference input                                              | Open the model's page `https://pc.0g.ai/models/<model-id>` for the exact fields and limits. Don't guess them.                                                                                                                                                                                                            |

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
`0gpc doctor --offline` if relevant, the model id, and the `request_id` from the error body. Remind
them never to share the API key itself.
