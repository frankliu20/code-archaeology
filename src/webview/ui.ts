/**
 * HTML for the archaeology side panel.
 *
 * Layout (PRD §6.1.2):
 *   - Header: investigation target
 *   - Layer 1: Answer (filled when first 'answer' event arrives)
 *   - Layer 2: Evidence list (appended as 'commit-enriched' events stream in)
 *   - Layer 3: Full timeline, collapsed by default
 *   - Status line at the bottom (latest 'progress' message)
 */

export function renderHtml(): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline';" />
<title>Code Archaeology</title>
<style>
  :root {
    color-scheme: light dark;
  }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    font-size: var(--vscode-font-size);
    margin: 0;
    padding: 16px;
    line-height: 1.5;
  }
  h2 { font-size: 1.05em; margin: 0 0 4px; }
  h3 { font-size: 0.95em; margin: 16px 0 8px; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.05em; }
  .target {
    font-family: var(--vscode-editor-font-family, monospace);
    color: var(--vscode-descriptionForeground);
    font-size: 0.9em;
    margin-bottom: 16px;
  }
  .divider {
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    margin: 14px 0;
  }
  .answer-box {
    padding: 12px 14px;
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.08));
    border-left: 3px solid var(--vscode-textLink-foreground, #4ea1f3);
    border-radius: 3px;
    min-height: 40px;
  }
  .answer-text { white-space: pre-wrap; }
  .answer-meta {
    margin-top: 8px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
  }
  .confidence-dots { letter-spacing: 2px; font-family: monospace; }
  .placeholder { color: var(--vscode-descriptionForeground); font-style: italic; }
  .commit {
    padding: 10px 12px;
    margin: 8px 0;
    background: var(--vscode-textBlockQuote-background, rgba(127,127,127,0.05));
    border-radius: 3px;
  }
  .commit .meta {
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    margin-bottom: 4px;
  }
  .commit .subject { font-weight: 600; margin-bottom: 4px; }
  .commit .pr {
    font-size: 0.9em;
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(78, 161, 243, 0.08);
    border-radius: 2px;
  }
  .commit .pr a { color: var(--vscode-textLink-foreground); text-decoration: none; }
  .commit .pr a:hover { text-decoration: underline; }
  .quote {
    margin: 6px 0 0;
    padding: 6px 10px;
    border-left: 2px solid var(--vscode-descriptionForeground);
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
    white-space: pre-wrap;
  }
  details { margin-top: 12px; }
  summary { cursor: pointer; user-select: none; padding: 6px 0; }
  .timeline-row {
    padding: 4px 8px;
    font-size: 0.9em;
    border-bottom: 1px dashed rgba(128,128,128,0.15);
  }
  .timeline-row.noise { opacity: 0.55; }
  .badge {
    display: inline-block;
    padding: 0 6px;
    border-radius: 8px;
    font-size: 0.75em;
    background: rgba(128,128,128,0.15);
    margin-left: 6px;
    color: var(--vscode-descriptionForeground);
  }
  .status {
    margin-top: 18px;
    padding-top: 8px;
    border-top: 1px solid var(--vscode-panel-border, rgba(128,128,128,0.2));
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    min-height: 1.4em;
  }
  .actions { margin-top: 18px; display: flex; gap: 8px; flex-wrap: wrap; }
  button {
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #fff);
    border: none;
    padding: 6px 12px;
    border-radius: 3px;
    cursor: pointer;
    font: inherit;
  }
  button:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  button:disabled { opacity: 0.4; cursor: not-allowed; }
  .error { color: var(--vscode-errorForeground, #f48771); }
</style>
</head>
<body>
  <h2>🏺 Code Archaeology</h2>
  <div id="target" class="target">Investigating…</div>

  <h3>💡 Answer</h3>
  <div id="answer" class="answer-box">
    <div class="placeholder">Analyzing… the answer will appear here as soon as it's available.</div>
  </div>

  <h3>📎 Key Evidence</h3>
  <div id="evidence">
    <div class="placeholder">No evidence yet.</div>
  </div>

  <details id="timeline-details">
    <summary>▾ Full timeline (loading…)</summary>
    <div id="timeline"></div>
  </details>

  <div class="actions">
    <button id="copy-btn" disabled>📋 Copy as PR comment</button>
    <button id="feedback-btn" disabled>👎 This explanation is wrong</button>
  </div>

  <div id="status" class="status"></div>

<script>
(function () {
  const vscode = acquireVsCodeApi();

  const els = {
    target: document.getElementById('target'),
    answer: document.getElementById('answer'),
    evidence: document.getElementById('evidence'),
    timelineDetails: document.getElementById('timeline-details'),
    timeline: document.getElementById('timeline'),
    status: document.getElementById('status'),
    copyBtn: document.getElementById('copy-btn'),
    feedbackBtn: document.getElementById('feedback-btn'),
  };

  let state = {
    answer: null,
    evidence: [],
    timeline: [],
    significantTotal: 0,
    enrichedCount: 0,
    target: null,
  };

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function dots(n) {
    const filled = '●'.repeat(n);
    const empty = '○'.repeat(5 - n);
    return filled + empty;
  }

  function renderAnswer() {
    if (!state.answer) return;
    const a = state.answer;
    els.answer.innerHTML =
      '<div class="answer-text">' + escapeHtml(a.text) + '</div>' +
      '<div class="answer-meta">' +
        'Confidence: <span class="confidence-dots">' + dots(a.confidence) + '</span>' +
        ' (' + a.confidence + '/5)' +
        (a.sources && a.sources.length
          ? ' &middot; Based on ' + a.sources.map(escapeHtml).join(', ')
          : '') +
      '</div>';
    els.copyBtn.disabled = false;
    els.feedbackBtn.disabled = false;
  }

  function renderEvidence() {
    if (state.evidence.length === 0) {
      els.evidence.innerHTML = '<div class="placeholder">No evidence yet.</div>';
      return;
    }
    // Show the top 3 enriched commits as evidence cards.
    const top = state.evidence.slice(0, 3);
    els.evidence.innerHTML = top.map(renderCommit).join('');
  }

  function renderCommit(item) {
    const c = item.commit;
    const date = c.date.slice(0, 10);
    let html = '<div class="commit">';
    html += '<div class="meta">' +
      escapeHtml(c.shortSha) + ' &middot; ' +
      escapeHtml(c.authorName) + ' &middot; ' +
      escapeHtml(date) + '</div>';
    html += '<div class="subject">' + escapeHtml(c.subject) + '</div>';
    if (c.body && c.body.trim()) {
      html += '<div class="quote">' + escapeHtml(truncate(c.body, 280)) + '</div>';
    }
    if (item.pr) {
      html += '<div class="pr">' +
        '🔗 <a href="#" data-url="' + escapeHtml(item.pr.url) + '">' +
          'PR #' + item.pr.number + ': ' + escapeHtml(item.pr.title) +
        '</a>' +
        ' &middot; @' + escapeHtml(item.pr.author);
      if (item.pr.body && item.pr.body.trim()) {
        html += '<div class="quote">' + escapeHtml(truncate(item.pr.body, 280)) + '</div>';
      }
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function renderTimeline() {
    els.timeline.innerHTML = state.timeline.map(item => {
      const c = item.commit;
      const noiseClass = item.noiseReason ? ' noise' : '';
      const noiseBadge = item.noiseReason
        ? '<span class="badge">' + escapeHtml(item.noiseReason) + '</span>'
        : '';
      return '<div class="timeline-row' + noiseClass + '">' +
        escapeHtml(c.date.slice(0, 10)) + ' &middot; ' +
        escapeHtml(c.shortSha) + ' &middot; ' +
        escapeHtml(c.authorName) + ' &mdash; ' +
        escapeHtml(c.subject) +
        noiseBadge +
        '</div>';
    }).join('');
  }

  function truncate(s, n) {
    const clean = String(s).replace(/\\s+/g, ' ').trim();
    return clean.length <= n ? clean : clean.slice(0, n - 1) + '…';
  }

  function buildPRComment() {
    if (!state.answer || !state.target) return '';
    const t = state.target;
    let md = '### 🏺 Archaeology: ' + t.file + ':' + t.startLine + '-' + t.endLine + '\\n\\n';
    md += '**Why this code?** ' + state.answer.text + '\\n\\n';
    if (state.evidence.length) {
      md += '**Key evidence:**\\n';
      for (const item of state.evidence.slice(0, 3)) {
        const c = item.commit;
        if (item.pr) {
          md += '- PR #' + item.pr.number + ' "' + item.pr.title + '" — @' + item.pr.author + '\\n';
        } else {
          md += '- ' + c.shortSha + ' "' + c.subject + '" — ' + c.authorName + '\\n';
        }
      }
    }
    md += '\\n_Generated by Code Archaeology._';
    return md;
  }

  els.copyBtn.addEventListener('click', () => {
    const md = buildPRComment();
    if (!md) return;
    navigator.clipboard.writeText(md).then(
      () => { els.copyBtn.textContent = '✓ Copied!'; setTimeout(() => { els.copyBtn.textContent = '📋 Copy as PR comment'; }, 1500); },
      () => { els.copyBtn.textContent = '⚠ Copy failed'; }
    );
  });

  els.feedbackBtn.addEventListener('click', () => {
    els.feedbackBtn.textContent = '✓ Thanks — feedback noted';
    els.feedbackBtn.disabled = true;
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-url]');
    if (!a) return;
    e.preventDefault();
    vscode.postMessage({ type: 'open-external', url: a.getAttribute('data-url') });
  });

  function setStatus(msg, isError) {
    els.status.textContent = msg || '';
    els.status.className = 'status' + (isError ? ' error' : '');
  }

  window.addEventListener('message', (msg) => {
    const data = msg.data;
    if (!data) return;

    if (data.type === 'reset') {
      state = { answer: null, evidence: [], timeline: [], significantTotal: 0, enrichedCount: 0, target: data.header };
      els.target.textContent = data.header.file + ':' + data.header.startLine + '-' + data.header.endLine;
      els.answer.innerHTML = '<div class="placeholder">Analyzing… the answer will appear here as soon as it\\'s available.</div>';
      els.evidence.innerHTML = '<div class="placeholder">No evidence yet.</div>';
      els.timeline.innerHTML = '';
      els.timelineDetails.querySelector('summary').textContent = '▾ Full timeline (loading…)';
      els.copyBtn.disabled = true;
      els.feedbackBtn.disabled = true;
      els.feedbackBtn.textContent = '👎 This explanation is wrong';
      setStatus('');
      return;
    }

    if (data.type !== 'event') return;
    const ev = data.event;

    switch (ev.kind) {
      case 'progress':
        setStatus(ev.message);
        break;

      case 'commits-found':
        state.significantTotal = ev.significant;
        els.timelineDetails.querySelector('summary').textContent =
          '▾ Full timeline (' + ev.significant + ' significant, ' +
          (ev.total - ev.significant) + ' filtered)';
        setStatus('Found ' + ev.total + ' commits, ' + ev.significant + ' significant.');
        break;

      case 'commit-enriched':
        state.evidence.push(ev.commit);
        state.timeline.push(ev.commit);
        state.enrichedCount = ev.index;
        renderEvidence();
        renderTimeline();
        setStatus('Enriched ' + ev.index + '/' + ev.total + '…');
        break;

      case 'answer':
        state.answer = ev;
        renderAnswer();
        break;

      case 'done':
        // Append any noise commits we hadn't already shown.
        const knownShas = new Set(state.timeline.map(t => t.commit.sha));
        for (const c of ev.result.commits) {
          if (!knownShas.has(c.commit.sha)) state.timeline.push(c);
        }
        renderTimeline();
        setStatus('Done. ' + ev.result.totalCommitsFound + ' commits, ' +
          ev.result.noiseFilteredCount + ' filtered as noise.');
        break;

      case 'error':
        setStatus('Error: ' + ev.message, true);
        break;
    }
  });
})();
</script>
</body>
</html>`;
}
