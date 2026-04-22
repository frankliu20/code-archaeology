/**
 * Streaming pipeline orchestrating history fetch -> noise filter -> PR enrichment.
 *
 * v0.0.2 changes:
 *   - Persistent on-disk cache (PRCache) keyed by repo slug + commit SHA.
 *   - Batch GraphQL PR fetch instead of per-commit `gh pr view`.
 *   - Cache hits are emitted before any network call, so the Answer event
 *     fires almost instantly on warm runs.
 *
 * Yields AnalysisEvent values in the order the UI should consume them
 * (see PRD §6.1.3 streaming protocol).
 */

import {
  AnalysisEvent,
  ArchaeologyResult,
  EnrichedCommit,
  InvestigationTarget,
  PRInfo,
} from './types';
import { fetchHistory } from './history';
import { classifyNoise } from './filter';
import { batchFetchPRs, checkGhAvailable, detectRepoSlug, RepoSlug } from './enrich';
import { PRCache } from './cache';

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
      result: { target, commits: [], totalCommitsFound: 0, noiseFilteredCount: 0 },
    };
    return;
  }

  // ---------- Resolve PR data: cache first, then a single batch fetch ----------
  const ghAvailable = await checkGhAvailable();
  let slug: RepoSlug | undefined;
  let cache: PRCache | undefined;

  if (ghAvailable) {
    slug = await detectRepoSlug(target.repoRoot);
    if (slug) {
      cache = new PRCache(`${slug.owner}__${slug.name}`);
      await cache.load();
    }
  } else {
    yield {
      kind: 'progress',
      message: '`gh` CLI not authenticated — PR enrichment skipped.',
    };
  }

  // Resolve cache hits and identify misses.
  const missingShas: string[] = [];
  if (cache) {
    for (const item of significant) {
      const cached = cache.get(item.commit.sha);
      if (cached === undefined) {
        missingShas.push(item.commit.sha);
      } else if (cached !== null) {
        item.pr = cached;
      }
    }
    if (missingShas.length === 0 && significant.length > 0) {
      yield { kind: 'progress', message: `All ${significant.length} PRs from cache.` };
    } else if (missingShas.length < significant.length) {
      const hits = significant.length - missingShas.length;
      yield {
        kind: 'progress',
        message: `${hits} from cache, fetching ${missingShas.length} PR${missingShas.length === 1 ? '' : 's'}…`,
      };
    }
  }

  // Batch-fetch the misses in a single GraphQL request (chunked under the hood).
  if (cache && slug && missingShas.length > 0) {
    if (!cache.size()) {
      yield { kind: 'progress', message: `Fetching ${missingShas.length} PRs…` };
    }
    const fetched = await batchFetchPRs(target.repoRoot, slug, missingShas);
    for (const sha of missingShas) {
      const v = fetched.get(sha);
      if (v !== undefined) cache.set(sha, v);
    }
    // Apply fetched results onto significant commits.
    const byShaMap = new Map<string, PRInfo | null | undefined>();
    for (const sha of missingShas) byShaMap.set(sha, fetched.get(sha));
    for (const item of significant) {
      const v = byShaMap.get(item.commit.sha);
      if (v) item.pr = v;
    }
    await cache.flush();
  }

  // ---------- Stream commit-enriched events in chronological-recent order ----------
  for (let i = 0; i < significant.length; i++) {
    const item = significant[i];
    yield {
      kind: 'commit-enriched',
      commit: item,
      index: i + 1,
      total: significant.length,
    };
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
