# 实施路线图（最终版）

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

### 相关文档

| 文档 | 关系 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 架构设计与错误处理（实施的技术基础） |
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | 数据契约（实施的验收标准之一） |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | Extension 详细设计（Workstream A/B 的实施蓝图） |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | 前端详细设计（Workstream C 的实施蓝图） |

---

## 一、开发原则

本项目按**最终形态**一次性设计和开发，不区分 MVP/中间交付版本。  
全程使用 **AI 编程（Cursor Agent）** 推进开发，利用本项目自身的文档体系作为 AI 上下文，加速实现。

所有模块均以"可直接用于真实项目"的标准实现：

1. **全功能闭环**：采集、存储、展示、交互、质量、会话管理全部打通。
2. **契约先行**：`docs/SCHEMA_SPEC.md` 为唯一数据契约来源。
3. **双端一致**：Cursor Webview 与浏览器独立模式展示一致、能力一致。
4. **可恢复可降级**：任一链路失败时有明确提示和退化策略。
5. **AI 编程推进**：每个 Workstream 启动时，将相关设计文档（ARCHITECTURE + SCHEMA_SPEC + 对应设计文档）作为 AI Agent 上下文，按契约生成代码。

### 1.1 AI 编程工作方式

```
每个 Workstream 的 AI 编程流程：

1. 准备上下文
   将 SCHEMA_SPEC.md + 对应设计文档加入 AI 对话上下文

2. 按模块生成
   • Extension: 逐个 Watcher/Scanner 生成 → 单测验证 → 集成
   • Frontend: 逐个视图生成 → 组件渲染测试 → 数据联调
   • Store: 接口 → 实现 → 并发/损坏测试

3. 契约校验
   每个模块完成后，用 SCHEMA_SPEC 中的示例数据验证输入输出

4. 联调
   Extension 生成 .observatory/ → 前端读取并渲染 → 交互操作回写
```

---

## 二、最终交付范围（In Scope）

### 2.1 Extension 能力

- 监听：File/Git/Transcript/Diagnostic/Terminal 事件
- 扫描：Python/SQL/Git/Doc/AiDocIndex/通用 Class 解析
- 存储：`.observatory/` 全量文件读写、增量更新、Schema 校验、并发写入队列
- 服务：REST API + WebSocket 推送 + Webview Message Bridge
- 命令：初始化、打开面板、全量扫描、运行测试、跳转文件
- 生命周期：30 天数据保留、损坏文件自动重建、多工作区独立 `.observatory/`

### 2.2 前端能力

- 全量页面：概览、架构、能力、数据模型、进度、质量、AI 日志、会话管理、文档健康
- 双模数据源：Cursor Bridge / HTTP + WS 自动切换
- 实时刷新：增量事件驱动刷新 + 断线重连
- 跨页联动：能力卡片、测试矩阵、会话记录互跳
- 状态设计：空状态引导、错误降级提示、加载骨架屏
- 可访问性：色盲友好状态标识、键盘导航、屏幕阅读器支持

### 2.3 数据契约

最终版必须完整生成并维护以下文件：

`manifest.json`、`architecture.json`、`capabilities.json`、`progress.json`、`data-models.json`、`ai-sessions.json`、`test-results.json`、`test-mapping.json`、`test-expectations.json`、`docs-health.json`、`sessions/index.json`、`test-history.jsonl`

---

## 三、实施工作流（按工作流并行，不按阶段裁剪）

### 3.1 Workstream A：事件采集与扫描

| 任务 | 说明 | AI 上下文 | 完成标准 |
|------|------|----------|---------|
| Watchers 全接入 | File/Git/Transcript/Diagnostic/Terminal | EXTENSION_DESIGN §三 | 关键事件均有日志和回调 |
| TranscriptWatcher 容错 | 版本检测 + 格式自适应 + 逐行容错 | EXTENSION_DESIGN §3.3 | 未知格式不崩溃，降级可用 |
| Scanners 全接入 | Python/SQL/Git/Doc/AiDocIndex | EXTENSION_DESIGN §四 | 对 stock-dashboard 扫描无阻断错误 |
| 通用能力发现 | Class-based 发现 + 用户确认修正 | ARCHITECTURE §3.4 + EXTENSION_DESIGN §4.4 | 无 ai-doc-index 项目可自动生成能力列表 |
| 增量策略 | 仅更新受影响数据文件 | ARCHITECTURE §9.1 | 保存文件后 5s 内可见更新 |

### 3.2 Workstream B：数据层与契约校验

| 任务 | 说明 | AI 上下文 | 完成标准 |
|------|------|----------|---------|
| Observatory Store | 统一读写、追加、幂等更新、写入队列 | SCHEMA_SPEC §1.6 | 并发写入不丢数据，重启后数据不丢失 |
| Schema Validator | 写入前后校验契约 + 迁移 | SCHEMA_SPEC §1.5 | 非法数据可拦截并报错 |
| Freshness 元信息 | 统一 `generated_at` 与来源事件 | SCHEMA_SPEC §1.1 | 前端可展示数据新鲜度 |
| 数据生命周期 | 30 天保留 + 启动时裁剪 | ARCHITECTURE §3.6 | 30 天外数据自动清理 |
| 损坏恢复 | 检测 + 备份 + 重建 | ARCHITECTURE §3.7 | 损坏 JSON 可自动恢复 |
| 多工作区 | 每个 folder 独立 `.observatory/` | ARCHITECTURE §3.5 | multi-root workspace 正常工作 |

### 3.3 Workstream C：前端全量视图

| 任务 | 说明 | AI 上下文 | 完成标准 |
|------|------|----------|---------|
| 路由与布局 | 9 个页面统一导航体系 | FRONTEND_DESIGN §三 | Webview/Browser 一致 |
| 基础组件库 | common/ 下 EmptyState/ErrorState/Skeleton 等 | FRONTEND_DESIGN §七 §八 | 所有视图有空/错误/加载态 |
| 核心视图实现 | 拓扑、看板、矩阵、时间线、ER | FRONTEND_DESIGN §四 | 数据正确渲染、交互可用 |
| 全局状态与订阅 | 按 scope 增量刷新 | FRONTEND_DESIGN §五 | 无全量重载闪烁 |
| 可访问性 | 色盲友好 + 键盘导航 | FRONTEND_DESIGN §九 | 状态不依赖颜色作为唯一标识 |

### 3.4 Workstream D：质量与会话闭环

| 任务 | 说明 | AI 上下文 | 完成标准 |
|------|------|----------|---------|
| pytest 报告解析 | 读取 JSON report + 映射能力 | QUALITY_MONITOR §八 | 能力级统计正确 |
| 场景覆盖分析 | 期望场景与实际用例对比 | QUALITY_MONITOR §四 §五 | 缺失场景可识别 |
| 会话管理 | 列表、详情、检索、产物关联 | SCHEMA_SPEC §九 §十二 | 会话可追溯到代码和测试 |

### 3.5 Workstream E：可靠性与发布

| 任务 | 说明 | AI 上下文 | 完成标准 |
|------|------|----------|---------|
| 错误模型统一 | API/Webview/Store 错误码统一 | SCHEMA_SPEC §1.4 + ARCHITECTURE §十一 | 前端能分类提示并重试 |
| 降级策略 | WS 断连、插件缺失、解析失败降级 | ARCHITECTURE §11.2 | 功能可部分继续使用 |
| 打包发布 | `.vsix`、安装说明、版本号策略 | EXTENSION_DESIGN §九 | 可在 Cursor 稳定安装运行 |

---

## 四、最终验收标准（Definition of Done）

### 4.1 功能验收

- [ ] `observatory.initialize` 可生成完整 `.observatory/` 目录与初始数据
- [ ] 保存代码文件后，架构与能力相关数据自动增量更新
- [ ] 提交 Git 后，`progress.json` 自动追加记录并在前端可视化
- [ ] transcript 变化后，AI 会话列表与详情自动更新
- [ ] 运行测试后，质量面板（覆盖率/通过率/场景）自动刷新
- [ ] 所有页面在 Webview 与浏览器模式功能一致
- [ ] multi-root workspace 中各项目独立正常工作
- [ ] 无 ai-doc-index 的通用项目可自动发现能力并支持用户修正

### 4.2 契约验收

- [ ] 所有 JSON 文件符合 `docs/SCHEMA_SPEC.md` 结构定义
- [ ] API 与 Webview 消息类型与文档完全一致
- [ ] schema major 版本不一致时前端有明确提示
- [ ] 并发写入不会导致数据丢失或 JSON 损坏

### 4.3 性能与稳定性验收

- [ ] 首次全量扫描可完成且不中断编辑体验
- [ ] 增量扫描在常见项目规模下可稳定在秒级响应
- [ ] WebSocket 断连可自动恢复，恢复前有轮询降级
- [ ] 关键异常（文件缺失/JSON 损坏）可被捕获并自动重建
- [ ] 30 天数据保留策略正常执行

### 4.4 可访问性验收

- [ ] 所有状态不依赖颜色作为唯一信息传递手段
- [ ] 核心交互可通过键盘完成
- [ ] 空状态页面提供引导操作

---

## 五、统一时间计划（面向最终版）

```
2026-04
├── W1-W2: Workstream A + B（采集、扫描、存储、契约、生命周期）
├── W3:    Workstream C（前端全量页面、组件库、双模数据源）
└── W4:    Workstream D（质量与会话闭环）

2026-05
├── W1:    Workstream E（可靠性、降级、错误模型）
├── W2:    联调与回归（全链路）
└── W3:    发布打包与最终验收
```

---

## 六、技术风险与缓解

| 风险 | 影响 | 缓解策略 |
|------|------|---------|
| Cursor 与 VS Code API 差异 | 部分事件不可用 | 保留 file watcher/轮询兜底 |
| Transcript 格式变化 | 会话解析失败 | 版本检测 + 格式自适应 + 逐行容错（见 EXTENSION_DESIGN §3.3） |
| 大型项目扫描慢 | 初始化体验差 | 增量优先 + 后台全量 + 进度反馈 |
| 测试报告插件缺失 | 质量数据不全 | 启动时检测并给安装指引，退化为终端解析 |
| WebSocket 不稳定 | 实时性下降 | 自动重连 + 指数退避 + HTTP 轮询 |
| Cursor Webview 内存限制 | 大项目数据量大时 Webview 卡顿 | 数据分页加载 + 虚拟滚动 + 节点上限 |
| 拓扑图渲染性能 | 100+ 模块力导向图慢 | 节点上限 + 分层折叠 + 降级为列表视图 |
| Python AST 正则解析不准 | 依赖关系不完整 | 标记 confidence 级别，用户可在能力看板手动修正 |
| 多开 Cursor 实例端口冲突 | HTTP Server 3800 被占 | 端口自动递增探测（3800 → 3801 → ...） |
| 并发写入竞态 | JSON 数据丢失/损坏 | 文件粒度写入队列（见 SCHEMA_SPEC §1.6） |

---

## 七、开发约定

### 7.1 分支策略

```
main ← 稳定发布
  └── dev ← 最终版集成开发
       ├── feat/event-and-scan
       ├── feat/final-ui
       ├── feat/quality-session
       └── feat/reliability-release
```

### 7.2 提交规范

```
feat(extension): add transcript incremental parser
feat(frontend): implement progress timeline view
fix(schema): align progress.json with parser output
docs(architecture): unify api contracts and error model
```

### 7.3 测试策略

| 层级 | 范围 | 框架 |
|------|------|------|
| Scanner 单测 | 输入源码/SQL/日志 → 结构化输出 | vitest |
| Store 单测 | JSON 读写、并发更新、损坏恢复 | vitest |
| 前端组件测试 | 页面渲染、状态联动、错误态、空状态 | vitest + testing-library |
| Extension E2E | 命令触发到前端展示全链路 | VS Code Extension Test |
