# 质量监控面板设计

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

### 相关文档

| 文档 | 关系 |
|------|------|
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | test-results / test-mapping / test-expectations / test-history 的数据契约 |
| [EXTENSION_DESIGN.md](EXTENSION_DESIGN.md) | 测试报告解析和 Terminal Watcher 实现 |
| [FRONTEND_DESIGN.md](FRONTEND_DESIGN.md) | 质量面板的组件结构与交互设计 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 数据生命周期（test-history.jsonl 30 天保留） |

---

## 一、设计目标

让每一个业务能力的测试状态**一目了然**：

- 哪些能力有测试，哪些没有
- 每个能力覆盖了哪些场景，缺了哪些
- 测试结果的历史趋势
- AI 开发过程中测试是否跟上了代码变更

---

## 二、数据链路

```
测试运行                    Extension 采集              前端渲染
   │                           │                         │
   ▼                           ▼                         ▼
pytest --json-report  →  解析 JSON 结果           →  质量面板
       │                       │                         │
       ├── test-results.json   ├── 按能力聚合             ├── 总览卡片
       ├── test-mapping.json   ├── 匹配场景映射            ├── 能力矩阵
       └── test-history.jsonl  └── 追加历史记录            └── 趋势图
                                       │
                                       ▼
                              test-expectations.json
                              (AI 分析期望场景)
```

---

## 三、测试↔能力映射策略

### 3.1 三层映射机制

**优先级从高到低**：

#### Layer 1：pytest marker（最精确）

```python
import pytest

@pytest.mark.capability("PATTERN.SIMILARITY.SEARCH")
@pytest.mark.scenario("模板编码与哈希一致性")
def test_pattern_hash_stable():
    ...
```

Extension 扫描 Python 文件中的 marker 装饰器，正则提取：

```typescript
const markerPattern = /@pytest\.mark\.capability\(["'](.+?)["']\)/;
const scenarioPattern = /@pytest\.mark\.scenario\(["'](.+?)["']\)/;
```

#### Layer 2：Import 分析（自动推断）

分析测试文件的 `import` 语句，匹配到 `ai-doc-index.json` 的 `code_hints`：

```
test_pattern_similarity.py
  → from pattern_similarity.search import run_similarity_search
  → pattern_similarity/search.py 在 code_hints 中属于 PATTERN.SIMILARITY.SEARCH
  → 自动关联，confidence = "medium"
```

#### Layer 3：手动配置（兜底）

在 `.observatory/test-mapping.json` 中手动指定映射关系。适用于间接依赖难以推断的情况。

### 3.2 Cursor Rule 强制标注

建议在项目中添加规则，要求 AI 写测试时必须加 marker：

```markdown
# .cursor/rules/test-quality.mdc
## 测试编写规则

1. 每个新增的测试函数必须添加 `@pytest.mark.capability("XXX")` 标记
2. capability 的值必须是 `docs/00-meta/ai-doc-index.json` 中已注册的能力 ID
3. 推荐添加 `@pytest.mark.scenario("场景描述")` 标记
4. 每个能力至少覆盖以下场景：
   - 正常路径（happy path）
   - 边界条件
   - 错误处理
   - 核心业务规则
```

### 3.3 conftest.py 注册 marker

```python
# tests/conftest.py
import pytest

def pytest_configure(config):
    config.addinivalue_line("markers", "capability(id): 关联的业务能力 ID")
    config.addinivalue_line("markers", "scenario(name): 测试场景描述")
```

---

## 四、期望场景分析

### 4.1 AI 自动分析

Extension 可调用 AI（通过 Cursor 的能力或独立 LLM API）分析每个能力应有的测试场景：

**输入**：
- 能力的 `code_entry_points` 源码
- 能力的 `primary_doc` 文档内容
- 能力的 `acceptance_criteria`（如有）

**输出**：
```json
{
  "PATTERN.SIMILARITY.SEARCH": {
    "scenarios": [
      { "name": "模板编码与哈希一致性", "priority": "high", "rationale": "编码是搜索基础，哈希不稳定会导致缓存失效" },
      { "name": "形态评分自相似>90", "priority": "high", "rationale": "自身比较应高分，验证评分逻辑正确性" },
      { "name": "端到端搜索返回结果", "priority": "critical", "rationale": "核心功能集成测试" },
      { "name": "回看窗口限制生效", "priority": "medium", "rationale": "用户指定回看天数时搜索范围正确" },
      { "name": "粗召回加速路径", "priority": "high", "rationale": "性能优化路径需验证不丢失结果" },
      { "name": "结果缓存命中与失效", "priority": "high", "rationale": "缓存逻辑影响性能和正确性" },
      { "name": "空数据/无结果处理", "priority": "medium", "rationale": "边界条件不应崩溃" }
    ]
  }
}
```

### 4.2 触发时机

- **自动**：当能力的代码入口文件发生变更时，重新分析
- **手动**：在面板上点击「分析测试覆盖」

---

## 五、面板视图详细设计

### 5.1 顶部总览区

```
┌─────────────────────────────────────────────────────────────┐
│  🧪 质量监控                  最近运行: 2分钟前  [▶ 运行全部]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐ │
│  │ 能力覆盖率  │ │ 测试通过率  │ │ 场景覆盖率  │ │ 用例总数  │ │
│  │            │ │            │ │            │ │          │ │
│  │   26%     │ │   100%     │ │   45%      │ │   14    │ │
│  │  4/15     │ │  14/14     │ │  12/27     │ │ +4 本周  │ │
│  │  ⚠️ 偏低   │ │  ✅ 优秀    │ │  ⚠️ 偏低    │ │          │ │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**指标计算**：
- **能力覆盖率** = 有测试的能力数 / 总能力数
- **测试通过率** = passed / total
- **场景覆盖率** = 已覆盖场景数 / 期望场景总数（来自 test-expectations.json）

### 5.2 能力级矩阵

```
┌─────────────────────────────────────────────────────────────┐
│  📋 能力测试矩阵                    筛选: [全部▼] [排序▼]     │
│                                                             │
│  ┌──────────────────────┬──────┬──────┬────────┬──────────┐ │
│  │ 能力                  │ 用例 │ 通过 │ 场景   │ 状态     │ │
│  ├──────────────────────┼──────┼──────┼────────┼──────────┤ │
│  │ PATTERN.SIMILARITY   │  9   │ 9/9  │ 5/7   │ 🟢 良好  │ │
│  │ AUTH.APP.USER        │  2   │ 2/2  │ 2/5   │ 🟡 不足  │ │
│  │ AI.AGENT.CORE        │  2   │ 2/2  │ 1/6   │ 🟡 不足  │ │
│  │ UI.APP.CHARTS        │  1   │ 1/1  │ 1/3   │ 🟡 不足  │ │
│  │ VALUE.SCREENER.CORE  │  0   │  —   │ 0/8   │ 🔴 缺失  │ │
│  │ DATA.OHLCV.SYNC     │  0   │  —   │ 0/5   │ 🔴 缺失  │ │
│  │ SCHEDULER.ADMIN      │  0   │  —   │ 0/4   │ 🔴 缺失  │ │
│  │ AI.CHAT              │  0   │  —   │ 0/6   │ 🔴 缺失  │ │
│  │ AI.BRIEFING          │  0   │  —   │ 0/4   │ 🔴 缺失  │ │
│  │ ...                  │      │      │       │          │ │
│  └──────────────────────┴──────┴──────┴────────┴──────────┘ │
│                                                             │
│  排序: 按状态严重度(默认) | 按用例数 | 按能力名               │
│  筛选: 全部 | 🔴 缺失 | 🟡 不足 | 🟢 良好 | 🟣 优秀        │
└─────────────────────────────────────────────────────────────┘
```

**状态计算规则**：

| 状态 | 条件 | 颜色 |
|------|------|------|
| 🔴 缺失 | 用例数 = 0 | red |
| 🟠 失败 | 有用例但存在 failed | orange |
| 🟡 不足 | 全部通过但场景覆盖 < 50% | amber |
| 🟢 良好 | 全部通过且场景覆盖 50%~99% | green |
| 🟣 优秀 | 全部通过且场景覆盖 100% | purple |

### 5.3 能力详情（点击展开）

```
┌─────────────────────────────────────────────────────────────┐
│  PATTERN.SIMILARITY.SEARCH — 形态相似度搜索                    │
│  🟢 良好 | 9 用例全部通过 | 场景覆盖 5/7 (71%)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  📋 测试场景                                                 │
│  ┌─────────────────────────────────────┬────────┬─────────┐ │
│  │ 场景                                │ 状态   │ 优先级   │ │
│  ├─────────────────────────────────────┼────────┼─────────┤ │
│  │ 模板编码与哈希一致性                  │ ✅ 1例 │ high    │ │
│  │ 形态相似度评分                       │ ✅ 3例 │ high    │ │
│  │ 端到端搜索流程                       │ ✅ 1例 │critical │ │
│  │ 回看窗口与切片逻辑                   │ ✅ 3例 │ medium  │ │
│  │ 评分窗口计算                         │ ✅ 1例 │ medium  │ │
│  │ 粗召回加速路径                       │ ❌ 缺失 │ high   │ │
│  │ 结果缓存命中与失效                   │ ❌ 缺失 │ high   │ │
│  └─────────────────────────────────────┴────────┴─────────┘ │
│                                                             │
│  📝 用例明细                                                 │
│  ┌──────────────────────────────────────────┬────┬────────┐ │
│  │ 用例                                      │ 结果│ 耗时  │ │
│  ├──────────────────────────────────────────┼────┼────────┤ │
│  │ test_pattern_hash_stable                  │ ✅ │  12ms │ │
│  │ test_shape_self_high                      │ ✅ │   8ms │ │
│  │ test_shape_different_low                  │ ✅ │   6ms │ │
│  │ test_score_window_runs                    │ ✅ │  45ms │ │
│  │ test_end_to_end_search                    │ ✅ │ 120ms │ │
│  │ test_effective_lookback_at_least_window    │ ✅ │   3ms │ │
│  │ test_slice_symbol_df_for_search_tail       │ ✅ │   5ms │ │
│  │ test_lookback_limits_match_range           │ ✅ │  89ms │ │
│  │ test_score_window_weights_override_...     │ ✅ │  34ms │ │
│  └──────────────────────────────────────────┴────┴────────┘ │
│                                                             │
│  📈 历史趋势 (近30天)                                         │
│  用例数:  ▁▂▃▅▇█  (3→9)                                     │
│  通过率:  ████████  (100% 稳定)                               │
│                                                             │
│  💡 AI 建议                                                  │
│  • 缺少「粗召回加速」场景测试 (high) — cache.py 已有实现        │
│  • 缺少「结果缓存」场景测试 (high) — use_result_cache 参数      │
│  • 建议补充无结果/空数据边界测试                                │
│                                                             │
│  [▶ 运行此能力测试] [📝 生成缺失测试] [🔄 重新分析场景]         │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 历史趋势图

```
┌─────────────────────────────────────────────────────────────┐
│  📈 测试趋势 (近 30 天)                   [周▼] [月] [全部]   │
│                                                             │
│  用例数                          通过率                      │
│  20 ┤                            100%┤ ─────────────────    │
│  15 ┤          ╭───────          95% ┤                      │
│  10 ┤    ╭─────╯                 90% ┤                      │
│   5 ┤────╯                       85% ┤                      │
│   0 ┤                            80% ┤                      │
│     └──────────────────           └──────────────────       │
│      3/6  3/13  3/20  ...          3/6  3/13  3/20  ...     │
│                                                             │
│  能力覆盖率变化                                               │
│  50% ┤                                                      │
│  40% ┤                  ╭───                                │
│  30% ┤       ╭──────────╯                                   │
│  20% ┤───────╯                                              │
│  10% ┤                                                      │
│      └──────────────────                                    │
│       3/6  3/13  3/20  4/3                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 六、操作入口

### 6.1 运行测试

点击「运行全部」或单个能力的「运行测试」：

1. Extension 通过 Terminal API 执行 `pytest --json-report` 命令
2. 解析 JSON 报告文件
3. 更新 `test-results.json`、`test-history.jsonl`
4. 推送刷新事件到 Webview

### 6.2 生成缺失测试

点击「生成缺失测试」：

1. 读取能力的代码入口和期望场景
2. 构造 prompt：基于已有测试风格 + 缺失场景描述
3. **在 Cursor 中**打开新文件，写入生成的测试代码
4. 用户 review 后保存

### 6.3 重新分析场景

点击「重新分析场景」：

1. 读取能力的源码和文档
2. 调用 AI 分析应有测试场景
3. 更新 `test-expectations.json`
4. 刷新面板

---

## 七、与能力看板联动

能力看板的每张卡片上直接显示测试摘要徽章：

```
┌──────────────────────────┐
│ PATTERN.SIMILARITY.SEARCH │
│ ...                       │
│ 🧪 9/9 ✅ (5/7 场景)      │  ← 点击跳转到质量面板详情
└──────────────────────────┘
```

颜色与状态对齐：
- 🔴 红色文字 → 缺失/失败
- 🟡 琥珀色 → 场景不足
- 🟢 绿色 → 良好
- 🟣 紫色 → 优秀

---

## 八、pytest JSON Report 集成

### 8.1 配置

在项目中安装 `pytest-json-report`：

```bash
pip install pytest-json-report
```

在 `pytest.ini` 或 `pyproject.toml` 中配置：

```ini
[tool:pytest]
addopts = --json-report --json-report-file=.observatory/pytest-report.json
```

**SDD 项目**（存在 `specs/.active`）：建议将报告写到 **`specs/<active>/observatory/pytest-report.json`**（与 feature 名一致；目录建议 gitignore），例如：

```ini
addopts = --json-report --json-report-file=specs/my-feature/observatory/pytest-report.json
```

无 SDD 或单仓库回退时，仍可使用根目录 `.observatory/pytest-report.json`。

### 8.2 报告解析

```typescript
// Extension 解析 pytest JSON report

interface PytestJsonReport {
    created: number;
    duration: number;
    exitcode: number;
    summary: { passed: number; failed: number; total: number };
    tests: PytestTestCase[];
}

interface PytestTestCase {
    nodeid: string;          // "tests/test_foo.py::TestClass::test_method"
    outcome: 'passed' | 'failed' | 'skipped' | 'error';
    duration: number;
    call?: { longrepr?: string };  // 失败信息
    metadata?: { capability?: string; scenario?: string };  // 标准字段（推荐）
    user_properties?: [string, any][];                      // pytest 原生字段（兼容）
}

function parsePytestReport(report: PytestJsonReport): TestResults {
    const markerOf = (t: PytestTestCase) => {
        if (t.metadata?.capability || t.metadata?.scenario) {
            return {
                capability: t.metadata?.capability ?? null,
                scenario: t.metadata?.scenario ?? null
            };
        }
        const props = new Map((t.user_properties || []).map(([k, v]) => [k, v]));
        return {
            capability: (props.get('capability') as string | undefined) ?? null,
            scenario: (props.get('scenario') as string | undefined) ?? null
        };
    };

    return {
        schema_version: '1.0.0',
        last_run: new Date(report.created * 1000).toISOString(),
        runner: 'pytest',
        summary: {
            total: report.summary.total,
            passed: report.summary.passed,
            failed: report.summary.failed,
            skipped: report.tests.filter(t => t.outcome === 'skipped').length,
            errors: report.tests.filter(t => t.outcome === 'error').length,
            duration_ms: Math.round(report.duration * 1000)
        },
        test_cases: report.tests.map(t => ({
            id: t.nodeid,
            file: t.nodeid.split('::')[0],
            name: t.nodeid.split('::').pop()!,
            status: t.outcome,
            duration_ms: Math.round(t.duration * 1000),
            capability_id: markerOf(t).capability || inferCapability(t.nodeid),
            scenario: markerOf(t).scenario,
            error_message: t.call?.longrepr || null
        }))
    };
}
```

为保证 marker 可稳定写入 `metadata`，建议在测试侧增加 hook（最终版基线）：

```python
# tests/conftest.py
import pytest

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    outcome = yield
    report = outcome.get_result()
    capability = None
    scenario = None
    for m in item.iter_markers(name="capability"):
        if m.args:
            capability = m.args[0]
    for m in item.iter_markers(name="scenario"):
        if m.args:
            scenario = m.args[0]
    # 将 marker 信息挂在 report.user_properties，供 json report 插件输出
    report.user_properties.append(("capability", capability))
    report.user_properties.append(("scenario", scenario))
```

解析优先级（最终版固定）：
1. `metadata.capability/scenario`（标准字段，置信度 high）
2. `user_properties`（pytest hook 注入，兼容字段，置信度 high）
3. pytest marker 源码扫描结果（置信度 high）
4. import + `code_hints` 自动推断（置信度 medium）
5. 手工 `test-mapping.json` 覆盖（置信度 manual）
