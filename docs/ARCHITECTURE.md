# Cursor Observatory — 整体架构设计

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

---

## 一、设计目标

### 1.1 核心问题

AI 协作开发（Cursor Agent）存在三个可观测性缺口：

1. **结构盲区**：项目模块间的依赖关系、数据模型、交互模式缺乏全景视图
2. **进度黑箱**：AI 正在做什么、改了哪些文件、功能完成度多少——缺少统一展示
3. **质量暗角**：哪些功能有测试、覆盖了什么场景、历史通过率趋势——没有持续追踪

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **增强而非替代** | 不重造 Cursor 的 AI 能力，在其基础上叠加可观测层 |
| **标准化数据契约** | `.observatory/` 中间格式与项目类型解耦，前端通用 |
| **零手动维护** | Extension 自动采集，事件驱动更新，人工介入最小化 |
| **双模访问** | Cursor 内嵌 Webview + 浏览器独立访问，同一 React 应用 |
| **全量闭环** | 采集、分析、展示、操作、回写一次性打通 |
| **三问可回答** | 始终回答：AI 做了什么、做到哪一步、结果是否可用 |

### 1.3 相关文档

| 文档 | 关系 |
|------|------|
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | 数据契约定义（本文架构中所有 `.observatory/*.json` 的权威规格） |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | Extension 详细技术设计（Watchers / Scanners / Store） |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | React 前端详细设计（视图、组件、状态管理） |
| [QUALITY_MONITOR_DESIGN.md](QUALITY_MONITOR_DESIGN.md) | 质量监控面板深度设计 |
| [ROADMAP.md](ROADMAP.md) | 实施路线图与验收标准 |

### 1.4 术语表

| 术语 | 定义 |
|------|------|
| **Capability（能力）** | 一个面向用户或系统的独立业务能力单元，如"形态相似度搜索"。是 Observatory 追踪的核心粒度 |
| **Module（模块）** | 代码层面的目录/包，一个模块可能参与多个能力 |
| **Phase（阶段）** | 能力的生命周期状态：planning → designing → developing → testing → released |
| **Session（会话）** | 一次 AI Agent 协作对话，可关联多个能力和文件变更 |
| **Scanner（扫描器）** | Extension 中负责解析项目代码结构的组件 |
| **Watcher（监听器）** | Extension 中负责监听 IDE 事件的组件 |

---

## 二、系统架构

### 2.1 全局架构图

```
┌────────────────────────────────────────────────────────────────┐
│                      Cursor IDE                                 │
│                                                                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Observatory Extension                       │   │
│  │  ┌───────────┐ ┌────────────┐ ┌──────────────────────┐  │   │
│  │  │ Watchers   │ │ Scanners   │ │ Observatory Store    │  │   │
│  │  │ • File     │ │ • Python   │ │ • Read/Write JSON    │  │   │
│  │  │ • Git      │ │ • SQL/DDL  │ │ • Schema Validation  │  │   │
│  │  │ • Terminal │ │ • Git Log  │ │ • Incremental Update │  │   │
│  │  │ • Diagnost.│ │ • Docs     │ └──────────┬───────────┘  │   │
│  │  │ • Transcr. │ │ • Generic  │            │              │   │
│  │  └─────┬──────┘ └─────┬──────┘            │              │   │
│  │        │              │                   │              │   │
│  │        └──────────────┼───────────────────┘              │   │
│  │                       │                                  │   │
│  │                       ▼                                  │   │
│  │         项目/.observatory/*.json                          │   │
│  │                       │                                  │   │
│  │        ┌──────────────┼──────────────┐                   │   │
│  │        ▼              ▼              ▼                   │   │
│  │  ┌──────────┐  ┌───────────┐  ┌───────────┐             │   │
│  │  │ Webview   │  │ HTTP      │  │ Message   │             │   │
│  │  │ Panel     │  │ Server    │  │ Bridge    │             │   │
│  │  │ (内嵌)    │  │ (:3800)   │  │ (通信)    │             │   │
│  │  └──────────┘  └───────────┘  └───────────┘             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                │
│  ┌───────────────┐    ┌────────────────────────────────────┐   │
│  │ 代码编辑区     │    │  Webview Panel: React Dashboard    │   │
│  │ (Cursor 原生)  │    │  概览 | 架构 | 能力 | 质量 | 会话   │   │
│  └───────────────┘    └────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────┘
         │ HTTP Server :3800
         ▼
┌──────────────────────────┐
│ 浏览器 localhost:3800     │
│ (同一 React 应用独立访问)  │
└──────────────────────────┘
```

### 2.2 组件职责

| 组件 | 技术栈 | 输入 | 输出 | 说明 |
|------|--------|------|------|------|
| **Watchers** | TypeScript, VS Code API | IDE 事件流 | 变更事件 | 监听文件/Git/终端/诊断/transcript |
| **Scanners** | TypeScript | 项目源码 | 结构化数据 | 解析 Python AST/SQL DDL/Git log/Markdown |
| **Observatory Store** | TypeScript | 结构化数据 | `.observatory/*.json` | 管理标准化 JSON 的读写与增量更新 |
| **Webview Panel** | React (嵌入) | `.observatory/` | 可视化界面 | Cursor 内嵌的 Dashboard |
| **HTTP Server** | Express.js | `.observatory/` | REST API | 供浏览器独立访问 |
| **Message Bridge** | postMessage | 双向 | 双向 | Webview ↔ Extension 通信通道 |

---

## 三、数据架构

### 3.1 `.observatory/` 目录结构

每个接入 Observatory 的项目，根目录下会生成 `.observatory/` 目录：

```
any-project/
├── .observatory/                    # 标准化输出
│   ├── manifest.json               # 项目元信息
│   ├── architecture.json           # 模块拓扑与依赖图
│   ├── capabilities.json           # 能力/功能注册表 + 生命周期
│   ├── progress.json               # 开发进度追踪
│   ├── data-models.json            # 数据结构（表/模型 ER）
│   ├── ai-sessions.json            # AI 操作日志
│   ├── test-results.json           # 最近一次测试结果
│   ├── test-mapping.json           # 测试用例 ↔ 能力映射
│   ├── test-expectations.json      # 期望测试场景（AI 分析）
│   ├── test-history.jsonl          # 历史测试结果（追加写）
│   ├── docs-health.json            # 文档-代码对齐健康度
│   └── sessions/                   # 会话产物
│       ├── index.json              # 会话索引
│       └── ses_XXXXXXXX/           # 单个会话目录
│           ├── meta.json
│           ├── messages.jsonl
│           └── (产物文件)
├── .gitignore                      # 建议忽略 .observatory/
└── (项目源码)
```

### 3.2 数据生成时机

| 文件 | 生成时机 | 更新方式 |
|------|---------|---------|
| `manifest.json` | 首次 Init / 手动刷新 | 全量重写 |
| `architecture.json` | 文件保存时（防抖 5s） | 增量更新受影响模块 |
| `capabilities.json` | Init + AI 会话结束时 | 合并更新 |
| `progress.json` | Git commit 后 | 追加变更记录 |
| `data-models.json` | SQL/Model 文件变更时 | 全量重新解析 |
| `ai-sessions.json` | Agent transcript 变更时 | 追加新会话 |
| `test-results.json` | 测试运行结束后 | 全量覆写 |
| `test-history.jsonl` | 测试运行结束后 | 追加一行 |
| `docs-health.json` | 文件保存时（防抖 10s） | 全量重算 |

所有标准 JSON 文件都应包含 `generated_at` 字段。前端据此计算 `staleness_sec` 并展示数据新鲜度。

### 3.3 项目适配策略

不同项目类型使用不同扫描器组合：

```
┌──────────────────────┬──────────────────────────────────────┐
│ 项目特征              │ 启用的扫描器                          │
├──────────────────────┼──────────────────────────────────────┤
│ Python + ai-doc-idx  │ PythonScanner + AiDocIndexAdapter    │
│                      │ + SqlScanner + GitScanner + DocScanner│
├──────────────────────┼──────────────────────────────────────┤
│ Python 普通项目       │ PythonScanner + GitScanner           │
│                      │ （能力列表从代码推断）                  │
├──────────────────────┼──────────────────────────────────────┤
│ Node.js 项目          │ NodeScanner + GitScanner             │
│                      │ （从 package.json 推断模块结构）       │
├──────────────────────┼──────────────────────────────────────┤
│ Java 项目             │ JavaScanner + GitScanner             │
│                      │ （从 Maven/Gradle 推断模块结构）       │
├──────────────────────┼──────────────────────────────────────┤
│ 通用（未识别）         │ GenericScanner + GitScanner          │
│                      │ （仅目录结构 + Git 历史）              │
└──────────────────────┴──────────────────────────────────────┘
```

对于已有元数据体系的项目（如 stock-dashboard 的 `ai-doc-index.json`），优先从现有元数据映射，不重复推断。

### 3.4 能力自动发现策略

对于没有 `ai-doc-index.json` 的通用项目，按以下规则自动发现能力：

```
输入：项目源码
  │
  ├── 1. 以 class 为核心单元
  │     扫描所有公开类（public class），每个非工具类视为一个潜在能力
  │     工具类识别：名称含 Utils/Helper/Mixin/Base/Abstract 的类排除
  │
  ├── 2. 目录级聚合
  │     同一目录下的类聚合为一个模块级能力
  │     如 pattern_similarity/ 下 5 个类 → 1 个 PATTERN_SIMILARITY 能力
  │
  ├── 3. 入口点识别
  │     优先标记 CLI entrypoint / Router handler / 被外部调用的公开函数
  │     作为能力的 code_entry_points
  │
  └── 4. 用户确认与修正
        自动发现的能力列表标记 confidence = "auto"
        用户可在能力看板中：
        • 合并多个自动能力为一个
        • 拆分一个自动能力为多个
        • 重命名、补充描述
        • 标记为"非能力"（纯工具/内部模块）
        修正结果写入 capabilities.json，后续扫描优先使用已确认数据
```

自动发现**不对准确率做承诺**，其定位是提供初始数据让用户有东西可以修正，而非替代人工判断。

### 3.5 多工作区支持

Cursor/VS Code 支持 multi-root workspace（一个窗口打开多个项目文件夹）。Observatory 的策略是：

```
workspace/
├── project-a/
│   └── .observatory/           # project-a 独立的 observatory 数据
├── project-b/
│   └── .observatory/           # project-b 独立的 observatory 数据
└── shared-lib/
    └── .observatory/           # shared-lib 独立的 observatory 数据
```

- **每个子项目拥有独立的 `.observatory/` 目录**，数据互不干扰
- Extension 启动时扫描所有 workspace folders，为每个 folder 创建独立的 Watcher 和 Scanner 实例
- 前端通过顶部的项目选择器切换当前查看的项目
- HTTP Server 通过 query parameter 区分项目：`/api/observatory/manifest?project=stock-dashboard`，缺省时使用第一个 workspace folder

### 3.6 数据生命周期管理

`.observatory/` 中的数据文件需要生命周期控制，避免无限增长：

| 文件 | 保留策略 | 清理时机 |
|------|---------|---------|
| `manifest.json` | 始终保留最新 | 全量重写，无累积 |
| `architecture.json` | 始终保留最新 | 全量重写，无累积 |
| `capabilities.json` | 始终保留最新 | 合并写，deprecated 能力保留 |
| `progress.json` | 保留近 30 天 | Extension 启动时裁剪 |
| `ai-sessions.json` | 保留近 30 天 | Extension 启动时裁剪，旧会话可导出归档 |
| `test-results.json` | 始终保留最新一次 | 全量覆写，无累积 |
| `test-mapping.json` | 始终保留最新 | 全量重写 |
| `test-expectations.json` | 始终保留最新 | 全量重写 |
| `test-history.jsonl` | 保留近 30 天 | Extension 启动时裁剪（重写文件去除过期行） |
| `docs-health.json` | 始终保留最新 | 全量重写 |
| `sessions/` | 保留近 30 天 | 过期会话目录整体删除 |

裁剪策略实现：
```typescript
async pruneExpiredData(): Promise<void> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // ai-sessions.json: 过滤 30 天外的会话
    const sessions = await this.readAiSessions();
    sessions.sessions = sessions.sessions.filter(s => s.started_at >= cutoff);
    await this.writeJson('ai-sessions.json', sessions);

    // test-history.jsonl: 逐行过滤
    const lines = await this.readLines('test-history.jsonl');
    const kept = lines.filter(l => JSON.parse(l).timestamp >= cutoff);
    await this.writeLines('test-history.jsonl', kept);

    // progress.json: 过滤 timeline
    const progress = await this.readProgress();
    progress.timeline = progress.timeline.filter(e => e.timestamp >= cutoff);
    await this.writeJson('progress.json', progress);
}
```

### 3.7 损坏恢复策略

当 JSON 文件损坏（解析失败、schema 校验不通过）时，采用**重建策略**：

```
读取 .observatory/xxx.json
    │
    ├── 解析成功且 schema 校验通过 → 正常使用
    │
    └── 解析失败或校验不通过
            │
            ├── 1. 备份损坏文件为 xxx.json.corrupted（保留最近 1 份）
            ├── 2. 删除损坏文件
            ├── 3. 触发该文件对应的 Scanner 重新生成
            │      manifest  → 重新检测项目信息
            │      architecture → 重新扫描代码结构
            │      capabilities → 从 ai-doc-index 或代码重新推断
            │      test-results → 提示用户重新运行测试
            │      ai-sessions → 从 transcript 目录重新解析
            ├── 4. 前端显示告警："xxx.json 数据已重建，部分历史记录可能丢失"
            └── 5. 写入 Store 日志：记录损坏原因和恢复操作
```

追加写文件（`test-history.jsonl`）的特殊处理：逐行解析，跳过损坏行，保留可解析的有效行。

---

## 四、通信架构

### 4.1 Webview ↔ Extension 通信

Cursor/VS Code 的 Webview 使用 `postMessage` 通信：

```
Extension Host                    Webview (React)
    │                                  │
    │  ──── postMessage ─────────▶     │
    │  {type:'refresh', data:{...}}    │
    │                                  │
    │  ◀──── postMessage ────────      │
    │  {type:'navigate', view:'caps'}  │
    │                                  │
```

消息类型定义：

| 方向 | type | 说明 |
|------|------|------|
| Ext → Web | `init-data` | 首次加载，推送全量 observatory 数据 |
| Ext → Web | `refresh` | 数据更新，推送增量 diff |
| Ext → Web | `agent-activity` | AI Agent 活动实时推送 |
| Ext → Web | `test-result` | 测试运行结果推送 |
| Web → Ext | `navigate-to-file` | 请求在编辑器中打开文件 |
| Web → Ext | `run-tests` | 请求运行指定能力的测试 |
| Web → Ext | `run-scanner` | 请求重新扫描项目 |
| Ext → Web | `feature-status` | 能力状态变更（phase/progress 变化时推送） |
| Web → Ext | `update-capability` | 手动更新能力状态 |

### 4.2 HTTP Server API（浏览器访问）

Extension 内置 Express Server，暴露 REST API：

```
GET  /api/observatory/manifest         → manifest.json
GET  /api/observatory/architecture     → architecture.json
GET  /api/observatory/capabilities     → capabilities.json
GET  /api/observatory/progress         → progress.json
GET  /api/observatory/test-results     → test-results.json
GET  /api/observatory/test-mapping     → test-mapping.json
GET  /api/observatory/test-expectations→ test-expectations.json
GET  /api/observatory/test-history     → test-history.jsonl (parsed)
GET  /api/observatory/ai-sessions      → ai-sessions.json
GET  /api/observatory/data-models      → data-models.json
GET  /api/observatory/docs-health      → docs-health.json
GET  /api/observatory/sessions         → sessions/index.json
GET  /api/observatory/sessions/:id     → sessions/ses_XXX/meta.json + messages

POST /api/actions/run-scanner         → 触发全量扫描
POST /api/actions/run-tests           → 触发测试运行
POST /api/actions/update-capability   → 手动更新能力状态

WS   /ws/live                         → WebSocket 实时推送
```

说明：
- 对外 API 采用**显式资源路由**，不使用通配 `:file` 作为公开契约。
- 所有错误返回统一结构：`{ code, message, detail, retryable }`。

### 4.3 数据源抽象

前端通过统一的 `IDataSource` 接口获取数据，不关心运行环境。接口有两个实现：

| 实现类 | 运行环境 | 传输方式 |
|--------|----------|----------|
| `CursorBridgeDataSource` | Cursor Webview | postMessage |
| `HttpDataSource` | 独立浏览器 | HTTP REST + WebSocket |

工厂函数 `createDataSource()` 通过检测 `acquireVsCodeApi` 自动选择实现。

> 完整接口定义、实现代码与自动选择逻辑见 [FRONTEND_DESIGN.md §二、数据接入层](./FRONTEND_DESIGN.md)。

---

## 五、安全与隔离

### 5.1 权限模型

| 操作 | 权限级别 | 说明 |
|------|---------|------|
| 读取 `.observatory/` | 只读 | 前端默认权限 |
| 触发扫描 | 需确认 | 耗时操作，弹窗确认 |
| 运行测试 | 需确认 | 可能有副作用 |
| 编辑能力状态 | 直接允许 | 仅修改元数据 |
| 查看会话历史 | 只读 | 无敏感操作 |

### 5.2 数据隔离

- `.observatory/` 建议加入 `.gitignore`（自动生成数据不应入版本库）
- 会话中的 API Key 等敏感信息不进入 `messages.jsonl`
- HTTP Server 仅监听 `127.0.0.1`，不暴露到网络
- Session 与 transcript 仅保留开发审计所需字段，默认不保存原始密钥和隐私输入

---

## 六、性能考量

| 场景 | 策略 |
|------|------|
| 文件频繁保存 | Watcher 防抖（5s），批量更新 |
| 大型项目扫描 | 增量扫描（仅分析变更文件），首次全量可后台运行 |
| Webview 数据量大 | 分页加载 + 虚拟滚动 |
| 测试历史积累 | JSONL 格式追加写，读取时流式解析 |
| WebSocket 推送 | 仅推送 diff，不推送全量 |

---

## 七、目录结构规划

```
cursor_vibe_coding/
│
├── extension/                      # VS Code / Cursor 扩展
│   ├── package.json                # 扩展清单
│   ├── tsconfig.json
│   ├── src/
│   │   ├── extension.ts            # 入口：激活/停用
│   │   ├── watchers/               # 事件监听
│   │   │   ├── file-watcher.ts
│   │   │   ├── git-watcher.ts
│   │   │   ├── terminal-watcher.ts
│   │   │   ├── diagnostic-watcher.ts
│   │   │   └── transcript-watcher.ts
│   │   ├── scanners/               # 项目扫描器
│   │   │   ├── base-scanner.ts
│   │   │   ├── python-scanner.ts
│   │   │   ├── sql-scanner.ts
│   │   │   ├── git-scanner.ts
│   │   │   ├── doc-scanner.ts
│   │   │   └── adapters/
│   │   │       └── ai-doc-index-adapter.ts
│   │   ├── observatory/            # 数据存储管理
│   │   │   ├── store.ts
│   │   │   └── validator.ts
│   │   ├── server/                 # 内嵌 HTTP + WS Server
│   │   │   └── local-server.ts
│   │   ├── webview/                # Webview Panel 管理
│   │   │   └── panel-provider.ts
│   │   └── bridge/                 # 通信桥
│   │       └── message-bridge.ts
│   └── webpack.config.js
│
├── webview-ui/                     # React 前端（Cursor 内嵌 + 浏览器共用）
│   ├── src/
│   │   ├── App.tsx
│   │   ├── router.tsx
│   │   ├── layouts/
│   │   │   └── MainLayout.tsx
│   │   ├── views/
│   │   │   ├── Overview.tsx
│   │   │   ├── Architecture.tsx
│   │   │   ├── Capabilities.tsx
│   │   │   ├── DataModels.tsx
│   │   │   ├── Progress.tsx
│   │   │   ├── QualityMonitor.tsx
│   │   │   ├── AiSessions.tsx
│   │   │   ├── SessionManager.tsx
│   │   │   └── DocsHealth.tsx
│   │   ├── components/
│   │   │   ├── common/             # 通用 UI（StatusBadge, EmptyState, ErrorBoundary…）
│   │   │   ├── graph/              # Cytoscape 拓扑图
│   │   │   ├── er/                 # 实体关系图组件
│   │   │   ├── kanban/             # 看板组件
│   │   │   ├── chart/              # ECharts/D3 图表
│   │   │   ├── timeline/           # 时间线
│   │   │   ├── table/              # 数据表格
│   │   │   └── session/            # 会话组件
│   │   ├── services/
│   │   │   ├── data-source.ts      # 数据源抽象接口
│   │   │   ├── cursor-bridge.ts    # Webview 模式实现
│   │   │   └── http-client.ts      # 浏览器模式实现
│   │   └── types/
│   │       └── observatory.ts      # TypeScript 类型定义
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── schemas/                        # JSON Schema 定义
│   ├── manifest.schema.json
│   ├── architecture.schema.json
│   ├── capabilities.schema.json
│   ├── test-results.schema.json
│   ├── ai-sessions.schema.json
│   ├── data-models.schema.json
│   └── docs-health.schema.json
│
├── docs/                           # 技术文档
│   ├── ARCHITECTURE.md             # 本文件
│   ├── SCHEMA_SPEC.md
│   ├── EXTENSION_DESIGN.md
│   ├── FRONTEND_DESIGN.md
│   ├── QUALITY_MONITOR_DESIGN.md
│   └── ROADMAP.md
│
└── README.md
```

---

## 八、与现有项目的集成方式

以 `stock-dashboard` 为例：

```
stock-dashboard/
├── .observatory/                    # Extension 自动生成
│   ├── manifest.json
│   └── ...
├── .gitignore                       # 追加 .observatory/
├── docs/00-meta/ai-doc-index.json   # 现有元数据 → 被 Adapter 读取
├── (项目源码)
└── ...
```

Extension 检测到 `ai-doc-index.json` 存在时，自动使用 `AiDocIndexAdapter` 进行映射，而非从头推断能力列表。这确保了与已有治理体系的无缝衔接。

---

## 九、核心流程时序

### 9.1 文件保存 → 数据更新 → 前端刷新

```
用户/AI保存文件          Extension                    .observatory/       前端(Webview/Browser)
     │                      │                              │                     │
     │──onDidSave─────────▶│                              │                     │
     │                      │──加入 changeBuffer           │                     │
     │                      │  (防抖计时 5s)               │                     │
     │                      │         ...                  │                     │
     │                      │──5s 无新事件，flush──────────▶│                     │
     │                      │  scanIncremental()           │                     │
     │                      │──读取受影响文件──────────────▶│                     │
     │                      │──写入 architecture.json─────▶│                     │
     │                      │──写入 capabilities.json─────▶│                     │
     │                      │                              │                     │
     │                      │──postMessage({type:'refresh'})──────────────────▶│
     │                      │──ws.broadcast({scope:'arch'})───────────────────▶│
     │                      │                              │                     │
     │                      │                              │        按 scope 刷新视图
     │                      │                              │    (仅更新 architecture 相关组件)
```

### 9.2 Git Commit → 进度追踪

```
Git Commit               GitWatcher               ObservatoryStore         前端
     │                      │                           │                    │
     │──.git/HEAD变化──────▶│                           │                    │
     │                      │──getLatestCommit()        │                    │
     │                      │──getChangedFiles()        │                    │
     │                      │──matchCapabilities()      │                    │
     │                      │  (变更文件↔能力 ID)       │                    │
     │                      │                           │                    │
     │                      │──appendProgress()────────▶│                    │
     │                      │──updateCapabilities()────▶│                    │
     │                      │                           │                    │
     │                      │──broadcast({scope:'progress'})───────────────▶│
```

### 9.3 Extension 启动流程

```
Cursor 启动 / 用户手动初始化
     │
     ▼
Extension.activate()
     │
     ├── detectWorkspaceFolders()
     │     遍历所有 workspace folders
     │     │
     │     └── 对每个 folder:
     │           ├── 检测项目类型 (Python/Node/Java/Generic)
     │           ├── 检测是否有 .observatory/ (已初始化?)
     │           └── 检测是否有 ai-doc-index.json (有元数据体系?)
     │
     ├── 对每个 folder 创建独立的:
     │     ├── ObservatoryStore 实例
     │     ├── Scanner 组合 (按项目类型)
     │     └── Watcher 组合
     │
     ├── pruneExpiredData()        ← 裁剪 30 天外的历史数据
     │
     ├── validateAllFiles()        ← 校验所有 JSON，损坏的触发重建
     │
     ├── startHttpServer(:3800)
     │
     ├── registerCommands / TreeView / WebviewProvider
     │
     └── 如果距上次全量扫描 > 1 小时:
           scheduleBackgroundScan()  ← 后台执行，不阻塞编辑
```

---

## 十、Extension 状态机

```
                    ┌──────────────┐
         activate() │              │
        ┌──────────▶│  INITIALIZING │
        │           │              │
        │           └──────┬───────┘
        │                  │ 初始化完成
        │                  ▼
        │           ┌──────────────┐
        │           │              │◀──── 扫描完成 / 恢复成功
        │           │    READY     │
        │           │              │─────────────────────────┐
        │           └──────┬───────┘                         │
        │                  │ 全量扫描触发                     │ 文件事件 (增量，静默)
        │                  ▼                                 │
        │           ┌──────────────┐                         │
        │           │              │                         │
        │           │   SCANNING   │─── 扫描完成 ────────────┘
        │           │              │
        │           └──────┬───────┘
        │                  │ 扫描失败 / JSON 损坏
        │                  ▼
        │           ┌──────────────┐
        │           │              │
        │           │  RECOVERING  │─── 重建成功 → READY
        │           │              │─── 重建失败 → DEGRADED
        │           └──────────────┘
        │
        │           ┌──────────────┐
        │           │              │
        └───────────│   DEGRADED   │─── 用户手动重试 → INITIALIZING
                    │  (部分功能)   │
                    └──────────────┘

deactivate():
    任意状态 → 持久化缓冲数据 → 关闭 Server → 释放资源
```

| 状态 | 说明 | 前端表现 |
|------|------|---------|
| `INITIALIZING` | 首次启动或重新初始化 | 显示进度条 |
| `READY` | 正常运行，响应事件 | 正常展示所有面板 |
| `SCANNING` | 全量扫描进行中 | 顶部显示扫描进度 |
| `RECOVERING` | 检测到损坏文件，正在重建 | 显示恢复中告警 |
| `DEGRADED` | 部分功能不可用 | 受影响面板显示降级提示 |

---

## 十一、错误处理与降级

### 11.1 错误分类

| 错误类型 | 示例 | 处理策略 |
|---------|------|---------|
| **可恢复-自动** | JSON 损坏、文件缺失 | 自动重建，显示告警 |
| **可恢复-手动** | pytest 插件未安装 | 提示安装指引，质量面板显示"需配置" |
| **可降级** | WebSocket 断连 | 自动重连 + 指数退避，退化为 HTTP 轮询 |
| **可降级** | Transcript 目录不存在 | 跳过会话采集，AI 日志面板显示"未启用" |
| **不可恢复** | Extension 激活失败 | 显示错误通知，建议重装 |

### 11.2 前端降级矩阵

| 后端故障 | 概览 | 架构 | 能力 | 质量 | AI日志 | 会话 |
|---------|------|------|------|------|--------|------|
| architecture.json 损坏 | 部分 | ❌ | ✅ | ✅ | ✅ | ✅ |
| capabilities.json 损坏 | 部分 | ✅ | ❌ | 部分 | ✅ | ✅ |
| test-results.json 缺失 | 部分 | ✅ | ✅ | ❌ | ✅ | ✅ |
| ai-sessions.json 损坏 | 部分 | ✅ | ✅ | ✅ | ❌ | 部分 |
| WebSocket 断连 | ✅(轮询) | ✅ | ✅ | ✅ | ⚠️无实时 | ✅ |
| HTTP Server 宕机 | ❌浏览器 | ❌ | ❌ | ❌ | ❌ | ❌ |

✅ = 正常  部分 = 该面板可用但数据不完整  ❌ = 不可用  ⚠️ = 可用但功能受限
