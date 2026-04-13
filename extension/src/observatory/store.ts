/**
 * `.observatory/` JSON / JSONL persistence with per-file write queue.
 * primary_doc: docs/EXTENSION_DESIGN.md §五, docs/SCHEMA_SPEC.md §1.6, docs/ARCHITECTURE.md §3.6–3.7
 */
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { ObservatoryError } from "./errors";
import { migrateIfNeeded, parseMajorVersion, targetMajorFromExtension } from "./migrations";
import type {
  AiSessions,
  Architecture,
  Capabilities,
  DataModels,
  DocsHealth,
  Manifest,
  Progress,
  SessionIndex,
  TestExpectations,
  TestMapping,
  TestHistoryLineV1,
  TestResults,
} from "./types";
import {
  readActiveFeatureNameSync,
  resolveLegacySddObservatoryDir,
  resolveSddFeatureObservatoryDir,
  resolveSddFeatureTestDir,
  SDD_TEST_REPORT_JSON,
} from "./sdd-test-paths";
import { mergeTestResults } from "./merge-test-results";
import {
  isTestResultsRelativePath,
  normalizeTestResultsForSchema,
} from "./normalize-test-results";
import { ObservatoryValidator } from "./validator";

const PRUNE_MS = 30 * 24 * 60 * 60 * 1000;

/** #region agent log */
const DEBUG_LOG_PATH =
  "/Users/jiangyi/Documents/codedev/cursor_vibe_coding/.cursor/debug-54078b.log";
const DEBUG_SESSION = "54078b";
/** #endregion */

export interface RecoverCorruptedResult {
  action: "backup_removed" | "noop";
  message: string;
}

export class ObservatoryStore {
  readonly workspaceRoot: string;
  readonly basePath: string;
  private readonly validator: ObservatoryValidator;
  private readonly writeQueue = new Map<string, Promise<void>>();

  constructor(workspaceRoot: string, validator?: ObservatoryValidator) {
    this.workspaceRoot = workspaceRoot;
    this.basePath = path.join(workspaceRoot, ".observatory");
    this.validator = validator ?? new ObservatoryValidator();
  }

  /** Absolute path to `.observatory/`. */
  get observatoryPath(): string {
    return this.basePath;
  }

  /** User-local paths under `.observatory/` (project-shared JSON may be committed). */
  private static readonly USER_LOCAL_GITIGNORE_PATTERNS: readonly string[] = [
    ".observatory/manifest.json",
    ".observatory/ai-sessions.json",
    ".observatory/sessions/",
    ".observatory/progress.json",
    ".observatory/report.json",
    ".observatory/test-results.json",
    ".observatory/test-history.jsonl",
    ".observatory/pytest-report.json",
    ".observatory/*.corrupted",
  ];

  private static readonly LEGACY_FULL_DIR_IGNORE = new Set([
    ".observatory/",
    "**/.observatory/",
  ]);

  async initialize(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    await fs.mkdir(path.join(this.basePath, "sessions"), { recursive: true });
    await this.ensureGitignore();
  }

  /**
   * Append user-local `.observatory/*` patterns to `.gitignore`.
   * Removes legacy whole-directory ignores (`.observatory/` and the double-glob form) so shared files can be tracked.
   */
  async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.workspaceRoot, ".gitignore");
    const headerLegacy = "# Observatory (auto)";
    const headerUserLocal = "# Observatory – user-local (auto)";
    try {
      let raw = "";
      try {
        raw = await fs.readFile(gitignorePath, "utf8");
      } catch {
        raw = "";
      }
      const lines = raw.split(/\r?\n/);
      const kept: string[] = [];
      for (const line of lines) {
        const t = line.trim();
        if (ObservatoryStore.LEGACY_FULL_DIR_IGNORE.has(t)) continue;
        if (t === headerLegacy || t === headerUserLocal) continue;
        kept.push(line);
      }
      const existing = new Set(
        kept.map((l) => l.trim()).filter((l) => l.length > 0)
      );
      const missing = ObservatoryStore.USER_LOCAL_GITIGNORE_PATTERNS.filter(
        (p) => !existing.has(p)
      );
      if (missing.length === 0) {
        const newContent = kept.join("\n");
        if (newContent !== raw) {
          await fs.writeFile(
            gitignorePath,
            newContent.endsWith("\n") || newContent.length === 0
              ? newContent
              : `${newContent}\n`,
            "utf8"
          );
        }
        return;
      }
      while (kept.length > 0 && kept[kept.length - 1] === "") {
        kept.pop();
      }
      const blockLines = [
        "",
        headerUserLocal,
        ...missing,
        "",
      ];
      const appended = `${kept.join("\n")}${kept.length ? "\n" : ""}${blockLines.join("\n")}`;
      await fs.writeFile(
        gitignorePath,
        appended.endsWith("\n") ? appended : `${appended}\n`,
        "utf8"
      );
    } catch {
      /* ignore — e.g. read-only FS */
    }
  }

  private async serializedWrite(
    relativePath: string,
    writer: () => Promise<void>
  ): Promise<void> {
    const prev = this.writeQueue.get(relativePath) ?? Promise.resolve();
    const next = prev.then(writer, writer);
    this.writeQueue.set(relativePath, next);
    await next;
  }

  private fullPath(relativePath: string): string {
    return path.join(this.basePath, relativePath);
  }

  /** 枚举 `specs/<feature>/observatory/report.json`（存在则纳入）。 */
  private listSpecObservatoryReportPaths(): string[] {
    const specsDir = path.join(this.workspaceRoot, "specs");
    let names: string[] = [];
    try {
      names = fsSync
        .readdirSync(specsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("."))
        .map((d) => d.name);
    } catch {
      return [];
    }
    const out: string[] = [];
    for (const name of names) {
      const p = path.join(specsDir, name, "observatory", SDD_TEST_REPORT_JSON);
      if (fsSync.existsSync(p)) out.push(p);
    }
    return out.sort();
  }

  /**
   * 读取单份 report；若含 `redirect`（相对 observatory/report.json），则解析到目标文件再读。
   */
  private async loadReportWithRedirect(absReportPath: string): Promise<TestResults> {
    let data = await this.readJson<TestResults>("report.json", {
      absoluteFilePath: absReportPath,
    });
    const redir = (data as unknown as { redirect?: string }).redirect;
    if (typeof redir === "string" && redir.length > 0) {
      const resolved = path.resolve(path.dirname(absReportPath), redir);
      if (resolved !== absReportPath && fsSync.existsSync(resolved)) {
        data = await this.readJson<TestResults>("report.json", {
          absoluteFilePath: resolved,
        });
      }
    }
    return data;
  }

  /** #region agent log */
  private async agentDebugLogTestResults(
    pickedPath: string | null,
    merged: TestResults | null,
    extra: Record<string, unknown>
  ): Promise<void> {
    try {
      const bc = merged?.by_capability
        ? Object.keys(merged.by_capability as object)
        : [];
      const line =
        JSON.stringify({
          sessionId: DEBUG_SESSION,
          hypothesisId: "H1-H3",
          location: "store.ts:readTestResultsIfExists",
          message: "test results read",
          data: {
            pickedPath,
            workspaceRoot: this.workspaceRoot,
            activeFeature: readActiveFeatureNameSync(this.workspaceRoot),
            byCapabilityKeys: bc,
            testCasesLen: merged?.test_cases?.length ?? 0,
            ...extra,
          },
          timestamp: Date.now(),
        }) + "\n";
      await fs.appendFile(DEBUG_LOG_PATH, line, "utf8");
    } catch {
      /* ignore */
    }
  }
  /** #endregion */

  /**
   * Read JSON: parse → migrate (if any) → validate.
   */
  async readJson<T extends object>(
    relativePath: string,
    options?: { skipValidation?: boolean; absoluteFilePath?: string }
  ): Promise<T> {
    const norm = relativePath.split(path.sep).join("/");
    const full = options?.absoluteFilePath ?? this.fullPath(relativePath);
    const text = await fs.readFile(full, "utf8");
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(text) as Record<string, unknown>;
    } catch (e) {
      throw new ObservatoryError({
        code: "JSON_PARSE_FAILED",
        message: `Failed to parse ${norm}`,
        detail: { path: norm, cause: String(e) },
        retryable: false,
      });
    }

    const migrated = migrateIfNeeded(norm, data, targetMajorFromExtension());
    if (migrated === null) {
      const cur = parseMajorVersion(data.schema_version);
      const tgt = targetMajorFromExtension();
      if (cur < tgt) {
        throw new ObservatoryError({
          code: "SCHEMA_MIGRATION_MISSING",
          message: `No migrator for ${norm} (${cur}→${tgt})`,
          detail: { path: norm, schema_version: data.schema_version },
          retryable: false,
        });
      }
    }
    let working = (migrated ?? data) as Record<string, unknown>;
    if (isTestResultsRelativePath(norm)) {
      working = normalizeTestResultsForSchema(
        working as unknown as TestResults
      ) as unknown as Record<string, unknown>;
    }
    const finalData = working as unknown as T;
    if (!options?.skipValidation && this.validator.isRegistered(norm)) {
      this.validator.validate(norm, finalData);
    }
    return finalData;
  }

  /**
   * Write JSON with optional validation (default: validate when schema exists).
   */
  async writeJson(
    relativePath: string,
    data: unknown,
    options?: { validate?: boolean }
  ): Promise<void> {
    const norm = relativePath.split(path.sep).join("/");
    const shouldValidate =
      options?.validate !== false && this.validator.isRegistered(norm);
    if (shouldValidate) {
      this.validator.validate(norm, data);
    }
    const text = `${JSON.stringify(data, null, 2)}\n`;
    await this.serializedWrite(relativePath, async () => {
      const full = this.fullPath(relativePath);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, text, "utf8");
    });
  }

  async fileExists(relativePath: string): Promise<boolean> {
    try {
      await fs.access(this.fullPath(relativePath));
      return true;
    } catch {
      return false;
    }
  }

  /** Read JSON if file exists; otherwise `null` (no validation run on missing file). */
  async readJsonIfExists<T extends object>(
    relativePath: string
  ): Promise<T | null> {
    if (!(await this.fileExists(relativePath))) return null;
    return this.readJson<T>(relativePath);
  }

  /**
   * Prepend a timeline entry to `progress.json` (creates file if missing).
   */
  async appendProgressTimelineEvent(
    event: Record<string, unknown>
  ): Promise<void> {
    const existing = await this.readJsonIfExists<Progress>("progress.json");
    const now = new Date().toISOString();
    const doc: Progress = existing ?? {
      schema_version: "1.0.0",
      generated_at: now,
      summary: {
        total_commits: 0,
        active_branch: "main",
        recent_days: 14,
      },
      timeline: [],
    };
    const timeline = Array.isArray(doc.timeline) ? [...doc.timeline] : [];
    timeline.unshift(event);
    doc.timeline = timeline;
    doc.generated_at = now;
    await this.writeJson("progress.json", doc);
  }

  /**
   * Insert or replace an AI session by `id` in `ai-sessions.json`.
   */
  async upsertAiSession(session: Record<string, unknown>): Promise<void> {
    const existing = await this.readJsonIfExists<AiSessions>("ai-sessions.json");
    const doc: AiSessions = existing ?? {
      schema_version: "1.0.0",
      sessions: [],
    };
    const sessions = Array.isArray(doc.sessions) ? [...doc.sessions] : [];
    const sid = session.id;
    const idStr = typeof sid === "string" ? sid : "";
    const idx = sessions.findIndex((s) => {
      const o = s as { id?: string };
      return o.id === idStr;
    });
    if (idx >= 0) sessions[idx] = session;
    else sessions.unshift(session);
    doc.sessions = sessions;
    await this.writeJson("ai-sessions.json", doc);
  }

  async appendTestHistoryLine(line: TestHistoryLineV1): Promise<void> {
    const rel = "test-history.jsonl";
    const payload = `${JSON.stringify(line)}\n`;
    await this.serializedWrite(rel, async () => {
      await fs.appendFile(this.fullPath(rel), payload, "utf8");
    });
  }

  /** Raw lines (may include empty). */
  async readTestHistoryLines(): Promise<string[]> {
    const rel = "test-history.jsonl";
    const full = this.fullPath(rel);
    if (!fsSync.existsSync(full)) return [];
    const text = await fs.readFile(full, "utf8");
    return text.split("\n").filter((l) => l.trim().length > 0);
  }

  /** Parsed rows; skips malformed lines (per SCHEMA_SPEC JSONL tolerance). */
  async readParsedTestHistory(): Promise<TestHistoryLineV1[]> {
    const lines = await this.readTestHistoryLines();
    const out: TestHistoryLineV1[] = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as TestHistoryLineV1;
        if (row && typeof row === "object" && row.timestamp) {
          out.push(row);
        }
      } catch {
        /* skip bad line */
      }
    }
    return out;
  }

  /**
   * Drop records older than retention (default 30 days).
   * Mutates: ai-sessions.json, progress.json, test-history.jsonl, sessions/ dirs, sessions/index.json
   */
  async pruneExpiredData(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - PRUNE_MS).toISOString();

    if (await this.fileExists("ai-sessions.json")) {
      const doc = await this.readJson<AiSessions>("ai-sessions.json", {
        skipValidation: false,
      });
      const sessions = Array.isArray(doc.sessions) ? doc.sessions : [];
      doc.sessions = sessions.filter((s) => {
        const rec = s as { started_at?: string };
        return typeof rec.started_at === "string" && rec.started_at >= cutoff;
      });
      await this.writeJson("ai-sessions.json", doc);
    }

    if (await this.fileExists("progress.json")) {
      const doc = await this.readJson<Progress>("progress.json");
      const timeline = Array.isArray(doc.timeline) ? doc.timeline : [];
      doc.timeline = timeline.filter((e) => {
        const ev = e as { timestamp?: string };
        return typeof ev.timestamp === "string" && ev.timestamp >= cutoff;
      });
      await this.writeJson("progress.json", doc);
    }

    const lines = await this.readTestHistoryLines();
    const kept: string[] = [];
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as { timestamp?: string };
        if (row.timestamp && row.timestamp >= cutoff) kept.push(line);
      } catch {
        /* skip */
      }
    }
    if (lines.length > 0 || fsSync.existsSync(this.fullPath("test-history.jsonl"))) {
      await this.serializedWrite("test-history.jsonl", async () => {
        const full = this.fullPath("test-history.jsonl");
        if (kept.length === 0) {
          await fs.writeFile(full, "", "utf8");
        } else {
          await fs.writeFile(full, `${kept.join("\n")}\n`, "utf8");
        }
      });
    }

    await this.pruneSessionDirectories(cutoff);
  }

  private async pruneSessionDirectories(cutoffIso: string): Promise<void> {
    const sessionsRoot = this.fullPath("sessions");
    if (!fsSync.existsSync(sessionsRoot)) return;

    let entries: fsSync.Dirent[];
    try {
      entries = await fs.readdir(sessionsRoot, { withFileTypes: true });
    } catch {
      return;
    }

    const deletedDirs = new Set<string>();
    for (const ent of entries) {
      if (!ent.isDirectory() || !ent.name.startsWith("ses_")) continue;
      const metaPath = path.join(sessionsRoot, ent.name, "meta.json");
      let remove = false;
      try {
        const raw = await fs.readFile(metaPath, "utf8");
        const meta = JSON.parse(raw) as { created_at?: string };
        if (typeof meta.created_at === "string" && meta.created_at < cutoffIso) {
          remove = true;
        }
      } catch {
        remove = false;
      }
      if (remove) {
        await fs.rm(path.join(sessionsRoot, ent.name), {
          recursive: true,
          force: true,
        });
        deletedDirs.add(ent.name);
      }
    }

    const indexRel = path.join("sessions", "index.json");
    if (await this.fileExists(indexRel)) {
      const idx = await this.readJson<SessionIndex>(indexRel);
      const sessions = Array.isArray(idx.sessions) ? idx.sessions : [];
      idx.sessions = sessions.filter((s) => {
        const id = typeof s.id === "string" ? s.id : "";
        const created = typeof s.created_at === "string" ? s.created_at : "";
        if (created && created < cutoffIso) return false;
        const dirName = id.startsWith("ses_") ? id : `ses_${id}`;
        if (deletedDirs.has(dirName)) return false;
        return true;
      });
      await this.writeJson(indexRel, idx);
    }
  }

  /**
   * Backup `relativePath` to `relativePath.corrupted`, delete original.
   * Optional `regenerate` (e.g. run scanner) after removal.
   */
  async recoverCorruptedFile(
    relativePath: string,
    options?: { regenerate?: () => Promise<void> }
  ): Promise<RecoverCorruptedResult> {
    const full = this.fullPath(relativePath);
    if (!fsSync.existsSync(full)) {
      return {
        action: "noop",
        message: `${relativePath} does not exist`,
      };
    }
    const backup = `${full}.corrupted`;
    await fs.copyFile(full, backup);
    await fs.unlink(full);
    if (options?.regenerate) {
      await options.regenerate();
    }
    return {
      action: "backup_removed",
      message: `${relativePath} corrupted backup saved; file removed (regenerate if provided)`,
    };
  }

  // --- Typed accessors ---

  readManifest(): Promise<Manifest> {
    return this.readJson<Manifest>("manifest.json");
  }
  writeManifest(data: Manifest): Promise<void> {
    return this.writeJson("manifest.json", data);
  }

  readArchitecture(): Promise<Architecture> {
    return this.readJson<Architecture>("architecture.json");
  }
  writeArchitecture(data: Architecture): Promise<void> {
    return this.writeJson("architecture.json", data);
  }

  readCapabilities(): Promise<Capabilities> {
    return this.readJson<Capabilities>("capabilities.json");
  }
  writeCapabilities(data: Capabilities): Promise<void> {
    return this.writeJson("capabilities.json", data);
  }

  /**
   * 合并更新单条能力（看板拖拽、自动化阶段推断共用）。
   */
  async patchCapability(id: string, updates: Record<string, unknown>): Promise<void> {
    await this.serializedWrite("capabilities.json", async () => {
      const existing = await this.readJsonIfExists<Capabilities>("capabilities.json");
      if (!existing) {
        throw new ObservatoryError({
          code: "NOT_FOUND",
          message: "capabilities.json 不存在",
          detail: { id },
          retryable: false,
        });
      }
      const list = [...(existing.capabilities ?? [])] as Array<
        Record<string, unknown>
      >;
      const ix = list.findIndex((c) => c.id === id);
      if (ix < 0) {
        throw new ObservatoryError({
          code: "NOT_FOUND",
          message: `未找到能力: ${id}`,
          detail: { id },
          retryable: false,
        });
      }
      const cur = list[ix];
      const sdd = cur.sdd as { enabled?: boolean } | undefined;
      if (
        sdd?.enabled === true &&
        Object.prototype.hasOwnProperty.call(updates, "phase") &&
        updates.phase !== undefined &&
        String(updates.phase) !== String(cur.phase ?? "")
      ) {
        throw new ObservatoryError({
          code: "SDD_PHASE_READONLY",
          message:
            "SDD 能力的阶段由 specs/ 产物同步，请在仓库中更新 SDD 文档，勿手动拖拽改阶段。",
          detail: { id },
          retryable: false,
        });
      }
      list[ix] = {
        ...cur,
        ...updates,
        updated_at: new Date().toISOString(),
      };
      existing.capabilities = list;
      existing.generated_at = new Date().toISOString();
      const norm = "capabilities.json";
      const shouldValidate = this.validator.isRegistered(norm);
      if (shouldValidate) {
        this.validator.validate(norm, existing);
      }
      const text = `${JSON.stringify(existing, null, 2)}\n`;
      const full = this.fullPath(norm);
      await fs.mkdir(path.dirname(full), { recursive: true });
      await fs.writeFile(full, text, "utf8");
    });
  }

  readProgress(): Promise<Progress> {
    return this.readJson<Progress>("progress.json");
  }
  writeProgress(data: Progress): Promise<void> {
    return this.writeJson("progress.json", data);
  }

  readDataModels(): Promise<DataModels> {
    return this.readJson<DataModels>("data-models.json");
  }
  writeDataModels(data: DataModels): Promise<void> {
    return this.writeJson("data-models.json", data);
  }

  readAiSessions(): Promise<AiSessions> {
    return this.readJson<AiSessions>("ai-sessions.json");
  }
  writeAiSessions(data: AiSessions): Promise<void> {
    return this.writeJson("ai-sessions.json", data);
  }

  async readTestResults(): Promise<TestResults> {
    const r = await this.readTestResultsIfExists();
    if (!r) {
      throw new ObservatoryError({
        code: "FILE_NOT_FOUND",
        message: "report.json / test-results.json not found",
        detail: { path: SDD_TEST_REPORT_JSON },
        retryable: false,
      });
    }
    return r;
  }

  /**
   * 合并 `specs/<feature>/observatory/report.json`（各能力一份，含 `redirect` 占位时解析），
   * 避免仅依赖 `specs/.active` 时读到空占位或其它能力数据导致看板为 0。
   * 若无任何「各 feature 下 observatory/report.json」，则回退：优先 active 下 observatory/test/legacy，最后根 `.observatory/`。
   */
  async readTestResultsIfExists(): Promise<TestResults | null> {
    const specPaths = this.listSpecObservatoryReportPaths();
    if (specPaths.length > 0) {
      let merged: TestResults | null = null;
      for (const absPath of specPaths) {
        const doc = await this.loadReportWithRedirect(absPath);
        merged = merged ? mergeTestResults(merged, doc) : doc;
      }
      await this.agentDebugLogTestResults(specPaths[0] ?? null, merged, {
        specReportCount: specPaths.length,
        strategy: "merge-all-spec-observatory",
      });
      return merged;
    }

    const sddDirs = [
      resolveSddFeatureObservatoryDir(this.workspaceRoot),
      resolveSddFeatureTestDir(this.workspaceRoot),
      resolveLegacySddObservatoryDir(this.workspaceRoot),
    ].filter(Boolean) as string[];

    for (const sddDir of sddDirs) {
      const primary = path.join(sddDir, SDD_TEST_REPORT_JSON);
      if (fsSync.existsSync(primary)) {
        const data = await this.loadReportWithRedirect(primary);
        await this.agentDebugLogTestResults(primary, data, {
          specReportCount: 0,
          strategy: "legacy-active-sdd-observatory",
        });
        return data;
      }
      const legacyName = path.join(sddDir, "test-results.json");
      if (fsSync.existsSync(legacyName)) {
        const data = await this.readJson<TestResults>("test-results.json", {
          absoluteFilePath: legacyName,
        });
        await this.agentDebugLogTestResults(legacyName, data, {
          specReportCount: 0,
          strategy: "legacy-sdd-test-results",
        });
        return data;
      }
    }
    if (await this.fileExists("report.json")) {
      const data = await this.readJson<TestResults>("report.json");
      await this.agentDebugLogTestResults(
        this.fullPath("report.json"),
        data,
        { specReportCount: 0, strategy: "root-observatory-report" }
      );
      return data;
    }
    if (await this.fileExists("test-results.json")) {
      const data = await this.readJson<TestResults>("test-results.json");
      await this.agentDebugLogTestResults(
        this.fullPath("test-results.json"),
        data,
        { specReportCount: 0, strategy: "root-observatory-test-results" }
      );
      return data;
    }
    await this.agentDebugLogTestResults(null, null, {
      specReportCount: 0,
      strategy: "none",
    });
    return null;
  }

  /**
   * 若存在可解析的 SDD 目录（`specs/.active` + `specs/<name>/`），写入 `specs/<name>/observatory/`；
   * 否则写入根 `.observatory/`。
   * 主文件为 `report.json`；过渡期同时写入 `test-results.json` 以兼容旧工具。
   */
  async writeTestResults(data: TestResults): Promise<void> {
    const normalized = normalizeTestResultsForSchema(data);
    const sddObs = resolveSddFeatureObservatoryDir(this.workspaceRoot);
    const targetDir = sddObs ?? this.basePath;
    const norm = "report.json";
    const shouldValidate = this.validator.isRegistered(norm);
    if (shouldValidate) {
      this.validator.validate(norm, normalized);
    }
    const text = `${JSON.stringify(normalized, null, 2)}\n`;
    const primaryFull = path.join(targetDir, SDD_TEST_REPORT_JSON);
    const legacyFull = path.join(targetDir, "test-results.json");
    const relPrimary = path.relative(this.workspaceRoot, primaryFull);
    const queueKey =
      relPrimary.length > 0
        ? relPrimary.split(path.sep).join("/")
        : SDD_TEST_REPORT_JSON;
    await this.serializedWrite(queueKey, async () => {
      await fs.mkdir(path.dirname(primaryFull), { recursive: true });
      await fs.writeFile(primaryFull, text, "utf8");
      await fs.writeFile(legacyFull, text, "utf8");
    });
  }

  readTestMapping(): Promise<TestMapping> {
    return this.readJson<TestMapping>("test-mapping.json");
  }
  writeTestMapping(data: TestMapping): Promise<void> {
    return this.writeJson("test-mapping.json", data);
  }

  readTestExpectations(): Promise<TestExpectations> {
    return this.readJson<TestExpectations>("test-expectations.json");
  }
  writeTestExpectations(data: TestExpectations): Promise<void> {
    return this.writeJson("test-expectations.json", data);
  }

  readDocsHealth(): Promise<DocsHealth> {
    return this.readJson<DocsHealth>("docs-health.json");
  }
  writeDocsHealth(data: DocsHealth): Promise<void> {
    return this.writeJson("docs-health.json", data);
  }

  readSessionIndex(): Promise<SessionIndex> {
    return this.readJson<SessionIndex>(path.join("sessions", "index.json"));
  }
  writeSessionIndex(data: SessionIndex): Promise<void> {
    return this.writeJson(path.join("sessions", "index.json"), data);
  }

  /**
   * 写入 `sessions/<sessionFolderId>/meta.json`（目录不存在则创建）。
   * `sessionFolderId` 形如 `ses_xxx`，与 index / ai-sessions 的 id 一致。
   */
  async writeSessionMeta(
    sessionFolderId: string,
    meta: Record<string, unknown>
  ): Promise<void> {
    const dir = path.join("sessions", sessionFolderId);
    await fs.mkdir(this.fullPath(dir), { recursive: true });
    const rel = path.join(dir, "meta.json");
    await this.writeJson(rel, meta);
  }

  /**
   * 按 `id` upsert `sessions/index.json` 中的一条摘要（与 SCHEMA_SPEC §十二 一致）。
   */
  async upsertSessionIndexEntry(entry: Record<string, unknown>): Promise<void> {
    const rel = path.join("sessions", "index.json");
    const existing = await this.readJsonIfExists<SessionIndex>(rel);
    const doc: SessionIndex = existing ?? {
      schema_version: "1.0.0",
      sessions: [],
    };
    const list = Array.isArray(doc.sessions) ? [...doc.sessions] : [];
    const eid = typeof entry.id === "string" ? entry.id : "";
    const ix = list.findIndex((s) => (s as { id?: string }).id === eid);
    if (ix >= 0) list[ix] = entry;
    else list.unshift(entry);
    doc.sessions = list;
    doc.generated_at = new Date().toISOString();
    await this.writeJson(rel, doc);
  }
}
