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
  and key point at the Router.
- **Model:** list the candidates for the modality as in
  [List available models](../SKILL.md#list-available-models) and confirm one with the user (they can
  compare candidates first in the Playground page for that modality), then open its page at
  `https://pc.0g.ai/models/<model-id>` for the exact endpoint, fields and code. Don't write
  endpoints or model ids from memory.
- **Trust mode:** send `X-0G-Provider-Trust-Mode: verified` or `private`, or rely on the key's
  default. Recommend `private` for sensitive data when the model supports it.
- **Provider (optional):** to pin one, list them with `/v1/providers?model=<model-id>` and send
  `X-0G-Provider-Address: <address>`. Billing still comes from the Router balance.
- **First request:** a real request costs money. Ask before running one, then point the user to
  usage at https://pc.0g.ai/dashboard/overview.

## Endpoints by modality

| The user wants                                  | Modality            | Endpoint                                                                 | Catalog service type                                      |
| ----------------------------------------------- | ------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| Chat, code, reasoning, tool calls               | Text                | `POST /chat/completions`                                                 | `chatbot`                                                 |
| Read a screenshot, photo, chart or scanned page | Image understanding | `POST /chat/completions` with image content                              | `chatbot` (model with the vision flag)                    |
| Create an image from a description              | Image generation    | `POST /async/images/generations`, then `GET /async/jobs/{id}`            | `text-to-image`                                           |
| Change an existing image                        | Image editing       | Same as image generation, with the source image as a reference image     | `text-to-image` (model whose page lists reference images) |
| Turn speech into text                           | Transcription       | `POST /audio/transcriptions`                                             | `speech-to-text`                                          |
| Read text aloud                                 | Text-to-speech      | `POST /audio/speech`                                                     | `text-to-speech`                                          |
| Create a video from text or images              | Video generation    | `POST /videos`, then `GET /videos/{id}`, then `GET /videos/{id}/content` | `video-generation`                                        |
| Ask questions about a video                     | Video understanding | See the model's page                                                     | `chatbot` (model that accepts video input)                |

Classify the request first with [step 2](../SKILL.md#step-2-which-modality-build-and-try-only); this
table only maps the result to an endpoint. The service type column is the value for
`/v1/providers?service_type=` when you list models. Paths are relative to the base URL. Sources,
checked on 2026-10-31: image generation and editing against
[Image Generation](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/image-generation),
transcription against
[Audio Transcription](https://docs.0g.ai/developer-hub/building-on-0g/compute-network/router/features/audio),
and video generation and text-to-speech against the model pages on pc.0g.ai (for example
https://pc.0g.ai/models/bytedance/seedance-2.5 and
https://pc.0g.ai/models/minimax-speech-2.8-turbo). Each model's page has the fields and limits for
that model; follow it when it differs from the notes below.

**Text.**

- Stream (`stream: true`) for anything a person watches, such as a chat UI.
- Use tool calling only on models whose catalog entry shows that capability.

**Image understanding.**

- Pick a model with the vision capability, and send the image as OpenAI-style image content next to
  the text question. Check the model's page for accepted formats and size limits.
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

**Image editing.**

1. Pick a `text-to-image` model whose page on pc.0g.ai says it takes reference images; the page
   names the field (such as `image`), how many images it takes and in what form (a publicly
   reachable URL or a `data:image/...` URI). If no model takes reference images, tell the user that
   editing isn't offered right now; don't generate a new image from scratch without saying so.
2. Send the request as in image generation, with `model`, the edit instruction as `prompt`, and the
   source image in the field the model's page names. Cost confirmation, polling and saving the
   result work the same way.
3. The source image goes to the provider; check which trust modes the model offers before sending a
   private photo.

**Transcription.**

- Send the audio file to `POST /audio/transcriptions` as a multipart upload, with a speech-to-text
  model from the catalog. Use the optional `prompt` field for names and terms the model might
  mishear.
- Recordings can be sensitive; check which trust modes the model offers.

**Text-to-speech.**

1. Pick a `text-to-speech` model and open its page on pc.0g.ai. It lists the voices (`voice` takes a
   voice id), the output formats, the `speed` range, any extra controls such as `emotion`, `pitch`
   or `volume`, and how much text one request takes.
2. Pricing is per input character. Tell the user the character count and the estimated cost, and
   wait for their OK. If the text is longer than one request takes, split it into several requests
   and say so when you quote the cost.
3. Send JSON to `POST /audio/speech` with `model`, `input`, `voice` and optionally `response_format`
   and `speed`. The response is the audio file itself; write it to a file path the user agreed on.

**Video generation.**

1. Pick a `video-generation` model and open its page on pc.0g.ai. It lists the duration range, the
   resolution tiers it is priced at, and the model's own options and reference inputs.
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
   the job failed and has no output. Download promptly, since the file may not be kept for long.
6. If your client times out, keep polling the same `id`; don't submit again. A `429` with
   `video_jobs_in_flight_limit` on submit means the account already has the maximum number of
   unfinished jobs; wait for earlier ones to finish.
7. Video models often run through official vendor APIs. Tell the user if Private isn't among the
   model's trust modes.

**Video understanding.**

- Use a model whose catalog entry accepts video input, and follow its page for how to send the
  video. Check which trust modes it offers before sending private footage.

## Build report

When you finish, summarize with this template in the user's language:

```
0G PC build summary
Model:       <model id> (from pc.0g.ai/models)
Modality:    <text | image understanding | image generation | image editing | transcription | text-to-speech | video generation | video understanding>
Trust mode:  <header value, or key default>
Key:         read from <environment variable name> (value never shown)
Changed:     <files>
Test:        <request run with the user's OK | not run>
```
