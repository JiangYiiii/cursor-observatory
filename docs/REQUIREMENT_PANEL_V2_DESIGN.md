# 需求面板 V2 迭代设计方案

> 版本: 1.3  
> 日期: 2026-04-07  
> 状态: 评审修订版（v1.3 补充 5 项细化建议）

## 一、迭代概述

对需求面板进行全面升级，核心目标：

1. **Prompt 可配置化** — 各卡片阶段的 prompt 支持通过文件路径自定义加载
2. **Skill 优先调用** — 产物分析等环节优先检测并调用项目中的 SDD skill
3. **新增卡片** — 需求链接、影响场景分析、提交代码、环境部署、测试用例
4. **现有卡片改造** — 测试状态 → UT 测试，注入影响场景覆盖
5. **MCP 集成** — 环境部署和测试用例卡片通过 MCP 工具执行
6. **结果持久化** — 各阶段结构化数据统一保存到 `specs/<feature>/observatory/`

### 设计原则

每个卡片 = **一段可配置的 Prompt** + **状态/结果的持久化**。插件本身不执行业务逻辑，而是为 AI Agent 生成结构化的 Prompt，引导 Agent 调用对应的 skill 或 MCP 工具完成任务。

补充约束：

1. **插件负责探测，AI 负责执行**：skill 是否存在、MCP 是否已配置、上游产物是否可用，由扩展预检后再注入 Prompt，避免 AI 自行猜测。
2. **机读结果单一事实源**：下游卡片只依赖 JSON 结构化结果；Markdown 仅作为展示产物，**由扩展侧在 JSON 校验通过后自动渲染生成**，AI 不直接生成 `.md` 文件，不作为回写源。
3. **安全信息不进入 Prompt**：token、完整 MCP 连接串、敏感测试数据不写入 repo、不落入 webview、也不注入 Prompt。
4. **下游消费前必须校验新鲜度**：影响分析、测试用例、部署参数等结果都必须绑定生成时的 Git 状态，过期即提示重新生成。

---

## 二、卡片顺序（最终版）

从上到下排列：

| 序号 | 卡片 | 类型 | 触发方式 | Prompt 来源 | 数据持久化 |
|------|------|------|---------|-------------|-----------|
| 1 | 需求链接 | 配置型 | 手动编辑 | 无 | `observatory-sdd.json` → `requirementUrl` |
| 2 | SDD 产物 | 现有改造 | 按钮（设计方案/拆解任务/产物分析） | skill 优先 → 内置 | `specs/<feature>/` 下各产物 |
| 3 | 开发任务 | 现有保留 | 按钮（继续开发） | implement prompt | `tasks.md` |
| 4 | 影响场景 | **新增** | 手动触发（开发完成后） | skill 优先 → 内置 | `observatory/impact-analysis.json + .md` |
| 5 | UT 测试 | 现有改造 | 按钮（执行 UT） | 内置 + 影响场景注入 | `observatory/report.json` |
| 6 | 提交代码 | **新增** | 按钮（提交代码） | skill 优先 → 内置 | git commit |
| 7 | 环境部署 | **新增** | 按钮（部署泳道） | 内置 + MCP 探测结果 | `observatory-sdd.json` → `swimlane` |
| 8 | 测试用例 | **新增** | 按钮（生成并执行） | 内置 + MCP 探测结果 | `observatory/test-cases.json` |
| 9 | Bug 追踪 | 现有保留 | 按钮（Bug 修复） | 现有 | `bugfix-log.md` |
| 10 | 相关活动 | 现有保留 | 自动 | 无 | `ai-sessions.json` |

---

## 三、架构设计

### 3.1 总体架构

```
┌─ 插件配置层 ──────────────────────────────────────┐
│  observatory.prompt.templateDir: "path/to/prompts" │
│  observatory.skill.*: skill 路径配置               │
│  observatory.mcp.*: MCP 服务名/工具名配置           │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─ 能力探测层 ──────────────────────────────────────┐
│  preflight-resolver.ts                            │
│  skillStatus / mcpStatus / dataFreshness          │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─ Prompt 生成层 ──────────────────────────────────┐
│  prompt-generators.ts                             │
│  优先级：用户自定义文件 → 项目 skill → 内置默认    │
│  变量注入：{{sddPath}}, {{capabilityId}}, ...     │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─ 结果持久化层 ────────────────────────────────────┐
│  specs/<feature>/observatory/（目录名兼容 Observatory）│
│  ├── observatory-sdd.json  (requirementUrl / swimlane / deployServiceList 等) │
│  ├── impact-analysis.json  (影响场景-机读主数据)   │
│  ├── impact-analysis.md    (扩展从 JSON 派生)     │
│  ├── report.json           (UT 测试报告)          │
│  ├── test-cases.json       (测试用例结果)         │
│  └── test-cases.md         (扩展从 JSON 派生)     │
│  兼容读取旧路径 specs/<feature>/observatory-sdd.json │
└──────────────────────────────────────────────────┘
         │
         ▼
┌─ UI 展示层 ──────────────────────────────────────┐
│  RequirementDetail.tsx                            │
│  卡片渲染 + PromptDialog + MarkdownReviewDialog   │
└──────────────────────────────────────────────────┘
```

### 3.2 数据依赖链

```
需求链接 ──────────────────────────────→ 提交代码（commit msg 模板可引用链接/需求号）
SDD 产物 → 开发任务 → 影响场景分析 ──→ 新鲜度校验 ──→ UT 测试（按场景覆盖）
                                                   ├→ 环境部署（影响服务列表）
                                                   └→ 测试用例（按场景生成/执行）
```

### 3.3 Prompt 加载优先级

```
1. observatory.prompt.templateDir + <stage>.md   （用户自定义模板文件）
2. observatory.skill.<stage> 配置的 skill 路径    （显式配置的 skill）
3. .cursor/skills/<stage>/SKILL.md               （项目中自动检测的 skill）
4. prompt-generators.ts 内置默认                  （兜底）
```

### 3.4 能力探测与状态注入

Prompt 生成前由扩展执行预检，并把探测结果注入模板变量：

- `skillStatus.<stage>`：`found | missing | invalid`
- `mcpStatus.<stage>`：`configured | service_missing | tool_missing | malformed`
- `dataFreshness.<artifact>`：`fresh | stale | missing | invalid`

规则：

1. Prompt 不再要求 AI 自行判断本地 skill/MCP 是否存在
2. Prompt 只描述“已检测到什么能力、接下来应该怎么做”
3. 若能力缺失，直接在 UI 显示明确原因和修复指引

### 3.5 项目适配层

本方案拆分为：

- **核心层**：Prompt 模板加载、Schema 校验、卡片编排、结果持久化
- **项目适配层**：模块识别、可部署应用识别、测试命令建议、影响服务提取

首版提供两类适配器：

1. `java-spring`：识别 `@SpringBootApplication`、多模块应用、Maven/Gradle 测试
2. `generic`：不假设后端框架，仅提供文件级影响分析和通用测试/提交引导

---

## 四、新增配置项

在 `extension/package.json` → `configuration.properties` 中新增：

### 4.1 Prompt 模板配置

```json
"observatory.prompt.templateDir": {
  "type": "string",
  "default": "",
  "description": "自定义 prompt 模板目录路径，支持 ${workspaceFolder}。目录下按卡片阶段命名覆盖默认 prompt：specify.md、plan.md、tasks.md、implement.md、analyze.md、impact-analysis.md、ut-test.md、code-submit.md、deploy.md、test-case.md。未找到的使用内置默认。"
}
```

### 4.2 Skill 路径配置

```json
"observatory.skill.analyze": {
  "type": "string",
  "default": "",
  "description": "SDD analyze skill 路径，如 .cursor/skills/analyze/SKILL.md。留空时自动检测项目中的 skill，仍无则使用内置默认 prompt。"
},
"observatory.skill.codeSubmit": {
  "type": "string",
  "default": "",
  "description": "code-submit skill 路径。留空时自动检测项目中的 skill，仍无则使用内置默认 prompt。"
}
```

### 4.3 MCP 服务配置

```json
"observatory.mcp.cicd": {
  "type": "string",
  "default": "",
  "description": "CICD MCP 服务名，如 cicd-feature-branch。仅保存服务标识，不保存 token 或完整 URL。"
},
"observatory.mcp.testRunner": {
  "type": "string",
  "default": "",
  "description": "测试执行 MCP 服务名，如 lego。仅保存服务标识，不保存 token 或完整 URL。"
},
"observatory.mcp.cicdTool": {
  "type": "string",
  "default": "swimlane_deploy",
  "description": "CICD MCP 默认调用工具名。"
},
"observatory.mcp.testRunnerTool": {
  "type": "string",
  "default": "run_test_case",
  "description": "测试执行 MCP 默认调用工具名。"
}
```

### 4.4 模板变量列表

Prompt 模板文件中支持以下占位符，运行时自动替换：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `{{sddPath}}` | SDD 工作区路径 | `specs/add-user-auth` |
| `{{capabilityId}}` | 能力 ID | `sdd:add-user-auth` |
| `{{title}}` | 需求标题 | `新增用户认证` |
| `{{phase}}` | 当前阶段 | `developing` |
| `{{contextSection}}` | 需求上下文（自动生成的多行摘要） | — |
| `{{testSummary}}` | 测试统计摘要 | — |
| `{{requirementUrl}}` | 需求链接 | `https://tapd.cn/...` |
| `{{impactScenarios}}` | 影响场景列表（MD 格式） | — |
| `{{totalScenarios}}` | 总影响场景数 | `12` |
| `{{currentBranch}}` | 当前 git 分支 | `feature/add-user-auth` |
| `{{affectedServices}}` | 影响服务列表 | `user-service, order-service` |
| `{{swimlane}}` | 泳道名（已缓存/待填写） | `my-feature` |
| `{{cicdMcpInfo}}` | CICD MCP 已探测到的服务名/工具名 | `cicd-feature-branch / swimlane_deploy` |
| `{{legoMcpInfo}}` | 测试 MCP 已探测到的服务名/工具名 | `lego / run_test_case` |
| `{{cicdMcpStatus}}` | CICD MCP 探测状态 | `configured` |
| `{{legoMcpStatus}}` | 测试 MCP 探测状态 | `missing` |
| `{{impactFreshness}}` | 影响分析新鲜度 | `fresh` |
| `{{testCasesFreshness}}` | 测试用例结果新鲜度 | `stale` |
| `{{trackingFooter}}` | Observatory 追踪 ID 脚注 | — |

---

## 五、各卡片详细设计

### 5.1 需求链接卡片

**功能**：配置并展示当前需求关联的外部链接（如 TAPD 需求页）。

**数据存储**：`specs/<feature>/observatory-sdd.json` 新增 `requirementUrl` 字段。

**UI 设计**：

```
┌─ 需求链接 ──────────────────────────────────────┐
│  https://www.tapd.cn/tapd_fe/66865340/sto...    │
│  [📋 复制]  [✏️ 编辑]                            │
└─────────────────────────────────────────────────┘
```

- 默认单行展示，`text-overflow: ellipsis`
- 复制按钮：使用已有 `copyToClipboard` 工具函数
- 编辑模式：切换为 `<input>` 框，保存时通过 `PUT /api/observatory/sdd-config` 写回 `observatory-sdd.json` 中的 `requirementUrl` 字段

---

### 5.2 SDD 产物卡片（改造）

**改造点**：「产物分析」按钮必须引导调用 SDD analyze skill。

**Prompt 生成逻辑**：

```typescript
export async function generateAnalyzePrompt(cap: Capability): Promise<string> {
  // 1. 检查 observatory.skill.analyze 显式配置
  // 2. 自动检测 .cursor/skills/analyze/SKILL.md
  // 3. 上述都不存在 → 使用内置默认（升级版）
}
```

**内置默认 prompt（升级版）**：对齐 cash_loan `analyze/SKILL.md` 的分析深度，含五大检测维度（重复、歧义、未明确项、覆盖差距、不一致性）和四级严重性（CRITICAL / HIGH / MEDIUM / LOW），但去掉项目专属路径约定。

参考 skill 位置：`~/Documents/codedev/cash_loan/.cursor/skills/analyze/SKILL.md`

---

### 5.3 开发任务卡片（保留）

现有实现不变。

---

### 5.4 影响场景分析卡片（新增，核心）

**触发时机**：手动触发，在开发完成后点击「分析影响」按钮。

**数据模型**：

```typescript
interface ImpactAnalysisResult {
  schema_version: string;       // "1.0"
  analyzed_at: string;          // ISO8601
  base_ref: string;             // 对比的基准分支或 commit
  workspace_branch: string;     // 生成时所在分支
  head_commit: string;          // 生成时 HEAD commit
  working_tree_fingerprint: string;   // 工作区指纹，含 staged/unstaged/untracked 摘要
  generated_from_changed_files: string[]; // 参与分析的文件列表
  summary: {
    total_scenarios: number;
    high_impact: number;
    medium_impact: number;
    low_impact: number;
    affected_modules: number;
    affected_applications: number;
  };
  scenarios: ImpactScenario[];
  affected_modules: AffectedModule[];
  changed_files: ChangedFile[];
}

interface ImpactScenario {
  id: string;                   // SCENARIO_001 格式（三位及以上数字）
  name: string;                 // 场景名称（中文）
  impact: 'high' | 'medium' | 'low';
  anchor_id?: string;           // @ai.doc 锚点 ID
  description: string;
  related_files: string[];
  module: string;
}

interface AffectedModule {
  name: string;
  path: string;
  is_application: boolean;      // 有启动类 = 可部署应用
  entry_class?: string;         // 如 XxxApplication.java
  scenario_count: number;
  scenario_ids: string[];
}

interface ChangedFile {
  path: string;
  change_type: 'modified' | 'added' | 'deleted';
  module: string;
  has_ai_doc: boolean;
  anchor_ids: string[];
}
```

**新鲜度约束**：

- `impact-analysis.json` 保存时记录 `base_ref + workspace_branch + head_commit + working_tree_fingerprint`
- 下游卡片消费前重新计算当前 Git 指纹
- 若分支、HEAD 或工作区指纹不一致，则标记为 `stale`，要求用户重新执行影响分析

**`working_tree_fingerprint` 计算方式**：

```bash
# 扩展侧计算，不由 AI 填写
fingerprint = SHA256(
  git diff --binary HEAD 2>/dev/null                 # tracked 文件的真实 patch 内容
  + git diff --binary --cached 2>/dev/null           # staged patch 内容
  + for file in $(git ls-files --others --exclude-standard | sort); do
      echo "FILE:$file"
      shasum -a 256 "$file" 2>/dev/null || echo "MISSING:$file"
    done
)
```

要求：

- 指纹必须基于**真实内容**而不是 `--stat` / `status` 摘要，避免“内容已变但统计特征未变”的误判
- 至少纳入：文件路径、文件状态、patch 内容或文件内容摘要
- 此字段由**扩展在保存 JSON 时自动注入**，Prompt 中不要求 AI 计算

**变更文件获取策略（三模式 + 自动 base 推断）**：

```
模式 A（推荐）：对比基准分支
  1. git branch --show-current → 当前分支
  2. 推断基准分支：用户指定 > 当前分支 upstream > origin/feature_branch_master > origin/master > origin/main
  3. git merge-base <base_ref> HEAD → 分叉点
  4. git diff --name-only <merge_base>..HEAD → 已 commit 的全部变更
  5. 补充未提交变更：git diff HEAD + git diff --cached + git ls-files --others
  6. 合并去重

模式 B（降级）：仅工作区变更
  适用于无远程/新仓库，使用 git diff HEAD + git ls-files --others

模式 C（兜底）：SDD 任务回溯
  从 tasks.md 提取任务引用的文件路径
```

**@ai.doc 增强注解优先**：

Prompt 中明确指导 AI：
1. 优先扫描变更文件中的 `@ai.doc` 注解，提取锚点 ID
2. 通过 `docs/domain/**/meta/ai-index-*.json` 索引反查关联业务流程
3. 没有 `@ai.doc` 注解时，才通过类名、方法签名、调用链推断场景

**应用模块识别**：

- `java-spring` 适配器：查找含 `@SpringBootApplication` 或 `public static void main` 的类
- 命中的模块判定为可部署应用，记录启动类名
- `generic` 适配器：不推断可部署应用，仅输出文件/目录级影响
- 项目初始化时可预扫描缓存到 `.observatory/app-modules.json`

**存储**：
- `specs/<feature>/observatory/impact-analysis.json` — 结构化数据（机读，有 Schema 约束；**AI 只生成此文件**）
- `specs/<feature>/observatory/impact-analysis.md` — 由**扩展侧**在 JSON 校验通过后自动渲染的 Markdown 报告（人读，弹窗展示，只读；AI 不直接生成此文件）

**UI 设计**：

```
┌─ 影响场景分析 ─────────────────────────────────┐
│  共影响 12 个场景 · 3 个应用模块                │
│  高: 3  中: 5  低: 4                            │
│  [分析影响]  [查看详情]                          │
└─────────────────────────────────────────────────┘
```

- 点击「分析影响」→ 生成 prompt → PromptDialog 复制给 Agent
- 点击「查看详情」→ 打开 MarkdownReviewDialog，读取 `impact-analysis.md`
- 若 JSON 已过期，则详情页顶部显示“当前报告基于旧代码状态生成”，并附带「重新分析」按钮
- **失败/中断恢复**：若上次分析不完整（JSON 校验失败或写入中断），卡片状态显示「分析异常」，用户点击「重新分析」时生成完整 Prompt 执行全量重新分析。由于影响分析是全量操作（完整扫描变更文件），暂不支持增量/局部重跑

**新增 UI 组件**：`MarkdownReviewDialog`，默认只读渲染 Markdown，基于 `react-markdown` 或 `marked` + `DOMPurify`。对于 `impact-analysis.md`、`test-cases.md` 这类派生文件，不提供编辑入口，避免人读版与机读版分叉。

参考 skill 位置：`~/Documents/codedev/cash_loan/.cursor/skills/repay-impact-analysis/SKILL.md`

---

### 5.5 UT 测试卡片（改造，原「测试状态」）

**改造点**：
- 标题 `测试状态` → `UT 测试`
- Prompt 中注入影响场景列表，引导 AI 按场景逐一编写 UT
- 统计维度增加：已覆盖影响场景数 / 总影响场景数

**Prompt 中注入影响场景**：

```typescript
function injectImpactScenarios(cap: Capability): string {
  const path = `${sddPath(cap)}/observatory/impact-analysis.json`;
  try {
    const data = readAndValidate(path, impactAnalysisSchema);
    if (!isImpactAnalysisFresh(cap, data)) {
      return '⚠️ 影响分析结果已过期，请先重新执行「影响场景分析」';
    }
    if (data.scenarios.length === 0) {
      return '⚠️ 影响分析结果为空，请先执行「影响场景分析」';
    }
    return data.scenarios.map(s =>
      `- [${s.impact.toUpperCase()}] ${s.id}: ${s.name} — ${s.description}`
    ).join('\n');
  } catch {
    return '⚠️ 影响分析结果不可用，请先执行或重新执行「影响场景分析」';
  }
}
```

**Prompt 要求**：
- 检测项目中是否有 UT skill（如 `.cursor/skills/ut/SKILL.md`），有则遵循其编码规范
- 对每个影响场景编写 UT，覆盖正常/异常/边界
- 测试完成后统计场景覆盖数
- 根据项目适配器推荐测试命令，不默认假设 pytest / Maven / Gradle 之外的实现

**UI 设计**：

```
┌─ UT 测试 ──────────────────────────────────────┐
│  用例: 通过 8 / 失败 2 / 总计 10                │
│  场景覆盖: 9/12 (75%)                           │
│  ████████████░░░░ 75%                            │
│  [执行 UT]                                       │
└─────────────────────────────────────────────────┘
```

参考 skill 位置：`~/Documents/codedev/cash_loan/.cursor/skills/ut/SKILL.md`

---

### 5.6 提交代码卡片（新增）

**Skill 检测逻辑**：

```
1. observatory.skill.codeSubmit 显式配置
2. .cursor/skills/code-submit/SKILL.md
3. .cursor/skills/repay-code-submit/SKILL.md
4. 内置默认 prompt
```

**与需求链接集成**：Prompt 中携带 `requirementUrl`，指导 AI 在 commit message 中优先引用需求链接或需求号；格式支持通过模板配置，避免强绑定完整 URL。

**内置默认 prompt（精简通用版）**：

```markdown
# Observatory — 提交代码

## 需求链接
{{requirementUrl}}

## 执行步骤

### 1. 检查变更
获取所有待提交文件（tracked 修改 + untracked 新文件）。

### 2. 生成 Commit Message
- 分析需求链接对应的需求内容
- 总结代码变更的目的和影响
- 格式: `[模块]type: 一句话描述`
- 若仓库配置了提交模板，则按模板填充需求链接或需求号

### 3. 执行提交
git add + git commit

### 4. 确认
展示提交结果。
```

如果项目中存在 `code-submit` skill（如 cash_loan 的完整 7 步流程：UT检查 → Code Review → 文档更新 → Commit → Arc Diff → Arc Land），则引导 AI 读取并执行该 skill。

参考 skill 位置：`~/Documents/codedev/cash_loan/.cursor/skills/code-submit/SKILL.md`

**UI 设计**：

```
┌─ 提交代码 ──────────────────────────────────────┐
│  最近提交: abc1234 [还款]feat: xxx (可选展示)     │
│  [提交代码]                                      │
└─────────────────────────────────────────────────┘
```

最近提交行通过 `git log -1 --oneline` 获取，展示最近一次 commit 的简要信息，帮助用户确认当前 git 状态。若无 commit 则不展示。

---

### 5.7 环境部署卡片（新增）

**设计理念**：插件先完成 MCP 预检，再把“服务名/工具名/探测状态”注入 Prompt；AI 不再自行判断本地是否已安装可用。

**数据**：
- 当前分支：`git branch --show-current` 自动获取
- 泳道：用户手动填写，缓存在 `observatory-sdd.json` → `swimlane`
- 影响服务：从 `impact-analysis.json` 的 `affected_modules`（`is_application: true`）获取；若当前为 `generic` 适配器，则仅展示受影响目录，不展示部署服务

**新鲜度与继续策略**：

- 若 `impact-analysis.json` 为 `fresh`，可直接使用分析结果中的 `affectedServices`
- 若 `impact-analysis.json` 为 `stale` / `missing` / `invalid`，默认**禁止直接部署**
- 用户若仍要继续，必须先打开“手动确认服务列表”交互，显式确认或编辑本次要部署的服务列表后，才允许继续部署
- 该交互属于一次性确认，不回写覆盖 `impact-analysis.json`，仅作为本次部署参数来源

**Prompt 设计**：

```markdown
# Observatory — 环境部署

{{contextSection}}

## 部署信息
- 当前分支: {{currentBranch}}
- 泳道: {{swimlane}}
- 影响的应用服务: {{affectedServices}}
- 影响分析新鲜度: {{impactFreshness}}

## MCP 探测结果
- 状态: {{cicdMcpStatus}}
- 服务/工具: {{cicdMcpInfo}}

如果状态不是 `configured`：
- 引导用户：前往 Cursor 设置 → MCP 配置 → 添加对应的 CICD 服务
- 给出配置示例格式（不含 token）：`"mcpServers": { "<服务名>": { "type": "streamableHttp", "url": "<URL>" } }`
- 若用户选择跳过部署，可在提交代码后手动部署

如果 `impactFreshness` 不是 `fresh`：
- 默认不直接调用部署工具
- 提示用户优先重新执行「影响场景分析」
- 若用户坚持继续，则要求其先手动确认本次部署服务列表，再继续后续步骤

## 执行步骤
1. 确认部署参数（服务列表、分支、泳道）
2. 使用 CICD MCP 的 swimlane_deploy 工具部署
3. 部署后自动查询状态
4. 将泳道名缓存到 observatory-sdd.json
```

**说明**：

- 扩展配置中只保存 MCP 服务名和工具名
- 实际连接串、token 由用户在本地 Cursor MCP 配置中维护
- Prompt 与持久化文件都不记录明文 token

参考 skill 位置：`~/Documents/codedev/cash_loan/.cursor/skills/cheetah-swimlane/SKILL.md`

**UI 设计**：

```
┌─ 环境部署 ──────────────────────────────────────┐
│  分支: feature/add-user-auth                     │
│  泳道: [my-feature        ] (可编辑，缓存)       │
│  影响服务: user-service, order-service (2)        │
│  [部署泳道]                                      │
└─────────────────────────────────────────────────┘
```

- 当 `impactFreshness = stale` 时，卡片显示警告文案“当前服务列表基于旧影响分析结果生成”
- 点击「部署泳道」时：
  - `fresh`：直接生成部署 Prompt
  - `stale/missing/invalid`：先弹出“手动确认服务列表”对话框
- “手动确认服务列表”对话框要求：
  - 默认展示当前解析出的服务列表
  - 支持用户增删改单个服务项
  - 需要显式勾选“我已确认本次部署服务列表”后才能继续
  - 确认后仅把该列表作为本次 Prompt 的 `affectedServices` 注入值，不覆盖影响分析结果

---

### 5.8 测试用例卡片（新增）

**Prompt 设计**：

```markdown
# Observatory — 测试用例生成与执行

{{contextSection}}

## 影响场景
{{impactScenarios}}

## MCP 工具
- 状态: {{legoMcpStatus}}
- 服务/工具: {{legoMcpInfo}}

如果状态不是 `configured`：
- 引导用户：前往 Cursor 设置 → MCP 配置 → 添加测试 MCP 服务
- 给出配置示例格式（不含 token）
- 即使无 MCP，仍可生成测试用例设计文档，跳过实际接口调用步骤
- 若手动执行测试后获取结果，允许通过 `PUT /api/observatory/test-cases` 直接导入

## 执行步骤

### 1. 根据影响场景生成测试用例
对每个影响场景：
- 分析业务流程和接口
- 生成测试环境数据（订单等）
- 设计调用参数和预期结果

### 2. 使用 MCP 执行测试
- 调用对应场景的接口
- 验证返回结果
- 记录通过/失败
- 结果落盘前对 request / expected / actual 做脱敏，避免敏感字段直接进入持久化文件

### 3. 保存结果
保存到 {{sddPath}}/observatory/test-cases.json
```

**说明**：

- 扩展配置中只保存 MCP 服务名和工具名
- 实际连接串、token 由用户在本地 Cursor MCP 配置中维护
- Prompt 与持久化文件都不记录明文 token
- `test-cases.md` 由扩展在 `test-cases.json` 校验通过后自动渲染生成，供「查看详情」只读展示

**测试用例结果 Schema**：

```typescript
interface TestCasesResult {
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
  cases: TestCaseEntry[];
}

interface TestCaseEntry {
  id: string;
  scenario_id: string;        // 关联 impact-analysis 的 SCENARIO_xxx
  scenario_name: string;
  description: string;
  request: Record<string, unknown>;
  expected: Record<string, unknown>;
  actual?: Record<string, unknown>;
  redacted_fields?: string[]; // 已脱敏字段列表
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  error_message?: string;
}
```

**新鲜度约束**：

- `test-cases.json` 保存时绑定生成所依据的 `impact-analysis.json` 指纹和当前 Git 状态
- 当 `impact-analysis.json` 已更新、当前分支变化、或工作区指纹变化时，测试用例卡片标记为 `stale`
- UI 应明确区分“历史执行结果”和“可用于当前版本验证的结果”

**UI 设计**：

```
┌─ 测试用例 ──────────────────────────────────────┐
│  场景: 12 | 已生成: 8 | 通过: 6 | 失败: 2       │
│  ████████████░░░░ 66%                             │
│  [生成并执行测试]  [查看详情]                     │
└──────────────────────────────────────────────────┘
```

- **失败/局部重跑**：测试用例支持选择性重跑。若部分用例执行失败，用户可点击「重跑失败用例」，生成仅包含 `status: failed` 用例的 Prompt，AI 重新执行并更新对应条目的 `actual`、`status`、`error_message`，而不重新生成全部用例
- **中断恢复**：若执行中断（部分用例已有结果），保留已完成的用例结果，允许用户点击「继续执行」仅补跑 `status: pending` 的用例
- 点击「查看详情」→ 打开 `MarkdownReviewDialog`，读取扩展派生的 `test-cases.md`

---

### 5.9 Bug 追踪 & 相关活动（保留）

现有实现不变，位置调整至卡片列表末尾。

---

## 六、JSON Schema 校验机制

### 6.1 必要性

存在数据依赖链：影响场景 → UT 测试 / 环境部署 / 测试用例。如果 AI 输出格式不一致，下游卡片解析失败。

### 6.2 四层保障

**第一层：Prompt 中嵌入强制 Schema**

每个需要保存结构化数据的 prompt 末尾，必须附上完整的 JSON 示例和字段规则：

```
⚠️ 结果文件格式要求（必须严格遵循）

保存到 {{sddPath}}/observatory/impact-analysis.json 时，
必须完全符合以下 JSON Schema，不得增减字段或改变类型。

关于 summary 字段：请如实填写各聚合值，扩展端会基于明细数据重新校验并以实际值覆盖。
关于 base_ref / head_commit / working_tree_fingerprint 等字段：
由扩展自动注入，你可以留空或填写当前值，扩展会以实际 Git 状态为准覆盖。
```

**第二层：扩展侧 AJV 校验**

在 `extension/src/observatory/` 中使用已有的 AJV 依赖做 Schema 校验。新增 schema 文件：

- `schemas/impact-analysis.schema.json`
- `schemas/test-cases.schema.json`

**校验时序**（关键）：扩展检测到 JSON 文件写入后，按以下顺序处理：

```
1. 读取 AI 生成的原始 JSON
2. 注入扩展管理字段（base_ref、head_commit、working_tree_fingerprint 等）
3. 重算 summary（基于明细数据覆盖 AI 填写的聚合值）
4. 执行 AJV 结构校验（此时所有 required 字段均已就位）
5. 执行语义校验（唯一性、引用完整性）
6. 校验通过 → 持久化最终 JSON → 渲染派生 .md → WebSocket 广播刷新
7. 校验失败 → 广播警告事件 → UI 显示错误
```

即 **注入 → 重算 → 校验 → 持久化 → 渲染 → 广播**。AI 生成的原始 JSON 中扩展管理字段可缺失或为占位值，不会导致校验失败。

校验失败时：
- WebSocket 广播警告事件
- UI 卡片显示「格式异常，需重新分析」
- 不将脏数据传递给下游

**第三层：语义校验 + 新鲜度校验**

- `summary` 由扩展侧基于 `scenarios` / `affected_modules` 重新计算，不信任 AI 直接填写的聚合值
- 校验 `scenario.id`、`scenario_ids`、`anchor_ids` 唯一性与引用完整性
- 校验 `impact-analysis.json` 与当前 Git 状态是否一致，不一致标记为 `stale`

**第四层：下游容错**

下游 prompt 生成时，对上游数据做 try-catch 容错，数据不可用时提示用户先执行上游步骤。

### 6.3 影响分析 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "analyzed_at",
    "base_ref",
    "workspace_branch",
    "head_commit",
    "working_tree_fingerprint",
    "generated_from_changed_files",
    "summary",
    "scenarios",
    "affected_modules",
    "changed_files"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0" },
    "analyzed_at": { "type": "string", "format": "date-time" },
    "base_ref": {
      "type": "string",
      "description": "对比基准。模式 A 时为 merge-base commit；模式 B 时为 'WORKING_TREE_ONLY'；模式 C 时为 'TASKS_FALLBACK'。由扩展注入，AI 可不填。"
    },
    "workspace_branch": {
      "type": "string",
      "description": "生成时所在分支。由扩展注入。无 commit 时为 'NO_BRANCH'。"
    },
    "head_commit": {
      "type": "string",
      "description": "生成时 HEAD commit SHA。由扩展注入。全新仓库时为 'NO_COMMITS'。"
    },
    "working_tree_fingerprint": {
      "type": "string",
      "description": "工作区指纹。由扩展注入，AI 不填写。"
    },
    "generated_from_changed_files": {
      "type": "array",
      "items": { "type": "string", "minLength": 1 },
      "uniqueItems": true,
      "minItems": 1,
      "description": "参与分析的文件列表。AI 填写实际分析的文件。"
    },
    "summary": {
      "type": "object",
      "additionalProperties": false,
      "required": ["total_scenarios", "high_impact", "medium_impact", "low_impact", "affected_modules", "affected_applications"],
      "properties": {
        "total_scenarios": { "type": "integer", "minimum": 0 },
        "high_impact": { "type": "integer", "minimum": 0 },
        "medium_impact": { "type": "integer", "minimum": 0 },
        "low_impact": { "type": "integer", "minimum": 0 },
        "affected_modules": { "type": "integer", "minimum": 0 },
        "affected_applications": { "type": "integer", "minimum": 0 }
      }
    },
    "scenarios": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "name", "impact", "module"],
        "properties": {
          "id": { "type": "string", "pattern": "^SCENARIO_\\d{3,}$" },
          "name": { "type": "string", "minLength": 1 },
          "impact": { "enum": ["high", "medium", "low"] },
          "anchor_id": { "type": "string" },
          "description": { "type": "string" },
          "related_files": { "type": "array", "items": { "type": "string" } },
          "module": { "type": "string" }
        }
      }
    },
    "affected_modules": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["name", "path", "is_application", "scenario_count"],
        "properties": {
          "name": { "type": "string" },
          "path": { "type": "string" },
          "is_application": { "type": "boolean" },
          "entry_class": { "type": "string" },
          "scenario_count": { "type": "integer", "minimum": 0 },
          "scenario_ids": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
        }
      }
    },
    "changed_files": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["path", "change_type", "module"],
        "properties": {
          "path": { "type": "string" },
          "change_type": { "enum": ["modified", "added", "deleted"] },
          "module": { "type": "string" },
          "has_ai_doc": { "type": "boolean" },
          "anchor_ids": { "type": "array", "items": { "type": "string" }, "uniqueItems": true }
        }
      }
    }
  }
}
```

> **扩展注入字段说明**：
> - `summary`：AI 应如实填写，但保存前由扩展端基于 `scenarios` / `affected_modules` 重新计算并覆盖，避免与明细数据不一致。
> - `base_ref`、`workspace_branch`、`head_commit`、`working_tree_fingerprint`：均由扩展在保存 JSON 时自动注入或覆盖。AI 可填写也可留空，扩展以实际 Git 状态为准。
> - `generated_from_changed_files`：AI 应填写实际分析过的文件列表；若缺失或为空，扩展应以本次变更文件解析结果兜底注入，禁止落空。
> - 模式 B（无远程分支）时 `base_ref` = `"WORKING_TREE_ONLY"`；模式 C（任务回溯）时 `base_ref` = `"TASKS_FALLBACK"`；全新仓库时 `head_commit` = `"NO_COMMITS"`。

### 6.4 测试用例 JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "additionalProperties": false,
  "required": [
    "schema_version",
    "executed_at",
    "source_impact_analysis_head_commit",
    "source_impact_analysis_fingerprint",
    "workspace_branch",
    "head_commit",
    "working_tree_fingerprint",
    "summary",
    "cases"
  ],
  "properties": {
    "schema_version": { "type": "string", "const": "1.0" },
    "executed_at": { "type": "string", "format": "date-time" },
    "source_impact_analysis_head_commit": {
      "type": "string",
      "description": "生成测试用例时所使用的 impact-analysis.json 对应 head_commit。由扩展注入。"
    },
    "source_impact_analysis_fingerprint": {
      "type": "string",
      "description": "生成测试用例时所使用的 impact-analysis.json 对应 working_tree_fingerprint。由扩展注入。"
    },
    "workspace_branch": {
      "type": "string",
      "description": "执行测试时所在分支。由扩展注入。"
    },
    "head_commit": {
      "type": "string",
      "description": "执行测试时 HEAD commit。由扩展注入。"
    },
    "working_tree_fingerprint": {
      "type": "string",
      "description": "执行测试时工作区指纹。由扩展注入。"
    },
    "summary": {
      "type": "object",
      "additionalProperties": false,
      "required": ["total_scenarios", "generated_cases", "passed", "failed", "skipped"],
      "properties": {
        "total_scenarios": { "type": "integer", "minimum": 0 },
        "generated_cases": { "type": "integer", "minimum": 0 },
        "passed": { "type": "integer", "minimum": 0 },
        "failed": { "type": "integer", "minimum": 0 },
        "skipped": { "type": "integer", "minimum": 0 }
      }
    },
    "cases": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["id", "scenario_id", "scenario_name", "description", "request", "expected", "status"],
        "properties": {
          "id": { "type": "string", "minLength": 1 },
          "scenario_id": {
            "type": "string",
            "pattern": "^SCENARIO_\\d{3,}$",
            "description": "关联 impact-analysis.json 的 scenario ID"
          },
          "scenario_name": { "type": "string", "minLength": 1 },
          "description": { "type": "string" },
          "request": { "type": "object" },
          "expected": { "type": "object" },
          "actual": { "type": "object" },
          "redacted_fields": {
            "type": "array",
            "items": { "type": "string" },
            "description": "已脱敏的字段路径列表"
          },
          "status": { "enum": ["passed", "failed", "skipped", "pending"] },
          "error_message": { "type": "string" }
        }
      }
    }
  }
}
```

> **语义校验**：
> - 保存时扩展端校验每个 `case.scenario_id` 在当前 `impact-analysis.json` 的 `scenarios[].id` 中存在（引用完整性）。
> - `summary` 由扩展基于 `cases` 重新计算。
> - `source_impact_analysis_head_commit` / `source_impact_analysis_fingerprint` 必须与测试生成时使用的影响分析结果一致。
> - 当当前 `impact-analysis.json` 的指纹与 `test-cases.json` 记录不一致时，UI 标记测试用例结果为 `stale`。

---

## 七、变更文件获取策略

影响场景分析需要获取「本需求涉及的全部变更文件」，但代码可能处于不同的 git 状态。

### 7.1 问题场景

| 时间点 | Git 状态 | `git diff HEAD` | 问题 |
|--------|----------|-----------------|------|
| 开发中 | 改了文件未 stage | 能拿到 | 无 |
| stage 后未 commit | 已 add | `git diff --cached` 能拿 | 无 |
| 已 commit 未 push | 本地 commit | `git diff HEAD` 为空 | **丢失** |
| 多次 commit | 多个本地 commit | 只看增量 | **不完整** |
| 全新仓库 | 无 HEAD | 报错 | **异常** |

### 7.2 解决方案：三模式分层获取

**模式 A — 对比基准分支（推荐）**

```bash
# 1. 获取当前分支
git branch --show-current

# 2. 推断基准分支（按优先级尝试）
#    用户显式指定 > 当前分支 upstream > origin/feature_branch_master > origin/master > origin/main

# 3. 计算分叉点
git merge-base <base_ref> HEAD

# 4. 获取从分叉点到 HEAD 的全部变更
git diff --name-only <merge_base>..HEAD

# 5. 补充工作区未提交变更
git diff --name-only HEAD
git diff --name-only --cached
git ls-files --others --exclude-standard

# 6. 合并去重
```

补充规则：

- 首次分析时在 UI 中展示“本次使用的基准分支 / merge-base”，允许用户手动确认或改写
- 成功分析后把 `base_ref` 写入 `impact-analysis.json`
- 重新分析默认沿用最近一次用户确认过的 `base_ref`

**模式 B — 仅工作区变更（降级）**

模式 A 失败时（无远程分支、全新仓库等）：

```bash
git diff --name-only HEAD 2>/dev/null
git diff --name-only --cached 2>/dev/null
git ls-files --others --exclude-standard
```

若 HEAD 不存在：`git ls-files` + `git ls-files --others --exclude-standard`

**模式 C — SDD 任务回溯（兜底）**

前两个模式均未获取到有效文件时，从 `tasks.md` 提取任务中引用的文件路径。

---

## 八、新增 API 端点

在 `extension/src/server/local-server.ts` 中新增：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/observatory/impact-analysis` | 读取影响分析数据 |
| PUT | `/api/observatory/impact-analysis` | 保存影响分析结果 |
| GET | `/api/observatory/test-cases` | 读取测试用例结果 |
| PUT | `/api/observatory/test-cases` | 保存测试用例结果 |
| GET | `/api/observatory/sdd-config` | 读取需求级配置（`requirementUrl`、`swimlane` 等，来自 `observatory-sdd.json`） |
| PUT | `/api/observatory/sdd-config` | 保存需求级配置（支持部分更新，只覆盖请求体中包含的字段） |
| GET | `/api/observatory/prompt-template/:stage` | 获取 prompt 模板（含自定义加载逻辑） |

约束：

- 服务端从当前激活 workspace 推断 `root`，不信任前端透传任意路径
- `feature` 仅允许 capability/feature 名称安全字符集
- 所有最终访问路径必须经过 `resolve + normalize + workspaceRoot` 前缀校验
- 对派生文件（如 `impact-analysis.md`）只开放只读接口，不开放直接编辑接口

---

## 九、新增 UI 组件

### 9.1 MarkdownReviewDialog

用于影响分析、测试用例等卡片的详情弹窗。

**功能**：
- Markdown 渲染模式（默认只读）
- 对派生文件禁用编辑模式
- 后续若需要补充人工备注，单独落到 `*-notes.md`，不覆盖派生结果

展示对象：

- `impact-analysis.md`
- `test-cases.md`

**依赖**：`react-markdown` 或 `marked` + `DOMPurify`（需新增到 `webview-ui/package.json`）

### 9.2 RequirementDetail 卡片拆分

当前所有卡片内联在 `RequirementDetail.tsx` 中。随着卡片增多至 10 个，建议拆分为独立组件：

```
webview-ui/src/components/kanban/cards/
├── RequirementUrlCard.tsx      // 需求链接
├── SddArtifactsCard.tsx        // SDD 产物
├── DevTasksCard.tsx            // 开发任务
├── ImpactAnalysisCard.tsx      // 影响场景分析
├── UtTestCard.tsx              // UT 测试
├── CodeSubmitCard.tsx          // 提交代码
├── DeployCard.tsx              // 环境部署
├── TestCasesCard.tsx           // 测试用例
├── BugTrackingCard.tsx         // Bug 追踪
└── ActivityCard.tsx            // 相关活动
```

`RequirementDetail.tsx` 简化为卡片编排容器。

---

## 十、实现分期

### Phase 1 — 基础设施

- [ ] Prompt 配置化机制（模板文件加载 + 变量替换引擎）
- [ ] Skill / MCP 预检逻辑（项目中是否存在对应 skill、MCP 是否已配置）
- [ ] JSON Schema 定义（`impact-analysis.schema.json`、`test-cases.schema.json`）
- [ ] 校验管线实现（注入 → 重算 → AJV 校验 → 语义校验 → 持久化 → 渲染 → 广播，含单元测试覆盖各阶段）
- [ ] 新鲜度指纹计算（branch / head / working tree）
- [ ] 新增 API 端点框架
- [ ] `MarkdownReviewDialog` 组件
- [ ] 项目适配器框架（`java-spring` / `generic`）

### Phase 2 — 简单卡片 + 改造

- [ ] 需求链接卡片
- [ ] SDD 产物分析升级（调用 analyze skill）
- [ ] UT 测试卡片改造（标题 + 影响场景注入）
- [ ] 卡片排序调整
- [ ] RequirementDetail 卡片组件拆分

### Phase 3 — 核心卡片

- [ ] 影响场景分析卡片（含 @ai.doc 引导 + 三模式变更获取 + 新鲜度校验）
- [ ] 提交代码卡片（skill 优先 + 需求链接集成）

### Phase 4 — MCP 集成卡片

- [ ] 环境部署卡片（CICD MCP 探测状态 + 服务部署适配）
- [ ] 测试用例卡片（测试 MCP 探测状态 + 结果脱敏）

### Phase 5 — 打磨

- [ ] Bug 追踪 + 相关活动位置调整
- [ ] 整体联调与 Schema / 语义 / 新鲜度校验完善
- [ ] 文档更新（USER_GUIDE、README）

---

## 附录 A：参考 Skill 清单

以下 skill 来自 `~/Documents/codedev/cash_loan/.cursor/skills/`，作为各卡片 Prompt 设计的参考：

| 卡片 | 参考 Skill | 路径 |
|------|-----------|------|
| SDD 产物分析 | analyze | `cash_loan/.cursor/skills/analyze/SKILL.md` |
| 影响场景 | repay-impact-analysis | `cash_loan/.cursor/skills/repay-impact-analysis/SKILL.md` |
| UT 测试 | ut | `cash_loan/.cursor/skills/ut/SKILL.md` |
| 提交代码 | code-submit | `cash_loan/.cursor/skills/code-submit/SKILL.md` |
| 环境部署 | cheetah-swimlane | `cash_loan/.cursor/skills/cheetah-swimlane/SKILL.md` |

### SDD 流程 Skill 全集

| Skill | 用途 |
|-------|------|
| specify | 固化 Spec，产出 `spec.md` |
| clarify | Spec 澄清 |
| plan | 设计方案，产出 `plan.md` |
| tasks | 任务拆解，产出 `tasks.md` |
| analyze | 只读跨产物一致性分析 |
| sketch | 轻量路径 |
| tapd-integration | TAPD 集成与 SDD 上报 |

---

## 附录 B：@ai.doc 增强注解体系

> 以下约定来自 cash_loan 还款域，属于项目专属实践。其他项目可通过 `observatory.prompt.templateDir` 自定义影响分析的注解扫描规则，或使用 `generic` 适配器进行纯文件级影响分析。

cash_loan 项目中使用的 AI 增强注解约定：

| 注解 | 用途 | 示例 |
|------|------|------|
| `@ai.doc` | 锚点 ID 或文档路径 | `@ai.doc REPAY_REFUND.SUBMIT` |
| `@ai.desc` | 业务职责描述 | `@ai.desc 退款提交入口，校验并发起退款流程` |
| `@ai.side-effects` | 副作用声明 | |
| `@ai.idempotent` | 幂等性标注 | |
| `@ai.state-machine` | 状态机相关 | |
| `@ai.flow` | 所属业务流程 | |

索引文件位置：`docs/domain/<domain>/meta/ai-index-<domain>-<flow>.json`

影响分析时，优先通过 `@ai.doc` 锚点 → 索引文件 → 业务流程文档 的链路识别受影响场景。
