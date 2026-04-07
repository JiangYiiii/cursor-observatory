/**
 * 自包含 SDD Prompt 生成（复制到 AI Agent）。
 * 末尾含 Observatory-Tracking-ID 供转录关联。
 */
import { normalizePhase, PHASE_TITLE } from "@/lib/kanban-utils";
import { resolveAdvanceKind } from "@/lib/requirement-utils";
import type { Capability } from "@/types/observatory";

export function trackingFooter(capabilityId: string | undefined): string {
  if (!capabilityId) {
    return "\n---\nObservatory-Tracking-ID: (新建需求完成后将写入 .capability-id)";
  }
  return `\n---\nObservatory-Tracking-ID: ${capabilityId}`;
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

function taskLine(cap: Capability): string {
  const ts = cap.sdd?.taskStats;
  if (!ts || ts.total <= 0) return "—";
  return `${ts.completed}/${ts.total} 完成`;
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

/** 执行测试 */
export function generateTestPrompt(cap: Capability, testSummary: string): string {
  return `# Observatory — 测试与验收

${contextSection(cap)}

## 当前测试数据（来自 Observatory）
${testSummary}

## 操作要求
1. Read \`${sddPath(cap)}/spec.md\` 中的验收场景。
2. 若你手写或编辑 **规范化 \`report.json\`**：\`test_cases\` **每一项**必须包含字符串字段 \`id\`、\`file\`、\`name\`、\`status\`（与 Observatory JSON Schema 一致）。模块汇总、Tier 等非单测文件级条目不得省略 \`file\`，请填占位 \`"_synthetic"\`。
3. **先判断仓库主技术栈**，再运行对应测试（勿默认假设 pytest）：
   - **Java / Maven**：仓库根有 \`pom.xml\` 时，使用 \`mvn test\`（JUnit / Surefire）；扩展可在测试结束后自动聚合 \`**/target/surefire-reports/TEST-*.xml\`。
   - **Java / Gradle**：存在 \`build.gradle\` / \`build.gradle.kts\` 时，使用 \`./gradlew test\`（或 Windows 下 \`gradlew.bat test\`）；报告可在 \`build/test-results/test/\`。
   - **Python / pytest**：若尚无目录则 \`mkdir -p ${sddPath(cap)}/test\`。使用 \`pytest-json-report\` 时可将原始 JSON 写到 **\`${sddPath(cap)}/test/pytest-report.json\`**（须与 \`specs/.active\` 首行 feature 名一致）。示例：\`pytest --json-report --json-report-file=${sddPath(cap)}/test/pytest-report.json\`。
   - **Node**：按 \`package.json\` 的 \`test\` 脚本（Jest / Vitest 等）执行。
4. **规范化测试结果**由扩展写入 **\`${sddPath(cap)}/test/report.json\`**（与 \`test-results.json\` 同内容、同目录；导入或聚合后生成）。无 SDD 时亦可落在根目录 **\`.observatory/report.json\`**。
5. 确认 \`capability_id\` 与测试映射一致（pytest 的 \`metadata\`/标记，或 JUnit 侧约定）。
6. 若需手动导入，使用 **Observatory: Import Test Report** 选择 JSON（pytest 或已规范化）或 JUnit XML。
7. 完成后 **Run Full Scan**。

${trackingFooter(cap.id)}`;
}

/** Bug 修复（新描述可选；无描述则修 bugfix-log 中 OPEN） */
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

/** 产物分析（analyze） */
export function generateAnalyzePrompt(cap: Capability): string {
  return `# Observatory SDD — 产物分析（Analyze，只读）

${contextSection(cap)}

## 你必须执行
1. Read \`spec.md\`、\`plan.md\`、\`tasks.md\`（须三者存在）。
2. **不要修改任何文件**；输出分析报告：重复、歧义、覆盖缺口、不一致、严重级别。
3. 用户确认后再由其他步骤修复。

${trackingFooter(cap.id)}`;
}

/** 发布（commit 标记） */
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

/** 推进需求：根据 resolveAdvanceKind 自动选择 */
export function generateAdvancePrompt(
  cap: Capability,
  testSummary: string
): string {
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
      return generateTestPrompt(cap, testSummary);
    case "release":
      return generateReleasePrompt(cap);
    default:
      return generateTestPrompt(cap, testSummary);
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
