/**
 * Diagnostics change → docs-health refresh (debounced).
 * primary_doc: docs/EXTENSION_DESIGN.md §3.4
 */
import * as vscode from "vscode";
import type { ObservatoryStore } from "../observatory/store";
import { runDocScanOnly } from "../scanners/doc-scan-only";

export class DiagnosticWatcher {
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly store: ObservatoryStore,
    private readonly debounceMs: number
  ) {}

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.languages.onDidChangeDiagnostics(() => {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => void this.flush(), this.debounceMs);
      })
    );
  }

  private async flush(): Promise<void> {
    this.timer = null;
    try {
      await runDocScanOnly(this.workspaceRoot, this.store);
    } catch {
      /* ignore */
    }
  }
}
