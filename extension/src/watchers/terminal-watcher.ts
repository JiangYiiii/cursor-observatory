/**
 * Terminal shell execution → 测试报告自动导入（pytest / JUnit Surefire XML）+ 相关命令日志。
 */
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import {
  resolveSddReportJsonAbsPath,
  SDD_TEST_REPORT_JSON,
} from "../observatory/sdd-test-paths";
import type { ObservatoryStore } from "../observatory/store";
import { ingestMergedJUnitXml, ingestTestReportText } from "../quality/ingest-test-report";
import {
  markTestReportIngested,
  shouldSkipRecentTestReportIngest,
} from "./test-report-ingest-dedupe";
import {
  collectFreshSurefireXmlFiles,
  findTestReportFile,
  isGradleTestCommand,
  isMavenTestCommand,
  isPytestShellCommand,
  projectRootFromReportFile,
  readFreshTestReport,
} from "./terminal-test-report-ingest";

export interface TerminalWatcherDeps {
  output: vscode.OutputChannel;
  /** 已注册的 Observatory 工作区根路径（normalize 后）→ Store */
  getStore: (workspaceRoot: string) => ObservatoryStore | undefined;
  workspaceRoots: () => string[];
  onDataChanged: () => void;
  isAutoIngestTestReportEnabled: () => boolean;
}

function pickWorkspaceRoot(
  cwdFsPath: string | undefined,
  workspaceRoots: string[]
): string | undefined {
  if (workspaceRoots.length === 0) return undefined;
  if (!cwdFsPath) return workspaceRoots[0];
  const n = path.normalize(cwdFsPath);
  const sorted = [...workspaceRoots].sort((a, b) => b.length - a.length);
  for (const r of sorted) {
    const rn = path.normalize(r);
    if (n === rn || n.startsWith(rn + path.sep)) return rn;
  }
  return workspaceRoots[0];
}

export class TerminalWatcher {
  constructor(private readonly deps: TerminalWatcherDeps) {}

  register(context: vscode.ExtensionContext): void {
    const win = vscode.window as unknown as {
      onDidStartTerminalShellExecution?: (
        cb: (e: vscode.TerminalShellExecutionStartEvent) => void
      ) => vscode.Disposable;
      onDidEndTerminalShellExecution?: (
        cb: (e: vscode.TerminalShellExecutionEndEvent) => void
      ) => vscode.Disposable;
    };

    if (typeof win.onDidStartTerminalShellExecution === "function") {
      context.subscriptions.push(
        win.onDidStartTerminalShellExecution((e) => {
          const cmd = e.execution?.commandLine?.value ?? "";
          if (!this.isRelevant(cmd)) return;
          this.deps.output.appendLine(`[terminal] ${cmd}`);
        })
      );
    }

    if (typeof win.onDidEndTerminalShellExecution === "function") {
      context.subscriptions.push(
        win.onDidEndTerminalShellExecution((e) => {
          void this.onShellExecutionEnded(e).catch((err) => {
            this.deps.output.appendLine(
              `[terminal] ingest error: ${String(err)}`
            );
          });
        })
      );
    }
  }

  private async onShellExecutionEnded(
    e: vscode.TerminalShellExecutionEndEvent
  ): Promise<void> {
    if (!this.deps.isAutoIngestTestReportEnabled()) return;

    const cmd = e.execution.commandLine.value ?? "";
    const cwd = e.execution.cwd?.fsPath;
    const roots = this.deps.workspaceRoots();

    if (isPytestShellCommand(cmd)) {
      await this.ingestAfterPytest(cwd, roots);
      return;
    }
    if (isMavenTestCommand(cmd) || isGradleTestCommand(cmd)) {
      await this.ingestAfterJavaTest(cwd, roots);
    }
  }

  private async ingestAfterPytest(
    cwd: string | undefined,
    roots: string[]
  ): Promise<void> {
    const reportPath = findTestReportFile(cwd, roots);
    if (!reportPath) {
      this.deps.output.appendLine(
        "[terminal] pytest 已结束，未找到 SDD 下 specs/<active>/observatory/report.json（或 test/ 兼容路径、pytest-report.json）或 .observatory 下报告"
      );
      return;
    }

    if (shouldSkipRecentTestReportIngest(reportPath)) {
      this.deps.output.appendLine(
        `[terminal] 跳过 pytest 报告导入（去重）: ${reportPath}`
      );
      return;
    }

    const projectRoot = path.normalize(projectRootFromReportFile(reportPath));
    const store = this.deps.getStore(projectRoot);
    if (!store) {
      this.deps.output.appendLine(
        `[terminal] 测试报告在 ${reportPath}，但工作区未注册 Observatory：${projectRoot}`
      );
      return;
    }

    const text = await readFreshTestReport(reportPath);
    if (!text) {
      this.deps.output.appendLine(
        `[terminal] 跳过导入：${reportPath} 不存在、未就绪，或文件过旧（>2min）`
      );
      return;
    }

    try {
      await ingestTestReportText(store, text, { format: "auto" });
      markTestReportIngested(reportPath);
      this.deps.output.appendLine(`[terminal] 已自动导入测试报告: ${reportPath}`);
      this.deps.onDataChanged();
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Observatory: 自动导入测试报告失败 — ${String(err)}`
      );
    }
  }

  private async ingestAfterJavaTest(
    cwd: string | undefined,
    roots: string[]
  ): Promise<void> {
    const workspaceRoot = pickWorkspaceRoot(cwd, roots);
    if (!workspaceRoot) return;

    const reportPath = findTestReportFile(cwd, roots);
    if (reportPath && !shouldSkipRecentTestReportIngest(reportPath)) {
      const projectRoot = path.normalize(projectRootFromReportFile(reportPath));
      const storeForJson = this.deps.getStore(projectRoot);
      if (storeForJson) {
        const text = await readFreshTestReport(reportPath);
        if (text) {
          try {
            await ingestTestReportText(storeForJson, text, { format: "auto" });
            markTestReportIngested(reportPath);
            const sddJson = resolveSddReportJsonAbsPath(workspaceRoot);
            if (
              sddJson &&
              path.normalize(sddJson) !== path.normalize(reportPath)
            ) {
              markTestReportIngested(sddJson);
            }
            this.deps.output.appendLine(
              `[terminal] 已自动导入测试报告（SDD JSON 优先于 JUnit XML）: ${reportPath}`
            );
            this.deps.onDataChanged();
            return;
          } catch (err) {
            void vscode.window.showErrorMessage(
              `Observatory: 自动导入测试报告失败 — ${String(err)}`
            );
          }
        }
      } else if (reportPath) {
        this.deps.output.appendLine(
          `[terminal] 测试报告在 ${reportPath}，但工作区未注册 Observatory：${projectRoot}`
        );
      }
    }

    const xmlFiles = await collectFreshSurefireXmlFiles(workspaceRoot);
    if (xmlFiles.length === 0) {
      this.deps.output.appendLine(
        "[terminal] mvn/gradle test 已结束：无新鲜 SDD report.json（或已跳过），且未在 2min 内找到 **/target/surefire-reports/TEST-*.xml 或 **/build/test-results/test/TEST-*.xml"
      );
      return;
    }

    const store = this.deps.getStore(workspaceRoot);
    if (!store) {
      this.deps.output.appendLine(
        `[terminal] Surefire XML 已生成，但工作区未注册 Observatory：${workspaceRoot}`
      );
      return;
    }

    const markPath =
      resolveSddReportJsonAbsPath(workspaceRoot) ??
      path.join(workspaceRoot, ".observatory", SDD_TEST_REPORT_JSON);
    if (shouldSkipRecentTestReportIngest(markPath)) {
      this.deps.output.appendLine(
        `[terminal] 跳过 JUnit XML 导入（去重）: ${markPath}`
      );
      return;
    }

    try {
      const parts = await Promise.all(
        xmlFiles.map(async (f) => ({
          xml: await fsp.readFile(f, "utf8"),
          sourceHint: f,
        }))
      );
      await ingestMergedJUnitXml(store, parts);
      markTestReportIngested(markPath);
      this.deps.output.appendLine(
        `[terminal] 已自动导入 JUnit XML（${parts.length} 个文件）`
      );
      this.deps.onDataChanged();
    } catch (err) {
      void vscode.window.showErrorMessage(
        `Observatory: 自动导入 JUnit 报告失败 — ${String(err)}`
      );
    }
  }

  private isRelevant(command: string): boolean {
    const c = command.toLowerCase();
    return (
      c.includes("pytest") ||
      c.includes("npm test") ||
      c.includes("vitest") ||
      c.includes("jest") ||
      isMavenTestCommand(command) ||
      isGradleTestCommand(command)
    );
  }
}
