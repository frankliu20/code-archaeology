/**
 * VS Code extension entry.
 *
 * Wires the editor selection to a webview side panel that streams archaeology
 * results from the core pipeline.
 */

import * as path from 'node:path';
import * as vscode from 'vscode';
import { investigate } from './core/pipeline';
import { findRepoRoot } from './core/history';
import { ArchaeologyPanel } from './webview/panel';

export function activate(context: vscode.ExtensionContext): void {
  const command = vscode.commands.registerCommand(
    'codeArchaeology.investigateSelection',
    () => runInvestigation(context),
  );
  context.subscriptions.push(command);
}

export function deactivate(): void {
  ArchaeologyPanel.disposeCurrent();
}

async function runInvestigation(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('Code Archaeology: open a file and select code first.');
    return;
  }

  const filePath = editor.document.uri.fsPath;
  if (!filePath || editor.document.uri.scheme !== 'file') {
    vscode.window.showWarningMessage('Code Archaeology: only file-system files are supported.');
    return;
  }

  // Default range: current selection. If selection is empty, use current line.
  const selection = editor.selection;
  const startLine = selection.start.line + 1;
  const endLine = selection.isEmpty
    ? selection.start.line + 1
    : selection.end.line + 1;

  let repoRoot: string;
  try {
    repoRoot = await findRepoRoot(filePath);
  } catch (e) {
    vscode.window.showErrorMessage(
      `Code Archaeology: not a git repository (${(e as Error).message}).`,
    );
    return;
  }

  const target = {
    filePath,
    repoRoot,
    startLine,
    endLine,
  };

  const panel = ArchaeologyPanel.createOrShow(context.extensionUri);
  panel.startInvestigation({
    file: path.relative(repoRoot, filePath),
    startLine,
    endLine,
  });

  try {
    for await (const event of investigate(target)) {
      panel.sendEvent(event);
    }
  } catch (e) {
    panel.sendEvent({ kind: 'error', message: (e as Error).message });
  }
}
