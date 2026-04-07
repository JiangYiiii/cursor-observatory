/**
 * Multi-root workspace: stores, HTTP server, scan lifecycle.
 * primary_doc: docs/ARCHITECTURE.md §4.2, docs/EXTENSION_DESIGN.md §七
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { ObservatoryStore } from "../observatory/store";
import { LocalServer } from "../server/local-server";
import { SddTestReportWatcher } from "../watchers/sdd-test-report-watcher";
import { TerminalWatcher } from "../watchers/terminal-watcher";

function readAutoIngestTestReportEnabled(): boolean {
  const cfg = vscode.workspace.getConfiguration("observatory");
  const insNew = cfg.inspect<boolean>("test.autoIngestTestReport");
  if (
    insNew?.globalValue !== undefined ||
    insNew?.workspaceValue !== undefined ||
    insNew?.workspaceFolderValue !== undefined
  ) {
    return cfg.get<boolean>("test.autoIngestTestReport", true);
  }
  const insOld = cfg.inspect<boolean>("test.autoIngestPytestReport");
  if (
    insOld?.globalValue !== undefined ||
    insOld?.workspaceValue !== undefined ||
    insOld?.workspaceFolderValue !== undefined
  ) {
    return cfg.get<boolean>("test.autoIngestPytestReport", true);
  }
  return cfg.get<boolean>("test.autoIngestTestReport", true);
}
import type { RunFullScanSddSummary } from "../scanners/sdd/types";
import { FolderSession } from "./folder-session";
import {
  ObservatoryStateMachine,
  type ObservatoryRunState,
} from "./observatory-state-machine";

export class ObservatoryRegistry implements vscode.Disposable {
  private readonly folders = new Map<string, FolderSession>();
  private server?: LocalServer;
  private treeRefresh?: () => void;
  private disposed = false;
  private readonly state = new ObservatoryStateMachine();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel
  ) {}

  setTreeRefresh(fn: () => void): void {
    this.treeRefresh = fn;
  }

  getRunState(): ObservatoryRunState {
    return this.state.getPhase();
  }

  getStateMachine(): ObservatoryStateMachine {
    return this.state;
  }

  /**
   * 当前 HTTP 监听端口（需已 `ensureServerStarted`）。
   */
  getListenPort(): number {
    return this.server?.listenPort ?? 3800;
  }

  getStore(workspaceRoot: string): ObservatoryStore | undefined {
    return this.folders.get(path.normalize(workspaceRoot))?.store;
  }

  getSession(workspaceRoot: string): FolderSession | undefined {
    return this.folders.get(path.normalize(workspaceRoot));
  }

  isServerRunning(): boolean {
    return this.server !== undefined;
  }

  async ensureServerStarted(): Promise<void> {
    if (this.server) return;
    const cfg = vscode.workspace.getConfiguration();
    const port = cfg.get<number>("observatory.server.port", 3800);
    const webviewDist = path.join(
      this.context.extensionPath,
      "dist",
      "webview-ui"
    );
    this.server = new LocalServer(
      port,
      (r) => this.getStore(r),
      fs.existsSync(webviewDist) ? webviewDist : undefined,
      () => [...this.folders.keys()]
    );
    await this.server.start();
    this.output.appendLine(
      `[Observatory] HTTP server listening on ${this.server.address}`
    );
  }

  async activate(): Promise<void> {
    this.state.beginInitializing();
    const cfg = vscode.workspace.getConfiguration();
    const autoStart = cfg.get<boolean>("observatory.server.autoStart", true);
    let degraded = false;
    if (autoStart) {
      try {
        await this.ensureServerStarted();
      } catch (e) {
        this.output.appendLine(`[Observatory] HTTP server failed: ${String(e)}`);
        degraded = true;
      }
    }

    const broadcastDataChanged = (): void => {
      this.server?.broadcast({ type: "refresh", scope: "all" });
      this.treeRefresh?.();
    };

    new TerminalWatcher({
      output: this.output,
      getStore: (root) => this.getStore(root),
      workspaceRoots: () => [...this.folders.keys()],
      onDataChanged: broadcastDataChanged,
      isAutoIngestTestReportEnabled: () => readAutoIngestTestReportEnabled(),
    }).register(this.context);

    new SddTestReportWatcher({
      output: this.output,
      getStore: (root) => this.getStore(root),
      onDataChanged: broadcastDataChanged,
      isAutoIngestTestReportEnabled: () => readAutoIngestTestReportEnabled(),
    }).register(this.context);

    for (const wf of vscode.workspace.workspaceFolders ?? []) {
      degraded = (await this.addFolder(wf)) || degraded;
    }

    if (degraded) {
      this.state.markDegraded();
    } else {
      this.state.markReady();
    }

    this.context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        for (const f of e.added) void this.addFolder(f);
        for (const f of e.removed) this.removeFolder(f);
      })
    );
  }

  /**
   * @returns 是否因初始化/扫描失败而应进入 DEGRADED
   */
  private async addFolder(folder: vscode.WorkspaceFolder): Promise<boolean> {
    const key = path.normalize(folder.uri.fsPath);
    if (this.folders.has(key)) return false;

    let failed = false;
    const store = new ObservatoryStore(key);
    try {
      await store.initialize();
    } catch (e) {
      this.output.appendLine(
        `[Observatory] store.initialize failed for ${key}: ${String(e)}`
      );
      return true;
    }
    try {
      await store.pruneExpiredData();
    } catch {
      /* ignore */
    }

    const session = new FolderSession(
      folder,
      store,
      this.context,
      () => {
        this.server?.broadcast({ type: "refresh", scope: "all" });
        this.treeRefresh?.();
      }
    );
    await session.registerWatchers();
    this.folders.set(key, session);
    try {
      await session.runFullScanCommand();
    } catch (e) {
      this.output.appendLine(
        `[Observatory] initial scan failed for ${key}: ${String(e)}`
      );
      failed = true;
    }
    return failed;
  }

  /**
   * 用户触发的全量扫描：SCANNING → READY / DEGRADED。
   * @returns 最后一个工作区文件夹的 SDD 摘要（多根时仅取最后一次扫描结果）。
   */
  async runFullScanAllFolders(): Promise<RunFullScanSddSummary | undefined> {
    this.state.beginScanning();
    let last: RunFullScanSddSummary | undefined;
    try {
      for (const wf of vscode.workspace.workspaceFolders ?? []) {
        const session = this.getSession(wf.uri.fsPath);
        if (session) {
          last = await session.runFullScanCommand();
        }
      }
      this.state.markReady();
    } catch (e) {
      this.output.appendLine(`[Observatory] full scan failed: ${String(e)}`);
      this.state.markDegraded();
      throw e;
    }
    return last;
  }

  private removeFolder(folder: vscode.WorkspaceFolder): void {
    this.folders.delete(path.normalize(folder.uri.fsPath));
  }

  get serverAddress(): string | undefined {
    return this.server?.address;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.server?.stop();
    this.server = undefined;
    this.folders.clear();
  }
}
