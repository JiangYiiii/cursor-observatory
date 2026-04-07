/**
 * 自包含 SDD Prompt 生成（复制到 AI Agent）。
 * 末尾含 Observatory-Tracking-ID 供转录关联。
 * V2：支持模板文件覆盖（经 API 加载）、UT/影响场景注入。
 */
import { normalizePhase, PHASE_TITLE } from "@/lib/kanban-utils";
import { resolveAdvanceKind } from "@/lib/requirement-utils";
import { getDataSource } from "@/services/data-source-instance";
import type { Capability } from "@/types/observatory";

export function trackingFooter(capabilityId: string | undefined): string {
  if (!capabilityId) {
    return "\n---\nObservatory-Tracking-ID: (新建需求完成后将写入 .capability-id)";
  }
  return `\n---\nObservatory-Tracking-ID: ${capabilityId}`;
}

export function replaceTemplateVars(
  template: string,
  vars: Record<string, string>
): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) {
    out = out.split(`{{${k}}}`).join(v);
  }
  return out;
}

function sddPath(cap: Capability): string {
  return cap.sdd?.workspacePath ?? "specs/<feature>";
}

function docFlags(cap: Capability): string {
  const d = cap.sdd?.documents;
  if (!d) return "（无 SDD 元数据）";
  const parts: string[] = [];
  parts.push(`spec ${d.spec ? "✅" : "❌"}`);
  parts.push(`sketch ${d.sketch ? "✅" : "❌"}`);
  parts.push(`plan ${d.plan ? "✅" : "❌"}`);
  parts.push(`tasks ${d.tasks ? "✅" : "❌"}`);
  parts.push(`data-model ${d.dataModel ? "✅" : "❌"}`);
  parts.push(`contracts ${d.contracts ? "✅" : "❌"}`);
  parts.push(`research ${d.research ? "✅" : "❌"}`);
  return parts.join(" | ");
}

function taskLine(cap: Capability): string {
  const ts = cap.sdd?.taskStats;
  if (!ts || ts.total <= 0) return "—";
  return `${ts.completed}/${ts.total} 完成`;
}

export function buildBaseTemplateVars(cap: Capability): Record<string, string> {
  const phase = normalizePhase(cap.phase);
  return {
    sddPath: sddPath(cap),
    capabilityId: cap.id,
    title: String(cap.title ?? cap.id),
    phase,
    contextSection: contextSection(cap),
    trackingFooter: trackingFooter(cap.id).replace(/^\n---\n/, ""),
  };
}

function contextSection(cap: Capability | null): string {
  if (!cap) return "";
  const phase = normalizePhase(cap.phase);
  return `## 需求上下文
- **能力 ID**: \`${cap.id}\`
- **标题**: ${String(cap.title ?? cap.id)}
- **当前阶段**: ${PHASE_TITLE[phase]} (\`${phase}\`)
- **SDD 路径**: \`${sddPath(cap)}\`
- **产物**: ${docFlags(cap)}
- **任务进度**: ${taskLine(cap)}
`;
}

/** 新增需求（specify） */
export function generateSpecifyPrompt(userRequirement: string): string {
  const body = userRequirement.trim() || "（请补充一句话需求描述）";
  return `# Observatory SDD — 新增需求（Specify）

## 用户输入
${body}

## 你必须执行的 SDD Specify 流程
1. 根据需求生成 **kebab-case** 工作区名（2–6 词，如 \`add-user-auth\`），检查 \`specs/<name>/\` 是否已存在；若存在则换名或询问。
2. \`mkdir -p specs/<name>/checklists\`
3. \`echo "<name>" > specs/.active\`
4. 创建 \`specs/<name>/.capability-id\`，写入一行稳定 ID，推荐格式 \`sdd:<slug>\`（与扩展扫描一致）。
5. 按 **spec 模板** 写 \`specs/<name>/spec.md\`（若文件已存在则先 Read 再增量修改，禁止无说明整文件覆盖）：
   - User Scenarios & Testing：User Story + Acceptance Scenarios (Given/When/Then) + Edge Cases
   - Requirements：FR/NFR、Key Entities
   - 可选：Business Metrics、Assumptions、Out of Scope
   - 写作聚焦 **WHAT/WHY**，不要写实现细节（HOW）
6. 参考 checklist 模板写 \`specs/<name>/checklists/requirements.md\` 并做自检（最多 3 轮）。
7. 完成后提示用户执行 **Run Full Scan** 或下一步 **Plan**。

## 已有文档兼容
若 \`spec.md\` 已存在：必须先 Read 全文，仅补充/修订必要章节，保留已有约定。

${trackingFooter(undefined)}`;
}

/** 设计方案（plan） */
export function generatePlanPrompt(cap: Capability): string {
  return `# Observatory SDD — 设计方案（Plan）

${contextSection(cap)}

## 你必须执行的 SDD Plan 流程
1. 确认 \`${sddPath(cap)}/spec.md\` 存在并 Read；若存在 sketch 无 spec，按项目约定处理。
2. 按 **plan 模板** 写 \`${sddPath(cap)}/plan.md\`（已存在则 Read 后增量修改）：
   - Summary、Technical Context 表
   - 按需：Architecture、Key Design Decisions、Module Design（伪代码，勿写可编译代码）、Sequence Diagrams、Project Structure、Design Artifacts、Notes
3. 若 Technical Context 有 NEEDS CLARIFICATION：可写 \`research.md\`。
4. 按需：\`data-model.md\`、\`contracts/openapi.yaml\`、\`quickstart.md\`。
5. 完成后执行 **Run Full Scan**，下一步 **Tasks**。

## 已有文档兼容
所有产物若已存在，必须先 Read 再改，禁止覆盖未声明章节。

${trackingFooter(cap.id)}`;
}

/** 拆解任务（tasks） */
export function generateTasksPrompt(cap: Capability): string {
  return `# Observatory SDD — 拆解任务（Tasks）

${contextSection(cap)}

## 你必须执行的 SDD Tasks 流程
1. Read \`spec.md\`、\`plan.md\` 及可选 \`data-model.md\`、\`contracts/\`。
2. 按 **tasks 模板** 写 \`${sddPath(cap)}/tasks.md\`（已存在则 Read 后修订）：
   - 任务行格式：\`- [ ] T001 [P?] [USn] 描述，含精确文件路径\`
   - Phase：Setup → Foundational → User Story 分阶段 → Polish
   - 每阶段含 UT；User Story 阶段含验收测试（对齐 spec 的 Acceptance Scenarios）
3. 设置 \`specs/.active\` 为当前 feature 名（若未设置）。
4. 完成后 **Run Full Scan**，下一步 **Implement**。

${trackingFooter(cap.id)}`;
}

/** 继续开发（implement） */
export function generateImplementPrompt(cap: Capability): string {
  return `# Observatory SDD — 按任务实现（Implement）

${contextSection(cap)}

## 你必须执行的 Implement 流程
1. Read \`tasks.md\`、\`plan.md\` 及关联产物。
2. 按 Task ID 顺序执行；标记 \`[P]\` 的可并行（无冲突时）。
3. 每完成一项：将 \`- [ ]\` 改为 \`- [x]\`（注意 Observatory 扫描识别 \`[x]\`/\`[X]\`）。
4. 每个 Phase 结束：编译通过、UT 通过、覆盖率达标；User Story Phase 还须验收测试通过。
5. 失败时分析并修复（单任务最多 3 次尝试）。
6. 完成后 **Run Full Scan**。

${trackingFooter(cap.id)}`;
}

const DEFAULT_ANALYZE_BODY = `## 你必须执行
1. 若项目存在 \`.cursor/skills/analyze/SKILL.md\`，请先 **Read 该 SKILL 全文** 并严格按其结构与规则输出。
2. Read \`spec.md\`、\`plan.md\`、\`tasks.md\`（须三者存在）。
3. **不要修改任何文件**；输出分析报告，至少覆盖以下维度：
   - **重复**：需求/任务/设计中的重复描述
   - **歧义**：术语、边界、未定义行为
   - **未明确项**：缺失的 NFR、验收标准、依赖
   - **覆盖缺口**：spec 场景 vs tasks/plan 覆盖
   - **不一致**：spec/plan/tasks/数据模型之间冲突
4. 每条发现标注严重性：**CRITICAL | HIGH | MEDIUM | LOW**。
5. 用户确认后再由其他步骤修复。`;

/** 产物分析（analyze）：优先模板文件，其次内置深度版 */
export async function generateAnalyzePrompt(cap: Capability): Promise<string> {
  const vars = buildBaseTemplateVars(cap);
  let template = "";
  try {
    const r = await getDataSource().getPromptTemplate("analyze");
    template = r.content?.trim() ?? "";
  } catch {
    /* use default */
  }
  const body = template
    ? replaceTemplateVars(template, vars)
    : `# Observatory SDD — 产物分析（Analyze，只读）

${contextSection(cap)}

${DEFAULT_ANALYZE_BODY}

${trackingFooter(cap.id)}`;
  return body.includes("{{")
    ? replaceTemplateVars(body, vars)
    : body;
}

export type TestPromptOptions = {
  /** 影响场景列表（Markdown 片段） */
  impactScenariosBlock?: string;
};

/** UT 测试（原「测试状态」） */
export function generateTestPrompt(
  cap: Capability,
  testSummary: string,
  options?: TestPromptOptions
): string {
  const impact =
    options?.impactScenariosBlock?.trim() ??
    "（未加载影响分析；请先执行「影响场景分析」或忽略场景对齐）";
  return `# Observatory — UT 测试

${contextSection(cap)}

## 影响场景（用于对齐 UT 覆盖）
${impact}

## 当前测试数据（来自 Observatory）
${testSummary}

## 操作要求
1. 若项目存在 \`.cursor/skills/ut/SKILL.md\`，请遵循其 JUnit/Mockito/AssertJ 等约定。
2. Read \`${sddPath(cap)}/spec.md\` 中的验收场景，并对照 **影响场景** 列表为关键场景补充/完善单元测试（正常 / 异常 / 边界）。
3. 若你手写或编辑 **规范化 \`report.json\`**：\`test_cases\` **每一项**必须包含字符串字段 \`id\`、\`file\`、\`name\`、\`status\`（与 Observatory JSON Schema 一致）。模块汇总、Tier 等非单测文件级条目不得省略 \`file\`，请填占位 \`"_synthetic"\`。
4. **先判断仓库主技术栈**，再运行对应测试（勿默认假设 pytest）：
   - **Java / Maven**：仓库根有 \`pom.xml\` 时，使用 \`mvn test\`（JUnit / Surefire）；扩展可在测试结束后自动聚合 \`**/target/surefire-reports/TEST-*.xml\`。
   - **Java / Gradle**：存在 \`build.gradle\` / \`build.gradle.kts\` 时，使用 \`./gradlew test\`（或 Windows 下 \`gradlew.bat test\`）；报告可在 \`build/test-results/test/\`。
   - **Python / pytest**：若尚无目录则 \`mkdir -p ${sddPath(cap)}/test\`。使用 \`pytest-json-report\` 时可将原始 JSON 写到 **\`${sddPath(cap)}/test/pytest-report.json\`**（须与 \`specs/.active\` 首行 feature 名一致）。示例：\`pytest --json-report --json-report-file=${sddPath(cap)}/test/pytest-report.json\`。
   - **Node**：按 \`package.json\` 的 \`test\` 脚本（Jest / Vitest 等）执行。
5. **规范化测试结果**由扩展写入 **\`${sddPath(cap)}/test/report.json\`**（与 \`test-results.json\` 同内容、同目录；导入或聚合后生成）。无 SDD 时亦可落在根目录 **\`.observatory/report.json\`**。
6. 统计并记录 **已覆盖的影响场景数 / 总影响场景数**（可在 PR 描述或单独注释中说明）。
7. 完成后 **Run Full Scan**。

${trackingFooter(cap.id)}`;
}

/** Bug 修复 */
export function generateBugfixPrompt(
  cap: Capability,
  newBugDescription?: string
): string {
  const bug = cap.bugfix;
  const desc = newBugDescription?.trim();
  const mode =
    desc && desc.length > 0
      ? "new"
      : bug && bug.activeBugs > 0
        ? "existing"
        : "none";

  if (mode === "none") {
    return `# Observatory — Bug 修复

${contextSection(cap)}

当前 **没有** 待修复的 OPEN Bug，也未填写新 Bug 描述。请在弹窗中填写现象描述，或先在 \`${sddPath(cap)}/bugfix-log.md\` 中记录 OPEN 条目后再试。

${trackingFooter(cap.id)}`;
  }

  const bugSection =
    mode === "new"
      ? `## 新 Bug 现象（用户填写）
${desc}

## 流程
1. Read SDD 产物（spec/plan/tasks）与相关代码。
2. **归因**（五选一）：SPEC_GAP | DESIGN_FLAW | TASK_MISS | IMPL_DEVIATION | IMPL_BUG
3. 从根因层 **级联修复**：spec → plan → tasks → 代码（按归因范围裁剪）。
4. 更新或创建 \`${sddPath(cap)}/bugfix-log.md\`：每个 Bug 用 \`## BF-xxx\` 分段，OPEN 用标题含 OPEN 或 🔴；修复后标 RESOLVED 或 **状态**: ✅。
5. 验证：相关 UT/验收通过。
6. **Run Full Scan**。`
      : `## 已有 OPEN Bug
- 未关闭: ${bug?.activeBugs ?? 0}
- 根因（如有）: ${(bug?.rootCauses ?? []).join(", ") || "—"}

## 流程
1. Read \`${sddPath(cap)}/bugfix-log.md\` 全文。
2. 逐个处理 OPEN：按已有归因做级联修复（spec/plan/tasks/代码）。
3. 修复后更新对应分段为 RESOLVED。
4. 验证并 **Run Full Scan**。`;

  return `# Observatory SDD — Bug 修复

${contextSection(cap)}

${bugSection}

${trackingFooter(cap.id)}`;
}

/** 发布 */
export function generateReleasePrompt(cap: Capability): string {
  return `# Observatory — 标记已发布

${contextSection(cap)}

## 操作
在提交说明中 **单独一行** 写入（扩展会解析并标 released）：
\`\`\`
Observatory: ${cap.id}
\`\`\`
或 \`能力: ${cap.id}\`

推送后 **Run Full Scan** 刷新看板。

${trackingFooter(cap.id)}`;
}

/** 推进需求 */
export async function generateAdvancePrompt(
  cap: Capability,
  testSummary: string,
  testOptions?: TestPromptOptions
): Promise<string> {
  const kind = resolveAdvanceKind(cap);
  switch (kind) {
    case "specify":
      return generateSpecifyPrompt(
        `继续完善需求「${String(cap.title ?? cap.id)}」的 SDD 产物`
      );
    case "plan":
      return generatePlanPrompt(cap);
    case "tasks":
      return generateTasksPrompt(cap);
    case "implement":
      return generateImplementPrompt(cap);
    case "test":
      return generateTestPrompt(cap, testSummary, testOptions);
    case "release":
      return generateReleasePrompt(cap);
    default:
      return generateTestPrompt(cap, testSummary, testOptions);
  }
}

export function formatTestSummaryForPrompt(
  capId: string,
  total: number,
  passed: number,
  failed: number,
  scenarioExpected: number,
  scenarioCovered: number
): string {
  return [
    `- 能力 ID \`${capId}\` 测试用例：通过 ${passed} / 失败 ${failed} / 总计 ${total}`,
    `- 期望场景：${scenarioCovered}/${scenarioExpected} 已覆盖`,
  ].join("\n");
}

/** 影响场景分析：输出须写入 observatory/impact-analysis.json（由扩展校验与派生 MD） */
export function generateImpactAnalysisPrompt(
  cap: Capability,
  changedFilesHint: string
): string {
  const vars = buildBaseTemplateVars(cap);
  return `# Observatory — 影响场景分析

${vars.contextSection}

## 变更文件（扩展侧推断，可据此分析）
${changedFilesHint}

## 分析规则
1. **优先** 阅读变更文件中的 \`@ai.doc\` 等注解，提取锚点；在 \`docs/domain/**/meta/ai-index-*.json\` 中反查业务流程。
2. 无注解时，再通过类名、方法、调用关系推断受影响场景。
3. 识别受影响模块；若存在 Spring Boot 启动类，将对应模块标为可部署应用。
4. **必须** 将结果保存为 JSON 文件：\`${vars.sddPath}/observatory/impact-analysis.json\`（业务场景与结构须符合 Schema；\`summary\` 与 Git 相关字段由扩展在「保存/校验」时注入或覆盖）。
5. 不要直接编辑 \`impact-analysis.md\`（由扩展从 JSON 派生）。
6. **不要自行计算或编造** \`working_tree_fingerprint\`（64 位十六进制等）；指纹算法仅在扩展 \`git-utils\` 中实现。若无法通过面板保存，可暂用占位符 \`AI_PENDING_EXTENSION_INJECT\` 或留空由扩展补全，**切勿**用自创哈希公式。落盘后务必在 Observatory 完成扩展侧「保存/校验」，否则看板可能长期提示过期。若业务仓库将 \`impact-analysis.json\` 加入 \`.gitignore\`，可避免未跟踪 JSON 参与工作区指纹自指，可与团队约定选用。

## 结果文件格式要求
保存路径：\`${vars.sddPath}/observatory/impact-analysis.json\`  
须符合项目内 JSON Schema \`impact-analysis.schema.json\`（\`schema_version\` 为 \`1.0\`，场景 ID 形如 \`SCENARIO_001\` 起）。

${trackingFooter(cap.id)}`;
}

/** 提交代码 */
export function generateCodeSubmitPrompt(
  cap: Capability,
  requirementUrl: string
): string {
  const vars = buildBaseTemplateVars(cap);
  return `# Observatory — 提交代码

## 需求链接
${requirementUrl || "（未配置；可在看板「需求链接」中填写）"}

${vars.contextSection}

## 执行步骤
### 1. 检查变更
获取所有待提交文件（tracked 修改 + untracked 新文件）。

### 2. 生成 Commit Message
- 结合需求链接或需求号概括变更
- 建议格式: \`[模块]type: 一句话描述\`

### 3. 若存在 \`.cursor/skills/code-submit/SKILL.md\` 或 \`repay-code-submit/SKILL.md\`
请先 Read 该 SKILL，按其完整流程（含 Review、Arc 等）执行。

### 4. 执行提交
\`git add\` + \`git commit\`

${trackingFooter(cap.id)}`;
}

/** 环境部署 */
export function generateDeployPrompt(params: {
  cap: Capability;
  currentBranch: string;
  swimlane: string;
  affectedServices: string;
  cicdMcpStatus: string;
  cicdMcpInfo: string;
  impactFreshness: string;
}): string {
  const c = params.cap;
  return `# Observatory — 环境部署

${contextSection(c)}

## 部署信息
- 当前分支: ${params.currentBranch}
- 泳道: ${params.swimlane || "（未填写）"}
- 影响的应用服务: ${params.affectedServices}
- 影响分析新鲜度: ${params.impactFreshness}

## MCP 探测
- 状态: ${params.cicdMcpStatus}
- 服务/工具: ${params.cicdMcpInfo}

若状态不是已配置，请在 Cursor MCP 设置中添加 CICD 服务（仅保存服务名/工具名到 Observatory 设置，不含 token）。

若影响分析非 fresh：优先重新执行「影响场景分析」；若必须继续，请在 UI 中手动确认部署服务列表后再执行。

## 步骤
1. 确认参数（服务列表、分支、泳道）
2. 使用 CICD MCP 部署到泳道
3. 将泳道名写入 \`specs/<feature>/observatory/observatory-sdd.json\`（由看板保存；兼容旧路径 \`specs/<feature>/observatory-sdd.json\`）

${trackingFooter(c.id)}`;
}

/** TAPD MCP：拉取需求详情（复制到 Cursor Chat，由 AI 调用 MCP） */
export function generateTapdStoryFetchPrompt(requirementUrl: string): string {
  return `# TAPD 需求详情

请使用 **TAPD MCP** 工具 \`get_api_story_getTapdStory\`（或等价「根据需求 id 或链接获取 TAPD 需求详情」工具），参数：
- \`keywords\`: 下列链接或其中的需求 ID

需求链接：
${requirementUrl}

请将返回的标题、状态、描述要点整理回复；需要时可继续调用评论等接口。`;
}

/** Cheetah MCP + Git：创建/检出开发分支 */
export function generateCheetahBranchWorkflowPrompt(params: {
  requirementUrl: string;
  featureDir: string;
  currentBranch: string;
  cheetahMcpService?: string;
}): string {
  const svc =
    params.cheetahMcpService?.trim() ||
    "（请在 Cursor MCP 中配置 Cheetah / 泳道 OpenAPI 服务名，并填入 Observatory 设置 observatory.mcp.cheetah）";
  return `# 开发分支工作流（Cheetah MCP + Git）

## 上下文
- 需求链接：${params.requirementUrl}
- SDD 目录：specs/${params.featureDir}/
- 当前分支：${params.currentBranch}

## 请执行
1. 使用 **Cheetah MCP**（服务标识：\`${svc}\`）按仓库/应用创建或解析与本需求对应的**开发分支**（可先 \`get_openapi_mcp_swimlane_app_branches\` 等工具查看现有分支）。
2. 在终端依次执行：\`git fetch\`（或按团队约定 \`git pull\`），再 \`git checkout <新分支名>\`。
3. 若 MCP 仅提供泳道/部署能力、无建分支工具：请通过团队 CICD 或远端仓库创建分支后，再在本机 fetch + checkout。

完成后请确认当前分支名与工作区状态。`;
}

/** 测试用例（集成 MCP 执行时） */
export function generateTestCasesPrompt(params: {
  cap: Capability;
  impactScenarios: string;
  legoMcpStatus: string;
  legoMcpInfo: string;
}): string {
  const c = params.cap;
  return `# Observatory — 测试用例生成与执行

${contextSection(c)}

## 影响场景
${params.impactScenarios}

## MCP
- 状态: ${params.legoMcpStatus}
- 服务/工具: ${params.legoMcpInfo}

未配置 MCP 时：仍可生成用例设计与数据说明，跳过实际调用；或手动执行后通过 API 导入 \`test-cases.json\`。

## 落盘
将结果写入 \`${sddPath(c)}/observatory/test-cases.json\`（须符合 \`test-cases.schema.json\`；扩展会校验并派生 \`test-cases.md\`）。对 request/expected/actual 做脱敏。

${trackingFooter(c.id)}`;
}
