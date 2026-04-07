/**
 * Debounced file save → scan callback.
 * primary_doc: docs/EXTENSION_DESIGN.md §3.1
 */
import * as vscode from "vscode";

export class FileWatcher {
  private readonly buffer = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly debounceMs: number,
    private readonly shouldIgnore: (fsPath: string) => boolean,
    private readonly onFlush: (paths: string[]) => void | Promise<void>
  ) {}

  dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), this.debounceMs);
  }

  private async flush(): Promise<void> {
    this.timer = null;
    const paths = [...this.buffer];
    this.buffer.clear();
    if (paths.length === 0) return;
    await this.onFlush(paths);
  }

  notifyFileChanged(fsPath: string): void {
    if (this.shouldIgnore(fsPath)) return;
    this.buffer.add(fsPath);
    this.schedule();
  }

  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.notifyFileChanged(doc.uri.fsPath);
      })
    );
  }
}

export function defaultIgnoreObservatory(fsPath: string): boolean {
  const n = fsPath.replace(/\\/g, "/");
  return (
    n.includes("/.observatory/") ||
    n.includes("/node_modules/") ||
    n.includes("/.git/")
  );
}
