# 🏺 Code Archaeologist

> Point at any code, get a one-line answer to **"why is this here?"** —
> backed by commits, PRs, and issues.

Status: **M0 PoC** (per [PRD v0.3](../prd/code-archaeologist.md)).
This release wires up the editor → side-panel UX with streaming git +
GitHub PR data. **No LLM yet** — the "answer" is a deterministic synthesis
of the most recent significant commit + its PR, marked with low confidence
(2–3 / 5). LLM-generated answers are M1.

---

## What works today (M0)

- VS Code command **🏺 Why is this here?** (`Cmd/Ctrl+Shift+Y` or right-click)
- Streaming side panel with the three-layer structure from the PRD:
  - **💡 Answer** (tentative, rule-based)
  - **📎 Key Evidence** (top 3 commits with PR title + body excerpt)
  - **▾ Full Timeline** (collapsed, with noise commits dimmed)
- Live progress reporting (status line at the bottom)
- Noise filter: merge / dependabot / format-only / rename-only commits
- PR enrichment via the local `gh` CLI (uses your existing auth)
- **Single-batch GraphQL PR fetch** (one network round-trip for ≤30 commits)
- **Persistent cache** at `~/.git-archaeology/cache/<owner>__<repo>.json`
  with 7-day TTL — warm runs hit ~1s end-to-end
- **Copy as PR comment** button — generates a Markdown snippet for sharing
- Cross-file rename tracking comes via `git log --follow` (M1)

## What's intentionally missing (will come in M1+)

- LLM-generated answers with source spans
- Confidence ≥ 4 / 5
- Codelens "🏺 Why?" auto-prompt
- Hover tooltip
- Standalone CLI (`git-archaeology`)
- Overdue-TODO detection

---

## Try it

### Prerequisites
- Node.js ≥ 18
- `git` ≥ 2.30 (on PATH)
- [`gh`](https://cli.github.com/) authenticated (`gh auth login`) — *optional but recommended*

### Run from source

```powershell
cd code-archaeology
npm install
npm run compile
```

Then in VS Code:
1. Open this folder.
2. Press `F5` ("Run Extension"). A second VS Code window opens — the
   **Extension Development Host**.
3. In that window, open any **git-tracked file** in any repo.
4. Select a few lines.
5. Press `Cmd+Shift+Y` (`Ctrl+Shift+Y` on Windows / Linux), or right-click →
   **🏺 Why is this here?**
6. The side panel opens and starts streaming.

### Smoke test (no VS Code)

```powershell
npm run compile
node out/smoke.js <path/to/file> <startLine> <endLine>
```

Example:

```powershell
node out/smoke.js src/core/pipeline.ts 1 30
```

---

## Project layout

```
code-archaeology/
├── package.json              # extension manifest
├── tsconfig.json
├── src/
│   ├── extension.ts          # VS Code entry point
│   ├── smoke.ts              # CLI smoke test (not shipped)
│   ├── core/                 # framework-agnostic logic
│   │   ├── types.ts          # CommitInfo / PRInfo / AnalysisEvent
│   │   ├── history.ts        # `git log -L` + parsing
│   │   ├── enrich.ts         # batch GraphQL PR fetch
│   │   ├── cache.ts          # ~/.git-archaeology/cache JSON store
│   │   ├── filter.ts         # noise classification
│   │   └── pipeline.ts       # async generator orchestrating the above
│   └── webview/
│       ├── panel.ts          # webview lifecycle
│       └── ui.ts             # vanilla HTML+JS (CSP-safe, no framework)
└── .vscode/
    ├── launch.json           # F5 = Run Extension
    └── tasks.json            # `npm: compile`
```

### Streaming protocol

The core pipeline is an `AsyncGenerator<AnalysisEvent>`. Events the UI consumes:

| Event | When | UI effect |
|---|---|---|
| `progress` | Whenever a step starts | Status line at the bottom |
| `commits-found` | After `git log -L` finishes | Timeline header count |
| `commit-enriched` | After each PR fetch | Append to Evidence + Timeline |
| `answer` | After first significant commit is enriched | Fill Layer 1 |
| `done` | All commits enriched | Final counts; appends noise rows |
| `error` | Any fatal failure | Red status line |

This is what gives the panel its **"answer ≤ 5s"** behavior even though the
full enrichment takes longer — the answer fires off the first enriched commit
while the rest stream in behind it.

---

## Known issues / rough edges (M0)

- Noise filter is subject-string heuristics; full-diff whitespace detection
  is M1.
- "Copy as PR comment" relies on `navigator.clipboard` inside the webview —
  may require a click in some VS Code builds.
- The "answer" wording is intentionally cautious ("Most recently changed by…")
  because there is no LLM yet. Don't trust it as a real *why*.

---

## Why this exists

See [`../prd/code-archaeologist.md`](../prd/code-archaeologist.md) for the
full PRD. Short version:

> `git blame` answers **who**. PR pages answer **what**. Nothing answers
> **why** without 4–6 manual hops. We compress that into one keystroke.
