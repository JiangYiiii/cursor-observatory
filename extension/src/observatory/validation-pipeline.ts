/**
 * 影响分析 / 测试用例 JSON 校验管线：注入 → 重算 → AJV → 语义 → 落盘 → 派生 MD
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { ObservatoryError } from "./errors";
import {
  getChangedFiles,
  getCurrentGitState,
  type CurrentGitState,
} from "./git-utils";
import { sddFeatureObservatoryDirAbs } from "./sdd-test-paths";
import { ObservatoryValidator } from "./validator";

export interface ImpactAnalysisData {
  schema_version: string;
  analyzed_at: string;
  base_ref: string;
  workspace_branch: string;
  head_commit: string;
  working_tree_fingerprint: string;
  generated_from_changed_files: string[];
  summary: {
    total_scenarios: number;
    high_impact: number;
    medium_impact: number;
    low_impact: number;
    affected_modules: number;
    affected_applications: number;
  };
  scenarios: Array<{
    id: string;
    name: string;
    impact: string;
    anchor_id?: string;
    description?: string;
    related_files?: string[];
    module: string;
  }>;
  affected_modules: Array<{
    name: string;
    path: string;
    is_application: boolean;
    entry_class?: string;
    scenario_count: number;
    scenario_ids?: string[];
  }>;
  changed_files: Array<{
    path: string;
    change_type: string;
    module: string;
    has_ai_doc?: boolean;
    anchor_ids?: string[];
  }>;
}

export interface TestCasesData {
  schema_version: string;
  executed_at: string;
  source_impact_analysis_head_commit: string;
  source_impact_analysis_fingerprint: string;
  workspace_branch: string;
  head_commit: string;
  working_tree_fingerprint: string;
  summary: {
    total_scenarios: number;
    generated_cases: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  cases: Array<{
    id: string;
    scenario_id: string;
    scenario_name: string;
    description: string;
    request: Record<string, unknown>;
    expected: Record<string, unknown>;
    actual?: Record<string, unknown>;
    redacted_fields?: string[];
    status: string;
    error_message?: string;
  }>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 与 webview `IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT` 保持同步 */
export const IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT =
  "AI_PENDING_EXTENSION_INJECT";

function nonemptyString(s: unknown): s is string {
  return typeof s === "string" && s.length > 0;
}

/**
 * 保存前比对「请求体中的 Git 元数据」与当前仓库；占位符指纹不告警（将由注入覆盖）。
 */
export function buildIncomingGitMetadataWarnings(
  data: Partial<
    Pick<
      ImpactAnalysisData,
      "workspace_branch" | "head_commit" | "working_tree_fingerprint"
    >
  >,
  git: CurrentGitState
): string[] {
  const fp = data.working_tree_fingerprint;
  if (fp === IMPACT_ANALYSIS_GIT_PLACEHOLDER_FINGERPRINT) {
    return [];
  }
  const mismatches: string[] = [];
  if (nonemptyString(data.workspace_branch) && data.workspace_branch !== git.branch) {
    mismatches.push("分支");
  }
  if (nonemptyString(data.head_commit) && data.head_commit !== git.headCommit) {
    mismatches.push("HEAD");
  }
  if (nonemptyString(fp) && fp !== git.fingerprint) {
    mismatches.push("working_tree_fingerprint");
  }
  if (mismatches.length === 0) {
    return [];
  }
  return [
    `传入 JSON 的 Git 元数据（${mismatches.join("、")}）与当前仓库不一致，已用扩展注入的实时值覆盖。`,
  ];
}

function recalcImpactSummary(data: ImpactAnalysisData): void {
  const scenarios = data.scenarios ?? [];
  data.summary.total_scenarios = scenarios.length;
  data.summary.high_impact = scenarios.filter((s) => s.impact === "high").length;
  data.summary.medium_impact = scenarios.filter(
    (s) => s.impact === "medium"
  ).length;
  data.summary.low_impact = scenarios.filter((s) => s.impact === "low").length;
  data.summary.affected_modules = (data.affected_modules ?? []).length;
  data.summary.affected_applications = (
    data.affected_modules ?? []
  ).filter((m) => m.is_application).length;
}

function semanticValidateImpact(data: ImpactAnalysisData): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const s of data.scenarios ?? []) {
    if (ids.has(s.id)) errs.push(`duplicate scenario id: ${s.id}`);
    ids.add(s.id);
  }
  for (const m of data.affected_modules ?? []) {
    for (const sid of m.scenario_ids ?? []) {
      if (!ids.has(sid)) {
        errs.push(`affected_modules scenario_ids references unknown ${sid}`);
      }
    }
  }
  return errs;
}

function recalcTestSummary(data: TestCasesData): void {
  const cases = data.cases ?? [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const c of cases) {
    if (c.status === "passed") passed += 1;
    else if (c.status === "failed") failed += 1;
    else if (c.status === "skipped") skipped += 1;
  }
  data.summary.passed = passed;
  data.summary.failed = failed;
  data.summary.skipped = skipped;
  data.summary.generated_cases = cases.filter(
    (c) => c.status !== "pending"
  ).length;
  if (typeof data.summary.total_scenarios !== "number") {
    data.summary.total_scenarios = new Set(cases.map((c) => c.scenario_id))
      .size;
  }
}

function semanticValidateTestCases(
  data: TestCasesData,
  scenarioIds: Set<string>
): string[] {
  const errs: string[] = [];
  if (scenarioIds.size === 0) return errs;
  for (const c of data.cases ?? []) {
    if (!scenarioIds.has(c.scenario_id)) {
      errs.push(`case ${c.id} unknown scenario_id ${c.scenario_id}`);
    }
  }
  return errs;
}

/**
 * 读取已落盘的 Markdown；若不存在则从同目录 impact-analysis.json 校验后即时渲染。
 * （AI 仅写入 JSON 而未走扩展 save 时常见，用于详情弹窗可读性。）
 */
export async function readImpactAnalysisMarkdownForFeature(
  workspaceRoot: string,
  featureName: string,
  validator: ObservatoryValidator = new ObservatoryValidator()
): Promise<string | null> {
  const dir = sddFeatureObservatoryDirAbs(workspaceRoot, featureName);
  const mdPath = path.join(dir, "impact-analysis.md");
  try {
    const md = await fs.readFile(mdPath, "utf8");
    if (md.trim().length > 0) {
      return md;
    }
  } catch {
    /* fall through: synthesize */
  }
  const jsonPath = path.join(dir, "impact-analysis.json");
  try {
    const raw = await fs.readFile(jsonPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return null;
    }
    const data = { ...parsed } as unknown as ImpactAnalysisData;
    try {
      validator.validate("impact-analysis.json", data);
    } catch {
      return null;
    }
    const sem = semanticValidateImpact(data);
    if (sem.length) {
      return null;
    }
    return renderImpactAnalysisMd(data);
  } catch {
    return null;
  }
}

export function renderImpactAnalysisMd(data: ImpactAnalysisData): string {
  const lines: string[] = [];
  lines.push(`# 影响场景分析`);
  lines.push("");
  lines.push(`- 分析时间: ${data.analyzed_at}`);
  lines.push(`- 基准: \`${data.base_ref}\` · 分支: \`${data.workspace_branch}\` · HEAD: \`${data.head_commit}\``);
  lines.push(
    `- 摘要: 共 **${data.summary.total_scenarios}** 个场景 · 高/中/低: ${data.summary.high_impact}/${data.summary.medium_impact}/${data.summary.low_impact} · 应用模块: **${data.summary.affected_applications}**`
  );
  lines.push("");
  lines.push(`## 场景`);
  for (const s of data.scenarios ?? []) {
    lines.push(`### ${s.id} — ${s.name}`);
    lines.push(`- 影响: **${s.impact}** · 模块: \`${s.module}\``);
    if (s.description) lines.push(`- ${s.description}`);
    lines.push("");
  }
  lines.push(`## 受影响模块`);
  for (const m of data.affected_modules ?? []) {
    lines.push(
      `- **${m.name}** (\`${m.path}\`)${m.is_application ? " · 可部署应用" : ""}`
    );
  }
  return lines.join("\n");
}

export function renderTestCasesMd(data: TestCasesData): string {
  const lines: string[] = [];
  lines.push(`# 测试用例执行结果`);
  lines.push("");
  lines.push(`- 执行时间: ${data.executed_at}`);
  lines.push(
    `- 汇总: 场景 ${data.summary.total_scenarios} · 生成 ${data.summary.generated_cases} · 通过 ${data.summary.passed} · 失败 ${data.summary.failed} · 跳过 ${data.summary.skipped}`
  );
  lines.push("");
  for (const c of data.cases ?? []) {
    lines.push(`## ${c.id} — ${c.scenario_name}`);
    lines.push(`- 状态: **${c.status}** · 场景: \`${c.scenario_id}\``);
    if (c.error_message) lines.push(`- 错误: ${c.error_message}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function injectGitImpact(
  workspaceRoot: string,
  featureName: string,
  data: ImpactAnalysisData,
  git: CurrentGitState
): Promise<void> {
  data.workspace_branch = git.branch;
  data.head_commit = git.headCommit;
  data.working_tree_fingerprint = git.fingerprint;
  const tasksRel = path.join("specs", featureName, "tasks.md");
  const changed = await getChangedFiles(workspaceRoot, {
    tasksMdRelativePath: tasksRel,
  });
  data.base_ref = changed.baseRef;
  if (
    !data.generated_from_changed_files ||
    data.generated_from_changed_files.length === 0
  ) {
    data.generated_from_changed_files =
      changed.files.length > 0 ? changed.files : ["(none)"];
  }
  if (!data.analyzed_at) {
    data.analyzed_at = new Date().toISOString();
  }
}

async function readImpactScenarioIds(
  workspaceRoot: string,
  featureName: string
): Promise<Set<string>> {
  const dir = sddFeatureObservatoryDirAbs(workspaceRoot, featureName);
  const fp = path.join(dir, "impact-analysis.json");
  try {
    const raw = await fs.readFile(fp, "utf8");
    const j = JSON.parse(raw) as { scenarios?: Array<{ id?: string }> };
    const set = new Set<string>();
    for (const s of j.scenarios ?? []) {
      if (typeof s.id === "string") set.add(s.id);
    }
    return set;
  } catch {
    return new Set();
  }
}

export type ProcessImpactAnalysisResult = {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
};

export async function processImpactAnalysis(
  workspaceRoot: string,
  featureName: string,
  rawJson: unknown,
  validator: ObservatoryValidator = new ObservatoryValidator()
): Promise<ProcessImpactAnalysisResult> {
  if (!isRecord(rawJson)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const data = { ...rawJson } as unknown as ImpactAnalysisData;
  try {
    const git = await getCurrentGitState(workspaceRoot);
    const warnings = buildIncomingGitMetadataWarnings(data, git);
    await injectGitImpact(workspaceRoot, featureName, data, git);
    recalcImpactSummary(data);
    try {
      validator.validate("impact-analysis.json", data);
    } catch (e) {
      const msg =
        e instanceof ObservatoryError
          ? JSON.stringify(e.detail ?? e.message)
          : String(e);
      return { ok: false, errors: [msg] };
    }
    const sem = semanticValidateImpact(data);
    if (sem.length) {
      return { ok: false, errors: sem };
    }
    const dir = sddFeatureObservatoryDirAbs(workspaceRoot, featureName);
    await fs.mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "impact-analysis.json");
    const mdPath = path.join(dir, "impact-analysis.md");
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), "utf8");
    await fs.writeFile(mdPath, renderImpactAnalysisMd(data), "utf8");
    return {
      ok: true,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (e) {
    return { ok: false, errors: [String(e)] };
  }
}

async function injectGitTestCases(
  workspaceRoot: string,
  featureName: string,
  data: TestCasesData
): Promise<void> {
  const git = await getCurrentGitState(workspaceRoot);
  data.workspace_branch = git.branch;
  data.head_commit = git.headCommit;
  data.working_tree_fingerprint = git.fingerprint;
  const dir = sddFeatureObservatoryDirAbs(workspaceRoot, featureName);
  const impactPath = path.join(dir, "impact-analysis.json");
  try {
    const raw = await fs.readFile(impactPath, "utf8");
    const imp = JSON.parse(raw) as {
      head_commit?: string;
      working_tree_fingerprint?: string;
    };
    data.source_impact_analysis_head_commit =
      typeof imp.head_commit === "string" ? imp.head_commit : git.headCommit;
    data.source_impact_analysis_fingerprint =
      typeof imp.working_tree_fingerprint === "string"
        ? imp.working_tree_fingerprint
        : git.fingerprint;
  } catch {
    data.source_impact_analysis_head_commit = git.headCommit;
    data.source_impact_analysis_fingerprint = git.fingerprint;
  }
  if (!data.executed_at) {
    data.executed_at = new Date().toISOString();
  }
}

export async function processTestCases(
  workspaceRoot: string,
  featureName: string,
  rawJson: unknown,
  validator: ObservatoryValidator = new ObservatoryValidator()
): Promise<{ ok: boolean; errors?: string[] }> {
  if (!isRecord(rawJson)) {
    return { ok: false, errors: ["body must be a JSON object"] };
  }
  const data = { ...rawJson } as unknown as TestCasesData;
  try {
    await injectGitTestCases(workspaceRoot, featureName, data);
    recalcTestSummary(data);
    try {
      validator.validate("test-cases.json", data);
    } catch (e) {
      const msg =
        e instanceof ObservatoryError
          ? JSON.stringify(e.detail ?? e.message)
          : String(e);
      return { ok: false, errors: [msg] };
    }
    const scenarioIds = await readImpactScenarioIds(workspaceRoot, featureName);
    const sem = semanticValidateTestCases(data, scenarioIds);
    if (sem.length) {
      return { ok: false, errors: sem };
    }
    const dir = sddFeatureObservatoryDirAbs(workspaceRoot, featureName);
    await fs.mkdir(dir, { recursive: true });
    const jsonPath = path.join(dir, "test-cases.json");
    const mdPath = path.join(dir, "test-cases.md");
    await fs.writeFile(jsonPath, JSON.stringify(data, null, 2), "utf8");
    await fs.writeFile(mdPath, renderTestCasesMd(data), "utf8");
    return { ok: true };
  } catch (e) {
    return { ok: false, errors: [String(e)] };
  }
}
