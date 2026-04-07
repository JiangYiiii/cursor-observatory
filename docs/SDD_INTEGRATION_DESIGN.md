# SDD 集成设计 — 能力看板 × Spec-Driven Development

> **版本**：0.1.0-draft  
> **更新**：2026-04-05  
> **状态**：设计草案

### 相关文档

| 文档 | 关系 |
|------|------|
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | 能力数据契约（本文扩展其 `capabilities.json` schema） |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | 看板前端实现（卡片、列、拖拽交互） |
| [USER_GUIDE.md](USER_GUIDE.md) | 现有阶段自动推断机制 |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | Extension 扫描与文件监听 |

---

## 一、背景与动机

### 1.1 现状问题

当前能力看板的阶段流转依赖三种**被动观察**机制：

| 来源 | 行为 | 局限 |
|------|------|------|
| Agent 转录关键词 | 讨论/方案 → 设计中；改代码 → 开发中 | 靠关键词猜测，准确度有限 |
| pytest 报告 | failed=0 且 passed>0 → 已完成 | 仅覆盖测试通过场景 |
| Git 提交标记 | `Observatory: <id>` → 已发布 | 需人工在提交信息中标注 |

本质上这是一个**需求管理面板**，而非 AI 开发进度的控制面板。

### 1.2 目标

将能力看板从"被动观察"升级为"SDD 文档驱动"：

- SDD 产物（`spec.md`、`plan.md`、`tasks.md` 等）是阶段流转的**主要依据**
- Bug 修复有明确的**回溯归因 + 产物级联更新**机制
- 对于没有 SDD 的项目，提供**可选安装**命令引导
- 现有的转录推断、pytest、Git 标记机制**保留**为辅助信号

---

## 二、SDD 流程概览

SDD（Spec-Driven Development）是一套以文档驱动 AI 编码的开发方法论。完整流程：

```
specify → clarify → plan → tasks → implement → (analyze)
```

每个阶段产出固定文档，存放在 `specs/<feature-name>/` 目录下：

```
specs/
├── .active                    # 当前活跃 feature（单行文本）
└── <feature-name>/
    ├── .capability-id         # Capability 稳定唯一标识（单行文本，首次导入时生成）
    ├── spec.md                # specify 产出：需求规格（WHAT + WHY）
    ├── sketch.md              # sketch 产出：轻量方案（中小需求替代 specify+plan）
    ├── plan.md                # plan 产出：技术方案（HOW）
    ├── research.md            # plan 可选产出：技术调研
    ├── data-model.md          # plan 可选产出：数据模型
    ├── contracts/             # plan 可选产出：API 契约
    │   └── openapi.yaml
    ├── quickstart.md          # plan 可选产出：快速入门
    ├── tasks.md               # tasks 产出：可执行任务列表（checkbox）
    ├── checklists/            # specify/implement 产出：质量验证
    │   └── requirements.md
    └── bugfix-log.md          # bugfix 产出：Bug 修复日志（本设计新增）
```

### SDD 产物 → 看板阶段映射

| 产物组合 | 推断阶段 | 说明 |
|---------|----------|------|
| 仅 `sketch.md` | `planning` | 轻量规划完成，未进入实现 |
| `spec.md`，无 `plan.md` | `planning` | 需求已固化，未开始设计 |
| `spec.md` + `plan.md`，无 `tasks.md` | `designing` | 技术方案已产出，未拆解任务 |
| `spec.md` + `plan.md` + `tasks.md`（含未完成 task） | `developing` | 任务已拆解，开发进行中 |
| `tasks.md` 中全部 `- [x]` | `testing` | 默认：进入测试验证阶段 |
| `observatory-sdd.json` 中 `declaredPhase` | 指定值 | **优先于**上表产物推断；合法值为 `planning`～`deprecated`（见 `read-sdd-observatory-options.ts` 的 `parseDeclaredPhase`）；全量扫描写入 `capabilities.json` 时保留该阶段 |
| 全部 `- [x]` 且声明「无需单独测试」 | `completed` | 见 `observatory-sdd.json` 的 `skipTestingAfterTasks`，或 `plan.md`/`tasks.md` 中带 `无需单独测试` 等已勾选行（实现见 `read-sdd-observatory-options.ts`） |
| `testing` 且 pytest `by_capability` 通过 | `completed` | 扩展设置 `observatory.capability.sddTestingCompleteOnPytestPass`（默认 true） |
| Git 提交标记 `Observatory: <id>` | `released` | 可选；仅当需要「已发布」语义时使用 |

### 进度百分比计算

直接解析 `tasks.md` 中的 checkbox 状态：

```
progress = count("- [x]") / count("- [ ]" + "- [x]") × 100
```

---

## 三、初始化集成：SDD 探测

### 3.1 探测时机

在以下场景触发 SDD 探测：

1. 用户执行 **Observatory: Initialize Project** 命令
2. 用户执行 **Observatory: Run Full Scan** 命令
3. Extension 启动时的自动初始化流程

### 3.2 探测逻辑

```
检测 specs/ 目录是否存在
    │
    ├── 不存在 → sdd_detected = false
    │            → 提示用户可选安装 SDD（见第七节）
    │
    └── 存在 → 检查是否包含至少一个含 spec.md 或 sketch.md 的子目录
               │
               ├── 否 → sdd_detected = false（空 specs 目录不算）
               └── 是 → sdd_detected = true → 进入 SDD 集成流程
```

### 3.3 SDD 集成流程

当 `sdd_detected = true` 时：

**Step 1：遍历 `specs/` 下所有 feature 目录**

```typescript
for each dir in specs/*/ where dir contains (spec.md OR sketch.md):
    feature = dir.name
```

**Step 2：解析每个 feature 的产物组合，推断阶段**

```typescript
function inferPhaseFromSdd(featureDir: string): CapabilityPhase {
    const has = (file: string) => exists(join(featureDir, file));
    const tasksAllDone = () => {
        // 解析 tasks.md, 检查是否全部 checkbox 勾选
    };

    if (has('tasks.md')) {
        return tasksAllDone() ? 'testing' : 'developing';
    }
    if (has('plan.md'))   return 'designing';
    if (has('spec.md'))   return 'planning';
    if (has('sketch.md')) return 'planning';
    return 'planning';
}
```

**Step 3：解析 `tasks.md` 计算进度**

```typescript
function parseTaskProgress(tasksPath: string): { total: number; completed: number } {
    const content = readFile(tasksPath);
    const total = countMatches(content, /^- \[[ xX]\]/gm);
    const completed = countMatches(content, /^- \[[xX]\]/gm);
    return { total, completed };
}
```

**Step 4：生成 / 合并 Capability 条目**

将每个 SDD feature 转化为一条 `Capability`，并按稳定 ID 合并写入 `capabilities.json`。

#### Capability 唯一标识规则

SDD feature 的 `Capability.id` 使用 feature 目录下的 `.capability-id` 作为**唯一真相源**：

- 文件路径：`specs/<feature>/.capability-id`
- 文件内容：单行文本，例如 `sdd:bill-page-redesign`
- 生成时机：首次导入该 feature 且文件不存在时
- 稳定性：一旦生成，**即使 feature 目录重命名，`Capability.id` 也不改变**

生成规则：

```typescript
function readOrCreateCapabilityId(featureDir: string): string {
    const idFile = join(featureDir, '.capability-id');
    if (exists(idFile)) {
        return readFile(idFile).trim();
    }

    const featureName = basename(featureDir);
    const candidate = `sdd:${slugify(featureName)}`;
    const capabilityId = ensureUniqueCapabilityId(candidate);

    writeFile(idFile, capabilityId + '\n');
    return capabilityId;
}
```

约束：

- `Capability.id` 是 SDD feature 的**稳定外部标识**，用于 Git 发布标记、前端路由和能力引用
- `sdd.workspacePath` 是 feature 的**当前位置**，允许随目录重命名而变化
- **禁止**使用标题、阶段、相似路径做模糊匹配

#### Capability 合并策略

初始化导入和增量同步统一按以下顺序合并：

1. 读取 `.capability-id`
2. 在 `capabilities.json` 中查找 `id === capabilityId`
3. 若命中，则**原地更新**该条记录
4. 若未命中，且这是首次升级旧数据，则允许一次性按 `sdd.workspacePath === specs/<feature>` 精确匹配旧 SDD 记录
5. 若命中旧记录，则复用旧记录的 `id` 回写到 `.capability-id`，并升级为新规则
6. 若仍未命中，则创建新 Capability

明确规则：

- **只允许精确匹配**：`id` 或 `sdd.workspacePath`
- **不按 `title` 合并**
- **不按 `business_doc_id` 猜测合并**
- **不按目录名模糊匹配**

这样可以避免以下问题：

- 同名不同 feature 被错误合并
- feature 重命名后生成重复卡片
- 历史 Git 提交中的 `Observatory: <id>` 因目录改名而失效

**Step 5：读取 `specs/.active` 标注当前活跃 feature**

**Step 6：输出集成报告**

```
✅ 检测到 SDD 项目，已导入 32 个 feature 到能力看板
   - planning: 3 | designing: 5 | developing: 18 | testing: 4 | completed: 2
   当前活跃 feature: m3-trial-gray-release
```

### 3.4 增量同步：文件监听

初始化之后，通过文件监听实现持续同步，复用 Extension 已有的 `FileSystemWatcher`：

| 监听事件 | 触发行为 |
|---------|---------|
| `specs/<feature>/spec.md` 新增 | 创建 Capability 条目（`planning`） |
| `specs/<feature>/plan.md` 新增 | 推进到 `designing` |
| `specs/<feature>/tasks.md` 新增 | 推进到 `developing` |
| `specs/<feature>/tasks.md` 变更 | 重新计算 `progress`；全部完成时推进到 `testing` |
| `specs/<feature>/bugfix-log.md` 变更 | 更新 `sdd.activeBugs` 计数 |
| `specs/<feature>/` 重命名 | 保持原 `Capability.id` 不变，更新 `sdd.workspacePath` |
| `specs/.active` 变更 | 更新看板高亮 |

### 3.5 与现有机制的兼容

| 现有机制 | 是否保留 | 说明 |
|---------|---------|------|
| Agent 转录推断 | 保留 | 作为辅助信号；SDD feature 的阶段以产物为准，非 SDD 的仍用转录推断 |
| pytest 报告导入 | 保留 | 作为 `testing → completed` 的验证条件之一 |
| Git 提交标记 | 保留 | 作为 `completed → released` 的唯一触发条件 |
| 手动拖拽 | 不保留（针对 SDD feature） | SDD feature 的阶段只允许由产物、测试和 Git 标记自动同步；前端拖拽入口禁用 |

---

## 四、Bugfixing 子状态设计（方式 B）

### 4.1 设计选择

Bug 修复时**不回退**看板阶段，而是在卡片上增加 `bugfixing` 子状态标记。

**理由**：

- 看板阶段反映的是 feature 的"开发里程碑"，不应因 bug 来回跳动
- Bug 的根因归类（SPEC_GAP / DESIGN_FLAW / IMPL_BUG 等）比阶段回退更有诊断价值
- 卡片上的 bug 角标一目了然，比阶段变化更容易追踪

### 4.2 数据模型

在 `Capability` 上扩展 `bugfix` 字段：

```typescript
interface CapabilityBugfix {
    /** 未关闭的 bug 数量 */
    activeBugs: number;
    /** 已关闭的 bug 数量 */
    resolvedBugs: number;
    /** 未关闭 bug 的根因分类汇总 */
    rootCauses: BugRootCause[];
}

type BugRootCause =
    | 'SPEC_GAP'          // 需求遗漏
    | 'DESIGN_FLAW'       // 技术方案缺陷
    | 'TASK_MISS'         // 任务拆解遗漏
    | 'IMPL_DEVIATION'    // 实现偏离设计
    | 'IMPL_BUG';         // 纯代码逻辑 bug
```

### 4.3 Bug 归因模型

`/bugfix` 命令执行时，AI 将 Bug 描述与各层 SDD 产物交叉比对，归因到根因层：

```
Bug 报告
  │
  ├─ spec.md 中是否覆盖了该场景？
  │   ├── 未覆盖 → SPEC_GAP
  │   └── 已覆盖 ↓
  │
  ├─ plan.md 的方案能否正确处理该场景？
  │   ├── 方案有缺陷 → DESIGN_FLAW
  │   └── 方案可行 ↓
  │
  ├─ tasks.md 是否有覆盖该场景的任务？
  │   ├── 未覆盖 → TASK_MISS
  │   └── 已覆盖 ↓
  │
  └─ 代码实现是否偏离了 plan/tasks？
      ├── 是 → IMPL_DEVIATION
      └── 否 → IMPL_BUG
```

### 4.4 按归因级别确定修复范围

| 归因 | 需要修改的 SDD 产物 | 修复策略 |
|------|-------------------|---------|
| `SPEC_GAP` | spec → plan → tasks → 代码 | 先补 spec 验收场景，级联更新全链路 |
| `DESIGN_FLAW` | plan → tasks → 代码 | spec 不变，修改技术方案并级联 |
| `TASK_MISS` | tasks → 代码 | 补充遗漏的 task，然后实现 |
| `IMPL_DEVIATION` | 代码 | 按 plan 矫正实现 |
| `IMPL_BUG` | 代码 | 直接修复 |

**核心原则**：从 bug 的根因层开始修，向下级联更新，避免"代码修了但 spec 还是错的"。

### 4.5 Bugfix 日志

每次 bugfix 追加到 `specs/<feature>/bugfix-log.md`：

```markdown
# Bugfix Log: <feature-name>

## BF-001 (2026-04-05) 🔴 OPEN

**现象**: 用户选择优惠券后，试算金额未减去优惠金额
**归因**: SPEC_GAP
**根因**: spec.md US3 验收场景未覆盖优惠券与试算的联动

### 修改记录

| 产物 | 变更摘要 |
|------|---------|
| spec.md | US3 新增验收场景: "Given 选择优惠券 When 触发试算 Then 金额减去优惠" |
| plan.md | 试算模块时序图增加优惠券扣减步骤 |
| tasks.md | 新增 T024: 试算联动优惠券扣减逻辑 |
| TrialService.java | calculateAmount() 增加优惠券扣减 |

### 验证
- [x] 新增 UT: TrialServiceTest.testCouponDeduction
- [x] 验收场景回归通过

**状态**: ✅ RESOLVED (2026-04-05)

---

## BF-002 (2026-04-06) 🔴 OPEN
...
```

### 4.6 看板卡片视觉

SDD feature 卡片在以下情况展示 Bug 角标：

| 条件 | 卡片表现 |
|------|---------|
| `activeBugs == 0` | 正常显示，无角标 |
| `activeBugs > 0` | 右上角显示红色角标 + 数字（如 🔴 2） |
| `activeBugs > 0` 且 phase 为 `testing` | 阻止自动流转到 `completed`（需先关闭所有 bug） |

卡片详情弹窗增加 Bugfix 区域，展示：

- 未关闭 bug 列表及其根因分类
- 已关闭 bug 历史
- `bugfix-log.md` 的直接链接

### 4.7 阶段流转门禁

当 feature 存在未关闭的 bug（`activeBugs > 0`）时：

| 流转方向 | 行为 |
|---------|------|
| → `completed` | **阻止**，提示 "存在 N 个未关闭的 Bug，请先修复" |
| → `released` | **阻止**，同上 |
| 其他自动流转 | **允许**，仍按 SDD 产物状态自动同步 |
| 前端手动拖拽 | **禁用**，SDD feature 不提供人工改阶段入口 |

---

## 五、Schema 扩展

### 5.1 Capability 新增字段

在 `capabilities.json` 的 Capability 对象上扩展以下字段：

```json
{
    "id": "sdd:bill-page-redesign",
    "title": "账单页重构",
    "phase": "developing",
    "progress": 65,

    "sdd": {
        "enabled": true,
        "workspacePath": "specs/bill-page-redesign",
        "activeFeature": false,
        "documents": {
            "spec": true,
            "sketch": false,
            "plan": true,
            "tasks": true,
            "dataModel": true,
            "contracts": true,
            "research": false
        },
        "taskStats": {
            "total": 24,
            "completed": 16
        }
    },

    "bugfix": {
        "activeBugs": 1,
        "resolvedBugs": 3,
        "rootCauses": ["SPEC_GAP"]
    },

    "last_updated": "2026-04-05T14:30:00Z"
}
```

### 5.2 字段说明

| 字段路径 | 类型 | 必填 | 说明 |
|---------|------|------|------|
| `id` | `string` | ✅ | 对于 SDD feature，值来自 `specs/<feature>/.capability-id`，一旦生成保持稳定 |
| `sdd` | `object \| undefined` | ❌ | SDD 元数据。不存在时表示该 Capability 非 SDD 管理 |
| `sdd.enabled` | `boolean` | ✅ | 是否为 SDD 管理的 feature |
| `sdd.workspacePath` | `string` | ✅ | SDD 工作区相对路径（如 `specs/bill-page-redesign`）。目录重命名时会更新，但不影响 `id` |
| `sdd.activeFeature` | `boolean` | ✅ | 是否为 `specs/.active` 指向的当前活跃 feature |
| `sdd.documents` | `object` | ✅ | 各 SDD 文档是否存在 |
| `sdd.documents.spec` | `boolean` | ✅ | `spec.md` 是否存在 |
| `sdd.documents.sketch` | `boolean` | ✅ | `sketch.md` 是否存在 |
| `sdd.documents.plan` | `boolean` | ✅ | `plan.md` 是否存在 |
| `sdd.documents.tasks` | `boolean` | ✅ | `tasks.md` 是否存在 |
| `sdd.documents.dataModel` | `boolean` | ✅ | `data-model.md` 是否存在 |
| `sdd.documents.contracts` | `boolean` | ✅ | `contracts/` 目录是否存在 |
| `sdd.documents.research` | `boolean` | ✅ | `research.md` 是否存在 |
| `sdd.taskStats` | `object \| undefined` | ❌ | tasks.md 解析结果。无 tasks.md 时不存在 |
| `sdd.taskStats.total` | `number` | ✅ | 总任务数 |
| `sdd.taskStats.completed` | `number` | ✅ | 已完成任务数 |
| `bugfix` | `object \| undefined` | ❌ | Bugfix 状态。无 bug 记录时不存在 |
| `bugfix.activeBugs` | `number` | ✅ | 未关闭的 bug 数量 |
| `bugfix.resolvedBugs` | `number` | ✅ | 已关闭的 bug 数量 |
| `bugfix.rootCauses` | `BugRootCause[]` | ✅ | 未关闭 bug 的根因分类列表 |

### 5.3 BugRootCause 枚举

```typescript
type BugRootCause =
    | 'SPEC_GAP'          // spec 未覆盖该场景（需求遗漏）
    | 'DESIGN_FLAW'       // plan 技术方案有缺陷
    | 'TASK_MISS'         // tasks 拆解遗漏边界场景
    | 'IMPL_DEVIATION'    // 代码偏离 plan/tasks 设计
    | 'IMPL_BUG';         // 纯代码逻辑错误
```

### 5.4 phase 状态机扩展

在 SCHEMA_SPEC.md 原有状态机基础上扩展 bugfix 约束：

```
planning → designing → developing → testing → completed → released
                                      ↑          │            │
                                      └──────────┴────────────┘
                                      
约束：activeBugs > 0 时，testing → completed 和 completed → released 被阻止。
```

---

## 六、`/bugfix` 命令设计

### 6.1 触发方式

```
/bugfix [feature-name]

# Bug 描述
[现象描述、复现步骤、期望行为 vs 实际行为]

# 发现环境
[开发自测 / QA测试 / 线上]

# 相关信息
[错误日志、堆栈、截图链接等]
```

若不指定 `feature-name`，自动读取 `specs/.active`。

### 6.2 执行流程

```
Step 1: 确定工作区
    │   优先级: 用户显式指定 > specs/.active > 报错
    │
Step 2: 加载 SDD 上下文
    │   读取 specs/<feature>/ 下所有产物
    │   (spec.md, plan.md, tasks.md, contracts/, data-model.md)
    │
Step 3: Bug 归因分析
    │   将 Bug 描述与各层产物交叉比对
    │   输出归因结果 + 证据 + 影响范围
    │   向用户确认归因是否正确
    │
Step 4: 生成修复计划
    │   按归因层级确定修复范围（见 §4.4）
    │   列出需要修改的产物和预期变更
    │   向用户确认修复计划
    │
Step 5: 执行修复
    │   按 "产物层级从上到下" 依次修改:
    │   spec.md → plan.md → tasks.md → 代码
    │   每层修改后立即保存
    │
Step 6: 验证
    │   运行受影响的 UT
    │   执行相关验收场景
    │
Step 7: 更新 bugfix-log.md
    │   追加本次 bugfix 条目
    │   如验证通过，标记为 RESOLVED
    │
Step 8: 更新 capabilities.json
        重新计算 activeBugs / resolvedBugs / rootCauses
```

### 6.3 归因分析的输出格式

```markdown
## Bug 归因分析

**Bug**: [现象一句话描述]
**Feature**: <feature-name>
**归因**: SPEC_GAP | DESIGN_FLAW | TASK_MISS | IMPL_DEVIATION | IMPL_BUG

**证据**:
- [引用 spec/plan/tasks 中的具体段落，说明为什么归因到此层]

**影响范围**:
- [ ] spec.md — [需要/不需要修改，修改什么]
- [ ] plan.md — [需要/不需要修改，修改什么]
- [ ] tasks.md — [需要/不需要修改，修改什么]
- [ ] 代码 — [需要修改的文件和函数]

请确认归因是否正确，或提供你的判断。
```

---

## 七、SDD Skill 可选安装命令

### 7.1 背景

SDD 插件（`context-hub/sdd`）包含 6 个 skill + 1 个 agent：

| 组件 | 类型 | 作用 |
|------|------|------|
| `specify` | skill | 需求固化 → `spec.md` |
| `clarify` | skill | 需求澄清 → 更新 `spec.md` |
| `sketch` | skill | 轻量规划 → `sketch.md` |
| `plan` | skill | 技术方案 → `plan.md` + 设计产物 |
| `tasks` | skill | 任务拆解 → `tasks.md` |
| `analyze` | skill | 产物一致性分析（只读） |
| `implement` | agent | 按 `tasks.md` 分阶段实现代码 |

以及 `cn-backend-workflow` 中的入口扩展规则 `sdd-specify-extension.mdc`。

并非所有项目都需要 SDD。Observatory 应提供**检测 + 引导**的机制，而非强制要求。

### 7.2 命令定义

新增 VS Code 命令：

```
Observatory: Configure SDD Integration
```

### 7.3 执行流程

```
用户执行命令
    │
    ├── Step 1: 检测项目 SDD 状态
    │     检查 specs/ 目录是否存在
    │     检查项目内是否有 SDD 相关的 Cursor Rule / Skill
    │     │
    │     ├── 已有 SDD 产物 + 已有 SDD 规则
    │     │   → 提示 "当前项目已配置 SDD，无需额外操作"
    │     │   → 显示当前 SDD 统计（feature 数量、各阶段分布）
    │     │   → 可选操作: [重新扫描 SDD 产物] [打开看板]
    │     │
    │     ├── 已有 SDD 产物 + 无 SDD 规则
    │     │   → 提示 "检测到 specs/ 目录（N 个 feature），但未找到 SDD Skill"
    │     │   → 询问: "是否安装 SDD Skill 以获得完整的文档驱动开发体验？"
    │     │   → 可选操作: [安装 SDD Skill] [仅导入看板数据] [跳过]
    │     │
    │     └── 无 SDD 产物
    │         → 询问: "当前项目未使用 SDD。是否启用 SDD 驱动开发？"
    │         → 说明 SDD 的价值和流程
    │         → 可选操作: [启用 SDD] [跳过]
    │
    ├── Step 2: 安装 SDD Skill（如用户选择安装）
    │     │
    │     ├── 2a. 检测 SDD 插件源
    │     │   优先级:
    │     │   1. context-hub 插件缓存 (已有 → 直接使用)
    │     │   2. 远程插件市场 (gitlab.yangqianguan.com/ai/context-hub)
    │     │   3. 手动安装引导
    │     │
    │     ├── 2b. 写入项目级 Cursor Rule
    │     │   在 .cursor/rules/ 下创建 sdd-integration.mdc:
    │     │   - SDD 流程约定
    │     │   - /bugfix 命令说明
    │     │   - 产物目录约定
    │     │
    │     └── 2c. 创建初始目录结构
    │         mkdir -p specs/
    │
    └── Step 3: 初始化看板数据
          如 specs/ 已有内容 → 执行 SDD 探测流程（§3.3）
          如 specs/ 为空 → 提示用户使用 /specify 或 /sketch 开始第一个 feature
```

### 7.4 SDD 状态检测逻辑

```typescript
interface SddDetectionResult {
    /** specs/ 目录是否存在 */
    hasSpecsDir: boolean;
    /** specs/ 下有效 feature 数量 */
    featureCount: number;
    /** 是否有 SDD 相关的 Cursor Rule */
    hasSddRules: boolean;
    /** 是否有 SDD 插件缓存 */
    hasSddPlugin: boolean;
    /** 详细状态 */
    status: 'full' | 'partial' | 'none';
}

function detectSddStatus(workspaceRoot: string): SddDetectionResult {
    const hasSpecsDir = exists(join(workspaceRoot, 'specs'));
    const featureCount = hasSpecsDir
        ? countDirs('specs/*', dir => hasAny(dir, ['spec.md', 'sketch.md']))
        : 0;

    const hasSddRules = glob('.cursor/rules/*sdd*').length > 0
        || glob('.cursor/rules/*specify*').length > 0;

    const hasSddPlugin = exists(
        expandHome('~/.cursor/plugins/cache/context-hub/sdd')
    );

    let status: 'full' | 'partial' | 'none';
    if (featureCount > 0 && (hasSddRules || hasSddPlugin)) {
        status = 'full';
    } else if (featureCount > 0 || hasSddRules || hasSddPlugin) {
        status = 'partial';
    } else {
        status = 'none';
    }

    return { hasSpecsDir, featureCount, hasSddRules, hasSddPlugin, status };
}
```

### 7.5 安装后写入的 Cursor Rule

当用户选择安装时，在 `.cursor/rules/` 下创建规则文件：

```markdown
---
description: SDD 集成约定 — Observatory × Spec-Driven Development
globs:
  - "specs/**"
---

# SDD 集成约定

## 产物目录

所有 SDD 产物存放在 `specs/<feature-name>/` 下，Observatory 会监听此目录并自动更新能力看板。

## 阶段流转

能力看板阶段由 SDD 产物自动驱动：
- `spec.md` 创建 → planning
- `plan.md` 创建 → designing
- `tasks.md` 创建 → developing
- `tasks.md` 全部完成 + 测试通过 → completed
- Git 提交标记 `Observatory: <id>` → released

对于 SDD feature：
- 不允许在前端手动拖拽修改阶段
- 阶段只允许由 `specs/` 产物、测试结果和 Git 发布标记自动同步

## 唯一标识

- 每个 SDD feature 在 `specs/<feature>/.capability-id` 中保存稳定的 `Capability.id`
- 推荐格式：`sdd:<feature-slug>`
- feature 目录可重命名，但 `Capability.id` 不变
- `Observatory: <id>` 必须使用该稳定 ID，而不是目录名

## Bug 处理

使用 `/bugfix <feature-name>` 触发 Bug 修复流程：
1. AI 加载该 feature 的全套 SDD 产物
2. 归因分析（SPEC_GAP / DESIGN_FLAW / TASK_MISS / IMPL_DEVIATION / IMPL_BUG）
3. 从根因层开始级联修复
4. 记录到 `specs/<feature>/bugfix-log.md`

## 命令速查

| 命令 | 作用 |
|------|------|
| `/specify` 或 `/sdd-specify` | 需求固化 → spec.md |
| `/sketch` | 轻量规划 → sketch.md |
| `/plan` | 技术方案 → plan.md |
| `/tasks` | 任务拆解 → tasks.md |
| `/implement` | 按 tasks.md 实现 |
| `/analyze` | 产物一致性检查 |
| `/bugfix` | Bug 归因 + 修复（新增） |
```

### 7.6 Initialize 流程集成

在现有 `Observatory: Initialize Project` 命令中加入 SDD 检测步骤：

```
Initialize Project
    │
    ├── 现有流程：代码结构扫描、数据模型扫描、转录目录配置...
    │
    ├── 新增：SDD 检测
    │     sddResult = detectSddStatus(workspaceRoot)
    │     │
    │     ├── status == 'full'
    │     │   → 执行 SDD 集成流程（§3.3）
    │     │   → 通知栏: "已导入 N 个 SDD feature 到能力看板"
    │     │
    │     ├── status == 'partial'
    │     │   → 提示用户执行 "Observatory: Configure SDD Integration"
    │     │
    │     └── status == 'none'
    │         → 静默跳过（不主动打扰）
    │         → 在看板底部显示 "💡 启用 SDD 可获得文档驱动的阶段追踪"
    │
    └── 现有流程：写入 Cursor Rule、刷新仪表盘...
```

---

## 八、前端交互补充

### 8.1 看板卡片增强

SDD feature 的卡片与普通 Capability 卡片的区别：

| 元素 | SDD Feature | 非 SDD Capability |
|------|------------|-------------------|
| 阶段 Badge | 正常显示 | 正常显示 |
| 进度条 | 基于 tasks.md checkbox（精确） | 基于 progress 字段（可能为空） |
| SDD 标记 | 显示小图标（如 📋）标识为 SDD | 不显示 |
| Bug 角标 | `activeBugs > 0` 时显示红色角标 | 不显示 |
| 文档快捷入口 | 展示已有产物的快捷链接 | 不显示 |
| 活跃标记 | `specs/.active` 对应的 feature 高亮边框 | 不显示 |
| 阶段修改方式 | 只读；由 SDD 自动同步 | 可沿用现有交互 |

### 8.2 卡片详情弹窗增强

SDD feature 的详情弹窗增加两个区域：

**SDD 产物导航**：

```
┌─ SDD 产物 ──────────────────────┐
│  ✅ spec.md    ✅ plan.md        │
│  ✅ tasks.md   ✅ data-model.md  │
│  ✅ contracts/  ❌ research.md   │
│                                  │
│  任务进度: 16/24 (66%)           │
│  ████████████░░░░░░              │
└──────────────────────────────────┘
```

**Bugfix 状态**（仅 `activeBugs > 0` 时展示）：

```
┌─ Bug 状态 ──────────────────────┐
│  🔴 未关闭: 1                    │
│  BF-004 SPEC_GAP                │
│    "空数据页面无空状态提示"        │
│                                  │
│  ✅ 已关闭: 3                    │
│  [查看 bugfix-log.md]           │
└──────────────────────────────────┘
```

---

## 九、实施计划

### Phase 1：Schema 扩展 + 数据探测

- 扩展 `Capability` 类型定义（`sdd` + `bugfix` 字段）
- 实现 `detectSddStatus()` 检测逻辑
- 实现 `specs/` 目录遍历与阶段推断
- 实现 `tasks.md` 解析与进度计算
- 集成到 Initialize 流程

### Phase 2：文件监听 + 增量同步

- 监听 `specs/` 目录变更事件
- 实现产物变更 → Capability 更新的映射
- 实现 `bugfix-log.md` 解析与 bug 计数

### Phase 3：前端看板增强

- 卡片 SDD 标记与 Bug 角标
- 详情弹窗 SDD 产物导航区
- 详情弹窗 Bugfix 状态区
- 阶段流转门禁（`activeBugs > 0` 阻止）

### Phase 4：命令与规则

- 实现 `Observatory: Configure SDD Integration` 命令
- 实现 SDD 状态检测 + 安装引导 UI
- 编写 `/bugfix` Skill（可作为 SDD 插件新增 skill）
- 集成到 Initialize 流程的 SDD 检测步骤
