# Cursor Observatory 使用说明与常见问题

本文与当前扩展实现同步，说明能力阶段自动化、数据模型、Agent 转录路径、初始化 Rule 等。

---

## 1. 能力看板：阶段如何自动变化？

看板阶段包括：**规划中 → 设计中 → 开发中 → 测试中 → 已完成 → 已发布**（另有 **已废弃**）。

| 来源 | 行为 |
|------|------|
| **Agent 会话（转录 `.jsonl`）** | 扩展解析会话中与能力 ID 相关的对话，按关键词**至少**上调阶段：讨论/方案 → **设计中**；实现/改代码 → **开发中**；测试/pytest → **测试中**。不会单凭会话标为「已发布」。可在设置中关闭 `observatory.capability.aiPhaseInferenceEnabled`。**SDD 能力**（`capabilities[].sdd.enabled === true`）**不会**由转录上调阶段。 |
| **测试结果导入** | 若某能力处于 **测试中**，且 `report.json` / `test-results.json` 的 `by_capability` 中该能力 **failed=0 且 passed>0**，则标为 **已完成**。可关闭 `observatory.capability.autoCompleteOnTestsPass`。**SDD 能力**（`sdd.enabled === true`）默认仅由 **`specs/` 全量扫描** 改阶段，若开启 `observatory.capability.sddTestingCompleteOnTestPass`（旧键 `sddTestingCompleteOnPytestPass` 仍兼容），导入通过亦可标「已完成」。 |
| **测试产物路径（SDD）** | 规范化结果在 **`specs/<active>/observatory/report.json`**（与同目录 **`test-results.json`** 同步；**`specs/**/observatory/`** 建议加入 **`.gitignore`**，仅本机保存）。Python 可将 **pytest-json-report** 原始 JSON 写到 **`pytest-report.json`**；根目录 **`.observatory/`** 为回退；兼容旧路径 **`specs/<feature>/test/`**、**`specs/<feature>/.observatory/`**。执行 **Observatory: Configure SDD Integration** 可在项目根 **`.gitignore`** 中自动追加 `specs/**/observatory/`（若尚未存在）。 |
| **测试结果自动导入** | 开启 **`observatory.test.autoIngestTestReport`**（默认）时：（1）**集成终端**在 **pytest** 或 **mvn test / gradlew test** 结束后，若存在**较新**（约 2 分钟内写入）的 SDD **`report.json` / `pytest-report.json`**（路径同 `findTestReportFile` 约定），则**优先导入该 JSON**（与 **Import Test Report** 相同 pipeline，适合带 `capability_id` / `by_capability` 的规范化结果），**不再**仅用 Surefire XML，避免无能力维度元数据时反复手点导入。（2）**`specs/**/observatory/report.json`**（及兼容 **`specs/**/test/report.json`**）在磁盘上被保存或外部写入时，经 **`observatory.scan.debounceMs`**（默认 5000ms）去抖后也会自动导入，覆盖「测试已结束、稍后才由脚本或 AI 更新 JSON」的时序。终端与监听器在数秒内对同一文件会去重，避免重复追加测试历史。 |
| **Git 新提交** | 在提交说明中**单独一行**写：`Observatory: <能力id>` 或 `能力: <id1>,<id2>`，扩展会将对应能力标为 **已发布**。SDD 能力请使用 `specs/<feature>/.capability-id` 中的稳定 ID。进度时间线里会带上这些能力 ID。 |
| **`specs/` 全量扫描** | 能力看板**只**来自 `specs/<feature>/` 下含 `spec.md` 或 `sketch.md` 的 SDD 能力；**不再**从 `ai-doc-index.json` 或代码架构自动推断。若当前没有任何此类 feature，看板能力列表为**空**。**阶段与进度**由 `spec.md` / `sketch.md` / `plan.md` / `tasks.md` 等产物推断（`bugfix-log.md` 等仅作元数据展示，不单独推进阶段）。详见 [SDD_INTEGRATION_DESIGN.md](SDD_INTEGRATION_DESIGN.md)。 |
| **SDD：任务全勾选后的去向** | 默认：`tasks.md` 全部 `- [x]` → **测试中**。若本特性**不需要**单独测试阶段：在 `specs/<feature>/observatory/observatory-sdd.json`（兼容旧路径 `specs/<feature>/observatory-sdd.json`）写 `{ "skipTestingAfterTasks": true }`，或在 `plan.md` / `tasks.md` 中加入已勾选行，文案含 **「无需单独测试」**（或 `NO_TEST_PHASE` / `Observatory: skip-testing`）→ 全量扫描直接标为 **已完成**，无需「已发布」。若需要测试：保持默认为 **测试中**，导入测试结果且 `by_capability` 通过时可将 SDD 标为 **已完成**（`observatory.capability.sddTestingCompleteOnTestPass`，默认开启）。 |

**手动**：非 SDD 能力可在看板拖拽调整阶段；**SDD 能力**禁止拖拽改阶段（API 也会拒绝）。拖拽会通过 HTTP `PUT /api/observatory/capabilities` 写回 `capabilities.json`。

---

## 2. 数据模型不准？用 AI 生成 `data-models.json`

自动 SQL 扫描仅提取表名，列与关系需增强解析或手工维护。

1. 命令面板执行 **Observatory: Open Data Model AI Prompt**。  
2. 扩展在 `.observatory/DATA_MODEL_AI_PROMPT.md` 写入引导说明并打开。  
3. 将文档内容发给 AI，让 AI **只输出合法 JSON**，保存为 **`.observatory/data-models.json`**。  
4. 执行 **Observatory: Run Full Scan** 或刷新仪表盘。

**ER 图过大**：表很多时，仪表盘只绘制以「焦点表」为中心的**关系子图**（可调邻域深度、最多表数），并可勾选「紧凑实体」省略列。若仍提示体积过大，请缩小「最多表数」或开启紧凑模式。

---

## 3. Agent 转录目录：自动探测与手动配置

Cursor 通常将转录放在：

`~/.cursor/projects/<工作区绝对路径 slug>/agent-transcripts`

其中 **slug** 规则为：去掉前导 `/`，路径中 `/` 改为 `-`（例如  
`/Users/.../stock-dashboard` → `Users-...-stock-dashboard`）。

扩展会依次尝试：用户配置的 **绝对路径**、上述 slug 路径（含 **将下划线换成连字符** 的变体，因 Cursor 目录名可能与本地文件夹 `foo_bar` / `foo-bar` 不一致）、项目内 `.cursor/agent-transcripts`、以及 `projects` 下文件夹名经 **忽略 `_`/`-` 差异** 后匹配项目文件夹名的目录。

**转录文件位置**：Cursor 可能将 `.jsonl` 放在 `agent-transcripts/<会话子目录>/` 下，而非扁平放在 `agent-transcripts/` 根目录。扩展会 **递归** 监听并导入；执行 **Observatory: Run Full Scan** 或 **Initialize** 时也会全量导入转录。

**手动配置**：设置 **`observatory.transcript.agentTranscriptsPath`**，填绝对路径，或使用 `${workspaceFolder}` 相对路径。若该目录存在，优先使用。

仍需 **`observatory.transcript.watchEnabled: true`** 才会监听文件。

---

## 4. 初始化时写入 Cursor Rule

执行 **Observatory: Initialize Project** 时，若开启 **`observatory.onboarding.createCursorRule`**（默认），且项目内尚不存在该文件，则会创建：

`.cursor/rules/observatory-project.mdc`

其中说明能力 ID、Git 提交标记 `Observatory:`、数据模型与测试等约定。

---

## 5. 开发进度页仍为空？

进度时间线来自 **Git 日志**。目录必须是 Git 仓库且能读到提交记录。能力 ID 出现在提交中时会写入该条时间线的 `capability_ids`（当使用 `Observatory:` 行标记时）。

---

## 6. 自动 Git 提交？

扩展**不会**自动执行 `git commit`。发布语义通过提交说明中的 **`Observatory:`** 行驱动能力阶段为「已发布」。

---

## 7. SDD 集成与 Configure 命令

- **Observatory: Configure SDD Integration**：探测工作区是否已有 `specs/`、`.cursor/rules` 中的 SDD 相关规则、以及本机 Cursor 插件缓存中的 `context-hub/sdd`；按 `full` / `partial` / `none` 给出提示，并可一键创建 `specs/` 与 `.cursor/rules/sdd-integration.mdc`。
- 初始化或 **Run Full Scan** 完成后，若导入 SDD feature，通知会提示「已导入 N 个 SDD feature」。
- 详细设计见 [SDD_INTEGRATION_DESIGN.md](SDD_INTEGRATION_DESIGN.md)。

---

## 相关设置速查

| 设置项 | 作用 |
|--------|------|
| `observatory.transcript.agentTranscriptsPath` | 手动指定 `agent-transcripts` 目录 |
| `observatory.transcript.watchEnabled` | 是否监听转录 |
| `observatory.capability.aiPhaseInferenceEnabled` | 会话推断能力阶段 |
| `observatory.capability.autoCompleteOnTestsPass` | pytest 通过后标「已完成」 |
| `observatory.onboarding.createCursorRule` | 初始化时创建 `.mdc` Rule |

更多见仓库根目录 **`README.md`** 与 **`docs/SCHEMA_SPEC.md`**。

---

## 8. 需求详情面板 V2（SDD 能力）

在能力看板选中 **已启用 SDD** 的能力后，右侧详情按固定顺序展示多张卡片：**需求链接** → **SDD 产物** → **开发任务** → **影响场景分析** → **UT 测试** → **提交代码** → **环境部署** → **测试用例** → **Bug 追踪** → **相关活动**。

| 能力 | 说明 |
|------|------|
| **需求链接** | 读写 `specs/<feature>/observatory/observatory-sdd.json` 中的 `requirementUrl`（兼容旧路径 `specs/<feature>/observatory-sdd.json`），供提交说明、部署 Prompt 引用。链接为 **TAPD**（`tapd.cn` / `tapd.com`）时，卡片提供 **TAPD 详情**、**分支工作流**：一键复制 Prompt，由 AI 在 Cursor 中调用 **TAPD MCP**（`get_api_story_getTapdStory`）与 **Cheetah MCP** + `git pull` / `git checkout`（请在设置中填写 `observatory.mcp.cheetah` 服务名）。 |
| **影响 / 测试 JSON** | `specs/<feature>/observatory/`（目录名亦兼容 **`Observatory`**）下的 `impact-analysis.json` 与 `test-cases.json` 由 AI 落盘后经扩展 **校验、注入 Git 指纹、派生 Markdown**；看板展示新鲜度（与当前分支/提交/工作区指纹比对）。 |
| **环境部署** | 影响分析中的 **应用服务** 与需求级 **`deployServiceList`**（卡片内手工填写，英文逗号分隔）、扩展设置 **`observatory.deploy.defaultServiceList`** 合并展示；分析未扫到服务时仍可用后两者补全。 |
| **Prompt** | 「产物分析」「推进需求」「UT 测试」等支持 **异步加载模板**（`observatory.prompt.templateDir` + API）；UT 会注入影响场景列表。 |
| **MCP 预检** | 部署/测试用例卡片展示 CICD / testRunner MCP 配置状态；接口 `GET /api/observatory/preflight?stage=...`（内嵌与浏览器同构）。 |
| **设置** | 可在设置中配置 `observatory.skill.*`、`observatory.mcp.*`（含 `cheetah`）、`observatory.deploy.defaultServiceList`，详见 `docs/REQUIREMENT_PANEL_V2_DESIGN.md`。 |

浏览器访问仪表盘时，URL 需带 **`?root=<工作区绝对路径>`**，否则无法读取各需求下的 observatory 文件。
