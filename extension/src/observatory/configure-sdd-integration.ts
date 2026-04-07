/**
 * Observatory: Configure SDD Integration — 检测与规则引导。
 * primary_doc: docs/SDD_INTEGRATION_DESIGN.md §七
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { detectSddStatus } from "../scanners/sdd/detect";

const SDD_RULE_FILENAME = "sdd-integration.mdc";

const SDD_RULE_BODY = [
  "---",
  "description: SDD 集成约定 — Observatory × Spec-Driven Development",
  "globs:",
  '  - "specs/**"',
  "---",
  "",
  "# SDD 集成约定",
  "",
  "## 产物目录",
  "",
  "所有 SDD 产物存放在 `specs/<feature-name>/` 下，Observatory 会监听此目录并自动更新能力看板。",
  "",
  "## 测试报告（测试阶段）",
  "",
  "- 规范化结果在 **`specs/<feature>/observatory/report.json`**（与同目录 **`test-results.json`** 同步；目录建议 gitignore，仅本机）。Python 可将 **pytest-json-report** 原始输出写到 **`pytest-report.json`**。Java 可使用 **`mvn test` / `gradlew test`**，扩展可聚合 Surefire **`TEST-*.xml`**。",
  "- 扩展可从集成终端自动导入；亦可 **Observatory: Import Test Report** 手动选择 JSON/XML。",
  "- 无 `.active` 或非 SDD 时，可退回到仓库根 **`.observatory/report.json`**（及兼容旧名）。兼容读取旧路径 **`specs/<feature>/test/`**、**`specs/<feature>/.observatory/`**；**新产出请用 `observatory/`**。",
  "",
  "## 阶段流转",
  "",
  "能力看板阶段由 SDD 产物自动驱动：",
  "- `spec.md` 创建 → planning",
  "- `plan.md` 创建 → designing",
  "- `tasks.md` 创建 → developing",
  "- `tasks.md` 全部勾选：默认 → testing；若声明「无需单独测试」→ 直接 completed（见下）",
  "- 处于 testing 且测试结果按能力通过（`by_capability`）→ completed（可关 `observatory.capability.sddTestingCompleteOnTestPass`）",
  "- Git 提交标记 `Observatory: <id>` → released（可选，仅当你需要「已发布」语义时）",
  "",
  "### 无需测试时直接「已完成」",
  "",
  "任选其一即可（全量扫描时读取）：",
  "- `specs/<feature>/observatory-sdd.json`：`{ \"skipTestingAfterTasks\": true }`",
  "- 在 `plan.md` 或 `tasks.md` 中加一行已勾选：`- [x] 无需单独测试`（或 `NO_TEST_PHASE` / `Observatory: skip-testing`）",
  "",
  "### 显式声明阶段（declaredPhase）",
  "",
  "在 `observatory-sdd.json` 中可设置 `declaredPhase`，**优先于**由 spec/plan/tasks 推断的阶段；全量扫描会保留该值（例如任务全勾后仍希望看板显示 `completed` 而非默认的 `testing`）。",
  "合法值：`planning`、`designing`、`developing`、`testing`、`completed`、`released`、`deprecated`。示例：`{ \"declaredPhase\": \"completed\" }`。",
  "",
  "AI 应在开发中（developing）持续实现 `tasks.md`，跑测或勾选「无需测试」后执行 **Run Full Scan** 刷新看板。",
  "",
  "对于 SDD feature：",
  "- 不允许在前端手动拖拽修改阶段",
  "- 阶段由 `specs/` 扫描与（可选）测试结果导入、`Observatory:` 提交共同更新",
  "",
  "## 唯一标识",
  "",
  "- 每个 SDD feature 在 `specs/<feature>/.capability-id` 中保存稳定的 `Capability.id`",
  "- 推荐格式：`sdd:<feature-slug>`",
  "- feature 目录可重命名，但 `Capability.id` 不变",
  "- `Observatory: <id>` 必须使用该稳定 ID，而不是目录名",
  "",
  "## Bug 处理",
  "",
  "使用 `/bugfix <feature-name>` 触发 Bug 修复流程：",
  "1. AI 加载该 feature 的全套 SDD 产物",
  "2. 归因分析（SPEC_GAP / DESIGN_FLAW / TASK_MISS / IMPL_DEVIATION / IMPL_BUG）",
  "3. 从根因层开始级联修复",
  "4. 记录到 `specs/<feature>/bugfix-log.md`",
  "",
  "## 命令速查",
  "",
  "| 命令 | 作用 |",
  "|------|------|",
  "| `/specify` 或 `/sdd-specify` | 需求固化 → spec.md |",
  "| `/sketch` | 轻量规划 → sketch.md |",
  "| `/plan` | 技术方案 → plan.md |",
  "| `/tasks` | 任务拆解 → tasks.md |",
  "| `/implement` | 按 tasks.md 实现 |",
  "| `/analyze` | 产物一致性检查 |",
  "| `/bugfix` | Bug 归因 + 修复 |",
  "",
].join("\n");

export async function ensureSddIntegrationRule(
  workspaceRoot: string
): Promise<boolean> {
  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  const target = path.join(rulesDir, SDD_RULE_FILENAME);
  try {
    await fs.mkdir(rulesDir, { recursive: true });
    try {
      await fs.access(target);
      return false;
    } catch {
      /* create */
    }
    await fs.writeFile(target, SDD_RULE_BODY, "utf8");
    return true;
  } catch {
    return false;
  }
}

export async function ensureSpecsDir(workspaceRoot: string): Promise<void> {
  const specs = path.join(workspaceRoot, "specs");
  await fs.mkdir(specs, { recursive: true });
}

const GITIGNORE_OBSERVATORY_LINE = "specs/**/observatory/";

/**
 * 若存在 `specs/` 且根目录 `.gitignore` 尚未忽略每特性 `observatory/`，则追加规则（便于测试报告等仅本机保存）。
 * @returns 是否写入了新内容
 */
export async function ensureSddObservatoryGitignore(
  workspaceRoot: string
): Promise<boolean> {
  const specsPath = path.join(workspaceRoot, "specs");
  try {
    const st = await fs.stat(specsPath);
    if (!st.isDirectory()) return false;
  } catch {
    return false;
  }

  const gitignorePath = path.join(workspaceRoot, ".gitignore");
  let content = "";
  try {
    content = await fs.readFile(gitignorePath, "utf8");
  } catch {
    /* 将创建 */
  }

  if (
    content.includes(GITIGNORE_OBSERVATORY_LINE) ||
    /\bspecs\/\*\/observatory\//.test(content)
  ) {
    return false;
  }

  const block = [
    "",
    "# SDD 每特性本地 Observatory 产物（测试报告等，仅本机）",
    GITIGNORE_OBSERVATORY_LINE,
  ].join("\n");
  const next =
    content.length === 0
      ? block.replace(/^\n/, "")
      : (content.endsWith("\n") ? content : `${content}\n`) + block;
  await fs.writeFile(gitignorePath, next, "utf8");
  return true;
}

/**
 * 命令面板：Configure SDD Integration。
 */
export async function runConfigureSddIntegration(
  workspaceRoot: string
): Promise<void> {
  const det = await detectSddStatus(workspaceRoot);

  await ensureSddObservatoryGitignore(workspaceRoot);

  if (det.status === "full") {
    const msg = `当前项目已配置 SDD（${det.featureCount} 个 feature，规则或插件已就绪）。`;
    const openSpecs = "打开 specs 目录";
    const r = await vscode.window.showInformationMessage(
      msg,
      openSpecs,
      "关闭"
    );
    if (r === openSpecs) {
      const uri = vscode.Uri.file(path.join(workspaceRoot, "specs"));
      try {
        await fs.access(uri.fsPath);
        await vscode.commands.executeCommand("revealInExplorer", uri);
      } catch {
        void vscode.window.showWarningMessage("specs/ 目录不存在。");
      }
    }
    return;
  }

  if (det.status === "partial") {
    const msg =
      "检测到 SDD 相关目录或规则不完整：可写入 `sdd-integration.mdc` 并确保已安装 context-hub SDD 插件。";
    const writeRule = "写入 sdd-integration 规则";
    const r = await vscode.window.showWarningMessage(msg, writeRule, "取消");
    if (r === writeRule) {
      const created = await ensureSddIntegrationRule(workspaceRoot);
      void vscode.window.showInformationMessage(
        created
          ? "已创建 .cursor/rules/sdd-integration.mdc"
          : "规则已存在或未写入。"
      );
    }
    return;
  }

  const msg =
    "当前工作区未发现 SDD（无 specs/ 下的 spec/sketch）。是否创建 specs/ 并写入集成规则？";
  const yes = "创建并写入规则";
  const r = await vscode.window.showInformationMessage(msg, yes, "取消");
  if (r === yes) {
    await ensureSpecsDir(workspaceRoot);
    await ensureSddObservatoryGitignore(workspaceRoot);
    await ensureSddIntegrationRule(workspaceRoot);
    void vscode.window.showInformationMessage(
      "已创建 specs/、.gitignore 规则（如需要）与 .cursor/rules/sdd-integration.mdc。请使用 /specify 或 SDD 插件开始第一个 feature。"
    );
  }
}
