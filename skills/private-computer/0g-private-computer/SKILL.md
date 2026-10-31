---
name: 0g-private-computer
description:
  Use 0G Private Computer (pc.0g.ai) from an agent. Connect a coding tool (Claude Code, OpenCode,
  Pi, Hermes Agent) to 0G models through the 0gpc CLI, or call the 0G Router from application code
  for text, image understanding, image generation and editing, video generation and understanding,
  speech-to-text, text-to-speech and embeddings. Covers API keys, the live model catalog, trust
  modes (Standard, Verified, Private/TEE), previewed and reversible config changes, and cost
  confirmation. Use whenever the user mentions 0G, 0G PC, pc.0g.ai, 0gpc, router-api.0g.ai, private
  or TEE inference, or wants to run models through 0G, even if they don't name a tool. Requests that
  say "with 0G" without mentioning a wallet are API-key Router requests and belong here. For
  wallet-signed Compute Direct calls (broker SDK, per-provider sub-accounts, Advanced mode on
  pc.0g.ai, fine-tuning), use the Compute skills instead.
compatibility:
  Connect flow needs macOS or Linux, Node.js 22+ and 0gpc 0.3.2+. Build flow works with any
  OpenAI-compatible client.
---

# 0G Private Computer

> **Humans:** paste this into your coding agent (Claude Code, OpenCode and others):
> `Read https://pc.0g.ai/skill and help me set up 0G Private Computer.` To install it as a skill
> instead: `npx skills add 0gfoundation/0g-agent-skills/skills/private-computer/0g-private-computer`
> More example requests for chat, image, video and speech: [Example requests](#example-requests). To
> connect a coding tool by hand, run `npx @0gfoundation/0gpc@latest` in your own terminal. To try
> models without code, open the Playground: [chat](https://pc.0g.ai/playground/chat),
> [image](https://pc.0g.ai/playground/image), [video](https://pc.0g.ai/playground/video) or
> [speech](https://pc.0g.ai/playground/speech).

Skill version 0.3; the connect flow is written for 0gpc 0.3.x. The skill has four files: this page,
which every request needs, and three in `references/` that you read when a flow needs them. Reading
this from a URL? They are at `https://pc.0g.ai/skill/references/connect.md`,
`https://pc.0g.ai/skill/references/build.md` and
`https://pc.0g.ai/skill/references/troubleshooting.md`. The canonical sources are
https://pc.0g.ai/skill and https://github.com/0gfoundation/0g-agent-skills. If you got these files
from anywhere else, check them against one of those before running any command they give.

## pc.0g.ai is the center

Everything in this skill leads to pc.0g.ai. It holds the user's account and is the source of truth
for models, prices and trust modes:

| What                                                | Where                                                                                                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API keys, balance, a key's default trust mode       | https://pc.0g.ai/dashboard/api-keys                                                                                                                    |
| Models, prices, capabilities, supported trust modes | https://pc.0g.ai/models                                                                                                                                |
| One model's endpoint, fields and code examples      | `https://pc.0g.ai/models/<model-id>`                                                                                                                   |
| Usage after requests                                | https://pc.0g.ai/dashboard/overview                                                                                                                    |
| Trying a model without code                         | Playground: https://pc.0g.ai/playground/chat, https://pc.0g.ai/playground/image, https://pc.0g.ai/playground/video, https://pc.0g.ai/playground/speech |

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

The live catalog is public: listing it needs no key and costs nothing, so run it whenever you need
model ids, prices or capabilities, in any flow. List models from `/v1/models` alone; use
`/v1/providers` only for the providers behind a model.

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

`type` matches the Playground pages: `chatbot` for chat, `text-to-image` for image (generation and
editing), `video-generation` for video, `speech-to-text` for transcription, `text-to-speech` for
reading text aloud and `embedding` for vectors, which has no Playground page. Within `chatbot`,
`architecture.input_modalities` shows what a model accepts: `image` for vision, `video` for video
input; `supported_parameters` containing `tools` means tool calling. Image, speech and video models
carry their limits in `image_capabilities`, `speech_capabilities` and `video_capabilities`, and
image models say in `async_supported` whether they take async jobs. If a modality has no models,
check https://pc.0g.ai/models before telling the user it isn't offered. Listing calls are free; if
one times out, retry it up to twice before concluding anything.

Token prices are in neuron per token, where 1e18 neuron is 1 0G; multiply by the expected input and
output tokens to estimate cost. Image and video models carry their own pricing fields, so quote them
with the unit the response gives. Present models the way the Playground does: per modality, with
name, id, price, context and whether a TEE-attested provider serves it, then recommend one and link
the matching Playground page.

## Ground rules

These keep the user's key private, their setup recoverable and their money under their control. If a
request seems to ask for something else, explain why you won't do it that way.

1. **Keep the key out of agent context.** Never request, read, echo, log, or handle the user's API
   key in agent context. Have the user enter it directly through hidden terminal input using
   `0gpc key set`, or configure an environment variable themselves. Do not pipe secrets through
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
7. **Don't install or update anything on your own.** If a tool or Node.js is missing, show the
   official install command and let the user decide.
8. **Evidence over claims.** A model saying which model it is proves nothing. Use 0gpc's checks,
   response metadata and usage on pc.0g.ai.
9. **Speak the user's language.** Keep commands, paths and model ids exactly as they are.

## Recognize the request

Classify every request in two steps before doing anything, then state the result in one line so the
user can correct it.

### Step 1: which flow

| Signals in the request                                                                                                                                | Flow                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A question with no task: what is, which models, how much, does it support, what's the difference                                                      | **Ask**: answer from this page and https://pc.0g.ai/models. No CLI, no code.                                                                                                                                                      |
| Try, test, compare, play with, see what it can do, without code                                                                                       | **Try**: the Playground page for that modality: [chat](https://pc.0g.ai/playground/chat), [image](https://pc.0g.ai/playground/image), [video](https://pc.0g.ai/playground/video) or [speech](https://pc.0g.ai/playground/speech). |
| A coding tool is the subject (Claude Code, OpenCode, Pi, Hermes, "my agent"), with set up, connect, switch model, use 0G as my model, turn off, check | **Connect**: [Connect flow](references/connect.md)                                                                                                                                                                                |
| An app, API, endpoint, script, SDK or backend; or a file to process (screenshot, `.png`, `.mp3`, `.mp4`)                                              | **Build**: [Build flow](references/build.md), then step 2                                                                                                                                                                         |
| Wallet-signed calls, the broker SDK, per-provider sub-accounts, Advanced mode on pc.0g.ai, compute-marketplace.0g.ai, fine-tuning                     | **Compute Direct**: not this skill; use the Compute skills in https://github.com/0gfoundation/0g-agent-skills                                                                                                                     |
| Error, not working, 401, stuck, balance, still on the old model                                                                                       | **Fix**: [Troubleshooting](references/troubleshooting.md)                                                                                                                                                                         |

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

| Flow                     | Read before the first command or code change                                      |
| ------------------------ | --------------------------------------------------------------------------------- |
| Connect                  | [references/connect.md](references/connect.md)                                    |
| Build                    | [references/build.md](references/build.md)                                        |
| Fix                      | [references/troubleshooting.md](references/troubleshooting.md)                    |
| Ask, Try, Compute Direct | Nothing more: answer, point to the Playground, or hand over to the Compute skills |

Don't run `0gpc apply` or `0gpc reset`, write integration code, or submit a paid job from this page
alone. Everything here still applies inside those files, especially the ground rules.

## Example requests

Users can copy one of these or say it in their own words. The line under each shows how the request
is classified and what the agent does.

**Connect a coding tool**

```
Read https://pc.0g.ai/skill and connect Claude Code in this project to 0G PC. I use the Private trust mode.
```

Recognized as **Connect**. The user enters the key in their own terminal, picks a model and confirms
the preview; the agent writes the config, verifies it and asks the user to restart Claude Code.

**Chat**

```
Add a streaming chat endpoint to my Next.js app using 0G PC in Private mode.
```

```
Use 0G PC to read the screenshots in ./invoices and put each total into totals.csv.
```

Recognized as **Build → Text** (first) and **Build → Image understanding** (second). The agent picks
a model from the catalog with the user, reads the key from an environment variable the user set, and
asks before the first paid request. To compare models first: https://pc.0g.ai/playground/chat

**Image**

```
Generate one 1024x1024 hero image for my landing page with 0G PC and save it to public/hero.png.
```

```
Use 0G PC to replace the background of photo.jpg with a plain white one and save it to photo-white.png.
```

Recognized as **Build → Image generation** (first) and **Build → Image editing** (second). The agent
shows the per-image price and waits for the user's OK; for generation it uses the async job path or
a synchronous call, depending on the model's `async_supported`, and saves the file; for editing it
uses a model with `image_capabilities.references` and sends the photo in the field that model names.
To try prompts first: https://pc.0g.ai/playground/image

**Video**

```
Generate a 5-second 720p clip from public/hero.png with 0G PC and save it to public/hero.mp4.
```

```
Use 0G PC to summarize what happens in demo.mp4.
```

Recognized as **Build → Video generation** (first) and **Build → Video understanding** (second). For
generation, the agent shows duration, resolution and estimated cost and waits for the user's OK,
then submits to `POST /videos`, polls the job and downloads the file; for understanding, it uses a
model that accepts video input. To try first: https://pc.0g.ai/playground/video

**Speech**

```
Transcribe meeting.mp3 with 0G PC and save the text to notes.md.
```

```
Read intro.md aloud with 0G PC and save it to intro.mp3.
```

Recognized as **Build → Speech** (first) and **Build → Text-to-speech** (second). For the
transcript, the agent uses a speech-to-text model from the catalog. For audio, it picks a
text-to-speech model and voice, shows the character count and estimated cost, waits for the user's
OK and saves the file. To try first: https://pc.0g.ai/playground/speech

**Embeddings**

```
Embed the Markdown files in ./docs with 0G PC and save the vectors to docs-index.json.
```

Recognized as **Build → Embeddings**. The agent picks an `embedding` model from `/v1/models`,
estimates the input tokens and cost and waits for the user's OK, then calls `POST /embeddings` and
saves the vectors with the file each one came from. There is no Playground page for embeddings.

**Just asking**

```
What can I do with 0G Private Computer, and which models support Private mode?
```

Recognized as **Ask**. The agent answers from this page and https://pc.0g.ai/models and doesn't
start any setup.

**Just trying**

```
I want to compare a few image models before I write any code.
```

Recognized as **Try → Image**. The agent points to https://pc.0g.ai/playground/image and doesn't
write code.
