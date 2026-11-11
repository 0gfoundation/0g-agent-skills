---
name: 0g-private-computer
description:
  Use 0G Private Computer (pc.0g.ai) from an agent. Connect a coding tool (Claude Code, OpenCode,
  Pi, Hermes Agent) to 0G models through the 0gpc CLI, or call the 0G Router from application code
  for text, image understanding, image generation and editing, video generation and understanding,
  speech-to-text, text-to-speech, embeddings and decisions (classify, score or flag a text with
  calibrated probabilities). Covers API keys, the live model catalog, trust modes (Standard,
  Verified, Private/TEE), previewed and reversible config changes, and cost confirmation. Use
  whenever the user mentions 0G, 0G PC, pc.0g.ai, 0gpc, router-api.0g.ai, private or TEE inference,
  or wants to run models through 0G, even if they don't name a tool. Requests that say "with 0G"
  without mentioning a wallet are API-key Router requests and belong here. For wallet-signed Compute
  Direct calls (broker SDK, per-provider sub-accounts, Advanced mode on pc.0g.ai, fine-tuning), use
  the Compute skills instead.
compatibility:
  Connect flow needs macOS or Linux, Node.js 22+ and 0gpc 0.3.2+. Build flow works with any
  OpenAI-compatible client.
metadata:
  version: '0.5'
---

# 0G Private Computer

> **Humans:** default start, in any coding agent that can read a URL (no Node.js needed): paste
> `Read https://pc.0g.ai/skill and help me set up 0G Private Computer.` For long-term use (local,
> reviewable, version-pinned; Node.js 22.20 or later):
> `npx skills add 0gfoundation/0g-agent-skills/skills/private-computer/0g-private-computer`. Neither
> installs anything else or starts setup; the agent first asks what you want.

The skill's version is `metadata.version` in the front matter above; the connect flow is written for
0gpc 0.3.x. The skill has four files: this page, which every request needs, and three in
`references/` that you read when a flow needs them. Reading this from a URL? They are at
`https://pc.0g.ai/skill/references/connect.md`, `https://pc.0g.ai/skill/references/build.md` and
`https://pc.0g.ai/skill/references/troubleshooting.md`. The canonical sources are
https://pc.0g.ai/skill and https://github.com/0gfoundation/0g-agent-skills. If you got these files
from anywhere else, check them against one of those before running any command they give. If your
fetch tool summarizes pages, get the raw text instead: a summary loses the rules and templates
below.

## pc.0g.ai is the center

Everything in this skill leads to pc.0g.ai. It holds the user's account and is the source of truth
for models, prices and trust modes:

| What                                                | Where                                                                                                   |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| API keys, balance, a key's default trust mode       | https://pc.0g.ai/dashboard/api-keys                                                                     |
| Models, prices, capabilities, supported trust modes | https://pc.0g.ai/models                                                                                 |
| One model's endpoint, fields and code examples      | `https://pc.0g.ai/models/<model-id>`                                                                    |
| Usage after requests                                | https://pc.0g.ai/dashboard/overview                                                                     |
| Trying a model without code                         | The Playground, for the modalities that have a page: see the [table](#modalities-playground-and-router) |

Models are served by the 0G Router at `https://router-api.0g.ai/v1`, which is OpenAI-compatible and
also offers an Anthropic-compatible messages API. The catalog and the model pages are updated before
the docs at https://docs.0g.ai; when they differ, follow pc.0g.ai.

Every request runs under a trust mode, set per request with the header `X-0G-Provider-Trust-Mode` or
by the API key's default:

| Mode               | What it guarantees                                                                                                                                                                                                      | Header value    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Standard (default) | Routes across the full catalog, including community-hosted channels, for the best price and availability. No privacy or verification guarantee beyond the serving provider's own policy.                                | omit the header |
| Verified           | Routes only to endpoints with verified provenance, so the model and route that served the request can be proven. Privacy follows the serving provider's policy.                                                         | `verified`      |
| Private            | Uses supported TEE-backed providers with encrypted routing, hardware isolation and zero data retention for prompt content. Availability depends on the selected model. Routing and billing metadata may remain visible. | `private`       |

### List available models

When the user asks which models exist or what they cost, give https://pc.0g.ai/models first (it
shows the catalog per modality, and `https://pc.0g.ai/models/<model-id>` one model), then add the
detail below. The live catalog is public: listing it needs no key and costs nothing, so run it
whenever you need model ids, prices or capabilities, in any flow. List models from `/v1/models`
alone; use `/v1/providers` only for the providers behind a model.

| To get                                                                  | Run                                                                                                                              |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Every model: id, name, modality, context length, price, capabilities    | `curl -s https://router-api.0g.ai/v1/models`                                                                                     |
| The models for one modality                                             | The same list, keeping the entries whose `type` is that modality                                                                 |
| The providers behind one model: address, TEE attestation, verifiability | `curl -s "https://router-api.0g.ai/v1/providers?service_type=<type>"`, then keep the rows whose `canonical_id` is the model's id |

Use the `id` from `/v1/models` everywhere: as `model` in requests and in
`https://pc.0g.ai/models/<model-id>`. A `/v1/providers` row names the model twice: `model_id` is the
provider's own name for it (for example `seedream-4-5-251128`), and `canonical_id` is the
`/v1/models` id (`bytedance/seedream-4.5`). They are often the same (`glm-5.2`), but not always, so
map rows back through `canonical_id`. `/v1/providers?model=` matches `model_id`, so it finds the
providers of a `/v1/models` id only when the two names are the same. A row with no `canonical_id`
has no `/v1/models` entry; don't offer it as a model.

### Modalities: Playground and Router

Every modality can be called on the Router; only some can be tried in the Playground. This table is
the one place that says which.

| Modality                     | `type` in `/v1/models`                       | Try without code                                          | Router endpoint                             |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------- |
| Text                         | `chatbot`                                    | [chat](https://pc.0g.ai/playground/chat)                  | `POST /chat/completions`                    |
| Image understanding          | `chatbot` with `image` in `input_modalities` | [chat](https://pc.0g.ai/playground/chat), attach an image | `POST /chat/completions` with image content |
| Image generation and editing | `text-to-image`                              | [image](https://pc.0g.ai/playground/image)                | `POST /images/generations`                  |
| Video generation             | `video-generation`                           | [video](https://pc.0g.ai/playground/video)                | `POST /videos`                              |
| Video understanding          | `chatbot` with `video` in `input_modalities` | None: the chat Playground takes images, not video         | See the model's page                        |
| Transcription                | `speech-to-text`                             | [speech](https://pc.0g.ai/playground/speech)              | `POST /audio/transcriptions`                |
| Text-to-speech               | `text-to-speech`                             | [speech](https://pc.0g.ai/playground/speech)              | `POST /audio/speech`                        |
| Embeddings                   | `embedding`                                  | None                                                      | `POST /embeddings`                          |
| Decisions                    | `decisions`                                  | None                                                      | `POST /decisions`                           |

Endpoints are relative to the Router's base URL; the [Build flow](references/build.md) has how to
call each. Decision models answer typed questions about a text with probabilities instead of writing
text. Within `chatbot`, `architecture.input_modalities` shows what a model accepts: `image` for
vision, `video` for video input; `supported_parameters` containing `tools` means tool calling.
Image, speech and video models carry their limits in `image_capabilities`, `speech_capabilities` and
`video_capabilities`, and image models say in `async_supported` whether they take async jobs. If a
modality has no models, check https://pc.0g.ai/models before telling the user it isn't offered.
Listing calls are free; if one times out, retry it up to twice before concluding anything.

Quote prices in US dollars from `pricing_usd`, the way https://pc.0g.ai/models shows them. For
`chatbot`, `embedding` and `decisions`, `prompt` and `completion` are per token: multiply by
1,000,000 and say per 1M tokens (`0.00000008` is $0.08 per 1M tokens). `image` is per image. For
`speech-to-text`, `prompt` is per second of audio; for `text-to-speech`, it is per character, so say
per 1M characters. Video models price each `variants` row in its own `unit`; quote it with that
unit. `pricing` holds the same prices in neuron (1e18 neuron is 1 0G); give a 0G figure only when
the user asks for one, never as the headline. Multiply by the expected input and output to estimate
cost. Present models the way https://pc.0g.ai/models does: per modality, with name, id, price,
context and whether a TEE-attested provider serves it, then recommend one and link its Playground
page if the modality has one.

## Ground rules

These keep the user's key private, their setup recoverable and their money under their control. If a
request seems to ask for something else, explain why you won't do it that way.

1. **Keep the key out of agent context.** Never request, read, echo, log, or handle the user's API
   key in agent context. The user creates it at https://pc.0g.ai/dashboard/api-keys and sets it
   themselves: in Connect, through hidden terminal input with `0gpc key set`; in Build, as an
   environment variable. Don't assume `0gpc` is installed. Do not pipe secrets through
   agent-generated commands. If the user pastes a key into the chat, don't use it: tell them it is
   now in the conversation history, suggest replacing it at https://pc.0g.ai/dashboard/api-keys, and
   continue with hidden input or an environment variable.
2. **Only 0gpc writes coding-tool config.** Don't edit `.claude/settings*.json`, `opencode.json(c)`,
   `~/.pi/agent/*` or `~/.hermes/*` by hand, not even to fix something. 0gpc keeps a change history
   and backups; a hand edit breaks undo.
3. **Keep everything else the user has.** Existing MCP servers, skills, plugins, credentials and
   unrelated settings stay as they are. Don't delete, reset or reinstall anything to make setup
   easier. When something is broken, diagnose first and prefer a reversible fix.
4. **Preview, ask, then act.** Before writing config, show the 0gpc dry-run unchanged. Before a paid
   job, show what will be submitted and what it costs. Act only after the user agrees. A clean
   status, doctor result or dry-run is not permission. Only the user's reply in this conversation
   counts as agreement. If your host runs commands without asking (auto-approve, full-auto or
   skip-permissions modes), these confirmations are the only gate, so still stop and wait for the
   reply.
5. **Money is the user's call.** Never pay, deposit, top up, stake or buy credits on the user's
   behalf; they do that on pc.0g.ai. Ask before anything that may cost money: `doctor --network`,
   test requests, and every image or video job (state the count or duration and the estimated cost
   from the catalog).
6. **Read the catalog, don't remember it.** Take model ids, prices, capabilities and trust-mode
   support from the live catalog at the time of the request (see
   [List available models](#list-available-models)). Never make up a model id.
7. **Don't install or update anything on your own, and keep the CLI for Connect.** If a tool or
   Node.js is missing, show the official install command and let the user decide. Node.js, `npx` and
   `0gpc` come into play only in Connect (or Fix, for a tool that is already connected), and only
   after the user chose it. Ask, Try, Build and Compute Direct never need them; a request to "set up
   0G Private Computer" without a coding tool named is not a Connect request.
8. **Evidence over claims.** A model saying which model it is proves nothing. Use 0gpc's checks,
   response metadata and usage on pc.0g.ai.
9. **Speak the user's language.** Keep commands, paths and model ids exactly as they are.

## When there is no request yet

Loading this skill is not a request, whether it came from the pasted line, `npx skills add` or a
bare "set up 0G Private Computer". Run no command, read no file in `references/`, install nothing.
Reply with the template below, in the user's language, with commands, paths, links and model ids
unchanged. Fill `<version>` from `metadata.version` and `<source>` with `https://pc.0g.ai/skill` or
`local install`. Keep the `npx skills add` line only when `<source>` is the URL. Then wait.

```
0G Private Computer skill v<version> (read from <source>).
For long-term use, install it: npx skills add 0gfoundation/0g-agent-skills/skills/private-computer/0g-private-computer
(a local, reviewable, version-pinned copy; needs Node.js 22.20 or later).

What do you want to do?
1. Ask: what 0G PC is, which models, what they cost.
   Say: "which models support Private mode?"  Models: https://pc.0g.ai/models
2. Try: compare models in the Playground, no code.
   chat https://pc.0g.ai/playground/chat · image https://pc.0g.ai/playground/image
   video https://pc.0g.ai/playground/video · speech https://pc.0g.ai/playground/speech
3. Connect: put Claude Code, OpenCode, Pi or Hermes Agent on 0G models (uses the 0gpc CLI).
   Say: "connect Claude Code in this project to 0G PC"
4. Build: add 0G to your app or script (text, image, video, speech, embeddings, decisions).
   Say: "add a streaming chat endpoint with 0G PC in Private mode"
5. Compute Direct: wallet-signed calls, broker SDK, sub-accounts, fine-tuning (the Compute skills,
   not this one). https://github.com/0gfoundation/0g-agent-skills/tree/main/skills/compute
   Install: npx skills add 0gfoundation/0g-agent-skills/skills/compute/<skill>, for example
   streaming-chat or fine-tuning.
6. Fix: a 401, a balance problem, a model that seems down (status: https://pc.0g.ai/status),
   or a tool still on the old model.
   Say: "my 0G key gives a 401"

You need an API key for Connect and Build: create one at https://pc.0g.ai/dashboard/api-keys. It
never goes through me; you keep it in your own terminal or environment. Nothing is installed or
changed until you pick one.
```

Ask for a trust mode (Standard, Verified, Private) only after the user picks Connect or Build. If
the user's first message already carries a request, skip the template and classify it below. If the
user asks how to use the skill, show the [Usage guide](#usage-guide).

## Recognize the request

Classify every request in two steps before doing anything, then state the result in one line so the
user can correct it.

### Step 1: which flow

| Signals in the request                                                                                                                                | Flow                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A question with no task: what is, which models, how much, does it support, what's the difference                                                      | **Ask**: answer from this page, giving the link https://pc.0g.ai/models first (for one model, `https://pc.0g.ai/models/<model-id>`), then details from the live catalog, and common questions from [Answers for Ask](#answers-for-ask). No CLI, no code.                                                                                                     |
| Try, test, compare, play with, see what it can do, without code                                                                                       | **Try**: always give the Playground link for that modality, from the [table](#modalities-playground-and-router), and the model's page on https://pc.0g.ai/models. Video understanding, embeddings and decisions have none: say so, link `https://pc.0g.ai/models/<model-id>`, and offer one request through the Build flow once the user agrees to the cost. |
| A coding tool is the subject (Claude Code, OpenCode, Pi, Hermes, "my agent"), with set up, connect, switch model, use 0G as my model, turn off, check | **Connect**: [Connect flow](references/connect.md)                                                                                                                                                                                                                                                                                                           |
| An app, API, endpoint, script, SDK or backend; or a file to process (screenshot, `.png`, `.mp3`, `.mp4`)                                              | **Build**: [Build flow](references/build.md), then step 2                                                                                                                                                                                                                                                                                                    |
| Wallet-signed calls, the broker SDK, per-provider sub-accounts, Advanced mode on pc.0g.ai, compute-marketplace.0g.ai, fine-tuning                     | **Compute Direct**: not this skill; use the Compute skills in https://github.com/0gfoundation/0g-agent-skills                                                                                                                                                                                                                                                |
| Error, not working, 401, stuck, balance, still on the old model, is a model down, one model keeps failing                                             | **Fix**: [Troubleshooting](references/troubleshooting.md)                                                                                                                                                                                                                                                                                                    |

Tie-breakers:

- If the coding tool is the subject ("make Claude Code use 0G"), it is Connect. If the tool only
  does the work ("add 0G to my app"), it is Build; you may be that tool.
- "Switch model": if `0gpc status --json` shows the tool connected, it is Connect. If the model is
  set in the user's code or environment, it is Build.
- Processing a file now ("transcribe meeting.mp3", "make me a logo") is Build even without the word
  "app": you write and run a small script with the user's key from their environment.
- Pinning a specific provider is still Build: list its providers as in
  [List available models](#list-available-models) and send `X-0G-Provider-Address` (or
  `X-0G-Provider-Identity` to filter by channel). It is Compute Direct only when the user wants
  wallet-signed calls or per-provider sub-accounts.
- Fine-tuning and Advanced mode on pc.0g.ai are Compute Direct. The Router balance (default mode on
  pc.0g.ai) and Direct sub-accounts (Advanced mode, compute-marketplace.0g.ai) are separate; funds
  in one don't pay for calls in the other.

### Step 2: which modality (Build and Try only)

| Input → output                   | Typical words                                                                 | Modality            |
| -------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| text → text                      | ask, chat, write, summarize, translate, code, reason, call tools              | Text                |
| image (+ text) → text            | read, describe, extract, OCR, analyze; screenshot, photo, chart, scan         | Image understanding |
| text (+ reference image) → image | generate, draw, design, render, illustrate; logo, cover, poster, hero image   | Image generation    |
| image + instruction → image      | edit, retouch, remove, replace, change the background, restyle this photo     | Image editing       |
| text or image → video            | animate, make a video, generate a clip, turn this image into a video          | Video generation    |
| video (+ text) → text            | summarize, describe, find the moment, what happens in                         | Video understanding |
| audio → text                     | transcribe, captions, subtitles, minutes from a recording                     | Speech              |
| text → audio                     | read aloud, voice-over, narrate, text to speech, TTS                          | Text-to-speech      |
| text → vector                    | embed, embeddings, vectors, semantic search, similarity, RAG index, retrieval | Embeddings          |
| text + fixed questions → answers | classify, route, triage, label, score, rate, flag, yes or no, guardrail       | Decisions           |

When the words don't decide, the files do. An image (`.png`, `.jpg`, `.webp`) given as input means
image understanding; one requested as output means image generation, and both together mean image
editing. The same holds for video (`.mp4`, `.mov`). Audio input (`.mp3`, `.wav`, `.m4a`) means
speech; audio requested as output means text-to-speech.

Near misses:

- "Turn this photo into a video" is video generation (image-to-video), not image generation.
- "Get the text from this video": if the user wants the spoken words, it is speech, and the audio
  has to be extracted first (ask before installing a tool for that). Otherwise it is video
  understanding.
- "Edit this image" is image editing, not image generation from scratch: it needs a model whose
  `/v1/models` entry has `image_capabilities.references`. If none does, say so instead of generating
  a new image.
- "Read this aloud" is text-to-speech, served by `text-to-speech` models. A transcription
  (`speech-to-text`) model can't do it.
- "Semantic search" or "RAG over my docs": building the index and embedding each query is
  Embeddings; answering from the retrieved text is Text. Say which parts you will build.
- "Classify these tickets" or "is this message spam?": if the answer is one of fixed labels, a level
  on a scale or a yes/no, and a probability is useful, it is Decisions. If the user wants an
  explanation or free text, it is Text. When it could be either, ask.

### When unsure, ask one question

Ask a single question with two choices, then continue:

- Flow unclear: "Should I connect your coding tool to 0G PC, or add 0G PC to your app's code?"
- Image or video unclear: "Do you want me to analyze an existing one, or generate a new one?"

Don't start key setup, the CLI or code before the flow is clear.

### State the classification

Before the first command or code change, say it in one line, for example:

```
Plan: Build → Image generation · model <model id> · <price per image> · trust mode <mode>
```

If the user corrects it, reclassify and continue.

## Read the flow file before acting

Read a flow file from the local copy, or from its URL when you read this page from a URL (relative
links don't resolve there).

| Flow                     | Read before the first command or code change                                               |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Connect                  | `references/connect.md`, or `https://pc.0g.ai/skill/references/connect.md`                 |
| Build                    | `references/build.md`, or `https://pc.0g.ai/skill/references/build.md`                     |
| Fix                      | `references/troubleshooting.md`, or `https://pc.0g.ai/skill/references/troubleshooting.md` |
| Ask, Try, Compute Direct | Nothing more: answer, point to the Playground, or hand over to the Compute skills          |

Read only the file for the flow the user chose; don't open the other two. Don't run `0gpc apply` or
`0gpc reset`, write integration code, or submit a paid job from this page alone. Everything here
still applies inside those files, especially the ground rules.

## Answers for Ask

Short answers to common questions; for prices and model lists, read the live catalog instead.

- **Why a router:** providers differ in price, uptime and trust level, and each is a separate
  integration. The Router puts them behind one OpenAI-compatible API (also an Anthropic-compatible
  messages API), moves a request to another healthy provider if one fails, and enforces the trust
  mode, so a Private request never lands outside the Private set and a retry stays inside it.
- **0G's own models:** the 0GM family, for example `0gm-1.0-35b-a3b` (agentic coding and tool use)
  and `0gm-1.0-35b-a3b-sia` (text-only, adds per-token reward guidance). Both run in TEE-attested
  environments, so they work in Private mode. Context and prices: the live catalog. 0G PC also
  serves official model APIs and open models.
- **Modes differ per model:** a model hosted only on official APIs can't run in Private mode. Check
  the model's page on https://pc.0g.ai/models before relying on a mode.
- **Where requests run:** Private runs only on TEE-backed GPUs (0G or third-party). Verified can
  also use official model APIs, with the route verified; privacy follows that provider's policy.
  Standard adds community hosts and vetted resellers, which are not disclosed.
- **Payment:** 0G Mode (deposits, balance and charges in 0G) or USD Mode (fiat through Stripe,
  balance and charges in USD). No subscription fee; you pay per use.
- **Versus going direct to a provider:** one account, one bill, one API, failover between providers
  of the same model, and in Verified or Private mode evidence instead of a policy statement. In
  Standard mode you get coverage and price, but no verification or privacy guarantee beyond the
  serving provider's own policy.
- **Other tools:** the 0gpc CLI connects Claude Code, OpenCode, Pi and Hermes Agent. Any tool that
  speaks the OpenAI-compatible or Anthropic-compatible API can call the Router with an API key.
  Don't promise support for other named tools.

## Usage guide

Short version of what to say and what happens. Show it when the user asks how to use the skill. The
agent previews every change first and saves only after the user confirms.

**Run a coding agent on 0G models** (Claude Code, OpenCode V1, Pi, Hermes Agent, through the 0gpc
CLI; restart the tool afterwards so it picks up the new model)

| You want to                  | Say this                                                             | What happens                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Put your coding agent on 0G  | "connect Claude Code in this project to 0G PC"                       | Checks setup; you add your key in your own terminal, pick a model and approve the exact change                                               |
| See which models you can use | "which models can Claude Code use on 0G PC?" · "is glm-5.3 on 0G?"   | Queries the live catalog right then, with price, context length, tool calling and Private support; no key, no cost                           |
| Pick a model for coding      | "which 0G model is best for coding with Claude Code?"                | Recommends one model from the live catalog, plus up to two alternatives, and says why                                                        |
| Keep your code private       | "make sure Claude Code only uses Private (TEE) inference"            | Has you set your key to Private on pc.0g.ai, then picks a model served by a TEE-attested provider                                            |
| Switch model                 | "switch to a cheaper 0G model" · "use a model with a longer context" | Shows the options, previews the change and saves it after you confirm                                                                        |
| Confirm it's working         | "am I on 0G now?" · "check my 0G connection"                         | Checks the local setup and points you to your requests in usage on pc.0g.ai; asks before a network check, which may cost a very small amount |
| See what you've spent        | "how much have I spent on 0G?"                                       | Points you to usage and balance on pc.0g.ai; topping up is always your call                                                                  |
| Replace your key             | "I need a new 0G key" · "I pasted my key into the chat"              | You create a new key on pc.0g.ai and enter it in your own terminal; every connected tool picks it up                                         |
| Use 0G in every project      | "use 0G PC for Claude Code in all my projects"                       | Explains that this changes your global settings, previews it and asks before saving                                                          |
| Go back to your usual setup  | "turn 0G off" · "go back to Anthropic"                               | Removes only what 0gpc added; your other settings and your key stay                                                                          |

**Build with 0G models in your app** (the agent lists live models, you pick a model and trust mode;
the code reads your key from the environment; it asks before any request that costs money)

| Feature             | Say this                                                            | Before it runs                    | Try it                                       |
| ------------------- | ------------------------------------------------------------------- | --------------------------------- | -------------------------------------------- |
| Chat                | "add a streaming chat endpoint with 0G PC in Private mode"          | Picks a model with you            | [chat](https://pc.0g.ai/playground/chat)     |
| Vision              | "extract the totals from these screenshots with 0G PC"              | Picks a vision model              | [chat](https://pc.0g.ai/playground/chat)     |
| Image generation    | "generate a 1024x1024 hero image with 0G PC"                        | Shows the per-image price         | [image](https://pc.0g.ai/playground/image)   |
| Image editing       | "replace the background of photo.jpg with white using 0G PC"        | Shows the per-image price         | [image](https://pc.0g.ai/playground/image)   |
| Video generation    | "turn hero.png into a 5-second clip with 0G PC"                     | Shows duration and estimated cost | [video](https://pc.0g.ai/playground/video)   |
| Video understanding | "summarize what happens in demo.mp4 with 0G PC"                     | Picks a model that accepts video  | none                                         |
| Transcription       | "transcribe meeting.mp3 with 0G PC"                                 | Picks a speech-to-text model      | [speech](https://pc.0g.ai/playground/speech) |
| Text-to-speech      | "read intro.md aloud with 0G PC and save it as intro.mp3"           | Shows characters and cost         | [speech](https://pc.0g.ai/playground/speech) |
| Embeddings          | "embed the Markdown files in ./docs with 0G PC for semantic search" | Shows estimated tokens and cost   | none                                         |
| Decisions           | "route each ticket in tickets.csv to billing, technical or other"   | Shows estimated tokens and cost   | none                                         |

Prefer to do it yourself? Run `npx @0gfoundation/0gpc@latest` in your own terminal for the setup
wizard.

**Try, ask or fix**: say "which video models does 0G PC have, and which support Private?" for a live
list with prices (no key, no cost), try any model in the Playground first, or say "my 0G setup
stopped working" and the agent diagnoses first, then suggests the smallest fix you can undo.

**After `npx skills add`**: ask in plain words (for example "connect Claude Code to 0G PC") or type
`/0g-private-computer` in Claude Code, and restart the tool after installing.
