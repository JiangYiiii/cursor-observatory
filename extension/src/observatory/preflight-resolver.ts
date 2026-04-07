/**
 * Skill / MCP / 数据新鲜度预检（需求面板 V2）。
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { getCurrentGitState } from "./git-utils";
import {
  type McpStatusEntry,
  resolveMcpStatusFromStrings,
} from "./mcp-preflight";

export { resolveMcpStatusFromStrings } from "./mcp-preflight";

export type SkillStatus = "found" | "missing" | "invalid";
export type McpStatus =
  | "configured"
  | "service_missing"
  | "tool_missing"
  | "malformed";
export type DataFreshness = "fresh" | "stale" | "missing" | "invalid";

export interface CapabilityLike {
  id: string;
  sdd?: { workspacePath?: string };
}

export interface SkillStatusEntry {
  status: SkillStatus;
  path?: string;
}

export interface PreflightResult {
  skillStatus: Record<string, SkillStatusEntry>;
  mcpStatus: Record<"cicd" | "testRunner", McpStatusEntry>;
  dataFreshness: Record<string, DataFreshness>;
}

function readObservatoryConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("observatory");
}

/**
 * 显式 skill 路径 → 自动检测 `.cursor/skills/<stage>/SKILL.md`
 */
export async function resolveSkillStatus(
  workspaceRoot: string,
  stageDir: string,
  explicitPathFromConfig?: string
): Promise<{ status: SkillStatus; path?: string }> {
  const exp = explicitPathFromConfig?.trim();
  if (exp) {
    const abs = path.isAbsolute(exp) ? exp : path.join(workspaceRoot, exp);
    try {
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        return { status: "found", path: abs };
      }
    } catch {
      return { status: "invalid" };
    }
    return { status: "invalid" };
  }
  const auto = path.join(
    workspaceRoot,
    ".cursor",
    "skills",
    stageDir,
    "SKILL.md"
  );
  if (fs.existsSync(auto) && fs.statSync(auto).isFile()) {
    return { status: "found", path: auto };
  }
  return { status: "missing" };
}

export async function resolveMcpStatus(
  stage: "cicd" | "testRunner"
): Promise<McpStatusEntry> {
  const cfg = readObservatoryConfig();
  if (stage === "cicd") {
    return resolveMcpStatusFromStrings(
      cfg.get<string>("mcp.cicd"),
      cfg.get<string>("mcp.cicdTool") ?? "swimlane_deploy"
    );
  }
  return resolveMcpStatusFromStrings(
    cfg.get<string>("mcp.testRunner"),
    cfg.get<string>("mcp.testRunnerTool") ?? "run_test_case"
  );
}

/** 影响分析 / 测试用例 JSON 与当前 Git 状态比对 */
export async function resolveImpactOrTestFreshness(
  workspaceRoot: string,
  snapshot: {
    workspace_branch?: string;
    head_commit?: string;
    working_tree_fingerprint?: string;
  } | null
): Promise<DataFreshness> {
  if (!snapshot || typeof snapshot !== "object") return "missing";
  const b = snapshot.workspace_branch;
  const h = snapshot.head_commit;
  const f = snapshot.working_tree_fingerprint;
  if (
    typeof b !== "string" ||
    typeof h !== "string" ||
    typeof f !== "string" ||
    !b ||
    !h ||
    !f
  ) {
    return "invalid";
  }
  const cur = await getCurrentGitState(workspaceRoot);
  if (
    b === cur.branch &&
    h === cur.headCommit &&
    f === cur.fingerprint
  ) {
    return "fresh";
  }
  return "stale";
}

/**
 * 聚合预检结果（按 stage 填充 skillStatus）
 */
export async function runPreflight(
  workspaceRoot: string,
  stage: string,
  _cap: CapabilityLike
): Promise<PreflightResult> {
  const cfg = readObservatoryConfig();
  const skillStatus: PreflightResult["skillStatus"] = {};

  if (stage === "analyze") {
    const r = await resolveSkillStatus(
      workspaceRoot,
      "analyze",
      cfg.get<string>("skill.analyze")
    );
    const entry: SkillStatusEntry = { status: r.status, path: r.path };
    skillStatus.analyze = entry;
  } else if (stage === "impact-analysis") {
    const r = await resolveSkillStatus(
      workspaceRoot,
      "repay-impact-analysis"
    );
    const entry: SkillStatusEntry = { status: r.status, path: r.path };
    skillStatus["impact-analysis"] = entry;
  } else if (stage === "code-submit") {
    let r = await resolveSkillStatus(
      workspaceRoot,
      "code-submit",
      cfg.get<string>("skill.codeSubmit")
    );
    if (r.status === "missing") {
      r = await resolveSkillStatus(workspaceRoot, "repay-code-submit");
    }
    const entry: SkillStatusEntry = { status: r.status, path: r.path };
    skillStatus["code-submit"] = entry;
  }

  const cicd = await resolveMcpStatus("cicd");
  const testRunner = await resolveMcpStatus("testRunner");

  return {
    skillStatus,
    mcpStatus: { cicd, testRunner },
    dataFreshness: {},
  };
}
