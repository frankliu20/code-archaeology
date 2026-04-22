# Roadmap

This file tracks work that is planned but not yet implemented. The shipped
behavior lives in [`README.md`](./README.md); the original problem framing
lives in [`../prd/code-archaeologist.md`](../prd/code-archaeologist.md).

Milestones are ordered, but not time-boxed. Items inside a milestone are
roughly priority-ordered.

---

## M1 — LLM-generated answers

Replace the rule-based "Most recently changed by…" placeholder with an
actual *why* synthesized from commits + PR/Issue context.

- [ ] Anthropic SDK integration with **streaming** responses, so the
      Answer event still fires before full enrichment completes.
- [ ] Prompt design that **forces source spans**: every claim in the
      Answer must reference a commit SHA / PR number / Issue number that
      the UI can highlight in the Evidence layer.
- [ ] Confidence self-rating on the 5-dot scale (currently capped at 3).
- [ ] **Private mode** toggle — exposed in the welcome flow, not buried
      in settings. When enabled, no payload leaves the machine.
- [ ] Per-claim "👎 wrong" feedback writes a JSONL log under
      `~/.git-archaeology/feedback.jsonl` for later prompt tuning.
- [ ] Cross-file rename tracking via `git log --follow` so renames don't
      appear as "first appearance" of the symbol.
- [ ] Configurable LLM provider (interface only — Anthropic stays default).

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
- **Q4** (Provider abstraction): does v1 ship with a single Anthropic
  binding, or a thin interface so others can plug in OpenAI / local
  models from day one?
