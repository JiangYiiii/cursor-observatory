/**
 * Cursor Observatory — Extension entry.
 * primary_doc: docs/EXTENSION_DESIGN.md
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { ingestTestReportText } from "./quality/ingest-test-report";
import {
  resolveTestStack,
  runTestsHintForStack,
  type TestFrameworkSetting,
} from "./workspace/detect-test-stack";
import { runConfigureSddIntegration } from "./observatory/configure-sdd-integration";
import {
  ensureObservatoryCursorRule,
  openDataModelAiPromptDocument,
} from "./observatory/project-onboarding";
import { extraMessageForSddSummary } from "./sdd-scan-messages";
import { CapabilityTreeProvider } from "./tree/capability-tree-provider";
import { openObservatoryDashboardPanel } from "./webview/panel-provider";
import { resolveSddFeatureObservatoryDir } from "./observatory/sdd-test-paths";
import { ObservatoryRegistry } from "./workspace/observatory-registry";

const CMD = {
  initialize: "observatory.initialize",
  openDashboard: "observatory.openDashboard",
  runFullScan: "observatory.runFullScan",
  runTests: "observatory.runTests",
  ingestPytestReport: "observatory.ingestPytestReport",
  showInDashboard: "observatory.showInDashboard",
  openDataModelAiPrompt: "observatory.openDataModelAiPrompt",
  configureSdd: "observatory.configureSdd",
} as const;

let registry: ObservatoryRegistry | undefined;

export async function activate(
  context: vscode.ExtensionContext
): Promise<void> {
  const output = vscode.window.createOutputChannel("Observatory");
  context.subscriptions.push(output);

  registry = new ObservatoryRegistry(context, output);
  const treeProvider = new CapabilityTreeProvider(
    () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    (r) => registry!.getStore(r)
  );
  registry.setTreeRefresh(() => treeProvider.refresh());

  const treeView = vscode.window.createTreeView("observatory.capabilities", {
    treeDataProvider: treeProvider,
  });
  context.subscriptions.push(treeView);

  await registry.activate();
  context.subscriptions.push(registry);

  const getPrimaryRoot = (): string | undefined =>
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

  const ingestPytestReport = async (): Promise<void> => {
    const root = getPrimaryRoot();
    if (!root) {
      void vscode.window.showWarningMessage(
        "Observatory: 请先打开一个工作区文件夹。"
      );
      return;
    }
    const session = registry!.getSession(root);
    if (!session) {
      void vscode.window.showWarningMessage("Observatory: 工作区未注册。");
      return;
    }
    const sddObs = resolveSddFeatureObservatoryDir(root);
    const defaultUri = vscode.Uri.file(sddObs ?? path.join(root, ".observatory"));
    try {
      await fs.access(defaultUri.fsPath);
    } catch {
      await session.store.initialize();
    }
    const picked = await vscode.window.showOpenDialog({
      defaultUri,
      canSelectFiles: true,
      canSelectMany: false,
      filters: {
        "Test reports": ["json", "xml"],
        JSON: ["json"],
        XML: ["xml"],
      },
      title: "选择测试报告（pytest JSON、规范化 report.json 或 JUnit / Surefire XML）",
    });
    const file = picked?.[0];
    if (!file) return;
    try {
      const text = await fs.readFile(file.fsPath, "utf8");
      await ingestTestReportText(session.store, text, { format: "auto" });
      void vscode.window.showInformationMessage(
        "Observatory: 已更新 report.json（及 test-results.json）、test-mapping.json，并追加 test-history.jsonl。"
      );
      treeProvider.refresh();
    } catch (e) {
      void vscode.window.showErrorMessage(
        `Observatory: 导入失败 — ${String(e)}`
      );
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(CMD.initialize, async () => {
      const folders = vscode.workspace.workspaceFolders ?? [];
      if (folders.length === 0) {
        void vscode.window.showWarningMessage(
          "Observatory: 请先打开一个工作区文件夹。"
        );
        return;
      }
      try {
        let createdRule = false;
        const ruleOn = vscode.workspace
          .getConfiguration()
          .get<boolean>("observatory.onboarding.createCursorRule", true);
        for (const wf of folders) {
          const session = registry!.getSession(wf.uri.fsPath);
          if (session) {
            await session.store.initialize();
            if (ruleOn && (await ensureObservatoryCursorRule(wf.uri.fsPath))) {
              createdRule = true;
            }
          }
        }
        const sddSummary = await registry!.runFullScanAllFolders();
        let msg = "Observatory 已初始化并完成扫描。";
        if (createdRule) {
          msg += " 已添加 .cursor/rules/observatory-project.mdc。";
        }
        const extra = extraMessageForSddSummary(sddSummary);
        if (extra) msg += ` ${extra}`;
        void vscode.window.showInformationMessage(msg);
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Observatory 初始化失败：${String(e)}`
        );
      }
    }),
    vscode.commands.registerCommand(CMD.openDashboard, async () => {
      const root = getPrimaryRoot();
      if (!root) {
        void vscode.window.showWarningMessage(
          "Observatory: 请先打开一个工作区文件夹。"
        );
        return;
      }
      try {
        await registry!.ensureServerStarted();
      } catch (e) {
        void vscode.window.showErrorMessage(
          `Observatory: 无法启动本地服务 — ${String(e)}`
        );
        return;
      }
      const port = registry!.getListenPort();
      openObservatoryDashboardPanel(port, root);
    }),
    vscode.commands.registerCommand(CMD.runFullScan, async () => {
      try {
        const sddSummary = await registry!.runFullScanAllFolders();
        let msg = "Observatory: 全量扫描完成。";
        const extra = extraMessageForSddSummary(sddSummary);
        if (extra) msg += ` ${extra}`;
        void vscode.window.showInformationMessage(msg);
      } catch (e) {
        void vscode.window.showErrorMessage(`Observatory: ${String(e)}`);
      }
    }),
    vscode.commands.registerCommand(CMD.runTests, () => {
      const root = getPrimaryRoot();
      const fw = vscode.workspace
        .getConfiguration("observatory")
        .get<TestFrameworkSetting>("test.framework", "auto");
      const stack = root
        ? resolveTestStack(root, fw)
        : "unknown";
      const hint = runTestsHintForStack(stack);
      void vscode.window.showInformationMessage(`Observatory: ${hint}`);
    }),
    vscode.commands.registerCommand(CMD.ingestPytestReport, () => {
      void ingestPytestReport();
    }),
    vscode.commands.registerCommand(CMD.showInDashboard, () => {
      void vscode.commands.executeCommand(CMD.openDashboard);
    }),
    vscode.commands.registerCommand(CMD.configureSdd, async () => {
      const root = getPrimaryRoot();
      if (!root) {
        void vscode.window.showWarningMessage(
          "Observatory: 请先打开一个工作区文件夹。"
        );
        return;
      }
      try {
        await runConfigureSddIntegration(root);
      } catch (e) {
        void vscode.window.showErrorMessage(`Observatory: ${String(e)}`);
      }
    }),
    vscode.commands.registerCommand(CMD.openDataModelAiPrompt, async () => {
      const root = getPrimaryRoot();
      if (!root) {
        void vscode.window.showWarningMessage(
          "Observatory: 请先打开一个工作区文件夹。"
        );
        return;
      }
      try {
        await openDataModelAiPromptDocument(root);
        void vscode.window.showInformationMessage(
          "Observatory: 已打开 .observatory/DATA_MODEL_AI_PROMPT.md。将 AI 生成的 JSON 保存为 data-models.json 后执行 Run Full Scan。"
        );
      } catch (e) {
        void vscode.window.showErrorMessage(`Observatory: ${String(e)}`);
      }
    })
  );
}

export function deactivate(): void {
  registry = undefined;
}
