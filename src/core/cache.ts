/**
 * Persistent on-disk cache for PR lookup results.
 *
 * Keyed by commit SHA within a repo namespace. Stores both positive hits
 * (PRInfo) and negative hits (no PR found) to avoid repeated network calls
 * for commits that simply don't have a PR.
 *
 * Storage: one JSON file per repository slug under
 * `~/.git-archaeology/cache/<owner__name>.json`. Loaded once per
 * investigation, flushed once at the end.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { PRInfo } from './types';

const CACHE_VERSION = 1;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface CacheEntry {
  pr: PRInfo | null;
  fetchedAt: number;
}

interface RepoCacheFile {
  version: number;
  entries: Record<string, CacheEntry>;
}

export class PRCache {
  private data: RepoCacheFile = { version: CACHE_VERSION, entries: {} };
  private dirty = false;
  private readonly file: string;

  constructor(repoSlug: string) {
    const safe = repoSlug.replace(/[^a-zA-Z0-9_-]/g, '_');
    this.file = path.join(PRCache.cacheDir(), `${safe}.json`);
  }

  static cacheDir(): string {
    return path.join(os.homedir(), '.git-archaeology', 'cache');
  }

  async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as RepoCacheFile;
      if (parsed && parsed.version === CACHE_VERSION && parsed.entries) {
        this.data = parsed;
      }
    } catch {
      // Miss or corrupt — start fresh.
    }
  }

  /**
   * Returns the cached PR (or null for known-no-PR), or undefined for a miss
   * or expired entry.
   */
  get(sha: string): PRInfo | null | undefined {
    const e = this.data.entries[sha];
    if (!e) return undefined;
    if (Date.now() - e.fetchedAt > TTL_MS) return undefined;
    return e.pr;
  }

  set(sha: string, pr: PRInfo | null): void {
    this.data.entries[sha] = { pr, fetchedAt: Date.now() };
    this.dirty = true;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    try {
      await fs.mkdir(PRCache.cacheDir(), { recursive: true });
      await fs.writeFile(this.file, JSON.stringify(this.data), 'utf8');
      this.dirty = false;
    } catch {
      // Cache write failures are non-fatal.
    }
  }

  size(): number {
    return Object.keys(this.data.entries).length;
  }
}
