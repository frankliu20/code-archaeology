# 🏺 Code Archaeologist

> **Point at any code. Get a one-line answer to "why is this here?"**

`git blame` tells you *who*. PR pages tell you *what*. Nothing tells you *why* — until now.

**One keystroke. Full story. No AI key required.**

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/frankliu20.code-archaeology?label=Marketplace&color=blue)](https://marketplace.visualstudio.com/items?itemName=frankliu20.code-archaeology)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/frankliu20.code-archaeology?label=Installs&color=green)](https://marketplace.visualstudio.com/items?itemName=frankliu20.code-archaeology)
[![CI](https://github.com/frankliu20/code-archaeology/actions/workflows/ci.yml/badge.svg)](https://github.com/frankliu20/code-archaeology/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

---

## How It Works

1. Select any code (or just place your cursor on a line)
2. Press `Ctrl+Shift+Y` (`Cmd+Shift+Y` on Mac) — or right-click → **🏺 Why is this here?**
3. A side panel streams the answer: verdict → evidence → full timeline

That's it. Cold run ~2s, warm run ~1s.

## Features

🔍 **Three-layer answer** — One-sentence verdict on top, relevant PR/commit evidence below, full timeline in a collapsible section

⚡ **Fast** — Single-batch GraphQL PR fetch, persistent 7-day cache at `~/.git-archaeology/cache/`

🧹 **Noise filter** — Merge, dependabot, format-only commits are dimmed, never dropped

📋 **Copy as PR comment** — Turn any investigation into a Markdown snippet for code reviews

🔒 **Privacy-first** — All git ops run locally. PR data fetched via your own `gh` CLI. No telemetry. No third-party API keys. Ever.

## Requirements

- **VS Code** ≥ 1.85
- **git** on PATH
- **[`gh` CLI](https://cli.github.com/)** authenticated — optional, but needed for PR enrichment

## Roadmap

See [`ROADMAP.md`](./ROADMAP.md) — next up: Copilot-powered answer upgrade, standalone CLI, CodeLens integration.

## License

[MIT](./LICENSE) © 2026 Frank Liu
