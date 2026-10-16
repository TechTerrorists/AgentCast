<p align="center">
  <img src="assets/brand/banner.svg" alt="AgentCast: paste a URL, get a polished launch video of your real product" width="100%">
</p>

<p align="center">
  <b>The future of SaaS videos and explainers.</b><br>
  An autonomous agent uses your product on the live web, records the best flows,<br>
  and edits them into a finished video. No screen recorder. No manual editing.
</p>

<p align="center">
  <img alt="Status: hackathon build" src="https://img.shields.io/badge/status-hackathon%20build-8B5CF6">
  <img alt="Built with TinyFish" src="https://img.shields.io/badge/web%20agents-TinyFish-2563EB">
  <img alt="Directed by Claude Code" src="https://img.shields.io/badge/director-Claude%20Code-7C3AED">
  <img alt="Rendered with Remotion" src="https://img.shields.io/badge/render-Remotion-F59E0B">
  <img alt="Node 22+" src="https://img.shields.io/badge/node-22%2B-22C55E">
</p>

---

## Why

Every product needs a demo video for launches, landing pages, investor pitches, app stores, onboarding and hackathon submissions. Making one is slow, and it goes out of date the moment the UI changes:

- **Recording is manual.** You set up test accounts, script the flow and retake every misclick.
- **Editing is manual.** Zooms, cursor smoothing, captions, voiceover and music all get added by hand.
- **Every variant is extra work.** 16:9 vs 9:16, desktop vs mobile, English vs Hindi each mean another recording or edit.
- **Videos go stale.** Every UI change makes the demo outdated, so most teams ship old demos or none at all.

AI video generators can't help, because they generate footage instead of showing your real product. AgentCast uses the real product.

## How it works

```mermaid
flowchart LR
  URL([Your URL]) --> E["<b>Explore</b><br/>TinyFish agents find<br/>the flows worth showing"]
  E --> G1{{"You review<br/>the flows"}}
  G1 --> R["<b>Record</b><br/>Deterministic replay in<br/>TinyFish cloud browsers"]
  R --> S["<b>Script + voice</b><br/>Narration per language,<br/>ElevenLabs TTS"]
  S --> D["<b>Direct</b><br/>Claude Code writes<br/>the edit"]
  D --> V["<b>Render</b><br/>Remotion: every format<br/>and language in parallel"]
  V --> OUT([MP4s + captions])
```

1. **Explore.** TinyFish web agents open your product, sign in, work through onboarding and try candidate flows in parallel. Each flow is scored on how clearly it shows your product's value, and the best 3–4 are ordered into a story.
2. **Record.** A Playwright script replays the approved flows in TinyFish cloud browsers while capturing the screen over CDP. It only clicks an element when exactly one match exists, checks that each step did what it should, and throws away any take that goes wrong. The exploring agent's hesitation never reaches the footage.
3. **Script and voice.** Narration is written per segment, natively in each language, and voiced with ElevenLabs using word-level timestamps.
4. **Direct.** Claude Code, running headless in a sandbox, writes the edit: smart zoom on every click, a smooth cursor, captions, music ducked under the voice, and a branded intro and outro.
5. **Render.** Remotion renders every variant in parallel. Each language is retimed to fit its own voiceover, so the product is recorded once and narrated many times.

When your UI changes, `rerun` reuses the approved flows, repairs broken element lookups, and regenerates the video in minutes. It can run from CI.

## Features

| | |
|---|---|
| 🔗 **URL in, video out** | No setup beyond a link and an optional one-time sign-in |
| 🎬 **Real footage only** | Every product pixel comes from a real browser session. Overlays annotate, they never fabricate. |
| 🧭 **Finds the flows itself** | Parallel agents propose and test flows, and a scoring rubric picks the ones that show value |
| 🎯 **Clean takes** | Semantic element targets, outcome checks and automatic retakes mean no misclicks on camera |
| 🌐 **Variants from one run** | 16:9 and 9:16, desktop and mobile, English and Hindi |
| 🙋 **Human in the loop** | Review the flows, the script and a preview you can revise with a prompt. Autopilot skips all three. |
| 🔁 **Re-run on update** | Cached flows and self-healing locators regenerate the video after a UI change |
| 🔐 **Secrets stay secret** | Credentials go from TinyFish Vault or your own sign-in straight to the browser, never into a prompt |
| 🧩 **Bring your own coding agent** | No LLM API key needed. Uses your logged-in Claude Code (default), with opencode and Codex planned. |

## Use cases

- **Product launches:** a polished demo for Product Hunt, X and your landing page, from just a URL.
- **Always-current demos:** re-render on every release so the website never shows an outdated UI.
- **Help-center tutorials:** "How to do X" videos per feature, refreshed when the UI changes.
- **Multilingual marketing:** the same tour in English and Hindi, for YouTube and for Reels/Shorts.
- **Sales and investor demos:** walkthroughs focused on what a specific prospect cares about.
- **Hackathon submissions:** cut demo-video time from hours to minutes.
- **Public-service walkthroughs:** step-by-step Hindi tutorials for confusing public portals.

## Status

AgentCast is being built for **AzinHacks 2026** (USAR, GGSIPU) in the TinyFish-sponsored track. The pipeline above is the design. Here's what exists today:

- [x] Product requirements and phased implementation plan
- [x] Monorepo scaffold (pnpm, TypeScript strict, Vitest)
- [x] `packages/shared`: zod schemas for every pipeline artifact
- [x] `packages/llm`: LLM runner with the Claude Code backend
- [x] `agentcast doctor`: environment and LLM-login checks
- [ ] Spikes: CDP recording from TinyFish browsers, agent step quality, sign-in once, Remotion, Hindi TTS
- [ ] Worker and orchestrator with a live-progress UI
- [ ] Explore, record, script, voice, direct, render
- [ ] Variant fan-out, re-run on update, CLI and GitHub Action

## Getting started

**You need:**
- Node.js 22+ and pnpm
- ffmpeg
- A logged-in coding-agent CLI. [Claude Code](https://docs.claude.com/en/docs/claude-code) is the default. **No Anthropic API key is required.**
- A [TinyFish](https://tinyfish.ai) API key and an [ElevenLabs](https://elevenlabs.io) API key (the current scaffold runs without them)

```bash
git clone <this repo> agentcast && cd agentcast
pnpm install
cp .env.example .env              # add TINYFISH_API_KEY and ELEVENLABS_API_KEY
pnpm agentcast doctor --probe     # checks tools and keys, and makes one tiny call through your coding agent
```

`doctor` shows which coding agent each tier will use:

```
✓ LLM: claude-code       2.1.302 (Claude Code)
✓ LLM smart tier         → claude-code
✓ LLM fast tier          → claude-code
✓ LLM probe (fast tier)  ok=true in 3.3s
```

### Development

```bash
pnpm typecheck    # tsc in every package
pnpm test         # vitest; LLM adapter tests use a fake CLI and spend no quota
```

## Project layout

```
packages/
  shared/    zod schemas: flows, replay plan, timeline, script, edit plan (EDL), jobs, events
  llm/       backend-agnostic LLM runner (claude-code today; opencode, codex, API planned)
  cli/       `agentcast` command (doctor today; run / rerun planned)
assets/brand/  logo and banner
```

Planned: `apps/web` (Next.js UI), `apps/worker` (orchestrator), `apps/demoboard` (demo target app), and `packages/tinyfish`, `recorder`, `director`, `voice`, `video`.

## Documentation

| Doc | What's in it |
|---|---|
| [PRD.md](PRD.md) | Problem, requirements, architecture, TinyFish integration, data contracts, risks |
| [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) | Phases, spikes, schedule, cut-line, testing strategy |
| [AGENTS.md](AGENTS.md) | Instructions for coding agents working on this repo (Claude Code reads it via `CLAUDE.md`) |

## Built with

- [**TinyFish**](https://tinyfish.ai): Agent, Browser, Fetch, Vault and Browser Context Profiles. The camera crew.
- [**Claude Code**](https://docs.claude.com/en/docs/claude-code): headless and sandboxed. The director.
- [**Remotion**](https://www.remotion.dev): the editing suite.
- [**ElevenLabs**](https://elevenlabs.io): multilingual voiceover.
- [**Playwright**](https://playwright.dev): deterministic replay over CDP.

<br>
<p align="center">
  <img src="assets/brand/logo.svg" alt="AgentCast logo" width="56"><br>
</p>
