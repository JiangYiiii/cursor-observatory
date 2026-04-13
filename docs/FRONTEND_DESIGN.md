# React 前端设计

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

### 相关文档

| 文档 | 关系 |
|------|------|
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | 前端消费的所有 JSON 数据结构定义 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 通信架构、数据源抽象、错误降级矩阵 |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | Webview Panel Provider、Message Bridge 实现 |
| [QUALITY_MONITOR_DESIGN.md](QUALITY_MONITOR_DESIGN.md) | 质量监控面板的深度设计 |

---

## 一、技术栈

| 选型 | 方案 | 理由 |
|------|------|------|
| 框架 | React 18 + TypeScript | 生态最大，VS Code Webview 官方示例使用 React |
| 构建 | Vite 6 | 快速构建，HMR 优秀，产物体积小 |
| 路由 | React Router v6 | SPA 路由，Webview 内 hash 模式 |
| 状态管理 | Zustand | 轻量，适合中等规模应用 |
| 样式 | Tailwind CSS 4 | 原子化 CSS，开发效率高 |
| 图表 | ECharts (via echarts-for-react) | 看板/趋势/热力图 |
| 拓扑图 | Cytoscape.js | 力导向图 / 分层布局 |
| ER 图 | Mermaid.js 或 D3 | 数据模型可视化 |
| 表格 | TanStack Table v8 | 高性能虚拟化表格 |
| 图标 | Lucide React | 一致性好，体积小 |
| 时间线 | 自定义组件 | 基于 Tailwind 实现 |

---

## 二、双模运行

前端需同时支持两种运行环境：

```typescript
// services/data-source.ts

interface IDataSource {
    getManifest(): Promise<Manifest>;
    getArchitecture(): Promise<Architecture>;
    getCapabilities(): Promise<Capability[]>;
    getProgress(): Promise<ProgressData>;
    getTestResults(): Promise<TestResults>;
    getTestHistory(): Promise<TestHistoryEntry[]>;
    getAiSessions(): Promise<AiSession[]>;
    getDataModels(): Promise<DataModels>;
    getDocsHealth(): Promise<DocsHealth>;
    getSessionList(): Promise<SessionIndex>;
    getSession(id: string): Promise<SessionDetail>;

    onUpdate(callback: (event: UpdateEvent) => void): Unsubscribe;

    // 操作
    triggerScan(): Promise<void>;
    triggerTests(capabilityId?: string): Promise<void>;
    updateCapability(id: string, updates: Partial<Capability>): Promise<void>;
}
```

### 2.1 Cursor Webview 模式

```typescript
// services/cursor-bridge.ts

class CursorBridgeDataSource implements IDataSource {
    private vscodeApi = acquireVsCodeApi();
    private pendingRequests = new Map<string, { resolve, reject }>();
    private listeners = new Set<(event: UpdateEvent) => void>();

    constructor() {
        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg.type === 'response') {
                const pending = this.pendingRequests.get(msg.requestId);
                if (pending) pending.resolve(msg.data);
            } else if (msg.type === 'refresh' || msg.type === 'agent-activity') {
                this.listeners.forEach(cb => cb(msg));
            }
        });
    }

    async getManifest(): Promise<Manifest> {
        return this.request('getManifest');
    }

    private request(method: string, params?: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const requestId = crypto.randomUUID();
            this.pendingRequests.set(requestId, { resolve, reject });
            this.vscodeApi.postMessage({ type: 'request', requestId, method, params });
        });
    }

    onUpdate(callback: (event: UpdateEvent) => void) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}
```

### 2.2 浏览器模式

```typescript
// services/http-client.ts

class HttpDataSource implements IDataSource {
    private baseUrl: string;
    private ws: WebSocket | null = null;

    constructor(baseUrl = 'http://localhost:3800') {
        this.baseUrl = baseUrl;
        this.connectWebSocket();
    }

    async getManifest(): Promise<Manifest> {
        const res = await fetch(`${this.baseUrl}/api/observatory/manifest`);
        return res.json();
    }

    private connectWebSocket() {
        const wsUrl = this.baseUrl.replace('http', 'ws') + '/ws/live';
        this.ws = new WebSocket(wsUrl);
        this.ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            this.listeners.forEach(cb => cb(data));
        };
    }

    onUpdate(callback: (event: UpdateEvent) => void) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
}
```

### 2.3 自动检测

```typescript
// services/data-source.ts

export function createDataSource(): IDataSource {
    if (typeof acquireVsCodeApi !== 'undefined') {
        return new CursorBridgeDataSource();
    }
    return new HttpDataSource();
}
```

---

## 三、页面结构

### 3.1 路由表

```typescript
// router.tsx

const routes = [
    { path: '/',              element: <Overview />,        icon: 'LayoutDashboard', label: '概览' },
    { path: '/architecture',  element: <Architecture />,    icon: 'Network', label: '架构' },
    { path: '/capabilities',  element: <Capabilities />,    icon: 'Kanban', label: '能力' },
    { path: '/data-models',   element: <DataModels />,      icon: 'Database', label: '数据模型' },
    { path: '/progress',      element: <Progress />,        icon: 'GitBranch', label: '进度' },
    { path: '/quality',       element: <QualityMonitor />,  icon: 'TestTube2', label: '质量' },
    { path: '/ai-sessions',   element: <AiSessions />,      icon: 'Bot', label: 'AI 日志' },
    { path: '/sessions',      element: <SessionManager />,  icon: 'FolderOpen', label: '会话' },
    { path: '/docs-health',   element: <DocsHealth />,      icon: 'FileCheck', label: '文档' },
];
```

### 3.2 Layout

```
┌──────────────────────────────────────────────────────────┐
│  🔭 Observatory    [stock-dashboard]    [⟳] [⚙]  [🌙]  │  ← TopBar
├────────┬─────────────────────────────────────────────────┤
│        │                                                 │
│ 📊概览 │              主内容区域                           │
│ 🏗架构  │                                                 │
│ 📦能力 │   根据左侧选中项渲染对应视图                       │
│ 💾数据  │                                                 │
│ 📈进度 │                                                 │
│ 🧪质量 │                                                 │
│ 🤖AI   │                                                 │
│ 📁会话 │                                                 │
│ 📄文档 │                                                 │
│        │                                                 │
├────────┤                                                 │
│ 🟢连接中│                                                 │
│ v0.1.1 │                                                 │
└────────┴─────────────────────────────────────────────────┘
```

---

## 四、核心视图设计

### 4.1 概览仪表盘（Overview）

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  ┌──────────┐ ┌────────────┐ ┌────────────┐ ┌───────────┐ │
│  │ AI 做了什么│ │ 做到哪一步   │ │ 结果是否可用 │ │ 数据新鲜度 │ │
│  │ 23 会话   │ │ 15 能力推进  │ │ 质量分 78   │ │ 2 分钟前   │ │
│  │ 本周 +5  │ │ 8✅ 4🔄 3❌ │ │ 14/14 通过  │ │ WS 已连接   │ │
│  └──────────┘ └────────────┘ └────────────┘ └───────────┘ │
│                                                         │
│  ┌─────────────────────────┐ ┌────────────────────────┐ │
│  │ 能力进度分布              │ │ 最近 AI 活动           │ │
│  │ ┌─────────────────┐     │ │                        │ │
│  │ │ planning    ██ 2 │     │ │ • 10:30 实现市场标签   │ │
│  │ │ developing ████ 4│     │ │ • 09:15 修复缓存BUG   │ │
│  │ │ testing     ██ 2 │     │ │ • 昨天 AI助手联调     │ │
│  │ │ released ██████ 7│     │ │                        │ │
│  │ └─────────────────┘     │ │                        │ │
│  └─────────────────────────┘ └────────────────────────┘ │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 待关注项                                          │   │
│  │ ⚠️ 8 个能力无测试覆盖                              │   │
│  │ ⚠️ scan_task, sync_task 缺少 business_doc_id 标注  │   │
│  │ ℹ️ 上次全量扫描: 2小时前                            │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 4.2 架构拓扑图（Architecture）

- **渲染引擎**：Cytoscape.js
- **布局**：dagre（分层有向图）或 cola（力导向）
- **交互**：
  - 节点：模块，大小按代码量，颜色按层级（presentation/business/data/infra）
  - 边：依赖关系，粗细按引用次数
  - 点击节点：侧边栏显示模块详情（文件列表、关联能力、最近变更）
  - 双击节点：在 Cursor 中打开该目录
  - 筛选：按层级、按能力 ID 高亮

### 4.3 能力看板（Capabilities）

- **布局**：Kanban 五列
- **卡片内容**：

```
┌──────────────────────────┐
│ PATTERN.SIMILARITY.SEARCH │
│ 形态相似度搜索             │
│                          │
│ 进度: ██████████░ 85%     │
│ 测试: 9/9 ✅ (5/7 场景)    │
│ 文档: ✅ 已对齐             │
│                          │
│ 📝 最近: 市场环境日标签     │
│ 🏷️ #high                 │
└──────────────────────────┘
```

- **交互**：
  - 拖拽卡片切换 phase（→ 写入 capabilities.json）
  - 点击卡片展开详情（验收标准列表、变更日志、关联代码/文档/测试）
  - 筛选：按 category（user_facing/infra/ai）、按测试状态

### 4.4 数据模型（DataModels）

- **渲染**：Mermaid.js `erDiagram`（[`buildErMermaid`](../webview-ui/src/lib/er-mermaid.ts)）
- **大库策略**：不按整库渲染全图；以当前选中表为**焦点**，在 `relationships` 上 BFS 取邻域（深度与最多表数可调），避免超过 Mermaid 默认 `maxTextSize` / `maxEdges`。可选**紧凑实体**（省略列，仅保留占位）以缩短定义。仪表盘内 `mermaid.initialize` 已提高 `maxTextSize` / `maxEdges` 作为缓冲。
- **交互**：选择库/schema、焦点表；邻域深度、最多表数、紧凑实体；右侧表详情（字段、索引、关系）

### 4.5 AI 会话日志（AiSessions）

- **布局**：时间线视图
- **每条记录**：

```
┌─ 2026-04-05 10:00 ──────────────────────────────────────┐
│ 🤖 实现市场环境日标签                         ✅ completed │
│                                                         │
│ 📁 文件变更:                                             │
│   + pattern_similarity/market_env.py (created, +120)     │
│   ~ stock_db/cli.py (modified, +15/-2)                  │
│                                                         │
│ 📄 文档更新:                                             │
│   ~ PATTERN_SIMILARITY_SEARCH_IMPLEMENTATION_PLAN.md     │
│                                                         │
│ 🧪 测试: 14 passed                                      │
│ 🔗 能力: PATTERN.SIMILARITY.SEARCH                       │
│ ⏱️ 耗时: 90 分钟                                        │
│                                                         │
│ [查看完整对话] [查看 Diff]                                │
└─────────────────────────────────────────────────────────┘
```

### 4.6 开发进度（Progress）

- **布局**：时间轴 + 提交统计
- **数据源**：`progress.json`
- **交互**：
  - 按能力 ID 过滤提交事件
  - 点击事件可跳转关联文件 diff
  - 与会话页联动展示 `session_id`

### 4.7 会话管理（SessionManager）

- **布局**：会话列表 + 详情抽屉
- **能力**：
  - 按状态/标签/时间过滤
  - 对话全文检索
  - 产物文件与能力 ID 双向跳转

### 4.8 文档健康（DocsHealth）

- **布局**：总分卡片 + 检查项明细表
- **数据源**：`docs-health.json`
- **交互**：
  - 点击问题项跳转到缺失模块或失效文档
  - 关联 `capabilities` 页面高亮相关能力

---

## 五、全局状态管理

```typescript
// store/observatory-store.ts (Zustand)

interface ObservatoryState {
    // 数据
    manifest: Manifest | null;
    architecture: Architecture | null;
    capabilities: Capability[];
    progress: ProgressData | null;
    testResults: TestResults | null;
    testHistory: TestHistoryEntry[];
    aiSessions: AiSession[];
    dataModels: DataModels | null;
    docsHealth: DocsHealth | null;

    // UI 状态
    isLoading: boolean;
    selectedCapability: string | null;
    sidebarCollapsed: boolean;
    connectionStatus: 'connected' | 'disconnected' | 'reconnecting';

    // Actions
    loadAll(): Promise<void>;
    refresh(scope?: string): Promise<void>;
    selectCapability(id: string | null): void;
    updateCapability(id: string, updates: Partial<Capability>): Promise<void>;
}

export const useObservatoryStore = create<ObservatoryState>((set, get) => ({
    manifest: null,
    architecture: null,
    capabilities: [],
    progress: null,
    testResults: null,
    testHistory: [],
    aiSessions: [],
    dataModels: null,
    docsHealth: null,
    // ... 初始状态

    async loadAll() {
        set({ isLoading: true });
        const ds = getDataSource();
        const [progress, manifest, architecture, capabilities, testResults, aiSessions, dataModels, docsHealth] = await Promise.all([
            ds.getProgress(),
            ds.getManifest(),
            ds.getArchitecture(),
            ds.getCapabilities(),
            ds.getTestResults(),
            ds.getAiSessions(),
            ds.getDataModels(),
            ds.getDocsHealth()
        ]);
        set({
            progress,
            manifest,
            architecture,
            capabilities,
            testResults,
            aiSessions,
            dataModels,
            docsHealth,
            isLoading: false
        });
    },

    async refresh(scope) {
        const ds = getDataSource();
        if (!scope || scope === 'progress') {
            const progress = await ds.getProgress();
            set({ progress });
        }
        if (!scope || scope === 'capabilities') {
            const caps = await ds.getCapabilities();
            set({ capabilities: caps });
        }
        if (!scope || scope === 'tests') {
            const tests = await ds.getTestResults();
            set({ testResults: tests });
        }
        // ...
    }
}));
```

---

## 六、主题与样式

### 6.1 支持亮色/暗色

前端检测 Cursor 主题（通过 `document.body.dataset.vscodeThemeKind`）或用户手动切换：

```typescript
// hooks/useTheme.ts
export function useTheme() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        // 在 Cursor Webview 中，读取 VS Code 主题
        const kind = document.body.dataset.vscodeThemeKind;
        if (kind === 'vscode-dark' || kind === 'vscode-high-contrast') return 'dark';
        // 在浏览器中，读取系统偏好
        if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
        return 'light';
    });
    return { theme, setTheme };
}
```

### 6.2 配色方案

| 语义 | 亮色 | 暗色 |
|------|------|------|
| 背景 | `#ffffff` | `#1e1e2e` |
| 卡片 | `#f8f9fa` | `#2a2a3c` |
| 主色 | `#3b82f6` (blue-500) | `#60a5fa` (blue-400) |
| 成功 | `#22c55e` (green-500) | `#4ade80` (green-400) |
| 警告 | `#f59e0b` (amber-500) | `#fbbf24` (amber-400) |
| 错误 | `#ef4444` (red-500) | `#f87171` (red-400) |
| 文字 | `#1f2937` (gray-800) | `#e5e7eb` (gray-200) |

---

## 七、组件目录规划

### 7.1 组件总览

```
webview-ui/src/components/
├── common/                    # 通用基础组件
│   ├── Badge.tsx              # 状态徽章（phase/test status）
│   ├── Card.tsx               # 卡片容器
│   ├── StatusDot.tsx          # 状态圆点（含色盲友好文字标签）
│   ├── Tooltip.tsx            # 提示浮层
│   ├── EmptyState.tsx         # 空状态引导（图标+文案+操作按钮）
│   ├── ErrorState.tsx         # 错误状态（重试/忽略按钮）
│   ├── LoadingSkeleton.tsx    # 骨架屏加载态
│   ├── ConnectionStatus.tsx   # WebSocket 连接状态指示器
│   ├── FreshnessBadge.tsx     # 数据新鲜度标签（x 分钟前）
│   └── ConfirmDialog.tsx      # 确认对话框
│
├── graph/                     # 拓扑图组件
│   ├── TopologyGraph.tsx      # Cytoscape 架构拓扑图（主组件）
│   ├── GraphControls.tsx      # 布局切换/缩放/筛选控制栏
│   ├── NodeDetail.tsx         # 节点详情侧边栏
│   └── graph-styles.ts        # Cytoscape 样式配置
│
├── kanban/                    # 看板组件
│   ├── KanbanBoard.tsx        # 五列看板容器
│   ├── KanbanColumn.tsx       # 单列（含拖拽目标区）
│   ├── CapabilityCard.tsx     # 能力卡片（进度/测试/文档徽章）
│   └── CapabilityDetail.tsx   # 能力详情抽屉（验收标准/变更日志/关联）
│
├── chart/                     # 图表组件
│   ├── PhaseDistribution.tsx  # 能力阶段分布柱状图
│   ├── TestTrend.tsx          # 测试趋势折线图（用例数/通过率）
│   ├── CoverageGauge.tsx      # 覆盖率仪表盘
│   └── HeatmapCalendar.tsx    # 活跃度日历热力图
│
├── timeline/                  # 时间线组件
│   ├── ActivityTimeline.tsx   # 通用时间线容器
│   ├── CommitEvent.tsx        # Git 提交事件卡片
│   └── SessionEvent.tsx       # AI 会话事件卡片
│
├── table/                     # 数据表格组件
│   ├── DataTable.tsx          # TanStack Table 封装（排序/筛选/虚拟滚动）
│   ├── TestMatrix.tsx         # 能力级测试矩阵表
│   └── DocsCheckTable.tsx     # 文档健康度检查明细表
│
├── session/                   # 会话组件
│   ├── SessionList.tsx        # 会话列表（筛选/搜索）
│   ├── SessionDetail.tsx      # 会话详情（消息时间线）
│   └── SessionArtifacts.tsx   # 会话产物文件列表
│
└── er/                        # ER 图组件
    ├── ERDiagram.tsx          # Mermaid/D3 ER 图渲染
    └── TableDetail.tsx        # 表详情（字段/索引/关联能力）
```

### 7.2 组件分层原则

| 层级 | 目录 | 职责 | 示例 |
|------|------|------|------|
| **基础层** | `common/` | 无业务语义的 UI 原子 | Badge, Card, EmptyState |
| **领域层** | `graph/`, `kanban/`, `chart/` 等 | 与 Observatory 业务数据绑定的复合组件 | TopologyGraph, CapabilityCard |
| **视图层** | `views/` | 页面级组合，编排领域组件 | Overview.tsx, QualityMonitor.tsx |

---

## 八、空状态 / 错误状态 / 加载状态

### 8.1 空状态设计

每个视图在数据为空时，显示引导性空状态而非空白页：

| 视图 | 空状态文案 | 引导操作 |
|------|---------|---------|
| 概览 | "尚未扫描项目，开始初始化以生成数据" | [初始化项目] 按钮 |
| 架构 | "未检测到模块结构" | [运行全量扫描] |
| 能力 | "尚未发现能力，扫描后自动生成或手动添加" | [运行扫描] / [手动添加] |
| 质量 | "未找到测试结果，请先运行测试" | [运行测试] + pytest 配置指引链接 |
| AI 日志 | "未检测到 AI 会话记录" | 说明 Transcript 目录位置 |
| 数据模型 | "未找到 SQL/DDL 文件" | 说明支持的文件路径 |

```typescript
// components/common/EmptyState.tsx
interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description: string;
    action?: { label: string; onClick: () => void };
}
```

### 8.2 错误状态设计

```
┌──────────────────────────────────┐
│         ⚠️ 数据加载失败           │
│                                  │
│  architecture.json 解析异常       │
│  Extension 正在尝试重建数据...     │
│                                  │
│  [重试]  [查看详情]  [忽略]       │
└──────────────────────────────────┘
```

错误状态根据类型区分展示：

| 错误类型 | UI 表现 | 操作 |
|---------|--------|------|
| 数据文件损坏 | 告警横幅 + "正在重建" | 自动恢复，可手动重试 |
| API 请求失败 | 区域内错误提示 | [重试] 按钮 |
| WebSocket 断连 | 顶栏状态变灰 + "已断开，轮询中" | 自动重连，显示倒计时 |
| Schema 版本不兼容 | 全局遮罩提示 | "请升级 Extension" |

### 8.3 加载状态设计

- **首次加载**：骨架屏（Skeleton），模拟最终布局形态
- **增量刷新**：不显示加载态，数据到达后直接更新（避免闪烁）
- **全量扫描**：顶栏进度条 + 扫描阶段文字（"正在扫描 Python 模块..." → "正在分析依赖..."）
- **测试运行**：质量面板内进度条 + 实时输出流

---

## 九、可访问性设计

### 9.1 色盲友好

所有使用颜色编码的状态**同时使用图标和文字标签**：

| 状态 | 颜色 | 图标 | 文字 |
|------|------|------|------|
| 缺失 | red | ○ (空心圆) | "缺失" |
| 失败 | orange | ✕ (叉号) | "失败" |
| 不足 | amber | △ (三角) | "不足" |
| 良好 | green | ✓ (勾号) | "良好" |
| 优秀 | purple | ★ (星号) | "优秀" |

不依赖颜色作为唯一信息传递手段。图表中使用不同线型（实线/虚线/点线）辅助区分。

### 9.2 键盘导航

- 所有交互元素可通过 Tab 键聚焦
- 侧栏导航支持上下方向键切换
- 看板卡片支持 Enter 展开详情、Escape 关闭
- 拓扑图支持方向键平移、+/- 缩放

### 9.3 屏幕阅读器

- 所有图标按钮提供 `aria-label`
- 图表提供 `aria-describedby` 指向文字摘要
- 动态更新区域使用 `aria-live="polite"`

---

## 十、响应式设计

| 断点 | 布局 |
|------|------|
| < 768px（Webview 窄面板） | 侧栏折叠为图标，内容全宽 |
| 768px - 1200px | 侧栏 + 单栏内容 |
| > 1200px（浏览器全屏） | 侧栏 + 多列 Grid 内容 |
