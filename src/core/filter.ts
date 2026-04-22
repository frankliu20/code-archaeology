/**
 * Noise filter for commits: skip merges, format-only changes, and bot commits.
 *
 * Conservative defaults — when in doubt, keep the commit (we'd rather show
 * extra noise than hide a real semantic change).
 */

import { CommitInfo, NoiseReason } from './types';

const BOT_AUTHORS = [
  'dependabot',
  'renovate',
  'github-actions',
  'pre-commit-ci',
];

export function classifyNoise(commit: CommitInfo): NoiseReason | undefined {
  if (isMerge(commit)) return 'merge';
  if (isBot(commit)) return 'bot';
  // Whitespace/rename-only detection is a heuristic that needs the diff body.
  // We approximate with subject matching for M0 — full diff analysis is M1.
  if (looksLikeFormat(commit)) return 'whitespace-only';
  if (looksLikeRenameOnly(commit)) return 'rename-only';
  return undefined;
}

function isMerge(c: CommitInfo): boolean {
  return /^Merge (branch|pull request|remote-tracking branch)/i.test(c.subject);
}

function isBot(c: CommitInfo): boolean {
  const id = `${c.authorName} ${c.authorEmail}`.toLowerCase();
  return BOT_AUTHORS.some(b => id.includes(b));
}

function looksLikeFormat(c: CommitInfo): boolean {
  const s = c.subject.toLowerCase();
  return /^(format|reformat|prettier|eslint( --fix)?|style|whitespace|fix lint|lint fix|chore: format)/.test(s);
}

function looksLikeRenameOnly(c: CommitInfo): boolean {
  const s = c.subject.toLowerCase();
  return /^(rename|mv |move file)/.test(s) && c.additions <= 2 && c.deletions <= 2;
}
