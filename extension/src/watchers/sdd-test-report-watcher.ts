/**
 * 监听 specs 下各 feature 的 observatory|test/report.json 变更，在集成终端之外写入/保存规范化结果时自动导入（与 Import Test Report 同 pipeline）。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import type { ObservatoryStore } from "../observatory/store";
import { ingestTestReportText } from "../quality/ingest-test-report";
import {
  markTestReportIngested,
  shouldSkipRecentTestReportIngest,
} from "./test-report-ingest-dedupe";
import { projectRootFromReportFile } from "./terminal-test-report-ingest";

export interface SddTestReportWatcherDeps {
  output: vscode.OutputChannel;
  getStore: (workspaceRoot: string) => ObservatoryStore | undefined;
  onDataChanged: () => void;
  isAutoIngestTestReportEnabled: () => boolean;
}

export class SddTestReportWatcher {
  private readonly debounceTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly deps: SddTestReportWatcherDeps) {}

  register(context: vscode.ExtensionContext): void {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      this.registerFolder(context, folder);
    }
    context.subscriptions.push(
      vscode.workspace.onDidChangeWorkspaceFolders((e) => {
        for (const folder of e.added) {
          this.registerFolder(context, folder);
        }
      })
    );
    context.subscriptions.push({
      dispose: () => {
        for (const t of this.debounceTimers.values()) clearTimeout(t);
        this.debounceTimers.clear();
      },
    });
  }

  private registerFolder(
    context: vscode.ExtensionContext,
    folder: vscode.WorkspaceFolder
  ): void {
    const patterns = [
      "**/specs/**/observatory/report.json",
      "**/specs/**/test/report.json",
    ];
    const schedule = (uri: vscode.Uri): void => {
      const fp = uri.fsPath;
      const prev = this.debounceTimers.get(fp);
      if (prev) clearTimeout(prev);
      const debounceMs = vscode.workspace
        .getConfiguration("observatory")
        .get<number>("scan.debounceMs", 5000);
      this.debounceTimers.set(
        fp,
        setTimeout(() => {
          this.debounceTimers.delete(fp);
          void this.onReportFileReady(fp);
        }, debounceMs)
      );
    };
    for (const glob of patterns) {
      const w = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, glob)
      );
      w.onDidChange(schedule);
      w.onDidCreate(schedule);
      context.subscriptions.push(w);
    }
  }

  private async onReportFileReady(filePath: string): Promise<void> {
    if (!this.deps.isAutoIngestTestReportEnabled()) return;
    if (shouldSkipRecentTestReportIngest(filePath)) {
      this.deps.output.appendLine(
        `[watcher] 跳过 test report 导入（去重）: ${filePath}`
      );
      return;
    }
    let text: string;
    try {
      text = await fs.readFile(filePath, "utf8");
    } catch (e) {
      this.deps.output.appendLine(
        `[watcher] 无法读取 ${filePath}: ${String(e)}`
      );
      return;
    }
    if (!text.trim()) return;

    const projectRoot = path.normalize(projectRootFromReportFile(filePath));
    const store = this.deps.getStore(projectRoot);
    if (!store) {
      this.deps.output.appendLine(
        `[watcher] ${filePath} 所属工作区未注册 Observatory：${projectRoot}`
      );
      return;
    }

    try {
      await ingestTestReportText(store, text, { format: "auto" });
      markTestReportIngested(filePath);
      this.deps.output.appendLine(`[watcher] 已自动导入 test report: ${filePath}`);
      this.deps.onDataChanged();
    } catch (e) {
      this.deps.output.appendLine(
        `[watcher] 导入失败 ${filePath}: ${String(e)}`
      );
    }
  }
}
