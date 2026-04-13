# Cursor Observatory

面向 **Cursor / VS Code** 的 AI 开发可观测扩展：在项目根目录维护 `.observatory/` 数据层，提供**能力（Capability）生命周期**、**Agent 会话轨迹**、**测试与能力映射**、以及**内嵌仪表盘**（Webview + 本机 HTTP/WebSocket）。

**核心问题**：AI 做了什么？做到哪一步？结果是否可用？

---

## 功能概览

| 能力 | 说明 |
|------|------|
| **项目数据层** | 工作区根目录下 `.observatory/*.json`，仪表盘与扩展的单一数据源 |
| **侧栏** | 活动栏 **Observatory** → **Capabilities** 树，展示能力状态 |
| **仪表盘** | 内嵌 Webview；本机服务提供 REST 与 WebSocket，亦可用浏览器访问 `http://127.0.0.1:<端口>` |
| **扫描与监听** | 代码/文档/SQL 扫描；Git、文件变更、集成终端测试收尾、Agent 转录（`.jsonl`）等 |
| **能力阶段** | 结合会话文本推断设计/开发/测试；测试结果导入可触发「测试中→已完成」；Git 提交说明可标记「已发布」 |
| **数据模型引导** | 生成 `DATA_MODEL_AI_PROMPT.md`，便于让 AI 输出符合契约的 `data-models.json` |
| **质量** | 导入 pytest JSON、JUnit XML、规范化 `report.json`，更新测试结果、能力映射与历史 |
| **SDD 需求面板** | 选中 SDD 能力后右侧卡片：需求链接（TAPD 时 MCP 提示）、`specs/<feature>/observatory/` 下影响分析与测试用例、`observatory-sdd.json` 配置与部署服务列表 |

---

## 何时激活

扩展在以下任一情况会加载：

1. 工作区内已存在 **`.observatory`** 目录；或  
2. 你执行任一以 **「Observatory:」** 开头的命令。

若仓库尚无 `.observatory`，请先执行 **Observatory: Initialize Project**。

---

## 命令（Command Palette）

按 **`Cmd+Shift+P`**（macOS）或 **`Ctrl+Shift+P`**（Windows/Linux），输入 `Observatory` 筛选。

| 命令 | 作用 |
|------|------|
| **Observatory: Initialize Project** | 初始化 Store、可选创建 `.cursor/rules/observatory-project.mdc`，并执行一次全量扫描 |
| **Observatory: Open Dashboard** | 启动（若需）本机 HTTP 服务，打开内嵌仪表盘 |
| **Observatory: Run Full Scan** | 全量扫描，刷新 `.observatory` 内结构化数据 |
| **Observatory: Run Tests** | 按项目栈提示本机测试命令 |
| **Observatory: Import Test Report** | 选择 JSON/XML，更新测试与映射 |
| **Observatory: Show in Dashboard** | 与 Open Dashboard 相同 |
| **Observatory: Open Data Model AI Prompt** | 打开/生成 `.observatory/DATA_MODEL_AI_PROMPT.md`，按说明生成并保存 `data-models.json` 后再 Run Full Scan |

---

## 推荐首次使用流程

1. 用 Cursor **打开项目根目录**（单文件夹或多根工作区均可）。  
2. 执行 **Initialize Project**，确认生成 `.observatory/`。  
3. 执行 **Open Dashboard** 查看仪表盘。  
4. 日常修改后可用 **Run Full Scan**；跑测试后 **Import Test Report**（或开启设置中的自动导入）。  
5. 排查问题时：**输出** 面板 → 下拉选择 **「Observatory」** 查看日志。

**浏览器并行查看**：本地服务启动后访问 `http://127.0.0.1:<端口>`（默认端口见设置；若占用会自动递增）。

---

## 设置（Settings）

在设置中搜索 **`observatory`**。常用项：

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `observatory.server.port` | `3800` | 本地 HTTP 端口（占用时会尝试其他端口） |
| `observatory.server.autoStart` | `true` | 激活时是否自动启动 HTTP 服务 |
| `observatory.transcript.agentTranscriptsPath` | 空 | 手动指定 Agent 转录目录；空则按 `~/.cursor/projects/<slug>/agent-transcripts` 等规则探测 |
| `observatory.capability.aiPhaseInferenceEnabled` | `true` | 是否根据会话文本推断能力阶段 |
| `observatory.capability.autoCompleteOnTestsPass` | `true` | 导入测试结果且 `by_capability` 全通过时是否标为已完成 |
| `observatory.utTest.autoIngest` | `true` | 集成终端 pytest / mvn / gradlew 测试结束后是否自动导入；SDD 优先较新 `specs/<active>/observatory/report.json`（先于 JUnit XML）。另监听 `specs/**/observatory/report.json` 与兼容 `test/` 保存（去抖同 `scan.debounceMs`）。旧键 `test.autoIngestTestReport` / `test.autoIngestPytestReport` 仍兼容 |
| `observatory.onboarding.createCursorRule` | `true` | Initialize 时是否创建 `observatory-project.mdc` |

**Git 与「已发布」**：提交说明中单独一行写 `Observatory: cap-id-one,cap-id-two` 或 `能力: cap-id-one,cap-id-two`，扩展可将对应能力标为 **released**。

**SDD 显式阶段**：在 `specs/<feature>/observatory/observatory-sdd.json`（兼容旧路径 `specs/<feature>/observatory-sdd.json`）中可设置 `declaredPhase`（`planning`～`deprecated`），**优先于**由 spec/plan/tasks 推断的阶段；全量扫描会写入看板并保持该值。

**部署默认服务**：设置 **`observatory.deploy.defaultServiceList`**（英文逗号分隔）后，与需求面板中手工填写的 **`deployServiceList`** 合并，在影响分析未列出应用服务时仍可用于部署 Prompt。

**Cheetah MCP**：设置 **`observatory.deploy.cheetahMcp`** 为服务名后，TAPD 链接旁的「分支工作流」复制内容会引用该标识（旧键 `mcp.cheetah` 仍兼容）。

---

## 多根工作区

每个根文件夹各自拥有独立的 `.observatory/`，数据互不覆盖。

---

## 完整文档与源码

本扩展来自 **cursor_vibe_coding** 仓库；设计规格、JSON Schema、构建与打包说明见仓库根目录 **`README.md`** 及 **`docs/`**（如 `EXTENSION_DESIGN.md`、`SCHEMA_SPEC.md`、`USER_GUIDE.md`）。

本地从源码打包安装：

```bash
cd webview-ui && npm install && npm run build
cd ../extension && npm install && npm run build && npm run package
```

在 Cursor 中：**扩展** → **⋯** → **Install from VSIX…**，选择生成的 `.vsix`。

---

## 许可

MIT
