/**
 * Prompt 模板加载：templateDir → 内置占位（完整默认由前端 prompt-generators 兜底）
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";

function expandWorkspaceFolder(raw: string, workspaceRoot: string): string {
  return raw.replace(/\$\{workspaceFolder\}/g, workspaceRoot);
}

const STAGE_TO_FILENAME: Record<string, string> = {
  specify: "specify.md",
  plan: "plan.md",
  tasks: "tasks.md",
  implement: "implement.md",
  analyze: "analyze.md",
  "impact-analysis": "impact-analysis.md",
  "ut-test": "ut-test.md",
  "code-submit": "code-submit.md",
  deploy: "deploy.md",
  "test-case": "test-case.md",
};

/**
 * 返回模板文件内容；未配置或未找到时返回空字符串（调用方使用内置默认）。
 */
export async function loadPromptTemplate(
  workspaceRoot: string,
  stage: string
): Promise<{ content: string; source: string }> {
  if (!/^[\w-]+$/.test(stage)) {
    return { content: "", source: "invalid-stage" };
  }
  const cfg = vscode.workspace.getConfiguration("observatory");
  const dirRaw = cfg.get<string>("prompt.templateDir")?.trim() ?? "";
  const fileName = STAGE_TO_FILENAME[stage] ?? `${stage}.md`;
  if (dirRaw) {
    const dir = expandWorkspaceFolder(dirRaw, workspaceRoot);
    const abs = path.join(dir, fileName);
    try {
      const content = await fs.readFile(abs, "utf8");
      return { content, source: abs };
    } catch {
      /* fall through */
    }
  }
  return { content: "", source: "default" };
}
