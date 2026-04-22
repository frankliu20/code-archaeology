/**
 * Streaming pipeline orchestrating history fetch -> noise filter -> PR enrichment.
 *
 * Yields AnalysisEvent values in the order the UI should consume them
 * (see PRD §6.1.3 streaming protocol).
 *
 * M0 has no LLM analysis. The "answer" event is a deterministic, rule-based
 * synthesis derived from the most-recent significant commit + its PR. This is
 * intentionally cautious in wording ("Most recently…") and reports a low
 * confidence (2/5) so users understand it is not yet AI-generated.
 */

import {
  AnalysisEvent,
  ArchaeologyResult,
  EnrichedCommit,
  InvestigationTarget,
} from './types';
import { fetchHistory } from './history';
import { classifyNoise } from './filter';
import { checkGhAvailable, lookupPR } from './enrich';

export interface PipelineOptions {
  maxCommits?: number;
}

export async function* investigate(
  target: InvestigationTarget,
  opts: PipelineOptions = {},
): AsyncGenerator<AnalysisEvent> {
  yield { kind: 'progress', message: 'Reading git history…' };

  let commits;
  try {
    commits = await fetchHistory({
      repoRoot: target.repoRoot,
      filePath: target.filePath,
      startLine: target.startLine,
      endLine: target.endLine,
      maxCommits: opts.maxCommits ?? 50,
    });
  } catch (e) {
    yield { kind: 'error', message: (e as Error).message };
    return;
  }

  // Classify noise up front so we can report the significant count right away.
  const enriched: EnrichedCommit[] = commits.map(commit => ({
    commit,
    noiseReason: classifyNoise(commit),
  }));

  const significant = enriched.filter(e => !e.noiseReason);
  yield {
    kind: 'commits-found',
    total: enriched.length,
    significant: significant.length,
  };

  if (enriched.length === 0) {
    yield {
      kind: 'answer',
      text: 'No git history found for these lines. The file or range may be untracked.',
      confidence: 1,
      sources: [],
    };
    yield {
      kind: 'done',
      result: {
        target,
        commits: [],
        totalCommitsFound: 0,
        noiseFilteredCount: 0,
      },
    };
    return;
  }

  yield { kind: 'progress', message: 'Checking GitHub CLI…' };
  const ghAvailable = await checkGhAvailable();
  if (!ghAvailable) {
    yield {
      kind: 'progress',
      message: '`gh` CLI not authenticated — PR enrichment skipped.',
    };
  }

  // Enrich significant commits in order, streaming each as it completes.
  // We deliberately go sequential to keep GitHub API rate limits low for M0.
  for (let i = 0; i < significant.length; i++) {
    const item = significant[i];
    yield {
      kind: 'progress',
      message: `Fetching PR for ${item.commit.shortSha}…`,
    };
    item.pr = await lookupPR(item.commit, {
      repoRoot: target.repoRoot,
      ghAvailable,
    });
    yield {
      kind: 'commit-enriched',
      commit: item,
      index: i + 1,
      total: significant.length,
    };

    // Emit a tentative answer based on the first (most recent) significant commit
    // so the UI can populate Layer 1 ASAP.
    if (i === 0) {
      yield buildTentativeAnswer(item);
    }
  }

  const result: ArchaeologyResult = {
    target,
    commits: enriched,
    totalCommitsFound: enriched.length,
    noiseFilteredCount: enriched.length - significant.length,
  };
  yield { kind: 'done', result };
}

function buildTentativeAnswer(item: EnrichedCommit): AnalysisEvent {
  const date = item.commit.date.slice(0, 10);
  const author = item.commit.authorName;
  const subject = item.commit.subject.replace(/\s*\(#\d+\)\s*$/, '');

  let text: string;
  const sources: string[] = [`commit ${item.commit.shortSha}`];

  if (item.pr) {
    text = `Most recently changed on ${date} by ${author} in PR #${item.pr.number}: "${item.pr.title}". ${truncate(item.pr.body, 220)}`;
    sources.push(`PR #${item.pr.number}`);
  } else {
    text = `Most recently changed on ${date} by ${author}: "${subject}".`;
  }

  return {
    kind: 'answer',
    text,
    confidence: item.pr ? 3 : 2,
    sources,
  };
}

function truncate(s: string, n: number): string {
  const clean = s.replace(/\s+/g, ' ').trim();
  if (clean.length <= n) return clean;
  return clean.slice(0, n - 1).trimEnd() + '…';
}
