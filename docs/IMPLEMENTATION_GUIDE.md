# Cursor Observatory — 技术实施指南

> **版本**：1.0.0  
> **更新**：2026-04-05  
> **定位**：唯一的推进入口文档 — 协调者读此文档，为每个任务分发 subagent

---

## 一、文档体系（不重复，只引用）

本文档**不复制**已有设计内容，只引用。Subagent 执行任务时，按指定路径读取对应文档即可。

| 文档 | 路径 | 用途 |
|------|------|------|
| 整体架构 | `docs/ARCHITECTURE.md` | 系统全貌、数据流、状态机、错误处理、时序图 |
| 数据契约 | `docs/SCHEMA_SPEC.md` | `.observatory/*.json` 的唯一字段规格 |
| Extension 设计 | `docs/EXTENSION_DESIGN.md` | Watchers/Scanners/Store/Server 实现细节 |
| 前端设计 | `docs/FRONTEND_DESIGN.md` | 视图、组件、状态管理、可访问性 |
| 质量监控 | `docs/QUALITY_MONITOR_DESIGN.md` | 测试↔能力映射、场景覆盖分析 |
| 路线图 | `docs/ROADMAP.md` | Workstream 划分、验收标准、风险 |

---

## 二、项目脚手架

开发的第一步是搭建项目骨架。以下为最终目录结构（详见 `ARCHITECTURE.md §七`）：

```
cursor_vibe_coding/
├── extension/                    # VS Code / Cursor 扩展
│   ├── package.json
│   ├── tsconfig.json
│   ├── webpack.config.js
│   └── src/
│       ├── extension.ts          # 入口
│       ├── watchers/
│       ├── scanners/
│       ├── observatory/
│       ├── server/
│       ├── webview/
│       └── bridge/
├── webview-ui/                   # React 前端
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── index.html
│   └── src/
│       ├── App.tsx
│       ├── router.tsx
│       ├── layouts/
│       ├── views/
│       ├── components/
│       ├── services/
│       ├── store/
│       ├── hooks/
│       └── types/
├── schemas/                      # JSON Schema 文件
├── docs/                         # 已有文档（不动）
└── README.md                     # 已有（不动）
```

---

## 三、推进节奏 — 6 个阶段

所有阶段按顺序执行。每个阶段包含若干**可并行的任务**，每个任务由独立 subagent 完成。

```
Phase 0  项目脚手架 ────────────────── (0.5 天)
Phase 1  数据层 + Schema ──────────── (1-2 天)
Phase 2  事件采集 + 扫描器 ─────────── (2-3 天)
Phase 3  前端全量视图 ─────────────── (3-4 天)
Phase 4  质量 + 会话闭环 ──────────── (1-2 天)
Phase 5  可靠性 + 打包发布 ─────────── (1-2 天)
         ──────────────────────────
         总计约 8-14 天
```

---

## Phase 0 — 项目脚手架

**状态**：已完成（2026-04-05）— `extension/`、`webview-ui/`、`schemas/` 可构建；示例 JSON 已通过 Schema 校验。

**目标**：搭建 Extension + Webview 双端项目骨架，确保能编译运行。

### Task 0.1 — Extension 项目初始化

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §1.2, §2.1, §九, §十`；`docs/ARCHITECTURE.md §七` |
| **做什么** | 创建 `extension/` 目录，初始化 `package.json`（VS Code Extension 清单），配置 webpack 5 + TypeScript，注册激活事件和 5 个命令（`EXTENSION_DESIGN.md §8.1`），创建空 `extension.ts` 入口 |
| **技术栈** | TypeScript, webpack 5, VS Code Extension API |
| **交付物** | `extension/` 完整脚手架，`npm run build` 可产出 `.js` |
| **验收** | `npx vsce package` 可打出 `.vsix`（功能为空但无报错） |

### Task 0.2 — Webview UI 项目初始化

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §一, §二, §三, §六, §十` |
| **做什么** | 创建 `webview-ui/`，初始化 React 18 + Vite 6 + TypeScript + Tailwind CSS 4 + React Router v6 + Zustand。创建 `MainLayout.tsx`（侧栏 + 顶栏 + 内容区），9 个空白路由页面占位，亮色/暗色主题切换 |
| **技术栈** | React 18, Vite 6, TypeScript, Tailwind CSS 4, React Router v6, Zustand, Lucide React |
| **交付物** | `webview-ui/` 完整脚手架，`npm run dev` 可在浏览器看到空白 Dashboard 布局 |
| **验收** | 9 个路由页面可切换，暗色/亮色主题可切换，`npm run build` 产出 `dist/` |

### Task 0.3 — JSON Schema 文件生成

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/SCHEMA_SPEC.md` 全文 |
| **做什么** | 根据 SCHEMA_SPEC 中每个 JSON 的字段定义，在 `schemas/` 目录下生成对应的 JSON Schema 文件：`manifest.schema.json`, `architecture.schema.json`, `capabilities.schema.json`, `progress.schema.json`, `test-results.schema.json`, `test-mapping.schema.json`, `test-expectations.schema.json`, `ai-sessions.schema.json`, `data-models.schema.json`, `docs-health.schema.json` |
| **交付物** | `schemas/*.schema.json`，每个文件可被 ajv 等 JSON Schema 校验库直接使用 |
| **验收** | 对 SCHEMA_SPEC 中的示例 JSON 执行校验通过 |

---

## Phase 1 — 数据层 + Schema 校验

**状态**：已完成（2026-04-05）— `ObservatoryStore`、`ObservatoryValidator`、`migrations.ts`、裁剪与损坏恢复、`npm test` 通过。

**目标**：实现 Observatory Store — 所有 `.observatory/*.json` 的读写管理，含校验、并发安全、生命周期。

**前置依赖**：Phase 0 完成。

### Task 1.1 — Observatory Store 核心

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §五`；`docs/SCHEMA_SPEC.md §1.6`；`docs/ARCHITECTURE.md §3.1, §3.2` |
| **做什么** | 实现 `extension/src/observatory/store.ts`：(1) 目录初始化（含 .gitignore 追加）；(2) 12 个 JSON 文件的类型化读写方法；(3) 基于文件粒度的写入队列保证并发安全；(4) `test-history.jsonl` 的追加写 + 流式读取 |
| **交付物** | `store.ts` + TypeScript 类型定义 `types.ts` |
| **验收** | 单测覆盖：并发写入不丢数据、JSONL 追加/读取正确、目录初始化幂等 |

### Task 1.2 — Schema Validator + Migration

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/SCHEMA_SPEC.md §1.4, §1.5`；Phase 0.3 产出的 `schemas/` 文件 |
| **做什么** | 实现 `extension/src/observatory/validator.ts`：(1) 使用 ajv 校验 JSON 文件；(2) 写入前校验 + 读取后校验双重门检；(3) Schema 版本检测 + 迁移框架（`migrations.ts`） |
| **交付物** | `validator.ts`, `migrations.ts` |
| **验收** | 非法数据写入被拦截；major 版本不匹配触发迁移或重建 |

### Task 1.3 — 数据生命周期管理

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/ARCHITECTURE.md §3.6, §3.7` |
| **做什么** | 在 Store 中实现 `pruneExpiredData()`（30 天裁剪）和损坏恢复流程（备份 → 删除 → 触发重建 → 告警） |
| **交付物** | Store 中的 `pruneExpiredData()` 和 `recoverCorruptedFile()` 方法 |
| **验收** | 30 天外数据被正确裁剪；损坏 JSON 可自动恢复；JSONL 损坏行被跳过 |

---

## Phase 2 — 事件采集 + 扫描器

**目标**：实现所有 Watchers 和 Scanners，能自动生成 `.observatory/` 全量数据。

**前置依赖**：Phase 1 完成。

### Task 2.1 — File Watcher + Git Watcher

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §3.1, §3.2`；`docs/ARCHITECTURE.md §9.1, §9.2` |
| **做什么** | 实现 `file-watcher.ts`（防抖 5s、changeBuffer、批量 flush）和 `git-watcher.ts`（监听 .git 变化、提取 commit 信息、更新 progress.json） |
| **交付物** | `watchers/file-watcher.ts`, `watchers/git-watcher.ts` |
| **验收** | 保存文件触发防抖更新；Git commit 后 progress.json 追加新记录 |

### Task 2.2 — Transcript Watcher

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §3.3`（完整的 3.3.1 ~ 3.3.3） |
| **做什么** | 实现 `transcript-watcher.ts`：多路径探测、格式版本检测、逐行容错解析、会话信息提取、upsert 到 `ai-sessions.json` |
| **交付物** | `watchers/transcript-watcher.ts` |
| **验收** | 目录不存在时不崩溃且报告 unavailable；未知格式尽力提取；损坏行跳过 |

### Task 2.3 — Diagnostic Watcher + Terminal Watcher

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §3.4, §3.5` |
| **做什么** | 实现 `diagnostic-watcher.ts`（语言诊断事件 → 更新 docs-health）和 `terminal-watcher.ts`（命令开始/结束事件 → 测试结果检测） |
| **交付物** | `watchers/diagnostic-watcher.ts`, `watchers/terminal-watcher.ts` |
| **验收** | 诊断变更事件正确捕获；测试命令的开始/结束可记录 |

### Task 2.4 — Python Scanner + SQL Scanner

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §4.1, §4.2, §4.3`；`docs/SCHEMA_SPEC.md §三（architecture.json）, §十（data-models.json）` |
| **做什么** | 实现 `python-scanner.ts`（包发现、import 分析、模块结构输出 → `architecture.json`）和 `sql-scanner.ts`（DDL 解析 → `data-models.json`） |
| **交付物** | `scanners/python-scanner.ts`, `scanners/sql-scanner.ts`, `scanners/base-scanner.ts`（接口定义） |
| **验收** | 对示例 Python 项目扫描输出符合 `architecture.json` schema；对示例 SQL 文件解析输出符合 `data-models.json` schema |

### Task 2.5 — Git Scanner + Doc Scanner

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/SCHEMA_SPEC.md §五（progress.json）, §十一（docs-health.json）` |
| **做什么** | 实现 `git-scanner.ts`（Git log 解析 → `progress.json` 初始化）和 `doc-scanner.ts`（代码中 business_doc_id 扫描 + primary_doc 路径校验 → `docs-health.json`） |
| **交付物** | `scanners/git-scanner.ts`, `scanners/doc-scanner.ts` |
| **验收** | Git 历史可解析为 progress 时间线；文档健康度检查项可正确评分 |

### Task 2.6 — AI Doc Index Adapter + 通用能力发现

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §4.4, §4.5`；`docs/ARCHITECTURE.md §3.4` |
| **做什么** | 实现 `adapters/ai-doc-index-adapter.ts`（读取 `ai-doc-index.json` → 映射为能力列表）和 `capability-discoverer.ts`（class-based 自动发现 + 用户确认修正） |
| **交付物** | `scanners/adapters/ai-doc-index-adapter.ts`, `scanners/capability-discoverer.ts` |
| **验收** | 有 ai-doc-index 的项目能正确映射；无 ai-doc-index 的项目能自动发现并标记 confidence="auto" |

### Task 2.7 — Extension 入口集成 + HTTP Server

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §二, §七, §八`；`docs/ARCHITECTURE.md §四, §九-§十` |
| **做什么** | 集成 `extension.ts` 入口：(1) 激活流程（检测项目类型 → 创建 Store/Scanner/Watcher 实例 → 启动 Server → 注册命令）；(2) 实现 `local-server.ts`（Express REST API + WebSocket + 静态文件服务）；(3) 实现 `message-bridge.ts`（Webview ↔ Extension 双向消息）；(4) 实现 `panel-provider.ts`（Webview Panel 管理）；(5) 实现侧栏 TreeView |
| **交付物** | `extension.ts`, `server/local-server.ts`, `bridge/message-bridge.ts`, `webview/panel-provider.ts` |
| **验收** | Extension 可在 Cursor 中激活；HTTP Server :3800 可访问 API；Webview 可打开；TreeView 显示能力状态 |

**状态**（2026-04-05）：已完成首轮集成——`workspace/observatory-registry.ts`（多根工作区 + `LocalServer` + 全量扫描）、`server/local-server.ts`（REST + `/ws/live` + 可选静态 `webview-ui`）、`webview/panel-provider.ts`（iframe 打开 Dashboard）、`tree/capability-tree-provider.ts`（侧栏能力列表）、`bridge/message-bridge.ts`（占位，Phase 3 接 postMessage）；`extension/` 下 `npm run build` 与 `npm test` 已通过。

---

## Phase 3 — 前端全量视图

**目标**：实现 9 个页面的完整 UI + 数据绑定 + 交互。

**前置依赖**：Phase 0.2 脚手架 + Phase 1 类型定义。Phase 2 产出的 Extension 可提供真实数据联调，但前端开发可先用 mock 数据并行。

### Task 3.0 — 前端数据层 + TypeScript 类型

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §二`；`docs/SCHEMA_SPEC.md`（全部 JSON 结构） |
| **做什么** | (1) `types/observatory.ts`：全部 `.observatory/` JSON 的 TypeScript 类型定义；(2) `services/data-source.ts`：`IDataSource` 接口；(3) `services/cursor-bridge.ts`：Webview 模式实现；(4) `services/http-client.ts`：浏览器模式实现 + WebSocket 实时订阅；(5) `createDataSource()` 自动检测工厂 |
| **交付物** | `types/`, `services/` 目录 |
| **验收** | HTTP 模式可从 :3800 获取数据；Webview 模式可通过 postMessage 获取数据 |

**状态**（2026-04-05）：已交付 `webview-ui/src/types/observatory.ts`、`services/{idata-source,data-source,http-client,cursor-bridge,errors,env}.ts`、`services/index.ts`；`createDataSource()` 在无 `acquireVsCodeApi` 时走 HTTP（`?root=` 必填），宿主页 Webview 可走 Bridge。Extension 侧新增 `bridge/observatory-request-handler.ts` + `webview/bridge-host.ts`（`attachObservatoryWebviewBridge`）；`local-server` 增补 `sessions-index`、`session/:id/meta`、`test-history` 与 CORS；Vite dev 配置 `/api`、`/ws` 代理至 :3800。

### Task 3.1 — 基础组件库

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §七, §八, §九` |
| **做什么** | 实现 `components/common/` 下所有基础组件：Badge, Card, StatusDot, Tooltip, EmptyState, ErrorState, LoadingSkeleton, ConnectionStatus, FreshnessBadge, ConfirmDialog。所有状态组件色盲友好（图标+文字标签，不依赖颜色） |
| **交付物** | `components/common/*.tsx` |
| **验收** | 每个组件可独立渲染；亮色/暗色主题适配 |

**状态**（2026-04-05）：已新增 `components/common/`：`Badge`、`Card`、`StatusDot`、`Tooltip`、`EmptyState`、`ErrorState`、`LoadingSkeleton`、`ConnectionStatus`、`FreshnessBadge`、`ConfirmDialog` 及 `index.ts`；侧栏展示 `ConnectionStatus`，概览页演示加载/错误/数据卡片。

### Task 3.2 — 概览仪表盘（Overview）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.1` |
| **做什么** | 实现 `views/Overview.tsx`：顶部 4 张统计卡片（AI 做了什么 / 做到哪一步 / 结果是否可用 / 数据新鲜度）+ 能力进度分布柱状图 + 最近 AI 活动列表 + 待关注项 |
| **依赖组件** | `PhaseDistribution.tsx`（chart/）、ActivityTimeline.tsx（timeline/）、基础组件 |
| **交付物** | `views/Overview.tsx` + 关联图表组件 |
| **验收** | 数据正确聚合展示；空状态有引导；卡片可点击跳转 |

**状态**（2026-04-05）：已交付 `views/Overview.tsx`（四张可点击统计卡、待关注项、`React.lazy`+`Suspense` 按需加载图表）；`lib/overview-aggregates.ts`；`components/chart/PhaseDistribution.tsx`（ECharts 按需 `core` + 横向柱图）；`components/timeline/ActivityTimeline.tsx`；`components/overview/OverviewStatCard.tsx`；依赖 `echarts` / `echarts-for-react`。

### Task 3.3 — 架构拓扑图（Architecture）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.2`；`docs/SCHEMA_SPEC.md §三（architecture.json）` |
| **做什么** | 实现 `views/Architecture.tsx` + `components/graph/`（TopologyGraph, GraphControls, NodeDetail, graph-styles）。使用 Cytoscape.js 渲染力导向/分层拓扑图，节点=模块，边=依赖，点击展开详情 |
| **技术依赖** | cytoscape, cytoscape-dagre（或 cytoscape-cola） |
| **交付物** | `views/Architecture.tsx`, `components/graph/*.tsx` |
| **验收** | 模块节点按代码量调整大小、按层级着色；边按引用次数调整粗细；点击打开详情侧栏 |

**状态**（2026-04-05）：已交付 `components/graph/`（`TopologyGraph` 懒加载 chunk、`graph-styles.ts`、`GraphControls`、`NodeDetail`、`graph-types.ts`）、`lib/architecture-graph.ts`；依赖 `cytoscape`、`cytoscape-dagre`；`views/Architecture.tsx` 接入 store，支持 Dagre/COSE、缩放/适应、节点侧栏详情。

### Task 3.4 — 能力看板（Capabilities）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.3`；`docs/SCHEMA_SPEC.md §四（capabilities.json）` |
| **做什么** | 实现 `views/Capabilities.tsx` + `components/kanban/`（KanbanBoard, KanbanColumn, CapabilityCard, CapabilityDetail）。五列 Kanban（planning → designing → developing → testing → released），卡片含进度/测试/文档徽章，可拖拽切换 phase |
| **交付物** | `views/Capabilities.tsx`, `components/kanban/*.tsx` |
| **验收** | 卡片按 phase 分列；拖拽可更新状态；点击展开详情抽屉 |

**状态**（2026-04-05）：已交付 `views/Capabilities.tsx`（加载/错误/空态、`Card` 包裹）、`components/kanban/`（`KanbanBoard` + `@dnd-kit/core` 跨列拖拽、`KanbanColumn`、`CapabilityCard`、`CapabilityCardPreview`、`CapabilityDetail`）、`lib/kanban-utils.ts`（七列含 `completed` / `deprecated`，与 `CapabilityPhase` 一致）、`store/observatory-store.ts` 的 `setCapabilityPhase`（本地更新 + `IDataSource.updateCapability`）。测试/文档徽章可后续按数据字段补强。

### Task 3.5 — 数据模型 ER 图（DataModels）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.4`；`docs/SCHEMA_SPEC.md §十（data-models.json）` |
| **做什么** | 实现 `views/DataModels.tsx` + `components/er/`（ERDiagram, TableDetail）。使用 Mermaid.js 或 D3 渲染 ER 图，点击表名展开字段/索引/关联能力 |
| **交付物** | `views/DataModels.tsx`, `components/er/*.tsx` |
| **验收** | 表和关系正确渲染；点击可查看字段详情 |

**状态**（2026-04-05）：已交付 `views/DataModels.tsx`（加载/错误/空态、表列表 + Mermaid 区域 + `TableDetail`）、`components/er/ERDiagram.tsx`（`mermaid` 动态 `render`、暗色主题）、`TableDetail.tsx`（字段表、索引、表内外键、`relationships` 中与该表相关的边、`capability_ids`）、`lib/er-mermaid.ts`（`buildErMermaid` / `tableKey`）；`types/observatory.ts` 补齐 `DataModelTable` 等结构；依赖 `mermaid`。

**补充**（2026-04-07）：`DataModels` 以焦点表为中心的 BFS 子图（邻域深度、最多表数、紧凑实体）；`ERDiagram` 提高 `maxTextSize` / `maxEdges`；`er-mermaid` 增加 `collectNeighborTableKeys`、`buildErMermaid` 的 `compact` 选项。

### Task 3.6 — 开发进度（Progress）+ AI 会话日志（AiSessions）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.5, §4.6`；`docs/SCHEMA_SPEC.md §五（progress.json）, §九（ai-sessions.json）` |
| **做什么** | 实现 `views/Progress.tsx` + `views/AiSessions.tsx` + `components/timeline/`（ActivityTimeline, CommitEvent, SessionEvent）。时间线视图展示 Git 提交和 AI 会话事件，支持按能力 ID 过滤 |
| **交付物** | `views/Progress.tsx`, `views/AiSessions.tsx`, `components/timeline/*.tsx` |
| **验收** | 时间线按时间倒序；可按能力过滤；AI 会话卡片展示文件变更/文档更新/测试结果 |

**状态**（2026-04-05）：已交付 `views/Progress.tsx`（summary 卡片、`CapabilityFilter`、`ActivityTimeline` + `CommitEvent`）、`views/AiSessions.tsx`（`SessionEvent`）、`components/timeline/`（`ActivityTimeline`/`TimelineItem`、`CommitEvent`、`SessionEvent`、`CapabilityFilter`；概览页原 `ActivityTimeline` 重命名为 `RecentAiSessionList`；`lib/timeline-utils.ts`、`lib/format-time.ts`；`types/observatory.ts` 补齐 `ProgressTimelineEvent`、`AiSessionFileChange` 等字段。

### Task 3.7 — 质量监控面板（QualityMonitor）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/QUALITY_MONITOR_DESIGN.md §五`；`docs/FRONTEND_DESIGN.md §4.7（DocsHealth 部分同理）`；`docs/SCHEMA_SPEC.md §六, §七, §八, §十三` |
| **做什么** | 实现 `views/QualityMonitor.tsx` + `components/chart/`（TestTrend, CoverageGauge, HeatmapCalendar）+ `components/table/`（TestMatrix, DataTable）。顶部总览卡片 + 能力级矩阵 + 能力详情（场景覆盖 + 用例明细 + 历史趋势） |
| **交付物** | `views/QualityMonitor.tsx`, `components/chart/*.tsx`, `components/table/*.tsx` |
| **验收** | 4 个指标卡片（能力覆盖率/通过率/场景覆盖率/用例总数）计算正确；矩阵排序筛选可用；趋势图渲染 |

**状态**（2026-04-05）：已交付 `lib/quality-aggregates.ts`（总览四指标、能力行状态、矩阵筛选/排序、历史序列/日历热度）；`components/chart/TestTrend.tsx`、`CoverageGauge.tsx`、`HeatmapCalendar.tsx`；`components/table/DataTable.tsx`、`TestMatrix.tsx`；`views/QualityMonitor.tsx`（总览卡片、热度+仪表盘、趋势、矩阵、选中能力详情与 `triggerTests`）；`types/observatory.ts` 增加 `TestCaseRow`。

### Task 3.8 — 会话管理（SessionManager）+ 文档健康（DocsHealth）

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §4.7, §4.8`；`docs/SCHEMA_SPEC.md §十一（docs-health.json）, §十二（sessions/index.json）, §十二-B（meta.json）` |
| **做什么** | 实现 `views/SessionManager.tsx` + `components/session/`（SessionList, SessionDetail, SessionArtifacts）+ `views/DocsHealth.tsx` + `components/table/DocsCheckTable.tsx` |
| **交付物** | `views/SessionManager.tsx`, `views/DocsHealth.tsx`, `components/session/*.tsx` |
| **验收** | 会话列表可按状态/标签/时间筛选；详情可查看消息时间线；文档健康度得分+检查项明细 |

**状态**（2026-04-05）：已交付 `lib/session-filters.ts`；`components/session/SessionList.tsx`、`SessionDetail.tsx`（`messages`/`transcript` 时间线 + `SessionArtifacts`）、`SessionArtifacts.tsx`；`components/table/DocsCheckTable.tsx`；`views/SessionManager.tsx`（状态/标签/时间/关键词筛选、`getSession` 详情）；`views/DocsHealth.tsx`（总分 + 检查表）；`types/observatory.ts` 扩展 `SessionIndexEntry`、`DocsHealthCheck`、`SessionIndex.generated_at`。

### Task 3.9 — 全局状态管理 + 实时订阅

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/FRONTEND_DESIGN.md §五`；`docs/ARCHITECTURE.md §4.1, §4.3` |
| **做什么** | 实现 `store/observatory-store.ts`（Zustand）：全量加载 + 按 scope 增量刷新 + WebSocket/postMessage 事件订阅 + 连接状态管理。集成到 App.tsx，启动时 loadAll() |
| **交付物** | `store/observatory-store.ts`；更新 `App.tsx` |
| **验收** | 数据变更时仅更新对应面板（不全量刷新）；WS 断连显示状态；重连后自动刷新 |

**状态**（2026-04-05）：已新增 `store/observatory-store.ts`（`loadAll` / `refresh(scope)` / `disposeLive`、WS `connection` 事件映射）；`HttpDataSource` 增加 WS 开闭与约 2.5s 自动重连；`App.tsx` 挂载时 `loadAll()`、卸载时释放订阅；`services/data-source-instance.ts` 单例数据源。

**工程**（2026-04-05）：`webview-ui` 各视图路由使用 `React.lazy` 按需分包，`MainLayout` 对 `<Outlet />` 包 `Suspense`（侧栏即时可见，内容区骨架屏），降低首包 `index.js` 体积，重页（质量监控 / ER / 看板等）随导航加载。

---

## Phase 4 — 质量 + 会话闭环

**目标**：完成 Extension 侧的测试解析、场景映射、会话管理。

**前置依赖**：Phase 2（Watchers/Scanners 可用）+ Phase 3（前端视图可联调）。

### Task 4.1 — pytest 报告解析 + 能力映射

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/QUALITY_MONITOR_DESIGN.md §三, §八`；`docs/SCHEMA_SPEC.md §六, §七` |
| **做什么** | 在 Extension 中实现：(1) `pytest --json-report` 结果解析（→ `test-results.json`）；(2) 三层映射机制（marker > import 分析 > 手动配置）→ `test-mapping.json`；(3) 测试历史追加写 → `test-history.jsonl` |
| **交付物** | 解析逻辑整合到 Store 或独立 `test-parser.ts` |
| **验收** | 对 stock-dashboard 的 pytest 报告可正确解析并按能力聚合 |

**状态**（2026-04-05）：已交付 Extension 侧 pytest-json-report 管线：`extension/src/quality/pytest-json-report.ts`（解析）、`test-mapping-merge.ts`（与既有映射合并）、`ingest-pytest-report.ts`（写 `test-results.json` / `test-mapping.json`、追加 `test-history.jsonl`）；命令 **`Observatory: Import Pytest JSON Report`**（`observatory.ingestPytestReport`）在 `package.json` 注册；`extension.ts` 选文件导入并刷新能力树。Vitest：`pytest-json-report.test.ts`。

**增强**（2026-04-05）：`TerminalWatcher` 在 `onDidEndTerminalShellExecution` 中若命令判定为 pytest，则按 `terminal-pytest-ingest` 约定查找 JSON 报告（优先 **`specs/<active>/observatory/pytest-report.json`**，其次兼容 **`specs/<active>/test/`**、旧 **`specs/<feature>/.observatory/`**、根 **`.observatory/pytest-report.json`**；自 shell cwd 向上 + workspace 根回退）、带短重试与 mtime 新鲜度校验后调用 `ingestPytestJsonReport`；配置项 **`observatory.test.autoIngestPytestReport`**（默认开启）。依赖集成终端 **Shell Integration**。示例：`pytest --json-report --json-report-file=specs/my-feature/observatory/pytest-report.json`。

### Task 4.2 — 期望场景分析框架

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/QUALITY_MONITOR_DESIGN.md §四` |
| **做什么** | 实现期望场景分析的**框架**（接口 + 手动输入模式）。AI 自动分析能力可作为可选增强，但框架必须支持手动配置期望场景。更新 `test-expectations.json` |
| **交付物** | 期望场景管理逻辑 |
| **验收** | 可手动配置期望场景；能力详情页可展示已覆盖/缺失场景 |

**状态**（2026-04-05）：已交付手动维护闭环：`webview-ui/src/lib/test-expectations-sync.ts`（解析块、`syncCoveredFromTestResults`、组装文档）；`components/quality/ExpectationScenarioEditor.tsx`（增删改场景、优先级、covered、保存、`analysis_method: manual`）；质量面板能力详情嵌入该编辑器。Extension：`PUT /api/observatory/test-expectations?root=`（`local-server.ts`，写后 `broadcast refresh tests`）；Bridge `saveTestExpectations` + `params.document`。`IDataSource.saveTestExpectations` 在 HTTP / CursorBridge 实现。

### Task 4.3 — 会话采集 + 索引管理

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/SCHEMA_SPEC.md §九, §十二, §十二-B` |
| **做什么** | 完善 TranscriptWatcher 的会话提取逻辑：生成 `sessions/ses_XXX/meta.json`、维护 `sessions/index.json`、关联 capability_ids 和 files_touched |
| **交付物** | 完善后的 `transcript-watcher.ts` + `store.ts` 会话管理方法 |
| **验收** | 新 AI 对话自动出现在会话列表；详情页展示文件/产物/摘要 |

**状态**（2026-04-05）：已增强 Transcript：`transcript-session-extract.ts`（从 capabilities.json 加载 ID、全文命中能力 ID、启发式提取工作区相对路径、工具行计数、时间范围）；`transcript-watcher.ts` 写入 `writeSessionMeta`、`upsertSessionIndexEntry`、`upsertAiSession`（含 summary、files_modified、transcript_source/transcript_file）；`ObservatoryStore` 新增 `writeSessionMeta`、`upsertSessionIndexEntry`（index 带 `generated_at`）；`FolderSession` 在 Transcript 更新后触发 `onScanComplete`（广播 + 树刷新）。Vitest：`transcript-session-extract.test.ts`。

---

## Phase 5 — 可靠性 + 打包发布

**目标**：统一错误处理、实现降级策略、完成打包。

**前置依赖**：Phase 2-4 全部完成。

### Task 5.1 — 错误模型统一 + 降级策略

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/ARCHITECTURE.md §十一`；`docs/SCHEMA_SPEC.md §1.4` |
| **做什么** | (1) 统一 Extension/Server/Bridge 的错误对象格式 `{ code, message, detail, retryable }`；(2) 实现降级矩阵（见 ARCHITECTURE §11.2）；(3) WebSocket 断连自动重连 + 指数退避 + HTTP 轮询降级 |
| **交付物** | 错误模型 + 降级逻辑代码 |
| **验收** | 各类型错误前端可分类提示并支持重试；WS 断连可自动恢复 |

**状态**（2026-04-05）：Extension `observatory/errors.ts` 增加 `observatoryErrorFromUnknown`、`ObservatoryErrorShape`；HTTP `err()` 支持 `detail`；Bridge 响应增加 **`errorPayload`**（与 HTTP 同形）。Webview `ObservatoryDataError` 含 `code/detail/retryable/status`，**`fromHttpResponse` / `fromBridge`**；`HttpDataSource` 在 fetch 失败时解析 JSON 错误体。**WS**：指数退避重连（1s 起、上限 30s、抖动）+ 断连时 **15s HTTP 轮询**（`refresh` 全量）直至 WS 恢复；无订阅时关闭 WS/轮询。**按面板降级矩阵**仍以「数据缺失 → 各视图空/错」为主，未单独建 feature 标志表。

### Task 5.2 — Extension 状态机 + 多工作区

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/ARCHITECTURE.md §十, §3.5` |
| **做什么** | (1) 实现 Extension 状态机（INITIALIZING → READY → SCANNING → RECOVERING → DEGRADED）；(2) 多工作区支持：每个 workspace folder 独立 .observatory/、独立 Watcher/Scanner 实例；(3) 端口冲突自动递增 |
| **交付物** | 状态机逻辑 + 多工作区管理 |
| **验收** | 状态切换正确；multi-root workspace 各项目独立工作 |

**状态**（2026-04-05）：新增 **`observatory-state-machine.ts`**（`ObservatoryRunState`、`getPhase`/`subscribe`、`beginInitializing`/`markReady`/`beginScanning`/`beginRecovering`/`markDegraded`）。**`ObservatoryRegistry`**：激活时 `INITIALIZING` → 工作区注册与首轮扫描后（或 HTTP 启动失败 / 扫描失败）`DEGRADED` 或 `READY`；**`runFullScanAllFolders`**：`SCANNING` → 成功 `READY` / 失败 `DEGRADED`；暴露 **`getRunState` / `getStateMachine` / `getListenPort`**。**`LocalServer.start`** 异步，**`port-utils.findAvailablePort`** 在配置端口起连续 10 个端口内探测；**`getListenPort`** 供打开 Dashboard。**`RECOVERING`** 已留 API，待与 `recoverCorruptedFile` 路径对接时调用。

### Task 5.3 — 打包 + 安装验证

| 项目 | 说明 |
|------|------|
| **subagent 上下文** | `docs/EXTENSION_DESIGN.md §九` |
| **做什么** | (1) 配置 Extension 构建脚本（包含 webview-ui 编译产物）；(2) `npx vsce package` 打包 `.vsix`；(3) 在 Cursor 中安装测试 |
| **交付物** | `.vsix` 安装包 + 安装文档 |
| **验收** | 在 Cursor 中安装后，可对真实项目（如 stock-dashboard）执行全链路：初始化 → 扫描 → 查看 Dashboard |

---

## 四、Subagent 执行协议

每个 Task 交给 subagent 时，遵循以下协议：

### 4.1 上下文传递

```
给 subagent 的 prompt 结构：

1. 任务目标：一句话说清做什么
2. 读取文档：列出需要读取的文档路径（subagent 自己读取）
3. 输出路径：代码写到哪些文件
4. 技术约束：语言/框架/依赖版本
5. 验收标准：写完后如何验证
```

### 4.2 不需要产出的东西

- **不需要**写单独的设计文档 — 设计已在 `docs/` 中
- **不需要**更新 README — 整体完成后统一更新
- **不需要**关注其他 Task 的实现 — 只关注自己的目标
- **不需要**关注 stock-dashboard 项目的规则 — 这是独立项目

### 4.3 命名与风格

- Extension 代码：TypeScript，严格模式，`camelCase` 方法名
- 前端代码：React FC + TypeScript，Tailwind CSS 原子类
- 文件命名：kebab-case（如 `file-watcher.ts`）
- 组件命名：PascalCase（如 `TopologyGraph.tsx`）
- 所有代码使用 English 命名，注释可使用中文

---

## 五、依赖清单

### Extension (`extension/package.json`)

| 包 | 用途 |
|-----|------|
| `express` | HTTP Server |
| `ws` | WebSocket |
| `ajv` | JSON Schema 校验 |
| `glob` | 文件匹配 |
| `simple-git` | Git 操作 |

开发依赖：`typescript`, `webpack`, `webpack-cli`, `ts-loader`, `@types/vscode`, `@types/express`, `@types/ws`, `vitest`

### Webview UI (`webview-ui/package.json`)

| 包 | 用途 |
|-----|------|
| `react`, `react-dom` | UI 框架 |
| `react-router-dom` | 路由 |
| `zustand` | 状态管理 |
| `echarts`, `echarts-for-react` | 图表 |
| `cytoscape`, `cytoscape-dagre` | 拓扑图 |
| `@tanstack/react-table` | 表格 |
| `lucide-react` | 图标 |
| `mermaid` | ER 图 |

开发依赖：`typescript`, `vite`, `@vitejs/plugin-react`, `tailwindcss`, `vitest`, `@testing-library/react`

---

## 六、全链路验收检查清单

完成所有 Phase 后，执行以下端到端验证：

| # | 验证项 | 操作 | 期望结果 |
|---|--------|------|---------|
| 1 | Extension 激活 | 在 Cursor 中打开 stock-dashboard 项目 | Extension 自动激活，.observatory/ 目录生成 |
| 2 | 全量扫描 | 执行 "Observatory: Run Full Scan" | architecture.json + capabilities.json + data-models.json 生成 |
| 3 | 增量更新 | 保存一个 .py 文件 | 5s 后 architecture.json 更新 |
| 4 | Git 追踪 | 执行 git commit | progress.json 追加记录 |
| 5 | AI 会话 | 运行一次 Cursor Agent 对话 | ai-sessions.json 更新，会话列表可见 |
| 6 | 测试集成 | 运行 pytest | test-results.json + test-history.jsonl 更新 |
| 7 | Webview 面板 | 打开 Observatory Dashboard | 9 个页面数据正确展示 |
| 8 | 浏览器访问 | 访问 localhost:3800 | 同 Webview 内容一致 |
| 9 | 实时推送 | 保存文件 → 观察 Dashboard | 无需手动刷新，数据自动更新 |
| 10 | 错误恢复 | 手动损坏一个 .observatory/*.json | 自动重建 + 告警提示 |
| 11 | 多工作区 | 打开 multi-root workspace | 各项目 .observatory/ 独立 |
| 12 | 主题切换 | 在 Cursor 中切换亮色/暗色 | Dashboard 主题跟随切换 |

---

## 七、快速参考 — Task 依赖图

```
Phase 0 (脚手架)
  ├── 0.1 Extension 初始化 ──┐
  ├── 0.2 Webview UI 初始化 ─┤
  └── 0.3 JSON Schema ──────┘
                              │
Phase 1 (数据层)              ▼ 全部依赖 Phase 0
  ├── 1.1 Store 核心 ──┬── 1.2 Validator + Migration
  │                    └── 1.3 生命周期管理
  │
Phase 2 (采集+扫描)          ▼ 依赖 Phase 1
  ├── 2.1 File + Git Watcher ─────┐
  ├── 2.2 Transcript Watcher ─────┤ 可并行
  ├── 2.3 Diagnostic + Terminal ───┤
  ├── 2.4 Python + SQL Scanner ────┤
  ├── 2.5 Git + Doc Scanner ──────┤
  ├── 2.6 AiDocIndex + Discoverer ─┘
  └── 2.7 Extension 集成 ←── 以上全部完成后
  │
Phase 3 (前端)               ▼ 3.0 依赖 Phase 0.2；其余可用 mock 并行
  ├── 3.0 数据层 + 类型 ────────┐
  ├── 3.1 基础组件库 ────────────┤ 可并行
  ├── 3.2 概览 ─────────────────┤
  ├── 3.3 架构拓扑 ──────────────┤
  ├── 3.4 能力看板 ──────────────┤
  ├── 3.5 数据模型 ──────────────┤
  ├── 3.6 进度 + AI 日志 ────────┤
  ├── 3.7 质量监控 ──────────────┤
  ├── 3.8 会话 + 文档健康 ───────┘
  └── 3.9 全局状态 ←── 以上全部完成后集成
  │
Phase 4 (质量+会话闭环)       ▼ 依赖 Phase 2 + 3
  ├── 4.1 pytest 解析 + 映射 ──┐
  ├── 4.2 期望场景框架 ─────────┤ 可并行
  └── 4.3 会话采集 + 索引 ──────┘
  │
Phase 5 (可靠性+发布)         ▼ 依赖 Phase 2-4
  ├── 5.1 错误模型 + 降级 ─────┐
  ├── 5.2 状态机 + 多工作区 ───┤ 可并行
  └── 5.3 打包 + 安装验证 ←── 以上全部完成后
```

---

## 八、风险与缓解

详见 `docs/ROADMAP.md §六` — 10 项技术风险与缓解策略。本文不再复制。

关键补充：
- **并行 subagent 冲突**：Phase 2 和 Phase 3 的 subagent 会并行修改 `extension/` 和 `webview-ui/`，但两个目录完全独立，不会产生文件冲突。Phase 2.7 和 3.9 作为各自阶段的收尾集成点，需在其他 task 全部完成后执行。
- **mock 数据策略**：Phase 3 的前端 subagent 应在 `webview-ui/src/__mocks__/` 下放置符合 SCHEMA_SPEC 的 mock JSON 数据，用于独立开发和测试。Phase 2 完成后切换为真实数据源。
