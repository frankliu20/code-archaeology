/**
 * Manages the singleton webview panel that displays archaeology results.
 *
 * The panel holds vanilla HTML+JS (no framework for M0). The extension host
 * pushes AnalysisEvent values into it via postMessage; the webview script
 * mutates the DOM to reflect the streaming pipeline.
 */

import * as vscode from 'vscode';
import { AnalysisEvent } from '../core/types';
import { renderHtml } from './ui';

export interface InvestigationHeader {
  file: string;
  startLine: number;
  endLine: number;
}

export class ArchaeologyPanel {
  private static current?: ArchaeologyPanel;
  private static readonly viewType = 'codeArchaeology.panel';

  static createOrShow(extensionUri: vscode.Uri): ArchaeologyPanel {
    const column = vscode.ViewColumn.Beside;
    if (ArchaeologyPanel.current) {
      ArchaeologyPanel.current.panel.reveal(column, true);
      return ArchaeologyPanel.current;
    }
    const panel = vscode.window.createWebviewPanel(
      ArchaeologyPanel.viewType,
      '🏺 Code Archaeology',
      { viewColumn: column, preserveFocus: true },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );
    ArchaeologyPanel.current = new ArchaeologyPanel(panel);
    return ArchaeologyPanel.current;
  }

  static disposeCurrent(): void {
    ArchaeologyPanel.current?.panel.dispose();
    ArchaeologyPanel.current = undefined;
  }

  private constructor(private readonly panel: vscode.WebviewPanel) {
    panel.webview.html = renderHtml();
    panel.onDidDispose(() => {
      if (ArchaeologyPanel.current === this) {
        ArchaeologyPanel.current = undefined;
      }
    });
    panel.webview.onDidReceiveMessage(msg => this.onMessage(msg));
  }

  startInvestigation(header: InvestigationHeader): void {
    this.panel.webview.postMessage({ type: 'reset', header });
  }

  sendEvent(event: AnalysisEvent): void {
    this.panel.webview.postMessage({ type: 'event', event });
  }

  private async onMessage(msg: { type?: string; url?: string }): Promise<void> {
    if (msg.type === 'open-external' && msg.url) {
      try {
        await vscode.env.openExternal(vscode.Uri.parse(msg.url));
      } catch {
        /* ignore */
      }
    }
  }
}
