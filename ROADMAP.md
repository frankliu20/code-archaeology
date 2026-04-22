# Roadmap

This file tracks work that is planned but not yet implemented. The shipped
behavior lives in [`README.md`](./README.md); the original problem framing
lives in [`../prd/code-archaeologist.md`](../prd/code-archaeologist.md).

Milestones are ordered, but not time-boxed. Items inside a milestone are
roughly priority-ordered.

---

## M1 — Optional Copilot-powered answers

The shipped product already gives a usable answer (the most recent
significant commit + its PR body). M1 is a **quality upgrade, not a
prerequisite for being useful** — users without Copilot will keep the
deterministic experience.

We will integrate the **[VS Code Language Model API](https://code.visualstudio.com/api/extension-guides/language-model)**
(Microsoft's first-party LLM access via the GitHub Copilot subscription)
rather than ship our own provider. Reasons: zero API-key management for
users, zero new accounts to trust, and no extra cost for anyone already
on Copilot.

- [ ] Detect Copilot via `vscode.lm.selectChatModels()`. If unavailable,
      fall back silently to the rule-based answer (no scary modal).
- [ ] Streaming response so the Answer event still fires before full
      enrichment completes.
- [ ] Prompt design that **forces source spans**: every claim in the
      Answer must reference a commit SHA / PR number / Issue number that
      the UI can highlight in the Evidence layer.
- [ ] Confidence self-rating on the 5-dot scale (currently capped at 3).
- [ ] Per-claim "👎 wrong" feedback writes a JSONL log under
      `~/.git-archaeology/feedback.jsonl` for later prompt tuning.
- [ ] Cross-file rename tracking via `git log --follow` so renames don't
      appear as "first appearance" of the symbol.
- [ ] Bump `engines.vscode` to the version that ships the LM API (≥ 1.90)
      and add a `requires Copilot` note in the Marketplace description.

---

## M2 — Standalone CLI for automation

Same core, different shell. Targeted at PR review bots and CI pipelines.

- [ ] `git-archaeology` npm package with three input modes:
      `--file <p> --lines <a>-<b>`, `--pr <n>`, `<symbol>`.
- [ ] `--output github-comment` format — Markdown ready to paste into a
      PR review comment.
- [ ] `--offline` flag mirroring private mode in the extension.
- [ ] Sample GitHub Action that runs the CLI on every PR and posts the
      result as a review comment on changed "old" code.

---

## M3 — Polish & ambient UX

Make the extension feel native, not just bolt-on.

- [ ] **Codelens** "🏺 Why?" on function definitions and on lines that
      have been changed > N times in the last M months ("hot spots").
- [ ] **Hover tooltip** with a one-line summary, similar to GitLens.
- [ ] **Overdue-TODO detection**: scan PR bodies / Issue links for
      "remove after <date>" / "sunset YYYY-MM-DD" markers and flag the
      corresponding code regions.
- [ ] LRU in-memory cache layered on top of the on-disk cache to make
      same-line repeats instantaneous.
- [ ] Settings page (private mode default, max commits, LLM provider).
- [ ] Internationalization for the panel chrome (zh-CN as the first
      non-en locale).

---

## M4 — Beyond MVP

- [ ] **Share link**: publish a result page to a user-owned Gist so it
      can be linked from Slack / docs without exposing this machine.
- [ ] GitLab / Bitbucket support (replaces `gh` with platform adapters).
- [ ] JetBrains-family extension reusing the core package.
- [ ] Module-level archaeology — a narrative covering an entire
      directory's evolution rather than a single symbol.
- [ ] Cross-repo tracking for monorepo split / merge events.

---

## Open questions

These need a call before implementation begins.

- **Q1** (Share link host): own gist, self-hosted page, or skip the
  feature entirely? Leaning toward Gist — zero infrastructure.
- **Q2** (Feedback telemetry): default local-only, opt-in anonymous
  upload? Need a clear UX moment to ask.
- **Q3** (Sign-in): rely entirely on the user's `gh` CLI auth or run
  our own OAuth? Leaning toward `gh`-only — no extra account to manage.
- ~~**Q4** (Provider abstraction)~~ → **resolved**: ship LLM access
  exclusively via the VS Code Language Model API (GitHub Copilot). No
  custom provider, no API key plumbing, no extra account for the user.
  Users without Copilot keep the deterministic answer.
