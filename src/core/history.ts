/**
 * git history fetcher: invokes `git log -L` for the given file:line range
 * and parses the output into CommitInfo[].
 *
 * `git log -L<start>,<end>:<file>` produces, per commit:
 *   commit <SHA>
 *   Author: Name <email>
 *   Date:   <date>
 *
 *       <subject>
 *
 *       <body...>
 *
 *   diff --git ...
 *   --- a/file
 *   +++ b/file
 *   @@ ... @@
 *    <hunk>
 *
 * We use a custom --format to make parsing reliable, and a record separator
 * (NUL) between commits.
 */

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { CommitInfo } from './types';

const COMMIT_SEP = '\u0001COMMIT\u0001';
const FIELD_SEP = '\u0001FIELD\u0001';
const END_SEP = '\u0001END\u0001';

const FORMAT = [
  COMMIT_SEP,
  '%H',          // full sha
  '%h',          // short sha
  '%an',         // author name
  '%ae',         // author email
  '%aI',         // ISO 8601 date
  '%s',          // subject
  '%b',          // body
  END_SEP,
].join(FIELD_SEP);

export interface FetchOptions {
  repoRoot: string;
  filePath: string;
  startLine: number;
  endLine: number;
  maxCommits?: number;
  since?: string;
  /** Follow renames across files. */
  follow?: boolean;
}

export async function fetchHistory(opts: FetchOptions): Promise<CommitInfo[]> {
  const relPath = path.relative(opts.repoRoot, opts.filePath).replace(/\\/g, '/');
  const args: string[] = [
    'log',
    `-L${opts.startLine},${opts.endLine}:${relPath}`,
    `--format=${FORMAT}`,
    '--no-color',
  ];

  if (opts.maxCommits && opts.maxCommits > 0) {
    args.push(`-n`, String(opts.maxCommits));
  }
  if (opts.since) {
    args.push(`--since=${opts.since}`);
  }

  const stdout = await runGit(opts.repoRoot, args);
  return parseLog(stdout);
}

/**
 * Parse `git log` stdout produced with our custom format. We separate
 * the structured header from the diff that follows so we can compute
 * additions/deletions and PR numbers from the subject.
 */
function parseLog(stdout: string): CommitInfo[] {
  const chunks = stdout.split(COMMIT_SEP).filter(c => c.trim().length > 0);
  const commits: CommitInfo[] = [];

  for (const chunk of chunks) {
    const endIdx = chunk.indexOf(END_SEP);
    if (endIdx === -1) continue;

    const headerRaw = chunk.slice(0, endIdx);
    const diffRaw = chunk.slice(endIdx + END_SEP.length);

    const fields = headerRaw.split(FIELD_SEP);
    // fields[0] is empty (chunk starts with FIELD_SEP after the COMMIT_SEP marker is stripped)
    // Be defensive: skip leading empties.
    while (fields.length > 0 && fields[0] === '') fields.shift();

    if (fields.length < 7) continue;

    const [sha, shortSha, authorName, authorEmail, date, subject, body] = fields;

    const { additions, deletions } = countDiffLines(diffRaw);
    const prNumberFromMessage = parsePrNumberFromSubject(subject);

    commits.push({
      sha,
      shortSha,
      authorName,
      authorEmail,
      date,
      subject,
      body,
      additions,
      deletions,
      prNumberFromMessage,
    });
  }

  return commits;
}

function countDiffLines(diff: string): { additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) additions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { additions, deletions };
}

/**
 * Detect "(#123)" or "Merge pull request #123" patterns in the subject.
 */
function parsePrNumberFromSubject(subject: string): number | undefined {
  const paren = subject.match(/\(#(\d+)\)/);
  if (paren) return Number(paren[1]);
  const merge = subject.match(/Merge pull request #(\d+)/);
  if (merge) return Number(merge[1]);
  return undefined;
}

/**
 * Locate the repository root for an arbitrary file path.
 */
export async function findRepoRoot(filePath: string): Promise<string> {
  const cwd = path.dirname(filePath);
  const stdout = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  return stdout.trim();
}

function runGit(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('git', args, {
      cwd,
      env: { ...process.env, GIT_PAGER: 'cat', GIT_OPTIONAL_LOCKS: '0' },
      windowsHide: true,
    });

    proc.on('error', err => {
      // On Windows, a non-existent cwd surfaces as an ENOENT against the
      // spawned binary, which is misleading. Detect and rewrite.
      const e = err as NodeJS.ErrnoException;
      if (e.code === 'ENOENT' && e.syscall === 'spawn git') {
        reject(new Error(
          `Could not run \`git\`. Either git is not on PATH or the working ` +
          `directory does not exist (cwd=${cwd}).`,
        ));
      } else {
        reject(err);
      }
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.setEncoding('utf8');
    proc.stderr.setEncoding('utf8');
    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`git ${args.join(' ')} exited ${code}: ${stderr.trim()}`));
    });
  });
}
