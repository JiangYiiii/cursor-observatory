/**
 * 初始化时写入 Cursor Rule、数据模型 AI 引导文案。
 * primary_doc: docs/USER_GUIDE.md
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

const RULE_FILENAME = "observatory-project.mdc";

const RULE_BODY = [
  "---",
  "description: Observatory 能力与数据约定 — 初始化由 Cursor Observatory 扩展写入",
  "globs:",
  '  - "**/*"',
  "---",
  "",
  "# Observatory 项目协作",
  "",
  "## 能力（Capability）",
  "",
  "- 能力 ID 建议在 `docs/00-meta/ai-doc-index.json` 或代码注解中与 `business_doc_id` 对齐。",
  "- 开发过程中可在 Git 提交说明中**单独一行**写明要标记为「已发布」的能力，例如：",
  "  `Observatory: your-capability-id`",
  "  或 `能力: your-capability-id`（多个用英文逗号分隔）。",
  "- AI 会话会被扩展监听（需在设置中配置 **Agent 转录目录**），用于推断能力阶段（设计 / 开发 / 测试等）。",
  "- **SDD**（`specs/<feature>/` 含 spec/sketch）：看板阶段由文档扫描驱动；`tasks.md` 全勾选后默认为「测试中」，若声明「无需单独测试」（`observatory-sdd.json` 或 plan/tasks 中勾选行，见 Configure SDD 规则）则直接「已完成」。导入测试结果可将「测试中」的 SDD 标为「已完成」（`observatory.capability.sddTestingCompleteOnTestPass`，旧键 `sddTestingCompleteOnPytestPass` 仍兼容）。",
  "",
  "## 数据模型",
  "",
  "- 项目内使用 `.observatory/data-models.json`；若自动扫描不准，请用命令 **Observatory: Open Data Model AI Prompt** 生成提示词，让 AI 输出符合 SCHEMA 的 JSON 后保存到该文件。",
  "",
  "## 测试",
  "",
  "- **Python**：`pytest-json-report` 可写到 **`specs/<active>/observatory/pytest-report.json`**；扩展将规范化结果写入 **`observatory/report.json`**（与同目录 `test-results.json` 同步；目录建议 gitignore）。**Java**：`mvn test` / `gradlew test` 后扩展可聚合 Surefire XML。使用 **Observatory: Import Test Report** 可手动导入 JSON/XML。`by_capability` 齐全时可将「测试中」标为「已完成」（未提交 Git 前的完工态）。兼容旧路径 **`specs/<active>/test/`**。",
  "",
].join("\n");

export function getDataModelAiPromptMarkdown(): string {
  return [
    "# Observatory — 数据模型 JSON（给 AI 的说明）",
    "",
    "请根据当前项目的数据库/DDL 业务含义，生成 **一个** 符合 Observatory 约定的 JSON 文档，用于写入工作区 `.observatory/data-models.json`。",
    "",
    "## 输出要求",
    "",
    '1. 顶层字段：`schema_version`（如 `"1.0.0"`）、`generated_at`（ISO 时间）、`source_files`（字符串数组，可填你参考的 SQL/文档路径）、`tables`、`relationships`。',
    "2. 每个 **table** 包含：`name`、`schema`、`description`（可选）、`columns`（每项含 `name`, `type`, `nullable`, `primary_key` 等）、`indexes`、`foreign_keys`。",
    "3. **relationships** 中描述表间关系：`from_table`, `from_column`, `to_table`, `to_column`, `type`（如 `many_to_one`）。",
    "4. 只输出 **合法 JSON**，不要 Markdown 代码块以外的解释；若信息不足，用 `description` 标注「待补充」。",
    "",
    "## 项目上下文（请用户或 AI 自行补充）",
    "",
    "- 数据库类型（PostgreSQL / MySQL / SQLite 等）：",
    "- 核心业务名词：",
    "",
    "---",
    "",
    "生成后：将内容保存为 `<工作区>/.observatory/data-models.json`，然后在 Cursor 中执行 **Observatory: Run Full Scan** 或重载仪表盘。",
    "",
  ].join("\n");
}

/**
 * 在 `.cursor/rules/` 下创建 Observatory 规则（不存在则写入）。
 */
export async function ensureObservatoryCursorRule(
  workspaceRoot: string
): Promise<boolean> {
  const rulesDir = path.join(workspaceRoot, ".cursor", "rules");
  const target = path.join(rulesDir, RULE_FILENAME);
  try {
    await fs.mkdir(rulesDir, { recursive: true });
    try {
      await fs.access(target);
      return false;
    } catch {
      /* create */
    }
    await fs.writeFile(target, RULE_BODY, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** 写入 `.observatory/DATA_MODEL_AI_PROMPT.md` 并打开，便于用户复制到 AI 对话。 */
export async function openDataModelAiPromptDocument(
  workspaceRoot: string
): Promise<void> {
  const dir = path.join(workspaceRoot, ".observatory");
  await fs.mkdir(dir, { recursive: true });
  const fp = path.join(dir, "DATA_MODEL_AI_PROMPT.md");
  await fs.writeFile(fp, getDataModelAiPromptMarkdown(), "utf8");
  const doc = await vscode.workspace.openTextDocument(fp);
  await vscode.window.showTextDocument(doc);
}
