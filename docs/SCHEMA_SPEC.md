# 数据契约规格 — `.observatory/` JSON Schema

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

本文定义 `.observatory/` 目录下所有 JSON 文件的结构规格，是前端与 Extension 之间的**核心公约**。

### 相关文档

| 文档 | 关系 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 数据生命周期管理、损坏恢复策略（本文定义的数据"长什么样"，ARCHITECTURE 定义"怎么管"） |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | Scanner/Store 层如何生成和维护本文定义的 JSON |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | 前端如何消费本文定义的 JSON |
| [QUALITY_MONITOR_DESIGN.md](QUALITY_MONITOR_DESIGN.md) | 测试相关 JSON 的深度设计（test-results / test-mapping / test-expectations） |

---

## 一、通用约定

### 1.1 Schema 版本

每个 JSON 文件顶层包含 `schema_version` 字段，遵循 SemVer：

```json
{
  "schema_version": "1.0.0",
  ...
}
```

前端在读取时校验 major 版本号，major 不兼容则提示升级 Extension。

### 1.2 时间格式

所有时间字段使用 **ISO 8601** 格式：`"2026-04-05T14:30:00Z"`

### 1.3 文件编码

所有文件使用 **UTF-8** 编码，无 BOM。

### 1.4 通用错误对象

Extension API、Webview Bridge、Store 层统一使用以下错误对象，便于前端统一提示：

```json
{
  "code": "SCHEMA_VALIDATION_FAILED",
  "message": "capabilities.json does not match schema",
  "detail": {
    "file": "capabilities.json",
    "field": "capabilities[2].phase",
    "expected": ["planning", "designing", "developing", "testing", "released", "deprecated"]
  },
  "retryable": false
}
```

### 1.5 Schema 演进与迁移

当 schema 需要变更时，遵循以下策略：

| 变更类型 | 版本影响 | 迁移方式 |
|---------|---------|---------|
| 新增可选字段 | patch +1（如 1.0.0 → 1.0.1） | 无需迁移，旧数据兼容 |
| 新增必填字段（有默认值） | minor +1（如 1.0.0 → 1.1.0） | Extension 启动时自动补填默认值 |
| 字段重命名/删除/类型变更 | major +1（如 1.0.0 → 2.0.0） | Extension 启动时执行 migration 函数 |

迁移实现：

```typescript
// observatory/migrations.ts

const MIGRATIONS: Record<string, (data: any) => any> = {
    'capabilities:1→2': (data) => {
        // 将旧版 progress_pct 重命名为 progress
        for (const cap of data.capabilities) {
            cap.progress = cap.progress_pct ?? 0;
            delete cap.progress_pct;
        }
        data.schema_version = '2.0.0';
        return data;
    },
};

async function migrateIfNeeded(filename: string, data: any, targetVersion: string): Promise<any> {
    const currentMajor = parseInt(data.schema_version?.split('.')[0] ?? '0');
    const targetMajor = parseInt(targetVersion.split('.')[0]);

    if (currentMajor === targetMajor) return data;
    if (currentMajor > targetMajor) throw new Error('Data version newer than Extension');

    const key = `${filename.replace('.json', '')}:${currentMajor}→${targetMajor}`;
    const migrator = MIGRATIONS[key];
    if (!migrator) {
        // 无迁移函数 → 触发重建（见 ARCHITECTURE.md 3.7）
        return null;
    }
    return migrator(data);
}
```

前端校验策略：读取 `schema_version` 的 major 版本，若与前端期望的 major 不一致，则显示"请升级 Extension"提示。

### 1.6 并发写入安全

多个 Watcher 可能同时触发对同一个 JSON 文件的写入。`ObservatoryStore` 通过**写入队列**保证串行化：

```typescript
// observatory/store.ts — 写入队列

class ObservatoryStore {
    private writeQueue = new Map<string, Promise<void>>();

    private async serializedWrite(filename: string, writer: () => Promise<void>): Promise<void> {
        const prev = this.writeQueue.get(filename) ?? Promise.resolve();
        const next = prev.then(writer, writer);  // 前一个无论成功失败都继续
        this.writeQueue.set(filename, next);
        await next;
    }

    async updateCapability(id: string, updates: Partial<CapabilityInfo>): Promise<void> {
        await this.serializedWrite('capabilities.json', async () => {
            const caps = await this.readJson<Capabilities>('capabilities.json');
            const idx = caps.capabilities.findIndex(c => c.id === id);
            if (idx >= 0) {
                caps.capabilities[idx] = { ...caps.capabilities[idx], ...updates };
            }
            await this.writeJson('capabilities.json', caps);
        });
    }
}
```

所有写入操作按文件粒度排队，同一文件的写入严格串行。不同文件之间可以并行。

### 1.7 数据保留策略

以下文件有时间维度的数据积累，需要定期清理（详见 [ARCHITECTURE.md 3.6](ARCHITECTURE.md#36-数据生命周期管理)）：

| 文件 | 保留范围 | 裁剪字段 |
|------|---------|---------|
| `progress.json` | `timeline[]` 保留近 30 天 | 按 `timeline[].timestamp` 过滤 |
| `ai-sessions.json` | `sessions[]` 保留近 30 天 | 按 `sessions[].started_at` 过滤 |
| `test-history.jsonl` | 每行保留近 30 天 | 按行中 `timestamp` 过滤 |
| `sessions/` 子目录 | 保留近 30 天 | 按 `meta.json` 中 `created_at` 判断 |

裁剪由 Extension 在启动时自动执行，不影响运行时性能。

---

## 二、manifest.json — 项目元信息

```json
{
  "schema_version": "1.0.0",
  "project": {
    "name": "stock-dashboard",
    "type": "python-streamlit",
    "language": "python",
    "frameworks": ["streamlit", "fastapi"],
    "repo_url": "https://github.com/...",
    "description": "股票分析仪表板",
    "root_path": "/Users/jiangyi/Documents/codedev/stock-dashboard"
  },
  "observatory": {
    "initialized_at": "2026-04-05T10:00:00Z",
    "last_full_scan": "2026-04-05T14:30:00Z",
    "extension_version": "0.1.0",
    "scanners_used": ["python", "sql", "git", "doc", "ai-doc-index"]
  },
  "metadata_sources": {
    "ai_doc_index": "docs/00-meta/ai-doc-index.json",
    "capability_catalog": "docs/business/CAPABILITY_CATALOG.md",
    "feature_code_map": "docs/00-meta/PROJECT_FEATURES_AND_CODE_MAP.md"
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `project.name` | string | ✅ | 项目名（取自目录名或 package.json/pyproject.toml） |
| `project.type` | string | ✅ | 项目类型标签（`python-streamlit`, `node-react`, `java-spring` 等） |
| `project.language` | string | ✅ | 主语言 |
| `project.frameworks` | string[] | ❌ | 使用的框架 |
| `metadata_sources` | object | ❌ | 项目已有元数据文件的相对路径 |

---

## 三、architecture.json — 模块拓扑

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "modules": [
    {
      "id": "pattern_similarity",
      "name": "pattern_similarity",
      "path": "pattern_similarity/",
      "type": "package",
      "description": "形态相似度搜索核心引擎",
      "language": "python",
      "files": [
        { "path": "search.py", "lines": 245, "functions": 8 },
        { "path": "scoring.py", "lines": 180, "functions": 5 },
        { "path": "models.py", "lines": 92, "functions": 0 },
        { "path": "cache.py", "lines": 67, "functions": 3 }
      ],
      "imports_from": ["stock_db", "shared"],
      "imported_by": ["views", "value_task"],
      "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
      "stats": {
        "total_lines": 584,
        "total_functions": 16,
        "total_classes": 3
      }
    }
  ],
  "edges": [
    {
      "from": "views",
      "to": "pattern_similarity",
      "type": "import",
      "weight": 5
    },
    {
      "from": "pattern_similarity",
      "to": "stock_db",
      "type": "import",
      "weight": 3
    }
  ],
  "layers": [
    { "name": "presentation", "modules": ["views", "shared"] },
    { "name": "business", "modules": ["pattern_similarity", "value_task", "scan_task", "ai"] },
    { "name": "data", "modules": ["stock_db", "data_fetcher"] },
    { "name": "infrastructure", "modules": ["scheduler", "pipeline", "sync_task"] }
  ]
}
```

### 字段说明

**modules[]**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 模块唯一标识（目录名） |
| `path` | string | 相对项目根目录的路径 |
| `type` | `"package"` \| `"module"` \| `"script"` | 模块类型 |
| `imports_from` | string[] | 依赖的模块 ID 列表 |
| `imported_by` | string[] | 被哪些模块依赖 |
| `capability_ids` | string[] | 关联的能力 ID |

**edges[]**

| 字段 | 类型 | 说明 |
|------|------|------|
| `from` | string | 源模块 ID |
| `to` | string | 目标模块 ID |
| `type` | `"import"` \| `"call"` \| `"data"` | 依赖类型 |
| `weight` | number | 依赖强度（引用次数） |

**layers[]**：分层建议，供拓扑图渲染分层布局。

---

## 四、capabilities.json — 能力注册表

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "capabilities": [
    {
      "id": "PATTERN.SIMILARITY.SEARCH",
      "title": "形态相似度搜索",
      "category": "user_facing",
      "phase": "developing",
      "progress": 85,
      "priority": "high",
      "owner": "ai-agent",
      "description": "基于控制点+文本规则的形态搜索引擎，支持模板管理、粗召回、后验试算",

      "requirements": {
        "source_doc": "docs/requirements/PATTERN_CONFIG_MODULE_PRD.md",
        "acceptance_criteria": [
          { "id": "AC-1", "text": "支持 5/6/8 控制点模板", "status": "passed" },
          { "id": "AC-2", "text": "搜索结果短时缓存", "status": "in_progress" },
          { "id": "AC-3", "text": "后验试算（样本不足弱化提示）", "status": "passed" },
          { "id": "AC-4", "text": "市场环境日标签", "status": "passed" },
          { "id": "AC-5", "text": "PRESET 种子模板", "status": "passed" }
        ]
      },

      "code_entry_points": [
        "pattern_similarity/search.py",
        "pattern_similarity/scoring.py",
        "views/pattern_similarity.py"
      ],
      "primary_doc": "docs/technical/PATTERN_SIMILARITY_SEARCH_IMPLEMENTATION_PLAN.md",
      "related_docs": [
        "docs/process/PATTERN_SIMILARITY_DELIVERY_TRACKER.md"
      ],
      "test_files": ["tests/test_pattern_similarity.py"],

      "test_summary": {
        "total": 9,
        "passed": 9,
        "failed": 0,
        "coverage_scenarios": 5,
        "expected_scenarios": 7,
        "status": "good"
      },

      "confidence": "high",
      "user_confirmed": true,
      "source_module": "pattern_similarity",

      "dependencies": ["DATA.OHLCV.SYNC", "PATTERN.ENGINE"],
      "dependents": ["VALUE.SCREENER.CORE"],

      "changelog": [
        { "date": "2026-04-05", "action": "市场环境日标签 CLI 完成", "session_id": "ses_20260405_001" },
        { "date": "2026-04-03", "action": "后验评分模块上线", "session_id": "ses_20260403_002" }
      ],

      "last_updated": "2026-04-05T14:30:00Z"
    }
  ]
}
```

### 能力来源与确认

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `confidence` | `"auto"` \| `"confirmed"` \| `"high"` | ❌ | 能力数据的置信度。`auto` = 自动发现（未确认），`confirmed` = 用户已确认，`high` = 来自 ai-doc-index 映射。默认 `"high"` |
| `user_confirmed` | boolean | ❌ | 用户是否已确认此能力（仅自动发现的能力需要）。默认 `true` |
| `source_module` | string | ❌ | 自动发现时的来源模块 ID。有 ai-doc-index 的项目无此字段 |

### phase 状态机

```
planning → designing → developing → testing → completed → released
                                       ↑          │            │
                                       └──────────┴────────────┘  (扩展可自动推断；Git 提交可标 released)
```

| phase | 含义 |
|-------|------|
| `planning` | 需求规划中，尚未开始设计 |
| `designing` | 技术方案设计中 |
| `developing` | 编码开发中 |
| `testing` | 开发完成，测试验证中 |
| `completed` | 开发与测试均完成，但尚未通过 Git 提交标记发布（可由 pytest `by_capability` 全通过自动推断） |
| `released` | 已发布上线（建议在提交说明中写 `Observatory: <capability_id>` 标记） |
| `deprecated` | 已废弃 |

### SDD 集成字段（`sdd` / `bugfix`）

当工作区存在 `specs/<feature>/` 下的 SDD 产物时，扩展会为对应能力写入 `sdd` 与可选的 `bugfix` 字段，详见 [SDD_INTEGRATION_DESIGN.md](SDD_INTEGRATION_DESIGN.md)。

| 字段 | 说明 |
|------|------|
| `sdd.enabled` | 为 `true` 表示该能力由 SDD 文档驱动；看板**禁止**手动拖拽改阶段，转录推断**不**上调其 `phase`。 |
| `sdd.workspacePath` | 相对仓库根的 SDD 目录，如 `specs/my-feature`。 |
| `sdd.activeFeature` | 是否与 `specs/.active` 中当前活跃 feature 一致。 |
| `sdd.documents` | 各产物文件是否存在（spec / sketch / plan / tasks / data-model / contracts / research）。 |
| `sdd.taskStats` | 解析 `tasks.md` checkbox 得到的总数与已完成数。 |
| `bugfix.activeBugs` | `bugfix-log.md` 中未关闭条目数；大于 0 时 pytest **不会**将该能力从 `testing` 标为 `completed`。 |
| `bugfix.resolvedBugs` | 已关闭 Bug 条目数。 |
| `bugfix.rootCauses` | 未关闭 Bug 的根因枚举（`SPEC_GAP` 等）。 |

稳定 ID：每个 feature 目录下可有 `.capability-id`（单行），作为 `Capability.id` 的唯一来源；Git 发布标记 `Observatory: <id>` 应使用该 ID。

### manifest.json observatory 扩展

全量扫描后可在 `observatory` 中写入：

| 字段 | 说明 |
|------|------|
| `sdd_detected` | 是否至少导入一条 SDD 能力。 |
| `sdd_feature_count` | SDD 能力条数。 |
| `sdd_status` | `full` \| `partial` \| `none`（与 `specs/`、规则、插件缓存的探测结果一致）。 |

### test_summary.status 计算规则

| 条件 | status |
|------|--------|
| `total == 0` | `"missing"` |
| `expected_scenarios == 0` 且 `total > 0` | `"good"`（无场景基线时按通过率评估） |
| `failed > 0` | `"failing"` |
| `coverage_scenarios / expected_scenarios < 0.5` | `"insufficient"` |
| `coverage_scenarios / expected_scenarios >= 0.5` 且全部 passed | `"good"` |
| `coverage_scenarios == expected_scenarios` 且全部 passed | `"excellent"` |

---

## 五、progress.json — 进度追踪

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "summary": {
    "total_commits": 128,
    "active_branch": "main",
    "recent_days": 14
  },
  "timeline": [
    {
      "id": "prog_20260405_112500_abc123d",
      "timestamp": "2026-04-05T11:25:00Z",
      "type": "commit",
      "title": "feat: add market environment daily tags",
      "author": "jiangyi",
      "commit": {
        "hash": "abc123d",
        "branch": "main"
      },
      "stats": {
        "files_changed": 2,
        "insertions": 135,
        "deletions": 2
      },
      "files": [
        { "path": "pattern_similarity/market_env.py", "status": "added" },
        { "path": "stock_db/cli.py", "status": "modified" }
      ],
      "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
      "session_id": "ses_20260405_001"
    }
  ]
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `summary.total_commits` | number | 当前仓库总提交数 |
| `summary.active_branch` | string | 当前分支 |
| `timeline[]` | array | 按时间倒序的进度事件（commit 为主） |
| `timeline[].capability_ids` | string[] | 事件关联能力 |
| `timeline[].session_id` | string \| null | 关联 AI 会话 ID |

---

## 六、test-results.json — 测试结果

```json
{
  "schema_version": "1.0.0",
  "last_run": "2026-04-05T14:30:00Z",
  "runner": "pytest",
  "summary": {
    "total": 14,
    "passed": 14,
    "failed": 0,
    "skipped": 0,
    "errors": 0,
    "duration_ms": 1250
  },
  "test_cases": [
    {
      "id": "tests/test_pattern_similarity.py::TestPatternSimilarity::test_pattern_hash_stable",
      "file": "tests/test_pattern_similarity.py",
      "class": "TestPatternSimilarity",
      "name": "test_pattern_hash_stable",
      "status": "passed",
      "duration_ms": 12,
      "capability_id": "PATTERN.SIMILARITY.SEARCH",
      "scenario": "模板编码与哈希一致性",
      "error_message": null
    }
  ],
  "by_capability": {
    "PATTERN.SIMILARITY.SEARCH": { "total": 9, "passed": 9, "failed": 0 },
    "AUTH.APP.USER": { "total": 2, "passed": 2, "failed": 0 },
    "AI.AGENT.CORE": { "total": 2, "passed": 2, "failed": 0 },
    "UI.APP.CHARTS": { "total": 1, "passed": 1, "failed": 0 }
  }
}
```

---

## 七、test-mapping.json — 测试↔能力映射

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "generation_method": "auto_import_analysis + pytest_markers",
  "mappings": [
    {
      "test_file": "tests/test_pattern_similarity.py",
      "capability_id": "PATTERN.SIMILARITY.SEARCH",
      "confidence": "high",
      "method": "pytest_marker",
      "scenarios": {
        "模板编码与哈希一致性": ["test_pattern_hash_stable"],
        "形态相似度评分": [
          "test_shape_self_high",
          "test_shape_different_low",
          "test_score_window_weights_override_base_shape_only"
        ],
        "端到端搜索流程": ["test_end_to_end_search"],
        "回看窗口与切片": [
          "test_effective_lookback_at_least_window",
          "test_slice_symbol_df_for_search_tail",
          "test_lookback_limits_match_range"
        ],
        "评分窗口计算": ["test_score_window_runs"]
      }
    }
  ]
}
```

---

## 八、test-expectations.json — 期望测试场景

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "expectations": {
    "PATTERN.SIMILARITY.SEARCH": {
      "scenarios": [
        { "name": "模板编码与哈希一致性", "priority": "high", "covered": true },
        { "name": "形态相似度评分（自相似/差异/权重覆盖）", "priority": "high", "covered": true },
        { "name": "端到端搜索流程", "priority": "critical", "covered": true },
        { "name": "回看窗口与切片逻辑", "priority": "medium", "covered": true },
        { "name": "评分窗口计算", "priority": "medium", "covered": true },
        { "name": "粗召回加速路径", "priority": "high", "covered": false },
        { "name": "结果缓存命中与失效", "priority": "high", "covered": false }
      ],
      "analysis_method": "ai_code_analysis",
      "last_analyzed": "2026-04-05"
    }
  }
}
```

---

## 九、ai-sessions.json — AI 会话日志

```json
{
  "schema_version": "1.0.0",
  "sessions": [
    {
      "id": "ses_20260405_001",
      "title": "实现市场环境日标签",
      "type": "development",
      "status": "completed",
      "started_at": "2026-04-05T10:00:00Z",
      "ended_at": "2026-04-05T11:30:00Z",
      "duration_minutes": 90,

      "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
      "tags": ["市场环境", "CLI"],

      "files_modified": [
        { "path": "pattern_similarity/market_env.py", "action": "created", "lines_added": 120, "lines_removed": 0 },
        { "path": "stock_db/cli.py", "action": "modified", "lines_added": 15, "lines_removed": 2 }
      ],
      "docs_updated": [
        "docs/technical/PATTERN_SIMILARITY_SEARCH_IMPLEMENTATION_PLAN.md"
      ],

      "tests_run": {
        "total": 14,
        "passed": 14,
        "failed": 0
      },

      "commits": [
        { "hash": "abc123d", "message": "feat: add market environment daily tags", "timestamp": "2026-04-05T11:25:00Z" }
      ],

      "summary": "新增市场环境日标签模块，通过 CLI 可手动/调度执行，标签存入 MySQL",

      "transcript_file": "agent-transcripts/xxxx.jsonl"
    }
  ]
}
```

---

## 十、data-models.json — 数据结构

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "source_files": ["sql/pattern_similarity_tables.sql", "sql/ai_assistant_tables.sql"],
  "tables": [
    {
      "name": "pattern_search_history",
      "schema": "public",
      "description": "形态搜索历史记录",
      "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
      "columns": [
        { "name": "id", "type": "BIGINT", "nullable": false, "primary_key": true, "auto_increment": true },
        { "name": "user_id", "type": "INT", "nullable": false, "default": "0" },
        { "name": "pattern_hash", "type": "VARCHAR(64)", "nullable": false },
        { "name": "window_size", "type": "INT", "nullable": false },
        { "name": "created_at", "type": "DATETIME", "nullable": false, "default": "CURRENT_TIMESTAMP" }
      ],
      "indexes": [
        { "name": "idx_user_created", "columns": ["user_id", "created_at"], "unique": false }
      ],
      "foreign_keys": []
    }
  ],
  "relationships": [
    {
      "from_table": "pattern_search_history",
      "from_column": "user_id",
      "to_table": "app_user",
      "to_column": "id",
      "type": "many_to_one"
    }
  ]
}
```

---

## 十一、docs-health.json — 文档健康度

```json
{
  "schema_version": "1.0.0",
  "generated_at": "2026-04-05T14:30:00Z",
  "overall_score": 78,
  "checks": [
    {
      "check": "business_doc_id_coverage",
      "description": "代码中 business_doc_id 标注覆盖率",
      "score": 85,
      "details": {
        "total_modules": 12,
        "annotated_modules": 10,
        "missing": ["scan_task", "sync_task"]
      }
    },
    {
      "check": "doc_index_consistency",
      "description": "ai-doc-index.json 与代码标注一致性",
      "score": 92,
      "details": {
        "total_entries": 25,
        "consistent": 23,
        "orphan_entries": ["UI.APP.QUOTES"],
        "missing_entries": []
      }
    },
    {
      "check": "primary_doc_validity",
      "description": "primary_doc 路径有效性",
      "score": 100,
      "details": {
        "total_paths": 20,
        "valid": 20,
        "broken": []
      }
    },
    {
      "check": "capability_test_coverage",
      "description": "能力级测试覆盖",
      "score": 35,
      "details": {
        "total_capabilities": 15,
        "with_tests": 4,
        "without_tests": 11
      }
    }
  ]
}
```

---

## 十二、sessions/index.json — 会话索引

```json
{
  "schema_version": "1.0.0",
  "sessions": [
    {
      "id": "ses_20260405_001",
      "title": "实现市场环境日标签",
      "type": "development",
      "status": "completed",
      "project": "stock-dashboard",
      "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
      "created_at": "2026-04-05T10:00:00Z",
      "updated_at": "2026-04-05T11:30:00Z",
      "tags": ["市场环境", "CLI"],
      "artifact_count": 2,
      "message_count": 24
    }
  ]
}
```

---

## 十二-B、sessions/ses_XXX/meta.json — 会话详情

每个会话目录 `sessions/ses_XXX/` 下包含一个 `meta.json`，记录完整会话元数据与 transcript 摘要：

```json
{
  "schema_version": "1.0.0",
  "id": "ses_20260405_001",
  "title": "实现市场环境日标签",
  "type": "development",
  "status": "completed",
  "project": "stock-dashboard",
  "capability_ids": ["PATTERN.SIMILARITY.SEARCH"],
  "created_at": "2026-04-05T10:00:00Z",
  "updated_at": "2026-04-05T11:30:00Z",
  "tags": ["市场环境", "CLI"],

  "transcript_source": "~/.cursor/projects/.../agent-transcripts/xxxx.jsonl",
  "message_count": 24,
  "tool_calls_count": 18,
  "files_touched": [
    "pattern_similarity/market_env.py",
    "stock_db/cli.py",
    "tests/test_market_env.py"
  ],

  "artifacts": [
    {
      "type": "file_created",
      "path": "pattern_similarity/market_env.py",
      "timestamp": "2026-04-05T10:15:00Z"
    },
    {
      "type": "file_modified",
      "path": "stock_db/cli.py",
      "timestamp": "2026-04-05T10:45:00Z"
    }
  ],

  "summary": "AI 助手完成了市场环境日标签功能的开发，包括新模块创建、CLI 集成和测试编写。"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | ✅ | 与 index.json 中的会话 ID 一致 |
| `transcript_source` | string | ❌ | 原始 agent-transcript 文件路径 |
| `message_count` | number | ✅ | 对话消息总数 |
| `tool_calls_count` | number | ❌ | 工具调用次数 |
| `files_touched` | string[] | ✅ | 会话中涉及的文件路径列表 |
| `artifacts` | Artifact[] | ❌ | 会话产出的具体工件列表 |
| `summary` | string | ❌ | 会话内容摘要（可由 AI 自动生成） |

保留策略：跟随 `sessions/` 目录整体执行 30 天裁剪。

---

## 十三、test-history.jsonl — 测试历史（追加写）

每行一条 JSON，记录一次测试运行的汇总。每行包含 `v` 字段标识行格式版本：

```jsonl
{"v":1,"timestamp":"2026-04-03T10:00:00Z","total":10,"passed":10,"failed":0,"skipped":0,"duration_ms":980,"by_capability":{"PATTERN.SIMILARITY.SEARCH":{"total":7,"passed":7},"AUTH.APP.USER":{"total":2,"passed":2},"AI.AGENT.CORE":{"total":1,"passed":1}}}
{"v":1,"timestamp":"2026-04-05T14:30:00Z","total":14,"passed":14,"failed":0,"skipped":0,"duration_ms":1250,"by_capability":{"PATTERN.SIMILARITY.SEARCH":{"total":9,"passed":9},"AUTH.APP.USER":{"total":2,"passed":2},"AI.AGENT.CORE":{"total":2,"passed":2},"UI.APP.CHARTS":{"total":1,"passed":1}}}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `v` | number | 行格式版本号，当前为 `1` |
| `timestamp` | string (ISO 8601) | 测试运行时间 |
| `total` / `passed` / `failed` / `skipped` | number | 用例计数 |
| `duration_ms` | number | 总耗时 |
| `by_capability` | object | 按能力 ID 分组的统计 |

此文件是 JSONL 格式（非标准 JSON），不设顶层 `schema_version`。前端逐行解析，遇到无法解析的行跳过。`v` 字段用于未来格式升级时的兼容性判断。

保留策略：仅保留近 **30 天**的记录，Extension 启动时自动裁剪。
