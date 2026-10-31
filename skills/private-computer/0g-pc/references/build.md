# 0G PC: Build flow

Part of the 0g-pc skill. Read [SKILL.md](../SKILL.md) first: its ground rules apply here, and it
decides whether this is the right flow. This flow covers application code that calls 0G models
through the Router.

## Setup

- **Key:** the user creates it at https://pc.0g.ai/dashboard/api-keys and sets it as an environment
  variable themselves. Your code reads the variable; you never see the value. Make sure `.env` files
  are in `.gitignore`.
- **Endpoint:** base URL `https://router-api.0g.ai/v1`, auth `Authorization: Bearer <key>`. If the
  client appends `/v1` itself, don't add it twice. The official OpenAI SDKs work once the base URL
  and key point at the Router.
- **Model:** list the candidates for the modality as in
  [List available models](../SKILL.md#list-available-models) and confirm one with the user (they can
  compare candidates first in the Playground page for that modality), then open its page at
  `https://pc.0g.ai/api-reference/<model-id>` for the exact endpoint, fields and code. Don't write
  endpoints or model ids from memory.
- **Trust mode:** send `X-0G-Provider-Trust-Mode: verified` or `private`, or rely on the key's
  default. Recommend `private` for sensitive data when the model supports it.
- **Provider (optional):** to pin one, list them with `/v1/providers?model=<model-id>` and send
  `X-0G-Provider-Address: <address>`. Billing still comes from the Router balance.
- **First request:** a real request costs money. Ask before running one, then point the user to
  usage at https://pc.0g.ai/dashboard/overview.

## Endpoints by modality

| The user wants                                  | Modality            | Endpoint                                                      | Catalog service type                       |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------- | ------------------------------------------ |
| Chat, code, reasoning, tool calls               | Text                | `POST /chat/completions`                                      | `chatbot`                                  |
| Read a screenshot, photo, chart or scanned page | Image understanding | `POST /chat/completions` with image content                   | `chatbot` (model with the vision flag)     |
| Create an image from a description              | Image generation    | `POST /async/images/generations`, then `GET /async/jobs/{id}` | `text-to-image`                            |
| Turn speech into text                           | Transcription       | `POST /audio/transcriptions`                                  | `speech-to-text`                           |
| Create a video from text or images              | Video generation    | Async; see the model's API reference page                     | `video-generation`                         |
| Ask questions about a video                     | Video understanding | See the model's API reference page                            | `chatbot` (model that accepts video input) |

Classify the request first with [step 2](../SKILL.md#step-2-which-modality-build-and-try-only); this
table only maps the result to an endpoint. The service type column is the value for
`/v1/providers?service_type=` when you list models.

**Text.**

- Stream (`stream: true`) for anything a person watches, such as a chat UI.
- Use tool calling only on models whose catalog entry shows that capability.

**Image understanding.**

- Pick a model with the vision capability, and send the image as OpenAI-style image content next to
  the text question. Check the model's API reference page for accepted formats and size limits.
- Images often contain personal or business data; check which trust modes the model offers.

**Image generation.**

1. Tell the user the number of images and the per-image price from the catalog, and wait for their
   OK.
2. Use the async path: submit to `POST /async/images/generations` with `model`, `prompt`, `n` and
   `size` (check the model for supported sizes). The synchronous `POST /images/generations` can time
   out; use it only for quick local scripts.
3. Poll `GET /async/jobs/{id}` with the identifiers from the submit response. Wait as long as the
   `Retry-After` header says; if it is missing, wait 2 to 3 seconds between polls.
4. Results come back as base64 in `data[].b64_json`. Decode them and save to a file path the user
   agreed on; don't paste base64 into the conversation.
5. Billing follows the provider's execution, not your connection. If your client times out, keep
   polling the same job; don't submit again.

**Transcription.**

- Send the audio file to `POST /audio/transcriptions` as a multipart upload, with a speech-to-text
  model from the catalog. Use the optional `prompt` field for names and terms the model might
  mishear.
- Recordings can be sensitive; check which trust modes the model offers.

**Video generation.**

1. Pick a video model in the catalog and open its API reference page for the endpoint and fields.
   Don't guess the path from other providers' APIs.
2. Video is the most expensive modality. Pricing can be per second of output or per vendor-reported
   tokens, and reference videos or extra reference images can change the rate. Tell the user the
   duration, resolution and estimated cost, and wait for their OK.
3. Jobs are async: submit once, then poll as the model's page describes. If your client times out,
   keep polling the same job.
4. Save the result to a file path the user agreed on. If the result is a link, download it promptly,
   since it may expire.
5. Video models often run through official vendor APIs. Tell the user if Private isn't among the
   model's trust modes.

**Video understanding.**

- Use a model whose catalog entry accepts video input, and follow its API reference page for how to
  send the video. Check which trust modes it offers before sending private footage.

## Build report

When you finish, summarize with this template in the user's language:

```
0G PC build summary
Model:       <model id> (from pc.0g.ai/models)
Modality:    <text | image understanding | image generation | transcription | video generation | video understanding>
Trust mode:  <header value, or key default>
Key:         read from <environment variable name> (value never shown)
Changed:     <files>
Test:        <request run with the user's OK | not run>
```
