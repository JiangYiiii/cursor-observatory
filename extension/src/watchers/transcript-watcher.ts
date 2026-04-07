/**
 * Cursor agent-transcripts → ai-sessions.json、sessions/index.json、各 ses_ 目录下 meta.json。
 * primary_doc: docs/EXTENSION_DESIGN.md §3.3, docs/SCHEMA_SPEC.md §十二, §十二-B
 *
 * Cursor 可能将 .jsonl 放在 agent-transcripts 子目录（如 <uuid>/<uuid>.jsonl），需递归监听与启动时全量导入。
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { applyPhaseInferenceFromAiTranscript } from "../capability/capability-lifecycle";
import type { ObservatoryStore } from "../observatory/store";
import { resolveAgentTranscriptsDir } from "../workspace/agent-transcripts-path";
import {
  countLikelyToolCalls,
  extractCapabilityIds,
  extractWorkspaceRelativePaths,
  isoRangeFromEntries,
  loadCapabilityIdsFromStore,
} from "./transcript-session-extract";

interface NormEntry {
  role: string;
  content: string;
  timestamp: string | null;
}

async function listJsonlRecursive(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    let dirents;
    try {
      dirents = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of dirents) {
      const p = path.join(dir, d.name);
      if (d.isDirectory()) await walk(p);
      else if (d.isFile() && d.name.endsWith(".jsonl")) out.push(p);
    }
  }
  await walk(rootDir);
  return out;
}

/** 若根路径被误设为单个 `.jsonl` 文件，仍只导入该文件；否则递归收集（含 `uuid/uuid.jsonl`、subagents 等）。 */
async function collectJsonlPaths(rootOrFile: string): Promise<string[]> {
  try {
    const st = await fs.stat(rootOrFile);
    if (st.isFile() && rootOrFile.endsWith(".jsonl")) {
      return [path.resolve(rootOrFile)];
    }
    if (st.isDirectory()) {
      return listJsonlRecursive(rootOrFile);
    }
  } catch {
    return [];
  }
  return [];
}

/**
 * 相对 `agent-transcripts` 根目录生成稳定会话 id，避免仅按 basename 在嵌套路径下冲突。
 */
function deriveSessionFolderId(
  filePath: string,
  transcriptRootDir: string
): string {
  const absRoot = path.resolve(transcriptRootDir);
  const absFile = path.resolve(filePath);
  const rel = path.relative(absRoot, absFile);
  if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) {
    const key = rel
      .replace(/\.jsonl$/i, "")
      .split(path.sep)
      .join("_")
      .replace(/[^\w.-]+/g, "-");
    if (key.length > 0) {
      return `ses_${key}`;
    }
  }
  const base = path.basename(filePath, ".jsonl").replace(/[^\w.-]+/g, "-");
  return base.length > 0 ? `ses_${base}` : `ses_${Date.now()}`;
}

function parseLinesWithRaw(text: string): {
  entries: NormEntry[];
  raws: Record<string, unknown>[];
} {
  const entries: NormEntry[] = [];
  const raws: Record<string, unknown>[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      raws.push(raw);
      const normalized = normalizeEntry(raw);
      if (normalized) entries.push(normalized);
    } catch {
      /* skip bad line */
    }
  }
  return { entries, raws };
}

function normalizeEntry(raw: Record<string, unknown>): NormEntry | null {
  const role =
    (typeof raw.role === "string" && raw.role) ||
    (typeof raw.payload === "object" &&
      raw.payload !== null &&
      typeof (raw.payload as { role?: string }).role === "string" &&
      (raw.payload as { role?: string }).role) ||
    "unknown";
  const content =
    (typeof raw.content === "string" && raw.content) ||
    (typeof raw.payload === "object" &&
      raw.payload !== null &&
      typeof (raw.payload as { content?: string }).content === "string" &&
      (raw.payload as { content?: string }).content) ||
    "";
  const timestamp =
    (typeof raw.timestamp === "string" && raw.timestamp) ||
    (typeof raw.ts === "string" && raw.ts) ||
    null;
  return { role, content, timestamp };
}

function pickNamedTitleFromRaw(
  raws: Record<string, unknown>[]
): string | undefined {
  for (const raw of raws.slice(0, 40)) {
    const top =
      (typeof raw.title === "string" && raw.title.trim()) ||
      (typeof raw.sessionTitle === "string" && raw.sessionTitle.trim()) ||
      (typeof raw.conversationTitle === "string" &&
        raw.conversationTitle.trim()) ||
      "";
    if (top) return top;
    const meta = raw.metadata;
    if (meta && typeof meta === "object" && meta !== null) {
      const m = meta as { title?: string; name?: string };
      if (typeof m.title === "string" && m.title.trim()) return m.title.trim();
      if (typeof m.name === "string" && m.name.trim()) return m.name.trim();
    }
  }
  return undefined;
}

/** 会话列表名：优先 Cursor 命名；否则取首条用户消息前 60 字 */
function deriveTitle(
  entries: NormEntry[],
  raws: Record<string, unknown>[]
): string {
  const named = pickNamedTitleFromRaw(raws);
  if (named && named.length > 0) return named;
  const user = entries.find((e) => e.role === "user");
  const t = user?.content?.trim().slice(0, 60);
  return t && t.length > 0 ? t : "AI session";
}

function deriveSummary(entries: NormEntry[]): string {
  const userMsgs = entries.filter((e) => e.role === "user");
  const first = userMsgs[0]?.content?.trim() ?? "";
  if (first.length <= 280) return first || "—";
  return `${first.slice(0, 277)}…`;
}

/**
 * 解析并写入单个转录文件（供监听与 Run Full Scan 共用）。
 */
export async function ingestTranscriptJsonlFile(
  filePath: string,
  workspaceRoot: string,
  store: ObservatoryStore,
  projectIdHint: string,
  onUpdate?: () => void,
  options?: { transcriptRootDir?: string }
): Promise<void> {
  try {
    const text = await fs.readFile(filePath, "utf8");
    const { entries, raws } = parseLinesWithRaw(text);
    if (entries.length === 0) return;

    const sessionId =
      options?.transcriptRootDir !== undefined
        ? deriveSessionFolderId(filePath, options.transcriptRootDir)
        : (() => {
            const base = path
              .basename(filePath, ".jsonl")
              .replace(/[^\w.-]+/g, "-");
            return base.length > 0 ? `ses_${base}` : `ses_${Date.now()}`;
          })();

    const knownIds = await loadCapabilityIdsFromStore(store);
    const combined = `${entries.map((e) => e.content).join("\n")}\n${text.slice(0, 80_000)}`;
    const capabilityIds = extractCapabilityIds(combined, knownIds);
    const filesRel = extractWorkspaceRelativePaths(combined, workspaceRoot);
    const toolCalls = countLikelyToolCalls(raws);
    const title = deriveTitle(entries, raws);
    const nowIso = () => new Date().toISOString();
    const { first: created_at, last: updated_at } = isoRangeFromEntries(
      entries,
      nowIso
    );
    const summary = deriveSummary(entries);

    const transcriptRel = path.relative(workspaceRoot, filePath);
    const transcriptForAi =
      transcriptRel.startsWith("..") || path.isAbsolute(filePath)
        ? filePath
        : transcriptRel.split(path.sep).join("/");

    const meta: Record<string, unknown> = {
      schema_version: "1.0.0",
      id: sessionId,
      title,
      type: "development",
      status: "completed",
      project: projectIdHint,
      capability_ids: capabilityIds,
      created_at,
      updated_at,
      tags: [],
      transcript_source: filePath,
      message_count: entries.length,
      tool_calls_count: toolCalls,
      files_touched: filesRel,
      artifacts: filesRel.map((p) => ({
        type: "file_modified",
        path: p,
        timestamp: updated_at,
      })),
      summary,
    };

    const indexEntry: Record<string, unknown> = {
      id: sessionId,
      title,
      type: "development",
      status: "completed",
      project: projectIdHint,
      capability_ids: capabilityIds,
      created_at,
      updated_at,
      tags: [],
      artifact_count: filesRel.length,
      message_count: entries.length,
    };

    const started = Date.parse(created_at);
    const ended = Date.parse(updated_at);
    const duration_minutes =
      !Number.isNaN(started) && !Number.isNaN(ended)
        ? Math.max(0, Math.round((ended - started) / 60_000))
        : undefined;

    const aiSession: Record<string, unknown> = {
      id: sessionId,
      title,
      type: "development",
      status: "completed",
      started_at: created_at,
      ended_at: updated_at,
      duration_minutes,
      capability_ids: capabilityIds,
      tags: [],
      files_modified: filesRel.map((p) => ({
        path: p,
        action: "modified",
      })),
      summary,
      transcript_file: transcriptForAi,
    };

    await store.writeSessionMeta(sessionId, meta);
    await store.upsertSessionIndexEntry(indexEntry);
    await store.upsertAiSession(aiSession);

    const inferOn = vscode.workspace
      .getConfiguration("observatory")
      .get<boolean>("capability.aiPhaseInferenceEnabled", true);
    await applyPhaseInferenceFromAiTranscript(
      store,
      capabilityIds,
      combined,
      inferOn
    );

    onUpdate?.();
  } catch {
    /* ignore single file errors */
  }
}

/**
 * 在已解析的 agent-transcripts 目录下递归导入全部 .jsonl（初始化 / Full Scan）。
 */
export async function ingestAllAgentTranscriptsFromDisk(
  workspaceRoot: string,
  store: ObservatoryStore,
  projectIdHint: string,
  onUpdate?: () => void
): Promise<void> {
  const dir = resolveAgentTranscriptsDir(workspaceRoot);
  if (!dir) return;
  const files = await collectJsonlPaths(dir);
  const rootForIds = path.resolve(dir);
  for (const filePath of files) {
    await ingestTranscriptJsonlFile(
      filePath,
      workspaceRoot,
      store,
      projectIdHint,
      onUpdate,
      { transcriptRootDir: rootForIds }
    );
  }
}

export class TranscriptWatcher {
  private transcriptDir: string | null = null;

  constructor(
    private readonly workspaceRoot: string,
    private readonly store: ObservatoryStore,
    private readonly projectIdHint: string,
    private readonly onUpdate?: () => void
  ) {
    this.transcriptDir = this.discoverTranscriptDir();
  }

  private discoverTranscriptDir(): string | null {
    return resolveAgentTranscriptsDir(this.workspaceRoot);
  }

  register(context: vscode.ExtensionContext): void {
    if (!this.transcriptDir) {
      return;
    }
    const w = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(vscode.Uri.file(this.transcriptDir), "**/*.jsonl")
    );
    const rootForIds = path.resolve(this.transcriptDir);
    const onFile = (uri: vscode.Uri) =>
      void ingestTranscriptJsonlFile(
        uri.fsPath,
        this.workspaceRoot,
        this.store,
        this.projectIdHint,
        this.onUpdate,
        { transcriptRootDir: rootForIds }
      );
    w.onDidChange(onFile);
    w.onDidCreate(onFile);
    context.subscriptions.push(w);
    void ingestAllAgentTranscriptsFromDisk(
      this.workspaceRoot,
      this.store,
      this.projectIdHint,
      this.onUpdate
    );
  }
}

/** Derive Cursor project id (folder name hash surrogate). */
export function defaultProjectIdFromPath(workspaceRoot: string): string {
  return path.basename(workspaceRoot).replace(/[^\w.-]+/g, "-");
}
