# 🏺 Code Archaeologist

> Point at any line of code in your editor and get a one-line answer to
> **"why is this here?"** — backed by commits, pull requests, and issues.

`git blame` answers *who*. PR pages answer *what*. Nothing answers
*why* without four to six manual hops between editor, terminal, and
browser. **Code Archaeologist compresses that into one keystroke.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)

---

## Features

- **One-shot investigation** — select code, press `Cmd/Ctrl+Shift+Y`,
  get a streaming side panel.
- **Three-layer answer** — a one-sentence verdict on top, the most
  relevant PR/commit evidence under it, and the full timeline tucked
  into a collapsed section.
- **Single-batch GraphQL** PR fetch — one network round-trip for up to
  30 commits at a time.
- **Persistent cache** at `~/.git-archaeology/cache/` with a 7-day TTL.
  Warm runs typically complete in ≈ 1 second.
- **Noise filter** — merge / dependabot / format-only / rename-only
  commits are dimmed, never silently dropped.
- **Copy as PR comment** — turn any investigation into a Markdown
  snippet ready to paste into a code review.

> The Answer is generated deterministically from the most recent
> significant commit and its PR (confidence 2–3 / 5). **An LLM is
> intentionally not required.** A future enhancement (see
> [roadmap](./ROADMAP.md)) will use the **GitHub Copilot Language Model
> API** to upgrade the Answer when Copilot is available — and silently
> fall back to the deterministic answer when it isn't. No third-party
> API key, ever.

---

## Install

This extension isn't on the Marketplace yet. You can install it from a
locally-built `.vsix` package today:

### Option 1 — download a pre-built `.vsix` (recommended)

Grab the latest `.vsix` from the [Releases](https://github.com/frankliu20/code-archaeology/releases)
page on GitHub, then install it with one of:

```sh
# from the command line
code --install-extension code-archaeology-<version>.vsix
```

…or in VS Code: open the **Extensions** view → click the **⋯** menu in
the top-right → **Install from VSIX…** → pick the file.

### Option 2 — build it yourself

Requires Node.js ≥ 18.

```sh
git clone https://github.com/frankliu20/code-archaeology.git
cd code-archaeology
npm install
npm run package      # produces code-archaeology-<version>.vsix
code --install-extension code-archaeology-*.vsix
```

> `npm run package` shells out to [`@vscode/vsce`](https://github.com/microsoft/vscode-vsce)
> via `npx`, so no global install is needed.

After installing, reload VS Code if it doesn't pick the extension up
automatically. The first run will offer to authenticate `gh` if you
haven't already.

---

## Requirements

- **VS Code** ≥ 1.85
- **git** ≥ 2.30 on `PATH`
- **[`gh`](https://cli.github.com/)** authenticated (`gh auth login`) —
  optional but strongly recommended; without it the panel still shows
  commits but no PR enrichment.

---

## Usage

1. Open any git-tracked file.
2. Select the lines you're curious about (or just place the cursor on a
   single line).
3. Trigger the investigation:
   - **Keybinding** — `Ctrl+Shift+Y` (Windows / Linux),
     `Cmd+Shift+Y` (macOS).
   - **Editor right-click** → **🏺 Why is this here?**
   - **Command Palette** → **Archaeology: 🏺 Why is this here?**
4. The side panel opens and starts streaming. The first answer typically
   appears within 2–3 seconds on a cold run, ≈ 1 second on a warm run.

### Acting on the result

- Click any **PR / commit link** to open it in the browser.
- Hit **📋 Copy as PR comment** to grab a Markdown snippet you can
  paste into a code review.
- Hit **👎 This explanation is wrong** to flag inaccurate output (used
  later for prompt tuning once LLM answers land — see roadmap).

---

## How it works

```
selection
   │
   ▼
git log -L <start>,<end>:<file>      # line-range history
   │
   ▼
noise filter (merge / bot / format)  # dim, don't drop
   │
   ▼
PR cache lookup                      # ~/.git-archaeology/cache/
   │       │
   │       └─► cache miss ──► single GraphQL request
   │                          (aliased object(oid:) per commit)
   │
   ▼
async event stream → side panel
  ├── progress         (status line)
  ├── commits-found    (counts in the timeline header)
  ├── commit-enriched  (Evidence + Timeline rows)
  ├── answer           (Layer 1, fires after first enrichment)
  └── done
```

The pipeline is an `AsyncGenerator<AnalysisEvent>` so the panel can
render progressively instead of waiting for the full analysis to
complete.

---

## Develop

```sh
npm install
npm run compile
```

Then open this folder in VS Code and press **F5** ("Run Extension").
A second VS Code window opens — the **Extension Development Host** —
in which the extension is installed for testing.

### Headless smoke test

```sh
npm run compile
node out/smoke.js <path/to/file> <startLine> <endLine>
```

Useful for verifying the core pipeline without launching VS Code.

### Project layout

```
code-archaeology/
├── src/
│   ├── extension.ts          # VS Code entry point
│   ├── smoke.ts              # CLI smoke test (not shipped)
│   ├── core/                 # framework-agnostic logic
│   │   ├── types.ts          # CommitInfo / PRInfo / AnalysisEvent
│   │   ├── history.ts        # git log -L parsing
│   │   ├── enrich.ts         # batch GraphQL PR fetch
│   │   ├── cache.ts          # ~/.git-archaeology cache
│   │   ├── filter.ts         # noise classification
│   │   └── pipeline.ts       # streaming orchestrator
│   └── webview/
│       ├── panel.ts          # webview lifecycle
│       └── ui.ts             # CSP-safe HTML+JS (no framework)
├── ROADMAP.md
├── CHANGELOG.md
└── LICENSE
```

---

## Privacy

- All git operations run locally.
- PR data is fetched through your local `gh` CLI using your existing
  GitHub auth — credentials never leave that channel.
- Cache files live under `~/.git-archaeology/` and contain only
  metadata GitHub already returned to you (PR title, body, author,
  labels). Delete the directory at any time to wipe state.
- No telemetry. No outbound calls beyond `git` and `gh`.
- **No third-party LLM, no API key.** When the optional Copilot answer
  upgrade lands (see [roadmap](./ROADMAP.md)), it will go through the
  built-in VS Code Language Model API — i.e. the same trust boundary
  you already accepted by installing GitHub Copilot. If you don't have
  Copilot, nothing changes.

---

## Roadmap

The next milestones are tracked in [`ROADMAP.md`](./ROADMAP.md).
Highlights:

- **M1** — Optional Copilot-powered Answer upgrade (via the VS Code
  Language Model API). Falls back silently when Copilot isn't
  available.
- **M2** — Standalone `git-archaeology` CLI for PR review bots.
- **M3** — Codelens, hover, overdue-TODO detection.
- **M4** — Share links, GitLab/Bitbucket, JetBrains.

---

## License

[MIT](./LICENSE) © 2026 Frank Liu
