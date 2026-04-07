/**
 * One workspace folder: store + watchers.
 * primary_doc: docs/ARCHITECTURE.md §3.5
 */
import * as path from "node:path";
import * as vscode from "vscode";
import { ObservatoryStore } from "../observatory/store";
import { runFullScan } from "../scanners/project-scanner";
import type { RunFullScanSddSummary } from "../scanners/sdd/types";
import { DiagnosticWatcher } from "../watchers/diagnostic-watcher";
import {
  defaultIgnoreObservatory,
  FileWatcher,
} from "../watchers/file-watcher";
import { GitWatcher } from "../watchers/git-watcher";
import {
  defaultProjectIdFromPath,
  TranscriptWatcher,
} from "../watchers/transcript-watcher";

function underWorkspaceRoot(root: string, fsPath: string): boolean {
  const r = root.replace(/\\/g, "/");
  const p = fsPath.replace(/\\/g, "/");
  return p === r || p.startsWith(r + "/");
}

export class FolderSession {
  constructor(
    public readonly folder: vscode.WorkspaceFolder,
    public readonly store: ObservatoryStore,
    private readonly context: vscode.ExtensionContext,
    private readonly onScanComplete: () => void
  ) {}

  get rootPath(): string {
    return this.folder.uri.fsPath;
  }

  async registerWatchers(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration();
    const debounce = cfg.get<number>("observatory.scan.debounceMs", 5000);
    const debounceDoc = 10_000;
    const root = this.rootPath;

    const ignoreForRoot = (fsPath: string): boolean => {
      if (defaultIgnoreObservatory(fsPath)) return true;
      return !underWorkspaceRoot(root, fsPath);
    };

    const file = new FileWatcher(
      debounce,
      ignoreForRoot,
      async (_paths: string[]) => {
        await runFullScan(root, this.store);
        this.onScanComplete();
      }
    );
    file.register(this.context);

    if (cfg.get<boolean>("observatory.git.watchEnabled", true)) {
      const gw = new GitWatcher(root, this.store, () => this.onScanComplete());
      gw.register(this.context);
    }

    if (cfg.get<boolean>("observatory.transcript.watchEnabled", true)) {
      const tw = new TranscriptWatcher(
        root,
        this.store,
        defaultProjectIdFromPath(root),
        () => this.onScanComplete()
      );
      tw.register(this.context);
    }

    const dw = new DiagnosticWatcher(root, this.store, debounceDoc);
    dw.register(this.context);
  }

  async runFullScanCommand(): Promise<RunFullScanSddSummary> {
    const summary = await runFullScan(this.rootPath, this.store, {
      ingestAgentTranscripts: true,
    });
    this.onScanComplete();
    return summary;
  }
}
