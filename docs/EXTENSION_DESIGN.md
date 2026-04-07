# Cursor Extension 技术设计

> **版本**：1.0.0-final  
> **更新**：2026-04-05  
> **状态**：开发基线

### 相关文档

| 文档 | 关系 |
|------|------|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 整体架构、数据流、状态机、错误处理（本文的上层设计） |
| [SCHEMA_SPEC.md](SCHEMA_SPEC.md) | Scanner 输出的 JSON 数据契约 |
| [QUALITY_MONITOR_DESIGN.md](QUALITY_MONITOR_DESIGN.md) | 测试解析与能力映射的详细策略 |

---

## 一、Extension 概述

### 1.1 定位

Observatory Extension 是 Cursor/VS Code 的扩展插件，负责：

1. **监听** IDE 事件（文件变更、Git、终端、诊断、Agent Transcript）
2. **扫描** 项目代码结构，生成标准化 JSON 数据
3. **提供** Webview Dashboard 面板（内嵌 React 应用）
4. **暴露** HTTP Server 供浏览器独立访问
5. **增强** 侧栏 TreeView 显示项目能力状态

### 1.2 技术栈

| 组件 | 技术 |
|------|------|
| Extension 主体 | TypeScript + VS Code Extension API |
| 构建 | webpack 5 |
| Webview UI | React + Vite (独立构建，嵌入 Extension) |
| HTTP Server | Express.js (内嵌) |
| WebSocket | ws 库 |
| 测试 | vitest |

---

## 二、Extension 生命周期

### 2.1 激活条件

```jsonc
// package.json contributes
{
  "activationEvents": [
    "workspaceContains:.observatory",     // 已初始化的项目自动激活
    "onCommand:observatory.initialize",   // 手动初始化命令
    "onCommand:observatory.openDashboard" // 打开面板命令
  ]
}
```

### 2.2 激活流程

```
Extension.activate()
    │
    ├── 1. 检测项目类型（Python/Node/Java/Generic）
    ├── 2. 加载或创建 .observatory/ 目录
    ├── 3. 选择并实例化对应的 Scanners
    ├── 4. 注册所有 Watchers
    ├── 5. 启动 HTTP Server (:3800)
    ├── 6. 注册 Commands / TreeView / Webview Provider
    └── 7. 执行首次增量扫描（如果距上次全量扫描 > 1小时）
```

### 2.3 停用流程

```
Extension.deactivate()
    │
    ├── 1. 停止所有 Watchers
    ├── 2. 关闭 HTTP Server
    ├── 3. 持久化未写入的缓冲数据
    └── 4. 释放资源
```

---

## 三、Watchers — 事件监听层

### 3.1 File Watcher

```typescript
// watchers/file-watcher.ts

export class FileWatcher {
    private changeBuffer: FileChange[] = [];
    private debounceTimer: NodeJS.Timeout | null = null;
    private readonly DEBOUNCE_MS = 5000;

    register(context: vscode.ExtensionContext) {
        // 监听文件保存事件
        context.subscriptions.push(
            vscode.workspace.onDidSaveTextDocument((doc) => {
                this.onFileChanged({
                    path: doc.uri.fsPath,
                    action: 'modified',
                    languageId: doc.languageId,
                    timestamp: new Date()
                });
            })
        );

        // 监听文件创建/删除
        const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*');
        context.subscriptions.push(
            fileWatcher.onDidCreate(uri => this.onFileChanged({ path: uri.fsPath, action: 'created', timestamp: new Date() })),
            fileWatcher.onDidDelete(uri => this.onFileChanged({ path: uri.fsPath, action: 'deleted', timestamp: new Date() }))
        );
    }

    private onFileChanged(change: FileChange) {
        // 过滤：忽略 .observatory/ 自身、node_modules、.git 等
        if (this.shouldIgnore(change.path)) return;

        this.changeBuffer.push(change);

        // 防抖：文件变更停止 5s 后，认为一轮操作结束
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => this.flush(), this.DEBOUNCE_MS);
    }

    private async flush() {
        const changes = this.changeBuffer.splice(0);
        if (changes.length === 0) return;

        // 触发增量更新
        await this.onBatchChanged(changes);
    }
}
```

### 3.2 Git Watcher

```typescript
// watchers/git-watcher.ts

export class GitWatcher {
    register(context: vscode.ExtensionContext) {
        // 监控 .git/HEAD 和 .git/refs 变化来检测 commit/branch 切换
        const gitWatcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(workspaceRoot, '.git/{HEAD,refs/**,COMMIT_EDITMSG}')
        );

        context.subscriptions.push(
            gitWatcher.onDidChange(() => this.onGitEvent()),
            gitWatcher.onDidCreate(() => this.onGitEvent())
        );
    }

    private async onGitEvent() {
        // 获取最新 commit 信息
        const latestCommit = await this.getLatestCommit();
        // 获取变更文件列表
        const changedFiles = await this.getChangedFiles(latestCommit.hash);

        // 更新 progress.json
        await this.store.appendProgress({
            commit: latestCommit,
            files: changedFiles,
            timestamp: new Date()
        });

        // 通知 Webview 刷新
        this.bridge.postMessage({ type: 'refresh', scope: 'progress' });
    }
}
```

### 3.3 Transcript Watcher

Cursor 的 Agent Transcript 是 Observatory 获取 AI 会话信息的核心数据源，但其目录结构和文件格式属于 Cursor 内部实现，可能随版本变化。因此 TranscriptWatcher 需要具备**版本检测**和**格式自适应**能力。

#### 3.3.1 目录发现与版本检测

```typescript
// watchers/transcript-watcher.ts

export class TranscriptWatcher {
    private transcriptDir: string | null = null;
    private formatVersion: 'v1' | 'v2' | 'unknown' = 'unknown';

    // 已知的 Cursor transcript 目录模式（按优先级排序）
    private static readonly DIR_CANDIDATES = [
        // 当前已知格式：~/.cursor/projects/{project-id}/agent-transcripts/
        (home: string, projectId: string) =>
            path.join(home, '.cursor', 'projects', projectId, 'agent-transcripts'),
        // 备选：可能的未来格式
        (home: string, projectId: string) =>
            path.join(home, '.cursor', 'agent-transcripts', projectId),
        // 兜底：workspace 下直接查找
        (_home: string, _projectId: string, workspaceRoot: string) =>
            path.join(workspaceRoot, '.cursor', 'agent-transcripts'),
    ];

    constructor(projectId: string, workspaceRoot: string) {
        this.transcriptDir = this.discoverTranscriptDir(projectId, workspaceRoot);
        if (this.transcriptDir) {
            this.formatVersion = this.detectFormatVersion();
        }
    }

    private discoverTranscriptDir(projectId: string, workspaceRoot: string): string | null {
        const home = os.homedir();
        for (const candidate of TranscriptWatcher.DIR_CANDIDATES) {
            const dir = candidate(home, projectId, workspaceRoot);
            if (fs.existsSync(dir)) return dir;
        }
        return null;
    }

    private detectFormatVersion(): 'v1' | 'v2' | 'unknown' {
        // 读取第一个 .jsonl 文件的第一行，检测字段结构
        const files = fs.readdirSync(this.transcriptDir!).filter(f => f.endsWith('.jsonl'));
        if (files.length === 0) return 'v1'; // 空目录假定为当前版本

        try {
            const firstLine = fs.readFileSync(
                path.join(this.transcriptDir!, files[0]), 'utf-8'
            ).split('\n')[0];
            const entry = JSON.parse(firstLine);

            if ('role' in entry && 'content' in entry) return 'v1';
            if ('type' in entry && 'payload' in entry) return 'v2';
        } catch {
            // 解析失败不阻断，用 unknown 走容错路径
        }
        return 'unknown';
    }

    register(context: vscode.ExtensionContext) {
        if (!this.transcriptDir) {
            console.log('[Observatory] Transcript directory not found, AI session tracking disabled');
            this.bridge.postMessage({
                type: 'feature-status',
                feature: 'ai-sessions',
                status: 'unavailable',
                reason: 'Transcript directory not found'
            });
            return;
        }

        const watcher = vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(this.transcriptDir, '*.jsonl')
        );

        context.subscriptions.push(
            watcher.onDidCreate(uri => this.onTranscriptChanged(uri)),
            watcher.onDidChange(uri => this.onTranscriptChanged(uri))
        );
    }
```

#### 3.3.2 容错解析

```typescript
    private async onTranscriptChanged(uri: vscode.Uri) {
        try {
            const entries = await this.parseTranscriptSafe(uri.fsPath);
            if (entries.length === 0) return;

            const session = this.extractSessionInfo(entries);
            await this.store.upsertAiSession(session);
            this.bridge.postMessage({ type: 'agent-activity', session });
        } catch (err) {
            // 单个 transcript 解析失败不影响其他文件
            console.warn(`[Observatory] Failed to parse transcript ${uri.fsPath}:`, err);
        }
    }

    private async parseTranscriptSafe(filePath: string): Promise<TranscriptEntry[]> {
        const content = await fs.promises.readFile(filePath, 'utf-8');
        const entries: TranscriptEntry[] = [];

        for (const line of content.split('\n')) {
            if (!line.trim()) continue;
            try {
                const raw = JSON.parse(line);
                // 根据检测到的格式版本，用对应的适配器归一化
                const normalized = this.normalizeEntry(raw);
                if (normalized) entries.push(normalized);
            } catch {
                // 跳过损坏行，继续解析后续行
                continue;
            }
        }

        return entries;
    }

    private normalizeEntry(raw: any): TranscriptEntry | null {
        switch (this.formatVersion) {
            case 'v1':
                return { role: raw.role, content: raw.content, timestamp: raw.timestamp };
            case 'v2':
                return { role: raw.payload?.role, content: raw.payload?.content, timestamp: raw.ts };
            case 'unknown':
                // 尽力提取：寻找常见字段名
                return {
                    role: raw.role ?? raw.payload?.role ?? 'unknown',
                    content: raw.content ?? raw.payload?.content ?? raw.text ?? '',
                    timestamp: raw.timestamp ?? raw.ts ?? raw.created_at ?? null
                };
        }
    }

    // 提取会话信息：标题、修改的文件、使用的工具、持续时间
    private extractSessionInfo(entries: TranscriptEntry[]): AiSessionEntry {
        // ... 从归一化的 entries 中提取结构化信息
    }
}
```

#### 3.3.3 容错策略总结

| 故障场景 | 处理方式 | 用户可见行为 |
|---------|---------|------------|
| Transcript 目录不存在 | 跳过注册 Watcher | AI 日志面板显示"未启用" |
| 目录存在但文件格式未知 | 用 `unknown` 模式尽力提取 | 可能丢失部分字段，展示时标注"格式兼容" |
| 单行 JSON 损坏 | 跳过该行，继续解析 | 会话信息可能不完整 |
| 整个文件不可读 | catch 后跳过 | 该会话不出现在列表中 |
| Cursor 升级后路径变化 | 多候选路径探测 | 自动适配，无感知 |

### 3.4 Diagnostic Watcher

```typescript
// watchers/diagnostic-watcher.ts

export class DiagnosticWatcher {
    register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.languages.onDidChangeDiagnostics((e) => {
                for (const uri of e.uris) {
                    const diagnostics = vscode.languages.getDiagnostics(uri);
                    const errors = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Error);
                    const warnings = diagnostics.filter(d => d.severity === vscode.DiagnosticSeverity.Warning);

                    this.updateDocsHealth(uri.fsPath, errors.length, warnings.length);
                }
            })
        );
    }
}
```

### 3.5 Terminal Watcher

```typescript
// watchers/terminal-watcher.ts

export class TerminalWatcher {
    register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.window.onDidStartTerminalShellExecution((e) => {
                this.onCommandStarted(e.execution.commandLine.value);
            }),
            vscode.window.onDidEndTerminalShellExecution((e) => {
                this.onCommandEnded(e.exitCode);
            })
        );
    }

    private async onCommandStarted(command: string) {
        // 仅记录与扫描/测试相关命令，避免噪声过高
        if (!this.isRelevant(command)) return;
        await this.store.appendRuntimeEvent({
            type: 'terminal.command.started',
            command,
            timestamp: new Date().toISOString()
        });
    }

    private async onCommandEnded(exitCode: number | undefined) {
        await this.store.appendRuntimeEvent({
            type: 'terminal.command.ended',
            exitCode: exitCode ?? null,
            timestamp: new Date().toISOString()
        });
    }
}
```

---

## 四、Scanners — 项目扫描器

### 4.1 Scanner 接口

```typescript
// scanners/base-scanner.ts

export interface ScanResult {
    modules: ModuleInfo[];
    edges: DependencyEdge[];
}

export interface Scanner {
    readonly name: string;
    readonly supportedLanguages: string[];

    detect(workspaceRoot: string): Promise<boolean>;
    scan(workspaceRoot: string): Promise<ScanResult>;
    scanIncremental(workspaceRoot: string, changedFiles: string[]): Promise<Partial<ScanResult>>;
}
```

### 4.2 Python Scanner

```typescript
// scanners/python-scanner.ts

export class PythonScanner implements Scanner {
    readonly name = 'python';
    readonly supportedLanguages = ['python'];

    async detect(root: string): Promise<boolean> {
        // 检测 *.py 文件、requirements.txt、pyproject.toml 等
        return existsAny(root, ['requirements.txt', 'pyproject.toml', 'setup.py']);
    }

    async scan(root: string): Promise<ScanResult> {
        const packages = await this.findPackages(root);
        const modules: ModuleInfo[] = [];
        const edges: DependencyEdge[] = [];

        for (const pkg of packages) {
            const info = await this.analyzePackage(root, pkg);
            modules.push(info);

            // 分析 import 语句，提取内部依赖
            for (const imp of info.internalImports) {
                edges.push({ from: pkg.name, to: imp, type: 'import' });
            }
        }

        return { modules, edges };
    }

    private async analyzePackage(root: string, pkg: PackageDir): Promise<ModuleInfo> {
        const pyFiles = await glob(`${pkg.path}/**/*.py`);
        const files: FileInfo[] = [];
        const imports: string[] = [];

        for (const f of pyFiles) {
            const content = await readFile(f, 'utf-8');
            const analysis = this.analyzePythonFile(content);
            files.push({
                path: path.relative(root, f),
                lines: analysis.lineCount,
                functions: analysis.functionCount,
                classes: analysis.classCount
            });
            imports.push(...analysis.imports);
        }

        return {
            id: pkg.name,
            name: pkg.name,
            path: path.relative(root, pkg.path),
            type: 'package',
            files,
            imports_from: this.resolveInternalImports(imports, root),
            stats: this.computeStats(files)
        };
    }

    // 简化的 Python import 分析（不需要完整 AST，正则即可覆盖 90%）
    private analyzePythonFile(content: string) {
        const lines = content.split('\n');
        const importPattern = /^(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))/;
        const funcPattern = /^(?:async\s+)?def\s+(\w+)/;
        const classPattern = /^class\s+(\w+)/;

        const imports: string[] = [];
        let functionCount = 0;
        let classCount = 0;

        for (const line of lines) {
            const impMatch = line.match(importPattern);
            if (impMatch) imports.push(impMatch[1] || impMatch[2]);

            if (funcPattern.test(line)) functionCount++;
            if (classPattern.test(line)) classCount++;
        }

        return { lineCount: lines.length, functionCount, classCount, imports };
    }
}
```

### 4.3 SQL Scanner

```typescript
// scanners/sql-scanner.ts

export class SqlScanner {
    async scan(root: string): Promise<DataModels> {
        const sqlFiles = await glob(`${root}/sql/**/*.sql`);
        const tables: TableInfo[] = [];
        const relationships: Relationship[] = [];

        for (const f of sqlFiles) {
            const content = await readFile(f, 'utf-8');
            const parsed = this.parseDDL(content);
            tables.push(...parsed.tables);
            relationships.push(...parsed.foreignKeys);
        }

        return {
            schema_version: '1.0.0',
            generated_at: new Date().toISOString(),
            source_files: sqlFiles.map(f => path.relative(root, f)),
            tables,
            relationships
        };
    }

    private parseDDL(sql: string): { tables: TableInfo[], foreignKeys: Relationship[] } {
        // 正则解析 CREATE TABLE, FOREIGN KEY 等
        // 支持 MySQL 和 PostgreSQL 语法
    }
}
```

### 4.4 通用能力发现 Scanner

针对没有 `ai-doc-index.json` 的通用项目，基于 class 扫描自动发现能力（详见 [ARCHITECTURE.md 3.4](ARCHITECTURE.md#34-能力自动发现策略)）：

```typescript
// scanners/capability-discoverer.ts

export class CapabilityDiscoverer {
    // 排除的工具类名模式
    private static readonly EXCLUDE_PATTERNS = [
        /Utils$/i, /Helper$/i, /Mixin$/i, /^Base[A-Z]/, /^Abstract[A-Z]/,
        /Config$/i, /Constants$/i, /Exception$/i, /Error$/i, /^Test/
    ];

    async discoverFromClasses(modules: ModuleInfo[]): Promise<AutoCapability[]> {
        const capabilities: AutoCapability[] = [];

        for (const mod of modules) {
            const classes = this.extractPublicClasses(mod);
            const meaningful = classes.filter(c => !this.isUtilityClass(c.name));

            if (meaningful.length === 0) continue;

            // 同一模块下的类聚合为一个能力
            capabilities.push({
                id: this.generateCapabilityId(mod.name),
                title: mod.name,
                confidence: 'auto',
                source_module: mod.id,
                classes: meaningful.map(c => c.name),
                entry_points: this.findEntryPoints(mod),
                user_confirmed: false,  // 等待用户确认
            });
        }

        return capabilities;
    }

    private isUtilityClass(name: string): boolean {
        return CapabilityDiscoverer.EXCLUDE_PATTERNS.some(p => p.test(name));
    }

    private generateCapabilityId(moduleName: string): string {
        // snake_case → UPPER.DOT.CASE
        return moduleName.toUpperCase().replace(/_/g, '.');
    }

    private findEntryPoints(mod: ModuleInfo): string[] {
        // 优先识别 __main__.py、CLI handler、Router handler、被外部 import 的函数
        return mod.files
            .filter(f => f.path.includes('__main__') || f.path.includes('cli') || f.path.includes('app'))
            .map(f => f.path);
    }
}

interface AutoCapability {
    id: string;
    title: string;
    confidence: 'auto';
    source_module: string;
    classes: string[];
    entry_points: string[];
    user_confirmed: boolean;
}
```

用户确认修正的写入逻辑：

```typescript
// 当用户在能力看板中修正自动发现的能力时
async confirmCapability(id: string, updates: {
    title?: string;
    merge_with?: string;    // 合并到另一个能力
    split_into?: string[];  // 拆分为多个
    mark_as_non_capability?: boolean;  // 标记为非能力
}): Promise<void> {
    const caps = await this.store.readCapabilities();
    const cap = caps.capabilities.find(c => c.id === id);
    if (!cap) return;

    if (updates.mark_as_non_capability) {
        cap.category = 'internal';  // 不再作为能力追踪
    } else {
        cap.confidence = 'confirmed';  // 标记为已确认
        cap.user_confirmed = true;
        if (updates.title) cap.title = updates.title;
    }

    await this.store.writeCapabilities(caps);
    // 后续扫描将优先使用已确认的数据，不再重新推断
}
```

### 4.5 AI Doc Index Adapter

针对已有 `ai-doc-index.json` 的项目，直接映射而非推断：

```typescript
// scanners/adapters/ai-doc-index-adapter.ts

export class AiDocIndexAdapter {
    async loadCapabilities(root: string): Promise<CapabilityInfo[]> {
        const indexPath = path.join(root, 'docs/00-meta/ai-doc-index.json');
        if (!fs.existsSync(indexPath)) return [];

        const index = JSON.parse(await readFile(indexPath, 'utf-8'));
        return index.entries.map((entry: any) => ({
            id: entry.id,
            title: entry.title,
            primary_doc: entry.primary_doc,
            code_entry_points: entry.code_hints || [],
            related_doc_ids: entry.related_doc_ids || [],
            // phase/progress 等状态以 capabilities.json 现状为准（无则按规则推断默认值）
        }));
    }
}
```

---

## 五、Observatory Store — 数据管理

```typescript
// observatory/store.ts

export class ObservatoryStore {
    private basePath: string;  // 项目/.observatory/

    constructor(workspaceRoot: string) {
        this.basePath = path.join(workspaceRoot, '.observatory');
    }

    async initialize(): Promise<void> {
        await fs.promises.mkdir(this.basePath, { recursive: true });
        // 创建 .gitignore（推荐忽略 .observatory/）
        await this.ensureGitignore();
    }

    // 读取
    async readManifest(): Promise<Manifest> { return this.readJson('manifest.json'); }
    async readArchitecture(): Promise<Architecture> { return this.readJson('architecture.json'); }
    async readCapabilities(): Promise<Capabilities> { return this.readJson('capabilities.json'); }
    async readTestResults(): Promise<TestResults> { return this.readJson('test-results.json'); }

    // 写入（全量）
    async writeManifest(data: Manifest): Promise<void> { await this.writeJson('manifest.json', data); }
    async writeArchitecture(data: Architecture): Promise<void> { await this.writeJson('architecture.json', data); }

    // 增量更新能力状态
    async updateCapability(id: string, updates: Partial<CapabilityInfo>): Promise<void> {
        const caps = await this.readCapabilities();
        const idx = caps.capabilities.findIndex(c => c.id === id);
        if (idx >= 0) {
            caps.capabilities[idx] = { ...caps.capabilities[idx], ...updates, last_updated: new Date().toISOString() };
        }
        await this.writeJson('capabilities.json', caps);
    }

    // 追加 AI 会话
    async upsertAiSession(session: AiSessionEntry): Promise<void> {
        const sessions = await this.readJson<AiSessions>('ai-sessions.json');
        const idx = sessions.sessions.findIndex(s => s.id === session.id);
        if (idx >= 0) {
            sessions.sessions[idx] = session;
        } else {
            sessions.sessions.unshift(session);  // 最新的在前
        }
        await this.writeJson('ai-sessions.json', sessions);
    }

    // 追加测试历史
    async appendTestHistory(summary: TestRunSummary): Promise<void> {
        const line = JSON.stringify(summary) + '\n';
        await fs.promises.appendFile(
            path.join(this.basePath, 'test-history.jsonl'), line
        );
    }

    private async readJson<T>(filename: string): Promise<T> {
        const filePath = path.join(this.basePath, filename);
        const content = await fs.promises.readFile(filePath, 'utf-8');
        return JSON.parse(content);
    }

    private async writeJson(filename: string, data: any): Promise<void> {
        const filePath = path.join(this.basePath, filename);
        await fs.promises.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    }
}
```

---

## 六、Webview Panel

### 6.1 Panel Provider

```typescript
// webview/panel-provider.ts

export class ObservatoryPanelProvider {
    private panel: vscode.WebviewPanel | undefined;

    show(context: vscode.ExtensionContext) {
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            'observatory',
            'Project Observatory',
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist')
                ]
            }
        );

        this.panel.webview.html = this.getHtml(this.panel.webview, context);

        // 设置消息监听
        this.panel.webview.onDidReceiveMessage(
            msg => this.bridge.handleWebviewMessage(msg)
        );

        this.panel.onDidDispose(() => { this.panel = undefined; });
    }

    private getHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        const distUri = vscode.Uri.joinPath(context.extensionUri, 'webview-ui', 'dist');
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'index.js'));
        const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(distUri, 'index.css'));
        const nonce = this.getNonce();

        return `<!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy"
                  content="default-src 'none';
                           style-src ${webview.cspSource} 'unsafe-inline';
                           script-src 'nonce-${nonce}';
                           img-src ${webview.cspSource} data:;
                           font-src ${webview.cspSource};">
            <link rel="stylesheet" href="${styleUri}">
        </head>
        <body>
            <div id="root"></div>
            <script nonce="${nonce}" src="${scriptUri}"></script>
        </body>
        </html>`;
    }

    private getNonce(): string {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    // 向 Webview 推送消息
    postMessage(message: any) {
        this.panel?.webview.postMessage(message);
    }
}
```

---

## 七、HTTP Server

```typescript
// server/local-server.ts

import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';

export class LocalServer {
    private app = express();
    private server: http.Server;
    private wss: WebSocketServer;
    private port = 3800;

    constructor(private store: ObservatoryStore, private webviewUiPath: string) {
        // 静态文件（React 构建产物）
        this.app.use(express.static(this.webviewUiPath));

        // Observatory 数据 API
        this.app.get('/api/observatory/manifest', async (_, res) => res.json(await this.store.readManifest()));
        this.app.get('/api/observatory/architecture', async (_, res) => res.json(await this.store.readArchitecture()));
        this.app.get('/api/observatory/capabilities', async (_, res) => res.json(await this.store.readCapabilities()));
        this.app.get('/api/observatory/progress', async (_, res) => res.json(await this.store.readProgress()));
        this.app.get('/api/observatory/test-results', async (_, res) => res.json(await this.store.readTestResults()));
        this.app.get('/api/observatory/test-mapping', async (_, res) => res.json(await this.store.readTestMapping()));
        this.app.get('/api/observatory/test-expectations', async (_, res) => res.json(await this.store.readTestExpectations()));
        this.app.get('/api/observatory/ai-sessions', async (_, res) => res.json(await this.store.readAiSessions()));
        this.app.get('/api/observatory/data-models', async (_, res) => res.json(await this.store.readDataModels()));
        this.app.get('/api/observatory/docs-health', async (_, res) => res.json(await this.store.readDocsHealth()));
        this.app.get('/api/observatory/sessions', async (_, res) => res.json(await this.store.readSessionIndex()));
        this.app.get('/api/observatory/sessions/:id', async (req, res) => {
            res.json(await this.store.readSessionDetail(req.params.id));
        });
        this.app.get('/api/observatory/test-history', async (_, res) => {
            res.json(await this.store.readParsedTestHistory());
        });

        // 操作 API
        this.app.post('/api/actions/run-scanner', async (req, res) => {
            // 触发全量扫描
            await this.onScanRequested();
            res.json({ status: 'ok' });
        });
        this.app.post('/api/actions/run-tests', async (req, res) => {
            await this.onRunTestsRequested(req.body?.capabilityId);
            res.json({ status: 'ok' });
        });
        this.app.post('/api/actions/update-capability', async (req, res) => {
            await this.store.updateCapability(req.body.id, req.body.updates || {});
            res.json({ status: 'ok' });
        });

        // HTTP + WebSocket
        this.server = http.createServer(this.app);
        this.wss = new WebSocketServer({ server: this.server });
    }

    start() {
        this.server.listen(this.port, '127.0.0.1', () => {
            console.log(`Observatory Server: http://127.0.0.1:${this.port}`);
        });
    }

    stop() {
        this.wss.close();
        this.server.close();
    }

    // 广播更新到所有浏览器客户端
    broadcast(event: UpdateEvent) {
        const data = JSON.stringify(event);
        this.wss.clients.forEach(client => {
            if (client.readyState === 1) client.send(data);
        });
    }
}
```

统一错误响应（REST / Bridge）：

```json
{
  "code": "RESOURCE_NOT_FOUND",
  "message": "observatory resource not found",
  "detail": { "resource": "test-mapping" },
  "retryable": false
}
```

---

## 八、Commands & TreeView

### 8.1 注册的命令

```jsonc
// package.json contributes.commands
[
    { "command": "observatory.initialize", "title": "Observatory: Initialize Project" },
    { "command": "observatory.openDashboard", "title": "Observatory: Open Dashboard" },
    { "command": "observatory.runFullScan", "title": "Observatory: Run Full Scan" },
    { "command": "observatory.runTests", "title": "Observatory: Run Tests" },
    { "command": "observatory.showInDashboard", "title": "Observatory: Show in Dashboard" }
]
```

### 8.2 侧栏 TreeView

```
📊 OBSERVATORY
├── 📈 项目健康度: 78%
├── 📦 能力状态 (15)
│   ├── ✅ UI.APP.WORKBENCH (released)
│   ├── 🔄 PATTERN.SIMILARITY.SEARCH (85%)
│   ├── 🔄 AI.CHAT (developing)
│   ├── ❌ VALUE.SCREENER.CORE (无测试)
│   └── ...
├── 🧪 测试: 14 passed, 0 failed
├── 🤖 最近 AI 会话
│   ├── 实现市场环境日标签 (completed)
│   └── 优化缓存策略 (in_progress)
└── ⚡ 快捷操作
    ├── 打开 Dashboard
    ├── 运行全量扫描
    └── 运行测试
```

---

## 九、打包与分发

```bash
# 开发
cd extension
npm install
npm run watch          # webpack watch 模式

# Webview UI 开发
cd webview-ui
npm install
npm run dev            # Vite dev server（独立调试）

# 构建
cd extension
npm run build          # 构建 Extension + Webview UI
npx vsce package       # 打包为 .vsix

# 安装到 Cursor
# Cursor → Extensions → Install from VSIX → 选择 .vsix 文件
```

---

## 十、配置项

```jsonc
// Extension 提供的 VS Code settings
{
    "observatory.server.port": 3800,
    "observatory.server.autoStart": true,
    "observatory.scan.debounceMs": 5000,
    "observatory.scan.ignorePaths": ["node_modules", ".venv", "__pycache__"],
    "observatory.git.watchEnabled": true,
    "observatory.transcript.watchEnabled": true,
    "observatory.test.framework": "auto",       // auto | pytest | jest | junit
    "observatory.test.autoDetectResults": true
}
```
