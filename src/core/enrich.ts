/**
 * PR enrichment via the `gh` CLI.
 *
 * Strategy (rewritten in v0.0.2):
 *   1. Detect repo slug (owner/name) once via `gh repo view`.
 *   2. Fetch all unknown PRs in a single GraphQL request using aliased
 *      `repository.object(oid:)` lookups. This collapses N round-trips
 *      into 1 (≈10× speedup on a 30-commit history).
 *
 * Negative results (commit has no associated PR) are returned as null so
 * the caller can cache them and avoid re-asking.
 */

import { spawn } from 'node:child_process';
import { PRInfo } from './types';

/** Max SHAs per GraphQL request — keeps the query under arg-length limits. */
const BATCH_SIZE = 30;

export interface RepoSlug {
  owner: string;
  name: string;
}

export async function checkGhAvailable(): Promise<boolean> {
  try {
    await runGh(process.cwd(), ['auth', 'status']);
    return true;
  } catch {
    return false;
  }
}

export async function detectRepoSlug(repoRoot: string): Promise<RepoSlug | undefined> {
  try {
    const out = await runGh(repoRoot, ['repo', 'view', '--json', 'owner,name']);
    const j = JSON.parse(out) as { owner: { login: string }; name: string };
    return { owner: j.owner.login, name: j.name };
  } catch {
    return undefined;
  }
}

/**
 * Fetch PR metadata for many commit SHAs in a single GraphQL request
 * (chunked into BATCH_SIZE-sized queries when needed).
 *
 * Returns a map sha → PRInfo|null. SHAs with no associated PR map to null.
 * SHAs that errored out are simply absent from the map (caller can decide
 * whether to retry individually or treat as "unknown").
 */
export async function batchFetchPRs(
  repoRoot: string,
  slug: RepoSlug,
  shas: string[],
): Promise<Map<string, PRInfo | null>> {
  const result = new Map<string, PRInfo | null>();
  if (shas.length === 0) return result;

  for (let i = 0; i < shas.length; i += BATCH_SIZE) {
    const chunk = shas.slice(i, i + BATCH_SIZE);
    try {
      const partial = await fetchChunk(repoRoot, slug, chunk);
      for (const [sha, pr] of partial) result.set(sha, pr);
    } catch {
      // Best-effort: skip the failed chunk; the caller will still get
      // events for cache hits + other chunks.
    }
  }

  return result;
}

async function fetchChunk(
  repoRoot: string,
  slug: RepoSlug,
  shas: string[],
): Promise<Map<string, PRInfo | null>> {
  const aliases = shas.map((sha, i) => buildAlias(`c${i}`, sha)).join('\n');
  const query = `query { repository(owner: "${slug.owner}", name: "${slug.name}") { ${aliases} } }`;

  const out = await runGh(repoRoot, ['api', 'graphql', '-f', `query=${query}`]);
  const parsed = JSON.parse(out) as {
    data?: { repository?: Record<string, GraphqlCommitNode | null> };
  };

  const result = new Map<string, PRInfo | null>();
  shas.forEach((sha, i) => {
    const node = parsed?.data?.repository?.[`c${i}`];
    const pr = node?.associatedPullRequests?.nodes?.[0];
    if (pr) {
      result.set(sha, {
        number: pr.number,
        title: pr.title,
        body: pr.body ?? '',
        url: pr.url,
        author: pr.author?.login ?? 'unknown',
        mergedAt: pr.mergedAt ?? undefined,
        linkedIssues: parseLinkedIssues(pr.body ?? ''),
        labels: (pr.labels?.nodes ?? []).map(l => l.name),
      });
    } else if (node !== undefined) {
      // node === null also counts as a deterministic "no PR" answer.
      result.set(sha, null);
    }
  });
  return result;
}

function buildAlias(alias: string, sha: string): string {
  return `${alias}: object(oid: "${sha}") {
    ... on Commit {
      associatedPullRequests(first: 1, orderBy: { field: CREATED_AT, direction: ASC }) {
        nodes {
          number
          title
          body
          url
          mergedAt
          author { login }
          labels(first: 10) { nodes { name } }
        }
      }
    }
  }`;
}

interface GraphqlCommitNode {
  associatedPullRequests?: {
    nodes?: Array<{
      number: number;
      title: string;
      body: string | null;
      url: string;
      mergedAt: string | null;
      author: { login?: string } | null;
      labels?: { nodes?: Array<{ name: string }> };
    }>;
  };
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
      else reject(new Error(`gh ${args.slice(0, 2).join(' ')} exited ${code}: ${stderr.trim()}`));
    });
  });
}
