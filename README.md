# Cursor Observatory

> **AI 开发可观测平台** — 给 Cursor 装上项目全景仪表盘和开发过程记录仪。

## 愿景

将 Cursor AI 的开发过程从「隐性的代码操作」提升为「显性的功能管理平台」。  
不重造 Cursor 的轮子，而是通过 **VS Code Extension**（在 Cursor 中完全兼容）增强 IDE，让每一次 AI 协作都可观测、可追溯、可管控。

**始终回答三个问题**：AI 做了什么？做到哪一步了？结果是否可用？

---

## 扩展说明（cursor-observatory）

| 项 | 说明 |
|----|------|
| **扩展标识** | `cursor-observatory`（发布者 `cursor-observatory`） |
| **显示名称** | Cursor Observatory |
| **当前版本** | 见 `extension/package.json` 的 `version` |
| **引擎要求** | VS Code API `^1.85.0`（Cursor 内置版本通常满足） |
| **安装形态** | 单个 `.vsix` 包；**不**声明 `extensionDependencies` / `extensionPack`，安装时**不会**自动安装其它扩展 |
| **包内组成** | 编译后的 Extension 主程序（`dist/extension.js`）、嵌入的 Webview 静态资源（`dist/webview-ui/`）、校验与本地服务依赖已打包进扩展 |

### 激活时机

扩展在以下任一情况会加载：

- 工作区内已存在 **`.observatory`** 目录（`workspaceContains:.observatory`）；
- 或你显式执行任一 Observatory **命令**（见下表）。

首次使用若仓库里还没有 `.observatory`，可先执行 **「Observatory: Initialize Project」**，或先创建空目录后再打开工作区。

---

## 功能概览

Observatory 在单个扩展内同时提供：**数据采集**、**项目内 JSON 存储**、**内嵌仪表盘（Webview）**、**本机 HTTP + WebSocket 服务**（供浏览器与同构前端访问）。

| 能力域 | 说明 |
|--------|------|
| **项目数据层** | 在每个工作区根目录维护 **`.observatory/*.json`**，作为仪表盘与扩展的单一数据源（契约见 `docs/SCHEMA_SPEC.md`）。 |
| **扫描与监听** | 对代码与 IDE 事件做扫描/监听（含 Git、Agent 会话轨迹、文件变更等，具体以 `EXTENSION_DESIGN` 与实现为准），写入或更新上述 JSON。 |
| **能力（Capability）** | 以「业务能力」为粒度追踪生命周期；若存在 `docs/00-meta/ai-doc-index.json` 等索引，可与现有治理体系对齐映射。 |
| **侧栏** | 活动栏 **Observatory** 容器中的 **Capabilities** 树，展示当前工作区能力状态（数据来自 Store）。 |
| **仪表盘** | 命令 **Open Dashboard** 打开内嵌 Webview；与本地 **Express** 服务配合，提供 REST、**WebSocket** 推送刷新；前端可在断连时降级为 HTTP 轮询。 |
| **浏览器访问** | 本地服务启动后，可用浏览器访问 **`http://127.0.0.1:<端口>`**（默认端口见设置），与内嵌 UI 同源能力（静态资源由扩展目录提供）。 |
| **质量与测试** | 支持 **pytest-json-report**、规范化 **report.json**、**JUnit/Surefire XML** 等导入，更新 `report.json`/`test-mapping.json` 并追加 `test-history.jsonl`；可选集成终端在 pytest / **mvn test** / **gradlew test** 结束后自动导入（见 `observatory.test.autoIngestTestReport`）。 |
| **能力阶段自动化** | 监听 **Agent 转录**（`.jsonl`），按对话关键词**上调**能力阶段；测试结果导入且 `by_capability` 全通过时，可将「测试中」标为 **已完成**；Git 新提交若含 `Observatory: <能力id>` 行则标为 **已发布**。 |
| **数据模型 AI 引导** | 命令 **Open Data Model AI Prompt** 生成说明文档，便于让 AI 输出完整 `data-models.json`（替代仅依赖 SQL 正则扫描）。 |
| **项目初始化 Rule** | **Initialize Project** 时可在 `.cursor/rules/observatory-project.mdc` 写入协作约定（可关）。 |
| **可靠性** | 统一错误体 `{ code, message, detail, retryable }`；扩展侧 **状态机**（如 INITIALIZING / READY / SCANNING / DEGRADED 等）；HTTP 服务启动失败时可进入降级路径。 |
| **需求面板 V2** | SDD 能力右侧详情：需求链接（TAPD 时可一键复制 AI 指令拉取 MCP 详情 / Cheetah+Git 分支工作流）、`specs/<feature>/observatory/` 下的 `impact-analysis` / `test-cases` JSON 与派生 Markdown（兼容 `Observatory` 目录名大小写）、`observatory-sdd.json` 与部署手工服务列表、UT/部署/测试用例 Prompt、MCP 预检与 Git 新鲜度；配置项见 `observatory.prompt.*` / `observatory.skill.*` / `observatory.mcp.*` / `observatory.deploy.defaultServiceList`。设计见 `docs/REQUIREMENT_PANEL_V2_DESIGN.md`，使用说明见 `docs/USER_GUIDE.md` §8。 |

仪表盘内各面板（概览、架构、能力看板、数据模型、AI 会话、质量监控等）的**详细交互**以 `docs/FRONTEND_DESIGN.md` 与实现为准；上表为产品级能力边界说明。

---

## 数据流（简图）

```
┌─ Cursor IDE ──────────────────────────────────────────────┐
│  Extension 监听 / 扫描:                                    │
│  • 文件变更 → architecture 等                             │
│  • Git 操作 → progress 等                                   │
│  • Agent Transcript → ai-sessions 等                        │
│  • 测试报告 → test-results / test-mapping 等                │
│                     │                                      │
│  写入 → 项目/.observatory/*.json（标准化中间格式）            │
│                     │                                      │
│  ┌──────────────────▼──────────────────┐                   │
│  │  Webview Panel（React，消息桥 + 可选 WS）               │
│  └─────────────────────────────────────┘                   │
└────────────────────────────────────────────────────────────┘
                      │ 同机 HTTP(S) API + WS + 静态资源
                      ▼
              浏览器 http://127.0.0.1:<端口>/?root=<编码后的根路径>
```

多文件夹工作区时：**每个根文件夹**各自拥有 **`.observatory/`** 与独立的会话（Watcher / Scanner 实例），互不覆盖。

---

## 命令与使用方式

在 Cursor 中 **`Cmd+Shift+P`（macOS）或 `Ctrl+Shift+P`（Windows/Linux）** 打开命令面板，输入 `Observatory` 可筛选。

| 命令（英文标题） | 作用 |
|------------------|------|
| **Observatory: Initialize Project** | 对当前所有工作区文件夹执行 Store 初始化，并执行一次全量扫描；适合首次接入或重建索引。 |
| **Observatory: Open Dashboard** | 确保本地 HTTP 服务已启动，打开内嵌 **Observatory 仪表盘**（Webview）。若默认端口被占用，扩展会尝试递增绑定，请以实际监听端口为准。 |
| **Observatory: Run Full Scan** | 对所有已注册文件夹执行**全量扫描**（内部会更新状态机：SCANNING → READY 或失败时 DEGRADED）。 |
| **Observatory: Run Tests** | **提示向**：按项目栈提示本机测试命令（Maven/Gradle/pytest/npm 等）；不替代你在终端里自行运行测试。 |
| **Observatory: Import Test Report** | 选择 pytest JSON、规范化 report.json 或 JUnit XML，导入并更新测试结果与映射、历史。若 `.observatory` 不存在会先初始化。 |
| **Observatory: Show in Dashboard** | 与 **Open Dashboard** 相同（打开仪表盘）。 |
| **Observatory: Open Data Model AI Prompt** | 在工作区 `.observatory/` 写入并打开 **DATA_MODEL_AI_PROMPT.md**，按文中步骤让 AI 生成 `data-models.json`。 |

### 推荐操作顺序（新业务项目）

1. 用 Cursor **打开项目根目录**（或添加为多根工作区中的一个文件夹）。  
2. 执行 **Initialize Project**，确认根目录下生成 `.observatory/`。  
3. 执行 **Open Dashboard** 查看仪表盘；需要时用浏览器访问同端口页面做并行查看。  
4. 日常可 **Run Full Scan** 刷新结构/能力数据；跑完测试后使用 **Import Test Report**，或开启 **`observatory.test.autoIngestTestReport`** 依赖自动导入（集成终端 pytest / Maven / Gradle 结束后优先拾取较新的 SDD **`report.json`**，否则聚合 Surefire XML；**`specs/**/observatory/report.json`**（及兼容 `test/`）保存时也会去抖后自动导入，见 `docs/USER_GUIDE.md`）。  
5. 排查扩展行为时打开 **输出** 面板，选择 **「Observatory」** 频道查看日志。

### 测试与质量数据（摘要）

- 使用 **`pytest --json-report`**、**Surefire `TEST-*.xml`** 等生成报告后，可通过 **Import Test Report** 导入；若开启 **`observatory.test.autoIngestTestReport`**（旧键 `autoIngestPytestReport` 仍兼容），集成终端在 pytest / Maven / Gradle 测试结束后会自动拾取：**SDD 下优先较新（约 2 分钟内）的 `specs/<active>/observatory/` 中 `report.json` 或 `pytest-report.json`**（含带 `by_capability` 的规范化 JSON），**否则**聚合 Surefire / Gradle 的 JUnit XML。另监听 **`specs/**/observatory/report.json`** 与兼容 **`specs/**/test/report.json`** 的写入/保存（去抖时间同 **`observatory.scan.debounceMs`**），便于测试结束后再更新 JSON。详见 `docs/USER_GUIDE.md`。  
- 详细字段与映射规则见 **`docs/QUALITY_MONITOR_DESIGN.md`** 与 **`docs/SCHEMA_SPEC.md`**。

---

## 设置（Settings）

在 Cursor **设置**中搜索 **`observatory`**。

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `observatory.server.port` | number | `3800` | 本地 HTTP 服务监听端口；若被占用，实现会尝试使用其它可用端口。 |
| `observatory.server.autoStart` | boolean | `true` | 扩展激活时是否自动启动本地 HTTP 服务。 |
| `observatory.scan.debounceMs` | number | `5000` | 文件变更触发扫描的去抖时间（毫秒）。 |
| `observatory.scan.ignorePaths` | string[] | `node_modules`, `.venv`, `__pycache__` | 扫描时忽略的路径片段。 |
| `observatory.git.watchEnabled` | boolean | `true` | 是否启用 Git 相关监听。 |
| `observatory.transcript.watchEnabled` | boolean | `true` | 是否启用 Agent 会话轨迹相关监听。 |
| `observatory.test.framework` | enum | `auto` | 测试框架提示：`auto` / `pytest` / `jest` / `junit`。 |
| `observatory.test.autoDetectResults` | boolean | `true` | 是否自动探测测试结果产物。 |
| `observatory.test.autoIngestTestReport` | boolean | `true` | 集成终端中 pytest / mvn test / gradlew test 结束后自动导入；SDD 优先较新的 `specs/<active>/observatory/report.json`（先于 JUnit XML）。另在 `specs/**/observatory/report.json` 与兼容 `test/` 保存时自动导入（与终端短窗口去重）。旧键 `autoIngestPytestReport` 仍兼容。 |
| `observatory.transcript.agentTranscriptsPath` | string | `""` | **手动指定** `agent-transcripts` 目录（绝对路径，或 `${workspaceFolder}` 相对路径）；留空则按 `~/.cursor/projects/<工作区路径 slug>/agent-transcripts` 等规则自动探测。 |
| `observatory.capability.aiPhaseInferenceEnabled` | boolean | `true` | 是否根据 Agent 会话文本自动上调能力阶段。 |
| `observatory.capability.autoCompleteOnTestsPass` | boolean | `true` | 导入测试结果后，是否将「测试中」且 `by_capability` 全通过的能力标为 **已完成**。 |
| `observatory.onboarding.createCursorRule` | boolean | `true` | Initialize 时是否创建 `.cursor/rules/observatory-project.mdc`。 |
| `observatory.deploy.defaultServiceList` | string | `""` | 需求面板「环境部署」：影响分析未列出应用服务时，与需求级 `deployServiceList` 合并的默认服务名（英文逗号分隔）。 |
| `observatory.mcp.cheetah` | string | `""` | Cheetah（泳道/OpenAPI）MCP 服务名；TAPD 需求链接旁「分支工作流」复制 Prompt 中引用。 |

**Git 提交与「已发布」**：在新提交说明中单独一行写 `Observatory: cap-id-one,cap-id-two`（或 `能力:` 前缀），扩展会将对应能力阶段设为 **released**。

---

## 核心组件（仓库结构）

| 组件 | 位置 | 职责 |
|------|------|------|
| **Cursor Extension** | `extension/` | 事件监听、项目扫描、数据生成、内嵌 Webview、本地 HTTP Server |
| **React 前端** | `webview-ui/` | 通用可视化 Dashboard，构建产物嵌入 `extension/dist/webview-ui/` |
| **JSON Schema** | `schemas/` | 标准化数据契约，与 `SCHEMA_SPEC` 对齐校验 |
| **技术文档** | `docs/` | 架构设计、数据规格、实施路线图 |

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据存储 | 项目内 `.observatory/*.json` | 零外部依赖，Extension 直接读写，前端通用 |
| 多工作区 | 每个子项目独立 `.observatory/` | 数据隔离，互不干扰 |
| 能力发现 | 有 ai-doc-index → 映射；无 → class-based 推断 + 用户确认 | 兼顾有/无元数据体系的项目 |
| 数据保留 | 历史数据保留 30 天（由扩展裁剪） | 平衡存储与可追溯性 |
| 损坏恢复 | 自动重建为主 | 简单可靠，避免复杂回滚逻辑 |

---

## 技术文档索引

| 文档 | 内容 | 关注点 |
|------|------|--------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | 整体架构与数据流 | 系统全貌、状态机、错误处理、时序图 |
| [SCHEMA_SPEC.md](docs/SCHEMA_SPEC.md) | `.observatory/` JSON 数据契约 | 前后端交互规格、schema 演进策略 |
| [EXTENSION_DESIGN.md](docs/EXTENSION_DESIGN.md) | Cursor Extension 技术设计 | Watcher/Scanner/Store 实现、容错策略 |
| [FRONTEND_DESIGN.md](docs/FRONTEND_DESIGN.md) | React 前端设计 | 视图、组件、状态管理、可访问性 |
| [QUALITY_MONITOR_DESIGN.md](docs/QUALITY_MONITOR_DESIGN.md) | 质量监控面板设计 | 测试↔能力映射、场景覆盖分析 |
| [ROADMAP.md](docs/ROADMAP.md) | 实施路线图与里程碑 | Workstream 划分、验收标准、技术风险 |
| [IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md) | **技术实施指南（推进入口）** | 阶段 Task、依赖图、验收清单 |
| [USER_GUIDE.md](docs/USER_GUIDE.md) | **使用说明与常见问题** | 能力开发、数据模型限制、会话识别、Git 提交预期 |

---

## 术语速查

| 术语 | 定义 |
|------|------|
| **Capability（能力）** | 独立的业务能力单元，Observatory 追踪的核心粒度 |
| **Module（模块）** | 代码层面的目录/包 |
| **Phase（阶段）** | 能力生命周期：planning → designing → developing → testing → released |
| **Session（会话）** | 一次 AI Agent 协作对话 |
| **Scanner（扫描器）** | 解析项目代码结构的 Extension 组件 |
| **Watcher（监听器）** | 监听 IDE 事件的 Extension 组件 |

---

## 本地构建与安装

### 构建（本仓库）

```bash
# Extension（TypeScript → dist/extension.js）
cd extension && npm install && npm run build

# Webview UI（React → 产出供复制到 extension/dist/webview-ui）
cd ../webview-ui && npm install && npm run build

# JSON Schema 与 SCHEMA_SPEC 示例对齐校验
cd ../schemas && npm install && npm run validate

# Extension 单元测试
cd ../extension && npm test
```

打包 **`.vsix`** 前请先完成 **webview-ui** 与 **extension** 的 `build`（webpack 会把 Webview 产物拷入扩展目录，详见 `extension` 构建配置）。

```bash
cd extension && npm run package
# 生成 cursor-observatory-<version>.vsix
```

### 安装到 Cursor

1. 菜单 **Extensions（扩展）** → **`⋯`** → **Install from VSIX…**  
2. 选择生成的 `.vsix` 文件。  
3. 必要时 **重新加载窗口** 后再打开目标项目。

开发调试：在 `extension` 目录用 Cursor 打开工程，**F5** 启动 **Extension Development Host**，在新窗口中打开业务仓库进行验证。

### Webview 仅前端调试

```bash
cd webview-ui && npm run dev
```

开发模式下可将 API/WebSocket 代理到本机 Observatory HTTP 服务端口（见 `webview-ui` 内 Vite 配置）。

---

## 版本与 Git 建议

- **`.observatory/`** 是否提交由团队决定：提交可共享仪表盘状态；忽略则每人本地生成。  
- 若 **schema major** 与扩展不兼容，前端会提示升级扩展；升级前请阅读 `SCHEMA_SPEC` 中的迁移说明。

---

## 许可

MIT


```
# 启动命令
cd webview-ui && npm install && npm run build
cd ../extension && npm install && npm run build && npm run package
```
