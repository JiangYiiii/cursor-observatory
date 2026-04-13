/**
 * Observatory 设置键迁移：新键优先，旧键（package.json 已标 deprecated）回退。
 */
import * as vscode from "vscode";

function configHasExplicitValue(
  ins: ReturnType<vscode.WorkspaceConfiguration["inspect"]> | undefined
): boolean {
  if (!ins) return false;
  return (
    ins.globalValue !== undefined ||
    ins.workspaceValue !== undefined ||
    ins.workspaceFolderValue !== undefined
  );
}

export type UtTestFrameworkSetting = "auto" | "pytest" | "jest" | "junit";

export function getUtTestFramework(
  cfg: vscode.WorkspaceConfiguration
): UtTestFrameworkSetting {
  const n = cfg.inspect<string>("utTest.framework");
  if (configHasExplicitValue(n)) {
    return (cfg.get<string>("utTest.framework", "auto") ??
      "auto") as UtTestFrameworkSetting;
  }
  const o = cfg.inspect<string>("test.framework");
  if (configHasExplicitValue(o)) {
    return (cfg.get<string>("test.framework", "auto") ??
      "auto") as UtTestFrameworkSetting;
  }
  return (cfg.get<string>("utTest.framework", "auto") ??
    "auto") as UtTestFrameworkSetting;
}

/** 集成终端 / 文件保存后是否自动导入测试报告 */
export function getUtTestAutoIngest(
  cfg: vscode.WorkspaceConfiguration
): boolean {
  const n = cfg.inspect<boolean>("utTest.autoIngest");
  if (configHasExplicitValue(n)) {
    return cfg.get<boolean>("utTest.autoIngest", true);
  }
  const t = cfg.inspect<boolean>("test.autoIngestTestReport");
  if (configHasExplicitValue(t)) {
    return cfg.get<boolean>("test.autoIngestTestReport", true);
  }
  const p = cfg.inspect<boolean>("test.autoIngestPytestReport");
  if (configHasExplicitValue(p)) {
    return cfg.get<boolean>("test.autoIngestPytestReport", true);
  }
  return cfg.get<boolean>("utTest.autoIngest", true);
}

export function getSddTestingCompleteOnTestPass(
  cfg: vscode.WorkspaceConfiguration
): boolean {
  const n = cfg.inspect<boolean>("capability.sddTestingCompleteOnTestPass");
  if (configHasExplicitValue(n)) {
    return cfg.get<boolean>("capability.sddTestingCompleteOnTestPass", true);
  }
  const o = cfg.inspect<boolean>("capability.sddTestingCompleteOnPytestPass");
  if (configHasExplicitValue(o)) {
    return cfg.get<boolean>("capability.sddTestingCompleteOnPytestPass", true);
  }
  return cfg.get<boolean>("capability.sddTestingCompleteOnTestPass", true);
}

function getStringWithFallback(
  cfg: vscode.WorkspaceConfiguration,
  newKey: string,
  oldKey: string,
  defaultValue = ""
): string {
  const n = cfg.inspect<string>(newKey);
  if (configHasExplicitValue(n)) {
    return cfg.get<string>(newKey, defaultValue) ?? defaultValue;
  }
  const o = cfg.inspect<string>(oldKey);
  if (configHasExplicitValue(o)) {
    return cfg.get<string>(oldKey, defaultValue) ?? defaultValue;
  }
  return cfg.get<string>(newKey, defaultValue) ?? defaultValue;
}

export function getSddArtifactsAnalyzeSkill(
  cfg: vscode.WorkspaceConfiguration
): string {
  return getStringWithFallback(
    cfg,
    "sddArtifacts.analyzeSkill",
    "skill.analyze"
  );
}

export function getCodeSubmitSkill(
  cfg: vscode.WorkspaceConfiguration
): string {
  return getStringWithFallback(cfg, "codeSubmit.skill", "skill.codeSubmit");
}

export function getDeployMcpService(
  cfg: vscode.WorkspaceConfiguration
): string {
  return getStringWithFallback(cfg, "deploy.mcpService", "mcp.cicd");
}

const DEFAULT_DEPLOY_MCP_TOOL = "swimlane_deploy";
const DEFAULT_TEST_CASES_MCP_TOOL = "run_test_case";

export function getDeployMcpTool(cfg: vscode.WorkspaceConfiguration): string {
  const n = cfg.inspect<string>("deploy.mcpTool");
  if (configHasExplicitValue(n)) {
    return (
      cfg.get<string>("deploy.mcpTool", DEFAULT_DEPLOY_MCP_TOOL) ??
      DEFAULT_DEPLOY_MCP_TOOL
    );
  }
  const o = cfg.inspect<string>("mcp.cicdTool");
  if (configHasExplicitValue(o)) {
    return (
      cfg.get<string>("mcp.cicdTool", DEFAULT_DEPLOY_MCP_TOOL) ??
      DEFAULT_DEPLOY_MCP_TOOL
    );
  }
  return (
    cfg.get<string>("deploy.mcpTool", DEFAULT_DEPLOY_MCP_TOOL) ??
    DEFAULT_DEPLOY_MCP_TOOL
  );
}

export function getDeployCheetahMcp(
  cfg: vscode.WorkspaceConfiguration
): string {
  return getStringWithFallback(cfg, "deploy.cheetahMcp", "mcp.cheetah");
}

export function getTestCasesMcpService(
  cfg: vscode.WorkspaceConfiguration
): string {
  return getStringWithFallback(cfg, "testCases.mcpService", "mcp.testRunner");
}

export function getTestCasesMcpTool(
  cfg: vscode.WorkspaceConfiguration
): string {
  const n = cfg.inspect<string>("testCases.mcpTool");
  if (configHasExplicitValue(n)) {
    return (
      cfg.get<string>("testCases.mcpTool", DEFAULT_TEST_CASES_MCP_TOOL) ??
      DEFAULT_TEST_CASES_MCP_TOOL
    );
  }
  const o = cfg.inspect<string>("mcp.testRunnerTool");
  if (configHasExplicitValue(o)) {
    return (
      cfg.get<string>("mcp.testRunnerTool", DEFAULT_TEST_CASES_MCP_TOOL) ??
      DEFAULT_TEST_CASES_MCP_TOOL
    );
  }
  return (
    cfg.get<string>("testCases.mcpTool", DEFAULT_TEST_CASES_MCP_TOOL) ??
    DEFAULT_TEST_CASES_MCP_TOOL
  );
}
