# Changelog

All notable changes to **Code Archaeologist** will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

See [`ROADMAP.md`](./ROADMAP.md) for planned work.

## [0.1.0] — 2026-04-22

First public release. Implements the M0 milestone of the PRD plus the
performance pass on top of it.

### Added
- VS Code command **"🏺 Why is this here?"** bound to `Ctrl/Cmd+Shift+Y`
  and the editor context menu.
- Streaming side panel with the three-layer structure (Answer · Key
  Evidence · Full Timeline) backed by an `AsyncGenerator` event stream.
- Line-range git history via `git log -L` with custom record-separator
  parsing.
- PR enrichment via the `gh` CLI using a **single batched GraphQL
  query** (aliased `repository.object(oid:)` lookups, chunked at 30).
- Persistent on-disk cache at `~/.git-archaeology/cache/<owner>__<repo>.json`
  with 7-day TTL and negative-result caching.
- Noise filter for merge / dependabot / format-only / rename-only
  commits, with the filtered rows still visible (dimmed) in the
  full timeline.
- "📋 Copy as PR comment" Markdown export.
- Smoke-test CLI (`out/smoke.js`) for headless verification.

### Notes
- The "Answer" is currently a deterministic synthesis of the most
  recent significant commit + its PR. LLM-generated answers are
  scheduled for M1 — see [`ROADMAP.md`](./ROADMAP.md).
