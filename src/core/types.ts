/**
 * Shared types for Code Archaeologist core.
 *
 * Streaming protocol: the pipeline yields AnalysisEvent values so the UI can
 * show progress before the full analysis completes (PRD §6.1.3).
 */

export interface InvestigationTarget {
  /** Absolute path to the file being investigated. */
  filePath: string;
  /** Repository root (where .git lives), absolute path. */
  repoRoot: string;
  /** 1-based inclusive line range. */
  startLine: number;
  endLine: number;
  /** Best-effort symbol name covering the range, if detectable. */
  symbolHint?: string;
}

export interface CommitInfo {
  sha: string;
  shortSha: string;
  authorName: string;
  authorEmail: string;
  /** ISO 8601 timestamp. */
  date: string;
  /** First line of the commit message. */
  subject: string;
  /** Full commit message body (excluding subject). */
  body: string;
  /** Number of lines added in the diff. */
  additions: number;
  /** Number of lines removed in the diff. */
  deletions: number;
  /** PR number parsed from commit message, if any (e.g. "(#123)"). */
  prNumberFromMessage?: number;
}

export interface PRInfo {
  number: number;
  title: string;
  body: string;
  url: string;
  author: string;
  /** ISO 8601 timestamp. */
  mergedAt?: string;
  /** Issue numbers referenced via Fixes/Closes/Resolves. */
  linkedIssues: number[];
  labels: string[];
}

export interface EnrichedCommit {
  commit: CommitInfo;
  pr?: PRInfo;
  /** Why this commit was filtered out, if applicable. */
  noiseReason?: NoiseReason;
}

export type NoiseReason =
  | 'merge'
  | 'whitespace-only'
  | 'bot'
  | 'rename-only';

export interface ArchaeologyResult {
  target: InvestigationTarget;
  commits: EnrichedCommit[];
  /** Total commits found before noise filtering. */
  totalCommitsFound: number;
  /** Number of noise commits hidden by default. */
  noiseFilteredCount: number;
}

// ---------- Streaming events ----------

export type AnalysisEvent =
  | { kind: 'progress'; message: string }
  | { kind: 'commits-found'; total: number; significant: number }
  | { kind: 'commit-enriched'; commit: EnrichedCommit; index: number; total: number }
  | { kind: 'answer'; text: string; confidence: 1 | 2 | 3 | 4 | 5; sources: string[] }
  | { kind: 'done'; result: ArchaeologyResult }
  | { kind: 'error'; message: string };
