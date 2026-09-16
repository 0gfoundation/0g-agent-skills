# 0G AI Image Gallery

Generate images with AI on 0G Compute and store them on 0G decentralized storage.

> **Network note:** at last verification the `text-to-image` service type existed on **0G mainnet
> only** — testnet carried no image provider. `.env.example` therefore defaults to mainnet. Run
> `npm run discover` first; if it reports zero providers, you are pointed at a network that has
> none. Mainnet inference spends real 0G, so start with a single small image.

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your private key (fund via https://faucet.0g.ai)
```

You'll also need a funded compute provider. See the [ai-chatbot example](../ai-chatbot/) for discovering providers and setting up accounts.

## Usage

### Discover text-to-image providers

```bash
npx tsx src/discover.ts
```

### Generate an image (local only)

```bash
npx tsx src/generate.ts <provider-address> "A futuristic city at sunset"
# Saves image to ./output/
```

### Generate and store on 0G

Full pipeline: generate image with AI, then upload to 0G Storage.

```bash
npx tsx src/generate-and-store.ts <provider-address> "A futuristic city at sunset"
# Output: Root hash: 0x1234...
```

## How It Works

```
┌───────────────┐     ┌───────────────┐
│  0G Compute   │────>│  0G Storage   │
│               │     │               │
│  image model  │     │  Root Hash    │
│  (image gen)  │     │  (permanent)  │
└───────────────┘     └───────────────┘
    Generate              Persist
```

1. **Discover** — Find text-to-image providers on the 0G network.
2. **Generate** — Send a prompt to the discovered image provider, get back an image.
3. **Store** — Upload the generated image to 0G Storage for permanent, decentralized hosting.

## Key Concepts

- **Body-signed headers**: Image requests require `getRequestHeaders(providerAddress, JSON.stringify(body))` — the body must be included for request signing.
- **ChatID from header only**: For images, extract ChatID from `ZG-Res-Key` header only (no body fallback).
- **processResponse()**: Must be called after every generation. For images, no usage data is needed.
