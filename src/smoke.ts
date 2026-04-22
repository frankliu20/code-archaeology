/* eslint-disable */
/**
 * Smoke test: run the pipeline against this repo itself and print events.
 * Run with: `node out/smoke.js <file> <startLine> <endLine>`
 */
import * as path from 'node:path';
import { investigate } from './core/pipeline';
import { findRepoRoot } from './core/history';

async function main() {
  const [, , file, startStr, endStr] = process.argv;
  if (!file) {
    console.error('Usage: node out/smoke.js <file> <startLine> <endLine>');
    process.exit(1);
  }
  const filePath = path.resolve(file);
  const startLine = Number(startStr ?? '1');
  const endLine = Number(endStr ?? String(startLine));

  const repoRoot = await findRepoRoot(filePath);
  console.log(`repo: ${repoRoot}`);
  console.log(`file: ${path.relative(repoRoot, filePath)}:${startLine}-${endLine}`);
  console.log('---');

  for await (const ev of investigate({ filePath, repoRoot, startLine, endLine })) {
    if (ev.kind === 'commit-enriched') {
      const c = ev.commit.commit;
      const pr = ev.commit.pr ? ` PR#${ev.commit.pr.number}` : '';
      console.log(`[enriched ${ev.index}/${ev.total}] ${c.shortSha} ${c.subject}${pr}`);
    } else if (ev.kind === 'answer') {
      console.log(`[answer cf=${ev.confidence}] ${ev.text}`);
    } else if (ev.kind === 'done') {
      console.log(`[done] total=${ev.result.totalCommitsFound} noise=${ev.result.noiseFilteredCount}`);
    } else {
      console.log(`[${ev.kind}] ${'message' in ev ? ev.message : JSON.stringify(ev)}`);
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });
