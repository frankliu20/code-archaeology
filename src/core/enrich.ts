/**
 * PR enrichment via the `gh` CLI.
 *
 * For each commit we attempt to find the associated PR. Strategy:
 *   1. If commit subject contains "(#NNN)" or "Merge pull request #NNN", use that.
 *   2. Otherwise call `gh pr list --search <sha>` to discover the PR.
 *
 * Results are cached in-memory for the lifetime of the extension host
 * (the more durable on-disk cache from PRD §9.2 is M1 work).
 */

import { spawn } from 'node:child_process';
import { CommitInfo, PRInfo } from './types';

const cache = new Map<string, PRInfo | null>();

export interface EnrichOptions {
  repoRoot: string;
  /** Whether the gh CLI is available + authenticated. */
  ghAvailable: boolean;
}

/**
 * Best-effort PR lookup. Returns undefined if no PR found or gh unavailable.
 */
export async function lookupPR(
  commit: CommitInfo,
  opts: EnrichOptions,
): Promise<PRInfo | undefined> {
  if (!opts.ghAvailable) return undefined;

  const cacheKey = `${opts.repoRoot}::${commit.sha}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? undefined;
  }

  let prNumber = commit.prNumberFromMessage;

  if (!prNumber) {
    prNumber = await searchPRBySha(opts.repoRoot, commit.sha);
  }

  if (!prNumber) {
    cache.set(cacheKey, null);
    return undefined;
  }

  const pr = await fetchPR(opts.repoRoot, prNumber);
  cache.set(cacheKey, pr ?? null);
  return pr ?? undefined;
}

async function searchPRBySha(repoRoot: string, sha: string): Promise<number | undefined> {
  try {
    const out = await runGh(repoRoot, [
      'pr', 'list',
      '--search', sha,
      '--state', 'all',
      '--json', 'number',
      '--limit', '1',
    ]);
    const arr = JSON.parse(out) as Array<{ number: number }>;
    return arr[0]?.number;
  } catch {
    return undefined;
  }
}

async function fetchPR(repoRoot: string, prNumber: number): Promise<PRInfo | undefined> {
  try {
    const out = await runGh(repoRoot, [
      'pr', 'view', String(prNumber),
      '--json', 'number,title,body,url,author,mergedAt,labels',
    ]);
    const raw = JSON.parse(out) as {
      number: number;
      title: string;
      body: string;
      url: string;
      author: { login?: string };
      mergedAt?: string;
      labels?: Array<{ name: string }>;
    };

    return {
      number: raw.number,
      title: raw.title,
      body: raw.body ?? '',
      url: raw.url,
      author: raw.author?.login ?? 'unknown',
      mergedAt: raw.mergedAt,
      linkedIssues: parseLinkedIssues(raw.body ?? ''),
      labels: (raw.labels ?? []).map(l => l.name),
    };
  } catch {
    return undefined;
  }
}

function parseLinkedIssues(body: string): number[] {
  const re = /\b(?:fixes|closes|resolves)\s+#(\d+)/gi;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    out.push(Number(m[1]));
  }
  return out;
}

export async function checkGhAvailable(): Promise<boolean> {
  try {
    await runGh(process.cwd(), ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

function runGh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gh', args, { cwd, windowsHide: true, shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout?.setEncoding('utf8');
    proc.stderr?.setEncoding('utf8');
    proc.stdout?.on('data', d => { stdout += d; });
    proc.stderr?.on('data', d => { stderr += d; });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`gh ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
    });
  });
}
