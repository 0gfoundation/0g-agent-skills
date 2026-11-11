# 0G PC: Build flow

Part of the 0g-private-computer skill. Read [SKILL.md](../SKILL.md) first: its ground rules apply
here, and it decides whether this is the right flow. This flow covers application code that calls 0G
models through the Router.

## Setup

- **Key:** the user creates it at https://pc.0g.ai/dashboard/api-keys and sets it as an environment
  variable themselves. Your code reads the variable; you never see the value. Make sure `.env` files
  are in `.gitignore`.
- **Endpoint:** base URL `https://router-api.0g.ai/v1`, auth `Authorization: Bearer <key>`. If the
  client appends `/v1` itself, don't add it twice. The official OpenAI SDKs work once the base URL
  and key point at the Router. For the Anthropic-compatible messages API, see the
  [endpoint table](#endpoints-by-modality).
- **Model:** list the candidates for the modality as in
  [List available models](../SKILL.md#list-available-models) and confirm one with the user (they can
  compare candidates first in the Playground page for that modality), then read that model's entry
  in `/v1/models` (its `*_capabilities` fields and, for images, `async_supported`) or open its page
  at `https://pc.0g.ai/models/<model-id>` for the exact endpoint, fields and code. Don't write
  endpoints or model ids from memory.
- **Trust mode:** send `X-0G-Provider-Trust-Mode: verified` or `private`, or rely on the key's
  default. Recommend `private` for sensitive data when the model supports it. If the user needs
  Private (or Verified) and the model's page doesn't list that mode, stop: say so, and let the user
  pick another model or change the requirement. Never fall back to Standard on your own, and never
  send the data anyway.
- **Provider (optional):** to pin one, list the model's providers as in
  [List available models](../SKILL.md#list-available-models) and send
  `X-0G-Provider-Address: <address>` from the row you pick. Billing still comes from the Router
  balance.
- **Cost:** a real request costs money. Before any request the user hasn't already approved the cost
  of, tell them the unit price from the catalog and an estimate (see the table below), and wait for
  their OK. The first request always needs one. Afterwards, point the user to usage at
  https://pc.0g.ai/dashboard/overview.

  | Modality                                       | Estimate from                                |
  | ---------------------------------------------- | -------------------------------------------- |
  | Text, image understanding, video understanding | Expected input and output tokens             |
  | Embeddings, decisions                          | Input tokens                                 |
  | Image generation and editing                   | Number of images                             |
  | Transcription                                  | Seconds of audio                             |
  | Text-to-speech                                 | Characters of input                          |
  | Video generation                               | Duration and resolution (the most expensive) |

  Ask once per task, not once per request: when the user approved a batch (for example 200 tickets
  at the quoted price), run it without asking again. Ask again if the count or the model changes.

- **If a request fails** (401, 402, 429, 5xx, a timeout, one model failing): don't retry blindly.
  Follow [Retries and timeouts](#retries-and-timeouts) and [Troubleshooting](troubleshooting.md);
  for a model that may be down, check https://pc.0g.ai/status first.

## Retries and timeouts

Paid requests are billed by what the provider actually ran, not by whether your connection stayed
open. So a timeout does not mean the request didn't happen.

| Situation                                                | Rule                                                                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `400`, `401`, `402`, `403`                               | Don't retry until the request, key or balance has changed. See [Troubleshooting](troubleshooting.md).                                  |
| `429`                                                    | Wait for the `Retry-After` header (seconds), then retry. Never retry in a tight loop.                                                  |
| `502`                                                    | Retry once; a provider may have recovered.                                                                                             |
| `503`                                                    | Don't loop. Check https://pc.0g.ai/status; use another model, or wait.                                                                 |
| `500`                                                    | Don't loop. Report it with the `request_id` from the error body.                                                                       |
| A paid request times out (image, TTS, video submit)      | Don't resend automatically. The request may still have run and been billed: check usage first, tell the user, and ask before retrying. |
| An async job (image async, video) times out on your side | Keep polling the same job id. Don't submit again.                                                                                      |
| Long text output                                         | Use `stream: true`; long non-streaming requests can time out.                                                                          |

Each modality below lists only what is specific to it.

## Endpoints by modality

| The user wants                                       | Modality            | Endpoint                                                                                                                           | Catalog service type                                                           |
| ---------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Chat, code, reasoning, tool calls                    | Text                | `POST /chat/completions`, or the Anthropic-compatible `POST /messages` (for Anthropic SDKs and tools)                              | `chatbot` (`supported_formats` lists `openai` and, where offered, `anthropic`) |
| Read a screenshot, photo, chart or scanned page      | Image understanding | `POST /chat/completions` with image content                                                                                        | `chatbot` (model whose `input_modalities` include `image`)                     |
| Create an image from a description                   | Image generation    | `POST /images/generations`; for models with `async_supported: true`, `POST /async/images/generations`, then `GET /async/jobs/{id}` | `text-to-image`                                                                |
| Change an existing image                             | Image editing       | `POST /images/generations` with reference images (synchronous)                                                                     | `text-to-image` (model with `image_capabilities.references`)                   |
| Turn speech into text                                | Transcription       | `POST /audio/transcriptions`                                                                                                       | `speech-to-text`                                                               |
| Read text aloud                                      | Text-to-speech      | `POST /audio/speech`                                                                                                               | `text-to-speech`                                                               |
| Create a video from text or images                   | Video generation    | `POST /videos`, then `GET /videos/{id}`, then `GET /videos/{id}/content`                                                           | `video-generation`                                                             |
| Ask questions about a video                          | Video understanding | See the model's page                                                                                                               | `chatbot` (model whose `input_modalities` include `video`)                     |
| Turn text into vectors for search, clustering or RAG | Embeddings          | `POST /embeddings`                                                                                                                 | `embedding`                                                                    |
| Classify, route, score or flag a text                | Decisions           | `POST /decisions`                                                                                                                  | `decisions`                                                                    |

Classify the request first with [step 2](../SKILL.md#step-2-which-modality-build-and-try-only); this
table only maps the result to an endpoint. The service type column is the `type` of the model in
`/v1/models` (and the `service_type` of its rows in `/v1/providers`). Paths are relative to the base
URL. Each model's `/v1/models` entry and its page have the fields and limits for that model; follow
them when they differ from the notes below.

**Text.**

- Stream (`stream: true`) for anything a person watches, such as a chat UI, and for long outputs.
- Use tool calling only on models whose catalog entry shows that capability.
- Use the Anthropic-compatible `POST /messages` only when the client or SDK speaks that format and
  the model's `supported_formats` includes `anthropic`. If the client appends `/v1/messages` itself,
  set its base URL to `https://router-api.0g.ai` (without `/v1`), so the path isn't doubled. The key
  can go in `x-api-key` (what Anthropic SDKs send) or in `Authorization: Bearer`. The model's page
  shows the exact request and headers.

**Image understanding.**

- Pick a model with the vision capability, and send the image as OpenAI-style image content next to
  the text question. Check the model's page for accepted formats and size limits.
- Images often contain personal or business data; check which trust modes the model offers.

**Image generation.**

1. Tell the user the number of images and the per-image price from the catalog, and wait for their
   OK (see [Cost](#setup)).
2. Choose the path by the model's `async_supported` field in `/v1/models` (or its page at
   `https://pc.0g.ai/models/<model-id>`). Send `model`, `prompt`, `n` and `size`;
   `image_capabilities` gives `max_n` and the supported sizes.
   - `true`: submit to `POST /async/images/generations`, then poll `GET /async/jobs/{id}` with the
     identifiers from the submit response. Wait as long as the `Retry-After` header says; if it is
     missing, wait 2 to 3 seconds between polls.
   - `false`: send the request to `POST /images/generations` and wait for the response. Generation
     can take tens of seconds, so set a long client timeout.
3. Save the result in the form the response gives: base64 in `data[].b64_json` (decode it), or a URL
   (download it). Save to a file path the user agreed on; don't paste base64 into the conversation.
4. For timeouts, follow [Retries and timeouts](#retries-and-timeouts): keep polling an async job;
   don't resend a synchronous call without asking.

**Image editing.**

1. Use only a `text-to-image` model whose `/v1/models` entry has `image_capabilities.references`. A
   model without that field takes text only. If no model has it, tell the user that editing isn't
   offered right now; don't generate a new image from scratch without saying so.
2. Tell the user the per-image price from the catalog, and wait for their OK.
3. Send `POST /images/generations` with `model` and the edit instruction as `prompt`, as usual. Put
   the source image in the field `references.fields` names (`image` or `images`), in a form
   `references.accepts` lists (`url` or `data_uri`). Convert a local file to a
   `data:image/...;base64,...` URI. For how many images and how large, see `references.max`,
   `image_capabilities.size` and the model's page at `https://pc.0g.ai/models/<model-id>`.
4. These models don't take async jobs. Handle a timeout as for any synchronous paid call (see
   [Retries and timeouts](#retries-and-timeouts)).
5. Save the result as in image generation (step 3 above).
6. The source image goes to the provider; check which trust modes the model offers before sending a
   private photo.

**Transcription.**

- Send the audio file to `POST /audio/transcriptions` as a multipart upload, with a speech-to-text
  model from the catalog. Use the optional `prompt` field for names and terms the model might
  mishear.
- Pricing is per second of audio. For a long recording or a batch of files, tell the user the total
  duration and the estimated cost first.
- Recordings can be sensitive; check which trust modes the model offers.

**Text-to-speech.**

1. Pick a `text-to-speech` model and read its `speech_capabilities` in `/v1/models`, or open its
   page at `https://pc.0g.ai/models/<model-id>`. They list the voices (`voice` takes a voice id),
   the output formats, the `speed` range, any extra controls such as `emotion`, `pitch` or `volume`,
   and how much text one request takes.
2. Pricing is per input character. Tell the user the character count and the estimated cost, and
   wait for their OK. If the text is longer than one request takes, split it into several requests
   and say so when you quote the cost.
3. Send JSON to `POST /audio/speech` with `model`, `input`, `voice` and optionally `response_format`
   and `speed`. The response is the audio file itself; write it to a file path the user agreed on.

**Video generation.**

1. Pick a `video-generation` model and read its `video_capabilities` in `/v1/models`, or open its
   page at `https://pc.0g.ai/models/<model-id>`. They list the duration range, the resolution tiers
   it is priced at, and the model's own options and reference inputs.
2. Video is the most expensive modality. Pricing can be per second of output or per vendor-reported
   tokens, and reference videos or extra reference images can change the rate. Tell the user the
   duration, resolution and estimated cost, and wait for their OK.
3. Submit once with `POST /videos`. `model`, `prompt` and `seconds` are required. The model's own
   options, such as `resolution`, go under `metadata`; reference media (a first frame for
   image-to-video, reference images, video or audio) go in `metadata.content`, in the form the
   model's page shows. The resolution tiers on the page are billing tiers, not a `size` to send.
4. Keep the `id` from the response exactly as returned. Poll `GET /videos/{id}` every 3 to 5 seconds
   until `status` is `completed`; generation takes minutes. A failed job still answers 200, with
   `status: "failed"`. The poll reports what was actually rendered; use it, not the submit response,
   when you report duration and resolution to the user.
5. Download with `GET /videos/{id}/content` and save the bytes to a file path the user agreed on.
   `409` means not ready yet and `429` means too many downloads at once (both: retry), `424` means
   the job failed and has no output. Download it once the job completes.
6. If your client times out, keep polling the same `id`; don't submit again. A `429` with
   `video_jobs_in_flight_limit` on submit means the account already has the maximum number of
   unfinished jobs; wait for earlier ones to finish.
7. Video models often run through official vendor APIs. Tell the user if Private isn't among the
   model's trust modes, and follow the Trust mode rule in [Setup](#setup).

**Video understanding.**

- Use a model whose catalog entry accepts video input, and follow its page for how to send the
  video. Check which trust modes it offers before sending private footage.

**Embeddings.**

1. Pick a `/v1/models` entry whose `type` is `embedding`. Its `supported_parameters` lists the
   optional fields it takes (`encoding_format`, and `dimensions` only where listed), and
   `context_length` is the most input one request takes. The vector size is on the model's page at
   `https://pc.0g.ai/models/<model-id>`.
2. Send JSON to `POST /embeddings` with `model` and `input`, adding `encoding_format` or
   `dimensions` only if the model lists them. The endpoint is compatible with the OpenAI Embeddings
   API, so the official OpenAI SDKs' embeddings call works once the base URL and key point at the
   Router.
3. Pricing is per input token. Before embedding a set of documents, tell the user the estimated
   token count and cost, and wait for their OK.
4. Use the same model, and the same `dimensions` if set, for indexing and for queries; vectors from
   different models or sizes can't be compared.
5. The text goes to the provider; check which trust modes the model offers before embedding private
   documents.

**Decisions.**

1. Pick a `/v1/models` entry whose `type` is `decisions`, and read its `description`: it says which
   question types the model answers, how much `state` it reads (`context_length`) and what happens
   to longer input. The request is on the model's page at `https://pc.0g.ai/models/<model-id>`.
2. Send JSON to `POST /decisions` with `model`, `state` (the text to judge) and `questions`, an
   object whose keys are your own names for each question. Each question has a `type` and
   `instructions`:
   - `choice`: `criteria` is an object of option → description; the answer names one option.
   - `score`: `criteria` is an array of levels, lowest first; the answer is the expected level, 0
     for the first.
   - `noul`: no `criteria`; the answer is the probability of yes, from 0 to 1.

   Use other types (`set`, `span`) only where the model's description lists them, and follow its
   page for their shape.

3. The answers come back under `answers.<question name>`, as `choice` (the option's key), `score` or
   `noul`. `score` is a fractional expected level (for example `1.78` on a 0–2 scale), not an index:
   round it only if the user wants one level. `choice` and `score` answers also carry
   `probabilities` per option or level; use them when the user wants a threshold.
4. The OpenAI SDKs have no decisions call, so a `client.chat.completions` call is wrong here: use
   `fetch` or `requests` with the key in `Authorization: Bearer`. The endpoint is synchronous; don't
   send `stream`.
5. Pricing is per input token. Before judging a batch, tell the user the estimated token count and
   cost, and wait for their OK.
6. The text goes to the provider; check which trust modes the model offers before sending private
   text.

## Build report

When you finish, summarize with this template in the user's language:

```
0G PC build summary
Model:       <model id> (from pc.0g.ai/models)
Modality:    <text | image understanding | image generation | image editing | transcription | text-to-speech | video generation | video understanding | embeddings | decisions>
Trust mode:  <header value, or key default>
Key:         read from <environment variable name> (value never shown)
Changed:     <files>
Test:        <request run with the user's OK | not run>
```

<!--
Maintainer notes (not instructions for the agent).

Sources, checked on 2026-10-31: image generation against
https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/image-generation
and the `async_supported` field in /v1/models; image editing against
`image_capabilities.references` in /v1/models and the model pages; transcription against
https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/audio; embeddings
against `supported_parameters` and `context_length` in /v1/models and the model pages, since
docs.0g.ai has no embeddings page; decisions against the model descriptions in /v1/models and the
model pages, since docs.0g.ai has no decisions page either; video generation and text-to-speech
against `video_capabilities` and `speech_capabilities` in /v1/models and the model pages.

Example model pages used when this was written (they may be removed; the live catalog is the
source of truth, so re-check before relying on them):
- https://pc.0g.ai/models/bytedance/seedream-5.0-lite
- https://pc.0g.ai/models/qwen3-embedding-8b
- https://pc.0g.ai/models/laya
- https://pc.0g.ai/models/bytedance/seedance-2.5
- https://pc.0g.ai/models/minimax-speech-2.8-turbo

Messages API (added 2026-11-11), checked with curl against https://router-api.0g.ai using an
invalid key, so no request was billed:
- POST /v1/messages reaches key validation with either `x-api-key` or `Authorization: Bearer`
  (both answer 401 invalid_api_key in Anthropic's error format).
- POST /messages (no /v1) and POST /v1/v1/messages both answer 404. The Anthropic SDK appends
  /v1/messages to its base URL, so the base URL must be https://router-api.0g.ai, without /v1.
  This last step is from how the SDK builds the path; it was not run with the SDK itself.
- The `supported_formats` check is not yet verified against a published docs page; confirm before
  release.

Error handling and rate-limit rules follow
https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/errors and
https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/rate-limits.
-->
